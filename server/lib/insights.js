const MAX_MANIFEST_CHARS = 200_000

const LOCKFILES = {
  npm: [
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lock',
    'bun.lockb',
  ],
  python: ['poetry.lock', 'Pipfile.lock', 'uv.lock', 'requirements.lock'],
  go: ['go.sum'],
  rust: ['Cargo.lock'],
  php: ['composer.lock'],
  ruby: ['Gemfile.lock'],
}

const MANIFESTS = {
  'package.json': 'npm',
  'requirements.txt': 'python',
  'pyproject.toml': 'python',
  'go.mod': 'go',
  'cargo.toml': 'rust',
  'composer.json': 'php',
  gemfile: 'ruby',
  'pom.xml': 'maven',
}

function asText(file) {
  const content = typeof file?.content === 'string' ? file.content : ''
  return content.slice(0, MAX_MANIFEST_CHARS)
}

function baseName(path) {
  return String(path || '')
    .split('/')
    .pop()
    .toLowerCase()
}

function sectionSize(manifest, key, filterPlatform = false) {
  const section = manifest?.[key]
  if (!section || typeof section !== 'object' || Array.isArray(section)) return 0
  return Object.keys(section).filter(
    (name) =>
      !filterPlatform || !/^(php|ext-|lib-|composer-plugin-api|composer-runtime-api)$/i.test(name),
  ).length
}

function countVersionPinning(manifest) {
  let pinned = 0
  let unpinned = 0
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const section = manifest?.[key]
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue
    for (const version of Object.values(section)) {
      if (typeof version !== 'string') continue
      if (/^\d+\.\d+\.\d+/.test(version.trim())) pinned += 1
      else if (version.trim()) unpinned += 1
    }
  }
  return { pinned, unpinned }
}

function parsePackageJson(content) {
  const manifest = JSON.parse(content)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('not an object')
  }
  const pinning = countVersionPinning(manifest)
  return {
    ecosystem: 'npm',
    declaredLicense: typeof manifest.license === 'string' ? manifest.license : null,
    runtime: sectionSize(manifest, 'dependencies'),
    development: sectionSize(manifest, 'devDependencies'),
    peer: sectionSize(manifest, 'peerDependencies'),
    ...pinning,
  }
}

function parseComposerJson(content) {
  const manifest = JSON.parse(content)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('not an object')
  }
  const license = Array.isArray(manifest.license)
    ? manifest.license.filter((entry) => typeof entry === 'string').join(', ')
    : typeof manifest.license === 'string'
      ? manifest.license
      : null
  return {
    ecosystem: 'composer',
    declaredLicense: license || null,
    runtime: sectionSize(manifest, 'require', true),
    development: sectionSize(manifest, 'require-dev', true),
    pinned: 0,
    unpinned: 0,
  }
}

function parseRequirementsTxt(content) {
  let runtime = 0
  let pinned = 0
  let unpinned = 0
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (!line || line.startsWith('-')) continue
    const match = line.match(/^([A-Za-z0-9_.\-[\] ]+?)\s*(?:\[[^\]]*\])?\s*(==|>=|<=|~=|!=|>|<|$)/)
    if (!match) continue
    runtime += 1
    if (match[2] === '==') pinned += 1
    else unpinned += 1
  }
  return { ecosystem: 'pip', declaredLicense: null, runtime, development: 0, pinned, unpinned }
}

function parseGoMod(content) {
  let runtime = 0
  const block = content.match(/require\s*\(([\s\S]*?)\)/)
  if (block) {
    runtime += block[1]
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('//')).length
  }
  for (const line of content.split(/\r?\n/)) {
    if (/^require\s+[^\s(]+\s+v/.test(line.trim())) runtime += 1
  }
  return { ecosystem: 'go', declaredLicense: null, runtime, development: 0, pinned: 0, unpinned: 0 }
}

function parseCargoToml(content) {
  const section = (name) => {
    const match = content.match(new RegExp(`\\[${name}\\]\\s*([\\s\\S]*?)(?=\\n\\[|$)`))
    return match ? match[1] : ''
  }
  const count = (text) =>
    text.split(/\r?\n/).filter((line) => /^[A-Za-z0-9_-]+\s*=/.test(line.trim())).length
  const license =
    content.match(/^\s*license\s*=\s*"([^"]+)"/m)?.[1] ||
    content.match(/^\s*license-file\s*=\s*"([^"]+)"/m)?.[1] ||
    null
  return {
    ecosystem: 'cargo',
    declaredLicense: license,
    runtime: count(section('dependencies')),
    development: count(section('dev-dependencies')),
    pinned: 0,
    unpinned: 0,
  }
}

function parseGemfile(content) {
  const gems = content.match(/^\s*gem\s+['"][^'"]+['"]/gm) || []
  return {
    ecosystem: 'bundler',
    declaredLicense: null,
    runtime: gems.length,
    development: 0,
    pinned: 0,
    unpinned: 0,
  }
}

function parsePomXml(content) {
  const blocks = content.match(/<dependency>[\s\S]*?<\/dependency>/g) || []
  const license =
    content.match(/<licenses>[\s\S]*?<name>\s*([^<]+)\s*<\/name>/)?.[1]?.trim() || null
  return {
    ecosystem: 'maven',
    declaredLicense: license,
    runtime: blocks.length,
    development: 0,
    pinned: 0,
    unpinned: 0,
  }
}

function parsePyproject(content) {
  const section = content.match(/\[project\]\s*([\s\S]*?)(?=\n\[|$)/)?.[1] || ''
  const deps = section.match(/dependencies\s*=\s*\[([\s\S]*?)\]/)?.[1] || ''
  const runtime = (deps.match(/["'][^"']+["']/g) || []).length
  const license =
    section.match(/^\s*license\s*=\s*"([^"]+)"/m)?.[1] ||
    section.match(/^\s*license\s*=\s*\{\s*text\s*=\s*"([^"]+)"/m)?.[1] ||
    null
  return {
    ecosystem: 'python',
    declaredLicense: license,
    runtime,
    development: 0,
    pinned: 0,
    unpinned: 0,
  }
}

const PARSERS = {
  'package.json': parsePackageJson,
  'composer.json': parseComposerJson,
  'requirements.txt': parseRequirementsTxt,
  'go.mod': parseGoMod,
  'cargo.toml': parseCargoToml,
  gemfile: parseGemfile,
  'pom.xml': parsePomXml,
  'pyproject.toml': parsePyproject,
}

function detectLockfiles(treePaths) {
  const lower = (treePaths || []).map((path) => String(path).toLowerCase())
  return (ecosystem) => {
    const candidates = LOCKFILES[ecosystem] || []
    return lower.some((path) =>
      candidates.some((name) => path === name || path.endsWith(`/${name}`)),
    )
  }
}

export function auditDependencies(files, treePaths = []) {
  const manifests = []
  const issues = []

  for (const file of files || []) {
    const name = baseName(file.path)
    if (PARSERS[name]) {
      const parser = PARSERS[name]
      try {
        const parsed = parser(asText(file))
        manifests.push({ path: file.path, ...parsed, total: parsed.runtime + parsed.development })
      } catch {
        manifests.push({
          path: file.path,
          ecosystem: MANIFESTS[name] || null,
          declaredLicense: null,
          runtime: 0,
          development: 0,
          pinned: 0,
          unpinned: 0,
          total: 0,
          parseError: true,
        })
      }
    }
  }

  const runtime = manifests.reduce((sum, manifest) => sum + (manifest.runtime || 0), 0)
  const development = manifests.reduce((sum, manifest) => sum + (manifest.development || 0), 0)
  const pinned = manifests.reduce((sum, manifest) => sum + (manifest.pinned || 0), 0)
  const unpinned = manifests.reduce((sum, manifest) => sum + (manifest.unpinned || 0), 0)
  const ecosystems = [...new Set(manifests.map((manifest) => manifest.ecosystem).filter(Boolean))]
  const declaredLicense =
    manifests.find((manifest) => manifest.declaredLicense)?.declaredLicense || null
  const hasLockfile = detectLockfiles(treePaths)

  const ecosystemsMissingLockfile = ecosystems.filter(
    (ecosystem) =>
      LOCKFILES[ecosystem] && manifestFor(manifests, ecosystem) && !hasLockfile(ecosystem),
  )

  if (ecosystemsMissingLockfile.length) {
    issues.push({
      id: 'missing-lockfile',
      tone: 'warning',
      label: 'No lockfile found',
      detail: `No lockfile matched ${ecosystemsMissingLockfile.join(', ')}. Installs may resolve different dependency versions over time.`,
    })
  }
  if (unpinned > 0) {
    issues.push({
      id: 'unpinned-dependencies',
      tone: 'info',
      label: `${unpinned} dependency range${unpinned === 1 ? '' : 's'} not pinned`,
      detail: 'Version ranges let patch or minor releases change without a code review.',
    })
  }
  if (manifests.some((manifest) => manifest.parseError)) {
    issues.push({
      id: 'manifest-parse-failed',
      tone: 'notice',
      label: 'A manifest could not be parsed',
      detail:
        'Only the first 200 KB of each manifest is read; truncated or unusual formats may be skipped.',
    })
  }
  if (!manifests.length) {
    issues.push({
      id: 'no-manifest',
      tone: 'notice',
      label: 'No dependency manifest analyzed',
      detail:
        'No supported manifest (package.json, requirements.txt, go.mod, Cargo.toml, Gemfile, composer.json, pom.xml, pyproject.toml) was included in the analyzed files.',
    })
  }

  return {
    manifests,
    ecosystems,
    runtime,
    development,
    total: runtime + development,
    pinned,
    unpinned,
    declaredLicense,
    lockfiles: ecosystems
      .filter((ecosystem) => LOCKFILES[ecosystem])
      .map((ecosystem) => ({ ecosystem, present: hasLockfile(ecosystem) })),
    issues,
  }
}

function manifestFor(manifests, ecosystem) {
  return manifests.some((manifest) => manifest.ecosystem === ecosystem)
}

const ACTIVITY = [
  {
    id: 'active',
    label: 'Active',
    maxDays: 90,
    tone: 'good',
    detail: 'Pushed to within the last 90 days.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    maxDays: 365,
    tone: 'neutral',
    detail: 'Last push was within the last year.',
  },
  { id: 'stale', label: 'Stale', maxDays: 730, tone: 'warning', detail: 'No push in over a year.' },
  {
    id: 'dormant',
    label: 'Dormant',
    maxDays: Infinity,
    tone: 'danger',
    detail: 'No push in over two years.',
  },
]

export function buildHealthSignals(repo, { now = Date.now() } = {}) {
  const pushedAt = repo?.pushedAt ? new Date(repo.pushedAt) : null
  const validPushed = pushedAt && Number.isFinite(pushedAt.getTime())
  const daysSincePush = validPushed
    ? Math.max(0, Math.floor((now - pushedAt.getTime()) / 86_400_000))
    : null
  const activity =
    daysSincePush === null
      ? {
          id: 'unknown',
          label: 'Unknown',
          tone: 'neutral',
          detail: 'The repository has no push timestamp.',
        }
      : ACTIVITY.find((entry) => daysSincePush <= entry.maxDays) || ACTIVITY[ACTIVITY.length - 1]
  const stars = Number(repo?.stars || 0)
  const forks = Number(repo?.forks || 0)
  const openIssues = Number(repo?.openIssues || 0)
  const openIssueRatio = stars > 0 ? Math.round((openIssues / stars) * 100) / 100 : null

  const signals = [
    {
      id: 'activity',
      label: 'Maintenance activity',
      value: activity.label,
      tone: activity.tone,
      detail:
        daysSincePush === null
          ? activity.detail
          : `${activity.detail} Last push ${daysSincePush} day${daysSincePush === 1 ? '' : 's'} ago.`,
    },
    repo?.archived
      ? {
          id: 'archived',
          label: 'Archived',
          value: 'Yes',
          tone: 'danger',
          detail: 'The owner archived this repository; it is read-only and receives no updates.',
        }
      : {
          id: 'archived',
          label: 'Archived',
          value: 'No',
          tone: 'good',
          detail: 'The repository is not archived.',
        },
    repo?.license
      ? {
          id: 'license',
          label: 'License',
          value: repo.license,
          tone: 'good',
          detail: 'A license is declared in the repository metadata.',
        }
      : {
          id: 'license',
          label: 'License',
          value: 'Not declared',
          tone: 'warning',
          detail: 'No license was declared. Reuse and resale rights are ambiguous without one.',
        },
    {
      id: 'community',
      label: 'Community interest',
      value: `${stars.toLocaleString('en-US')} stars · ${forks.toLocaleString('en-US')} forks`,
      tone: stars >= 100 ? 'good' : stars >= 10 ? 'neutral' : 'warning',
      detail:
        forks > 0
          ? `${forks} fork${forks === 1 ? '' : 's'} suggest some external reuse.`
          : 'No forks recorded.',
    },
    {
      id: 'issues',
      label: 'Open issues',
      value: `${openIssues.toLocaleString('en-US')}${openIssueRatio !== null ? ` (${openIssueRatio}× stars)` : ''}`,
      tone: openIssues > 500 ? 'warning' : 'neutral',
      detail:
        openIssueRatio !== null
          ? `${openIssueRatio} open issues per star. A high ratio can indicate unresolved maintenance work.`
          : 'No star baseline, so the issue-to-star ratio is not meaningful.',
    },
    repo?.isFork
      ? {
          id: 'fork',
          label: 'Fork',
          value: 'Yes',
          tone: 'neutral',
          detail: 'This repository is a fork of another project.',
        }
      : { id: 'fork', label: 'Fork', value: 'No', tone: 'good', detail: 'This is not a fork.' },
  ]

  return {
    archived: Boolean(repo?.archived),
    isFork: Boolean(repo?.isFork),
    license: repo?.license || null,
    stars,
    forks,
    openIssues,
    openIssueRatio,
    lastPushAt: validPushed ? pushedAt.toISOString() : null,
    daysSincePush,
    activity: activity.id,
    sizeKb: Number(repo?.size || 0),
    createdAt: repo?.createdAt || null,
    signals,
  }
}
