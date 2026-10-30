const BASE = import.meta.env.VITE_API_BASE_URL || '/api'

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
    const error = new ApiError(
      response.status,
      data?.error?.code || 'REQUEST_FAILED',
      data?.error?.message || `Request failed (${response.status}).`,
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
  if (error?.message) return error.message
  return fallback
}

export function fieldErrors(error) {
  const fields = error?.details?.fields
  return fields && typeof fields === 'object' ? fields : {}
}
