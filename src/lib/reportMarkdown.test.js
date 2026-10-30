import { describe, expect, it } from 'vitest'
import { buildReportMarkdown } from './reportMarkdown.js'

const report = {
  id: '11111111-1111-4111-8111-111111111111',
  repoFullName: 'Octo/Hello',
  depth: 'deep',
  filesAnalyzed: 42,
  model: 'llama-3.3-70b-versatile',
  createdAt: '2026-01-02T03:04:05.000Z',
  analysis: {
    summary: 'A tiny greeting service.',
    architecture: 'Single Express route with a static client.',
    layers: [{ name: 'HTTP', responsibility: 'Serves requests.', components: ['src/app.js'] }],
    complexity: 'low',
    scores: {
      overall: 82,
      codeQuality: 80,
      architecture: 78,
      maintainability: 75,
      documentation: 88,
      security: 70,
      testing: 60,
    },
    strengths: [{ title: 'Clear layout', detail: 'Small surface area.', files: ['src/app.js'] }],
    weaknesses: [
      { title: 'No tests', detail: 'Nothing asserts the greeting.', files: ['src/app.js'] },
    ],
    securityConcerns: [
      { title: 'Open CORS', detail: 'Wildcard origin.', severity: 'medium', files: ['src/app.js'] },
    ],
    recommendations: [
      {
        title: 'Add tests',
        detail: 'Cover the happy path.',
        priority: 'high',
        files: ['tests/greeting.test.js'],
      },
    ],
    techStack: [{ name: 'Express', purpose: 'HTTP routing' }],
    onboarding: {
      prerequisites: ['Node.js 20', 'npm'],
      steps: [{ title: 'Install', detail: 'Run npm install.', files: ['package.json'] }],
      keyFiles: ['src/app.js'],
    },
    valuation: {
      currency: 'USD',
      sellingPrice: 9000,
      buildPrice: 24000,
      range: { low: 6000, typical: 9000, high: 14000 },
      suggestedAsk: 11000,
      confidence: 'low',
      suggestedAskReasoning: 'Small codebase with limited demand.',
      factors: [{ factor: 'Scope', impact: 'positive', detail: 'Used by a real product.' }],
      missingFeatures: [{ title: 'Billing', estimatedValue: 3000, detail: 'No payments today.' }],
      improvements: [{ title: 'Tests', priceImpact: 'medium', detail: 'Raises buyer confidence.' }],
      assumptions: ['Repository sold as-is with IP transfer.'],
    },
    meta: {
      valuation: { disclaimer: 'Custom disclaimer from the model run.' },
    },
  },
}

describe('buildReportMarkdown', () => {
  it('includes metadata, scores and narrative sections', () => {
    const markdown = buildReportMarkdown(report)

    expect(markdown).toContain('# Octo/Hello — DevScope AI report')
    expect(markdown).toContain('- **Depth:** deep')
    expect(markdown).toContain('- **Files analyzed:** 42')
    expect(markdown).toContain('- **Overall score:** 82/100')
    expect(markdown).toContain('| Code quality | 80 |')
    expect(markdown).toContain('## Summary')
    expect(markdown).toContain('A tiny greeting service.')
    expect(markdown).toContain('## Architecture')
    expect(markdown).toContain('## Strengths')
    expect(markdown).toContain('## Recommendations')
    expect(markdown).toContain('## Tech stack')
    expect(markdown).toContain('Exported from DevScope AI on')
  })

  it('renders the valuation with its disclaimer and range', () => {
    const markdown = buildReportMarkdown(report)

    expect(markdown).toContain('## Valuation (AI estimate)')
    expect(markdown).toContain('**Potential one-time sale price:** $9,000')
    expect(markdown).toContain('**Freelance build price:** $24,000')
    expect(markdown).toContain('**Estimated range:** $6,000 – $14,000 (typical $9,000)')
    expect(markdown).toContain('**Suggested asking price:** $11,000')
    expect(markdown).toContain('## Price factors')
    expect(markdown).toContain('## Missing features')
    expect(markdown).toContain('## Improvements')
    expect(markdown).toContain('## Assumptions')
    expect(markdown).toContain('> Custom disclaimer from the model run.')
  })

  it('renders the architecture map, onboarding guide and file citations', () => {
    const markdown = buildReportMarkdown(report)

    expect(markdown).toContain('## Architecture map')
    expect(markdown).toContain('1. **HTTP** — Serves requests. (`src/app.js`)')
    expect(markdown).toContain('## Onboarding guide')
    expect(markdown).toContain('**Prerequisites:** Node.js 20; npm')
    expect(markdown).toContain('1. **Install** — Run npm install. (files: `package.json`)')
    expect(markdown).toContain('**Key files to read first:** `src/app.js`')
    expect(markdown).toContain('**Clear layout** — Small surface area. (files: `src/app.js`)')
    expect(markdown).toContain('**Open CORS** (medium) — Wildcard origin. (files: `src/app.js`)')
  })

  it('never includes private annotations or account identifiers', () => {
    const markdown = buildReportMarkdown({
      ...report,
      notes: [{ body: 'private note' }],
      userId: 'abc',
      email: 'user@example.com',
    })

    expect(markdown).not.toContain('private note')
    expect(markdown).not.toContain('user@example.com')
    expect(markdown).not.toContain('abc')
  })

  it('degrades gracefully without a valuation or analysis', () => {
    const markdown = buildReportMarkdown({ repoFullName: 'Octo/Empty', analysis: {} })

    expect(markdown).toContain('# Octo/Empty — DevScope AI report')
    expect(markdown).not.toContain('## Valuation')
    expect(markdown).toContain('- **Overall score:** —/100')
  })
})
