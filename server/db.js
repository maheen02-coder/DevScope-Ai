import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  preferences TEXT NOT NULL DEFAULT '{}',
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  html_url TEXT,
  language TEXT,
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  default_branch TEXT,
  depth TEXT NOT NULL DEFAULT 'standard',
  model TEXT,
  files_analyzed INTEGER NOT NULL DEFAULT 0,
  analysis TEXT NOT NULL,
  saved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_user_created
  ON reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_user_repo
  ON reports (user_id, repo_full_name, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  repo_full_name TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_user_kind_created
  ON usage_events (user_id, kind, created_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_user_repo_created
  ON chat_messages (user_id, repo_full_name, created_at);

CREATE TABLE IF NOT EXISTS report_notes (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_notes_report_created
  ON report_notes (report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_user
  ON oauth_accounts (user_id);

CREATE TABLE IF NOT EXISTS report_shares (
  token TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_shares_report
  ON report_shares (report_id, revoked_at);
`

let db = null

export function initDb(databasePath) {
  if (db) {
    db.close()
    db = null
  }
  if (databasePath !== ':memory:') {
    const resolved = path.resolve(databasePath)
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    databasePath = resolved
  }
  db = new Database(databasePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schema)
  return db
}

export function getDb() {
  if (!db) throw new Error('Database has not been initialized.')
  return db
}

export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}
