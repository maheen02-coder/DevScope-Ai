# API reference

The generated OpenAPI specification is the source of truth:

- Swagger UI: `/api/docs`
- JSON spec: `/api/openapi.json`

Both are served by the Express app and require no authentication.

## Authentication

Registration and login set an `HttpOnly`, `SameSite=Lax` session cookie (`devscope_session`).
Browser clients send it automatically. All protected routes return `401` with
`SESSION_EXPIRED` when the cookie is missing, expired, or invalidated.

OAuth sign-in is available when the deployment configures provider credentials:

```
GET /api/auth/providers
GET /api/auth/oauth/github
GET /api/auth/oauth/github/callback
GET /api/auth/oauth/google
GET /api/auth/oauth/google/callback
```

`/api/auth/providers` reports which providers are configured so the UI can hide the others.

## Requests

- Mutations must send `Content-Type: application/json`.
- Requests are capped at 128 KB.
- Cross-origin mutations must come from an allowed origin (`FRONTEND_ORIGIN`).
- Validation failures return HTTP `422` with `code: "VALIDATION_ERROR"`.

## Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Enter a valid email address.",
    "details": { "fieldErrors": {} }
  }
}
```

Common codes: `UNAUTHORIZED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS`, `CSRF_BLOCKED`,
`RATE_LIMITED`, `QUOTA_EXCEEDED`, `AI_NOT_CONFIGURED`, `AI_CONTEXT_TOO_LARGE`,
`AI_RATE_LIMITED`, `NOT_FOUND`, `VALIDATION_ERROR`.

## Endpoint summary

| Method | Route | Description |
| ------ | ----- | ----------- |
| GET | `/health` | Status, configuration, quotas |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Account and session lifecycle |
| GET | `/auth/me`, `/auth/providers` | Current user, OAuth providers |
| PATCH | `/users/me` | Name and preferences |
| POST | `/users/me/password` | Change password |
| DELETE | `/users/me/data`, `/users/me` | Delete workspace data or account |
| GET | `/github/status`, `/github/search/*`, `/github/users/*`, `/github/repos/*` | GitHub reads |
| POST | `/analyze` | Run an analysis |
| GET/PATCH/DELETE | `/reports`, `/reports/:id` | Reports |
| GET/POST/DELETE | `/reports/:id/notes`, `/reports/:id/share` | Notes and share links |
| POST/GET/DELETE | `/chat/message`, `/chat/history`, `/chat/conversations` | Chat |
| GET | `/dashboard`, `/dashboard/usage` | Aggregates and quotas |
| GET | `/dashboard/rate-limits` | Quotas, endpoint policies, throttles, GitHub budget |
| GET | `/public/reports/:token[/badge.svg]` | Shared reports and badges |
| GET | `/metrics` | Prometheus metrics (token-protected in production) |

See Swagger UI for request bodies, responses, and schemas.
