import crypto from 'node:crypto'
import { getDb } from '../db.js'
import { notFound } from '../lib/errors.js'

function parseAnalysis(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function serializeReport(row) {
  return {
    id: row.id,
    owner: row.owner,
    repo: row.repo,
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
    saved: Boolean(row.saved),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    analysis: parseAnalysis(row.analysis),
  }
}

function summarizeValuation(valuation) {
  if (!valuation || typeof valuation !== 'object') return null
  return {
    currency: valuation.currency || 'USD',
    suggestedAsk: valuation.suggestedAsk ?? null,
    buildPrice: valuation.buildPrice ?? null,
    low: valuation.range?.low ?? null,
    typical: valuation.range?.typical ?? null,
    high: valuation.range?.high ?? null,
    confidence: valuation.confidence || null,
  }
}

export function serializeReportListItem(row) {
  const report = serializeReport(row)
  const analysis = report.analysis || {}
  const summary = typeof analysis.summary === 'string' ? analysis.summary : ''
  return {
    id: report.id,
    owner: report.owner,
    repo: report.repo,
    repoFullName: report.repoFullName,
    title: report.title,
    language: report.language,
    stars: report.stars,
    depth: report.depth,
    model: report.model,
    saved: report.saved,
    createdAt: report.createdAt,
    filesAnalyzed: report.filesAnalyzed,
    overallScore: analysis.scores?.overall ?? null,
    scores: analysis.scores ?? null,
    complexity: analysis.complexity ?? null,
    valuation: summarizeValuation(analysis.valuation),
    tags: Array.isArray(analysis.tags) ? analysis.tags.slice(0, 5) : [],
    preview: summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}…` : summary,
  }
}

export function createReport(userId, { repo, analysis, depth, model, meta }) {
  const db = getDb()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const stored = { ...analysis, meta: meta || null }
  db.prepare(
    `INSERT INTO reports (
      id, user_id, owner, repo, repo_full_name, title, description, html_url, language,
      stars, forks, default_branch, depth, model, files_analyzed, analysis, saved, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    id,
    userId,
    repo.owner?.login || repo.fullName.split('/')[0],
    repo.name,
    repo.fullName,
    repo.fullName,
    repo.description || null,
    repo.htmlUrl || null,
    repo.language || null,
    repo.stars ?? 0,
    repo.forks ?? 0,
    repo.defaultBranch || null,
    depth || 'standard',
    model || null,
    meta?.filesAnalyzed ?? 0,
    JSON.stringify(stored),
    now,
    now,
  )
  return getReportById(id, userId)
}

export function getReportById(id, userId) {
  const row = getDb().prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?').get(id, userId)
  return row ? serializeReport(row) : null
}

export function findLatestReportForRepo(userId, repoFullName, { full = false } = {}) {
  const row = getDb()
    .prepare(
      `SELECT * FROM reports WHERE user_id = ? AND repo_full_name = ? COLLATE NOCASE
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId, repoFullName)
  if (!row) return null
  return full ? serializeReport(row) : serializeReportListItem(row)
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export function listReports(userId, { q = '', saved, page = 1, limit = 20 } = {}) {
  const db = getDb()
  const clauses = ['user_id = ?']
  const params = [userId]

  if (saved === true) clauses.push('saved = 1')
  if (saved === false) clauses.push('saved = 0')
  if (q) {
    clauses.push("(title LIKE ? ESCAPE '\\' OR repo_full_name LIKE ? ESCAPE '\\')")
    const needle = `%${escapeLike(q)}%`
    params.push(needle, needle)
  }

  const where = clauses.join(' AND ')
  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM reports WHERE ${where}`)
    .get(...params).count
  const offset = (page - 1) * limit
  const rows = db
    .prepare(
      `SELECT * FROM reports WHERE ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset)

  return {
    items: rows.map(serializeReportListItem),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export function updateReport(userId, id, patch) {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?').get(id, userId)
  if (!existing) throw notFound('Report not found.')

  const title = typeof patch.title === 'string' ? patch.title.trim() : existing.title
  const saved = typeof patch.saved === 'boolean' ? (patch.saved ? 1 : 0) : existing.saved
  db.prepare(
    'UPDATE reports SET title = ?, saved = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  ).run(title, saved, new Date().toISOString(), id, userId)
  return getReportById(id, userId)
}

export function deleteReport(userId, id) {
  const result = getDb().prepare('DELETE FROM reports WHERE id = ? AND user_id = ?').run(id, userId)
  if (result.changes === 0) throw notFound('Report not found.')
}

export function getReportStats(userId) {
  const db = getDb()
  const total = db
    .prepare('SELECT COUNT(*) AS count FROM reports WHERE user_id = ?')
    .get(userId).count
  const saved = db
    .prepare('SELECT COUNT(*) AS count FROM reports WHERE user_id = ? AND saved = 1')
    .get(userId).count
  const repos = db
    .prepare('SELECT COUNT(DISTINCT repo_full_name) AS count FROM reports WHERE user_id = ?')
    .get(userId).count
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const recentAnalyses = db
    .prepare('SELECT COUNT(*) AS count FROM reports WHERE user_id = ? AND created_at >= ?')
    .get(userId, since).count

  return { total, saved, repos, recentAnalyses }
}
