import { Activity, CircleAlert, Info, Package, Scale, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { formatNumber } from '../lib/format.js'

const toneClass = {
  good: 'badge--mint',
  warning: 'badge--amber',
  danger: 'badge--rose',
  info: 'badge--violet',
  neutral: 'badge--muted',
  notice: 'badge--muted',
}

function DependencyRow({ manifest }) {
  const license = manifest.declaredLicense || 'no license field'
  return (
    <li className="insight-manifest">
      <Package size={14} aria-hidden="true" />
      <div className="grow">
        <div className="insight-manifest__path">{manifest.path}</div>
        <div className="hint">
          {manifest.ecosystem ? `${manifest.ecosystem} · ` : ''}
          {manifest.runtime} runtime · {manifest.development} dev · {license}
          {manifest.pinned ? ` · ${manifest.pinned} pinned` : ''}
          {manifest.unpinned ? ` · ${manifest.unpinned} ranged` : ''}
        </div>
      </div>
      {manifest.parseError ? <span className="badge badge--amber">Unparsed</span> : null}
    </li>
  )
}

export function RepoInsights({ health, dependencies, compact = false }) {
  if (!health && !dependencies) return null
  const manifests = dependencies?.manifests || []
  const issues = dependencies?.issues || []
  const signals = health?.signals || []

  return (
    <section className="card">
      <div className="card__header">
        <div className="card__title">
          <Activity size={15} aria-hidden="true" />
          Repository insights
        </div>
        <span className="badge badge--muted">Deterministic · no AI</span>
      </div>
      <div className="card__body">
        {health ? (
          <div className="insight-signals">
            {signals.map((signal) => (
              <div className="insight-signal" key={signal.id} title={signal.detail}>
                <span className="insight-signal__label">{signal.label}</span>
                <strong>{signal.value}</strong>
                <span className={clsx('badge', toneClass[signal.tone] || 'badge--muted')}>
                  {signal.tone === 'good'
                    ? 'Good'
                    : signal.tone === 'warning'
                      ? 'Watch'
                      : signal.tone === 'danger'
                        ? 'Risk'
                        : 'Info'}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {dependencies ? (
          <div className={clsx('insight-deps', health && 'insight-deps--spaced')}>
            <div className="insight-deps__head">
              <div className="card__title">
                <Scale size={14} aria-hidden="true" />
                Dependency &amp; license audit
              </div>
              <div className="row-wrap" style={{ gap: 6 }}>
                <span className="badge badge--muted">
                  {formatNumber(dependencies.total)} dependencies
                </span>
                {dependencies.declaredLicense ? (
                  <span className="badge badge--mint">{dependencies.declaredLicense}</span>
                ) : (
                  <span className="badge badge--amber">No manifest license</span>
                )}
              </div>
            </div>

            {compact ? null : (
              <>
                <p className="hint insight-deps__summary">
                  {dependencies.runtime} runtime · {dependencies.development} development
                  {dependencies.pinned ? ` · ${dependencies.pinned} pinned` : ''}
                  {dependencies.unpinned ? ` · ${dependencies.unpinned} version ranges` : ''}
                  {dependencies.ecosystems?.length
                    ? ` · ${dependencies.ecosystems.join(', ')}`
                    : ''}
                </p>

                {manifests.length ? (
                  <ul className="insight-manifests">
                    {manifests.map((manifest) => (
                      <DependencyRow key={manifest.path} manifest={manifest} />
                    ))}
                  </ul>
                ) : null}
              </>
            )}

            {issues.length ? (
              <ul className="insight-issues">
                {issues.map((issue) => {
                  const Icon =
                    issue.tone === 'warning'
                      ? CircleAlert
                      : issue.tone === 'info'
                        ? Info
                        : ShieldCheck
                  return (
                    <li key={issue.id} className="insight-issue">
                      <Icon size={14} aria-hidden="true" />
                      <div>
                        <strong>{issue.label}</strong>
                        <p>{issue.detail}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="hint" style={{ marginTop: 10 }}>
                No dependency or license issues detected in the analyzed manifests.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
