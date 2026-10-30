import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { getConfig } from '../config.js'
import { ApiError } from '../lib/errors.js'

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

export function createLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !getConfig().rateLimitEnabled,
    handler(_req, res) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: message || 'Too many requests. Please slow down and try again shortly.',
        },
      })
    },
  })
}

export const limiters = {
  global: () =>
    createLimiter({
      windowMs: 15 * 60_000,
      limit: 600,
      message: 'Too many requests. Please slow down.',
    }),
  auth: () =>
    createLimiter({
      windowMs: 15 * 60_000,
      limit: 40,
      message: 'Too many authentication attempts. Try again in a few minutes.',
    }),
  github: () => createLimiter({ windowMs: 15 * 60_000, limit: 300 }),
  analyze: () =>
    createLimiter({
      windowMs: 10 * 60_000,
      limit: 12,
      message: 'Too many analysis requests. Wait a moment before starting another.',
    }),
  chat: () =>
    createLimiter({
      windowMs: 5 * 60_000,
      limit: 40,
      message: 'You are sending messages too quickly. Take a short break.',
    }),
  public: () =>
    createLimiter({
      windowMs: 15 * 60_000,
      limit: 120,
      message: 'Too many shared-report requests. Try again shortly.',
    }),
}
