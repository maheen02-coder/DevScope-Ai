import crypto from 'node:crypto'
import { getDb } from '../db.js'

export function getChatHistory(userId, repoFullName, limit = 60) {
  const rows = getDb()
    .prepare(
      `SELECT id, role, content, created_at FROM chat_messages
       WHERE user_id = ? AND repo_full_name = ? COLLATE NOCASE
       ORDER BY created_at ASC, rowid ASC`,
    )
    .all(userId, repoFullName)
  const recent = rows.slice(-limit)
  return recent.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }))
}

export function appendChatMessages(userId, { owner, repo, repoFullName, messages }) {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO chat_messages (id, user_id, owner, repo, repo_full_name, role, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const stored = messages.map((message) => ({
    id: crypto.randomUUID(),
    role: message.role,
    content: message.content,
    createdAt: new Date().toISOString(),
  }))
  const transaction = db.transaction(() => {
    for (const message of stored) {
      insert.run(
        message.id,
        userId,
        owner,
        repo,
        repoFullName,
        message.role,
        message.content,
        message.createdAt,
      )
    }
  })
  transaction()
  return stored
}

export function clearChatHistory(userId, repoFullName) {
  const result = getDb()
    .prepare('DELETE FROM chat_messages WHERE user_id = ? AND repo_full_name = ? COLLATE NOCASE')
    .run(userId, repoFullName)
  return result.changes
}

export function listConversations(userId) {
  const rows = getDb()
    .prepare(
      `SELECT repo_full_name, owner, repo,
         MAX(created_at) AS last_at,
         COUNT(*) AS message_count,
         (SELECT content FROM chat_messages m2
            WHERE m2.user_id = m.user_id AND m2.repo_full_name = m.repo_full_name
            ORDER BY m2.created_at DESC LIMIT 1) AS last_message
       FROM chat_messages m
       WHERE user_id = ?
       GROUP BY repo_full_name
       ORDER BY last_at DESC
       LIMIT 30`,
    )
    .all(userId)
  return rows.map((row) => ({
    repoFullName: row.repo_full_name,
    owner: row.owner,
    repo: row.repo,
    lastAt: row.last_at,
    messageCount: row.message_count,
    lastMessage: String(row.last_message || '').slice(0, 140),
  }))
}

export function countChatMessages(userId) {
  return getDb()
    .prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE user_id = ? AND role = 'user'")
    .get(userId).count
}
