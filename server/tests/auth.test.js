import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { TEST_PASSWORD, registerUser, resetTestState, startTestEnvironment } from './helpers.js'

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

describe('authentication and sessions', () => {
  it('registers a user, sets an httpOnly session cookie, and returns a public profile', async () => {
    const response = await request(env.app).post('/api/auth/register').send({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: TEST_PASSWORD,
    })

    expect(response.status).toBe(201)
    expect(response.body.user).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      preferences: { defaultDepth: 'standard', chatStyle: 'concise' },
    })
    expect(response.body.user.password_hash).toBeUndefined()
    expect(response.body.user.password).toBeUndefined()

    const cookie = response.headers['set-cookie']?.[0] || ''
    expect(cookie).toContain('devscope_session=')
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)

    const me = await request(env.app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe('ada@example.com')
  })

  it('rejects duplicate email registration with a 409', async () => {
    await registerUser(env.app, { email: 'duplicate@example.com' })
    const response = await request(env.app).post('/api/auth/register').send({
      name: 'Another User',
      email: 'duplicate@example.com',
      password: TEST_PASSWORD,
    })
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('CONFLICT')
  })

  it('validates registration input field by field', async () => {
    const response = await request(env.app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'short' })

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.details.fields).toMatchObject({
      name: expect.any(String),
      email: expect.any(String),
      password: expect.any(String),
    })
  })

  it('returns a generic 401 for wrong credentials', async () => {
    await registerUser(env.app, { email: 'login@example.com' })

    const wrongPassword = await request(env.app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'WrongPassword123!' })
    expect(wrongPassword.status).toBe(401)
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS')

    const unknownEmail = await request(env.app)
      .post('/api/auth/login')
      .send({ email: 'missing@example.com', password: TEST_PASSWORD })
    expect(unknownEmail.status).toBe(401)
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS')
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message)
  })

  it('protects API routes without a session', async () => {
    const response = await request(env.app).get('/api/dashboard')
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('UNAUTHORIZED')
  })

  it('logs out by clearing the session cookie', async () => {
    const { agent } = await registerUser(env.app)
    await agent.get('/api/auth/me').expect(200)

    const logout = await agent.post('/api/auth/logout')
    expect(logout.status).toBe(200)
    expect(logout.headers['set-cookie']?.[0]).toMatch(/devscope_session=;/)

    const after = await agent.get('/api/auth/me')
    expect(after.status).toBe(401)
  })

  it('invalidates existing sessions when the password changes', async () => {
    const registration = await request(env.app).post('/api/auth/register').send({
      name: 'Session User',
      email: 'session@example.com',
      password: TEST_PASSWORD,
    })
    const oldCookie = registration.headers['set-cookie'][0]
    const agent = request.agent(env.app)
    await agent
      .post('/api/auth/login')
      .send({ email: 'session@example.com', password: TEST_PASSWORD })
      .expect(200)

    const changed = await agent.post('/api/users/me/password').send({
      currentPassword: TEST_PASSWORD,
      newPassword: 'NewDevscopePass456!',
    })
    expect(changed.status).toBe(200)
    expect(changed.headers['set-cookie']?.[0]).toContain('devscope_session=')

    const stale = await request(env.app).get('/api/auth/me').set('Cookie', oldCookie)
    expect(stale.status).toBe(401)
    expect(stale.body.error.code).toBe('SESSION_EXPIRED')

    const oldLogin = await request(env.app)
      .post('/api/auth/login')
      .send({ email: 'session@example.com', password: TEST_PASSWORD })
    expect(oldLogin.status).toBe(401)

    const newLogin = await request(env.app)
      .post('/api/auth/login')
      .send({ email: 'session@example.com', password: 'NewDevscopePass456!' })
    expect(newLogin.status).toBe(200)
  })

  it('rejects a password change with the wrong current password', async () => {
    const { agent } = await registerUser(env.app)
    const response = await agent.post('/api/users/me/password').send({
      currentPassword: 'NotMyPassword123!',
      newPassword: 'NewDevscopePass456!',
    })
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('INVALID_PASSWORD')
  })
})
