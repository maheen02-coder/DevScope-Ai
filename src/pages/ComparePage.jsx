import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Check, FileText, X } from 'lucide-react'
import clsx from 'clsx'
import { api, errorMessage } from '../lib/api.js'
import { formatDateTime, formatMoney, timeAgo } from '../lib/format.js'
import { usePageTitle } from '../lib/hooks.js'
import { ErrorState, LoadingState, PageHeader, Skeleton } from '../components/ui.jsx'

const MAX_COMPARE = 3
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const scoreRows = [
  ['overall', 'Overall score'],
  ['codeQuality', 'Code quality'],
  ['architecture', 'Architecture'],
  ['maintainability', 'Maintainability'],
  ['documentation', 'Documentation'],
  ['security', 'Security'],
  ['testing', 'Testing'],
]

function valueOf(report, key) {
  const analysis = report?.analysis || {}
  if (scoreRows.some(([rowKey]) => rowKey === key)) return analysis.scores?.[key] ?? null
  if (key === 'suggestedAsk') return analysis.valuation?.suggestedAsk ?? null
  if (key === 'buildPrice') return analysis.valuation?.buildPrice ?? null
  if (key === 'low') return analysis.valuation?.range?.low ?? null
  if (key === 'high') return analysis.valuation?.range?.high ?? null
  return null
}

function bestIndex(values) {
  let best = -1
  values.forEach((value, index) => {
    if (Number.isFinite(Number(value)) && (best === -1 || Number(value) > Number(values[best])))
      best = index
  })
  return best
}

export default function ComparePage() {
  usePageTitle('Compare reports')
  const [params, setParams] = useSearchParams()

  const ids = useMemo(() => {
    const raw = String(params.get('ids') || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => ID_PATTERN.test(value))
    return [...new Set(raw)].slice(0, MAX_COMPARE)
  }, [params])

  const listQuery = useQuery({
    queryKey: ['reports', 'compare-picker'],
    queryFn: () => api.get('/reports?limit=50'),
  })

  const reportQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['report', id],
      queryFn: () => api.get(`/reports/${id}`),
      retry: 0,
    })),
  })

  const reports = reportQueries.map((query) => query.data?.report).filter(Boolean)
  const loading = reportQueries.some((query) => query.isLoading)
  const failed = reportQueries.find((query) => query.isError)
  const available = listQuery.data?.items || []

  function updateIds(next) {
    const nextParams = new URLSearchParams(params)
    if (next.length) nextParams.set('ids', next.join(','))
    else nextParams.delete('ids')
    setParams(nextParams, { replace: true })
  }

  function toggle(id) {
    if (ids.includes(id)) updateIds(ids.filter((value) => value !== id))
    else if (ids.length < MAX_COMPARE) updateIds([...ids, id])
  }

  const numericRows = [
    ...scoreRows,
    ['suggestedAsk', 'Suggested asking price'],
    ['buildPrice', 'Rebuild cost'],
    ['low', 'Sale range low'],
    ['high', 'Sale range high'],
  ]

  return (
    <div className="page page--narrow">
      <PageHeader
        eyebrow={
          <>
            <span className="accent">Compare</span> · up to {MAX_COMPARE} reports
          </>
        }
        title="Compare repository reports"
        description="Put analyses side by side to see score differences, valuation gaps, and where one repository is stronger than another. All figures come from your stored reports."
        actions={
          <Link to="/reports" className="btn btn-secondary">
            <FileText size={15} aria-hidden="true" />
            All reports
          </Link>
        }
      />

      <section className="card">
        <div className="card__header">
          <div className="card__title">
            <ArrowLeftRight size={15} aria-hidden="true" />
            Select reports
          </div>
          <span className="hint">
            {ids.length}/{MAX_COMPARE} selected
          </span>
        </div>
        <div className="card__body">
          {listQuery.isLoading ? (
            <div className="stack" style={{ gap: 8 }}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="45%" height={14} />
            </div>
          ) : listQuery.isError ? (
            <ErrorState
              title="Could not load your reports"
              message={errorMessage(listQuery.error)}
              onRetry={() => listQuery.refetch()}
            />
          ) : available.length < 2 ? (
            <p className="hint">
              Run at least two analyses to compare them.{' '}
              <Link to="/explore" className="link">
                Analyze a repository
              </Link>
              .
            </p>
          ) : (
            <div className="compare-picker">
              {available.map((report) => {
                const selected = ids.includes(report.id)
                const disabled = !selected && ids.length >= MAX_COMPARE
                return (
                  <label
                    key={report.id}
                    className={clsx(
                      'compare-pick',
                      selected && 'compare-pick--selected',
                      disabled && 'compare-pick--disabled',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggle(report.id)}
                    />
                    <span className="compare-pick__check" aria-hidden="true">
                      {selected ? <Check size={12} /> : null}
                    </span>
                    <span className="grow">
                      <span className="compare-pick__name truncate">{report.repoFullName}</span>
                      <span className="compare-pick__meta">
                        {report.overallScore ?? '—'} score · {timeAgo(report.createdAt)}
                        {report.valuation
                          ? ` · Ask ${formatMoney(report.valuation.suggestedAsk, report.valuation.currency)}`
                          : ''}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}
          {ids.length ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => updateIds([])}
            >
              <X size={14} aria-hidden="true" />
              Clear selection
            </button>
          ) : null}
        </div>
      </section>

      {loading ? (
        <div className="page" style={{ padding: 0, marginTop: 18 }}>
          <LoadingState label="Loading selected reports…" />
        </div>
      ) : failed ? (
        <div style={{ marginTop: 18 }}>
          <ErrorState
            title="Could not load one of the selected reports"
            message={errorMessage(failed.error)}
            onRetry={() => failed.refetch()}
          />
        </div>
      ) : reports.length >= 2 ? (
        <section className="card" style={{ marginTop: 18 }}>
          <div className="card__header">
            <div className="card__title">Side-by-side</div>
            <span className="hint">Higher is better · best value highlighted</span>
          </div>
          <div className="card__body compare-body">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  {reports.map((report) => (
                    <th scope="col" key={report.id}>
                      <Link to={`/analysis/${report.id}`} className="link">
                        {report.repoFullName}
                      </Link>
                      <span className="compare-table__sub">{formatDateTime(report.createdAt)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {numericRows.map(([key, label]) => {
                  const values = reports.map((report) => valueOf(report, key))
                  const best = bestIndex(values)
                  return (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      {values.map((value, index) => (
                        <td
                          key={reports[index].id}
                          className={clsx(best === index && 'compare-best')}
                        >
                          {Number.isFinite(Number(value))
                            ? key === 'suggestedAsk' ||
                              key === 'buildPrice' ||
                              key === 'low' ||
                              key === 'high'
                              ? formatMoney(
                                  value,
                                  reports[index].analysis?.valuation?.currency || 'USD',
                                )
                              : value
                            : '—'}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                <tr>
                  <th scope="row">Files analyzed</th>
                  {reports.map((report) => (
                    <td key={report.id}>{report.filesAnalyzed ?? 0}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Depth</th>
                  {reports.map((report) => (
                    <td key={report.id}>{report.depth === 'deep' ? 'Deep' : 'Standard'}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Language</th>
                  {reports.map((report) => (
                    <td key={report.id}>{report.language || '—'}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Complexity</th>
                  {reports.map((report) => (
                    <td key={report.id}>{report.analysis?.complexity || '—'}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 14 }}>
              Valuations are AI estimates, not appraisals. Mixed currencies are shown per report and
              are not converted.
            </p>
          </div>
        </section>
      ) : ids.length >= 2 ? null : (
        <div className="empty-card" style={{ marginTop: 18 }}>
          <p className="hint">Select two or three reports above to build a comparison.</p>
        </div>
      )}
    </div>
  )
}
