import { Server } from 'socket.io'
import { z } from 'zod'
import { getConfig } from './config.js'
import { verifySessionToken } from './lib/session.js'
import { findUserById } from './services/users.js'
import { sendChatTurn } from './services/chatTurn.js'
import { ownerPattern, repoPattern } from './lib/validation.js'

let io = null

const joinSchema = z.object({
  owner: z.string().trim().regex(ownerPattern),
  repo: z.string().trim().regex(repoPattern),
})

const sendSchema = joinSchema.extend({
  message: z.string().trim().min(1).max(4000),
})

function parseCookies(header = '') {
  const cookies = {}
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const key = part.slice(0, index).trim()
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      cookies[key] = part.slice(index + 1).trim()
    }
  }
  return cookies
}

function roomFor(userId, repoFullName) {
  return `chat:${userId}:${String(repoFullName).toLowerCase()}`
}

function socketError(error) {
  return {
    code: error?.code || 'REQUEST_FAILED',
    message: error?.message || 'The message could not be processed.',
    ...(error?.details ? { details: error.details } : {}),
  }
}

function validate(schema, payload) {
  const result = schema.safeParse(payload ?? {})
  if (result.success) return { data: result.data }
  const fields = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_'
    if (!fields[key]) fields[key] = issue.message
  }
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Please check the highlighted fields.',
      details: { fields },
    },
  }
}

export function createRealtime(httpServer) {
  const config = getConfig()
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: config.frontendOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  })

  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie)
    const token = cookies[config.cookieName]
    const payload = token ? verifySessionToken(token) : null
    if (!payload) return next(new Error('UNAUTHORIZED'))
    const user = findUserById(payload.sub)
    if (!user || user.token_version !== payload.v) return next(new Error('UNAUTHORIZED'))
    socket.data.user = user
    next()
  })

  io.on('connection', (socket) => {
    socket.on('chat:join', (payload, ack) => {
      const { data, error } = validate(joinSchema, payload)
      if (error) return ack?.({ ok: false, error })
      const repoFullName = `${data.owner}/${data.repo}`
      socket.join(roomFor(socket.data.user.id, repoFullName))
      return ack?.({ ok: true, repoFullName })
    })

    socket.on('chat:leave', (payload, ack) => {
      const { data, error } = validate(joinSchema, payload)
      if (error) return ack?.({ ok: false, error })
      socket.leave(roomFor(socket.data.user.id, `${data.owner}/${data.repo}`))
      return ack?.({ ok: true })
    })

    socket.on('chat:send', async (payload, ack) => {
      const { data, error } = validate(sendSchema, payload)
      if (error) return ack?.({ ok: false, error })

      try {
        const result = await sendChatTurn({
          userId: socket.data.user.id,
          user: socket.data.user,
          owner: data.owner,
          repo: data.repo,
          message: data.message,
        })
        const room = roomFor(socket.data.user.id, result.repoFullName)
        io.to(room).emit('chat:message', {
          repoFullName: result.repoFullName,
          messages: result.messages,
          quota: result.quota,
        })
        return ack?.({
          ok: true,
          data: {
            messages: result.messages,
            repo: result.repo,
            model: result.model,
            usage: result.usage,
            quota: result.quota,
          },
        })
      } catch (sendError) {
        return ack?.({ ok: false, error: socketError(sendError) })
      }
    })
  })

  return io
}

export function emitChatMessages(userId, repoFullName, messages, quota = null) {
  if (!io) return
  io.to(roomFor(userId, repoFullName)).emit('chat:message', {
    repoFullName,
    messages,
    quota,
  })
}

export function closeRealtime() {
  return new Promise((resolve) => {
    if (!io) {
      resolve()
      return
    }
    io.close(() => {
      io = null
      resolve()
    })
  })
}
