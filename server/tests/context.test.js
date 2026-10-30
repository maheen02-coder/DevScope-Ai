import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getConfig, setConfig } from '../config.js'
import { mockState } from './mock-upstream.js'
import { registerUser, resetTestState, runAnalysis, startTestEnvironment } from './helpers.js'

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

const SECRET_TOKEN = 'gsk_abcdefghijklmnopqrstuvwxyz012345'
const SECRET_PASSWORD = 'databasePassword123'

function buildLargeFixture() {
  const files = {
    'README.md':
      '# Large Fixture\n\nA synthetic repository used to exercise batched analysis, token budgets, and exclusions. It exposes a small Express service with modules.\n',
    'package.json': JSON.stringify(
      { name: 'large-fixture', version: '1.0.0', dependencies: { express: '^5.0.0' } },
      null,
      2,
    ),
    'src/index.js':
      "import express from 'express'\nimport { add } from './util.js'\n\nconst app = express()\napp.get('/', (req, res) => res.json({ sum: add(2, 3) }))\n\nexport default app\n",
    'src/util.js': 'export const add = (a, b) => a + b\n',
    'config/app.config.js': `export const database = { user: 'app', password: '${SECRET_PASSWORD}' }\nexport const GROQ_API_KEY = '${SECRET_TOKEN}'\n`,
    'docs/guide.md':
      '# Guide\n\nUsage notes that should not be sent when the file cap is reached.\n',
  }

  for (let index = 2; index <= 14; index += 1) {
    const name = `src/modules/module${String(index).padStart(2, '0')}.js`
    files[name] =
      `export function handler${index}(value) {\n${'  return value + 1\n'.repeat(60)}}\n`
  }

  files['src/modules/module01.js'] =
    `const table = [\n${'  0,\n'.repeat(4000)}]\nexport const first = (value) => value + 1\n`

  const tree = Object.entries(files).map(([path, content]) => ({
    path,
    type: 'blob',
    size: Buffer.byteLength(content),
  }))

  const excluded = [
    ['node_modules/express/index.js', 12_000],
    ['dist/assets/app.min.js', 8_000],
    ['coverage/lcov.info', 4_000],
    ['assets/logo.png', 1_500],
    ['package-lock.json', 90_000],
    ['config/credentials.json', 200],
    ['.env', 120],
  ]
  for (const [path, size] of excluded) {
    tree.push({ path, type: 'blob', size })
  }

  mockState.github.files = files
  mockState.github.tree = tree
}

function allRequestContent() {
  return mockState.ai.requests
    .map((request) => (request.messages || []).map((message) => message.content).join('\n'))
    .join('\n')
}

describe('token-budgeted repository analysis', () => {
  it('batches a large repository, truncates oversized files, and reports coverage', async () => {
    buildLargeFixture()
    const original = getConfig()
    setConfig({ ...original, aiMaxInputTokens: 6000 })
    try {
      const response = await runAnalysis(agent, { depth: 'deep' })
      expect(response.status).toBe(201)

      const { report, quota } = response.body
      const meta = report.analysis.meta
      const coverage = meta.coverage

      expect(meta.mode).toBe('batched')
      expect(meta.batches).toBeGreaterThanOrEqual(2)
      expect(meta.modelCalls).toBe(meta.batches + 1)
      expect(meta.usage.promptTokens).toBe(meta.modelCalls * 120)
      expect(meta.usage.completionTokens).toBe(meta.modelCalls * 80)
      expect(quota.analysis.used).toBe(1)

      expect(meta.filesAnalyzed).toBe(meta.files.length)
      expect(meta.files.map((file) => file.path)).toContain('src/modules/module01.js')
      expect(coverage.truncatedTotal).toBeGreaterThanOrEqual(1)
      expect(coverage.omittedCounts.max_files).toBeGreaterThanOrEqual(1)
      expect(coverage.omittedTotal).toBeGreaterThanOrEqual(1)

      const excludedReasons = new Set(coverage.excluded.map((entry) => entry.reason))
      for (const reason of [
        'dependency',
        'build_output',
        'binary',
        'lockfile',
        'sensitive',
        'hidden',
      ]) {
        expect(excludedReasons.has(reason)).toBe(true)
      }

      expect(coverage.secretRedactions).toBeGreaterThanOrEqual(2)
      const promptContent = allRequestContent()
      expect(promptContent).not.toContain(SECRET_TOKEN)
      expect(promptContent).not.toContain(SECRET_PASSWORD)
      expect(promptContent).toContain('[REDACTED TOKEN]')
      expect(promptContent).toContain('[REDACTED]')
      expect(promptContent).not.toContain('node_modules/express')
      expect(promptContent).not.toContain('config/credentials.json')
      expect(promptContent).not.toContain('package-lock.json')
      expect(promptContent).not.toContain('dist/assets/app.min.js')
      expect(promptContent).toContain('# Large Fixture')

      const batchRequests = mockState.ai.requests.filter((request) =>
        String(request.messages?.[0]?.content || '').includes('reviewing ONE batch'),
      )
      expect(batchRequests.length).toBe(meta.batches)
      for (const request of batchRequests) {
        const user = request.messages.find((message) => message.role === 'user')?.content || ''
        expect(user).toContain('<selected_files count=')
        expect(user).toContain('<coverage>')
      }

      const synthesis = mockState.ai.requests.filter((request) =>
        String(request.messages?.[0]?.content || '').includes('principal software engineer'),
      )
      expect(synthesis).toHaveLength(1)
      const synthesisUser =
        synthesis[0].messages.find((message) => message.role === 'user')?.content || ''
      expect(synthesisUser).toContain('<batch_findings>')
      expect(synthesisUser).toContain('Files analyzed:')
      expect(report.analysis.scores.overall).toBe(82)
    } finally {
      setConfig(original)
    }
  })

  it('omits files when the batch and total budgets cannot cover the selection', async () => {
    buildLargeFixture()
    const original = getConfig()
    setConfig({ ...original, aiMaxInputTokens: 3000, aiMaxBatches: 2 })
    try {
      const response = await runAnalysis(agent, { depth: 'deep' })
      expect(response.status).toBe(201)

      const meta = response.body.report.analysis.meta
      expect(meta.mode).toBe('batched')
      expect(meta.batches).toBeLessThanOrEqual(2)
      expect(meta.filesAnalyzed).toBeLessThan(meta.coverage.candidateFiles)
      expect(meta.coverage.omittedTotal).toBeGreaterThan(0)
      const reasons = Object.keys(meta.coverage.omittedCounts)
      expect(
        reasons.some((reason) =>
          ['max_files', 'token_budget', 'max_batches', 'total_token_budget'].includes(reason),
        ),
      ).toBe(true)
    } finally {
      setConfig(original)
    }
  })

  it('retries once with a smaller context when the provider reports one', async () => {
    mockState.ai.mode = 'context_once'

    const response = await runAnalysis(agent)
    expect(response.status).toBe(201)

    const meta = response.body.report.analysis.meta
    expect(meta.contextRetries).toBe(1)
    expect(meta.modelCalls).toBe(2)
    expect(meta.files.length).toBeLessThan(3)
    expect(mockState.ai.calls).toBe(2)

    const [first, second] = mockState.ai.requests
    const firstUser = first.messages.find((message) => message.role === 'user')?.content || ''
    const secondUser = second.messages.find((message) => message.role === 'user')?.content || ''
    expect((firstUser.match(/<file path=/g) || []).length).toBeGreaterThan(
      (secondUser.match(/<file path=/g) || []).length,
    )
  })

  it('returns an actionable error when context-length failures persist', async () => {
    mockState.ai.mode = 'context_always'

    const response = await runAnalysis(agent)
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('AI_CONTEXT_TOO_LARGE')
    expect(response.body.error.message).toContain('AI_MAX_FILE_TOKENS')
    expect(response.body.error.details).toMatchObject({
      model: expect.any(String),
      inputTokenLimit: expect.any(Number),
      estimatedRequestTokens: expect.any(Number),
      suggestion: expect.any(String),
    })
    expect(mockState.ai.calls).toBe(2)

    const usage = await agent.get('/api/dashboard/usage')
    expect(usage.body.analysis.used).toBe(0)
  })

  it('treats a tokens-per-minute 413 as throttling and retries once within the reported limit', async () => {
    buildLargeFixture()
    const original = getConfig()
    setConfig({ ...original, aiMaxFileTokens: 5000 })
    mockState.ai.mode = 'tpm_once'
    try {
      const response = await runAnalysis(agent, { depth: 'deep' })
      expect(response.status).toBe(201)

      const meta = response.body.report.analysis.meta
      expect(meta.mode).toBe('single')
      expect(meta.contextRetries).toBe(1)
      expect(meta.modelCalls).toBe(2)
      expect(meta.providerRequestLimit).toBe(8000)
      expect(meta.coverage.providerRequestLimit).toBe(8000)
      expect(meta.filesAnalyzed).toBeLessThan(meta.coverage.candidateFiles)
      expect(meta.coverage.omittedCounts.request_token_limit).toBeGreaterThanOrEqual(1)
      expect(mockState.ai.calls).toBe(2)

      const [first, second] = mockState.ai.requests
      const count = (request) =>
        (String(request.messages?.[1]?.content || '').match(/<file path=/g) || []).length
      expect(count(second)).toBeLessThan(count(first))

      const usage = await agent.get('/api/dashboard/usage')
      expect(usage.body.analysis.used).toBe(1)
    } finally {
      setConfig(original)
    }
  })

  it('reports a persistent tokens-per-minute limit as a rate-limit error', async () => {
    buildLargeFixture()
    const original = getConfig()
    setConfig({ ...original, aiMaxFileTokens: 5000 })
    mockState.ai.mode = 'tpm_always'
    try {
      const response = await runAnalysis(agent, { depth: 'deep' })
      expect(response.status).toBe(429)
      expect(response.body.error.code).toBe('AI_RATE_LIMITED')
      expect(response.body.error.message).toContain('tokens-per-minute')
      expect(response.body.error.details).toMatchObject({
        provider: 'groq',
        model: expect.any(String),
        tokensPerMinute: 8000,
        estimatedRequestTokens: expect.any(Number),
        suggestion: expect.stringContaining('AI_MAX_INPUT_TOKENS'),
      })
      expect(mockState.ai.calls).toBe(2)

      const usage = await agent.get('/api/dashboard/usage')
      expect(usage.body.analysis.used).toBe(0)
    } finally {
      setConfig(original)
    }
  })

  it('rejects a configuration whose input limit cannot hold the instructions', async () => {
    const original = getConfig()
    setConfig({ ...original, aiMaxInputTokens: 100 })
    try {
      const response = await runAnalysis(agent)
      expect(response.status).toBe(422)
      expect(response.body.error.code).toBe('AI_LIMITS_TOO_SMALL')
      expect(mockState.ai.calls).toBe(0)

      const usage = await agent.get('/api/dashboard/usage')
      expect(usage.body.analysis.used).toBe(0)
    } finally {
      setConfig(original)
    }
  })

  it('stops after one repair attempt per batch when batch findings stay invalid', async () => {
    buildLargeFixture()
    const original = getConfig()
    setConfig({ ...original, aiMaxInputTokens: 6000 })
    mockState.ai.mode = 'invalid'
    try {
      const response = await runAnalysis(agent, { depth: 'deep' })
      expect(response.status).toBe(502)
      expect(response.body.error.code).toBe('AI_INVALID_RESPONSE')
      expect(mockState.ai.calls).toBeGreaterThanOrEqual(2)
      expect(mockState.ai.calls).toBeLessThanOrEqual(6)

      const usage = await agent.get('/api/dashboard/usage')
      expect(usage.body.analysis.used).toBe(0)
    } finally {
      setConfig(original)
    }
  })
})
