import { getConfig } from '../config.js'
import { getDb } from '../db.js'
import { ApiError } from '../lib/errors.js'
import { recordThrottle } from '../lib/rateLimitStats.js'

const WINDOW_MS = 24 * 60 * 60 * 1000

function limitFor(kind) {
  const config = getConfig()
  return kind === 'analysis' ? config.analysisDailyLimit : config.chatDailyLimit
}

export function consumeQuota(userId, kind, repoFullName = null) {
  const db = getDb()
  const limit = limitFor(kind)
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString()

  const recent = db
    .prepare(
      `SELECT id, created_at FROM usage_events
       WHERE user_id = ? AND kind = ? AND created_at >= ?
       ORDER BY created_at ASC`,
    )
    .all(userId, kind, windowStart)

  if (recent.length >= limit) {
    recordThrottle(
      `quota-${kind}`,
      kind === 'analysis' ? 'Analysis daily quota' : 'Chat daily quota',
    )
    const oldest = recent[0]
    const resetsAt = new Date(new Date(oldest.created_at).getTime() + WINDOW_MS).toISOString()
    throw new ApiError(
      429,
      'QUOTA_EXCEEDED',
      kind === 'analysis'
        ? `You have used all ${limit} analyses in the last 24 hours. The next slot opens at ${resetsAt}.`
        : `You have used all ${limit} AI chat messages in the last 24 hours. The next slot opens at ${resetsAt}.`,
      { kind, limit, used: recent.length, resetsAt },
    )
  }

  const result = db
    .prepare(
      `INSERT INTO usage_events (user_id, kind, repo_full_name, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(userId, kind, repoFullName, new Date().toISOString())

  return Number(result.lastInsertRowid)
}

export function releaseQuota(usageId) {
  if (!usageId) return
  getDb().prepare('DELETE FROM usage_events WHERE id = ?').run(usageId)
}

function summarize(userId, kind) {
  const db = getDb()
  const limit = limitFor(kind)
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString()
  const row = db
    .prepare(
      `SELECT COUNT(*) AS used, MIN(created_at) AS oldest
       FROM usage_events
       WHERE user_id = ? AND kind = ? AND created_at >= ?`,
    )
    .get(userId, kind, windowStart)
  const used = row?.used ?? 0
  return {
    kind,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: row?.oldest
      ? new Date(new Date(row.oldest).getTime() + WINDOW_MS).toISOString()
      : null,
  }
}

export function getQuotaSummary(userId) {
  return {
    analysis: summarize(userId, 'analysis'),
    chat: summarize(userId, 'chat'),
    windowHours: 24,
  }
}

const HOUR_MS = 60 * 60 * 1000

export function getUsageTimeline(userId, hours = 24) {
  const db = getDb()
  const bucketMs = HOUR_MS
  const currentBucket = Math.floor(Date.now() / bucketMs) * bucketMs
  const firstBucket = currentBucket - (hours - 1) * bucketMs

  const rows = db
    .prepare(
      `SELECT kind, created_at FROM usage_events
       WHERE user_id = ? AND created_at >= ?`,
    )
    .all(userId, new Date(firstBucket).toISOString())

  const buckets = new Map()
  for (let index = 0; index < hours; index += 1) {
    const start = firstBucket + index * bucketMs
    buckets.set(start, {
      start: new Date(start).toISOString(),
      analysis: 0,
      chat: 0,
    })
  }

  for (const row of rows) {
    if (row.kind !== 'analysis' && row.kind !== 'chat') continue
    const time = new Date(row.created_at).getTime()
    if (Number.isNaN(time)) continue
    const start = Math.floor(time / bucketMs) * bucketMs
    const bucket = buckets.get(start)
    if (bucket) bucket[row.kind] += 1
  }

  return [...buckets.values()]
}
