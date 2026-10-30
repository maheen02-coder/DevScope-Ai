import crypto from 'node:crypto'
import { getDb } from '../db.js'
import { notFound } from '../lib/errors.js'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/

function assertReportOwnership(userId, reportId) {
  const row = getDb()
    .prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?')
    .get(reportId, userId)
  if (!row) throw notFound('Report not found.')
}

function parseAnalysis(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function serializeSharedReport(row) {
  return {
    share: {
      createdAt: row.share_created_at,
      expiresAt: row.share_expires_at,
    },
    report: {
      repoFullName: row.repo_full_name,
      title: row.title,
      description: row.description,
      htmlUrl: row.html_url,
      language: row.language,
      stars: row.stars,
      forks: row.forks,
      defaultBranch: row.default_branch,
      depth: row.depth,
      model: row.model,
      filesAnalyzed: row.files_analyzed,
      createdAt: row.created_at,
      analysis: parseAnalysis(row.analysis),
    },
  }
}

export function createShare(userId, reportId, expiresInDays) {
  assertReportOwnership(userId, reportId)
  const db = getDb()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresInDays * 86_400_000).toISOString()

  // Keep exactly one active link per report so revocation is unambiguous.
  db.prepare(
    'UPDATE report_shares SET revoked_at = ? WHERE report_id = ? AND user_id = ? AND revoked_at IS NULL',
  ).run(now.toISOString(), reportId, userId)

  const token = crypto.randomBytes(24).toString('base64url')
  db.prepare(
    'INSERT INTO report_shares (token, report_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(token, reportId, userId, now.toISOString(), expiresAt)

  return { token, createdAt: now.toISOString(), expiresAt }
}

export function getActiveShare(userId, reportId) {
  assertReportOwnership(userId, reportId)
  const row = getDb()
    .prepare(
      `SELECT token, created_at, expires_at FROM report_shares
       WHERE report_id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(reportId, userId, new Date().toISOString())
  return row ? { token: row.token, createdAt: row.created_at, expiresAt: row.expires_at } : null
}

export function revokeShares(userId, reportId) {
  assertReportOwnership(userId, reportId)
  const result = getDb()
    .prepare(
      'UPDATE report_shares SET revoked_at = ? WHERE report_id = ? AND user_id = ? AND revoked_at IS NULL',
    )
    .run(new Date().toISOString(), reportId, userId)
  return result.changes
}

export function getSharedReport(token) {
  if (!TOKEN_PATTERN.test(String(token || ''))) return null
  const row = getDb()
    .prepare(
      `SELECT s.created_at AS share_created_at, s.expires_at AS share_expires_at,
              s.revoked_at AS share_revoked_at, r.*
       FROM report_shares s JOIN reports r ON r.id = s.report_id
       WHERE s.token = ?`,
    )
    .get(token)
  if (!row) return null
  if (row.share_revoked_at) return null
  if (new Date(row.share_expires_at).getTime() <= Date.now()) return null
  return serializeSharedReport(row)
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildScoreBadge(score) {
  const value = Number.isFinite(Number(score))
    ? Math.max(0, Math.min(100, Math.round(Number(score))))
    : null
  const label = 'DevScope'
  const message = value === null ? 'not scored' : `${value}/100`
  const color =
    value === null
      ? '#879caa'
      : value >= 80
        ? '#79c2b2'
        : value >= 60
          ? '#78bdd2'
          : value >= 40
            ? '#d9b884'
            : '#e08f99'
  const labelWidth = 62
  const messageWidth = 48
  const width = labelWidth + messageWidth
  const labelText = xmlEscape(label)
  const messageText = xmlEscape(message)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${labelText}: ${messageText}">
  <title>${labelText}: ${messageText}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#31343c"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${labelText}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${messageText}</text>
  </g>
</svg>`
}
