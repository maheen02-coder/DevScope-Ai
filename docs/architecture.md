# Architecture

## Runtime shape

```
Browser (React SPA)
   │  fetch /api/* (session cookie)
   ▼
Express app ── helmet, CORS, JSON guards, CSRF origin guard, rate limits
   ├── /api/auth         registration, login, OAuth
   ├── /api/github       read-only GitHub proxy
   ├── /api/analyze      AI analysis pipeline
   ├── /api/chat         grounded chat + Socket.IO
   ├── /api/reports      saved reports, notes, shares
   ├── /api/dashboard    aggregates and quotas
   ├── /api/public       shared reports and badges
   ├── /api/metrics      Prometheus metrics
   └── /api/docs         Swagger UI + OpenAPI JSON
   │
   ├── SQLite (better-sqlite3, WAL)
   ├── GitHub REST API
   └── Groq chat completions API
```

In production the same process serves `dist/` and falls back to `index.html` for client routes.

## Server modules

| Module | Responsibility |
| ------ | -------------- |
| `server/config.js` | Environment parsing, defaults, production secret checks. |
| `server/db.js` | SQLite schema and initialization (WAL, foreign keys). |
| `server/routes/` | Thin HTTP layer: validation, quota, service calls, responses. |
| `server/services/github.js` | GitHub fetching, caching, repository context selection. |
| `server/services/ai.js` | Prompt construction, schema validation, batching, retries, citation sanitization. |
| `server/services/reports.js` | Report persistence and aggregates. |
| `server/services/chat.js` | Chat history persistence. |
| `server/services/shares.js` | Share-link lifecycle and public payloads. |
| `server/services/usage.js` | Rolling 24-hour quotas. |
| `server/lib/` | Sessions, validation, token estimation, redaction, insights, errors. |
| `server/openapi.js` + `openapi.paths.js` | swagger-jsdoc specification. |

## Client modules

| Module | Responsibility |
| ------ | -------------- |
| `src/pages/` | Route-level screens. |
| `src/components/` | Reusable UI: findings, citations, architecture map, onboarding, dialogs. |
| `src/lib/` | API client, formatting, Markdown export, Socket.IO client. |
| `src/context/` | Authentication and toast providers. |
| `src/styles/` | Design tokens and page styles. |

## Analysis pipeline

1. Fetch repository metadata, tree, languages, and README from GitHub.
2. Exclude dependencies, build output, lockfiles, binaries, and sensitive paths.
3. Rank candidate files by relevance and fit them into per-file, per-request, and total token
   budgets.
4. Defang prompt-injection patterns and redact credential-like values.
5. Ask Groq for strict JSON; validate with zod and normalise it.
6. If the repository is too large, analyze prioritized batches and synthesize the findings.
7. Sanitize file citations so only analyzed paths survive; attach deterministic health and
   dependency insights; persist the report.

## Data model

`users`, `reports`, `usage_events`, `chat_messages`, `report_notes`, `report_shares`, and
`oauth_accounts`. Every user-owned table is queried by `user_id`; notes and shares cascade on
report/account deletion.
