const startedAt = new Date().toISOString()
const scopes = new Map()

export function recordThrottle(key, label) {
  if (!key) return
  const entry = scopes.get(key) || { key, label: label || key, count: 0, lastHitAt: null }
  entry.count += 1
  entry.lastHitAt = new Date().toISOString()
  if (label) entry.label = label
  scopes.set(key, entry)
}

export function getThrottleStats() {
  const entries = [...scopes.values()].sort((a, b) => b.count - a.count)
  return {
    total: entries.reduce((sum, entry) => sum + entry.count, 0),
    since: startedAt,
    scopes: entries,
  }
}

export function resetThrottleStats() {
  scopes.clear()
}
