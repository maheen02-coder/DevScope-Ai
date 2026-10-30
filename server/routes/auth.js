import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/asyncHandler.js'
import { parse } from '../lib/validation.js'
import { conflict, unauthorized } from '../lib/errors.js'
import { setSessionCookie, clearSessionCookie } from '../lib/session.js'
import { createUser, findUserByEmail, toPublicUser, verifyCredentials } from '../services/users.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address.')

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60),
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be at most 72 characters.'),
})

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(72),
})

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = parse(registerSchema, req.body ?? {})
    if (findUserByEmail(input.email)) {
      throw conflict('An account with this email already exists.')
    }
    let user
    try {
      user = await createUser(input)
    } catch (error) {
      if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
        throw conflict('An account with this email already exists.')
      }
      throw error
    }
    setSessionCookie(res, user)
    res.status(201).json({ user: toPublicUser(user) })
  }),
)

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = parse(loginSchema, req.body ?? {})
    const user = await verifyCredentials(input.email, input.password)
    if (!user) {
      throw unauthorized('Email or password is incorrect.', 'INVALID_CREDENTIALS')
    }
    setSessionCookie(res, user)
    res.json({ user: toPublicUser(user) })
  }),
)

router.post('/logout', (req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) })
})

export default router
