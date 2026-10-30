import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.js'
import { getDashboard } from '../services/dashboard.js'
import { getQuotaSummary } from '../services/usage.js'

const router = Router()

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(getDashboard(req.user.id))
  }),
)

router.get(
  '/usage',
  asyncHandler(async (req, res) => {
    res.json(getQuotaSummary(req.user.id))
  }),
)

export default router
