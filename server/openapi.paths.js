/**
 * OpenAPI path annotations. swagger-jsdoc reads these JSDoc blocks at startup and builds the
 * specification served at /api/openapi.json and /api/docs.
 */

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Service health and configuration status
 *     description: Reports database connectivity, AI/GitHub configuration, and daily quotas. Returns 503 when the database check fails.
 *     responses:
 *       200:
 *         description: Service is healthy.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 uptime: { type: integer }
 *                 version: { type: string }
 *                 environment: { type: string }
 *                 database: { type: string, enum: [ok, error] }
 *                 ai: { type: object }
 *                 github: { type: object }
 *                 limits: { type: object }
 *       503:
 *         description: Database is unavailable.
 */

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create an account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 60 }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, maxLength: 72 }
 *     responses:
 *       201:
 *         description: Account created and session cookie set.
 *       409:
 *         description: Email already registered.
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Signed in; session cookie set.
 *       401:
 *         description: Invalid credentials.
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Sign out
 *     responses:
 *       200:
 *         description: Session cookie cleared.
 */

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Current user
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Authenticated user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/User' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @openapi
 * /auth/providers:
 *   get:
 *     tags: [Auth]
 *     summary: List configured OAuth providers
 *     responses:
 *       200:
 *         description: Provider ids that are configured on this deployment.
 */

/**
 * @openapi
 * /auth/oauth/{provider}:
 *   get:
 *     tags: [Auth]
 *     summary: Start an OAuth sign-in
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema: { type: string, enum: [github, google] }
 *     responses:
 *       302:
 *         description: Redirect to the provider. Returns 503 when the provider is not configured.
 */

/**
 * @openapi
 * /auth/oauth/{provider}/callback:
 *   get:
 *     tags: [Auth]
 *     summary: OAuth callback
 *     description: Exchanges the provider code, links or creates the account, sets the session cookie, and redirects to the app.
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema: { type: string, enum: [github, google] }
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Redirect back to the application.
 */

/**
 * @openapi
 * /users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update display name and preferences
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 60 }
 *               preferences:
 *                 type: object
 *                 properties:
 *                   defaultDepth: { type: string, enum: [standard, deep] }
 *                   chatStyle: { type: string, enum: [concise, detailed] }
 *     responses:
 *       200:
 *         description: Updated user.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *   delete:
 *     tags: [Users]
 *     summary: Delete the account
 *     description: Requires the current password. Removes reports, chats, notes, shares, and usage events.
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string }
 *     responses:
 *       204:
 *         description: Account deleted and session cleared.
 *       401:
 *         description: Password is incorrect.
 */

/**
 * @openapi
 * /users/me/password:
 *   post:
 *     tags: [Users]
 *     summary: Change the password
 *     description: Invalidates other sessions through token_version rotation.
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8, maxLength: 72 }
 *     responses:
 *       200:
 *         description: Password updated and a fresh session cookie set.
 *       401:
 *         description: Current password is incorrect.
 */

/**
 * @openapi
 * /users/me/data:
 *   delete:
 *     tags: [Users]
 *     summary: Delete workspace data
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scope]
 *             properties:
 *               scope: { type: string, enum: [reports, chats, all] }
 *     responses:
 *       200:
 *         description: Number of deleted reports and chat messages.
 */

/**
 * @openapi
 * /github/status:
 *   get:
 *     tags: [GitHub]
 *     summary: GitHub rate-limit status
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Cached core rate-limit information.
 */

/**
 * @openapi
 * /github/search/users:
 *   get:
 *     tags: [GitHub]
 *     summary: Search public GitHub users
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Paginated user results.
 */

/**
 * @openapi
 * /github/search/repositories:
 *   get:
 *     tags: [GitHub]
 *     summary: Search public repositories
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Paginated repository results.
 */

/**
 * @openapi
 * /github/users/{username}:
 *   get:
 *     tags: [GitHub]
 *     summary: Public GitHub profile
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Username'
 *     responses:
 *       200:
 *         description: Profile and aggregate repository information.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @openapi
 * /github/users/{username}/repos:
 *   get:
 *     tags: [GitHub]
 *     summary: Public repositories for a user
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Username'
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: language
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Repository page with filter metadata.
 */

/**
 * @openapi
 * /github/repos/{owner}/{repo}:
 *   get:
 *     tags: [GitHub]
 *     summary: Repository metadata, languages, and README
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Owner'
 *       - $ref: '#/components/parameters/Repo'
 *     responses:
 *       200:
 *         description: Repository overview.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @openapi
 * /github/repos/{owner}/{repo}/tree:
 *   get:
 *     tags: [GitHub]
 *     summary: Filtered repository file tree
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Owner'
 *       - $ref: '#/components/parameters/Repo'
 *     responses:
 *       200:
 *         description: File tree with exclusions applied.
 */

/**
 * @openapi
 * /github/repos/{owner}/{repo}/file:
 *   get:
 *     tags: [GitHub]
 *     summary: Read a repository file
 *     description: Read-only. Path traversal, binaries, and oversized files are rejected.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Owner'
 *       - $ref: '#/components/parameters/Repo'
 *       - in: query
 *         name: path
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: ref
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: File contents and metadata.
 *       400:
 *         description: Invalid path or binary file.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @openapi
 * /analyze:
 *   post:
 *     tags: [Analysis]
 *     summary: Analyze a public repository
 *     description: Consumes one analysis quota slot, which is released if the analysis fails.
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [owner, repo]
 *             properties:
 *               owner: { type: string }
 *               repo: { type: string }
 *               depth: { type: string, enum: [standard, deep] }
 *     responses:
 *       201:
 *         description: Report created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 report: { $ref: '#/components/schemas/Report' }
 *                 quota: { $ref: '#/components/schemas/Quota' }
 *       422:
 *         description: Validation failed or the AI output/context is unusable.
 *       429:
 *         description: Quota exhausted or AI rate limited.
 *       503:
 *         description: AI is not configured.
 */

/**
 * @openapi
 * /reports:
 *   get:
 *     tags: [Reports]
 *     summary: List owned reports
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: saved
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50 }
 *     responses:
 *       200:
 *         description: Paginated report list.
 */

/**
 * @openapi
 * /reports/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: Read an owned report
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ReportId'
 *     responses:
 *       200:
 *         description: Full report.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     tags: [Reports]
 *     summary: Rename or toggle saved state
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ReportId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, maxLength: 120 }
 *               saved: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated report.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     tags: [Reports]
 *     summary: Delete an owned report
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ReportId'
 *     responses:
 *       204:
 *         description: Deleted.
 */

/**
 * @openapi
 * /reports/{id}/notes:
 *   get:
 *     tags: [Reports]
 *     summary: List private notes
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ReportId'
 *     responses:
 *       200:
 *         description: Notes for the report.
 *   post:
 *     tags: [Reports]
 *     summary: Add a private note
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ReportId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string, minLength: 1, maxLength: 2000 }
 *     responses:
 *       201:
 *         description: Note created.
 */

/**
 * @openapi
 * /reports/{id}/notes/{noteId}:
 *   delete:
 *     tags: [Reports]
 *     summary: Delete a private note
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ReportId'
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Deleted.
 */

/**
 * @openapi
 * /reports/{id}/share:
 *   get:
 *     tags: [Reports]
 *     summary: Current active share link
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ReportId'
 *     responses:
 *       200:
 *         description: Active share or null.
 *   post:
 *     tags: [Reports]
 *     summary: Create or replace a share link
 *     description: Only one link is active per report; creating a new one revokes the previous link.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ReportId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expiresInDays: { type: integer, minimum: 1, maximum: 365, default: 30 }
 *     responses:
 *       201:
 *         description: Share link created.
 *   delete:
 *     tags: [Reports]
 *     summary: Revoke the active share link
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ReportId'
 *     responses:
 *       204:
 *         description: Revoked.
 */

/**
 * @openapi
 * /chat/message:
 *   post:
 *     tags: [Chat]
 *     summary: Send a grounded chat message
 *     description: Consumes one chat quota slot, released on failure. The reply is grounded in repository context and the latest analysis.
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [owner, repo, message]
 *             properties:
 *               owner: { type: string }
 *               repo: { type: string }
 *               message: { type: string, minLength: 1, maxLength: 4000 }
 *     responses:
 *       200:
 *         description: Stored user and assistant messages.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ChatMessage' }
 *                 quota: { $ref: '#/components/schemas/Quota' }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */

/**
 * @openapi
 * /chat/history:
 *   get:
 *     tags: [Chat]
 *     summary: Chat history for a repository
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/OwnerQuery'
 *       - $ref: '#/components/parameters/RepoQuery'
 *     responses:
 *       200:
 *         description: Messages, latest report, and quota.
 *   delete:
 *     tags: [Chat]
 *     summary: Clear history for a repository
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/OwnerQuery'
 *       - $ref: '#/components/parameters/RepoQuery'
 *     responses:
 *       200:
 *         description: Number of deleted messages.
 */

/**
 * @openapi
 * /chat/conversations:
 *   get:
 *     tags: [Chat]
 *     summary: Recent conversations
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Up to 30 repositories with the latest message and quota.
 */

/**
 * @openapi
 * /dashboard:
 *   get:
 *     tags: [Dashboard]
 *     summary: Aggregate statistics
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Counts, score history, language mix, and valuation totals.
 */

/**
 * @openapi
 * /dashboard/usage:
 *   get:
 *     tags: [Dashboard]
 *     summary: Rolling 24-hour quota summary
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Analysis and chat usage.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Quota' }
 */

/**
 * @openapi
 * /dashboard/rate-limits:
 *   get:
 *     tags: [Dashboard]
 *     summary: Rate-limit and quota report
 *     description: >
 *       Per-user rolling quota, hourly quota consumption, the configured endpoint limiter
 *       policies, process-wide throttled-request counters, and the latest GitHub API budget.
 *       Throttle counters live in memory and reset when the API process restarts.
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Live rate-limit report.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RateLimitReport' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @openapi
 * /public/reports/{token}:
 *   get:
 *     tags: [Public]
 *     summary: Read a shared report
 *     description: Unauthenticated read-only snapshot. Notes, owner identity, report id, and chat are excluded.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Shared report snapshot.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @openapi
 * /public/reports/{token}/badge.svg:
 *   get:
 *     tags: [Public]
 *     summary: Score badge SVG
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: SVG badge.
 *         content:
 *           image/svg+xml:
 *             schema: { type: string }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
