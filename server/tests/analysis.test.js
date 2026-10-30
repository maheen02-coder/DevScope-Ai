import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

describe('repository analysis and report ownership', () => {
  it('returns 503 and releases the quota when AI is not configured', async () => {
    const original = getConfig()
    setConfig({ ...original, groqApiKey: '' })
    try {
      const response = await runAnalysis(agent)
      expect(response.status).toBe(503)
      expect(response.body.error.code).toBe('AI_NOT_CONFIGURED')

      const usage = await agent.get('/api/dashboard/usage')
      expect(usage.body.analysis.used).toBe(0)
      expect(usage.body.analysis.remaining).toBe(10)
    } finally {
      setConfig(original)
    }
  })

  it('creates a report from a real GitHub context and Groq response', async () => {
    const response = await runAnalysis(agent)
    expect(response.status).toBe(201)

    const { report, quota } = response.body
    expect(report).toMatchObject({
      repoFullName: 'Octo/Hello',
      depth: 'standard',
      filesAnalyzed: expect.any(Number),
    })
    expect(report.analysis.scores.overall).toBe(82)
    expect(report.analysis.meta.files.length).toBeGreaterThan(0)
    expect(report.analysis.meta.files.map((file) => file.path)).toContain('src/index.js')
    expect(report.analysis.meta.languages[0].name).toBe('JavaScript')
    expect(report.analysis.meta.health).toMatchObject({
      license: 'MIT',
      archived: false,
      stars: 42,
      forks: 7,
      openIssues: 2,
      activity: expect.any(String),
    })
    expect(report.analysis.meta.health.signals).toHaveLength(6)
    expect(report.analysis.meta.dependencies).toMatchObject({
      total: 1,
      runtime: 1,
      development: 0,
      declaredLicense: null,
    })
    expect(report.analysis.meta.dependencies.manifests[0]).toMatchObject({
      path: 'package.json',
      ecosystem: 'npm',
    })
    expect(report.analysis.meta.dependencies.lockfiles).toEqual([
      { ecosystem: 'npm', present: true },
    ])
    expect(report.analysis.strengths[0].files).toEqual(['src/index.js'])
    expect(report.analysis.layers).toHaveLength(3)
    expect(report.analysis.layers[0]).toMatchObject({
      name: 'HTTP entry point',
      components: ['src/index.js'],
    })
    expect(report.analysis.onboarding).toMatchObject({
      prerequisites: ['Node.js 20 or newer', 'npm'],
      keyFiles: ['src/index.js', 'src/util.js', 'package.json'],
    })
    expect(report.analysis.onboarding.steps).toHaveLength(3)
    expect(quota.analysis.used).toBe(1)
    expect(quota.analysis.remaining).toBe(9)

    const prompt = latestPrompt()
    expect(mockState.ai.paths.at(-1)).toBe('/groq/openai/v1/chat/completions')
    const userMessage = prompt.messages.find((message) => message.role === 'user')?.content || ''
    expect(userMessage).toContain('<repository_data>')
    expect(userMessage).toContain('# Hello')
    expect(userMessage).toContain('src/index.js')

    const detail = await agent.get(`/api/reports/${report.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.report.id).toBe(report.id)
    expect(detail.body.report.saved).toBe(false)

    const list = await agent.get('/api/reports')
    expect(list.body.total).toBe(1)
    expect(list.body.items[0]).toMatchObject({ id: report.id, overallScore: 82 })

    const dashboard = await agent.get('/api/dashboard')
    expect(dashboard.body.stats.total).toBe(1)
    expect(dashboard.body.recentReports).toHaveLength(1)
    expect(dashboard.body.scoreTrend).toHaveLength(1)
    expect(dashboard.body.languages[0].language).toBe('JavaScript')
  })

  it('drops file citations that were not part of the analyzed files', async () => {
    mockState.ai.mode = 'citation_invalid'
    const response = await runAnalysis(agent)
    expect(response.status).toBe(201)

    const analysis = response.body.report.analysis
    expect(analysis.strengths[0].files).toEqual(['src/index.js'])
    expect(analysis.strengths[1].files).toBeUndefined()

    expect(analysis.onboarding.keyFiles).toEqual(['src/index.js'])
    expect(analysis.onboarding.steps).toHaveLength(4)
    expect(analysis.onboarding.steps.at(-1).files).toBeUndefined()
  })

  it('saves, renames, filters, and deletes reports', async () => {
    const created = await runAnalysis(agent)
    const id = created.body.report.id

    const saved = await agent
      .patch(`/api/reports/${id}`)
      .send({ saved: true, title: 'Hello review' })
    expect(saved.status).toBe(200)
    expect(saved.body.report).toMatchObject({ saved: true, title: 'Hello review' })

    const savedOnly = await agent.get('/api/reports?saved=true')
    expect(savedOnly.body.total).toBe(1)

    const search = await agent.get('/api/reports?q=hello')
    expect(search.body.total).toBe(1)

    const noMatch = await agent.get('/api/reports?q=unrelated')
    expect(noMatch.body.total).toBe(0)

    const deleted = await agent.delete(`/api/reports/${id}`)
    expect(deleted.status).toBe(204)

    const after = await agent.get(`/api/reports/${id}`)
    expect(after.status).toBe(404)
  })

  it('keeps reports isolated between users', async () => {
    const created = await runAnalysis(agent)
    const id = created.body.report.id
    const other = await registerUser(env.app, { email: 'other@example.com' })

    const read = await other.agent.get(`/api/reports/${id}`)
    expect(read.status).toBe(404)

    const patch = await other.agent.patch(`/api/reports/${id}`).send({ saved: true })
    expect(patch.status).toBe(404)

    const remove = await other.agent.delete(`/api/reports/${id}`)
    expect(remove.status).toBe(404)

    const list = await other.agent.get('/api/reports')
    expect(list.body.total).toBe(0)

    const stillThere = await agent.get(`/api/reports/${id}`)
    expect(stillThere.status).toBe(200)
  })

  it('retries once with more output tokens when the model returns malformed JSON', async () => {
    mockState.ai.mode = 'json_invalid_once'
    const response = await runAnalysis(agent)
    expect(response.status).toBe(201)

    expect(mockState.ai.requests).toHaveLength(2)
    const [firstRequest, retryRequest] = mockState.ai.requests
    expect(firstRequest.reasoning_effort).toBe('low')
    expect(retryRequest.reasoning_effort).toBe('low')
    expect(retryRequest.temperature).toBe(0)
    expect(retryRequest.max_completion_tokens).toBeGreaterThan(firstRequest.max_completion_tokens)
    expect(response.body.report.analysis.meta.jsonRetries).toBe(1)
    expect(response.body.report.analysis.meta.modelCalls).toBe(2)

    const usage = await agent.get('/api/dashboard/usage')
    expect(usage.body.analysis.used).toBe(1)
  })

  it('explains malformed JSON output and releases the quota when retrying fails', async () => {
    mockState.ai.mode = 'json_invalid_always'
    const response = await runAnalysis(agent)
    expect(response.status).toBe(502)
    expect(response.body.error.code).toBe('AI_INVALID_JSON')
    expect(response.body.error.message).toContain('malformed JSON')
    expect(mockState.ai.calls).toBe(2)

    const usage = await agent.get('/api/dashboard/usage')
    expect(usage.body.analysis.used).toBe(0)
  })

  it('releases the analysis quota when the AI response cannot be validated', async () => {
    mockState.ai.mode = 'invalid'
    const response = await runAnalysis(agent)
    expect(response.status).toBe(502)
    expect(response.body.error.code).toBe('AI_INVALID_RESPONSE')
    expect(mockState.ai.calls).toBe(2)

    const usage = await agent.get('/api/dashboard/usage')
    expect(usage.body.analysis.used).toBe(0)
  })

  it('releases the analysis quota when the repository cannot be collected', async () => {
    const response = await runAnalysis(agent, { repo: 'missing' })
    expect(response.status).toBe(404)

    const usage = await agent.get('/api/dashboard/usage')
    expect(usage.body.analysis.used).toBe(0)
  })

  it('enforces the server-side analysis quota', async () => {
    const original = getConfig()
    setConfig({ ...original, analysisDailyLimit: 2 })
    try {
      await runAnalysis(agent).expect(201)
      await runAnalysis(agent).expect(201)

      const blocked = await runAnalysis(agent)
      expect(blocked.status).toBe(429)
      expect(blocked.body.error.code).toBe('QUOTA_EXCEEDED')
      expect(blocked.body.error.details).toMatchObject({ kind: 'analysis', limit: 2, used: 2 })
      expect(blocked.body.error.details.resetsAt).toEqual(expect.any(String))

      const usage = await agent.get('/api/dashboard/usage')
      expect(usage.body.analysis.used).toBe(2)
      expect(usage.body.analysis.remaining).toBe(0)
    } finally {
      setConfig(original)
    }
  })

  it('validates the repository fields', async () => {
    const response = await agent.post('/api/analyze').send({ owner: 'bad owner!', repo: '' })
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('AI project valuation', () => {
  it('persists the valuation and exposes it in lists and the dashboard', async () => {
    const response = await runAnalysis(agent)
    expect(response.status).toBe(201)

    const { report } = response.body
    expect(report.analysis.valuation).toMatchObject({
      currency: 'USD',
      sellingPrice: 18000,
      buildPrice: 42000,
      range: { low: 12000, typical: 18000, high: 26000 },
      suggestedAsk: 21000,
      confidence: 'medium',
    })
    expect(report.analysis.valuation.factors).toHaveLength(2)
    expect(report.analysis.valuation.missingFeatures[0].estimatedValue).toBe(2500)
    expect(report.analysis.meta.valuation).toMatchObject({ currency: 'USD', method: 'ai-estimate' })
    expect(report.analysis.meta.valuation.disclaimer).toContain('not an appraisal')

    const detail = await agent.get(`/api/reports/${report.id}`)
    expect(detail.body.report.analysis.valuation.suggestedAsk).toBe(21000)

    const list = await agent.get('/api/reports')
    expect(list.body.items[0].valuation).toEqual({
      currency: 'USD',
      suggestedAsk: 21000,
      buildPrice: 42000,
      low: 12000,
      typical: 18000,
      high: 26000,
      confidence: 'medium',
    })

    const dashboard = await agent.get('/api/dashboard')
    expect(dashboard.body.valuation).toEqual({
      reports: 1,
      currency: 'USD',
      currencies: ['USD'],
      mixedCurrencies: false,
      averageSuggestedAsk: 21000,
      averageBuildPrice: 42000,
      totalLow: 12000,
      totalHigh: 26000,
      topOpportunity: { id: report.id, repoFullName: 'Octo/Hello', suggestedAsk: 21000 },
    })
  })

  it('normalizes messy currency strings and range ordering', async () => {
    mockState.ai.mode = 'valuation_messy'
    const response = await runAnalysis(agent)
    expect(response.status).toBe(201)

    const valuation = response.body.report.analysis.valuation
    expect(valuation.currency).toBe('USD')
    expect(valuation.suggestedAsk).toBe(24000)
    expect(valuation.range).toEqual({ low: 10000, typical: 21000, high: 30000 })
    expect(valuation.factors).toHaveLength(1)
  })

  it('rejects an analysis without a valuation and releases the quota', async () => {
    mockState.ai.mode = 'valuation_missing'
    const response = await runAnalysis(agent)
    expect(response.status).toBe(502)
    expect(response.body.error.code).toBe('AI_INVALID_RESPONSE')
    expect(mockState.ai.calls).toBe(2)

    const usage = await agent.get('/api/dashboard/usage')
    expect(usage.body.analysis.used).toBe(0)
  })
})
