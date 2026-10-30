import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { getConfig } from '../config.js'
import { getDb } from '../db.js'

const dummyHash = bcrypt.hashSync('devscope-timing-equalizer-not-a-password', 10)

const preferencesSchema = z
  .object({
    defaultDepth: z.enum(['standard', 'deep']).default('standard'),
    chatStyle: z.enum(['concise', 'detailed']).default('concise'),
  })
  .catch({ defaultDepth: 'standard', chatStyle: 'concise' })

export function normalizePreferences(value) {
  const parsed = preferencesSchema.safeParse(value)
  return parsed.success ? parsed.data : { defaultDepth: 'standard', chatStyle: 'concise' }
}

export function toPublicUser(row) {
  if (!row) return null
  let preferences
  try {
    preferences = JSON.parse(row.preferences)
  } catch {
    preferences = {}
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    preferences: normalizePreferences(preferences),
    createdAt: row.created_at,
  }
}

export function findUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id)
}

export function findUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase())
}

export async function createUser({ name, email, password }) {
  const db = getDb()
  const passwordHash = await bcrypt.hash(password, getConfig().bcryptRounds)
  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password_hash: passwordHash,
    preferences: JSON.stringify({ defaultDepth: 'standard', chatStyle: 'concise' }),
    token_version: 0,
    created_at: new Date().toISOString(),
  }
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, preferences, token_version, created_at)
     VALUES (@id, @name, @email, @password_hash, @preferences, @token_version, @created_at)`,
  ).run(user)
  return user
}

export async function verifyCredentials(email, password) {
  const user = findUserByEmail(email)
  if (!user) {
    await bcrypt.compare(password, dummyHash)
    return null
  }
  const matches = await bcrypt.compare(password, user.password_hash)
  return matches ? user : null
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash)
}

export async function updatePassword(userId, newPassword) {
  const hash = await bcrypt.hash(newPassword, getConfig().bcryptRounds)
  getDb()
    .prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .run(hash, userId)
  return findUserById(userId)
}

export function updateProfile(userId, { name, preferences }) {
  const db = getDb()
  const current = findUserById(userId)
  if (!current) return null
  const nextName = typeof name === 'string' ? name.trim() : current.name
  let nextPreferences = current.preferences
  if (preferences && typeof preferences === 'object') {
    const currentPrefs = normalizePreferences(JSON.parse(current.preferences || '{}'))
    nextPreferences = JSON.stringify(normalizePreferences({ ...currentPrefs, ...preferences }))
  }
  db.prepare('UPDATE users SET name = ?, preferences = ? WHERE id = ?').run(
    nextName,
    nextPreferences,
    userId,
  )
  return findUserById(userId)
}

export function deleteUser(userId) {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(userId)
}
