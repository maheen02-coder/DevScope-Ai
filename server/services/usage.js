import { getConfig } from '../config.js'
import { getDb } from '../db.js'
import { ApiError } from '../lib/errors.js'

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
