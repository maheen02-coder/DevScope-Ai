import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { findOauthAccount, resolveOauthUser } from '../services/oauth.js'
import { findUserByEmail } from '../services/users.js'
import { registerUser, resetTestState, startTestEnvironment } from './helpers.js'

let env

beforeAll(async () => {
  env = await startTestEnvironment()
})

beforeEach(() => {
  resetTestState()
})

afterAll(async () => {
  await env.upstream.close()
})

function profile(overrides = {}) {
  return {
    id: 'gh-123',
    displayName: 'Octo Cat',
    emails: [{ value: 'octo@example.com', verified: true }],
    ...overrides,
  }
}

describe('OAuth configuration and accounts', () => {
  it('lists providers with their configured state', async () => {
    const response = await request(env.app).get('/api/auth/providers')
    expect(response.status).toBe(200)
    expect(response.body.providers).toEqual([
      { id: 'github', label: 'GitHub', configured: false },
      { id: 'google', label: 'Google', configured: false },
    ])
  })

  it('returns 503 when a provider is not configured', async () => {
    const response = await request(env.app).get('/api/auth/oauth/github')
    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('OAUTH_NOT_CONFIGURED')
  })

  it('returns 404 for an unknown provider', async () => {
    const response = await request(env.app).get('/api/auth/oauth/gitlab')
    expect(response.status).toBe(404)
  })

  it('creates an account on first OAuth sign-in and reuses it afterwards', async () => {
    const first = await resolveOauthUser({ provider: 'github', profile: profile() })
    expect(first.created).toBe(true)
    expect(first.linked).toBe(false)

    const user = findUserByEmail('octo@example.com')
    expect(user).toMatchObject({ id: first.userId, name: 'Octo Cat' })
    expect(findOauthAccount('github', 'gh-123')).toMatchObject({ user_id: first.userId })

    const second = await resolveOauthUser({ provider: 'github', profile: profile() })
    expect(second).toMatchObject({ userId: first.userId, created: false })
  })

  it('links a verified provider email to an existing password account', async () => {
    const { user } = await registerUser(env.app, {
      email: 'linked@example.com',
      name: 'Existing User',
    })

    const result = await resolveOauthUser({
      provider: 'google',
      profile: profile({
        id: 'google-9',
        emails: [{ value: 'linked@example.com', verified: true }],
      }),
    })

    expect(result).toMatchObject({ userId: user.id, created: false, linked: true })
    expect(findOauthAccount('google', 'google-9')).toMatchObject({ user_id: user.id })
  })

  it('rejects profiles without a verified email', async () => {
    await expect(
      resolveOauthUser({
        provider: 'github',
        profile: profile({
          id: 'gh-unverified',
          emails: [{ value: 'x@example.com', verified: false }],
        }),
      }),
    ).rejects.toThrow(/verified email/i)
  })
})
