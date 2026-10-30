import crypto from 'node:crypto'
import { getDb } from '../db.js'
import { notFound } from '../lib/errors.js'

function assertReportOwnership(userId, reportId) {
  const row = getDb()
    .prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?')
    .get(reportId, userId)
  if (!row) throw notFound('Report not found.')
}

function serializeNote(row) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
  }
}

export function listNotes(userId, reportId) {
  assertReportOwnership(userId, reportId)
  return getDb()
    .prepare(
      'SELECT id, body, created_at FROM report_notes WHERE report_id = ? AND user_id = ? ORDER BY created_at DESC',
    )
    .all(reportId, userId)
    .map(serializeNote)
}

export function createNote(userId, reportId, body) {
  assertReportOwnership(userId, reportId)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  getDb()
    .prepare(
      'INSERT INTO report_notes (id, report_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, reportId, userId, body, now)
  return { id, body, createdAt: now }
}

export function deleteNote(userId, reportId, noteId) {
  assertReportOwnership(userId, reportId)
  const result = getDb()
    .prepare('DELETE FROM report_notes WHERE id = ? AND report_id = ? AND user_id = ?')
    .run(noteId, reportId, userId)
  if (result.changes === 0) throw notFound('Note not found.')
}
