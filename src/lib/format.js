const numberFormatter = new Intl.NumberFormat('en-US')
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return '0'
  const number = Number(value)
  return Math.abs(number) >= 10_000
    ? compactFormatter.format(number)
    : numberFormatter.format(number)
}

export function formatMoney(value, currency = 'USD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  const code = /^[A-Z]{3}$/.test(String(currency || '').toUpperCase())
    ? String(currency).toUpperCase()
    : 'USD'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `$${numberFormatter.format(Math.round(amount))}`
  }
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return relativeFormatter.format(seconds, 'second')
  if (abs < 3600) return relativeFormatter.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relativeFormatter.format(Math.round(seconds / 3600), 'hour')
  if (abs < 2_592_000) return relativeFormatter.format(Math.round(seconds / 86_400), 'day')
  if (abs < 31_536_000) return relativeFormatter.format(Math.round(seconds / 2_592_000), 'month')
  return relativeFormatter.format(Math.round(seconds / 31_536_000), 'year')
}

export function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const size = value / 1024 ** index
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`
}

export function formatDuration(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value < 1000) return `${Math.round(value)}ms`
  return `${(value / 1000).toFixed(1)}s`
}

export function formatReset(value) {
  if (!value) return null
  const date = new Date(value)
  const diff = date.getTime() - Date.now()
  if (diff <= 0) return 'now'
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${Math.max(1, minutes)}m`
}

export function initials(value) {
  return String(value || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function hasScore(value) {
  if (value === null || value === undefined || value === '') return false
  return Number.isFinite(Number(value))
}

export function scoreTone(score) {
  if (!hasScore(score)) return { color: 'var(--text-muted)', tone: 'muted', label: 'Not scored' }
  const value = Number(score)
  if (value >= 80) return { color: 'var(--mint)', tone: 'good', label: 'Strong' }
  if (value >= 60) return { color: 'var(--accent)', tone: 'fair', label: 'Solid' }
  if (value >= 40) return { color: 'var(--amber)', tone: 'warning', label: 'Needs work' }
  return { color: 'var(--rose)', tone: 'poor', label: 'At risk' }
}

export const severityRank = { high: 3, medium: 2, low: 1 }

export function severityBadgeTone(severity) {
  if (severity === 'high') return 'rose'
  if (severity === 'medium') return 'amber'
  return 'muted'
}

export function timeGreeting() {
  const hour = new Date().getHours()
  if (hour < 5) return 'Working late'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function parseRepoInput(input) {
  const trimmed = String(input || '').trim()
  if (!trimmed) return null
  const urlMatch = /github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(trimmed)
  let owner
  let repo
  if (urlMatch) {
    owner = urlMatch[1]
    repo = urlMatch[2]
  } else if (trimmed.includes('/')) {
    const parts = trimmed.split('/')
    if (parts.length !== 2) return null
    ;[owner, repo] = parts
  } else {
    return null
  }
  repo = String(repo).replace(/\.git$/i, '')
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})$/.test(owner)) return null
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) return null
  return { owner, repo }
}

const languageColors = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  Ruby: '#701516',
  'C++': '#f34b7d',
  C: '#8c8c8c',
  'C#': '#178600',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#a855f7',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Scala: '#c22d40',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Lua: '#5b8bd0',
  'Jupyter Notebook': '#DA5B0B',
  R: '#198CE7',
  Perl: '#0298c3',
  'Objective-C': '#438eff',
  Dockerfile: '#384d54',
  Makefile: '#427819',
}

export function languageColor(language) {
  return languageColors[language] || '#7c9cff'
}

export function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`
}
