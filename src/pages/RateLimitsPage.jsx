import { useEffect, useState } from 'react'
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import {
  Activity,
  ArrowUpRight,
  Gauge,
  GitBranch,
  MessageSquare,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
} from 'lucide-react'
import clsx from 'clsx'
import { errorMessage } from '../lib/api.js'
import { formatDateTime, formatNumber, pluralize, timeAgo } from '../lib/format.js'
import { usePageTitle, useRateLimits } from '../lib/hooks.js'
import {
  Alert,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from '../components/ui.jsx'

ChartJS.register(BarElement, CategoryScale, LinearScale, Legend, Tooltip)

const ACCENT = '#78bdd2'
const GRID = 'rgba(148, 180, 196, 0.09)'
const MUTED = '#879caa'

const hourFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric' })

function formatWindow(ms) {
  const minutes = Math.round(Number(ms) / 60_000)
  if (minutes >= 60) return `${minutes / 60} h`
  return `${minutes} min`
}

function hourLabel(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : hourFormatter.format(date)
}

function remainingClock(resetsAt, now) {
  if (!resetsAt) return null
  const diff = new Date(resetsAt).getTime() - now
  if (Number.isNaN(diff)) return null
  if (diff <= 0) return 'now'
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1000)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function useClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function QuotaLedger({ icon: Icon, label, bucket, denied, note }) {
  const now = useClock()
  const percent =
    bucket.limit > 0 ? Math.min(100, Math.round((bucket.used / bucket.limit) * 100)) : 0
  const remaining = Math.max(0, bucket.remaining ?? bucket.limit - bucket.used)
  const exhausted = remaining === 0
  const clock = remainingClock(bucket.resetsAt, now)
  const toneClass = exhausted ? 'danger' : percent >= 75 ? 'warning' : ''

  return (
    <div className="quota-ledger">
      <div className="quota-ledger__head">
        <span className="quota-ledger__label">
          <Icon size={15} aria-hidden="true" />
          {label}
        </span>
        <span className={clsx('badge', exhausted ? 'badge--rose' : 'badge--mint')}>
          {exhausted ? 'Exhausted' : 'Available'}
        </span>
      </div>

      <div className="quota-ledger__figures">
        <div className="quota-ledger__figure">
          <strong>{formatNumber(remaining)}</strong>
          <span>of {formatNumber(bucket.limit)} left</span>
        </div>
        <div className="quota-ledger__reset">
          <TimerReset size={14} aria-hidden="true" />
          <span>{clock ? `Next slot in ${clock}` : 'No slot consumed yet'}</span>
        </div>
      </div>

      <div className="quota-ledger__track">
        <div
          className={clsx('quota-ledger__fill', toneClass && `quota-ledger__fill--${toneClass}`)}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="quota-ledger__foot">
        <span>
          {bucket.used} used · {percent}% of window
        </span>
        <span>
          {denied ? `${formatNumber(denied)} denied since boot` : 'No denials since boot'}
        </span>
      </div>

      <p className="quota-ledger__note">{note}</p>
    </div>
  )
}

function PolicyTable({ policies, throttle, enforced }) {
  const hits = new Map(throttle.scopes.map((entry) => [entry.key, entry]))

  return (
    <div className="policy-table" role="table" aria-label="Endpoint rate-limit policies">
      <div className="policy-row policy-row--head" role="row">
        <span role="columnheader">Policy</span>
        <span role="columnheader">Scope</span>
        <span role="columnheader">Window</span>
        <span role="columnheader">Limit</span>
        <span role="columnheader">Throttled</span>
        <span role="columnheader">Status</span>
      </div>
      {policies.map((policy) => {
        const entry = hits.get(policy.key)
        return (
          <div className="policy-row" role="row" key={policy.key}>
            <div className="policy-cell policy-cell--policy" role="cell">
              <strong>{policy.label}</strong>
              <span>{policy.description}</span>
            </div>
            <code className="policy-cell policy-cell--scope" role="cell">
              {policy.scope}
            </code>
            <span className="policy-cell" role="cell" data-label="Window">
              {formatWindow(policy.windowMs)}
            </span>
            <span className="policy-cell policy-cell--num" role="cell" data-label="Limit">
              {formatNumber(policy.limit)}
            </span>
            <span
              className={clsx('policy-cell', 'policy-cell--num', entry && 'policy-cell--hit')}
              role="cell"
              data-label="Throttled"
            >
              {formatNumber(entry?.count ?? 0)}
            </span>
            <span className="policy-cell" role="cell" data-label="Status">
              <span className={clsx('badge', enforced ? 'badge--mint' : 'badge--muted')}>
                {enforced ? 'Enforced' : 'Off'}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function RateLimitsPage() {
  usePageTitle('Rate limits')
  const { data: report, isLoading, isError, error, refetch } = useRateLimits()

  if (isLoading) {
    return (
      <div className="page">
        <LoadingState label="Reading the current guardrails…" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="page">
        <ErrorState
          title="Could not load the rate-limit report"
          message={errorMessage(error)}
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  const { quota, timeline, policies, throttle, github } = report
  const analysis = quota.analysis
  const chat = quota.chat
  const throttles = new Map(throttle.scopes.map((entry) => [entry.key, entry]))
  const quotaUsed = timeline.reduce((sum, bucket) => sum + bucket.analysis + bucket.chat, 0)
  const githubPercent =
    github.limit && typeof github.remaining === 'number'
      ? Math.max(0, Math.min(100, Math.round((github.remaining / github.limit) * 100)))
      : null

  const timelineTotal = timeline.reduce(
    (totals, bucket) => ({
      analysis: totals.analysis + bucket.analysis,
      chat: totals.chat + bucket.chat,
    }),
    { analysis: 0, chat: 0 },
  )

  const timelineData = {
    labels: timeline.map((bucket) => hourLabel(bucket.start)),
    datasets: [
      {
        label: 'Analyses',
        data: timeline.map((bucket) => bucket.analysis),
        backgroundColor: ACCENT,
        borderRadius: 4,
        stack: 'usage',
      },
      {
        label: 'Chat messages',
        data: timeline.map((bucket) => bucket.chat),
        backgroundColor: 'rgba(121, 194, 178, 0.78)',
        borderRadius: 4,
        stack: 'usage',
      },
    ],
  }

  return (
    <div className="page limits-page">
      <PageHeader
        eyebrow={
          <>
            Governance<span className="accent">·</span> Rate limits
          </>
        }
        title="The guardrails holding your workspace steady"
        description="Rolling daily quotas, endpoint throttles, and the GitHub API budget — every figure is measured live by the DevScope server."
        actions={
          <>
            <Button variant="secondary" leftIcon={RefreshCw} onClick={() => refetch()}>
              Refresh
            </Button>
            <a href="/api/docs" target="_blank" rel="noreferrer" className="btn btn-primary">
              API reference
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </>
        }
      />

      {!report.enforced ? (
        <div className="banner-stack">
          <Alert tone="info" title="Endpoint throttling is paused here">
            This server runs with <code>RATE_LIMIT_ENABLED=false</code>. The rolling daily quotas
            below are still enforced, and the policy table shows what production will apply.
          </Alert>
        </div>
      ) : null}

      <div className="stat-grid">
        <StatCard
          label="Analyses left"
          value={formatNumber(analysis.remaining)}
          icon={ScanSearch}
          accent="accent"
          hint={`of ${formatNumber(analysis.limit)} per ${report.windowHours}h window`}
        />
        <StatCard
          label="Chat messages left"
          value={formatNumber(chat.remaining)}
          icon={MessageSquare}
          accent="mint"
          hint={`of ${formatNumber(chat.limit)} per ${report.windowHours}h window`}
        />
        <StatCard
          label="Throttled responses"
          value={formatNumber(throttle.total)}
          icon={ShieldAlert}
          accent="amber"
          hint={`On this API process since ${formatDateTime(throttle.since)}`}
        />
        <StatCard
          label="GitHub API budget"
          value={typeof github.remaining === 'number' ? formatNumber(github.remaining) : '—'}
          icon={GitBranch}
          accent="violet"
          hint={
            github.limit
              ? `of ${formatNumber(github.limit)} calls in this hourly bucket`
              : github.configured
                ? 'Token configured · awaiting the first GitHub call'
                : 'Anonymous access · not measured yet'
          }
        />
      </div>

      <div className="limits-grid">
        <section className="card limits-ledger">
          <div className="card__header">
            <div className="card__title">
              <Gauge size={16} aria-hidden="true" />
              Rolling quota ledger
            </div>
            <span className="hint">{report.windowHours} hour window</span>
          </div>
          <div className="card__body">
            <QuotaLedger
              icon={ScanSearch}
              label="Repository analyses"
              bucket={analysis}
              denied={throttles.get('quota-analysis')?.count ?? 0}
              note="A slot is claimed before the AI call and released if the provider fails, so errors never cost usage."
            />
            <QuotaLedger
              icon={MessageSquare}
              label="AI chat messages"
              bucket={chat}
              denied={throttles.get('quota-chat')?.count ?? 0}
              note="Each chat turn consumes one slot. The oldest event leaves the window first, opening the next slot."
            />
          </div>
        </section>

        <section className="card limits-contract">
          <div className="card__header">
            <div className="card__title">
              <ShieldCheck size={16} aria-hidden="true" />
              When a limit is reached
            </div>
            <span className={clsx('badge', report.enforced ? 'badge--mint' : 'badge--amber')}>
              {report.enforced ? 'Enforcing now' : 'Paused'}
            </span>
          </div>
          <div className="card__body">
            <ul className="contract-list">
              <li>
                <strong>Endpoint throttle</strong>
                <span>
                  429 · <code>RATE_LIMITED</code>, with <code>RateLimit</code> and{' '}
                  <code>RateLimit-Policy</code> headers describing the bucket (draft-8).
                </span>
              </li>
              <li>
                <strong>Daily quota</strong>
                <span>
                  429 · <code>QUOTA_EXCEEDED</code>, with the reset moment included so a client can
                  wait precisely.
                </span>
              </li>
              <li>
                <strong>Provider failure</strong>
                <span>
                  The claimed slot is released, keeping a failed run from consuming quota.
                </span>
              </li>
              <li>
                <strong>Counter scope</strong>
                <span>
                  Throttle tallies are process-wide and reset when the API restarts; quotas persist
                  in SQLite.
                </span>
              </li>
            </ul>
            <div className="limits-contract__foot">
              <span className="hint">Session-cookie auth · JSON envelope</span>
              <a href="/api/docs" target="_blank" rel="noreferrer" className="link">
                Read the contract
                <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </div>

      <div className="limits-analytics">
        <section className="card chart-card">
          <div className="card__header">
            <div className="card__title">
              <Activity size={16} aria-hidden="true" />
              Quota consumed per hour
            </div>
            <span className="hint">
              {pluralize(timelineTotal.analysis, 'analysis', 'analyses')} ·{' '}
              {pluralize(timelineTotal.chat, 'message')}
            </span>
          </div>
          <div className="card__body">
            <div className="chart-frame">
              {quotaUsed > 0 ? (
                <Bar
                  data={timelineData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    color: MUTED,
                    layout: { padding: { right: 10 } },
                    plugins: {
                      legend: {
                        labels: { color: MUTED, boxWidth: 10, boxHeight: 10, usePointStyle: true },
                      },
                      tooltip: {
                        backgroundColor: '#08111a',
                        borderColor: '#1a3040',
                        borderWidth: 1,
                        callbacks: {
                          title(items) {
                            const bucket = timeline[items[0]?.dataIndex]
                            return bucket ? formatDateTime(bucket.start) : ''
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        stacked: true,
                        grid: { color: GRID },
                        ticks: {
                          color: MUTED,
                          autoSkip: false,
                          maxRotation: 0,
                          callback(value, index) {
                            if (index === timeline.length - 1) return 'Now'
                            return index % 4 === 0 ? hourLabel(timeline[index].start) : ''
                          },
                        },
                      },
                      y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: GRID },
                        ticks: { color: MUTED, precision: 0 },
                      },
                    },
                  }}
                />
              ) : (
                <EmptyState
                  icon={Activity}
                  title="No quota consumed in this window"
                  description="Start an analysis or send a chat message and the hourly ledger will fill in here."
                />
              )}
            </div>
            <p className="hint limits-chart-note">
              Calendar hours in your local timezone. The newest bucket is still filling; quotas roll
              forward per event rather than resetting at midnight.
            </p>
          </div>
        </section>

        <section className="card limits-github">
          <div className="card__header">
            <div className="card__title">
              <GitBranch size={16} aria-hidden="true" />
              GitHub API budget
            </div>
            <span className={clsx('badge', github.configured ? 'badge--mint' : 'badge--muted')}>
              {github.configured ? 'Token' : 'Anonymous'}
            </span>
          </div>
          <div className="card__body">
            {typeof github.remaining === 'number' && github.limit ? (
              <>
                <div className="budget-head">
                  <div className="budget-figure">
                    <strong>{formatNumber(github.remaining)}</strong>
                    <span>of {formatNumber(github.limit)} calls left</span>
                  </div>
                  <span className="budget-percent">{githubPercent}%</span>
                </div>
                <div className="quota-ledger__track budget-track">
                  <div
                    className={clsx(
                      'quota-ledger__fill',
                      githubPercent <= 15 && 'quota-ledger__fill--danger',
                    )}
                    style={{ width: `${githubPercent}%` }}
                  />
                </div>
                <div className="fact-list budget-facts">
                  <div className="fact-row">
                    <span>Resets</span>
                    <span>{formatDateTime(github.resetAt)}</span>
                  </div>
                  <div className="fact-row">
                    <span>Last checked</span>
                    <span>{timeAgo(github.checkedAt)}</span>
                  </div>
                  <div className="fact-row">
                    <span>Authentication</span>
                    <span>{github.configured ? 'GITHUB_TOKEN' : 'Anonymous'}</span>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                icon={GitBranch}
                title="No GitHub call measured yet"
                description={
                  github.configured
                    ? 'A token is configured. The first GitHub response will reveal the remaining hourly budget here.'
                    : 'Open a repository or run an analysis; the next GitHub response reports the budget here.'
                }
              />
            )}
            <p className="hint limits-github__note">
              GitHub allows 60 anonymous requests per hour; a token raises that ceiling
              substantially. DevScope caches GitHub responses to conserve the budget.
            </p>
          </div>
        </section>
      </div>

      <section className="card limits-policies">
        <div className="card__header">
          <div className="card__title">
            <ShieldAlert size={16} aria-hidden="true" />
            Endpoint policies
          </div>
          <span className="hint">express-rate-limit · in-memory store</span>
        </div>
        <div className="card__body">
          <PolicyTable policies={policies} throttle={throttle} enforced={report.enforced} />
          <p className="hint limits-policies__note">
            Throttled counts are process-wide, not per account, and reset with the API. Daily quota
            denials appear in the ledger above.
          </p>
        </div>
      </section>
    </div>
  )
}
