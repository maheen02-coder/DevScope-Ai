import { describe, expect, it } from 'vitest'
import { auditDependencies, buildHealthSignals } from '../lib/insights.js'

const DAY = 86_400_000
const now = new Date('2026-10-30T00:00:00.000Z').getTime()

function repo(overrides = {}) {
  return {
    license: 'MIT',
    stars: 120,
    forks: 18,
    openIssues: 4,
    size: 512,
    archived: false,
    isFork: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    pushedAt: new Date(now - 10 * DAY).toISOString(),
    ...overrides,
  }
}

function file(path, content) {
  return { path, content, size: content.length, language: 'json' }
}

describe('buildHealthSignals', () => {
  it('classifies active repositories and exposes every signal', () => {
    const health = buildHealthSignals(repo(), { now })
    expect(health.activity).toBe('active')
    expect(health.daysSincePush).toBe(10)
    expect(health.license).toBe('MIT')
    expect(health.openIssueRatio).toBe(0.03)
    expect(health.signals).toHaveLength(6)
    expect(health.signals.map((signal) => signal.id)).toEqual([
      'activity',
      'archived',
      'license',
      'community',
      'issues',
      'fork',
    ])
  })

  it('marks stale and dormant repositories by last push', () => {
    expect(
      buildHealthSignals(repo({ pushedAt: new Date(now - 200 * DAY).toISOString() }), { now })
        .activity,
    ).toBe('moderate')
    expect(
      buildHealthSignals(repo({ pushedAt: new Date(now - 400 * DAY).toISOString() }), { now })
        .activity,
    ).toBe('stale')
    expect(
      buildHealthSignals(repo({ pushedAt: new Date(now - 900 * DAY).toISOString() }), { now })
        .activity,
    ).toBe('dormant')
    expect(buildHealthSignals(repo({ pushedAt: null }), { now }).activity).toBe('unknown')
  })

  it('flags missing licenses and archived repositories', () => {
    const health = buildHealthSignals(repo({ license: null, archived: true }), { now })
    const license = health.signals.find((signal) => signal.id === 'license')
    const archived = health.signals.find((signal) => signal.id === 'archived')
    expect(license.value).toBe('Not declared')
    expect(license.tone).toBe('warning')
    expect(archived.value).toBe('Yes')
    expect(archived.tone).toBe('danger')
  })
})

describe('auditDependencies', () => {
  it('parses package.json counts, pinning, and license', () => {
    const content = JSON.stringify({
      name: 'hello',
      license: 'MIT',
      dependencies: { express: '^5.0.0', dotenv: '18.0.0' },
      devDependencies: { vitest: '^5.0.5' },
      peerDependencies: { react: '>=19' },
    })
    const audit = auditDependencies(
      [file('package.json', content)],
      ['package-lock.json', 'src/index.js'],
    )
    expect(audit.manifests).toHaveLength(1)
    expect(audit.manifests[0]).toMatchObject({
      path: 'package.json',
      ecosystem: 'npm',
      declaredLicense: 'MIT',
      runtime: 2,
      development: 1,
    })
    expect(audit.runtime).toBe(2)
    expect(audit.development).toBe(1)
    expect(audit.pinned).toBe(1)
    expect(audit.unpinned).toBe(3)
    expect(audit.lockfiles).toEqual([{ ecosystem: 'npm', present: true }])
    expect(audit.issues.map((issue) => issue.id)).not.toContain('missing-lockfile')
    expect(audit.issues.map((issue) => issue.id)).toContain('unpinned-dependencies')
  })

  it('reports a missing lockfile when none exists in the tree', () => {
    const audit = auditDependencies(
      [file('package.json', JSON.stringify({ dependencies: { express: '5.0.0' } }))],
      ['src/index.js'],
    )
    expect(audit.lockfiles).toEqual([{ ecosystem: 'npm', present: false }])
    const issue = audit.issues.find((entry) => entry.id === 'missing-lockfile')
    expect(issue).toBeTruthy()
    expect(issue.detail).toContain('npm')
  })

  it('parses requirements.txt, go.mod, and composer.json', () => {
    const audit = auditDependencies(
      [
        file('requirements.txt', 'flask==3.0.0\nrequests>=2.31\n# comment\n-r other.txt\n'),
        file(
          'go.mod',
          'module example.com/app\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n\tgolang.org/x/net v0.20.0\n)\n',
        ),
        file(
          'composer.json',
          JSON.stringify({
            require: { php: '>=8.2', 'monolog/monolog': '^3.0' },
            'require-dev': { phpunit: '^11' },
            license: ['MIT'],
          }),
        ),
      ],
      [],
    )
    expect(audit.manifests.map((manifest) => manifest.ecosystem).sort()).toEqual([
      'composer',
      'go',
      'pip',
    ])
    expect(audit.runtime).toBe(2 + 2 + 1)
    expect(audit.development).toBe(1)
    expect(audit.manifests.find((manifest) => manifest.ecosystem === 'pip')).toMatchObject({
      pinned: 1,
      unpinned: 1,
    })
    expect(
      audit.manifests.find((manifest) => manifest.ecosystem === 'composer').declaredLicense,
    ).toBe('MIT')
    expect(audit.declaredLicense).toBe('MIT')
  })

  it('marks unparsable manifests instead of throwing', () => {
    const audit = auditDependencies([file('package.json', '{ not json')], [])
    expect(audit.manifests[0].parseError).toBe(true)
    expect(audit.issues.map((issue) => issue.id)).toContain('manifest-parse-failed')
  })

  it('reports when no manifest was analyzed', () => {
    const audit = auditDependencies([file('src/index.js', 'export const a = 1')], [])
    expect(audit.manifests).toEqual([])
    expect(audit.total).toBe(0)
    expect(audit.issues.map((issue) => issue.id)).toContain('no-manifest')
  })
})
