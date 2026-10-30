import http from 'node:http'

export const mockState = {
  ai: {
    mode: 'ok',
    calls: 0,
    requests: [],
    paths: [],
  },
  github: {
    files: null,
    tree: null,
  },
}

function mockFiles() {
  return mockState.github.files || repositoryFiles
}

function mockTree() {
  return mockState.github.tree || treeEntries
}

const now = '2026-01-15T12:00:00.000Z'

const repository = {
  id: 101,
  name: 'hello',
  full_name: 'Octo/Hello',
  owner: {
    login: 'Octo',
    avatar_url: 'https://avatars.githubusercontent.com/u/1',
    html_url: 'https://github.com/Octo',
  },
  description: 'A demo Node service used by the DevScope test suite.',
  html_url: 'https://github.com/Octo/Hello',
  homepage: 'https://example.com/hello',
  stargazers_count: 42,
  forks_count: 7,
  subscribers_count: 5,
  open_issues_count: 2,
  language: 'JavaScript',
  topics: ['demo', 'express', 'testing'],
  license: { spdx_id: 'MIT', name: 'MIT License' },
  default_branch: 'main',
  created_at: now,
  updated_at: now,
  pushed_at: now,
  size: 64,
  archived: false,
  fork: false,
  visibility: 'public',
}

const repositoryFiles = {
  'README.md':
    '# Hello\n\nA demo Node service used by automated tests. It exposes a small Express app and a utility module.\n',
  'package.json': JSON.stringify(
    {
      name: 'hello',
      version: '1.0.0',
      scripts: { test: 'vitest' },
      dependencies: { express: '^5.0.0' },
    },
    null,
    2,
  ),
  'src/index.js':
    "import express from 'express'\nimport { add } from './util.js'\n\nconst app = express()\napp.get('/', (req, res) => res.json({ sum: add(1, 2) }))\n\nexport default app\n",
  'src/util.js': 'export const add = (a, b) => a + b\n',
}

const treeEntries = [
  { path: 'README.md', type: 'blob', size: repositoryFiles['README.md'].length },
  { path: 'package.json', type: 'blob', size: repositoryFiles['package.json'].length },
  { path: 'src', type: 'tree', size: 0 },
  { path: 'src/index.js', type: 'blob', size: repositoryFiles['src/index.js'].length },
  { path: 'src/util.js', type: 'blob', size: repositoryFiles['src/util.js'].length },
  { path: 'node_modules/express/index.js', type: 'blob', size: 12_000 },
  { path: 'package-lock.json', type: 'blob', size: 90_000 },
]

export const sampleAnalysis = {
  summary:
    'Octo/Hello is a small Express service that exposes a single JSON endpoint and delegates arithmetic to a utility module. The codebase is compact, readable, and easy to onboard, but it has no automated tests or error handling around the HTTP layer.',
  architecture:
    'The entry point in src/index.js creates an Express application and registers a single route. Utility logic lives in src/util.js. There is no persistence layer, configuration module, or middleware boundary.',
  layers: [
    {
      name: 'HTTP entry point',
      responsibility: 'Creates the Express app and serves GET / from src/index.js.',
      components: ['src/index.js'],
    },
    {
      name: 'Utility logic',
      responsibility: 'Provides arithmetic helpers consumed by the HTTP layer.',
      components: ['src/util.js'],
    },
    {
      name: 'Project configuration',
      responsibility: 'Declares runtime dependencies and the test script.',
      components: ['package.json'],
    },
  ],
  techStack: [
    { name: 'Node.js', purpose: 'Runtime for the Express service.' },
    { name: 'Express', purpose: 'HTTP routing in src/index.js.' },
    { name: 'Vitest', purpose: 'Declared test script, but no test files are present.' },
  ],
  strengths: [
    {
      title: 'Minimal surface area',
      detail: 'src/index.js is short and easy to review.',
      files: ['src/index.js'],
    },
    {
      title: 'Clear module split',
      detail: 'Arithmetic helpers live in src/util.js.',
      files: ['src/util.js'],
    },
  ],
  weaknesses: [
    {
      title: 'No automated tests',
      detail: 'package.json declares Vitest but no test files exist.',
      files: ['package.json'],
    },
    {
      title: 'No input validation',
      detail: 'The route responds with a constant payload and has no validation path.',
      files: ['src/index.js'],
    },
  ],
  securityConcerns: [
    {
      title: 'Express version drift',
      detail:
        'Dependency versions are not locked in-repo beyond package.json, so installs may drift.',
      severity: 'low',
      files: ['package.json'],
    },
  ],
  recommendations: [
    {
      title: 'Add request tests',
      detail: 'Cover GET / with supertest to lock the response contract before adding features.',
      priority: 'high',
      files: ['src/index.js'],
    },
    {
      title: 'Add error middleware',
      detail: 'Register a JSON error handler in src/index.js so failures return stable responses.',
      priority: 'medium',
      files: ['src/index.js'],
    },
    {
      title: 'Document setup',
      detail: 'Expand README.md with install, run, and test commands.',
      priority: 'low',
      files: ['README.md'],
    },
  ],
  scores: {
    overall: 82,
    codeQuality: 86,
    architecture: 80,
    maintainability: 84,
    documentation: 74,
    security: 88,
    testing: 30,
  },
  complexity: 'low',
  onboardingEffort: 'low',
  tags: ['express', 'node', 'demo', 'small-codebase'],
  onboarding: {
    prerequisites: ['Node.js 20 or newer', 'npm'],
    steps: [
      {
        title: 'Install dependencies',
        detail: 'Run npm install in the repository root.',
        files: ['package.json'],
      },
      {
        title: 'Start the service',
        detail: 'Run node src/index.js and request GET / to see the JSON response.',
        files: ['src/index.js'],
      },
      {
        title: 'Run the test command',
        detail: 'Run npm test; package.json declares Vitest but no test files are present.',
        files: ['package.json'],
      },
    ],
    keyFiles: ['src/index.js', 'src/util.js', 'package.json'],
  },
  valuation: {
    currency: 'USD',
    sellingPrice: 18000,
    buildPrice: 42000,
    range: { low: 12000, typical: 18000, high: 26000 },
    suggestedAsk: 21000,
    suggestedAskReasoning:
      'The suggested ask sits slightly above the typical sale value because the code is clean and deployable, while the absence of tests and error handling limits buyer confidence. Closing those gaps would support the high end of the range.',
    buildScope:
      'A from-scratch rebuild would cover the Express entry point, the arithmetic utility module, project configuration, and basic deployment documentation, estimated at four to six freelance weeks.',
    factors: [
      {
        factor: 'Small, readable surface',
        impact: 'positive',
        detail: 'src/index.js and src/util.js are short and easy for a buyer to review.',
      },
      {
        factor: 'No automated tests',
        impact: 'negative',
        detail:
          'package.json declares Vitest but no test files exist, increasing buyer diligence cost.',
      },
    ],
    missingFeatures: [
      {
        title: 'Automated test suite',
        detail: 'Buyers typically expect tests that lock the HTTP contract before acquisition.',
        estimatedValue: 2500,
      },
    ],
    improvements: [
      {
        title: 'Add request-level tests',
        detail: 'Cover GET / with supertest to reduce perceived delivery risk.',
        priceImpact: 'medium',
      },
    ],
    assumptions: [
      'Mid-level freelance rates of roughly USD 45-70 per hour in a Western European or North American market.',
      'The repository is sold as a code asset without a customer base, brand, or recurring revenue.',
    ],
    confidence: 'medium',
  },
}

function jsonResponse(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': '4999',
    'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function githubHandler(req, res, url) {
  const path = url.pathname.replace(/^\/github/, '')

  if (path === '/search/users') {
    return jsonResponse(res, 200, {
      total_count: 1,
      items: [
        {
          login: 'octo',
          avatar_url: 'https://avatars.githubusercontent.com/u/1',
          html_url: 'https://github.com/octo',
          type: 'User',
          score: 1,
        },
      ],
    })
  }

  if (path === '/search/repositories') {
    return jsonResponse(res, 200, { total_count: 1, items: [repository] })
  }

  if (path === '/users/octo') {
    return jsonResponse(res, 200, {
      login: 'octo',
      name: 'Octo Tester',
      avatar_url: 'https://avatars.githubusercontent.com/u/1',
      html_url: 'https://github.com/octo',
      type: 'User',
      bio: 'Test fixture maintainer.',
      company: null,
      location: 'Test Suite',
      blog: 'https://example.com',
      followers: 10,
      following: 2,
      public_repos: 1,
      created_at: now,
      hireable: true,
    })
  }

  if (path === '/users/octo/repos') {
    return jsonResponse(res, 200, [repository])
  }

  if (!path.startsWith('/repos/octo/hello')) {
    return jsonResponse(res, 404, { message: 'Not Found' })
  }

  const rest = path.slice('/repos/octo/hello'.length)

  if (rest === '') return jsonResponse(res, 200, repository)

  if (rest === '/languages') return jsonResponse(res, 200, { JavaScript: 900, CSS: 100 })

  if (rest === '/readme') {
    const content = mockFiles()['README.md'] || repositoryFiles['README.md']
    return jsonResponse(res, 200, {
      path: 'README.md',
      html_url: 'https://github.com/Octo/Hello/blob/main/README.md',
      size: content.length,
      encoding: 'base64',
      content: Buffer.from(content).toString('base64'),
    })
  }

  if (rest.startsWith('/git/trees/')) {
    return jsonResponse(res, 200, { sha: 'main', tree: mockTree(), truncated: false })
  }

  if (rest.startsWith('/contents/')) {
    const filePath = decodeURIComponent(rest.slice('/contents/'.length))
    const content = mockFiles()[filePath]
    if (content === undefined) return jsonResponse(res, 404, { message: 'Not Found' })
    return jsonResponse(res, 200, {
      path: filePath,
      html_url: `https://github.com/Octo/Hello/blob/main/${filePath}`,
      size: Buffer.byteLength(content),
      encoding: 'base64',
      content: Buffer.from(content).toString('base64'),
    })
  }

  return jsonResponse(res, 404, { message: 'Not Found' })
}

async function groqHandler(req, res, url) {
  const bodyText = await readBody(req)
  let body = {}
  try {
    body = JSON.parse(bodyText)
  } catch {
    // Keep the empty object so the mock still returns a valid completion envelope.
  }

  mockState.ai.calls += 1
  mockState.ai.requests.push(body)
  mockState.ai.paths.push(url.pathname)

  if (mockState.ai.mode === 'error') {
    return jsonResponse(res, 500, { error: { message: 'Mock AI upstream failure.' } })
  }

  if (
    mockState.ai.mode === 'json_invalid_always' ||
    (mockState.ai.mode === 'json_invalid_once' && mockState.ai.calls === 1)
  ) {
    return jsonResponse(res, 400, {
      error: {
        message:
          "Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
        type: 'invalid_request_error',
        code: 'json_validate_failed',
        failed_generation: '',
      },
    })
  }

  if (
    mockState.ai.mode === 'tpm_always' ||
    (mockState.ai.mode === 'tpm_once' && mockState.ai.calls === 1)
  ) {
    return jsonResponse(res, 413, {
      error: {
        message:
          'Request too large for model `openai/gpt-oss-120b` in organization `org_mock` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Requested 12000, please reduce your message size and try again.',
        type: 'tokens',
        code: 'rate_limit_exceeded',
      },
    })
  }

  if (
    mockState.ai.mode === 'context_always' ||
    (mockState.ai.mode === 'context_once' && mockState.ai.calls === 1)
  ) {
    return jsonResponse(res, 413, {
      error: {
        message: 'Request too large for model context window: context_length_exceeded.',
        type: 'invalid_request_error',
        code: 'context_length_exceeded',
      },
    })
  }

  const systemText = String(
    body.messages?.find((message) => message.role === 'system')?.content || '',
  )
  const userText = String(body.messages?.find((message) => message.role === 'user')?.content || '')
  const isBatch = systemText.includes('reviewing ONE batch')

  const wantsJson = body.response_format?.type === 'json_object'
  let content
  if (mockState.ai.mode === 'invalid') {
    content = 'I am unable to produce the requested structure.'
  } else if (wantsJson && isBatch) {
    const paths = [...userText.matchAll(/<file path="([^"]+)"/g)]
      .map((match) => match[1])
      .slice(0, 12)
    const batchFindings = {
      scopeSummary: `This batch reviews ${paths.length || 1} file${paths.length === 1 ? '' : 's'} from Octo/Hello. It shows a compact Express service with arithmetic helpers.`,
      architectureNotes:
        'The reviewed files show an HTTP entry point delegating arithmetic to a utility module.',
      techStack: [
        { name: 'Node.js', purpose: 'Runtime for the reviewed files.' },
        { name: 'Express', purpose: 'HTTP routing seen in the batch.' },
      ],
      strengths: [
        {
          title: 'Small focused modules',
          detail: paths[0] ? `${paths[0]} is short and readable.` : 'The reviewed files are short.',
          files: paths.slice(0, 1),
        },
      ],
      weaknesses: [
        {
          title: 'Thin test coverage',
          detail: 'No test files appear in this batch.',
          files: paths.slice(0, 1),
        },
      ],
      securityConcerns: [],
      recommendations: [
        {
          title: 'Add request tests',
          detail: 'Cover the HTTP entry point with supertest.',
          priority: 'high',
          files: paths.slice(0, 1),
        },
      ],
      filesReviewed: paths,
    }
    content = `\`\`\`json\n${JSON.stringify(batchFindings)}\n\`\`\``
  } else if (wantsJson && mockState.ai.mode === 'citation_invalid') {
    const cited = {
      ...sampleAnalysis,
      strengths: [
        {
          title: 'Minimal surface area',
          detail: 'Short entry point.',
          files: ['src/index.js', 'src/does-not-exist.js'],
        },
        {
          title: 'Imaginary helper',
          detail: 'Cites only a path that was never analyzed.',
          files: ['lib/phantom.js'],
        },
      ],
      onboarding: {
        ...sampleAnalysis.onboarding,
        keyFiles: ['src/index.js', 'docs/never-supplied.md'],
        steps: [
          ...sampleAnalysis.onboarding.steps,
          {
            title: 'Read the deployment guide',
            detail: 'Open deploy/guide.md.',
            files: ['deploy/guide.md'],
          },
        ],
      },
    }
    content = `\`\`\`json\n${JSON.stringify(cited)}\n\`\`\``
  } else if (wantsJson && mockState.ai.mode === 'valuation_messy') {
    const messy = {
      ...sampleAnalysis,
      valuation: {
        ...sampleAnalysis.valuation,
        currency: 'usd',
        suggestedAsk: '$24,000',
        range: { low: 30000, typical: 21000, high: 10000 },
        factors: [{ factor: 'Small surface', impact: 'positive', detail: 'Short files.' }],
      },
    }
    content = `\`\`\`json\n${JSON.stringify(messy)}\n\`\`\``
  } else if (wantsJson && mockState.ai.mode === 'valuation_missing') {
    const rest = { ...sampleAnalysis }
    delete rest.valuation
    content = `\`\`\`json\n${JSON.stringify(rest)}\n\`\`\``
  } else if (wantsJson) {
    content = `\`\`\`json\n${JSON.stringify(sampleAnalysis)}\n\`\`\``
  } else {
    content =
      '## Overview\n\nThis repository is a compact **Express** service. The HTTP entry point is `src/index.js`, and arithmetic helpers live in `src/util.js`.\n\n- Single route\n- No automated tests\n- Minimal dependencies'
  }

  return jsonResponse(res, 200, {
    id: 'chatcmpl-mock',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model || 'mock-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
  })
}

export function startMockUpstream() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        if (url.pathname.startsWith('/github')) return githubHandler(req, res, url)
        if (url.pathname.endsWith('/chat/completions') && req.method === 'POST') {
          return await groqHandler(req, res, url)
        }
        return jsonResponse(res, 404, { message: 'Unknown mock route.', path: url.pathname })
      } catch (error) {
        return jsonResponse(res, 500, { message: error?.message || 'Mock server error.' })
      }
    })

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      })
    })
  })
}
