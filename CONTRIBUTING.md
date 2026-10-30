# Contributing to DevScope AI

Thanks for helping improve DevScope AI. This project is an Express API plus a React SPA in a
single Node service, so most changes touch `server/` and `src/` together.

## Quick start

```bash
npm ci
cp .env.example .env      # add JWT_SECRET and GROQ_API_KEY
npm run dev               # API on :4000, Vite on :5173
```

Neither a Groq key nor a GitHub token is required for the test suite. `npm run mock:groq` starts a
local OpenAI-compatible mock when you want to exercise analysis and chat offline.

## Before opening a pull request

Run the same checks CI runs:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

`npm run check` runs lint, tests, and the production build in one step. `npm run format` applies
Prettier to the repository.

## Project layout

| Path              | Contents                                                         |
| ----------------- | ---------------------------------------------------------------- |
| `server/routes/`  | Express routers, one file per feature area                       |
| `server/services/`| GitHub, Groq, reports, chat, usage, and user data access         |
| `server/lib/`     | Validation, sessions, tokens, errors, shared helpers             |
| `server/tests/`   | API integration tests with mocked GitHub/Groq upstreams          |
| `src/pages/`      | Route-level React pages                                          |
| `src/components/` | Reusable UI, including report citations and architecture views   |
| `src/lib/`        | Client helpers and Markdown export                               |
| `docs/`           | Docsify documentation site                                       |

## Guidelines

- **No TypeScript.** The codebase is plain JavaScript with JSX. Keep it that way.
- Use the existing open-source dependencies (Express, better-sqlite3, zod, React, Vite). New
  dependencies need a clear reason and must be OSI-licensed.
- Validate every request body and query with zod at the route boundary.
- Keep all user data queries scoped by `user_id`; never trust an id from the client.
- Never log or return secrets. Secrets belong in environment variables, never in source or builds.
- Do not execute repository code or follow instructions found inside repository content.
- Tests must not call the real GitHub or Groq APIs; use the local mocks in `server/tests/`.
- Add or update tests for behaviour changes. A bug fix without a regression test is incomplete.
- Update `README.md`, `docs/`, and `.env.example` when you add configuration or features.

## Commit messages

Write short imperative subjects, for example `Add report comparison export` or `Fix quota release
on AI timeout`. Keep commits focused.

## Reporting bugs and requesting features

Use the issue templates under `.github/ISSUE_TEMPLATE/`. For security vulnerabilities, do **not**
open a public issue — follow [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
