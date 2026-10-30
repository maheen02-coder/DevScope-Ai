import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
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

describe('security middleware', () => {
  it('allows requests from configured frontend origins', async () => {
    const response = await request(env.app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: 'nobody@example.com', password: 'WrongPassword123!' })

    expect(response.status).toBe(401)
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })

  it('allows same-origin requests that were not listed explicitly', async () => {
    const response = await request(env.app)
      .post('/api/auth/login')
      .set('Host', '127.0.0.1:4011')
      .set('Origin', 'http://127.0.0.1:4011')
      .send({ email: 'nobody@example.com', password: 'WrongPassword123!' })

    expect(response.status).toBe(401)
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4011')
  })

  it('blocks cross-origin requests from unconfigured origins', async () => {
    const response = await request(env.app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'nobody@example.com', password: 'WrongPassword123!' })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('CORS_BLOCKED')
  })

  it('requires JSON bodies for write requests', async () => {
    const response = await request(env.app)
      .post('/api/auth/login')
      .set('Content-Type', 'text/plain')
      .send('email=a@b.com')

    expect(response.status).toBe(415)
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
  })

  it('rejects malformed JSON with a 400', async () => {
    const response = await request(env.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_JSON')
  })

  it('rejects oversized request bodies', async () => {
    const response = await request(env.app)
      .post('/api/auth/login')
      .send({ email: `${'a'.repeat(200_000)}@example.com`, password: 'x' })

    expect(response.status).toBe(413)
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('returns JSON 404s for unknown API routes', async () => {
    const response = await request(env.app).get('/api/does-not-exist')
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('NOT_FOUND')
  })

  it('reports health without exposing secrets', async () => {
    const response = await request(env.app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'ok',
      ai: { configured: true },
      limits: { analysis: 10, chat: 10 },
    })
    const serialized = JSON.stringify(response.body)
    expect(serialized).not.toContain('test-groq-key')
    expect(serialized).not.toContain('test-jwt-secret')
  })

  it('does not serve a client build when dist is absent', async () => {
    const response = await request(env.app).get('/')
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('CLIENT_NOT_BUILT')
  })
})
