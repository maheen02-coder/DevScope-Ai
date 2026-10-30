import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { registerUser, resetTestState, startTestEnvironment } from './helpers.js'

let env
let agent

beforeAll(async () => {
  env = await startTestEnvironment()
})

beforeEach(async () => {
  resetTestState()
  ;({ agent } = await registerUser(env.app))
})

afterAll(async () => {
  await env.upstream.close()
})

describe('GitHub integration', () => {
  it('requires authentication', async () => {
    const response = await request(env.app).get('/api/github/search/users?q=octo')
    expect(response.status).toBe(401)
  })

  it('validates search queries', async () => {
    const response = await agent.get('/api/github/search/users?q=a')
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('searches users and repositories', async () => {
    const users = await agent.get('/api/github/search/users?q=octo')
    expect(users.status).toBe(200)
    expect(users.body.total).toBe(1)
    expect(users.body.items[0]).toMatchObject({ login: 'octo', type: 'User' })

    const repos = await agent.get('/api/github/search/repositories?q=hello')
    expect(repos.status).toBe(200)
    expect(repos.body.items[0]).toMatchObject({
      fullName: 'Octo/Hello',
      stars: 42,
      language: 'JavaScript',
    })
  })

  it('loads a user profile and their repositories', async () => {
    const profile = await agent.get('/api/github/users/octo')
    expect(profile.status).toBe(200)
    expect(profile.body.user).toMatchObject({ login: 'octo', name: 'Octo Tester', publicRepos: 1 })

    const repos = await agent.get('/api/github/users/octo/repos')
    expect(repos.status).toBe(200)
    expect(repos.body.repos).toHaveLength(1)
    expect(repos.body.repos[0].fullName).toBe('Octo/Hello')
  })

  it('loads repository metadata, languages, and README', async () => {
    const response = await agent.get('/api/github/repos/octo/hello')
    expect(response.status).toBe(200)
    expect(response.body.repo).toMatchObject({
      fullName: 'Octo/Hello',
      defaultBranch: 'main',
      stars: 42,
      license: 'MIT',
    })
    expect(response.body.languages[0].name).toBe('JavaScript')
    expect(response.body.readme.content).toContain('# Hello')
    expect(response.body.readme.truncated).toBe(false)
  })

  it('lists repository files while hiding ignored paths', async () => {
    const response = await agent.get('/api/github/repos/octo/hello/tree')
    expect(response.status).toBe(200)
    const paths = response.body.tree.entries.map((entry) => entry.path)
    expect(paths).toContain('src/index.js')
    expect(paths).toContain('README.md')
    expect(paths).not.toContain('node_modules/express/index.js')
    expect(paths).not.toContain('package-lock.json')
    expect(response.body.tree.totalFiles).toBe(6)
  })

  it('retrieves file contents', async () => {
    const response = await agent
      .get('/api/github/repos/octo/hello/file')
      .query({ path: 'src/util.js' })
    expect(response.status).toBe(200)
    expect(response.body.file).toMatchObject({ path: 'src/util.js', binary: false })
    expect(response.body.file.content).toContain('export const add')
  })

  it('rejects traversal paths and returns 404 for missing files', async () => {
    const traversal = await agent
      .get('/api/github/repos/octo/hello/file')
      .query({ path: '../secrets.txt' })
    expect(traversal.status).toBe(400)

    const missing = await agent
      .get('/api/github/repos/octo/hello/file')
      .query({ path: 'src/missing.js' })
    expect(missing.status).toBe(404)
  })

  it('maps unknown repositories to a 404', async () => {
    const response = await agent.get('/api/github/repos/octo/unknown')
    expect(response.status).toBe(404)
  })

  it('reports GitHub rate-limit status', async () => {
    await agent.get('/api/github/repos/octo/hello')
    const status = await agent.get('/api/github/status')
    expect(status.status).toBe(200)
    expect(status.body.github).toMatchObject({ configured: false, limit: 5000, remaining: 4999 })
    expect(status.body.github.resetAt).toEqual(expect.any(String))
  })
})
