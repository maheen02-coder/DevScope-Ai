# DevScope AI documentation

DevScope AI reads a public GitHub repository the way a senior engineer would — structure,
dependencies, documentation, testing, risk — and produces a scored, actionable report with a
grounded follow-up chat.

It is one Node service: an Express API that also serves the built React single-page application.

## Quick start

```bash
npm ci
cp .env.example .env      # set JWT_SECRET and GROQ_API_KEY
npm run dev               # API on :4000, Vite on :5173
```

Open <http://localhost:5173>. The API is documented at <http://localhost:4000/api/docs>.

## What is in the docs

- [Architecture](architecture.md) — how the API, services, database, and SPA fit together.
- [API reference](api.md) — authentication, error format, and the generated OpenAPI spec.
- [Development](development.md) — scripts, tests, mocks, formatting, and linting.
- [Deployment](deployment.md) — Docker, Compose, GitHub Container Registry, and hosted options.
- [Security](security.md) — session model, CSRF/CORS, rate limits, and reporting vulnerabilities.

## Feature highlights

- Live GitHub search, profiles, repository browsing, and read-only file views.
- Groq-backed structured analysis with token budgeting, batching, and prompt-injection defanging.
- Score subscores, architecture layers, file citations, onboarding steps, health signals,
  dependency/license audit, and an AI project valuation.
- Saved reports, private notes, Markdown export, comparisons, expiring share links, and SVG badges.
- Grounded repository chat with persistence and quotas.
- Optional OAuth sign-in with GitHub and Google.
- Real-time chat updates over Socket.IO and an analytics dashboard with Chart.js.

The main [README](https://github.com/maheen02-coder/DevScope-Ai#readme) has the complete feature
list and environment-variable reference.
