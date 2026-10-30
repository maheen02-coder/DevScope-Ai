import crypto from 'node:crypto'
import { getDb } from '../db.js'
import { createUser, findUserByEmail } from './users.js'

export function findOauthAccount(provider, providerUserId) {
  return getDb()
    .prepare('SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?')
    .get(provider, String(providerUserId))
}

export function linkOauthAccount(provider, providerUserId, userId) {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO oauth_accounts (provider, provider_user_id, user_id, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(provider, String(providerUserId), userId, new Date().toISOString())
}

export function listOauthAccounts(userId) {
  return getDb()
    .prepare(
      'SELECT provider, created_at FROM oauth_accounts WHERE user_id = ? ORDER BY created_at',
    )
    .all(userId)
}

function emailFromProfile(profile) {
  const emails = Array.isArray(profile?.emails) ? profile.emails : []
  // Only verified addresses are trusted, because an unverified address could be used to take
  // over an existing account through automatic linking.
  const chosen = emails.find((entry) => entry?.verified !== false && entry?.value)
  return chosen?.value ? String(chosen.value).trim().toLowerCase() : ''
}

export async function resolveOauthUser({ provider, profile }) {
  const providerUserId = profile?.id ? String(profile.id) : ''
  if (!providerUserId) throw new Error('OAuth provider did not return an account id.')

  const existingLink = findOauthAccount(provider, providerUserId)
  if (existingLink) {
    return { userId: existingLink.user_id, created: false, linked: false }
  }

  const email = emailFromProfile(profile)
  if (!email) {
    throw new Error('The OAuth provider did not share a verified email address.')
  }

  const existingUser = findUserByEmail(email)
  if (existingUser) {
    linkOauthAccount(provider, providerUserId, existingUser.id)
    return { userId: existingUser.id, created: false, linked: true }
  }

  const name = String(profile.displayName || profile.username || email.split('@')[0])
    .trim()
    .slice(0, 60)
  // OAuth accounts do not use a password. Store an unguessable hash so password login cannot
  // succeed for an account created this way.
  const randomPassword = crypto.randomBytes(32).toString('hex')
  const user = await createUser({
    name: name.length >= 2 ? name : 'OAuth user',
    email,
    password: randomPassword,
  })
  linkOauthAccount(provider, providerUserId, user.id)
  return { userId: user.id, created: true, linked: false }
}
