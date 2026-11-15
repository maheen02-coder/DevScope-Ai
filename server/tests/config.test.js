import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'

const base = {
  NODE_ENV: 'production',
  JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters',
}

describe('cookie configuration for split deployments', () => {
  it('defaults to lax cookies', () => {
    const config = loadConfig(base)
    expect(config.cookieSameSite).toBe('lax')
    expect(config.cookieSecure).toBe(true)
  })

  it('supports cross-site cookies when the frontend is on another host', () => {
    const config = loadConfig({ ...base, COOKIE_SAMESITE: 'none' })
    expect(config.cookieSameSite).toBe('none')
    expect(config.cookieSecure).toBe(true)
  })

  it('forces Secure when sameSite is none', () => {
    const config = loadConfig({ ...base, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' })
    expect(config.cookieSecure).toBe(true)
  })

  it('ignores unknown sameSite values', () => {
    const config = loadConfig({ ...base, COOKIE_SAMESITE: 'anywhere' })
    expect(config.cookieSameSite).toBe('lax')
  })
})
