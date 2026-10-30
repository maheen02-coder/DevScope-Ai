import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Compass,
  Cpu,
  Download,
  Files,
  Info,
  Lightbulb,
  MessageSquare,
  ScanSearch,
  Share2,
  ShieldAlert,
  Sparkles,
  Star,
  TrendingUp,
  Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import { api, errorMessage } from '../lib/api.js'
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  pluralize,
  severityBadgeTone,
  timeAgo,
} from '../lib/format.js'
import { usePageTitle } from '../lib/hooks.js'
import { useToast } from '../context/ToastContext.jsx'
import {
  Alert,
  Button,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  ScoreBar,
  ScoreRing,
} from '../components/ui.jsx'
import { Markdown } from '../components/Markdown.jsx'
import RunAnalysisModal from '../components/RunAnalysisModal.jsx'
import ShareDialog from '../components/ShareDialog.jsx'
import { ReportNotes } from '../components/ReportNotes.jsx'
import { RepoInsights } from '../components/RepoInsights.jsx'
import { FindingFiles } from '../components/FindingFiles.jsx'
import { OnboardingGuide } from '../components/OnboardingGuide.jsx'
import { ArchitectureMap } from '../components/ArchitectureMap.jsx'
import { downloadReportMarkdown } from '../lib/reportMarkdown.js'

const scoreLabels = [
  ['codeQuality', 'Code quality'],
  ['architecture', 'Architecture'],
  ['maintainability', 'Maintainability'],
  ['documentation', 'Documentation'],
  ['security', 'Security'],
  ['testing', 'Testing'],
]

const severityLabel = { high: 'High', medium: 'Medium', low: 'Low' }

const reasonLabels = {
  max_files: 'file cap',
  token_budget: 'token budget',
  max_batches: 'batch cap',
  total_token_budget: 'total budget',
  file_exceeds_request_budget: 'single-file budget',
  request_token_limit: 'per-request cap',
  batch_context_limit: 'context limit',
  batch_invalid_response: 'invalid response',
  dependency: 'dependencies',
  build_output: 'build output',
  hidden: 'hidden paths',
  lockfile: 'lockfiles',
  sensitive: 'sensitive paths',
  generated: 'generated files',
  binary: 'binary files',
  asset: 'assets',
  large_file: 'large files',
  unsupported: 'unsupported types',
}

function describeCounts(counts) {
  const entries = Object.entries(counts || {})
  if (!entries.length) return ''
  return entries.map(([reason, count]) => `${reasonLabels[reason] || reason}: ${count}`).join(' · ')
}

const FALLBACK_VALUATION_DISCLAIMER =
  'AI estimate from model knowledge of typical software markets, not an appraisal or verified market data. Actual prices depend on buyers, negotiation, ownership, and independent review; no sale price is guaranteed.'

function ValuationPanel({ valuation, valuationMeta, onRerun }) {
  if (!valuation) {
    return (
      <section className="card">
        <div className="card__header">
          <div className="card__title">
            <BadgeDollarSign size={15} aria-hidden="true" />
            AI project valuation &amp; pricing
          </div>
          <span className="badge badge--muted">Not in this report</span>
        </div>
        <div className="card__body">
          <p className="hint">
            This report was created before valuation estimates were added. Re-run the analysis to
            generate a potential sale price, a from-scratch build cost, a price range, and
            asking-price guidance from the current repository data.
          </p>
          <Button
            variant="secondary"
            leftIcon={Sparkles}
            onClick={onRerun}
            style={{ marginTop: 12 }}
          >
            Re-run analysis with valuation
          </Button>
        </div>
      </section>
    )
  }

  const currency = valuation.currency || 'USD'
  const low = Number(valuation.range?.low)
  const typical = Number(valuation.range?.typical)
  const high = Number(valuation.range?.high)
  const span = Math.max(1, high - low)
  const marker = Math.min(100, Math.max(0, ((typical - low) / span) * 100))
  const factors = valuation.factors || []
  const missingFeatures = valuation.missingFeatures || []
  const improvements = valuation.improvements || []
  const assumptions = valuation.assumptions || []

  return (
    <section className="card">
      <div className="card__header">
        <div className="card__title">
          <BadgeDollarSign size={15} aria-hidden="true" />
          AI project valuation &amp; pricing
        </div>
        <span className="badge badge--amber">
          Estimate · {valuation.confidence || 'low'} confidence
        </span>
      </div>
      <div className="card__body">
        <div className="valuation-summary">
          <div className="valuation-figure">
            <span className="valuation-figure__label">Potential one-time sale price</span>
            <strong>{formatMoney(valuation.sellingPrice, currency)}</strong>
            <span className="hint">Existing repository sold as a code asset</span>
          </div>
          <div className="valuation-figure">
            <span className="valuation-figure__label">Freelance build price</span>
            <strong>{formatMoney(valuation.buildPrice, currency)}</strong>
            <span className="hint">Comparable software built from scratch</span>
          </div>
          <div className="valuation-figure valuation-figure--accent">
            <span className="valuation-figure__label">Suggested asking price</span>
            <strong>{formatMoney(valuation.suggestedAsk, currency)}</strong>
            <span className="hint">Recommended list price, not a guarantee</span>
          </div>
        </div>

        <div className="valuation-range">
          <div className="valuation-range__labels">
            <span>
              Low <b>{formatMoney(low, currency)}</b>
            </span>
            <span>
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

        <div className="valuation-block">
          <h4>Why this asking price</h4>
          <p>{valuation.suggestedAskReasoning}</p>
          {valuation.buildScope ? (
            <p className="hint" style={{ marginTop: 8 }}>
              <strong>Rebuild scope:</strong> {valuation.buildScope}
            </p>
          ) : null}
        </div>

        <div className="two-col">
          <div className="valuation-block">
            <h4>Factors affecting the price</h4>
            {factors.length ? (
              <div className="list-plain">
                {factors.map((item) => (
                  <div className="list-item" key={item.factor}>
                    <span
                      className={clsx(
                        'list-item__icon',
                        item.impact === 'positive'
                          ? 'list-item__icon--good'
                          : 'list-item__icon--bad',
                      )}
                    >
                      {item.impact === 'positive' ? (
                        <TrendingUp size={15} aria-hidden="true" />
                      ) : (
                        <CircleAlert size={15} aria-hidden="true" />
                      )}
                    </span>
                    <div className="grow">
                      <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                        <h4>{item.factor}</h4>
                        <span
                          className={clsx(
                            'badge',
                            item.impact === 'positive' ? 'badge--mint' : 'badge--rose',
                          )}
                        >
                          {item.impact === 'positive' ? 'Positive' : 'Negative'}
                        </span>
                      </div>
                      <p>{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">No price factors were identified.</p>
            )}
          </div>

          <div className="valuation-block">
            <h4>Missing features buyers may expect</h4>
            {missingFeatures.length ? (
              <div className="list-plain">
                {missingFeatures.map((item) => (
                  <div className="list-item" key={item.title}>
                    <span className="list-item__icon list-item__icon--warn">
                      <CircleAlert size={15} aria-hidden="true" />
                    </span>
                    <div className="grow">
                      <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                        <h4>{item.title}</h4>
                        <span className="badge badge--muted">
                          ~{formatMoney(item.estimatedValue, currency)} to add
                        </span>
                      </div>
                      <p>{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">No expected capabilities were flagged as missing.</p>
            )}
          </div>
        </div>

        <div className="valuation-block">
          <h4>What would raise the price</h4>
          {improvements.length ? (
            <div className="rec-list">
              {improvements.map((item, index) => (
                <div className="rec-item" key={item.title}>
                  <span className="rec-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="rec-body">
                    <h4>{item.title}</h4>
                    <p>{item.detail}</p>
                  </div>
                  <span
                    className={clsx(
                      'badge',
                      item.priceImpact === 'high'
                        ? 'badge--mint'
                        : item.priceImpact === 'medium'
                          ? 'badge--amber'
                          : 'badge--muted',
                    )}
                  >
                    {severityLabel[item.priceImpact] || 'Low'} impact
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">No value-increasing improvements were suggested.</p>
          )}
        </div>

        {assumptions.length ? (
          <div className="valuation-block">
            <h4>Assumptions behind these numbers</h4>
            <ul className="valuation-assumptions">
              {assumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="hint valuation-disclaimer">
          <Info size={12} aria-hidden="true" />
          {valuationMeta?.disclaimer || FALLBACK_VALUATION_DISCLAIMER} Values are model-generated
          estimates, not verified facts about this repository's market value.
        </p>
      </div>
    </section>
  )
}

export default function AnalysisPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const reportQuery = useQuery({
    queryKey: ['report', id],
    queryFn: () => api.get(`/reports/${id}`),
    retry: 0,
  })
  usePageTitle(reportQuery.data?.report?.repoFullName || 'Analysis')

  const toggleSaved = useMutation({
    mutationFn: (saved) => api.patch(`/reports/${id}`, { saved }),
    onSuccess: ({ report }) => {
      queryClient.setQueryData(['report', id], { report })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['repo-latest-report'] })
      toast.success(report.saved ? 'Report saved' : 'Removed from saved', report.repoFullName)
    },
    onError: (error) => toast.error('Could not update the report', errorMessage(error)),
  })

  const deleteReport = useMutation({
    mutationFn: () => api.delete(`/reports/${id}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['report', id] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['repo-latest-report'] })
      toast.success('Report deleted', 'The stored analysis has been removed from your account.')
      navigate('/reports', { replace: true })
    },
    onError: (error) => toast.error('Could not delete the report', errorMessage(error)),
  })

  if (reportQuery.isLoading) {
    return (
      <div className="page page--narrow">
        <LoadingState label="Loading analysis report…" />
      </div>
    )
  }

  if (reportQuery.isError) {
    const notFound = reportQuery.error?.status === 404
    return (
      <div className="page page--narrow">
        <ErrorState
          title={notFound ? 'Report not found' : 'Could not load this report'}
          message={
            notFound
              ? 'This analysis does not exist, or it belongs to a different account.'
              : errorMessage(reportQuery.error)
          }
          onRetry={notFound ? undefined : () => reportQuery.refetch()}
        >
          <Link to="/reports" className="btn btn-secondary" style={{ marginTop: 12 }}>
            Back to reports
          </Link>
        </ErrorState>
      </div>
    )
  }

  const report = reportQuery.data.report
  const analysis = report.analysis
  if (!analysis) {
    return (
      <div className="page page--narrow">
        <ErrorState
          title="This report could not be read"
          message="The stored analysis JSON is missing or malformed. Re-run the analysis to create a fresh report."
        >
          <div className="row" style={{ marginTop: 12 }}>
            <Button variant="primary" leftIcon={Sparkles} onClick={() => setAnalysisOpen(true)}>
              Re-run analysis
            </Button>
            <Link to="/reports" className="btn btn-secondary">
              Back to reports
            </Link>
          </div>
        </ErrorState>
        <RunAnalysisModal
          open={analysisOpen}
          onClose={() => setAnalysisOpen(false)}
          owner={report.owner}
          repoName={report.repo}
          defaultDepth={report.depth}
        />
      </div>
    )
  }

  const scores = analysis.scores || {}
  const meta = analysis.meta || {}
  const techStack = analysis.techStack || []
  const strengths = analysis.strengths || []
  const weaknesses = analysis.weaknesses || []
  const concerns = analysis.securityConcerns || []
  const recommendations = analysis.recommendations || []
  const tags = analysis.tags || []
  const files = Array.isArray(meta.files) ? meta.files : []
  const coverage = meta.coverage || null
  const excludedTotal = (coverage?.excluded || []).reduce(
    (sum, entry) => sum + (entry.count || 0),
    0,
  )
  const chatHref = `/chat?owner=${encodeURIComponent(report.owner)}&repo=${encodeURIComponent(report.repo)}`

  return (
    <div className="page page--narrow">
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/reports">Reports</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/r/${report.owner}/${report.repo}`}>{report.repoFullName}</Link>
        <span aria-hidden="true">/</span>
        <span>Analysis</span>
      </div>

      <div className="page-head">
        <div className="page-head__main">
          <div className="page-head__eyebrow">
            <span className="accent">AI report</span> · {formatDateTime(report.createdAt)}
          </div>
          <h1 className="page-title">{report.repoFullName}</h1>
          <p className="page-sub">
            {report.depth === 'deep' ? 'Deep' : 'Standard'} analysis of{' '}
            {pluralize(report.filesAnalyzed, 'file')}
            {report.model ? ` using ${report.model}` : ''}. Generated from the repository at the
            time of analysis — re-run to refresh.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" leftIcon={Sparkles} onClick={() => setAnalysisOpen(true)}>
            Re-run
          </Button>
          <Button
            variant="secondary"
            leftIcon={Star}
            onClick={() => toggleSaved.mutate(!report.saved)}
            loading={toggleSaved.isPending}
          >
            {report.saved ? 'Saved' : 'Save report'}
          </Button>
          <Button
            variant="secondary"
            leftIcon={Download}
            onClick={() => downloadReportMarkdown(report)}
          >
            Export .md
          </Button>
          <Button variant="secondary" leftIcon={Share2} onClick={() => setShareOpen(true)}>
            Share
          </Button>
          <Link to={chatHref} className="btn btn-secondary">
            <MessageSquare size={15} aria-hidden="true" />
            Ask about this repo
          </Link>
          {report.htmlUrl ? (
            <a
              className="btn btn-ghost btn-icon"
              href={report.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open repository on GitHub"
              title="Open repository on GitHub"
            >
              <ArrowUpRight size={16} />
            </a>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete report"
            title="Delete report"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <section className="card analysis-hero">
        <ScoreRing score={scores.overall} size="lg" label="Overall engineering score" />
        <div>
          <div className="row-wrap" style={{ gap: 7 }}>
            {report.saved ? <span className="badge badge--mint">Saved</span> : null}
            <span
              className={clsx('badge', report.depth === 'deep' ? 'badge--violet' : 'badge--muted')}
            >
              {report.depth === 'deep' ? 'Deep scan' : 'Standard scan'}
            </span>
            {analysis.complexity ? (
              <span className="badge badge--muted">Complexity: {analysis.complexity}</span>
            ) : null}
            {analysis.onboardingEffort ? (
              <span className="badge badge--muted">Onboarding: {analysis.onboardingEffort}</span>
            ) : null}
            {tags.slice(0, 4).map((tag) => (
              <span key={tag} className="chip">
                {tag}
              </span>
            ))}
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
            {meta.tree?.totalFiles ? (
              <span className="chip">
                <Compass size={12} aria-hidden="true" />
                {formatNumber(meta.tree.totalFiles)} {meta.tree.totalFiles === 1 ? 'file' : 'files'}{' '}
                in tree
              </span>
            ) : null}
            {report.language ? <span className="chip">{report.language}</span> : null}
            {report.stars ? <span className="chip">{formatNumber(report.stars)} stars</span> : null}
            {meta.durationMs ? (
              <span className="chip">
                <ScanSearch size={12} aria-hidden="true" />
                {formatDuration(meta.durationMs)}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="analysis-extras">
        <ValuationPanel
          valuation={analysis.valuation}
          valuationMeta={meta.valuation}
          onRerun={() => setAnalysisOpen(true)}
        />

        <RepoInsights health={meta.health} dependencies={meta.dependencies} />

        <ReportNotes reportId={report.id} />
      </div>

      <div className="analysis-grid">
        <div className="analysis-stack">
          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <BarChart3 size={15} aria-hidden="true" />
                Score breakdown
              </div>
              <span className="hint">0–100 · higher is better</span>
            </div>
            <div className="card__body">
              <div className="score-grid">
                {scoreLabels.map(([key, label]) => (
                  <ScoreBar key={key} label={label} value={scores[key]} />
                ))}
              </div>
              <div className="score-legend" style={{ marginTop: 18 }}>
                <span>80+ strong</span>
                <span>60–79 solid</span>
                <span>40–59 needs work</span>
                <span>under 40 at risk</span>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <Compass size={15} aria-hidden="true" />
                Architecture
              </div>
            </div>
            <div className="card__body">
              {analysis.architecture ? (
                <Markdown>{analysis.architecture}</Markdown>
              ) : (
                <p className="hint">The model did not return an architecture summary.</p>
              )}
            </div>
          </section>

          <ArchitectureMap layers={analysis.layers} />

          <OnboardingGuide onboarding={analysis.onboarding} effort={analysis.onboardingEffort} />

          <div className="two-col">
            <section className="card">
              <div className="card__header">
                <div className="card__title">
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Strengths
                </div>
                <span className="hint">{strengths.length}</span>
              </div>
              <div className="card__body">
                {strengths.length ? (
                  <div className="list-plain">
                    {strengths.map((item) => (
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
                ) : (
                  <p className="hint">No strengths were listed in this report.</p>
                )}
              </div>
            </section>

            <section className="card">
              <div className="card__header">
                <div className="card__title">
                  <CircleAlert size={15} aria-hidden="true" />
                  Weaknesses
                </div>
                <span className="hint">{weaknesses.length}</span>
              </div>
              <div className="card__body">
                {weaknesses.length ? (
                  <div className="list-plain">
                    {weaknesses.map((item) => (
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
                ) : (
                  <p className="hint">No weaknesses were listed in this report.</p>
                )}
              </div>
            </section>
          </div>

          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <ShieldAlert size={15} aria-hidden="true" />
                Security concerns
              </div>
              <span className="badge badge--muted">{concerns.length}</span>
            </div>
            <div className="card__body">
              {concerns.length ? (
                <div className="list-plain">
                  {concerns.map((item) => (
                    <div className="list-item" key={item.title}>
                      <span className="list-item__icon list-item__icon--bad">
                        <ShieldAlert size={15} aria-hidden="true" />
                      </span>
                      <div className="grow">
                        <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                          <h4>{item.title}</h4>
                          <span className={`badge badge--${severityBadgeTone(item.severity)}`}>
                            {severityLabel[item.severity] || 'Medium'}
                          </span>
                        </div>
                        <p>{item.detail}</p>
                        <FindingFiles files={item.files} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hint">
                  No specific security concerns were identified in the reviewed files. This is not a
                  formal security audit.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="analysis-stack">
          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <Lightbulb size={15} aria-hidden="true" />
                Recommendations
              </div>
              <span className="hint">{recommendations.length}</span>
            </div>
            <div className="card__body">
              {recommendations.length ? (
                <div className="rec-list">
                  {recommendations.map((item, index) => (
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
              ) : (
                <p className="hint">No recommendations were returned.</p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <Cpu size={15} aria-hidden="true" />
                Tech stack
              </div>
            </div>
            <div className="card__body">
              {techStack.length ? (
                <div className="tech-stack">
                  {techStack.map((item) => (
                    <div className="tech-row" key={item.name}>
                      <strong>{item.name}</strong>
                      <span>{item.purpose}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hint">No technologies were identified.</p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <Files size={15} aria-hidden="true" />
                Files analyzed
              </div>
              <span className="hint">{meta.filesAnalyzed ?? report.filesAnalyzed}</span>
            </div>
            <div className="card__body">
              {files.length ? (
                <div className="files-analyzed">
                  {files.map((file) => (
                    <span className="file-pill" key={file.path} title={file.path}>
                      <span>{file.path}</span>
                      {file.truncated ? <span className="badge badge--amber">cut</span> : null}
                    </span>
                  ))}
                </div>
              ) : coverage ? (
                <p className="hint">
                  No file contents were sent to the model for this report. Only repository metadata
                  and collection coverage were available.
                </p>
              ) : (
                <p className="hint">
                  This report predates file-level metadata. Re-run the analysis to see exactly which
                  files were reviewed.
                </p>
              )}

              {coverage ? (
                <div className="fact-list" style={{ marginTop: 14 }}>
                  <div className="fact-row">
                    <span>Selection mode</span>
                    <span>
                      {coverage.mode === 'batched'
                        ? `Batched · ${coverage.batches} pass${coverage.batches === 1 ? '' : 'es'}`
                        : 'Single pass'}
                    </span>
                  </div>
                  <div className="fact-row">
                    <span>Candidate files</span>
                    <span>{formatNumber(coverage.candidateFiles ?? files.length)}</span>
                  </div>
                  {coverage.omittedTotal ? (
                    <div className="fact-row">
                      <span>Omitted by limits</span>
                      <span>
                        {coverage.omittedTotal}
                        {describeCounts(coverage.omittedCounts)
                          ? ` · ${describeCounts(coverage.omittedCounts)}`
                          : ''}
                      </span>
                    </div>
                  ) : null}
                  {coverage.skippedTotal ? (
                    <div className="fact-row">
                      <span>Skipped while collecting</span>
                      <span>
                        {coverage.skippedTotal}
                        {describeCounts(coverage.skippedCounts)
                          ? ` · ${describeCounts(coverage.skippedCounts)}`
                          : ''}
                      </span>
                    </div>
                  ) : null}
                  {coverage.truncatedTotal ? (
                    <div className="fact-row">
                      <span>Truncated to fit budgets</span>
                      <span>{coverage.truncatedTotal}</span>
                    </div>
                  ) : null}
                  {excludedTotal ? (
                    <div className="fact-row">
                      <span>Excluded before download</span>
                      <span>
                        {formatNumber(excludedTotal)}
                        {coverage.excluded?.length
                          ? ` · ${coverage.excluded
                              .slice(0, 4)
                              .map(
                                (entry) =>
                                  `${reasonLabels[entry.reason] || entry.reason} (${entry.count})`,
                              )
                              .join(', ')}`
                          : ''}
                      </span>
                    </div>
                  ) : null}
                  {coverage.secretRedactions ? (
                    <div className="fact-row">
                      <span>Credential-like values redacted</span>
                      <span>{coverage.secretRedactions}</span>
                    </div>
                  ) : null}
                  {coverage.contextRetries ? (
                    <div className="fact-row">
                      <span>Context retries</span>
                      <span>{coverage.contextRetries}</span>
                    </div>
                  ) : null}
                  {coverage.batchFailures?.length ? (
                    <div className="fact-row">
                      <span>Batches skipped</span>
                      <span>{coverage.batchFailures.length}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {coverage?.omitted?.length ? (
                <p className="hint" style={{ marginTop: 12 }}>
                  Omitted examples:{' '}
                  {coverage.omitted
                    .slice(0, 6)
                    .map((entry) => `${entry.path} (${reasonLabels[entry.reason] || entry.reason})`)
                    .join(', ')}
                </p>
              ) : null}

              {meta.tree?.truncated ? (
                <p className="hint" style={{ marginTop: 12 }}>
                  The repository tree was larger than the analysis budget and was truncated.
                </p>
              ) : null}
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div className="card__title">
                <Info size={15} aria-hidden="true" />
                Report metadata
              </div>
            </div>
            <div className="card__body">
              <div className="fact-list">
                <div className="fact-row">
                  <span>Generated</span>
                  <span>{formatDateTime(meta.generatedAt || report.createdAt)}</span>
                </div>
                <div className="fact-row">
                  <span>Duration</span>
                  <span>{formatDuration(meta.durationMs)}</span>
                </div>
                <div className="fact-row">
                  <span>Depth</span>
                  <span>{report.depth}</span>
                </div>
                <div className="fact-row">
                  <span>Analysis mode</span>
                  <span>
                    {meta.mode === 'batched'
                      ? `Batched · ${meta.batches} pass${meta.batches === 1 ? '' : 'es'}`
                      : 'Single pass'}
                  </span>
                </div>
                <div className="fact-row">
                  <span>Estimated input tokens</span>
                  <span>
                    {meta.estimatedInputTokens ? formatNumber(meta.estimatedInputTokens) : '—'}
                  </span>
                </div>
                <div className="fact-row">
                  <span>Model calls</span>
                  <span>{meta.modelCalls ?? '—'}</span>
                </div>
                <div className="fact-row">
                  <span>Context retries</span>
                  <span>{meta.contextRetries ?? 0}</span>
                </div>
                {meta.providerRequestLimit ? (
                  <div className="fact-row">
                    <span>Provider token cap</span>
                    <span>{formatNumber(meta.providerRequestLimit)} tokens/min</span>
                  </div>
                ) : null}
                <div className="fact-row">
                  <span>Prompt characters</span>
                  <span>{meta.inputChars ? formatNumber(meta.inputChars) : '—'}</span>
                </div>
                <div className="fact-row">
                  <span>Prompt tokens</span>
                  <span>{meta.usage?.promptTokens ?? '—'}</span>
                </div>
                <div className="fact-row">
                  <span>Completion tokens</span>
                  <span>{meta.usage?.completionTokens ?? '—'}</span>
                </div>
                <div className="fact-row">
                  <span>Model</span>
                  <span>{report.model || '—'}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card__body">
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <ArrowLeft size={14} aria-hidden="true" className="faint" />
                <span className="hint">Continue from here</span>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Link to={`/r/${report.owner}/${report.repo}`} className="btn btn-secondary btn-sm">
                  Repository
                </Link>
                <Link to={chatHref} className="btn btn-secondary btn-sm">
                  Ask a question
                </Link>
                <Link to="/reports" className="btn btn-ghost btn-sm">
                  All reports
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteReport.mutate()}
        title="Delete this analysis?"
        description={`${report.repoFullName} · ${formatDateTime(report.createdAt)}`}
        confirmLabel="Delete report"
        loading={deleteReport.isPending}
      >
        <Alert tone="warning" title="This cannot be undone">
          <p>
            The stored analysis, scores, and recommendations will be removed. Chat history for this
            repository is kept separately and can be deleted from the chat page.
          </p>
        </Alert>
      </ConfirmDialog>

      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} report={report} />

      <RunAnalysisModal
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        owner={report.owner}
        repoName={report.repo}
        defaultDepth={report.depth}
      />
    </div>
  )
}
