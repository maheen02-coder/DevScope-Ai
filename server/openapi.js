import path from 'node:path'
import swaggerJsdoc from 'swagger-jsdoc'

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'DevScope AI API',
    version: '1.0.0',
    description:
      'Repository intelligence API. The Express service exposes these routes under `/api` and ' +
      'also serves the built React single-page application. Authentication uses an HttpOnly ' +
      'session cookie; JSON only for mutations.',
    license: {
      name: 'MIT',
      url: 'https://github.com/maheen02-coder/DevScope-Ai/blob/main/LICENSE',
    },
  },
  servers: [{ url: '/api', description: 'Same-origin API' }],
  tags: [
    { name: 'Health', description: 'Liveness and configuration status.' },
    { name: 'Auth', description: 'Registration, login, logout, and OAuth.' },
    { name: 'Users', description: 'Profile, password, and account data.' },
    { name: 'GitHub', description: 'Read-only GitHub browsing through the server.' },
    { name: 'Analysis', description: 'AI repository analysis.' },
    { name: 'Reports', description: 'Saved analyses, notes, and share links.' },
    { name: 'Chat', description: 'Grounded repository chat.' },
    { name: 'Dashboard', description: 'Usage and aggregate statistics.' },
    { name: 'Public', description: 'Unauthenticated shared-report endpoints.' },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'devscope_session',
        description: 'HttpOnly JWT session cookie set by login, registration, or OAuth.',
      },
    },
    parameters: {
      Owner: {
        in: 'path',
        name: 'owner',
        required: true,
        schema: { type: 'string' },
        description: 'GitHub owner (user or organisation).',
      },
      Repo: {
        in: 'path',
        name: 'repo',
        required: true,
        schema: { type: 'string' },
        description: 'GitHub repository name.',
      },
      Username: {
        in: 'path',
        name: 'username',
        required: true,
        schema: { type: 'string' },
        description: 'GitHub username.',
      },
      ReportId: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      OwnerQuery: {
        in: 'query',
        name: 'owner',
        required: true,
        schema: { type: 'string' },
      },
      RepoQuery: {
        in: 'query',
        name: 'repo',
        required: true,
        schema: { type: 'string' },
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Enter a valid email address.' },
              details: { type: 'object', nullable: true },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          preferences: { type: 'object', additionalProperties: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      QuotaBucket: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['analysis', 'chat'] },
          used: { type: 'integer' },
          limit: { type: 'integer' },
          remaining: { type: 'integer' },
          resetsAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Quota: {
        type: 'object',
        properties: {
          analysis: { $ref: '#/components/schemas/QuotaBucket' },
          chat: { $ref: '#/components/schemas/QuotaBucket' },
          windowHours: { type: 'integer', example: 24 },
        },
      },
      RateLimitReport: {
        type: 'object',
        properties: {
          generatedAt: { type: 'string', format: 'date-time' },
          enforced: {
            type: 'boolean',
            description: 'Whether the endpoint limiters are active for this process.',
          },
          windowHours: { type: 'integer' },
          quota: { $ref: '#/components/schemas/Quota' },
          timeline: {
            type: 'array',
            description: 'Hourly quota consumption for the rolling window, oldest first.',
            items: {
              type: 'object',
              properties: {
                start: { type: 'string', format: 'date-time' },
                analysis: { type: 'integer' },
                chat: { type: 'integer' },
              },
            },
          },
          policies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
                scope: { type: 'string' },
                windowMs: { type: 'integer' },
                limit: { type: 'integer' },
                description: { type: 'string' },
              },
            },
          },
          throttle: {
            type: 'object',
            description:
              'Throttled requests counted in memory since this API process started. Restarts reset the tally.',
            properties: {
              total: { type: 'integer' },
              since: { type: 'string', format: 'date-time' },
              scopes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    label: { type: 'string' },
                    count: { type: 'integer' },
                    lastHitAt: { type: 'string', format: 'date-time', nullable: true },
                  },
                },
              },
            },
          },
          github: {
            type: 'object',
            properties: {
              configured: { type: 'boolean' },
              limit: { type: 'integer', nullable: true },
              remaining: { type: 'integer', nullable: true },
              resetAt: { type: 'string', format: 'date-time', nullable: true },
              checkedAt: { type: 'string', format: 'date-time', nullable: true },
            },
          },
        },
      },
      Report: {
        type: 'object',
        description:
          'A saved analysis. `analysis` contains score, subscores, summary, architecture, layers, ' +
          'findings, onboarding, valuation, and insights.',
        properties: {
          id: { type: 'string', format: 'uuid' },
          repo: { type: 'object', additionalProperties: true },
          analysis: { type: 'object', additionalProperties: true },
          depth: { type: 'string', enum: ['standard', 'deep'] },
          model: { type: 'string', nullable: true },
          filesAnalyzed: { type: 'integer' },
          saved: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ChatMessage: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          role: { type: 'string', enum: ['user', 'assistant'] },
          content: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing, expired, or invalid session.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Resource not found or not owned by the caller.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ValidationError: {
        description: 'Request validation failed (HTTP 422).',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      RateLimited: {
        description: 'Too many requests.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
}

export const openapiSpec = swaggerJsdoc({
  definition,
  apis: [path.join(import.meta.dirname, 'openapi.paths.js')],
})
