import { loadConfig, setConfig } from './config.js'
import { closeDb, initDb } from './db.js'
import { createApp } from './app.js'
import { getLogger } from './lib/logger.js'
import { createRealtime, closeRealtime } from './realtime.js'

const config = setConfig(loadConfig())
const logger = getLogger()
initDb(config.databasePath)

const app = createApp()
const server = app.listen(config.port, () => {
  logger.info(`API ready on http://localhost:${config.port} (${config.nodeEnv})`)
  if (!config.groqApiKey) {
    logger.warn('GROQ_API_KEY is not configured — AI analysis and chat return 503.')
  }
  if (!config.githubToken) {
    logger.info('GITHUB_TOKEN not configured — using anonymous GitHub limits (60 req/h).')
  }
})

createRealtime(server)

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down')
  closeRealtime().finally(() => {
    server.close(() => {
      closeDb()
      process.exit(0)
    })
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection')
})

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception')
  shutdown('uncaughtException')
})
