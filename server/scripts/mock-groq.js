// Local, OpenAI-compatible stand-in for Groq. It lets the full analysis and chat
// flows run without spending provider credits or committing an API key.
//
// Usage: npm run mock:groq
// Then start the app with:
//   GROQ_API_KEY=mock-key GROQ_API_BASE=http://127.0.0.1:4020 npm run dev
//
// It is a development aid only: responses are deterministic and do not inspect
// the repository content.

import http from 'node:http'

const port = Number.parseInt(process.env.MOCK_GROQ_PORT || '4020', 10)

const sampleAnalysis = {
  summary:
    'This repository exposes a compact application surface with a small set of modules and a conventional build setup. The codebase is easy to navigate, but automated tests and deployment documentation are limited, so changes rely on manual verification.',
  architecture:
    'A single entry point wires the application together, with supporting modules grouped by responsibility. Configuration is read at startup and there is no separate service boundary or persistence layer in the analyzed files.',
  layers: [
    {
      name: 'Entry point',
      responsibility: 'Boots the application and wires the main modules together.',
      components: ['README.md'],
    },
    {
      name: 'Supporting modules',
      responsibility: 'Holds the focused modules referenced by the entry point.',
      components: ['README.md'],
    },
    {
      name: 'Build and tooling',
      responsibility: 'Provides the build, run, and test commands described in the documentation.',
      components: ['README.md'],
    },
  ],
  techStack: [
    { name: 'JavaScript', purpose: 'Primary implementation language.' },
    { name: 'Node.js', purpose: 'Runtime and tooling for the project.' },
    { name: 'Markdown', purpose: 'Documentation in the repository README.' },
  ],
  strengths: [
    {
      title: 'Readable entry point',
      detail: 'The main module is short and presents the application flow directly.',
      files: ['README.md'],
    },
    {
      title: 'Focused module layout',
      detail: 'Supporting files are grouped by responsibility rather than mixed together.',
      files: ['README.md'],
    },
  ],
  weaknesses: [
    {
      title: 'Limited automated coverage',
      detail:
        'No test suite is visible among the analyzed files, so regressions depend on manual checks.',
      files: ['README.md'],
    },
    {
      title: 'Thin operational docs',
      detail:
        'The README covers the project at a high level but omits deployment and troubleshooting detail.',
      files: ['README.md'],
    },
  ],
  securityConcerns: [
    {
      title: 'Dependency review needed',
      detail: 'Manifest files do not show an automated audit step for dependency vulnerabilities.',
      severity: 'medium',
      files: ['README.md'],
    },
  ],
  recommendations: [
    {
      title: 'Add a smoke test suite',
      detail:
        'Cover the primary entry point and critical helpers with automated tests and run them in CI.',
      priority: 'high',
      files: ['README.md'],
    },
    {
      title: 'Document deployment',
      detail: 'Add environment variables, build steps, and rollback notes to the README.',
      priority: 'medium',
      files: ['README.md'],
    },
    {
      title: 'Add dependency auditing',
      detail: 'Run an audit in CI and pin production dependencies.',
      priority: 'medium',
      files: ['README.md'],
    },
  ],
  scores: {
    overall: 76,
    codeQuality: 80,
    architecture: 74,
    maintainability: 78,
    documentation: 62,
    security: 72,
    testing: 35,
  },
  complexity: 'moderate',
  onboardingEffort: 'low',
  tags: ['javascript', 'application', 'small-team'],
  onboarding: {
    prerequisites: ['Node.js 20 or newer', 'npm', 'A Groq API key for AI features'],
    steps: [
      {
        title: 'Install dependencies',
        detail: 'Run npm install, then copy the environment template and set the required values.',
        files: ['README.md'],
      },
      {
        title: 'Start the application',
        detail: 'Run the documented development command and open the local URL.',
        files: ['README.md'],
      },
      {
        title: 'Run checks',
        detail: 'Run the test and lint commands from the README before changing code.',
        files: ['README.md'],
      },
    ],
    keyFiles: ['README.md'],
  },
  valuation: {
    currency: 'USD',
    sellingPrice: 9000,
    buildPrice: 24000,
    range: { low: 6000, typical: 9000, high: 14000 },
    suggestedAsk: 11000,
    suggestedAskReasoning:
      'The small code surface and thin test coverage limit buyer confidence, so the ask sits slightly above the typical sale range and below a full rebuild cost. Adding tests and deployment documentation would support a higher ask.',
    buildScope:
      'A comparable rebuild would cover the application entry point, supporting modules, configuration, and documentation, assuming a mid-level freelance day rate and roughly three weeks of work.',
    factors: [
      {
        factor: 'Small, readable surface',
        impact: 'positive',
        detail: 'The analyzed modules are compact and quick to review.',
      },
      {
        factor: 'No automated tests',
        impact: 'negative',
        detail: 'Buyers would likely budget for refactoring and test coverage.',
      },
    ],
    missingFeatures: [
      {
        title: 'Automated test suite',
        detail: 'A buyer would expect regression coverage before paying for the code.',
        estimatedValue: 1500,
      },
    ],
    improvements: [
      {
        title: 'Add tests and CI',
        detail: 'Cover the entry point and critical helpers, then run the suite on every change.',
        priceImpact: 'medium',
      },
      {
        title: 'Document deployment',
        detail: 'List environment variables, build steps, and rollback notes in the README.',
        priceImpact: 'low',
      },
    ],
    assumptions: [
      'Figures are illustrative mock values for local development, not a market data source.',
      'Assumes a mid-level freelance rate and a three-week rebuild.',
    ],
    confidence: 'low',
  },
}

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
    return send(res, 404, { error: { message: 'Use POST /openai/v1/chat/completions.' } })
  }

  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    let body
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      return send(res, 400, { error: { message: 'Request body must be JSON.' } })
    }

    const wantsJson = body.response_format?.type === 'json_object'
    const systemText = String(
      body.messages?.find((message) => message.role === 'system')?.content || '',
    )
    const userText = String(
      body.messages?.find((message) => message.role === 'user')?.content || '',
    )
    const isBatch = systemText.includes('reviewing ONE batch')
    const citedPaths = [...userText.matchAll(/<file path="([^"]+)"/g)].map((match) => match[1])
    const cite = (index) =>
      citedPaths.length ? citedPaths[Math.min(index, citedPaths.length - 1)] : 'README.md'

    let content
    if (!wantsJson) {
      content =
        '## Summary\n\nThis is a **mock Groq response** used for local development. The request reached the app, the repository context was collected, and this reply exercised the chat pipeline.\n\n- Chat history is persisted\n- Quotas are enforced\n- Replace the mock with a real `GROQ_API_KEY` for production answers'
    } else if (isBatch) {
      content = JSON.stringify({
        scopeSummary: `This batch reviews ${citedPaths.length || 1} file(s) and shows a compact application surface.`,
        architectureNotes:
          'The reviewed files show an entry point with supporting modules and configuration.',
        techStack: [
          { name: 'JavaScript', purpose: 'Primary implementation language in this batch.' },
          { name: 'Node.js', purpose: 'Runtime for the reviewed files.' },
        ],
        strengths: [
          {
            title: 'Readable entry point',
            detail: `${cite(0)} is short and readable.`,
            files: [cite(0)],
          },
        ],
        weaknesses: [
          {
            title: 'Limited automated coverage',
            detail: 'No test files appear in this batch.',
            files: [cite(0)],
          },
        ],
        securityConcerns: [],
        recommendations: [
          {
            title: 'Add a smoke test suite',
            detail: 'Cover the entry point with automated tests.',
            priority: 'high',
            files: [cite(0)],
          },
        ],
        filesReviewed: citedPaths.slice(0, 12),
      })
    } else {
      const analysis = {
        ...sampleAnalysis,
        strengths: sampleAnalysis.strengths.map((item, index) => ({
          ...item,
          files: [cite(index)],
        })),
        weaknesses: sampleAnalysis.weaknesses.map((item, index) => ({
          ...item,
          files: [cite(index)],
        })),
        securityConcerns: sampleAnalysis.securityConcerns.map((item, index) => ({
          ...item,
          files: [cite(index)],
        })),
        recommendations: sampleAnalysis.recommendations.map((item, index) => ({
          ...item,
          files: [cite(index)],
        })),
        layers: sampleAnalysis.layers.map((layer, index) => ({
          ...layer,
          components: [cite(index)],
        })),
        onboarding: {
          ...sampleAnalysis.onboarding,
          steps: sampleAnalysis.onboarding.steps.map((step, index) => ({
            ...step,
            files: [cite(index)],
          })),
          keyFiles: citedPaths.length ? citedPaths.slice(0, 3) : sampleAnalysis.onboarding.keyFiles,
        },
      }
      content = JSON.stringify(analysis)
    }

    send(res, 200, {
      id: `chatcmpl-mock-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model || 'mock-model',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 200, completion_tokens: 120, total_tokens: 320 },
    })
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[mock-groq] OpenAI-compatible mock listening on http://127.0.0.1:${port}/openai/v1`)
  console.log(
    '[mock-groq] Start the API with GROQ_API_KEY=mock-key and GROQ_API_BASE set to that URL.',
  )
})
