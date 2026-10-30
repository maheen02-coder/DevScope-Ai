import { getConfig } from '../config.js'
import { limiterPolicies } from '../middleware/security.js'
import { getThrottleStats } from '../lib/rateLimitStats.js'
import { getGithubStatus } from './github.js'
import { getQuotaSummary, getUsageTimeline } from './usage.js'

export function getRateLimitReport(userId) {
  const config = getConfig()
  const quota = getQuotaSummary(userId)

  return {
    generatedAt: new Date().toISOString(),
    enforced: config.rateLimitEnabled,
    windowHours: quota.windowHours,
    quota: {
      analysis: quota.analysis,
      chat: quota.chat,
    },
    timeline: getUsageTimeline(userId, quota.windowHours),
    policies: limiterPolicies,
    throttle: getThrottleStats(),
    github: getGithubStatus(),
  }
}
