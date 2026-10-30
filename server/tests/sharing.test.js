import crypto from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../db.js'
import { registerUser, resetTestState, runAnalysis, startTestEnvironment } from './helpers.js'

let env
let agent
let report

async function createReport(userAgent = agent) {
  const response = await runAnalysis(userAgent)
  if (response.status !== 201) {
    throw new Error(`Analysis failed (${response.status}): ${JSON.stringify(response.body)}`)
  }
  return response.body.report
}

beforeAll(async () => {
  env = await startTestEnvironment()
})

beforeEach(async () => {
  resetTestState()
  ;({ agent } = await registerUser(env.app))
  report = await createReport()
})

afterAll(async () => {
  await env.upstream.close()
})

describe('private report notes', () => {
  it('creates, lists, and deletes notes for the owning user', async () => {
    const empty = await agent.get(`/api/reports/${report.id}/notes`)
    expect(empty.status).toBe(200)
    expect(empty.body.notes).toEqual([])

    const created = await agent
      .post(`/api/reports/${report.id}/notes`)
      .send({ body: '  Verify the license before reselling.  ' })
    expect(created.status).toBe(201)
    expect(created.body.note).toMatchObject({
      body: 'Verify the license before reselling.',
      createdAt: expect.any(String),
    })

    const listed = await agent.get(`/api/reports/${report.id}/notes`)
    expect(listed.body.notes).toHaveLength(1)
    expect(listed.body.notes[0].id).toBe(created.body.note.id)

    const removed = await agent.delete(`/api/reports/${report.id}/notes/${created.body.note.id}`)
    expect(removed.status).toBe(204)

    const after = await agent.get(`/api/reports/${report.id}/notes`)
    expect(after.body.notes).toEqual([])
  })

  it('validates note content', async () => {
    const blank = await agent.post(`/api/reports/${report.id}/notes`).send({ body: '   ' })
    expect(blank.status).toBe(422)

    const tooLong = await agent
      .post(`/api/reports/${report.id}/notes`)
      .send({ body: 'x'.repeat(2001) })
    expect(tooLong.status).toBe(422)
  })

  it('blocks other users from reading or writing notes', async () => {
    const note = await agent.post(`/api/reports/${report.id}/notes`).send({ body: 'Private' })
    expect(note.status).toBe(201)

    const other = await registerUser(env.app)
    const read = await other.agent.get(`/api/reports/${report.id}/notes`)
    expect(read.status).toBe(404)

    const write = await other.agent
      .post(`/api/reports/${report.id}/notes`)
      .send({ body: 'Intruder note' })
    expect(write.status).toBe(404)

    const remove = await other.agent.delete(`/api/reports/${report.id}/notes/${note.body.note.id}`)
    expect(remove.status).toBe(404)
  })

  it('returns 404 when deleting a note that does not exist', async () => {
    const response = await agent.delete(`/api/reports/${report.id}/notes/${crypto.randomUUID()}`)
    expect(response.status).toBe(404)
  })
})

describe('expiring share links and public badge', () => {
  it('creates, reads, and replaces a single active link', async () => {
    const none = await agent.get(`/api/reports/${report.id}/share`)
    expect(none.status).toBe(200)
    expect(none.body.share).toBeNull()

    const first = await agent.post(`/api/reports/${report.id}/share`).send({ expiresInDays: 7 })
    expect(first.status).toBe(201)
    expect(first.body.share.token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(new Date(first.body.share.expiresAt).getTime()).toBeGreaterThan(Date.now())

    const active = await agent.get(`/api/reports/${report.id}/share`)
    expect(active.body.share.token).toBe(first.body.share.token)

    const second = await agent.post(`/api/reports/${report.id}/share`).send({ expiresInDays: 30 })
    expect(second.status).toBe(201)
    expect(second.body.share.token).not.toBe(first.body.share.token)

    const stale = await request(env.app).get(`/api/public/reports/${first.body.share.token}`)
    expect(stale.status).toBe(404)

    const currentActive = await agent.get(`/api/reports/${report.id}/share`)
    expect(currentActive.body.share.token).toBe(second.body.share.token)
  })

  it('serves a read-only public payload without account or note data', async () => {
    await agent.post(`/api/reports/${report.id}/notes`).send({ body: 'Private follow-up' })
    const share = await agent.post(`/api/reports/${report.id}/share`).send({ expiresInDays: 30 })
    const { token } = share.body.share

    const response = await request(env.app).get(`/api/public/reports/${token}`)
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toContain('no-store')
    expect(response.body.report.repoFullName).toBe(report.repoFullName)
    expect(response.body.report.analysis.scores.overall).toBe(82)
    expect(response.body.share.expiresAt).toBe(share.body.share.expiresAt)

    const serialized = JSON.stringify(response.body)
    expect(serialized).not.toContain('Private follow-up')
    expect(serialized).not.toContain('@example.com')
    expect(response.body.report.userId).toBeUndefined()
    expect(response.body.report.id).toBeUndefined()
    expect(response.body.report.notes).toBeUndefined()

    const badge = await request(env.app).get(`/api/public/reports/${token}/badge.svg`)
    expect(badge.status).toBe(200)
    expect(badge.headers['content-type']).toContain('image/svg+xml')
    expect(badge.headers['cache-control']).toContain('no-store')
    const svg = badge.text || badge.body?.toString('utf8') || ''
    expect(svg).toContain('82/100')
    expect(svg).toContain('<svg')
  })

  it('revokes links so the public view and badge stop working', async () => {
    const share = await agent.post(`/api/reports/${report.id}/share`).send({ expiresInDays: 30 })
    const { token } = share.body.share

    const revoked = await agent.delete(`/api/reports/${report.id}/share`)
    expect(revoked.status).toBe(204)

    const reportView = await request(env.app).get(`/api/public/reports/${token}`)
    expect(reportView.status).toBe(404)
    const badge = await request(env.app).get(`/api/public/reports/${token}/badge.svg`)
    expect(badge.status).toBe(404)

    const active = await agent.get(`/api/reports/${report.id}/share`)
    expect(active.body.share).toBeNull()
  })

  it('rejects expired and malformed tokens', async () => {
    const share = await agent.post(`/api/reports/${report.id}/share`).send({ expiresInDays: 30 })
    const { token } = share.body.share

    getDb()
      .prepare('UPDATE report_shares SET expires_at = ? WHERE token = ?')
      .run(new Date(Date.now() - 1000).toISOString(), token)

    const expired = await request(env.app).get(`/api/public/reports/${token}`)
    expect(expired.status).toBe(404)

    const malformed = await request(env.app).get('/api/public/reports/not-a-real-token')
    expect(malformed.status).toBe(404)
  })

  it('keeps share management private to the report owner', async () => {
    const other = await registerUser(env.app)
    const create = await other.agent.post(`/api/reports/${report.id}/share`).send({})
    expect(create.status).toBe(404)

    const read = await other.agent.get(`/api/reports/${report.id}/share`)
    expect(read.status).toBe(404)

    const revoke = await other.agent.delete(`/api/reports/${report.id}/share`)
    expect(revoke.status).toBe(404)
  })

  it('validates the requested expiry window', async () => {
    const tooShort = await agent.post(`/api/reports/${report.id}/share`).send({ expiresInDays: 0 })
    expect(tooShort.status).toBe(422)

    const tooLong = await agent.post(`/api/reports/${report.id}/share`).send({ expiresInDays: 400 })
    expect(tooLong.status).toBe(422)
  })
})
