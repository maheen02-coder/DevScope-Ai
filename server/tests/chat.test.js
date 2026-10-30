import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { getConfig, setConfig } from '../config.js'
import { mockState } from './mock-upstream.js'
import {
  latestPrompt,
  registerUser,
  resetTestState,
  runAnalysis,
  startTestEnvironment,
} from './helpers.js'

let env
let agent

beforeAll(async () => {
  env = await startTestEnvironment()
})

beforeEach(async () => {
  resetTestState()
  ;({ agent } = await registerUser(env.app))
})

afterAll(async () => {
  await env.upstream.close()
})

describe('repository chat', () => {
  it('requires authentication', async () => {
    const response = await request(env.app).get('/api/chat/conversations')
    expect(response.status).toBe(401)
  })

  it('validates the message and repository fields', async () => {
    const empty = await agent
      .post('/api/chat/message')
      .send({ owner: 'octo', repo: 'hello', message: '   ' })
    expect(empty.status).toBe(422)

    const badRepo = await agent
      .post('/api/chat/message')
      .send({ owner: 'bad owner!', repo: 'hello', message: 'Explain the architecture.' })
    expect(badRepo.status).toBe(422)
  })

  it('stores both turns, returns canonical repo names, and consumes chat quota', async () => {
    const response = await agent.post('/api/chat/message').send({
      owner: 'octo',
      repo: 'hello',
      message: 'How is the HTTP layer structured?',
    })

    expect(response.status).toBe(200)
    expect(response.body.repo.fullName).toBe('Octo/Hello')
    expect(response.body.messages).toHaveLength(2)
    expect(response.body.messages[0]).toMatchObject({
      role: 'user',
      content: 'How is the HTTP layer structured?',
    })
    expect(response.body.messages[1].role).toBe('assistant')
    expect(response.body.messages[1].content).toContain('Express')
    expect(response.body.quota.chat.used).toBe(1)

    const prompt = latestPrompt()
    const system = prompt.messages[0]?.content || ''
    expect(system).toContain('<repository_data>')
    expect(system).toContain('Be concise')

    const history = await agent.get('/api/chat/history').query({ owner: 'Octo', repo: 'Hello' })
    expect(history.status).toBe(200)
    expect(history.body.messages).toHaveLength(2)
    expect(history.body.quota.chat.used).toBe(1)

    const conversations = await agent.get('/api/chat/conversations')
    expect(conversations.body.conversations).toHaveLength(1)
    expect(conversations.body.conversations[0]).toMatchObject({
      repoFullName: 'Octo/Hello',
      messageCount: 2,
    })
  })

  it('includes the latest saved analysis in the grounding context', async () => {
    await runAnalysis(agent).expect(201)
    const response = await agent
      .post('/api/chat/message')
      .send({ owner: 'octo', repo: 'hello', message: 'What are the main weaknesses?' })

    expect(response.status).toBe(200)
    const system = latestPrompt().messages[0]?.content || ''
    expect(system).toContain('<previous_analysis>')
    expect(system).toContain('Overall score: 82/100')
  })

  it('keeps conversations isolated between users', async () => {
    await agent
      .post('/api/chat/message')
      .send({ owner: 'octo', repo: 'hello', message: 'What does this project do?' })
      .expect(200)

    const other = await registerUser(env.app, { email: 'chat-other@example.com' })
    const history = await other.agent
      .get('/api/chat/history')
      .query({ owner: 'Octo', repo: 'Hello' })
    expect(history.status).toBe(200)
    expect(history.body.messages).toHaveLength(0)

    const conversations = await other.agent.get('/api/chat/conversations')
    expect(conversations.body.conversations).toHaveLength(0)
  })

  it('clears repository history without touching other repositories', async () => {
    await agent
      .post('/api/chat/message')
      .send({ owner: 'octo', repo: 'hello', message: 'First question' })
      .expect(200)

    const cleared = await agent.delete('/api/chat/history').query({ owner: 'octo', repo: 'hello' })
    expect(cleared.status).toBe(200)
    expect(cleared.body.deleted).toBe(2)

    const history = await agent.get('/api/chat/history').query({ owner: 'Octo', repo: 'Hello' })
    expect(history.body.messages).toHaveLength(0)
  })

  it('releases chat quota when the AI call fails', async () => {
    mockState.ai.mode = 'error'
    const response = await agent
      .post('/api/chat/message')
      .send({ owner: 'octo', repo: 'hello', message: 'Will this fail?' })

    expect(response.status).toBe(502)
    expect(response.body.error.code).toBe('AI_UNAVAILABLE')

    const usage = await agent.get('/api/dashboard/usage')
    expect(usage.body.chat.used).toBe(0)
  })

  it('enforces the server-side chat quota', async () => {
    const original = getConfig()
    setConfig({ ...original, chatDailyLimit: 1 })
    try {
      await agent
        .post('/api/chat/message')
        .send({ owner: 'octo', repo: 'hello', message: 'First message' })
        .expect(200)

      const blocked = await agent
        .post('/api/chat/message')
        .send({ owner: 'octo', repo: 'hello', message: 'Second message' })
      expect(blocked.status).toBe(429)
      expect(blocked.body.error.code).toBe('QUOTA_EXCEEDED')

      const usage = await agent.get('/api/dashboard/usage')
      expect(usage.body.chat.remaining).toBe(0)
    } finally {
      setConfig(original)
    }
  })
})
