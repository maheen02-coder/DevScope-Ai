import { Router } from 'express'
import crypto from 'node:crypto'
import { getConfig } from '../config.js'
import { registry } from '../lib/metrics.js'

const router = Router()

function tokenMatches(provided, expected) {
  const left = Buffer.from(provided)
  const right = Buffer.from(expected)
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

router.get('/', async (req, res, next) => {
  const config = getConfig()
  if (config.metricsToken) {
    const header = req.get('authorization') || ''
    const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!tokenMatches(provided, config.metricsToken)) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'A valid metrics bearer token is required.' },
      })
      return
    }
  } else if (config.isProd) {
    // Avoid exposing aggregate usage data publicly by default in production.
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } })
    return
  }

  try {
    res.set('Content-Type', registry.contentType)
    res.send(await registry.metrics())
  } catch (error) {
    next(error)
  }
})

export default router
