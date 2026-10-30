import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { io as ioClient } from 'socket.io-client'
import { createRealtime, closeRealtime } from '../realtime.js'
import { registerUser, startTestEnvironment } from './helpers.js'

let env
let server
let url
let cookie
let socket

function once(socketInstance, event) {
  return new Promise((resolve) => socketInstance.once(event, resolve))
}

function emitAck(socketInstance, event, payload) {
  return new Promise((resolve, reject) => {
    socketInstance.timeout(20_000).emit(event, payload, (error, response) => {
      if (error) reject(error)
      else resolve(response)
    })
  })
}

beforeAll(async () => {
  env = await startTestEnvironment()
  const registration = await registerUser(env.app)
  cookie = registration.response.headers['set-cookie'][0].split(';')[0]

  server = createServer(env.app)
  createRealtime(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  socket?.disconnect()
  await closeRealtime()
  await env.upstream.close()
})

describe('Socket.IO chat', () => {
  it('rejects unauthenticated socket connections', async () => {
    const anonymous = ioClient(url, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
    })
    const error = await once(anonymous, 'connect_error')
    expect(error.message).toBe('UNAUTHORIZED')
    anonymous.disconnect()
  })

  it('joins a repository room, sends a chat turn, and broadcasts it', async () => {
    socket = ioClient(url, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Cookie: cookie },
    })
    await once(socket, 'connect')

    const joined = await emitAck(socket, 'chat:join', { owner: 'octo', repo: 'hello' })
    expect(joined).toMatchObject({ ok: true, repoFullName: 'octo/hello' })

    const broadcast = once(socket, 'chat:message')
    const ack = await emitAck(socket, 'chat:send', {
      owner: 'octo',
      repo: 'hello',
      message: 'How is the HTTP layer structured?',
    })

    expect(ack.ok).toBe(true)
    expect(ack.data.repo.fullName).toBe('Octo/Hello')
    expect(ack.data.messages).toHaveLength(2)
    expect(ack.data.messages[0]).toMatchObject({
      role: 'user',
      content: 'How is the HTTP layer structured?',
    })
    expect(ack.data.quota.chat.used).toBe(1)

    const event = await broadcast
    expect(event.repoFullName).toBe('Octo/Hello')
    expect(event.messages).toHaveLength(2)
  })

  it('returns validation errors over the socket ack', async () => {
    const ack = await emitAck(socket, 'chat:send', { owner: 'octo', repo: 'hello', message: '  ' })
    expect(ack.ok).toBe(false)
    expect(ack.error.code).toBe('VALIDATION_ERROR')
    expect(ack.error.details.fields.message).toBeTruthy()
  })
})
