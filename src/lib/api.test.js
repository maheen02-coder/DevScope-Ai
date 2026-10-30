import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api.js'

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
})
