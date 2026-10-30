import pino from 'pino'
import { getConfig } from '../config.js'

let logger = null

function buildLogger() {
  const config = getConfig()
  const options = {
    level: config.logLevel,
    base: { service: 'devscope-ai', env: config.nodeEnv },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        'password',
        'currentPassword',
        'newPassword',
        '*.password',
        '*.token',
        '*.apiKey',
        '*.secret',
      ],
      censor: '[redacted]',
    },
  }

  if (!config.isProd && !config.isTest) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,service,env',
        },
      },
    })
  }

  return pino(options)
}

export function getLogger() {
  if (!logger) logger = buildLogger()
  return logger
}

export function resetLogger() {
  logger = null
}
