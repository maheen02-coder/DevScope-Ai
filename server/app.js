import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import express from 'express'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import { getConfig } from './config.js'
import { getLogger } from './lib/logger.js'
import { metricsMiddleware } from './lib/metrics.js'
import authRoutes from './routes/auth.js'
import githubRoutes from './routes/github.js'
import analyzeRoutes from './routes/analyze.js'
import chatRoutes from './routes/chat.js'
import reportRoutes from './routes/reports.js'
import dashboardRoutes from './routes/dashboard.js'
import userRoutes from './routes/users.js'
import healthRoutes from './routes/health.js'
import publicRoutes from './routes/public.js'
import docsRoutes from './routes/docs.js'
import metricsRoutes from './routes/metrics.js'
import oauthRoutes from './routes/oauth.js'
import { configurePassport } from './oauth.js'
import { requireAuth } from './middleware/auth.js'
import {
  corsMiddleware,
  jsonContentTypeGuard,
  limiters,
  originGuard,
  securityHeaders,
} from './middleware/security.js'
import { errorHandler, notFoundApi } from './middleware/errorHandler.js'

export function createApp() {
  const config = getConfig()
  const app = express()
  const passport = configurePassport()

  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy ? 1 : false)

  app.use(
    pinoHttp({
      logger: getLogger(),
      genReqId(req, res) {
        const id = req.headers['x-request-id'] || crypto.randomUUID()
        res.setHeader('X-Request-Id', id)
        return id
      },
      autoLogging: {
        ignore: (req) => req.url === '/api/health' || req.url === '/api/metrics',
      },
      customLogLevel(_req, res, err) {
        if (err || res.statusCode >= 500) return 'error'
        if (res.statusCode >= 400) return 'warn'
        return 'info'
      },
    }),
  )
  app.use(metricsMiddleware)
  app.use(securityHeaders())
  app.use(corsMiddleware())
  app.use(express.json({ limit: '128kb' }))
  app.use(cookieParser())
  app.use(passport.initialize())
  app.use(originGuard)
  app.use(jsonContentTypeGuard)

  app.use('/api/health', healthRoutes)
  app.use('/api/metrics', metricsRoutes)
  // Documentation is static and unauthenticated; mount it before the global limiter so the
  // Swagger UI assets load reliably.
  app.use('/api', docsRoutes)

  app.use('/api', limiters.global())
  app.use('/api/public', limiters.public(), publicRoutes)
  app.use('/api/auth', limiters.auth(), oauthRoutes, authRoutes)
  app.use('/api/github', requireAuth, limiters.github(), githubRoutes)
  app.use('/api/analyze', requireAuth, limiters.analyze(), analyzeRoutes)
  app.use('/api/chat', requireAuth, limiters.chat(), chatRoutes)
  app.use('/api/reports', requireAuth, reportRoutes)
  app.use('/api/dashboard', requireAuth, dashboardRoutes)
  app.use('/api/users', requireAuth, userRoutes)

  app.use('/api', notFoundApi)

  const distDir = path.resolve(config.distPath)
  const clientIndex = path.join(distDir, 'index.html')
  const hasClientBuild = fs.existsSync(clientIndex)

  if (hasClientBuild) {
    const assetsDir = path.join(distDir, 'assets')
    if (fs.existsSync(assetsDir)) {
      app.use('/assets', express.static(assetsDir, { maxAge: '1y', immutable: true }))
    }
    // express.static ignores dotfiles by default, which would hide security.txt.
    const wellKnownDir = path.join(distDir, '.well-known')
    if (fs.existsSync(wellKnownDir)) {
      app.use('/.well-known', express.static(wellKnownDir, { maxAge: '1h', dotfiles: 'allow' }))
    }
    app.use(express.static(distDir, { index: false, maxAge: '1h' }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      if (!req.accepts('html')) return next()
      res.sendFile(clientIndex, { headers: { 'Cache-Control': 'no-cache' } })
    })
  } else {
    app.get('/', (req, res) => {
      res.status(404).json({
        error: {
          code: 'CLIENT_NOT_BUILT',
          message: 'The frontend build was not found. Run `npm run dev` or `npm run build`.',
        },
      })
    })
  }

  app.use(errorHandler)

  return app
}
