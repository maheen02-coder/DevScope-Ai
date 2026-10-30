import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  BarChart3,
  BadgeDollarSign,
  Compass,
  FileText,
  FolderGit2,
  MessageSquare,
  MessagesSquare,
  ScanSearch,
  ScrollText,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'
import { api, errorMessage } from '../lib/api.js'
import {
  formatMoney,
  formatNumber,
  languageColor,
  parseRepoInput,
  pluralize,
  scoreTone,
  timeAgo,
  timeGreeting,
} from '../lib/format.js'
import { usePageTitle } from '../lib/hooks.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from '../components/ui.jsx'
import { ReportRow } from '../components/Cards.jsx'
import { AiConfigNotice } from '../components/SystemNotices.jsx'

function TrendChart({ points }) {
  const width = 320
  const height = 96
  const pad = 8
  const scores = points.map((point) => point.overall)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min || 1
  const coords = scores.map((score, index) => ({
    x: points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2),
    y: pad + (1 - (score - min) / range) * (height - pad * 2),
    score,
  }))
  const line = coords.map((coord) => `${coord.x},${coord.y}`).join(' ')
  const area = `M ${coords[0].x},${height - pad} L ${coords
    .map((coord) => `${coord.x},${coord.y}`)
    .join(' L ')} L ${coords[coords.length - 1].x},${height - pad} Z`

  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Score trend across ${pluralize(points.length, 'analysis', 'analyses')}, from ${scores[0]} to ${scores[scores.length - 1]}`}
    >
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#78bdd2" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#78bdd2" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line
          key={ratio}
          x1={pad}
          y1={pad + ratio * (height - pad * 2)}
          x2={width - pad}
          y2={pad + ratio * (height - pad * 2)}
          stroke="rgba(148,180,196,0.09)"
          strokeWidth="1"
        />
      ))}
      <path d={area} fill="url(#trend-fill)" />
      <polyline
        points={line}
        fill="none"
        stroke="#78bdd2"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.map((coord) => (
        <circle
          key={`${coord.x}-${coord.y}`}
          cx={coord.x}
          cy={coord.y}
          r="2.4"
          fill="#04070a"
          stroke="#78bdd2"
          strokeWidth="1.6"
        >
          <title>{coord.score}/100</title>
        </circle>
      ))}
    </svg>
  )
}

export default function DashboardPage() {
  usePageTitle('Overview')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [repoInput, setRepoInput] = useState('')
  const [inputError, setInputError] = useState(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
  })

  const languages = useMemo(() => {
    const list = data?.languages || []
    const max = Math.max(1, ...list.map((entry) => entry.count))
    return list.map((entry) => ({ ...entry, percent: Math.round((entry.count / max) * 100) }))
  }, [data?.languages])

  function startAnalysis(event) {
    event.preventDefault()
    const parsed = parseRepoInput(repoInput)
    if (!parsed) {
      setInputError('Enter a repository as owner/repo or a full GitHub URL.')
      return
    }
    setInputError(null)
    navigate(`/r/${parsed.owner}/${parsed.repo}`)
  }

  if (isLoading) {
    return (
      <div className="page">
        <LoadingState label="Loading your workspace…" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="page">
        <ErrorState
          title="Could not load your dashboard"
          message={errorMessage(error)}
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  const stats = data.stats
  const average = data.averageScore
  const averageTone = scoreTone(average)
  const valuation = data.valuation
  const firstName = user?.name?.split(' ')[0]

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <>
            {timeGreeting()}
            {firstName ? `, ${firstName}` : ''}
            <span className="accent">·</span> Workspace overview
          </>
        }
        title="Repository intelligence, at a glance"
        description="Track what you have analyzed, revisit saved reports, and jump back into a conversation with the codebase."
        actions={
          <>
            <Link to="/reports?filter=saved" className="btn btn-secondary">
              <Star size={15} aria-hidden="true" />
              Saved reports
            </Link>
            <Link to="/explore" className="btn btn-primary">
              <Compass size={15} aria-hidden="true" />
              Explore GitHub
            </Link>
          </>
        }
      />

      <div className="banner-stack">
        <AiConfigNotice />
      </div>

      <div className="stat-grid">
        <StatCard
          label="Reports generated"
          value={formatNumber(stats.total)}
          icon={ScanSearch}
          accent="accent"
          hint={`${stats.recentAnalyses} in the last 30 days`}
        />
        <StatCard
          label="Saved reports"
          value={formatNumber(stats.saved)}
          icon={Star}
          accent="mint"
          hint={
            stats.total === 0
              ? 'Save reports to build your library'
              : stats.saved === stats.total
                ? 'All reports saved'
                : `${stats.total - stats.saved} not saved yet`
          }
        />
        <StatCard
          label="Repositories covered"
          value={formatNumber(stats.repos)}
          icon={FolderGit2}
          accent="violet"
          hint={`${stats.conversations} chat threads`}
        />
        <StatCard
          label="Average score"
          value={average === null ? '—' : `${average}`}
          icon={BarChart3}
          accent="amber"
          hint={
            average === null ? (
              'Run an analysis to establish a baseline'
            ) : (
              <span style={{ color: averageTone.color }}>
                {averageTone.label} across recent reports
              </span>
            )
          }
        />
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="card__header">
          <div className="card__title">
            <BadgeDollarSign size={16} aria-hidden="true" />
            Project valuation
          </div>
          <span className="badge badge--violet">AI estimate</span>
        </div>
        <div className="card__body">
          {valuation?.reports ? (
            <>
              <div className="valuation-summary">
                <div className="valuation-figure">
                  <span className="valuation-figure__label">Average suggested ask</span>
                  <strong>{formatMoney(valuation.averageSuggestedAsk, valuation.currency)}</strong>
                  <span className="hint">
                    across {pluralize(valuation.reports, 'report')} with a valuation
                  </span>
                </div>
                <div className="valuation-figure valuation-figure--accent">
                  <span className="valuation-figure__label">Average rebuild cost</span>
                  <strong>{formatMoney(valuation.averageBuildPrice, valuation.currency)}</strong>
                  <span className="hint">freelance build from scratch, estimated</span>
                </div>
                <div className="valuation-figure">
                  <span className="valuation-figure__label">Combined sale range</span>
                  <strong>
                    {formatMoney(valuation.totalLow, valuation.currency)} –{' '}
                    {formatMoney(valuation.totalHigh, valuation.currency)}
                  </strong>
                  <span className="hint">sum of each report&apos;s low and high estimate</span>
                </div>
              </div>
              <div
                className="row"
                style={{
                  gap: 10,
                  marginTop: 18,
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                }}
              >
                {valuation.topOpportunity ? (
                  <Link to={`/analysis/${valuation.topOpportunity.id}`} className="link">
                    Highest suggested ask: {valuation.topOpportunity.repoFullName} ·{' '}
                    {formatMoney(valuation.topOpportunity.suggestedAsk, valuation.currency)}
                  </Link>
                ) : (
                  <span />
                )}
                <span className="hint">
                  Estimates, not appraisals. No sale price is guaranteed.
                </span>
              </div>
              {valuation.mixedCurrencies ? (
                <p className="hint" style={{ marginTop: 10 }}>
                  Your reports use multiple currencies ({valuation.currencies.join(', ')}). Totals
                  above include only {valuation.currency} reports; open each report for its own
                  figure.
                </p>
              ) : null}
            </>
          ) : (
            <p className="hint">
              Run an analysis to see an estimated selling price, rebuild cost, and suggested asking
              price. These are AI estimates with stated assumptions — not verified appraisals.
            </p>
          )}
        </div>
      </section>

      <div className="dash-grid">
        <div className="dash-col">
          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <FileText size={16} aria-hidden="true" />
                Recent analyses
              </div>
              <Link to="/reports" className="link" style={{ fontSize: 12 }}>
                View all
              </Link>
            </div>
            {data.recentReports.length ? (
              <div className="report-rows">
                {data.recentReports.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </div>
            ) : (
              <div className="card__body">
                <EmptyState
                  icon={ScanSearch}
                  title="No analyses yet"
                  description="Find a repository, inspect its files, and run your first AI analysis. It usually takes under a minute."
                  actions={
                    <Link to="/explore" className="btn btn-primary btn-sm">
                      Explore repositories
                    </Link>
                  }
                />
              </div>
            )}
          </section>

          <section className="quick-start">
            <div className="row" style={{ gap: 8, marginBottom: 4 }}>
              <Sparkles size={16} className="accent" aria-hidden="true" />
              <h2>Analyze a repository</h2>
            </div>
            <p>
              Paste an <code>owner/repo</code> pair or a GitHub URL. You will see the repository and
              its files before anything is sent to the AI.
            </p>
            <form className="quick-start__form" onSubmit={startAnalysis}>
              <div className="grow">
                <input
                  className="input"
                  value={repoInput}
                  onChange={(event) => {
                    setRepoInput(event.target.value)
                    setInputError(null)
                  }}
                  placeholder="e.g. vercel/next.js or https://github.com/facebook/react"
                  aria-label="Repository to analyze"
                  aria-invalid={inputError ? 'true' : undefined}
                />
                {inputError ? (
                  <span className="field-error" role="alert">
                    {inputError}
                  </span>
                ) : null}
              </div>
              <Button type="submit" variant="primary" leftIcon={ScanSearch}>
                Open
              </Button>
            </form>
            <div className="quick-actions">
              <Link to="/explore" className="quick-action">
                <Compass size={17} aria-hidden="true" />
                <strong>Search GitHub</strong>
                <span>Users, organizations, and repositories</span>
              </Link>
              <Link to="/chat" className="quick-action">
                <MessagesSquare size={17} aria-hidden="true" />
                <strong>Ask the copilot</strong>
                <span>Grounded answers about a repository</span>
              </Link>
              <Link to="/reports?filter=saved" className="quick-action">
                <ScrollText size={17} aria-hidden="true" />
                <strong>Saved reports</strong>
                <span>Your bookmarked analyses</span>
              </Link>
            </div>
          </section>
        </div>

        <div className="dash-col">
          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <TrendingUp size={16} aria-hidden="true" />
                Score trend
              </div>
              <span className="hint">
                {pluralize(data.scoreTrend.length, 'analysis', 'analyses')}
              </span>
            </div>
            <div className="card__body">
              {data.scoreTrend.length ? (
                <>
                  <div
                    className="row"
                    style={{ justifyContent: 'space-between', marginBottom: 10 }}
                  >
                    <div>
                      <div className="stat-card__label">Rolling average</div>
                      <div className="row" style={{ gap: 8 }}>
                        <span style={{ fontSize: 24, fontWeight: 620, color: averageTone.color }}>
                          {average}
                        </span>
                        <span className="badge badge--muted">{averageTone.label}</span>
                      </div>
                    </div>
                    <Activity size={18} style={{ color: averageTone.color }} aria-hidden="true" />
                  </div>
                  <TrendChart points={data.scoreTrend} />
                </>
              ) : (
                <div className="trend-empty">
                  Your score history will appear here after you analyze a repository.
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <BarChart3 size={16} aria-hidden="true" />
                Languages analyzed
              </div>
            </div>
            <div className="card__body">
              {languages.length ? (
                <div className="lang-list">
                  {languages.map((entry) => (
                    <div className="lang-row" key={entry.language}>
                      <div className="lang-row__head">
                        <span className="row" style={{ gap: 6 }}>
                          <i
                            className="lang-dot"
                            style={{ background: languageColor(entry.language) }}
                          />
                          {entry.language}
                        </span>
                        <span>{pluralize(entry.count, 'report')}</span>
                      </div>
                      <div className="lang-row__track">
                        <div
                          className="lang-row__fill"
                          style={{
                            width: `${entry.percent}%`,
                            background: languageColor(entry.language),
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hint">
                  Language distribution appears once your reports include language metadata.
                </p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <MessageSquare size={16} aria-hidden="true" />
                Recent conversations
              </div>
              <Link to="/chat" className="link" style={{ fontSize: 12 }}>
                Open chat
              </Link>
            </div>
            <div className="card__body">
              {data.conversations.length ? (
                <div className="list-plain">
                  {data.conversations.map((conversation) => (
                    <Link
                      key={conversation.repoFullName}
                      to={`/chat?owner=${encodeURIComponent(conversation.owner)}&repo=${encodeURIComponent(conversation.repo)}`}
                      className="list-item"
                      style={{ color: 'inherit' }}
                    >
                      <span className="list-item__icon accent">
                        <MessagesSquare size={15} aria-hidden="true" />
                      </span>
                      <div className="grow">
                        <h4 className="truncate">{conversation.repoFullName}</h4>
                        <p className="truncate">{conversation.lastMessage || 'No messages yet.'}</p>
                      </div>
                      <span className="hint nowrap">{timeAgo(conversation.lastAt)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="hint">
                  Open the AI chat and pick a repository to start a conversation grounded in its
                  files.
                </p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <Activity size={16} aria-hidden="true" />
                System status
              </div>
            </div>
            <div className="card__body">
              <div className="fact-list">
                <div className="fact-row">
                  <span>AI provider</span>
                  <span className="row" style={{ gap: 6 }}>
                    <span
                      className={clsx(
                        'badge',
                        data.systems.ai.configured ? 'badge--mint' : 'badge--amber',
                      )}
                    >
                      {data.systems.ai.configured ? 'Configured' : 'Missing key'}
                    </span>
                  </span>
                </div>
                <div className="fact-row">
                  <span>Model</span>
                  <span>{data.systems.ai.model}</span>
                </div>
                <div className="fact-row">
                  <span>GitHub access</span>
                  <span className="row" style={{ gap: 6 }}>
                    <span
                      className={clsx(
                        'badge',
                        data.systems.github.configured ? 'badge--mint' : 'badge--muted',
                      )}
                    >
                      {data.systems.github.configured ? 'Token' : 'Anonymous'}
                    </span>
                  </span>
                </div>
                <div className="fact-row">
                  <span>Rate limit</span>
                  <span>
                    {typeof data.systems.github.remaining === 'number'
                      ? `${data.systems.github.remaining} / ${data.systems.github.limit ?? '—'} left`
                      : 'Not measured yet'}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
