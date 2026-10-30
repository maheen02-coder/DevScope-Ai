import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BadgeDollarSign,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Files,
  Info,
  ShieldAlert,
} from 'lucide-react'
import { api, errorMessage } from '../lib/api.js'
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  pluralize,
  severityBadgeTone,
  timeAgo,
} from '../lib/format.js'
import { usePageTitle } from '../lib/hooks.js'
import { ErrorState, LoadingState, ScoreBar, ScoreRing } from '../components/ui.jsx'
import { Markdown } from '../components/Markdown.jsx'
import { Logo } from '../components/Logo.jsx'
import { RepoInsights } from '../components/RepoInsights.jsx'
import { FindingFiles } from '../components/FindingFiles.jsx'
import { OnboardingGuide } from '../components/OnboardingGuide.jsx'
import { ArchitectureMap } from '../components/ArchitectureMap.jsx'

const scoreLabels = [
  ['codeQuality', 'Code quality'],
  ['architecture', 'Architecture'],
  ['maintainability', 'Maintainability'],
  ['documentation', 'Documentation'],
  ['security', 'Security'],
  ['testing', 'Testing'],
]

const FALLBACK_DISCLAIMER =
  'AI estimate from model knowledge of typical software markets, not an appraisal or verified market data. No sale price is guaranteed.'

const severityLabel = { high: 'High', medium: 'Medium', low: 'Low' }

export default function SharedReportPage() {
  const { token } = useParams()
  usePageTitle('Shared report')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['shared-report', token],
    queryFn: () => api.get(`/public/reports/${token}`),
  })

  if (isLoading) {
    return (
      <div className="shared-page">
        <header className="shared-page__bar">
          <Logo to="/" />
          <span className="hint">Shared report</span>
        </header>
        <div className="page page--narrow">
          <LoadingState label="Opening the shared report…" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="shared-page">
        <header className="shared-page__bar">
          <Logo to="/" />
          <span className="hint">Shared report</span>
        </header>
        <div className="page page--narrow">
          <ErrorState
            title="This shared report is unavailable"
            message={errorMessage(error, 'The link may have expired or been revoked by its owner.')}
            onRetry={() => refetch()}
          />
          <p className="hint" style={{ marginTop: 16 }}>
            <Link to="/" className="link">
              Go to DevScope AI
            </Link>
          </p>
        </div>
      </div>
    )
  }

  const { report, share } = data
  const analysis = report.analysis || {}
  const scores = analysis.scores || {}
  const valuation = analysis.valuation
  const currency = valuation?.currency || 'USD'
  const meta = analysis.meta || {}
  const low = Number(valuation?.range?.low)
  const typical = Number(valuation?.range?.typical)
  const high = Number(valuation?.range?.high)
  const markerBase = high - low || 1
  const marker = Number.isFinite(typical)
    ? Math.min(100, Math.max(0, ((typical - low) / markerBase) * 100))
    : 50

  return (
    <div className="shared-page">
      <header className="shared-page__bar">
        <Logo to="/" />
        <span className="badge badge--violet">Shared report</span>
      </header>

      <main className="page page--narrow">
        <div className="page-head">
          <div className="page-head__main">
            <div className="page-head__eyebrow">
              <span className="accent">Read-only snapshot</span> ·{' '}
              {formatDateTime(report.createdAt)}
            </div>
            <h1 className="page-title">{report.repoFullName}</h1>
            <p className="page-sub">
              {report.depth === 'deep' ? 'Deep' : 'Standard'} analysis of{' '}
              {pluralize(report.filesAnalyzed, 'file')}
              {report.model ? ` using ${report.model}` : ''}. Shared read-only through DevScope AI.
            </p>
          </div>
        </div>

        <section className="card analysis-hero">
          <ScoreRing score={scores.overall} size="lg" label="Overall engineering score" />
          <div>
            <div className="row-wrap" style={{ gap: 7 }}>
              {analysis.complexity ? (
                <span className="badge badge--muted">Complexity: {analysis.complexity}</span>
              ) : null}
              {report.language ? (
                <span className="badge badge--muted">{report.language}</span>
              ) : null}
              {report.stars ? (
                <span className="badge badge--muted">{formatNumber(report.stars)} stars</span>
              ) : null}
            </div>
            <p className="analysis-hero__summary" style={{ marginTop: 14 }}>
              {analysis.summary}
            </p>
            <div className="analysis-hero__meta">
              <span className="chip">
                <Clock3 size={12} aria-hidden="true" />
                {timeAgo(report.createdAt)}
              </span>
              <span className="chip">
                <Files size={12} aria-hidden="true" />
                {pluralize(report.filesAnalyzed, 'file')}
              </span>
              {share?.expiresAt ? (
                <span className="chip">Link expires {formatDateTime(share.expiresAt)}</span>
              ) : null}
            </div>
          </div>
        </section>

        {valuation ? (
          <section className="card" style={{ marginTop: 18 }}>
            <div className="card__header">
              <div className="card__title">
                <BadgeDollarSign size={15} aria-hidden="true" />
                AI project valuation &amp; pricing
              </div>
              <span className="badge badge--muted">
                Estimate · {valuation.confidence || 'low'} confidence
              </span>
            </div>
            <div className="card__body">
              <div className="valuation-summary">
                <div className="valuation-figure">
                  <span className="valuation-figure__label">Potential one-time sale price</span>
                  <strong>{formatMoney(valuation.sellingPrice, currency)}</strong>
                </div>
                <div className="valuation-figure">
                  <span className="valuation-figure__label">Freelance build price</span>
                  <strong>{formatMoney(valuation.buildPrice, currency)}</strong>
                </div>
                <div className="valuation-figure valuation-figure--accent">
                  <span className="valuation-figure__label">Suggested asking price</span>
                  <strong>{formatMoney(valuation.suggestedAsk, currency)}</strong>
                </div>
              </div>
              <div className="valuation-range">
                <div className="valuation-range__labels">
                  <span>
                    Low <b>{formatMoney(low, currency)}</b>
                  </span>
                  <span className="valuation-range__typical">
                    Typical <b>{formatMoney(typical, currency)}</b>
                  </span>
                  <span>
                    High <b>{formatMoney(high, currency)}</b>
                  </span>
                </div>
                <div
                  className="valuation-range__track"
                  role="img"
                  aria-label={`Estimated sale range from ${formatMoney(low, currency)} to ${formatMoney(high, currency)}, typical ${formatMoney(typical, currency)}`}
                >
                  <span className="valuation-range__marker" style={{ left: `${marker}%` }} />
                </div>
              </div>
              {valuation.suggestedAskReasoning ? (
                <div className="valuation-block">
                  <h4>Why this asking price</h4>
                  <p>{valuation.suggestedAskReasoning}</p>
                </div>
              ) : null}
              <p className="hint valuation-disclaimer">
                <Info size={13} aria-hidden="true" />
                {meta.valuation?.disclaimer || FALLBACK_DISCLAIMER}
              </p>
            </div>
          </section>
        ) : null}

        {meta.health || meta.dependencies ? (
          <div style={{ marginTop: 18 }}>
            <RepoInsights health={meta.health} dependencies={meta.dependencies} />
          </div>
        ) : null}

        <div className="analysis-grid">
          <div className="analysis-stack">
            <section className="card">
              <div className="card__header">
                <div className="card__title">Score breakdown</div>
                <span className="hint">0–100 · higher is better</span>
              </div>
              <div className="card__body">
                <div className="score-grid">
                  {scoreLabels.map(([key, label]) => (
                    <ScoreBar key={key} label={label} value={scores[key]} />
                  ))}
                </div>
              </div>
            </section>

            {analysis.architecture ? (
              <section className="card">
                <div className="card__header">
                  <div className="card__title">Architecture</div>
                </div>
                <div className="card__body">
                  <Markdown>{analysis.architecture}</Markdown>
                </div>
              </section>
            ) : null}

            <ArchitectureMap layers={analysis.layers} />

            <OnboardingGuide onboarding={analysis.onboarding} effort={analysis.onboardingEffort} />
          </div>

          <div className="analysis-stack">
            {analysis.strengths?.length ? (
              <section className="card">
                <div className="card__header">
                  <div className="card__title">Strengths</div>
                </div>
                <div className="card__body list-plain">
                  {analysis.strengths.map((item) => (
                    <div className="list-item" key={item.title}>
                      <span className="list-item__icon list-item__icon--good">
                        <CheckCircle2 size={15} aria-hidden="true" />
                      </span>
                      <div>
                        <h4>{item.title}</h4>
                        <p>{item.detail}</p>
                        <FindingFiles files={item.files} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {analysis.weaknesses?.length ? (
              <section className="card">
                <div className="card__header">
                  <div className="card__title">Weaknesses</div>
                </div>
                <div className="card__body list-plain">
                  {analysis.weaknesses.map((item) => (
                    <div className="list-item" key={item.title}>
                      <span className="list-item__icon list-item__icon--bad">
                        <CircleAlert size={15} aria-hidden="true" />
                      </span>
                      <div>
                        <h4>{item.title}</h4>
                        <p>{item.detail}</p>
                        <FindingFiles files={item.files} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {analysis.securityConcerns?.length ? (
              <section className="card">
                <div className="card__header">
                  <div className="card__title">Security concerns</div>
                </div>
                <div className="card__body list-plain">
                  {analysis.securityConcerns.map((item) => (
                    <div className="list-item" key={item.title}>
                      <span className="list-item__icon list-item__icon--warn">
                        <ShieldAlert size={15} aria-hidden="true" />
                      </span>
                      <div>
                        <div className="row" style={{ gap: 6 }}>
                          <h4>{item.title}</h4>
                          <span className={`badge badge--${severityBadgeTone(item.severity)}`}>
                            {severityLabel[item.severity] || 'Low'}
                          </span>
                        </div>
                        <p>{item.detail}</p>
                        <FindingFiles files={item.files} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        {analysis.recommendations?.length ? (
          <section className="card" style={{ marginTop: 18 }}>
            <div className="card__header">
              <div className="card__title">Recommendations</div>
            </div>
            <div className="card__body rec-list">
              {analysis.recommendations.map((item, index) => (
                <div className="rec-item" key={item.title}>
                  <span className="rec-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="rec-body">
                    <h4>{item.title}</h4>
                    <p>{item.detail}</p>
                    <FindingFiles files={item.files} />
                  </div>
                  <span className={`badge badge--${severityBadgeTone(item.priority)}`}>
                    {severityLabel[item.priority] || 'Medium'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <p className="shared-page__notice">
          This snapshot was shared by a DevScope AI user. Scores and valuations are AI estimates,
          not audits or appraisals.{' '}
          <Link to="/" className="link">
            Create your own analysis
          </Link>
          .
        </p>
      </main>
    </div>
  )
}
