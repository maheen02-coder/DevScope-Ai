# DevScope AI

[![CI](https://github.com/maheen02-coder/DevScope-Ai/actions/workflows/ci.yml/badge.svg)](https://github.com/maheen02-coder/DevScope-Ai/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/maheen02-coder/DevScope-Ai/branch/main/graph/badge.svg)](https://codecov.io/gh/maheen02-coder/DevScope-Ai)
[![Lint: ESLint + Prettier](https://img.shields.io/badge/lint-ESLint%20%2B%20Prettier-4B32C3)](https://github.com/maheen02-coder/DevScope-Ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node 20.19+](https://img.shields.io/badge/node-%3E%3D20.19-339933?logo=node.js&logoColor=white)](package.json)
[![Docker](https://img.shields.io/badge/ghcr.io-devscope--ai-2496ED?logo=docker&logoColor=white)](https://github.com/maheen02-coder/DevScope-Ai/pkgs/container/devscope-ai)

Repository intelligence for public GitHub projects. DevScope reads a repository the way a
senior engineer would — structure, dependencies, documentation, testing, risk — and produces a
scored, actionable report. Every report is followed by a chat that stays grounded in the actual
files and the latest analysis.

The application is a single Node service: an Express API that also serves the built React SPA.

- **Documentation site:** the `docs/` folder is a Docsify site (GitHub Pages ready) covering
  architecture, the HTTP API, development, deployment, and the security model.
- **API reference:** Swagger UI is served by the app at `/api/docs`, generated from the source
  with `swagger-jsdoc`; the raw spec is at `/api/openapi.json`.
- **Community:** [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md),
  [SECURITY.md](SECURITY.md), and issue/PR templates in `.github/`.

---

## Features

### Accounts and security

- Email + password registration and login with bcrypt hashing (12 rounds by default).
- Stateless sessions in an `HttpOnly`, `SameSite=Lax` cookie; `Secure` by default in production.
- `token_version` invalidation: changing a password signs out every other session.
- Protected API routes and client routes; generic authentication errors that do not reveal
  whether an email exists.
- Optional OAuth sign-in with GitHub and Google via Passport. Accounts are created with an
  unguessable random password hash, existing accounts are linked only by a **verified** email, and
  the OAuth `state` is a signed, 10-minute JWT stored in an `HttpOnly` cookie. Buttons appear only
  when credentials are configured.
- Server-side validation with zod, JSON-only mutations, 128 KB body cap, per-route rate limits,
  origin/CSRF guard, Helmet security headers (including CSP in production), and CORS restricted
  to configured origins plus same-origin.
- Report, chat, and usage ownership enforced in every query — users cannot read or mutate another
  user's data.
- `public/.well-known/security.txt` publishes a private vulnerability-reporting channel.

### GitHub integration

- Live search across public users and repositories through the GitHub REST API.
- Developer profiles with repository filtering, language filtering, sorting, and pagination.
- Repository view with real metadata, README rendering, language breakdown, file tree, and
  read-only file contents.
- Large trees and binary files are handled defensively; repository code is never executed and
  instructions embedded in repository text are treated as untrusted data (prompt injection
  defanging before every AI call).
- Optional `GITHUB_TOKEN` raises the anonymous limit from 60 to 5,000 requests per hour. The UI
  reports the core rate bucket and resets from live GitHub headers.

### AI analysis

- Groq-backed structured analysis using a strict JSON schema (`overall` score, six subscores,
  summary, architecture, strengths, weaknesses, security concerns, recommendations, tech stack).
- Standard and deep modes with different file budgets; the most relevant files are prioritized:
  manifests, README, entry points, routes/services, configuration, then source, tests, and docs.
- Dependencies (`node_modules`, `vendor`, …), build output (`dist`, `build`, `coverage`, …),
  lockfiles, hidden/sensitive files, generated/minified bundles, binaries, and assets are excluded
  before any download.
- Token-aware context budgeting. The request is measured against the selected model's context
  window before it is sent; per-file, README, tree, per-request, and total-call budgets are all
  configurable. Credential-like values are redacted before any content leaves the process.
- Repositories that do not fit in one request are analyzed in prioritized batches, then the batch
  findings are synthesized into one structured report. Every report records which files were
  analyzed, truncated, omitted, or skipped, and why.
- A provider context-length error triggers exactly one retry with a smaller context. If the model
  still cannot fit the repository, the API returns an actionable `422 AI_CONTEXT_TOO_LARGE` with
  the model, limits, estimate, and configuration suggestions — never a silent truncation.
- Groq also reports tokens-per-minute (TPM) violations as HTTP 413. These are detected separately:
  the retry is sized to the limit in the provider message (85% of it), and a persistent TPM cap
  returns `429 AI_RATE_LIMITED` with the observed tokens/minute instead of a misleading
  "context too large" error. Files dropped to fit the cap are reported as `request_token_limit`.
- Malformed model output is retried once per batch/synthesis with a repair prompt, then rejected
  with a clear `502 AI_INVALID_RESPONSE` error instead of storing bad data.
- Reports include metadata (model, mode, batch count, model calls, context retries, estimated
  input tokens, duration, prompt/completion tokens, coverage, files analyzed) and can be saved,
  renamed, filtered, opened, re-run, or deleted.
- Rolling 24-hour quotas enforced server-side; a slot is released automatically when collection
  or the AI call fails. A batched analysis still consumes exactly one slot.
- Dashboard aggregates reports, saved reports, repositories, average score, score trend, language
  distribution, valuation estimates, chat threads, and live system status.

### AI project valuation & pricing

- Every analysis also returns a structured valuation produced in the same Groq call: an estimated
  one-time sale price, the freelance cost to rebuild comparable software from scratch, a
  low/typical/high sale range, a suggested asking price with reasoning, price factors, missing
  features, value-raising improvements, and the assumptions behind the numbers.
- The valuation is validated and normalized server-side (currency codes, numeric parsing, ordered
  low/typical/high range). A report without a valid valuation is rejected like any other malformed
  model response instead of being stored half-complete.
- Each report stores a server-generated disclaimer and `method: "ai-estimate"` alongside the
  analysis. The UI labels every figure as an estimate — not an appraisal, verified market data, or
  a guaranteed sale price — and shows confidence and assumptions so users can judge the numbers.
- The model is instructed to size the build from evidenced scope (modules, languages, tests, docs,
  integrations), state its rate-band assumptions, lower confidence when coverage is thin, and never
  invent marketplace listings, buyers, URLs, or citations. No live marketplace API is used.
- Saved reports and the report list show the suggested asking price and keep the full valuation;
  the dashboard aggregates average suggested ask, average rebuild cost, combined low/high range,
  and the highest-ask report. Mixed-currency workspaces are not summed together.
- Chat grounding includes the latest valuation explicitly marked as an AI estimate.

### Report workflow: notes, export, comparison, sharing

- Private annotations: each report can carry up to 2,000-character notes, stored per user with
  ownership checks. Notes are never included in exports, share links, or badges.
- Markdown export: any report can be downloaded as a Markdown file built entirely in the browser
  (no AI call, no server round-trip) with metadata, scores, summary, architecture, architecture map,
  onboarding guide, valuation, and findings with file citations.
- Side-by-side comparison: pick two or three reports to compare scores, valuation figures, files
  analyzed, depth, language, and complexity. Everything is computed from stored reports, so there
  is no additional AI cost. Mixed currencies are displayed per report and never converted.
- Expiring share links: create a read-only, unguessable link (`/s/<token>`, 1–365 days, default 30)
  that anyone can open without an account. Exactly one link is active per report; creating a new
  link revokes the previous one, and links can be revoked at any time. Shared views expose only
  report content — never notes, email, account details, or chat history — and are served with
  `Cache-Control: no-store`.
- Public score badge: every active share link also exposes an SVG badge endpoint for README use,
  with XML-escaped text and score-based colors. The share dialog provides the ready-to-paste
  Markdown snippet.

### Repository insights, citations, and onboarding

- Repository health signals: every report stores deterministic signals computed from the GitHub
  metadata already fetched (license, activity recency, archived/fork flags, stars, forks, open
  issues). No extra API or AI cost.
- Dependency & license audit: manifests (`package.json`, `requirements.txt`, `pyproject.toml`,
  `go.mod`, `Cargo.toml`, `composer.json`, `Gemfile`, `pom.xml`) are parsed from the fetched files,
  with per-ecosystem runtime/development counts, version pinning, declared license, lockfile
  presence (sampled from the excluded tree entries), and issues such as a missing lockfile or
  unpinned dependencies. Manifest contents are parsed as text and never executed.
- File-level citations: strengths, weaknesses, security concerns, and recommendations can carry up
  to five cited paths. The server drops any citation that does not match a file actually analyzed,
  so the report never shows invented paths. Citations appear as chips in the analysis page, shared
  reports, and the Markdown export.
- Onboarding guide: the same AI call returns prerequisites, ordered setup steps, and key files to
  read first; the model is instructed to rely on the README, manifests, and configuration only.
- Architecture map: the same AI call also returns 2–8 architecture layers (name, responsibility,
  evidenced components), rendered as a dependency-free vertical map on the analysis and shared
  report pages.

### AI chat

- One conversation per repository, persisted with the user account.
- Answers are grounded in the repository tree, README, selected source files, and the latest
  analysis for that repository.
- Concise/detailed answer styles from user preferences; previous analysis is included explicitly
  in the prompt context.
- Chat history survives reload, supports clearing, and is isolated per user.
- Rolling 24-hour chat quota enforced server-side, with automatic quota release on AI failure.
- **Real-time transport:** the same grounded turn is available over Socket.IO at `/socket.io`.
  Sockets authenticate with the session cookie, join per-user/per-repository rooms
  (`chat:<userId>:<owner/repo>`), and exchange `chat:send`/`chat:message` events with
  acknowledgement payloads. The UI shows a live indicator while connected and falls back to the
  REST endpoint automatically when the socket is unavailable.

### Analytics

- A Chart.js analytics page (`/analytics`) visualizes the user's own workspace: score trend over
  time, language distribution, rolling quota usage (used vs. remaining), and the saved/unsaved
  report split. Everything is computed from stored dashboard data — no extra AI calls.

### Rate limits

- A live rate-limit dashboard (`/limits`) reads `/api/dashboard/rate-limits`: rolling 24-hour
  analysis and chat quotas with reset countdowns, hourly quota consumption, every configured
  express-rate-limit policy, process-wide throttle counters, and the latest GitHub API budget.
- Quota denials (`QUOTA_EXCEEDED`) and endpoint throttles (`RATE_LIMITED`) are counted separately.
  Throttle counters live in memory and reset with the API process; quotas persist in SQLite.
- The policies are defined once in `server/middleware/security.js` and served from that same
  definition, so the dashboard always matches enforcement.

### Observability

- Structured JSON logs with pino and pino-http, including a request id echoed in `X-Request-Id`.
  Cookies, authorization headers, `Set-Cookie`, passwords, and token/key/secret fields are
  redacted. Pretty output locally; JSON in production.
- Prometheus metrics at `/api/metrics`, prefixed `devscope_` (request counts/latency by route and
  status, analyses, chat turns, users, reports, chat messages, active shares). Protect the
  endpoint with `METRICS_TOKEN`; without a token it is hidden (404) in production.
- `/api/health` reports AI/GitHub configuration and the active log level/metrics posture.
- `grafana/devscope-dashboard.json` is a ready-to-import Grafana Cloud dashboard for those metrics.

### Workspace controls

- Profile display name and analysis/chat preferences.
- Password change and full data controls: delete reports, delete chat history, delete all
  workspace data, or delete the account (password confirmation required).
- Responsive dark UI with a distinctive visual identity, empty/loading/error states, accessible
  contrast, keyboard-friendly dialogs, and subtle motion.

---

## Technology

| Layer        | Stack                                                                       |
| ------------ | --------------------------------------------------------------------------- |
| Frontend     | React 19, Vite 8, React Router 7, TanStack Query 5, lucide-react             |
| Charts       | Chart.js + react-chartjs-2                                                   |
| Markdown     | react-markdown + remark-gfm                                                  |
| API          | Express 5 (ESM), Node 20.19+                                                 |
| Realtime     | Socket.IO (cookie-authenticated rooms)                                       |
| Database     | SQLite via better-sqlite3 (WAL mode)                                         |
| Auth         | bcryptjs, JWT HS256 cookie sessions, Passport (GitHub, Google)               |
| AI           | Groq SDK (OpenAI-compatible endpoint)                                        |
| GitHub       | GitHub REST API v2022-11-28 with in-memory caching                           |
| Security     | Helmet, CORS, express-rate-limit, zod, custom CSRF/origin guards             |
| Observability| pino + pino-http logs, prom-client metrics, Grafana Cloud dashboard          |
| API docs     | swagger-jsdoc + swagger-ui-express                                           |
| Tests        | Vitest 5, Supertest, Testing Library + jsdom, V8 coverage                    |
| Tooling      | ESLint, Prettier, GitHub Actions, Docker, self-hosted Inter + JetBrains Mono |

---

## Requirements

- Node.js **20.19 or newer** (verified on Node 24).
- A Groq API key for AI analysis and chat: <https://console.groq.com/keys>.
- Optional GitHub token for higher rate limits: a fine-grained token with public repository read
  access is sufficient.

---

## Quick start

```bash
npm ci
cp .env.example .env
# Edit .env: set JWT_SECRET and GROQ_API_KEY (see below)
npm run dev
```

`npm run dev` starts the API with `node --watch` on port 4000 and Vite on port 5173. Open
<http://localhost:5173>. The Vite dev server proxies `/api` to the API.

Generate a suitable secret:

```bash
openssl rand -hex 48
```

### Production build and run

```bash
npm run build          # writes ./dist
NODE_ENV=production npm start
```

The API serves `dist/` and all routes on `PORT` (default 4000). Open <http://localhost:4000>.

---

## Environment variables

Copy `.env.example` to `.env`. `.env` is git-ignored and must never be committed.

| Variable               | Required | Default                  | Purpose                                                                 |
| ---------------------- | -------- | ------------------------ | ----------------------------------------------------------------------- |
| `NODE_ENV`             | prod     | `development`            | Enables production security behavior and strict secret checks.          |
| `PORT`                 | no       | `4000`                   | HTTP port.                                                              |
| `JWT_SECRET`           | prod     | ephemeral in dev         | Session signing key. **Must be 32+ characters in production.**          |
| `JWT_EXPIRES_IN`       | no       | `7d`                     | Session lifetime (e.g. `12h`, `7d`).                                    |
| `COOKIE_SECURE`        | no       | `true` in production     | Requires HTTPS for the session cookie. Disable only for local HTTP.     |
| `FRONTEND_ORIGIN`      | no       | `http://localhost:5173,http://localhost:4000` | Comma-separated allowed browser origins for CORS/CSRF checks. |
| `TRUST_PROXY`          | no       | `true` in production     | Trust `X-Forwarded-*` from a reverse proxy.                             |
| `DATABASE_PATH`        | no       | `./data/devscope.db`     | SQLite file; the directory is created automatically.                    |
| `DIST_PATH`            | no       | `./dist`                 | Built SPA directory served by Express.                                  |
| `GITHUB_TOKEN`         | no       | empty                    | GitHub token; raises limits from 60 to 5,000 req/h.                     |
| `GITHUB_API_BASE`      | no       | `https://api.github.com` | Override API base (tests/mocks only).                                   |
| `GROQ_API_KEY`         | yes\*    | empty                    | Groq key. Without it analysis and chat return `503 AI_NOT_CONFIGURED`.  |
| `GROQ_MODEL`           | no       | `openai/gpt-oss-120b`    | Groq model id; must be enabled for your account.                        |
| `GROQ_API_BASE`        | no       | `https://api.groq.com`   | API root; the SDK appends `/openai/v1` (tests/mocks only).              |
| `ANALYSIS_DAILY_LIMIT` | no       | `10`                     | Analyses per user per rolling 24 hours.                                 |
| `CHAT_DAILY_LIMIT`     | no       | `60`                     | Chat messages per user per rolling 24 hours.                            |
| `AI_TIMEOUT_MS`        | no       | `90000`                  | Timeout for a single AI request.                                        |
| `AI_CONTEXT_WINDOW`    | no       | model registry           | Real context window of `GROQ_MODEL`; override when using an unlisted model. |
| `AI_MAX_INPUT_TOKENS`  | no       | derived (≤ `48,000`)     | Input-token cap per AI request, never above the model window minus output reserve. Set it at or below your Groq tokens-per-minute allowance to batch deliberately instead of relying on the 413 retry. |
| `AI_MAX_TOTAL_INPUT_TOKENS` | no  | input × (`batches` + 1)  | Total input budget across batch and synthesis calls.                    |
| `AI_MAX_OUTPUT_TOKENS` | no       | `3200`                   | Completion-token cap per request.                                       |
| `AI_MAX_FILE_TOKENS`   | no       | `3000`                   | Per-file token cap; standard mode further caps at 2,500.                |
| `AI_MAX_FILES`         | no       | `18`                     | Files selected per analysis; standard mode further caps at 10.          |
| `AI_MAX_README_TOKENS` | no       | `4000`                   | README token cap; standard mode further caps at 3,000.                  |
| `AI_MAX_BATCHES`       | no       | `3`                      | Maximum batches per analysis; standard mode further caps at 2.          |
| `BCRYPT_ROUNDS`        | no       | `12` (`4` in tests)      | Password hashing cost.                                                  |
| `RATE_LIMIT_ENABLED`   | no       | `true` (`false` in tests)| Toggle HTTP rate limiting.                                              |
| `LOG_LEVEL`            | no       | `debug` (`silent` in tests) | pino log level (`trace`…`fatal`).                                    |
| `METRICS_TOKEN`        | no       | empty                    | Bearer token for `/api/metrics`. Without it the endpoint is hidden in production. |
| `OAUTH_BASE_URL`       | OAuth    | `http://localhost:4000`  | Public API origin used to build OAuth callback URLs.                    |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | no | empty | GitHub OAuth app credentials; enables the GitHub sign-in button. |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | no | empty | Google OAuth credentials; enables the Google sign-in button.     |

\* Required for real AI responses. The application and all other features run without it.

Model IDs vary by Groq account. `GET https://api.groq.com/openai/v1/models` lists the models your key can use;
if the default is unavailable, set `GROQ_MODEL` to one from that list and restart the API.

Input budgets are derived from a built-in context-window registry for common Groq models. If you
use an unlisted model, set `AI_CONTEXT_WINDOW` to its real window so the budgeting logic matches
the provider. Token counts are conservative estimates (code and punctuation tokenize worse than
plain English), not a tokenizer replacement.

---

## Scripts

| Script             | Description                                                              |
| ------------------ | ------------------------------------------------------------------------ |
| `npm run dev`      | Start API (`4000`) and Vite (`5173`) together.                           |
| `npm run dev:api`  | API only, with file watching.                                            |
| `npm run dev:web`  | Vite only.                                                               |
| `npm run build`    | Production SPA build to `dist/`.                                         |
| `npm start`        | Run the production API and serve `dist/`.                                |
| `npm run lint`     | ESLint over the whole repository.                                        |
| `npm run format`   | Prettier: rewrite every file to the project style.                       |
| `npm run format:check` | Prettier: fail if any file is unformatted (used in CI).              |
| `npm test`         | Vitest suite (API integration + frontend unit tests).                    |
| `npm run test:watch` | Vitest in watch mode.                                                  |
| `npm run test:coverage` | Vitest with V8 coverage → `coverage/lcov.info` for Codecov.         |
| `npm run mock:groq`| Local OpenAI-compatible mock for offline pipeline checks (see below).     |
| `npm run check`    | Format check + lint + tests + production build.                          |

### Tests

The automated suite runs against the real application with an in-memory SQLite database and a
local mock of the GitHub and Groq HTTP APIs. It covers:

- registration, login, cookie flags, duplicate accounts, validation, logout, password rotation;
- CORS/CSRF origin guards, JSON content-type checks, body limits, 404 JSON, health leakage;
- GitHub search, profiles, repositories, README, languages, tree filtering, file reads,
  traversal rejection, missing resources, rate-limit reporting;
- analysis creation, prompt contents, quota enforcement/release, invalid AI output, report
  ownership isolation, save/rename/filter/delete;
- repository health signals and dependency/license audit, citation sanitization against analyzed
  files, onboarding steps, and architecture layers;
- large-repository batching and synthesis, per-file truncation, omitted/skipped coverage metadata,
  dependency/build/sensitive/binary exclusions, and credential redaction;
- one-shot context-length retry, persistent context errors returning an actionable `422`, and
  configurations whose limit cannot hold the instructions;
- tokens-per-minute 413s: one retry sized to the reported limit, `request_token_limit` coverage,
  and a persistent cap mapped to `429 AI_RATE_LIMITED` with quota release;
- valuation persistence and list/dashboard aggregates, normalization of messy currency/range
  output, and rejection with quota release when the model omits a valuation;
- private notes (create/list/delete, validation, ownership isolation), share-link lifecycle
  (single active link, replacement, revocation, expiry), public payload privacy (no notes or
  account data), badge SVG output, and Markdown export rendering;
- chat grounding, previous-analysis context (including the valuation estimate), persistence,
  ownership isolation, clearing, quota enforcement/release;
- settings updates, data deletion scopes, account deletion with password confirmation;
- prompt-injection defanging (including batch findings) and UI primitives;
- health/observability payloads, request-id propagation, OpenAPI generation, Swagger UI CSP,
  and Prometheus metrics output;
- OAuth provider discovery, unconfigured/unknown provider handling, OAuth account creation and
  reuse, verified-email linking, and rejection of unverified emails;
- Socket.IO authentication, room broadcast with acknowledgement, and validation errors returned
  over the socket.

The suite intentionally uses local mocks so it is deterministic and does not consume GitHub or
Groq quotas. A separate browser pass was run against the production build with **real GitHub**
data and the mock Groq upstream. The AI pipeline was also verified end-to-end against the **live
Groq API** (one analysis and one chat turn, real token usage and quotas) on 2026-10-28, and again
after the token-budget work: `octocat/Hello-World` (README-only) and `expressjs/express` (large,
177 candidate files) both completed against the live API on the same day, including a real
tokens-per-minute 413 followed by the single smaller-context retry.

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request using free public-repo runners:

1. `npm ci`
2. `npm run format:check`
3. `npm run lint`
4. `npm run test:coverage` → uploads `coverage/lcov.info` to Codecov (OIDC, no secret needed)
5. `npm run build`

`.github/workflows/docker-publish.yml` builds and pushes `ghcr.io/maheen02-coder/devscope-ai`
on `main`, version tags, and manual dispatch.

### Optional offline AI mock

If you want to exercise analysis/chat end-to-end without a Groq key:

```bash
npm run mock:groq   # listens on http://127.0.0.1:4020
# in another shell:
GROQ_API_KEY=mock-key GROQ_API_BASE=http://127.0.0.1:4020 npm run dev
```

The mock returns clearly labelled sample analysis JSON and a Markdown chat reply. It exists only
for development; production must use a real `GROQ_API_KEY`.

---

## API overview

All routes are under `/api`.

| Method | Route                             | Description                                    |
| ------ | --------------------------------- | ---------------------------------------------- |
| GET    | `/health`                         | Status, AI/GitHub configuration, quotas.       |
| GET    | `/metrics`                        | Prometheus metrics (bearer token; hidden in production without `METRICS_TOKEN`). |
| GET    | `/openapi.json`                   | OpenAPI 3.0 specification.                     |
| GET    | `/docs`                           | Swagger UI for the API.                        |
| POST   | `/auth/register`, `/auth/login`   | Create account / sign in (sets cookie).        |
| POST   | `/auth/logout`                    | Clear session.                                 |
| GET    | `/auth/me`                        | Current user.                                  |
| GET    | `/auth/providers`                 | Configured OAuth providers.                    |
| GET    | `/auth/oauth/:provider`           | Start OAuth sign-in (`github` or `google`).    |
| GET    | `/auth/oauth/:provider/callback`  | OAuth callback; sets session cookie or redirects with an error. |
| PATCH  | `/users/me`                       | Display name and preferences.                  |
| POST   | `/users/me/password`              | Change password (invalidates other sessions).  |
| DELETE | `/users/me/data`                  | Delete `reports`, `chats`, or `all` workspace data. |
| DELETE | `/users/me`                       | Delete account (requires password).            |
| GET    | `/github/status`                  | Cached core rate-limit status.                 |
| GET    | `/github/search/users`            | Search public users (`?q=`).                   |
| GET    | `/github/search/repositories`     | Search public repositories (`?q=`).            |
| GET    | `/github/users/:username`         | Public profile.                                |
| GET    | `/github/users/:username/repos`   | Public repositories.                           |
| GET    | `/github/repos/:owner/:repo`      | Metadata, languages, and README.               |
| GET    | `/github/repos/:owner/:repo/tree` | Filtered file tree.                            |
| GET    | `/github/repos/:owner/:repo/file` | Read-only file contents (`?path=&ref=`).       |
| POST   | `/analyze`                        | Run an analysis (consumes one quota slot).     |
| GET    | `/reports`, `/reports/:id`        | List / read owned analyses.                    |
| PATCH  | `/reports/:id`                    | Rename or toggle saved.                        |
| DELETE | `/reports/:id`                    | Delete an owned analysis.                      |
| GET    | `/reports/:id/notes`              | List private notes on an owned report.         |
| POST   | `/reports/:id/notes`              | Add a note (1–2,000 characters).               |
| DELETE | `/reports/:id/notes/:noteId`      | Delete a note.                                 |
| GET    | `/reports/:id/share`              | Current active share link, or `null`.          |
| POST   | `/reports/:id/share`              | Create/replace a link (`expiresInDays` 1–365). |
| DELETE | `/reports/:id/share`              | Revoke the active share link.                  |
| GET    | `/public/reports/:token`          | Read-only shared report (no auth, `no-store`). |
| GET    | `/public/reports/:token/badge.svg`| Score badge SVG (no auth, `no-store`).         |
| POST   | `/chat/message`                   | Send a grounded message.                       |
| GET    | `/chat/history`, `/chat/conversations` | History and conversation list.            |
| DELETE | `/chat/history`                   | Clear history for a repository.                |
| GET    | `/dashboard`, `/dashboard/usage`  | Aggregates and rolling quota summary.          |
| GET    | `/dashboard/rate-limits`          | Quotas, endpoint policies, throttles, GitHub budget. |

Errors are JSON: `{ "error": { "code": "...", "message": "...", "details": ... } }`.

The interactive reference lives at `/api/docs` (Swagger UI). The spec is generated at startup by
`swagger-jsdoc` from the route annotations, so it always matches the running code. The same
routes are described in prose in [`docs/api.md`](docs/api.md).

---

## Data and privacy

- SQLite stores users, reports, chat messages, quota events, share links, notes, and OAuth account
  links. WAL mode is enabled.
- No repository code is executed, no GitHub credentials are requested from users, and no content
  is sent anywhere except GitHub (to read the repository) and Groq (to analyze the collected
  context).
- Credential-like values (private keys, provider tokens, JWTs, and key/secret/password
  assignments) are redacted from README and file contents before prompting. Sensitive paths
  (`.env*`, credential stores, private keys, `*.tfvars`, …) are never fetched for analysis.
- Private notes are stored per report and per user. They are never included in Markdown exports,
  share links, badges, or chat.
- Share links are random 192-bit tokens. The public view returns only report content (scores,
  summary, architecture, findings, valuation) with `Cache-Control: no-store`; it omits the report
  id, owner id, email, notes, saved state, and chat. Links expire (default 30 days), can be revoked,
  and only one is active per report — creating a new link revokes the previous one. Anyone holding
  the URL can read the shared snapshot until it expires.
- Deleting a report or account also deletes its notes and share links (foreign keys with
  `ON DELETE CASCADE`).
- Deleting an account removes its reports, chats, usage events, and sessions immediately.

---

## Deployment

### Docker

```bash
docker build -t devscope-ai .
docker run -d --name devscope \
  -p 4000:4000 \
  -e JWT_SECRET="$(openssl rand -hex 48)" \
  -e GROQ_API_KEY="your-real-key" \
  -e GITHUB_TOKEN="optional-token" \
  -e COOKIE_SECURE=true \
  -v devscope-data:/app/data \
  devscope-ai
```

Put the container behind a TLS-terminating proxy (Caddy, nginx, a cloud load balancer). Keep
`COOKIE_SECURE=true`, set `TRUST_PROXY=true` when the proxy forwards client IPs, and expose only
the proxy publicly. Persist `/app/data` or every restart loses accounts and reports.

### Docker Compose (development)

```bash
cp .env.example .env   # set JWT_SECRET and GROQ_API_KEY
docker compose up --build
```

`docker-compose.yml` builds the image, loads `.env`, mounts a named `devscope-data` volume at
`/app/data`, publishes port 4000, and health-checks `/api/health`. It sets `COOKIE_SECURE=false`
for local HTTP; TLS is the reverse proxy's job in production.

### Container image

CI publishes the image to the GitHub Container Registry on every push to `main` and on version
tags:

```bash
docker pull ghcr.io/maheen02-coder/devscope-ai:latest
```

Images are multi-arch-built with Buildx and cached with the GitHub Actions cache. The registry is
free for public images.

### Observability

- Set `METRICS_TOKEN` in production and scrape `/api/metrics` with a Prometheus-compatible agent
  (Grafana Alloy, the Grafana Agent, or Prometheus itself).
- Import [`grafana/devscope-dashboard.json`](grafana/devscope-dashboard.json) into a free Grafana
  Cloud stack: Dashboards → New → Import → upload the file, then pick your Prometheus datasource.
  It graphs request rate by status, p50/p95 latency, analysis and chat throughput, stored-data
  counts, CPU, and memory.
- Logs are JSON on stdout; forward them with your platform's log driver. Sentry-style APM is not
  required.

### Docs site

The `docs/` directory is a [Docsify](https://docsify.js.org) site (no build step, all CDN assets):

```bash
npx serve docs
```

To publish on GitHub Pages, enable Pages for the repository and point it at the `/docs` folder
(or run `docsify serve docs` locally). Add the resulting URL next to the badges when it is live.

### Vercel

The front end deploys to Vercel as a static SPA build, but the API and SQLite store need a Node
host with a persistent disk (Render, Fly.io, Railway, or a VPS). Set `VITE_API_BASE_URL` at build
time so the SPA reaches the API origin, and keep the API's `FRONTEND_ORIGIN` in sync with the
Vercel domain. No demo URL is published from this repository.

### Manual

1. Provision Node 20.19+ and a persistent disk.
2. Install with `npm ci && npm run build`.
3. Set the production environment variables (`NODE_ENV=production`, `JWT_SECRET`,
   `GROQ_API_KEY`, `DATABASE_PATH`, `COOKIE_SECURE=true`).
4. Run `npm start` under a process supervisor (systemd, PM2, container orchestrator).
5. Terminate TLS at a reverse proxy and forward to `PORT`.
6. Back up the SQLite file (and its `-wal`/`-shm` siblings) on a schedule.

### Production checklist

- [ ] `JWT_SECRET` is unique, 32+ characters, and stored in a secret manager.
- [ ] TLS is enabled and `COOKIE_SECURE=true`.
- [ ] `FRONTEND_ORIGIN` lists the exact public origin(s).
- [ ] `GROQ_API_KEY` is configured; `/api/health` reports `ai.configured: true`.
- [ ] `GITHUB_TOKEN` is configured for reliable repository browsing.
- [ ] `DATABASE_PATH` points at persistent storage and backups are scheduled.
- [ ] Rate limits are enabled and adjusted for expected traffic.
- [ ] Logs do not contain secrets; the app never logs request bodies or credentials.
- [ ] `METRICS_TOKEN` is set (or `/api/metrics` stays hidden) and metrics are scraped.
- [ ] OAuth callback URLs match `OAUTH_BASE_URL` if GitHub/Google sign-in is enabled.
- [ ] `LOG_LEVEL=info` (or higher) in production.

---

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the checks CI
runs, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations. Open an issue with
one of the templates in `.github/ISSUE_TEMPLATE/`, then send a pull request. Report security
issues privately via [SECURITY.md](SECURITY.md) — never in a public issue.

---

## Known limitations

- **Email management and password reset are not implemented.** Email verification, "forgot
  password", and email changes require an outbound mail provider; the settings page states this.
- **Single-node SQLite.** Horizontal scaling would require moving to a shared database; quotas and
  caches are process-local/tabular in SQLite.
- **Analysis budget.** Standard/deep modes read a prioritized subset of files, not an entire large
  monorepo. When the selection exceeds the model budget, files are analyzed in batches and the
  report lists every analyzed, truncated, omitted, and skipped file with the reason. A repository
  that cannot fit even after batching/budgets returns `422 AI_CONTEXT_TOO_LARGE` with concrete
  configuration guidance; it is not silently truncated.
- **Groq tokens per minute.** Free/low-tier keys cap tokens per minute (for example 8,000 TPM for
  `openai/gpt-oss-120b`), well below the model's context window. A first request may be rejected
  with 413; the analysis retries once within the reported cap and reports the files it had to drop.
  If the cap persists, the API returns `429 AI_RATE_LIMITED`. On TPM-constrained accounts, set
  `AI_MAX_INPUT_TOKENS` near the allowance so batching and synthesis are used from the first call.
- **GitHub quota.** Anonymous usage is limited to 60 core requests per hour and search has its own
  smaller bucket. A token is strongly recommended for production.
- **AI availability.** Analysis and chat require a valid Groq key; without one they return a clear
  503 configuration error rather than fake content.
- **Model availability varies by Groq account.** The default `openai/gpt-oss-120b` must be enabled
  for your key. If it is not, pick a model from `GET /openai/v1/models` and set `GROQ_MODEL`.
  The live analysis and chat paths were verified against Groq on 2026-10-28.
- **Valuations are AI estimates, not appraisals.** Prices are generated from the model's general
  knowledge of typical software markets plus the analyzed repository scope. No live marketplace,
  acquisition, or freelance-rate API is queried, and no listing, buyer, or citation is invented by
  the server. Actual sale prices depend on buyers, negotiation, IP ownership, due diligence, and an
  independent code review. Reports with partial coverage or thin evidence should be treated as low
  confidence. Use the stated assumptions and factors as a discussion aid, not a valuation report.

---

## License

[MIT](LICENSE) © 2026 DevScope AI contributors.
