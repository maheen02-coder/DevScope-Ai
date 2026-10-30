import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/asyncHandler.js'
import { parse, ownerPattern, repoPattern } from '../lib/validation.js'
import { getQuotaSummary } from '../services/usage.js'
import { findLatestReportForRepo } from '../services/reports.js'
import { clearChatHistory, getChatHistory, listConversations } from '../services/chat.js'
import { sendChatTurn } from '../services/chatTurn.js'
import { emitChatMessages } from '../realtime.js'

const router = Router()

const repoSchema = z.object({
  owner: z.string().trim().regex(ownerPattern, 'Invalid repository owner.'),
  repo: z.string().trim().regex(repoPattern, 'Invalid repository name.'),
})

const messageSchema = repoSchema.extend({
  message: z
    .string()
    .trim()
    .min(1, 'Write a message first.')
    .max(4000, 'Messages are limited to 4000 characters.'),
})

router.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    res.json({ conversations: listConversations(req.user.id), quota: getQuotaSummary(req.user.id) })
  }),
)

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const { owner, repo } = parse(repoSchema, req.query)
    const repoFullName = `${owner}/${repo}`
    const messages = getChatHistory(req.user.id, repoFullName)
    const report = findLatestReportForRepo(req.user.id, repoFullName)
    res.json({
      messages,
      report,
      quota: getQuotaSummary(req.user.id),
    })
  }),
)

router.post(
  '/message',
  asyncHandler(async (req, res) => {
    const input = parse(messageSchema, req.body ?? {})
    const result = await sendChatTurn({
      userId: req.user.id,
      user: req.user,
      owner: input.owner,
      repo: input.repo,
      message: input.message,
    })

    emitChatMessages(req.user.id, result.repoFullName, result.messages, result.quota)

    res.json({
      messages: result.messages,
      repo: result.repo,
      model: result.model,
      usage: result.usage,
      quota: result.quota,
    })
  }),
)

router.delete(
  '/history',
  asyncHandler(async (req, res) => {
    const { owner, repo } = parse(repoSchema, req.query)
    const deleted = clearChatHistory(req.user.id, `${owner}/${repo}`)
    res.json({ deleted })
  }),
)

export default router
