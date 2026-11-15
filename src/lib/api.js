import { formatNumber, formatResetAt } from './format.js'

export function resolveApiBase(value) {
  const base = String(value || '')
    .trim()
    .replace(/\/+$/, '')
  if (!base) return '/api'
  return base.endsWith('/api') ? base : `${base}/api`
}

const BASE = resolveApiBase(import.meta.env.VITE_API_BASE_URL)

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the DevScope API. Check your connection and try again.',
    )
  }

  if (response.status === 204) return null

  let data = null
  try {
    data = await response.json()
  } catch {
    // Non-JSON responses are treated as an empty payload.
  }

  if (!response.ok) {
    const apiMessage = data?.error?.message
    const contentType = response.headers.get('content-type') || ''
    const offlineHint =
      response.status === 404 || response.status >= 500
        ? `The DevScope API did not handle this request (HTTP ${response.status}). It may be starting up or not running — start it with "npm run dev:api" and try again.`
        : `Request failed (${response.status}).`
    const message =
      apiMessage ||
      (contentType.includes('application/json')
        ? `Request failed (${response.status}).`
        : offlineHint)
    const error = new ApiError(
      response.status,
      data?.error?.code || 'REQUEST_FAILED',
      message,
      data?.error?.details,
    )
    const sessionExpired = error.code === 'UNAUTHORIZED' || error.code === 'SESSION_EXPIRED'
    if (response.status === 401 && sessionExpired && !path.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('devscope:unauthorized'))
    }
    throw error
  }

  return data
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, body, options) => request(path, { ...options, method: 'DELETE', body }),
}

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.code === 'GITHUB_RATE_LIMITED') {
    const details = error.details || {}
    const configured = details.configured === true
    const limit = Number(details.limit)
    const perHour = Number.isFinite(limit) && limit > 0 ? formatNumber(limit) : '60'
    const resetAt = formatResetAt(details.resetAt)
    const parts = [
      configured
        ? `The server's GitHub token has used its ${perHour} requests/hour limit.`
        : `GitHub's anonymous limit (${perHour} requests/hour) is used up.`,
      resetAt ? `It resets at ${resetAt}.` : 'It resets on a rolling hourly window.',
      configured
        ? 'Try again after the reset.'
        : 'Add a GITHUB_TOKEN on the server to raise the limit to 5,000 requests/hour.',
    ]
    return parts.join(' ')
  }
  if (error?.message) return error.message
  return fallback
}

export function fieldErrors(error) {
  const fields = error?.details?.fields
  return fields && typeof fields === 'object' ? fields : {}
}
