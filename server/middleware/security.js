import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { getConfig } from '../config.js'
import { ApiError } from '../lib/errors.js'
import { recordThrottle } from '../lib/rateLimitStats.js'

export function securityHeaders() {
  const config = getConfig()
  if (!config.isProd) {
    return helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })
  }
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // README badges and screenshots are served from many hosts; restrict them to HTTPS.
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
}

export function corsMiddleware() {
  const { frontendOrigins } = getConfig()
  // Vite marks built assets as crossorigin, so same-origin asset requests carry
  // an Origin header. The CORS policy must accept that origin as well as the
  // explicitly configured frontend origins.
  return function corsForRequest(req, res, next) {
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true)
        let sameOrigin
        try {
          sameOrigin = new URL(origin).host === req.get('host')
        } catch {
          sameOrigin = false
        }
        if (sameOrigin || frontendOrigins.includes(origin)) return callback(null, true)
        return callback(new ApiError(403, 'CORS_BLOCKED', 'Origin is not allowed.'))
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    })(req, res, next)
  }
}

export function originGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.get('origin')
  if (origin) {
    const { frontendOrigins } = getConfig()
    let sameOrigin
    try {
      sameOrigin = new URL(origin).host === req.get('host')
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin && !frontendOrigins.includes(origin)) {
      return next(new ApiError(403, 'CSRF_BLOCKED', 'Request origin is not allowed.'))
    }
  }
  next()
}

export function jsonContentTypeGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next()
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding']
  if (!hasBody) return next()
  if (!req.is('application/json')) {
    return next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Requests must use application/json.'))
  }
  next()
}

const policyDefinitions = [
  {
    key: 'global',
    label: 'Workspace API',
    scope: '/api/*',
    windowMs: 15 * 60_000,
    limit: 600,
    description: 'Umbrella ceiling for every API request from one address.',
    message: 'Too many requests. Please slow down.',
  },
  {
    key: 'auth',
    label: 'Authentication',
    scope: '/api/auth/*',
    windowMs: 15 * 60_000,
    limit: 40,
    description: 'Sign-in, registration, and OAuth attempts per address.',
    message: 'Too many authentication attempts. Try again in a few minutes.',
  },
  {
    key: 'github',
    label: 'GitHub proxy',
    scope: '/api/github/*',
    windowMs: 15 * 60_000,
    limit: 300,
    description: 'Repository and user lookups proxied through the GitHub API.',
  },
  {
    key: 'analyze',
    label: 'Analysis runs',
    scope: '/api/analyze',
    windowMs: 10 * 60_000,
    limit: 12,
    description: 'AI analysis starts, before the daily quota is checked.',
    message: 'Too many analysis requests. Wait a moment before starting another.',
  },
  {
    key: 'chat',
    label: 'Chat turns',
    scope: '/api/chat/*',
    windowMs: 5 * 60_000,
    limit: 40,
    description: 'AI chat messages, before the daily quota is checked.',
    message: 'You are sending messages too quickly. Take a short break.',
  },
  {
    key: 'public',
    label: 'Shared reports',
    scope: '/api/public/*',
    windowMs: 15 * 60_000,
    limit: 120,
    description: 'Read-only share links, which do not require a session.',
    message: 'Too many shared-report requests. Try again shortly.',
  },
]

export const limiterPolicies = policyDefinitions.map(
  ({ key, label, scope, windowMs, limit, description }) => ({
    key,
    label,
    scope,
    windowMs,
    limit,
    description,
  }),
)

export function createLimiter({ windowMs, limit, message, key, label }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !getConfig().rateLimitEnabled,
    handler(_req, res) {
      if (key) recordThrottle(key, label)
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: message || 'Too many requests. Please slow down and try again shortly.',
        },
      })
    },
  })
}

function policyLimiter(key) {
  const policy = policyDefinitions.find((entry) => entry.key === key)
  return createLimiter(policy)
}

export const limiters = {
  global: () => policyLimiter('global'),
  auth: () => policyLimiter('auth'),
  github: () => policyLimiter('github'),
  analyze: () => policyLimiter('analyze'),
  chat: () => policyLimiter('chat'),
  public: () => policyLimiter('public'),
}
