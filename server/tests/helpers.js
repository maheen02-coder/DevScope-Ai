import crypto from 'node:crypto'
import request from 'supertest'
import { createApp } from '../app.js'
import { loadConfig, setConfig } from '../config.js'
import { initDb } from '../db.js'
import { resetGithubCache } from '../services/github.js'
import { mockState, startMockUpstream } from './mock-upstream.js'

export const TEST_PASSWORD = 'DevscopeTest123!'

export async function startTestEnvironment(overrides = {}) {
  const upstream = await startMockUpstream()
  setConfig(
    loadConfig({
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters',
      DATABASE_PATH: ':memory:',
      DIST_PATH: './server/tests/.missing-dist',
      GITHUB_API_BASE: `${upstream.baseUrl}/github`,
      GROQ_API_BASE: `${upstream.baseUrl}/groq`,
      GROQ_API_KEY: 'test-groq-key',
      FRONTEND_ORIGIN: 'http://localhost:5173',
      RATE_LIMIT_ENABLED: 'false',
      BCRYPT_ROUNDS: '4',
      ANALYSIS_DAILY_LIMIT: '10',
      CHAT_DAILY_LIMIT: '10',
      ...overrides,
    }),
  )
  initDb(':memory:')
  const app = createApp()
  return { app, upstream }
}

export function resetTestState() {
  initDb(':memory:')
  resetGithubCache()
  mockState.ai.mode = 'ok'
  mockState.ai.calls = 0
  mockState.ai.requests = []
  mockState.ai.paths = []
  mockState.github.files = null
  mockState.github.tree = null
}

export async function registerUser(app, overrides = {}) {
  const email = overrides.email || `user-${crypto.randomUUID()}@example.com`
  const password = overrides.password || TEST_PASSWORD
  const name = overrides.name || 'Test User'
  const agent = request.agent(app)
  const response = await agent.post('/api/auth/register').send({ name, email, password })
  if (response.status !== 201) {
    throw new Error(`Registration failed (${response.status}): ${JSON.stringify(response.body)}`)
  }
  return { agent, email, password, name, user: response.body.user, response }
}

export function runAnalysis(agent, overrides = {}) {
  return agent
    .post('/api/analyze')
    .send({ owner: 'octo', repo: 'hello', depth: 'standard', ...overrides })
}

export function latestPrompt() {
  return mockState.ai.requests[mockState.ai.requests.length - 1] || null
}
