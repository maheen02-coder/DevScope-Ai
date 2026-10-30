import 'dotenv/config'
import crypto from 'node:crypto'

function int(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function intOrZero(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback
  return value === 'true' || value === '1'
}

function list(value, fallback) {
  return String(value || fallback)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

let currentConfig = null

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development'
  const isProd = nodeEnv === 'production'
  const isTest = nodeEnv === 'test'

  let jwtSecret = env.JWT_SECRET || ''
  if (!jwtSecret) {
    if (isProd) {
      throw new Error('JWT_SECRET must be configured (32+ characters) in production.')
    }
    jwtSecret = crypto.randomBytes(48).toString('hex')
    if (!isTest) {
      console.warn(
        '[config] JWT_SECRET is not set; using an ephemeral secret. Sessions will reset on restart.',
      )
    }
  }
  if (isProd && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.')
  }

  return {
    nodeEnv,
    isProd,
    isTest,
    port: int(env.PORT, 4000),
    version: env.npm_package_version || '1.0.0',
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
    cookieName: 'devscope_session',
    cookieSecure: bool(env.COOKIE_SECURE, isProd),
    trustProxy: bool(env.TRUST_PROXY, isProd),
    frontendOrigins: list(env.FRONTEND_ORIGIN, 'http://localhost:5173,http://localhost:4000'),
    databasePath: env.DATABASE_PATH || './data/devscope.db',
    distPath: env.DIST_PATH || './dist',
    bcryptRounds: int(env.BCRYPT_ROUNDS, isTest ? 4 : 12),
    rateLimitEnabled: bool(env.RATE_LIMIT_ENABLED, !isTest),
    logLevel: env.LOG_LEVEL || (isTest ? 'silent' : isProd ? 'info' : 'debug'),
    metricsToken: env.METRICS_TOKEN || '',
    oauthBaseUrl: (env.OAUTH_BASE_URL || `http://localhost:${int(env.PORT, 4000)}`).replace(
      /\/+$/,
      '',
    ),
    githubOauth: {
      clientId: env.GITHUB_OAUTH_CLIENT_ID || '',
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET || '',
    },
    googleOauth: {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID || '',
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    },
    githubToken: env.GITHUB_TOKEN || '',
    githubApiBase: (env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/+$/, ''),
    groqApiKey: env.GROQ_API_KEY || '',
    groqApiBase: (env.GROQ_API_BASE || 'https://api.groq.com').replace(/\/+$/, ''),
    groqModel: env.GROQ_MODEL || 'openai/gpt-oss-120b',
    aiTimeoutMs: int(env.AI_TIMEOUT_MS, 90_000),
    aiContextWindow: intOrZero(env.AI_CONTEXT_WINDOW),
    aiMaxInputTokens: intOrZero(env.AI_MAX_INPUT_TOKENS),
    aiMaxTotalInputTokens: intOrZero(env.AI_MAX_TOTAL_INPUT_TOKENS),
    aiMaxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 3200),
    aiMaxFileTokens: int(env.AI_MAX_FILE_TOKENS, 3000),
    aiMaxFiles: int(env.AI_MAX_FILES, 18),
    aiMaxReadmeTokens: int(env.AI_MAX_README_TOKENS, 4000),
    aiMaxBatches: int(env.AI_MAX_BATCHES, 3),
    analysisDailyLimit: int(env.ANALYSIS_DAILY_LIMIT, 10),
    chatDailyLimit: int(env.CHAT_DAILY_LIMIT, 60),
  }
}

export function setConfig(config) {
  currentConfig = config
  return currentConfig
}

export function getConfig() {
  if (!currentConfig) currentConfig = loadConfig()
  return currentConfig
}
