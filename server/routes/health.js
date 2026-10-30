import { Router } from 'express'
import { getDb } from '../db.js'
import { getConfig } from '../config.js'
import { isAiConfigured } from '../services/ai.js'
import { getGithubStatus } from '../services/github.js'

const router = Router()

router.get('/', (req, res) => {
  const config = getConfig()
  let database = 'ok'
  try {
    getDb().prepare('SELECT 1 AS ok').get()
  } catch {
    database = 'error'
  }
  res.status(database === 'ok' ? 200 : 503).json({
    status: database === 'ok' ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: config.version,
    environment: config.nodeEnv,
    database,
    ai: {
      configured: isAiConfigured(),
      model: config.groqModel,
    },
    github: getGithubStatus(),
    limits: {
      analysis: config.analysisDailyLimit,
      chat: config.chatDailyLimit,
    },
    observability: {
      logLevel: config.logLevel,
      metrics: config.isProd ? Boolean(config.metricsToken) : true,
    },
  })
})

export default router
