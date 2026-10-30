import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { getConfig, setConfig } from '../config.js'
import { resetTestState, startTestEnvironment } from './helpers.js'

let env

beforeAll(async () => {
  env = await startTestEnvironment()
})

beforeEach(() => {
  resetTestState()
})

afterAll(async () => {
  await env.upstream.close()
})

describe('platform endpoints', () => {
  it('exposes observability configuration on health without leaking secrets', async () => {
    const response = await request(env.app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body.observability).toMatchObject({
      logLevel: 'silent',
      metrics: true,
    })
    expect(JSON.stringify(response.body)).not.toContain('test-groq-key')
  })

  it('adds a request id header to responses', async () => {
    const response = await request(env.app).get('/api/health')
    expect(response.headers['x-request-id']).toBeTruthy()
  })

  it('serves the generated OpenAPI specification', async () => {
    const response = await request(env.app).get('/api/openapi.json')
    expect(response.status).toBe(200)
    expect(response.body.openapi).toBe('3.0.3')
    expect(response.body.info.title).toBe('DevScope AI API')
    expect(response.body.paths['/health']).toBeTruthy()
    expect(response.body.paths['/analyze'].post).toBeTruthy()
    expect(response.body.components.securitySchemes.cookieAuth).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'devscope_session',
    })
  })

  it('serves Swagger UI', async () => {
    const response = await request(env.app).get('/api/docs/')
    expect(response.status).toBe(200)
    expect(response.text).toContain('swagger-ui')
    expect(response.headers['content-security-policy']).toContain(
      "script-src 'self' 'unsafe-inline'",
    )
  })

  it('exposes Prometheus metrics in non-production mode', async () => {
    const response = await request(env.app).get('/api/metrics')
    expect(response.status).toBe(200)
    expect(response.text).toContain('devscope_http_requests_total')
    expect(response.text).toContain('devscope_users_total')
    expect(response.text).toContain('devscope_reports_total')
  })

  it('serves security.txt from the built client instead of the SPA fallback', async () => {
    const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devscope-dist-'))
    fs.mkdirSync(path.join(distDir, '.well-known'))
    fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>spa</title>')
    fs.writeFileSync(
      path.join(distDir, '.well-known', 'security.txt'),
      'Contact: mailto:security@example.com\nExpires: 2027-10-30T00:00:00.000Z\n',
    )

    const original = getConfig()
    setConfig({ ...original, distPath: distDir })
    try {
      const app = createApp()
      const security = await request(app).get('/.well-known/security.txt')
      expect(security.status).toBe(200)
      expect(security.text).toContain('Contact: mailto:security@example.com')
      expect(security.headers['content-type']).toContain('text/plain')

      const spa = await request(app).get('/dashboard')
      expect(spa.status).toBe(200)
      expect(spa.text).toContain('<!doctype html>')
    } finally {
      setConfig(original)
      fs.rmSync(distDir, { recursive: true, force: true })
    }
  })
})
