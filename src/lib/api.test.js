import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, errorMessage, resolveApiBase } from './api.js'

const originalWindow = globalThis.window
let dispatchEvent

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('API client session handling', () => {
  beforeEach(() => {
    dispatchEvent = vi.fn()
    globalThis.window = { dispatchEvent }
  })

  afterEach(() => {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    vi.unstubAllGlobals()
  })

  it('does not sign the user out when a password confirmation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: 'INVALID_PASSWORD', message: 'Password is incorrect.' },
        }),
      ),
    )

    await expect(api.delete('/users/me', { password: 'wrong' })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_PASSWORD',
    })
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('dispatches an unauthorized event when the session itself expired', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: 'SESSION_EXPIRED', message: 'Your session has expired.' },
        }),
      ),
    )

    await expect(api.get('/reports')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0][0].type).toBe('devscope:unauthorized')
  })

  it('never dispatches from auth routes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
        }),
      ),
    )

    await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 401 })
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('returns null for empty 204 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    await expect(api.delete('/users/me', { password: 'correct' })).resolves.toBeNull()
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('explains non-JSON errors so an offline API is obvious', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>Not Found</html>', {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )

    const error = await api.post('/auth/register', { email: 'a@b.co' }).catch((err) => err)
    expect(error.status).toBe(404)
    expect(error.message).toContain('did not handle this request (HTTP 404)')
    expect(error.message).toContain('npm run dev:api')
  })
})

describe('resolveApiBase', () => {
  it('defaults to the same-origin API path', () => {
    expect(resolveApiBase(undefined)).toBe('/api')
    expect(resolveApiBase('   ')).toBe('/api')
  })

  it('appends /api to a bare host and tolerates a trailing slash', () => {
    expect(resolveApiBase('https://devscope-ai.onrender.com')).toBe(
      'https://devscope-ai.onrender.com/api',
    )
    expect(resolveApiBase('https://devscope-ai.onrender.com/')).toBe(
      'https://devscope-ai.onrender.com/api',
    )
    expect(resolveApiBase('https://devscope-ai.onrender.com/api/')).toBe(
      'https://devscope-ai.onrender.com/api',
    )
  })
})

describe('errorMessage', () => {
  it('shows the clock time when GitHub anonymous quota resets', () => {
    const resetAt = new Date(Date.now() + 10 * 60_000 + 5_000).toISOString()
    const message = errorMessage({
      code: 'GITHUB_RATE_LIMITED',
      message: 'GitHub API rate limit reached.',
      details: { resetAt, limit: 60, remaining: 0, configured: false },
    })

    expect(message).toContain('anonymous limit (60 requests/hour)')
    expect(message).toContain('It resets at')
    expect(message).toContain('(in 10m)')
    expect(message).toContain('5,000 requests/hour')
  })

  it('does not mention anonymous limits when a token is configured', () => {
    const message = errorMessage({
      code: 'GITHUB_RATE_LIMITED',
      message: 'GitHub API rate limit reached.',
      details: { configured: true, limit: 5000, resetAt: null },
    })

    expect(message).toContain('GitHub token')
    expect(message).toContain('5,000 requests/hour')
    expect(message).not.toContain('anonymous')
  })

  it('passes through other error messages', () => {
    expect(errorMessage({ message: 'Nope.' })).toBe('Nope.')
    expect(errorMessage({})).toBe('Something went wrong. Please try again.')
  })
})
