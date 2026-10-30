import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.js'
import { notFound } from '../lib/errors.js'
import { buildScoreBadge, getSharedReport } from '../services/shares.js'

const router = Router()

function loadShared(token) {
  const shared = getSharedReport(token)
  if (!shared) throw notFound('This shared report is unavailable, revoked, or has expired.')
  return shared
}

router.get(
  '/reports/:token',
  asyncHandler(async (req, res) => {
    const shared = loadShared(req.params.token)
    res.set('Cache-Control', 'no-store')
    res.json(shared)
  }),
)

router.get(
  '/reports/:token/badge.svg',
  asyncHandler(async (req, res) => {
    const shared = loadShared(req.params.token)
    const score = shared.report.analysis?.scores?.overall
    res.type('image/svg+xml')
    res.set('Cache-Control', 'no-store')
    res.send(buildScoreBadge(score))
  }),
)

export default router
