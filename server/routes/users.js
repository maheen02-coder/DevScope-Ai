import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../db.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { parse } from '../lib/validation.js'
import { unauthorized } from '../lib/errors.js'
import { clearSessionCookie, setSessionCookie } from '../lib/session.js'
import {
  deleteUser,
  toPublicUser,
  updatePassword,
  updateProfile,
  verifyPassword,
} from '../services/users.js'

const router = Router()

const profileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60).optional(),
    preferences: z
      .object({
        defaultDepth: z.enum(['standard', 'deep']).optional(),
        chatStyle: z.enum(['concise', 'detailed']).optional(),
      })
      .strict()
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.preferences !== undefined, {
    message: 'Provide a name or preferences to update.',
  })

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const input = parse(profileSchema, req.body ?? {})
    const updated = updateProfile(req.user.id, input)
    res.json({ user: toPublicUser(updated) })
  }),
)

router.post(
  '/me/password',
  asyncHandler(async (req, res) => {
    const input = parse(
      z.object({
        currentPassword: z.string().min(1, 'Enter your current password.').max(72),
        newPassword: z
          .string()
          .min(8, 'New password must be at least 8 characters.')
          .max(72, 'New password must be at most 72 characters.'),
      }),
      req.body ?? {},
    )
    const matches = await verifyPassword(req.user, input.currentPassword)
    if (!matches) throw unauthorized('Current password is incorrect.', 'INVALID_PASSWORD')

    const updated = await updatePassword(req.user.id, input.newPassword)
    setSessionCookie(res, updated)
    res.json({ user: toPublicUser(updated) })
  }),
)

router.delete(
  '/me',
  asyncHandler(async (req, res) => {
    const input = parse(
      z.object({ password: z.string().min(1, 'Confirm with your password.').max(72) }),
      req.body ?? {},
    )
    const matches = await verifyPassword(req.user, input.password)
    if (!matches) throw unauthorized('Password is incorrect.', 'INVALID_PASSWORD')

    deleteUser(req.user.id)
    clearSessionCookie(res)
    res.status(204).end()
  }),
)

router.delete(
  '/me/data',
  asyncHandler(async (req, res) => {
    const { scope } = parse(
      z.object({ scope: z.enum(['reports', 'chats', 'all']) }),
      req.body ?? {},
    )
    const db = getDb()
    let reports = 0
    let chats = 0
    if (scope === 'reports' || scope === 'all') {
      reports = db.prepare('DELETE FROM reports WHERE user_id = ?').run(req.user.id).changes
    }
    if (scope === 'chats' || scope === 'all') {
      chats = db.prepare('DELETE FROM chat_messages WHERE user_id = ?').run(req.user.id).changes
    }
    res.json({ deleted: { reports, chats } })
  }),
)

export default router
