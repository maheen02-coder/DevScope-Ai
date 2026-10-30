import { ApiError } from '../lib/errors.js'
import { getLogger } from '../lib/logger.js'

export function notFoundApi(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } })
}

// Express only treats a middleware as an error handler when it declares four arguments.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) return

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    })
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    })
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
    })
  }

  if (err?.code === 'CORS_BLOCKED') {
    return res.status(err.status || 403).json({
      error: { code: 'CORS_BLOCKED', message: err.message },
    })
  }

  if (typeof err?.status === 'number' && err?.code) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message },
    })
  }

  getLogger().error(
    {
      err,
      path: req.originalUrl?.split('?')[0],
      method: req.method,
      requestId: req.id,
      stack:
        typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 6).join('\n') : undefined,
    },
    'Unhandled API error',
  )

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    },
  })
}
