import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/asyncHandler.js'
import { parse, ownerPattern, repoPattern } from '../lib/validation.js'
import { buildRepositoryContext } from '../services/github.js'
import { analyzeRepository } from '../services/ai.js'
import { auditDependencies, buildHealthSignals } from '../lib/insights.js'
import { consumeQuota, getQuotaSummary, releaseQuota } from '../services/usage.js'
import { createReport } from '../services/reports.js'
import { normalizePreferences } from '../services/users.js'
import { analysisTotal } from '../lib/metrics.js'

const router = Router()

const analyzeSchema = z.object({
  owner: z.string().trim().regex(ownerPattern, 'Invalid repository owner.'),
  repo: z.string().trim().regex(repoPattern, 'Invalid repository name.'),
  depth: z.enum(['standard', 'deep']).optional(),
})

function userDepth(user) {
  try {
    return normalizePreferences(JSON.parse(user.preferences || '{}')).defaultDepth
  } catch {
    return 'standard'
  }
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = parse(analyzeSchema, req.body ?? {})
    const depth = input.depth || userDepth(req.user)
    const repoFullName = `${input.owner}/${input.repo}`

    const usageId = consumeQuota(req.user.id, 'analysis', repoFullName)
    try {
      const context = await buildRepositoryContext(input.owner, input.repo, { depth })
      const result = await analyzeRepository(context)
      const report = createReport(req.user.id, {
        repo: context.repo,
        analysis: result.analysis,
        depth,
        model: result.model,
        meta: {
          ...result.meta,
          usage: result.usage,
          languages: context.languages,
          tree: { totalFiles: context.tree.totalFiles, truncated: context.tree.truncated },
          health: buildHealthSignals(context.repo),
          dependencies: auditDependencies(
            context.files,
            (context.tree.excluded || [])
              .filter((entry) => entry.reason === 'lockfile')
              .flatMap((entry) => entry.samples || []),
          ),
        },
      })
      analysisTotal.inc({ status: 'success' })
      res.status(201).json({ report, quota: getQuotaSummary(req.user.id) })
    } catch (error) {
      analysisTotal.inc({ status: 'error' })
      releaseQuota(usageId)
      throw error
    }
  }),
)

export default router
