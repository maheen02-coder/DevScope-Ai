# Development

## Requirements

- Node.js 20.19+ (the project is tested on Node 24).
- npm 10+.

## Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

The API runs on port 4000; Vite runs on 5173 and proxies `/api`. Open <http://localhost:5173>.

## Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | API + Vite together |
| `npm run dev:api` | API with `node --watch` |
| `npm run dev:web` | Vite only |
| `npm run build` | Production SPA build to `dist/` |
| `npm start` | Serve the API and built SPA |
| `npm run lint` | ESLint over the repository |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (used by CI) |
| `npm test` | Full Vitest suite |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage run with `lcov` output in `coverage/` |
| `npm run mock:groq` | Local OpenAI-compatible mock on port 4020 |
| `npm run check` | Format check + lint + tests + build |

## Tests

The suite uses Vitest with Supertest and React Testing Library. GitHub and Groq are replaced by
local mocks in `server/tests/mock-upstream.js`, so tests are deterministic and consume no quotas.
Coverage is collected with `@vitest/coverage-v8` and uploaded to Codecov by CI.

Run a focused file:

```bash
npx vitest run server/tests/auth.test.js
```

## Offline AI mock

```bash
npm run mock:groq
GROQ_API_KEY=mock-key GROQ_API_BASE=http://127.0.0.1:4020 npm run dev
```

The mock supports analysis, batching, chat, and a citation-invalid mode used by tests.

## Code style

- Plain JavaScript and JSX — no TypeScript.
- Prettier: no semicolons, single quotes, 100-column lines, trailing commas.
- ESLint: recommended rules plus React Hooks and React Refresh.

## Real-time chat

Socket.IO is attached to the same HTTP server at `/socket.io`. Clients authenticate with the
session cookie and join a per-repository room. The REST endpoints remain the source of truth;
Socket.IO broadcasts stored messages to the other tabs of the same user.

## Analytics

`/analytics` renders charts from `/api/dashboard` using Chart.js. No third-party analytics service
is involved.
