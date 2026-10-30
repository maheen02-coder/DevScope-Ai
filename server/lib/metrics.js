import client from 'prom-client'
import { getDb } from '../db.js'

export const registry = new client.Registry()

client.collectDefaultMetrics({
  register: registry,
  prefix: 'devscope_',
})

export const httpRequestsTotal = new client.Counter({
  name: 'devscope_http_requests_total',
  help: 'HTTP requests by method, route, and status.',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
})

export const httpRequestDuration = new client.Histogram({
  name: 'devscope_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10, 30, 90],
  registers: [registry],
})

export const analysisTotal = new client.Counter({
  name: 'devscope_analysis_total',
  help: 'AI analyses by outcome.',
  labelNames: ['status'],
  registers: [registry],
})

export const chatTurnTotal = new client.Counter({
  name: 'devscope_chat_turns_total',
  help: 'Chat turns by outcome.',
  labelNames: ['status'],
  registers: [registry],
})

const dbGauges = [
  ['devscope_users_total', 'Registered users.', 'SELECT COUNT(*) AS value FROM users'],
  ['devscope_reports_total', 'Stored reports.', 'SELECT COUNT(*) AS value FROM reports'],
  [
    'devscope_chat_messages_total',
    'Stored chat messages.',
    'SELECT COUNT(*) AS value FROM chat_messages',
  ],
  [
    'devscope_active_shares_total',
    'Active share links.',
    "SELECT COUNT(*) AS value FROM report_shares WHERE revoked_at IS NULL AND expires_at > datetime('now')",
  ],
]

for (const [name, help, query] of dbGauges) {
  new client.Gauge({
    name,
    help,
    registers: [registry],
    collect() {
      try {
        this.set(getDb().prepare(query).get()?.value ?? 0)
      } catch {
        this.set(0)
      }
    },
  })
}

function routeLabel(req) {
  if (req.route?.path) return `${req.baseUrl || ''}${req.route.path}` || req.route.path
  return req.baseUrl || 'unmatched'
}

export function metricsMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint()
  res.on('finish', () => {
    const route = routeLabel(req)
    const labels = { method: req.method, route, status: String(res.statusCode) }
    httpRequestsTotal.inc(labels)
    const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9
    httpRequestDuration.observe(labels, seconds)
  })
  next()
}
