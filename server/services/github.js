import { getConfig } from '../config.js'
import { ApiError, badRequest, notFound } from '../lib/errors.js'
import {
  estimateTokens,
  estimateTokensForBytes,
  resolveAiLimits,
  trimToTokenBudget,
} from '../lib/tokens.js'
import { isSensitivePath, redactSecrets } from '../lib/secrets.js'

const CACHE_LIMIT = 400
const cache = new Map()

let githubStatus = {
  limit: null,
  remaining: null,
  resetAt: null,
  checkedAt: null,
}

const DEPENDENCY_SEGMENTS = new Set([
  'node_modules',
  'vendor',
  'bower_components',
  'jspm_packages',
  '.yarn',
  '.pnpm-store',
  'Pods',
])

const BUILD_SEGMENTS = new Set([
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.idea',
  '.cache',
  '.turbo',
  '.parcel-cache',
  '.angular',
  '.expo',
  '.dart_tool',
  '.terraform',
  '.serverless',
  '.vercel',
  '.firebase',
  'target',
  '.gradle',
  'bin',
  'obj',
])

const IGNORED_FILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'Gemfile.lock',
  'Cargo.lock',
  'poetry.lock',
  'Pipfile.lock',
  'uv.lock',
  'go.sum',
  'bun.lock',
  'bun.lockb',
  'mix.lock',
  'Podfile.lock',
  'flake.lock',
  'pubspec.lock',
  '.DS_Store',
])

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'bmp',
  'tiff',
  'avif',
  'heic',
  'heif',
  'pdf',
  'zip',
  'gz',
  'tar',
  'rar',
  '7z',
  'jar',
  'war',
  'exe',
  'dll',
  'so',
  'dylib',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'ttc',
  'wasm',
  'mp3',
  'mp4',
  'mov',
  'avi',
  'webm',
  'wav',
  'flac',
  'ogg',
  'opus',
  'aac',
  'm4a',
  'wmv',
  'psd',
  'ai',
  'sketch',
  'fig',
  'db',
  'sqlite',
  'sqlite3',
  'pyc',
  'class',
  'o',
  'a',
  'onnx',
  'pt',
  'pth',
  'h5',
  'pb',
  'parquet',
  'feather',
  'npy',
  'npz',
  'pkl',
  'pickle',
  'mat',
])

const TEXT_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'php',
  'cs',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'swift',
  'm',
  'mm',
  'scala',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'sql',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'vue',
  'svelte',
  'astro',
  'json',
  'jsonc',
  'yml',
  'yaml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'md',
  'mdx',
  'txt',
  'xml',
  'graphql',
  'gql',
  'proto',
  'lua',
  'dart',
  'ex',
  'exs',
  'erl',
  'clj',
  'r',
  'jl',
  'zig',
  'nim',
  'sol',
  'tf',
  'hcl',
  'gradle',
  'properties',
  'env',
  'gitignore',
  'editorconfig',
  'dockerfile',
  'makefile',
])

const HIGH_PRIORITY_FILES = [
  'readme.md',
  'readme',
  'readme.rst',
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'gemfile',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'tsconfig.json',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'next.config.mjs',
  'nuxt.config.ts',
  'angular.json',
  'svelte.config.js',
  'astro.config.mjs',
  'makefile',
  'settings.gradle',
  'license',
  'license.md',
  'license.txt',
  'copying',
  'notice',
]

const ENTRY_POINT_PATTERNS = [
  /^(?:src|app|server|api|cmd|internal|pkg|packages|lib)\/(?:index|main|app|server|router|routes|program|bootstrap|handler|entry)\.[a-z0-9]+$/i,
  /^(?:main|index|app|server|manage|wsgi|asgi)\.[a-z0-9]+$/i,
  /^(?:src|app)\/(?:pages|routes|components|services|controllers|middleware|models|hooks)\/[^/]+$/i,
]

function ensureOwnerRepo(owner, repo) {
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})$/.test(owner || '') ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(repo || '')
  ) {
    throw badRequest('Invalid repository owner or name.')
  }
}

function ensureUsername(username) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(username || '')) {
    throw badRequest('Invalid GitHub username.')
  }
}

function cacheGet(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expires < Date.now()) {
    cache.delete(key)
    return null
  }
  return structuredClone(entry.data)
}

function cacheSet(key, data, ttl) {
  if (cache.size >= CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value
    cache.delete(oldestKey)
  }
  cache.set(key, { data: structuredClone(data), expires: Date.now() + ttl })
}

export function resetGithubCache() {
  cache.clear()
}

function updateRateStatus(res) {
  // Search requests have their own 10/minute bucket. The UI reports the core
  // bucket, so ignore headers from other resources to avoid showing "9 of 10"
  // next to copy that promises 60 requests per hour.
  const resource = res.headers.get('x-ratelimit-resource')
  if (resource && resource !== 'core') return
  const remaining = res.headers.get('x-ratelimit-remaining')
  const limit = res.headers.get('x-ratelimit-limit')
  const reset = res.headers.get('x-ratelimit-reset')
  if (remaining !== null) {
    githubStatus = {
      limit: limit ? Number(limit) : null,
      remaining: Number(remaining),
      resetAt: reset ? new Date(Number(reset) * 1000).toISOString() : null,
      checkedAt: new Date().toISOString(),
    }
  }
}

function mapGithubError(status, bodyText) {
  if (status === 404) {
    return notFound(
      'That GitHub resource could not be found. It may be private, renamed, or removed.',
    )
  }
  if (status === 403 || status === 429) {
    const exhausted = githubStatus.remaining === 0
    const rateLimited = /rate limit exceeded|secondary rate limit|abuse detection/i.test(
      bodyText || '',
    )
    if (exhausted || rateLimited || status === 429) {
      return new ApiError(
        429,
        'GITHUB_RATE_LIMITED',
        'GitHub API rate limit reached. Configure a GITHUB_TOKEN or wait for the limit to reset.',
        { resetAt: githubStatus.resetAt },
      )
    }
    return new ApiError(
      403,
      'GITHUB_FORBIDDEN',
      'GitHub denied access to this resource. It may be private or require a token with more access.',
    )
  }
  if (status === 401) {
    return new ApiError(502, 'GITHUB_AUTH_FAILED', 'GitHub rejected the configured credentials.')
  }
  if (status === 451) {
    return new ApiError(
      451,
      'GITHUB_UNAVAILABLE_LEGAL',
      'This repository is unavailable for legal reasons.',
    )
  }
  if (status === 422) {
    return new ApiError(400, 'GITHUB_INVALID_REQUEST', 'GitHub could not process this request.')
  }
  return new ApiError(
    502,
    'GITHUB_UNAVAILABLE',
    'GitHub is temporarily unavailable. Please try again.',
  )
}

async function ghRequest(path, { ttl = 5 * 60_000, accept = 'application/vnd.github+json' } = {}) {
  const config = getConfig()
  const key = `${accept}:${path}`
  const cached = cacheGet(key)
  if (cached) return cached

  const headers = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DevScope-AI/1.0',
  }
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`

  let response
  try {
    response = await fetch(`${config.githubApiBase}${path}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new ApiError(504, 'GITHUB_TIMEOUT', 'GitHub took too long to respond. Please retry.')
    }
    throw new ApiError(
      502,
      'GITHUB_UNAVAILABLE',
      'Could not reach GitHub. Check connectivity and retry.',
    )
  }

  updateRateStatus(response)
  const text = await response.text()

  if (!response.ok) {
    throw mapGithubError(response.status, text)
  }

  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new ApiError(502, 'GITHUB_BAD_RESPONSE', 'GitHub returned an unexpected response.')
  }

  cacheSet(key, data, ttl)
  return data
}

function decodeBase64(content) {
  try {
    return Buffer.from(String(content || '').replace(/\s/g, ''), 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function classifyTreeEntry(path, size) {
  const segments = path.split('/')
  const filename = segments[segments.length - 1].toLowerCase()

  if (segments.some((segment) => DEPENDENCY_SEGMENTS.has(segment))) {
    return { reason: 'dependency' }
  }
  if (segments.some((segment) => BUILD_SEGMENTS.has(segment))) {
    return { reason: 'build_output' }
  }
  if (segments.some((segment) => segment.startsWith('.') && segment !== '.github')) {
    return { reason: 'hidden' }
  }
  if (IGNORED_FILES.has(filename) || filename.endsWith('.lock')) {
    return { reason: 'lockfile' }
  }
  if (isSensitivePath(path)) {
    return { reason: 'sensitive' }
  }
  if (
    filename.includes('.min.') ||
    filename.endsWith('.map') ||
    /\.(?:bundle|chunk)\.(?:js|css)$/.test(filename) ||
    filename.includes('.generated.') ||
    filename.endsWith('.snap')
  ) {
    return { reason: 'generated' }
  }

  const ext = filename.includes('.') ? filename.split('.').pop() : filename
  if (BINARY_EXTENSIONS.has(ext)) return { reason: 'binary' }
  if (ext === 'svg') return { reason: 'asset' }
  if (size > 512_000) return { reason: 'large_file' }
  if (!TEXT_EXTENSIONS.has(ext) && !HIGH_PRIORITY_FILES.includes(filename)) {
    return { reason: 'unsupported' }
  }
  return null
}

export function getGithubStatus() {
  const config = getConfig()
  return {
    configured: Boolean(config.githubToken),
    limit: githubStatus.limit,
    remaining: githubStatus.remaining,
    resetAt: githubStatus.resetAt,
    checkedAt: githubStatus.checkedAt,
  }
}

function mapUser(user) {
  return {
    login: user.login,
    name: user.name || null,
    avatarUrl: user.avatar_url,
    htmlUrl: user.html_url,
    type: user.type,
    bio: user.bio || null,
    company: user.company || null,
    location: user.location || null,
    blog: typeof user.blog === 'string' && /^https?:\/\//i.test(user.blog) ? user.blog : null,
    followers: user.followers ?? 0,
    following: user.following ?? 0,
    publicRepos: user.public_repos ?? 0,
    createdAt: user.created_at,
    hireable: Boolean(user.hireable),
  }
}

function mapRepo(repo) {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: {
      login: repo.owner?.login,
      avatarUrl: repo.owner?.avatar_url,
      htmlUrl: repo.owner?.html_url,
    },
    description: repo.description || null,
    htmlUrl: repo.html_url,
    homepage:
      typeof repo.homepage === 'string' && /^https?:\/\//i.test(repo.homepage)
        ? repo.homepage
        : null,
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    watchers: repo.subscribers_count ?? repo.watchers_count ?? 0,
    openIssues: repo.open_issues_count ?? 0,
    language: repo.language || null,
    topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 12) : [],
    license:
      repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION'
        ? repo.license.spdx_id
        : repo.license?.name || null,
    defaultBranch: repo.default_branch || 'main',
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
    pushedAt: repo.pushed_at,
    size: repo.size ?? 0,
    archived: Boolean(repo.archived),
    isFork: Boolean(repo.fork),
    visibility: repo.visibility || 'public',
  }
}

export async function searchUsers(query) {
  const q = String(query || '')
    .trim()
    .slice(0, 80)
  if (q.length < 2) throw badRequest('Enter at least 2 characters to search.')
  const data = await ghRequest(`/search/users?q=${encodeURIComponent(q)}&per_page=12`, {
    ttl: 60_000,
  })
  return {
    total: data.total_count ?? 0,
    items: (data.items || []).map((user) => ({
      login: user.login,
      avatarUrl: user.avatar_url,
      htmlUrl: user.html_url,
      type: user.type,
      score: user.score,
    })),
  }
}

export async function searchRepositories(query) {
  const q = String(query || '')
    .trim()
    .slice(0, 80)
  if (q.length < 2) throw badRequest('Enter at least 2 characters to search.')
  const data = await ghRequest(
    `/search/repositories?q=${encodeURIComponent(q)}&per_page=12&sort=stars&order=desc`,
    { ttl: 60_000 },
  )
  return {
    total: data.total_count ?? 0,
    items: (data.items || []).map((repo) => ({
      ...mapRepo(repo),
      topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 6) : [],
    })),
  }
}

export async function getUser(username) {
  ensureUsername(username)
  const user = await ghRequest(`/users/${encodeURIComponent(username)}`)
  return mapUser(user)
}

export async function getUserRepos(username) {
  ensureUsername(username)
  const repos = await ghRequest(
    `/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`,
    { ttl: 2 * 60_000 },
  )
  return (Array.isArray(repos) ? repos : [])
    .map(mapRepo)
    .sort((a, b) => b.stars - a.stars || new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0))
    .slice(0, 100)
}

export async function getRepo(owner, repo) {
  ensureOwnerRepo(owner, repo)
  const data = await ghRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)
  return mapRepo(data)
}

export async function getLanguages(owner, repo) {
  ensureOwnerRepo(owner, repo)
  const data = await ghRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`,
  )
  const entries = Object.entries(data || {}).filter(([, bytes]) => Number(bytes) > 0)
  const total = entries.reduce((sum, [, bytes]) => sum + Number(bytes), 0) || 1
  return entries
    .map(([name, bytes]) => ({
      name,
      bytes: Number(bytes),
      percent: Math.round((Number(bytes) / total) * 1000) / 10,
    }))
    .sort((a, b) => b.bytes - a.bytes)
}

export async function getReadme(owner, repo, maxChars = 30_000) {
  ensureOwnerRepo(owner, repo)
  try {
    const data = await ghRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
      { ttl: 10 * 60_000 },
    )
    const content = decodeBase64(data.content)
    return {
      path: data.path,
      htmlUrl: data.html_url,
      content: content.slice(0, maxChars),
      truncated: content.length > maxChars,
      size: data.size ?? content.length,
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function getRepoTree(owner, repo, branch) {
  ensureOwnerRepo(owner, repo)
  const encodedBranch = encodeURIComponent(branch || 'main')
  let data
  try {
    data = await ghRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodedBranch}?recursive=1`,
      { ttl: 5 * 60_000 },
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && branch !== 'HEAD') {
      data = await ghRequest(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/HEAD?recursive=1`,
        { ttl: 5 * 60_000 },
      )
    } else {
      throw error
    }
  }

  const blobs = (data.tree || []).filter((item) => item.type === 'blob' && item.path)
  const visible = []
  const excluded = new Map()

  for (const item of blobs) {
    const classification = classifyTreeEntry(item.path, item.size ?? 0)
    if (!classification) {
      visible.push({ path: item.path, type: 'file', size: item.size ?? 0 })
      continue
    }
    const entry = excluded.get(classification.reason) || {
      reason: classification.reason,
      count: 0,
      samples: [],
    }
    entry.count += 1
    if (entry.samples.length < 8) entry.samples.push(item.path)
    excluded.set(classification.reason, entry)
  }

  return {
    entries: visible.slice(0, 4000),
    totalFiles: blobs.length,
    truncated: Boolean(data.truncated) || visible.length > 4000,
    excluded: [...excluded.values()].sort((a, b) => b.count - a.count),
  }
}

function validateFilePath(path) {
  if (typeof path !== 'string' || !path || path.length > 400) {
    throw badRequest('A valid file path is required.')
  }
  if (path.includes('\\') || path.includes('\0') || path.startsWith('/')) {
    throw badRequest('Invalid file path.')
  }
  if (path.split('/').some((segment) => segment === '..' || segment === '')) {
    throw badRequest('Invalid file path.')
  }
}

export async function getFile(owner, repo, path, branch) {
  ensureOwnerRepo(owner, repo)
  validateFilePath(path)
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const suffix = branch ? `?ref=${encodeURIComponent(branch)}` : ''
  const data = await ghRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${suffix}`,
    { ttl: 10 * 60_000 },
  )

  if (Array.isArray(data)) {
    throw badRequest('That path is a directory.')
  }

  const size = data.size ?? 0
  const htmlUrl = data.html_url
  const filename = path.split('/').pop().toLowerCase()
  const ext = filename.includes('.') ? filename.split('.').pop() : ''

  if (data.encoding !== 'base64' || size > 512_000 || BINARY_EXTENSIONS.has(ext)) {
    return {
      path,
      size,
      htmlUrl,
      binary: true,
      content: null,
      language: ext || null,
    }
  }

  const content = decodeBase64(data.content)
  if (content.includes('\0')) {
    return { path, size, htmlUrl, binary: true, content: null, language: ext || null }
  }

  return {
    path,
    size,
    htmlUrl,
    binary: false,
    content: content.slice(0, 120_000),
    truncated: content.length > 120_000,
    language: ext || null,
  }
}

function filePriority(path, size) {
  const filename = path.split('/').pop().toLowerCase()
  if (HIGH_PRIORITY_FILES.includes(filename)) return 0
  if (ENTRY_POINT_PATTERNS.some((pattern) => pattern.test(path))) return 1
  if (path.startsWith('.github/workflows/')) return 1
  if (/\.(config|conf)\.|\/(config|settings)\//.test(path)) return 2
  if (/(^|\/)(src|lib|app|server|api|cmd|internal|pkg|packages)\//.test(path)) {
    if (/\.(test|spec)\./.test(filename)) return 5
    if (
      /(^|\/)(routes?|controllers?|services?|handlers?|middleware|models?|db|database|repositories)\//.test(
        path,
      )
    ) {
      return 2
    }
    return 3
  }
  if (/^(test|tests|spec|specs|__tests__|examples|docs)\//.test(path)) return 5
  if (size > 60_000) return 6
  return 4
}

function summarizeReportEntries(entries, cap = 60) {
  const counts = {}
  for (const entry of entries) {
    counts[entry.reason] = (counts[entry.reason] || 0) + 1
  }
  return { items: entries.slice(0, cap), counts, total: entries.length }
}

function estimateHeaderTokens({ repo, languages, readmeTokens, treeTokens }) {
  const metadata = 400 + (repo.topics?.length || 0) * 8 + languages.length * 16
  return metadata + readmeTokens + treeTokens + 220
}

function planFileSelection(entries, { maxFiles, maxFileTokens, fileTokenBudget, excludePaths }) {
  const ranked = entries
    .filter((entry) => !excludePaths.has(entry.path))
    .map((entry) => ({ ...entry, priority: filePriority(entry.path, entry.size) }))
    .sort((a, b) => a.priority - b.priority || a.size - b.size || a.path.localeCompare(b.path))

  const planned = []
  const omitted = []
  let budget = fileTokenBudget

  for (const entry of ranked) {
    if (planned.length >= maxFiles) {
      omitted.push({ path: entry.path, reason: 'max_files' })
      continue
    }
    const estimated = Math.max(1, estimateTokensForBytes(entry.size))
    const allowance = Math.min(maxFileTokens, estimated)
    if (allowance > budget) {
      omitted.push({ path: entry.path, reason: 'token_budget' })
      continue
    }
    planned.push({ ...entry, tokenAllowance: allowance })
    budget -= allowance
  }

  return { planned, omitted }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await mapper(items[current], current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function fetchRepositoryFiles(owner, repo, planned, limits) {
  const results = await mapWithConcurrency(planned, 4, async (entry) => {
    try {
      const file = await getFile(owner, repo, entry.path)
      if (file.binary || !file.content) {
        return { skipped: { path: entry.path, reason: 'binary' } }
      }
      const redacted = redactSecrets(file.content)
      const trimmed = trimToTokenBudget(
        redacted.text,
        Math.min(limits.maxFileTokens, entry.tokenAllowance),
      )
      if (!trimmed.text.trim()) {
        return { skipped: { path: entry.path, reason: 'empty' } }
      }
      return {
        file: {
          path: entry.path,
          size: file.size,
          language: file.language,
          content: trimmed.text,
          truncated: trimmed.truncated || Boolean(file.truncated),
          estimatedTokens: estimateTokens(trimmed.text),
          secretRedactions: redacted.count,
        },
      }
    } catch {
      return { skipped: { path: entry.path, reason: 'fetch_failed' } }
    }
  })

  return {
    files: results.filter((result) => result.file).map((result) => result.file),
    skipped: results.filter((result) => result.skipped).map((result) => result.skipped),
  }
}

export async function buildRepositoryContext(owner, repo, { depth = 'standard' } = {}) {
  ensureOwnerRepo(owner, repo)
  const config = getConfig()
  const limits = resolveAiLimits(config, depth)

  const repoInfo = await getRepo(owner, repo)
  const readmeChars = Math.min(120_000, Math.max(8000, limits.maxReadmeTokens * 4 + 2000))
  const [languages, rawReadme, tree] = await Promise.all([
    getLanguages(owner, repo),
    getReadme(owner, repo, readmeChars),
    getRepoTree(owner, repo, repoInfo.defaultBranch),
  ])

  let readme = null
  if (rawReadme) {
    const redacted = redactSecrets(rawReadme.content)
    const trimmed = trimToTokenBudget(redacted.text, limits.maxReadmeTokens)
    readme = {
      path: rawReadme.path,
      content: trimmed.text,
      truncated: rawReadme.truncated || trimmed.truncated,
      estimatedTokens: estimateTokens(trimmed.text),
      secretRedactions: redacted.count,
    }
  }

  const treePaths = tree.entries.slice(0, limits.maxTreePaths).map((entry) => entry.path)
  const treeTruncated = tree.truncated || tree.entries.length > limits.maxTreePaths
  const headerTokens = estimateHeaderTokens({
    repo: repoInfo,
    languages,
    readmeTokens: readme?.estimatedTokens || 0,
    treeTokens: estimateTokens(treePaths.join('\n')),
  })
  const fileTokenBudget = Math.max(
    0,
    Math.min(
      limits.maxFiles * limits.maxFileTokens,
      limits.totalInputTokenLimit - headerTokens * limits.maxBatches - 4000,
    ),
  )

  const { planned, omitted } = planFileSelection(tree.entries, {
    maxFiles: limits.maxFiles,
    maxFileTokens: limits.maxFileTokens,
    fileTokenBudget,
    excludePaths: new Set(readme ? [readme.path] : []),
  })
  const { files, skipped } = await fetchRepositoryFiles(owner, repo, planned, limits)

  const truncated = []
  if (readme?.truncated) {
    truncated.push({ path: readme.path, reason: 'readme_token_limit' })
  }
  for (const file of files) {
    if (file.truncated) truncated.push({ path: file.path, reason: 'file_token_limit' })
  }

  const omittedSummary = summarizeReportEntries(omitted)
  const skippedSummary = summarizeReportEntries(skipped)
  const truncatedSummary = summarizeReportEntries(truncated)
  const secretRedactions =
    (readme?.secretRedactions || 0) +
    files.reduce((sum, file) => sum + (file.secretRedactions || 0), 0)
  const analyzed = files.map(({ path, size, language, truncated: cut, estimatedTokens }) => ({
    path,
    size,
    language: language || null,
    truncated: Boolean(cut),
    estimatedTokens,
  }))

  return {
    repo: repoInfo,
    languages,
    readme: readme
      ? { path: readme.path, content: readme.content, truncated: readme.truncated }
      : null,
    tree: {
      paths: treePaths,
      totalFiles: tree.totalFiles,
      truncated: treeTruncated,
      excluded: tree.excluded,
    },
    files,
    depth,
    limits,
    fetchedAt: new Date().toISOString(),
    report: {
      model: limits.model,
      contextWindow: limits.contextWindow,
      inputTokenLimit: limits.inputTokenLimit,
      totalInputTokenLimit: limits.totalInputTokenLimit,
      maxBatches: limits.maxBatches,
      maxFiles: limits.maxFiles,
      maxFileTokens: limits.maxFileTokens,
      maxReadmeTokens: limits.maxReadmeTokens,
      headerTokens,
      fileTokenBudget,
      estimatedInputTokens:
        headerTokens + files.reduce((sum, file) => sum + file.estimatedTokens, 0),
      candidateFiles: tree.entries.length,
      analyzed,
      skipped: skippedSummary.items,
      skippedCounts: skippedSummary.counts,
      skippedTotal: skippedSummary.total,
      omitted: omittedSummary.items,
      omittedCounts: omittedSummary.counts,
      omittedTotal: omittedSummary.total,
      truncated: truncatedSummary.items,
      truncatedCounts: truncatedSummary.counts,
      truncatedTotal: truncatedSummary.total,
      readme: readme
        ? {
            path: readme.path,
            included: true,
            truncated: readme.truncated,
            estimatedTokens: readme.estimatedTokens,
          }
        : { included: false },
      tree: { shown: treePaths.length, total: tree.totalFiles, truncated: treeTruncated },
      excluded: tree.excluded,
      secretRedactions,
    },
  }
}

export async function buildChatRepositoryContext(owner, repo) {
  ensureOwnerRepo(owner, repo)
  const limits = resolveAiLimits(getConfig(), 'standard')
  const repoInfo = await getRepo(owner, repo)
  const [languages, rawReadme, tree] = await Promise.all([
    getLanguages(owner, repo),
    getReadme(owner, repo, 12_000).catch(() => null),
    getRepoTree(owner, repo, repoInfo.defaultBranch).catch(() => ({
      entries: [],
      totalFiles: 0,
      excluded: [],
    })),
  ])

  let readme = null
  if (rawReadme) {
    const redacted = redactSecrets(rawReadme.content)
    const trimmed = trimToTokenBudget(redacted.text, Math.min(limits.maxReadmeTokens, 2000))
    readme = {
      path: rawReadme.path,
      content: trimmed.text,
      truncated: rawReadme.truncated || trimmed.truncated,
    }
  }

  return {
    repo: repoInfo,
    languages,
    readme,
    treePaths: tree.entries.slice(0, 80).map((entry) => entry.path),
    limits,
  }
}
