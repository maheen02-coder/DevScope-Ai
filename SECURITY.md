# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Report them privately through
GitHub's private vulnerability reporting:

<https://github.com/maheen02-coder/DevScope-Ai/security/advisories/new>

Include the affected endpoint or component, reproduction steps, and the impact you observed. You
can expect an acknowledgement within a few days and a coordinated disclosure once a fix is ready.

## Supported versions

Only the latest commit on the default branch is supported with security fixes.

## Security model

- Sessions are signed JWTs stored in an `HttpOnly`, `SameSite=Lax` cookie. `Secure` and
  `TRUST_PROXY` default to on in production.
- All mutations require a JSON content type and pass an origin guard before reaching a route.
- Passwords use bcrypt (`bcryptjs`) with 12 rounds by default. OAuth logins never store provider
  passwords or access tokens.
- Every query for reports, notes, shares, chat, and usage is scoped to the authenticated user.
- Helmet sets security headers, including a restrictive CSP in production.
- Per-route rate limits protect authentication, analysis, chat, GitHub proxying, and public share
  links.
- GitHub and Groq tokens live only in server environment variables. The frontend bundle never
  receives them.

See `README.md` for the full configuration and deployment guidance.
