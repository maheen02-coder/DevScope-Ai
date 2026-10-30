import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { getConfig, setConfig } from '../config.js'
import { resetThrottleStats } from '../lib/rateLimitStats.js'
import { registerUser, resetTestState, runAnalysis, startTestEnvironment } from './helpers.js'

let env
let agent

beforeAll(async () => {
  env = await startTestEnvironment()
})

beforeEach(async () => {
  resetTestState()
  resetThrottleStats()
  ;({ agent } = await registerUser(env.app))
})

afterAll(async () => {
  await env.upstream.close()
})

describe('rate-limit report', () => {
  it('requires a session', async () => {
    const unauthenticated = await request(env.app).get('/api/dashboard/rate-limits')
    expect(unauthenticated.status).toBe(401)
  })

  it('returns live quota, policy, and budget metadata', async () => {
    const response = await agent.get('/api/dashboard/rate-limits')
    expect(response.status).toBe(200)

    const report = response.body
    expect(report).toMatchObject({
      enforced: false,
      windowHours: 24,
      quota: {
        analysis: { kind: 'analysis', used: 0, limit: 10, remaining: 10, resetsAt: null },
        chat: { kind: 'chat', used: 0, limit: 10, remaining: 10, resetsAt: null },
      },
    })
    expect(report.generatedAt).toEqual(expect.any(String))
    expect(report.timeline).toHaveLength(24)
    expect(report.timeline.every((bucket) => bucket.analysis === 0 && bucket.chat === 0)).toBe(true)
    expect(report.policies.map((policy) => policy.key)).toEqual([
      'global',
      'auth',
      'github',
      'analyze',
      'chat',
      'public',
    ])
    expect(report.policies[0]).toMatchObject({
      label: 'Workspace API',
      scope: '/api/*',
      windowMs: 900_000,
      limit: 600,
    })
    expect(report.throttle).toMatchObject({ total: 0, scopes: [] })
    expect(report.github).toMatchObject({ configured: false })
  })

  it('reflects consumed quota in the hourly timeline', async () => {
    const analysis = await runAnalysis(agent)
    expect(analysis.status).toBe(201)

    const response = await agent.get('/api/dashboard/rate-limits')
    const report = response.body
    const analysisTotal = report.timeline.reduce((sum, bucket) => sum + bucket.analysis, 0)
    expect(analysisTotal).toBe(1)
    expect(report.quota.analysis).toMatchObject({ used: 1, remaining: 9 })
    expect(report.quota.analysis.resetsAt).toEqual(expect.any(String))
  })

  it('counts quota denials and endpoint throttles separately', async () => {
    const original = getConfig()
    setConfig({ ...original, analysisDailyLimit: 1, rateLimitEnabled: true })
    try {
      expect((await runAnalysis(agent)).status).toBe(201)
      const denied = await runAnalysis(agent)
      expect(denied.status).toBe(429)
      expect(denied.body.error.code).toBe('QUOTA_EXCEEDED')

      for (let attempt = 0; attempt < 121; attempt += 1) {
        await agent.get('/api/public/reports/not-a-real-token')
      }

      const response = await agent.get('/api/dashboard/rate-limits')
      expect(response.status).toBe(200)
      const scopes = response.body.throttle.scopes
      expect(scopes.find((entry) => entry.key === 'quota-analysis')).toMatchObject({
        label: 'Analysis daily quota',
        count: 1,
      })
      expect(scopes.find((entry) => entry.key === 'public')).toMatchObject({
        label: 'Shared reports',
        count: 1,
      })
      expect(response.body.throttle.total).toBe(2)
      expect(response.body.enforced).toBe(true)
    } finally {
      setConfig(original)
    }
  })
})
