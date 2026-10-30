import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import {
  TEST_PASSWORD,
  registerUser,
  resetTestState,
  runAnalysis,
  startTestEnvironment,
} from './helpers.js'

let env
let agent
let email

beforeAll(async () => {
  env = await startTestEnvironment()
})

beforeEach(async () => {
  resetTestState()
  ;({ agent, email } = await registerUser(env.app))
})

afterAll(async () => {
  await env.upstream.close()
})

async function seedWorkspace() {
  await runAnalysis(agent).expect(201)
  await agent
    .post('/api/chat/message')
    .send({ owner: 'octo', repo: 'hello', message: 'Summarize the entry point.' })
    .expect(200)
}

describe('account settings and data controls', () => {
  it('requires authentication for settings endpoints', async () => {
    await request(env.app).patch('/api/users/me').send({ name: 'No Session' }).expect(401)
    await request(env.app).delete('/api/users/me').send({ password: TEST_PASSWORD }).expect(401)
    await request(env.app).delete('/api/users/me/data').send({ scope: 'all' }).expect(401)
  })

  it('updates the display name and preferences', async () => {
    const renamed = await agent.patch('/api/users/me').send({ name: 'Grace Hopper' })
    expect(renamed.status).toBe(200)
    expect(renamed.body.user.name).toBe('Grace Hopper')

    const preferences = await agent
      .patch('/api/users/me')
      .send({ preferences: { defaultDepth: 'deep', chatStyle: 'detailed' } })
    expect(preferences.status).toBe(200)
    expect(preferences.body.user.preferences).toEqual({
      defaultDepth: 'deep',
      chatStyle: 'detailed',
    })

    const partial = await agent
      .patch('/api/users/me')
      .send({ preferences: { chatStyle: 'concise' } })
    expect(partial.body.user.preferences).toEqual({ defaultDepth: 'deep', chatStyle: 'concise' })

    const me = await agent.get('/api/auth/me')
    expect(me.body.user.name).toBe('Grace Hopper')
    expect(me.body.user.preferences.defaultDepth).toBe('deep')
  })

  it('rejects invalid profile updates', async () => {
    const shortName = await agent.patch('/api/users/me').send({ name: 'A' })
    expect(shortName.status).toBe(422)

    const badPreference = await agent
      .patch('/api/users/me')
      .send({ preferences: { defaultDepth: 'extreme' } })
    expect(badPreference.status).toBe(422)

    const empty = await agent.patch('/api/users/me').send({})
    expect(empty.status).toBe(422)
  })

  it('deletes reports only when scope is reports', async () => {
    await seedWorkspace()

    const response = await agent.delete('/api/users/me/data').send({ scope: 'reports' })
    expect(response.status).toBe(200)
    expect(response.body.deleted).toEqual({ reports: 1, chats: 0 })

    const reports = await agent.get('/api/reports')
    expect(reports.body.total).toBe(0)

    const history = await agent.get('/api/chat/history').query({ owner: 'Octo', repo: 'Hello' })
    expect(history.body.messages).toHaveLength(2)
  })

  it('deletes chats only when scope is chats', async () => {
    await seedWorkspace()

    const response = await agent.delete('/api/users/me/data').send({ scope: 'chats' })
    expect(response.status).toBe(200)
    expect(response.body.deleted).toEqual({ reports: 0, chats: 2 })

    const reports = await agent.get('/api/reports')
    expect(reports.body.total).toBe(1)

    const conversations = await agent.get('/api/chat/conversations')
    expect(conversations.body.conversations).toHaveLength(0)
  })

  it('deletes all workspace data and validates the scope', async () => {
    await seedWorkspace()

    const invalid = await agent.delete('/api/users/me/data').send({ scope: 'everything' })
    expect(invalid.status).toBe(422)

    const response = await agent.delete('/api/users/me/data').send({ scope: 'all' })
    expect(response.body.deleted).toEqual({ reports: 1, chats: 2 })

    const dashboard = await agent.get('/api/dashboard')
    expect(dashboard.body.stats.total).toBe(0)
    expect(dashboard.body.conversations).toHaveLength(0)
  })

  it('deletes the account only with the correct password', async () => {
    await seedWorkspace()

    const wrong = await agent.delete('/api/users/me').send({ password: 'NotThePassword123!' })
    expect(wrong.status).toBe(401)
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD')

    const deleted = await agent.delete('/api/users/me').send({ password: TEST_PASSWORD })
    expect(deleted.status).toBe(204)

    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(401)

    const login = await request(env.app)
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
    expect(login.status).toBe(401)
    expect(login.body.error.code).toBe('INVALID_CREDENTIALS')
  })
})
