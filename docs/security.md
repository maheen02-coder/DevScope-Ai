# Security

Report vulnerabilities privately through
[GitHub security advisories](https://github.com/maheen02-coder/DevScope-Ai/security/advisories/new).
Do not open a public issue.

## Controls

- **Passwords** — `bcryptjs`, 12 rounds by default. Login errors do not reveal whether an email
  exists.
- **Sessions** — signed JWT in an `HttpOnly`, `SameSite=Lax` cookie. `Secure` and `TRUST_PROXY`
  default to on in production. `token_version` invalidates sessions after a password change.
- **CSRF** — mutations require a JSON content type and pass an origin guard that only accepts
  same-origin or configured `FRONTEND_ORIGIN` values.
- **CORS** — restricted to the same origin and configured frontend origins, with credentials.
- **Headers** — Helmet, including a restrictive CSP in production. The Swagger UI pages get a
  scoped policy that allows their inline bootstrap script.
- **Rate limits** — per-route limits for global traffic, authentication, GitHub, analysis, chat,
  and public share links.
- **Authorization** — every report, note, share, chat, and usage query is scoped by `user_id`.
- **AI safety** — repository text is treated as untrusted data, prompt-injection patterns are
  defanged, credentials are redacted, and citations are limited to files actually analyzed.
- **Secrets** — GitHub and Groq keys stay in server environment variables and are never sent to
  the browser. Pino redacts cookies, authorization headers, and token fields.

## OAuth

OAuth is optional. Set `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET` and/or
`GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`. Callback URLs:

```
https://your-host/api/auth/oauth/github/callback
https://your-host/api/auth/oauth/google/callback
```

Unconfigured providers return `503` and are hidden from `/api/auth/providers`. OAuth accounts never
store provider access tokens or passwords.
