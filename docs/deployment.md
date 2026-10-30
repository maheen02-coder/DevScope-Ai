# Deployment

## Docker

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

The image is multi-stage, runs as the non-root `node` user, and includes a health check against
`/api/health`.

## Docker Compose (local)

```bash
cp .env.example .env          # set JWT_SECRET and GROQ_API_KEY
docker compose up --build
```

Compose sets `COOKIE_SECURE=false` because it serves plain HTTP on `localhost:4000`. Use HTTPS
and `COOKIE_SECURE=true` for anything public. SQLite data lives in the `devscope-data` volume.

## GitHub Container Registry

`.github/workflows/docker-publish.yml` builds and pushes on pushes to `main`, version tags, and
manual runs:

```
ghcr.io/maheen02-coder/devscope-ai:latest
ghcr.io/maheen02-coder/devscope-ai:sha-<short>
```

The workflow uses the built-in `GITHUB_TOKEN`; no extra secret is required. Make the package
public in the repository's package settings if you want anonymous pulls.

## Hosted platforms

Any platform that runs a Node service with a persistent disk works. Use:

- `npm ci && npm run build` as the build command,
- `npm start` as the start command,
- `DATABASE_PATH` pointing at a mounted persistent volume,
- `FRONTEND_ORIGIN` set to the public URL,
- `COOKIE_SECURE=true` and `TRUST_PROXY=true` behind the platform proxy.

SQLite requires a persistent disk. On ephemeral filesystems, point `DATABASE_PATH` at a mounted
volume or the database resets on deploy. A Vercel-style serverless deployment is not a good fit
for the bundled Express + SQLite design without an external database.

## Monitoring

- `/api/health` returns JSON status and returns `503` when the database is unavailable.
- `/metrics` exposes Prometheus metrics. In production, set `METRICS_TOKEN` and scrape with
  `Authorization: Bearer <token>`; without a token the endpoint is hidden in production.
- Import `grafana/devscope-dashboard.json` into Grafana Cloud (free tier) and point a Prometheus
  scrape job at `/metrics`.

## Logs

The server writes structured JSON with pino. In development, logs are pretty-printed. Set
`LOG_LEVEL` to control verbosity. Secrets, cookies, and authorization headers are redacted.
