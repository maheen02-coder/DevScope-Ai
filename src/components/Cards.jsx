import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Clock3, FolderGit2, GitFork, Star, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Avatar, ScoreRing } from './ui.jsx'
import {
  formatMoney,
  formatNumber,
  languageColor,
  pluralize,
  scoreTone,
  timeAgo,
} from '../lib/format.js'

export function UserCard({ user }) {
  return (
    <Link to={`/u/${user.login}`} className="card card--interactive user-card">
      <div className="user-card__head">
        <Avatar src={user.avatarUrl} name={user.name || user.login} size="lg" square />
        <div className="grow">
          <div className="user-card__name truncate">{user.name || user.login}</div>
          <div className="user-card__login truncate">@{user.login}</div>
        </div>
        <ArrowUpRight size={15} aria-hidden="true" className="faint" />
      </div>
      {user.bio ? <p className="repo-card__desc">{user.bio}</p> : null}
      <div className="user-card__foot">
        <span className="badge badge--muted">
          {user.type === 'Organization' ? 'Organization' : 'Developer'}
        </span>
        <span className="row" style={{ gap: 5 }}>
          <FolderGit2 size={12} aria-hidden="true" />
          View profile
        </span>
      </div>
    </Link>
  )
}

export function RepoCard({ repo }) {
  const owner = repo.owner?.login || repo.fullName?.split('/')[0] || 'unknown'
  return (
    <Link to={`/r/${owner}/${repo.name}`} className="card card--interactive repo-card">
      <div className="repo-card__head">
        <Avatar src={repo.owner?.avatarUrl} name={owner} size="sm" square />
        <div className="grow">
          <div className="repo-card__owner truncate">{owner}</div>
          <div className="repo-card__name">{repo.name}</div>
        </div>
        {repo.archived ? <span className="badge badge--amber">Archived</span> : null}
        <ArrowUpRight size={15} aria-hidden="true" className="faint" />
      </div>
      <p className="repo-card__desc">
        {repo.description || 'No description provided in the repository metadata.'}
      </p>
      <div className="repo-card__meta">
        {repo.language ? (
          <span className="meta-item">
            <i className="lang-dot" style={{ background: languageColor(repo.language) }} />
            {repo.language}
          </span>
        ) : null}
        <span className="meta-item">
          <Star size={12} aria-hidden="true" />
          {formatNumber(repo.stars)}
        </span>
        <span className="meta-item">
          <GitFork size={12} aria-hidden="true" />
          {formatNumber(repo.forks)}
        </span>
        <span className="meta-item">
          <Clock3 size={12} aria-hidden="true" />
          {repo.pushedAt ? timeAgo(repo.pushedAt) : 'unknown'}
        </span>
      </div>
    </Link>
  )
}

export function ReportRow({ report }) {
  const tone = scoreTone(report.overallScore)
  return (
    <Link to={`/analysis/${report.id}`} className="report-row">
      <ScoreRing score={report.overallScore} size="sm" label="Overall score" />
      <div className="report-row__body">
        <div className="report-row__title truncate">
          <span className="truncate">{report.repoFullName}</span>
          {report.saved ? <span className="badge badge--mint">Saved</span> : null}
        </div>
        <div className="report-row__meta">
          <span>{timeAgo(report.createdAt)}</span>
          <span>{pluralize(report.filesAnalyzed, 'file')}</span>
          <span>{report.depth === 'deep' ? 'Deep scan' : 'Standard scan'}</span>
          {report.valuation ? (
            <span className="meta-item accent">
              Ask {formatMoney(report.valuation.suggestedAsk, report.valuation.currency)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="report-row__score">
        <b style={{ color: tone.color }}>{report.overallScore ?? '—'}</b>
        <span>score</span>
      </div>
    </Link>
  )
}

export function ReportCard({ report, onToggleSaved, onDelete, busy }) {
  return (
    <article className="card report-card">
      <ScoreRing score={report.overallScore} size="sm" label="Overall score" />
      <div className="report-card__body">
        <div className="report-card__title">
          <Link to={`/analysis/${report.id}`}>{report.title}</Link>
          <span
            className={clsx('badge', report.depth === 'deep' ? 'badge--violet' : 'badge--muted')}
          >
            {report.depth === 'deep' ? 'Deep' : 'Standard'}
          </span>
          {report.saved ? <span className="badge badge--mint">Saved</span> : null}
        </div>
        <div className="report-card__meta">
          <span>{timeAgo(report.createdAt)}</span>
          <span>{pluralize(report.filesAnalyzed, 'file')} analyzed</span>
          {report.language ? (
            <span className="meta-item">
              <i className="lang-dot" style={{ background: languageColor(report.language) }} />
              {report.language}
            </span>
          ) : null}
          {report.model ? <span className="truncate">{report.model}</span> : null}
          {report.valuation ? (
            <span className="meta-item accent">
              Ask {formatMoney(report.valuation.suggestedAsk, report.valuation.currency)}
            </span>
          ) : null}
        </div>
        {report.preview ? <p className="report-card__preview">{report.preview}</p> : null}
        {report.tags?.length ? (
          <div className="report-card__tags">
            {report.tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="report-card__actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon"
          onClick={() => onToggleSaved?.(report)}
          disabled={busy}
          aria-label={report.saved ? 'Remove from saved reports' : 'Save report'}
          title={report.saved ? 'Remove from saved' : 'Save report'}
        >
          <Star
            size={15}
            fill={report.saved ? 'currentColor' : 'none'}
            className={report.saved ? 'accent' : undefined}
          />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon"
          onClick={() => onDelete?.(report)}
          disabled={busy}
          aria-label="Delete report"
          title="Delete report"
        >
          <Trash2 size={15} />
        </button>
        <Link to={`/analysis/${report.id}`} className="btn btn-secondary btn-sm">
          Open
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}
