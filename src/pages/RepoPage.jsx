import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  Eye,
  FolderTree,
  GitBranch,
  GitFork,
  Info,
  MessagesSquare,
  Scale,
  ScanSearch,
  Sparkles,
  Star,
  Tag,
} from 'lucide-react'
import { api, errorMessage } from '../lib/api.js'
import {
  formatBytes,
  formatDate,
  formatNumber,
  languageColor,
  pluralize,
  scoreTone,
  timeAgo,
} from '../lib/format.js'
import { usePageTitle } from '../lib/hooks.js'
import {
  Avatar,
  Button,
  ErrorState,
  LoadingState,
  ScoreRing,
  Skeleton,
  Tabs,
} from '../components/ui.jsx'
import { GitHubMark } from '../components/Logo.jsx'
import { Markdown } from '../components/Markdown.jsx'
import FileBrowser from '../components/FileBrowser.jsx'
import RunAnalysisModal from '../components/RunAnalysisModal.jsx'
import { AiConfigNotice } from '../components/SystemNotices.jsx'

export default function RepoPage() {
  const { owner, repo: repoName } = useParams()
  const fullName = `${owner}/${repoName}`
  usePageTitle(fullName)
  const [tab, setTab] = useState('overview')
  const [analysisOpen, setAnalysisOpen] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['repo-bundle', owner, repoName],
    queryFn: () =>
      api.get(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`),
    staleTime: 5 * 60_000,
    retry: 0,
  })

  const latestReportQuery = useQuery({
    queryKey: ['repo-latest-report', fullName],
    queryFn: () => api.get(`/reports?q=${encodeURIComponent(fullName)}&limit=10`),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="page page--narrow">
        <LoadingState label={`Loading ${fullName}…`} />
      </div>
    )
  }

  if (isError) {
    const notFound = error?.status === 404
    return (
      <div className="page page--narrow">
        <ErrorState
          title={notFound ? 'Repository not found' : 'Could not load this repository'}
          message={
            notFound
              ? `“${fullName}” is not a public GitHub repository, or the owner or name is misspelled.`
              : errorMessage(error)
          }
          onRetry={notFound ? undefined : () => refetch()}
        >
          <div className="row" style={{ marginTop: 12 }}>
            <Link to="/explore" className="btn btn-secondary">
              Back to explore
            </Link>
            <Link to="/dashboard" className="btn btn-ghost">
              Dashboard
            </Link>
          </div>
        </ErrorState>
      </div>
    )
  }

  const { repo, languages = [], readme } = data
  const latestReport = latestReportQuery.data?.items?.find(
    (item) => item.repoFullName.toLowerCase() === fullName.toLowerCase(),
  )
  const latestTone = scoreTone(latestReport?.overallScore)
  const topLanguages = languages.slice(0, 6)
  const chatHref = `/chat?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo.name)}`

  return (
    <div className="page page--narrow">
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/explore">Explore</Link>
        <ChevronRight size={12} aria-hidden="true" />
        <Link to={`/u/${repo.owner.login}`}>@{repo.owner.login}</Link>
        <ChevronRight size={12} aria-hidden="true" />
        <span>{repo.name}</span>
      </div>

      <div className="banner-stack">
        <AiConfigNotice />
      </div>

      <section className="card repo-header">
        <Avatar src={repo.owner.avatarUrl} name={repo.owner.login} size="lg" square />
        <div className="repo-header__body">
          <div className="repo-header__name">
            <h1>{repo.name}</h1>
            {repo.archived ? <span className="badge badge--amber">Archived</span> : null}
            {repo.isFork ? <span className="badge badge--muted">Fork</span> : null}
            {repo.license ? <span className="badge badge--muted">{repo.license}</span> : null}
          </div>
          <div className="repo-header__owner">
            <Link to={`/u/${repo.owner.login}`} className="link">
              {repo.owner.login}
            </Link>{' '}
            · updated {repo.pushedAt ? timeAgo(repo.pushedAt) : 'unknown'}
          </div>
          <p className="repo-header__desc">
            {repo.description || 'This repository has no public description.'}
          </p>
          <div className="repo-stats">
            {repo.language ? (
              <span className="meta-item">
                <i className="lang-dot" style={{ background: languageColor(repo.language) }} />
                {repo.language}
              </span>
            ) : null}
            <span className="meta-item">
              <Star size={13} aria-hidden="true" /> {formatNumber(repo.stars)} stars
            </span>
            <span className="meta-item">
              <GitFork size={13} aria-hidden="true" /> {formatNumber(repo.forks)} forks
            </span>
            <span className="meta-item">
              <Eye size={13} aria-hidden="true" /> {formatNumber(repo.watchers)} watchers
            </span>
            <span className="meta-item">
              <CircleDot size={13} aria-hidden="true" /> {formatNumber(repo.openIssues)} open issues
            </span>
            {repo.homepage ? (
              <span className="meta-item">
                <ArrowUpRight size={13} aria-hidden="true" />
                <a className="link" href={repo.homepage} target="_blank" rel="noopener noreferrer">
                  Homepage
                </a>
              </span>
            ) : null}
          </div>
        </div>
        <div className="repo-actions">
          <Button variant="primary" leftIcon={Sparkles} onClick={() => setAnalysisOpen(true)}>
            Analyze
          </Button>
          <Link to={chatHref} className="btn btn-secondary">
            <MessagesSquare size={15} aria-hidden="true" />
            Chat
          </Link>
          <a
            className="btn btn-ghost"
            href={repo.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <GitHubMark size={15} />
            GitHub
          </a>
        </div>
      </section>

      <div className="repo-tabs-row">
        <Tabs
          items={[
            { value: 'overview', label: 'Overview', icon: BookOpen },
            { value: 'files', label: 'Files', icon: FolderTree },
          ]}
          value={tab}
          onChange={setTab}
          label="Repository view"
        />
        <div className="row">
          {latestReport ? (
            <Link to={`/analysis/${latestReport.id}`} className="chip">
              <Sparkles size={12} aria-hidden="true" />
              Latest score
              <strong style={{ color: latestTone.color }}>
                {latestReport.overallScore ?? '—'}
              </strong>
            </Link>
          ) : (
            <span className="hint">No saved analysis for this repository yet</span>
          )}
        </div>
      </div>

      {tab === 'overview' ? (
        <div className="repo-layout">
          <div className="repo-main">
            <section className="card readme-card">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
                <div className="card__title">
                  <BookOpen size={15} aria-hidden="true" />
                  README
                </div>
                {readme ? (
                  <a
                    className="link"
                    href={readme.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12 }}
                  >
                    View on GitHub
                  </a>
                ) : null}
              </div>
              {readme ? (
                <>
                  <Markdown>{readme.content}</Markdown>
                  {readme.truncated ? (
                    <p className="hint" style={{ marginTop: 16 }}>
                      This README was truncated for display. Open it on GitHub for the full content.
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="readme-empty">
                  This repository does not include a README, or GitHub did not return one.
                </div>
              )}
            </section>
          </div>

          <aside className="repo-side">
            <section className="card">
              <div className="card__header">
                <div className="card__title">
                  <Sparkles size={15} aria-hidden="true" />
                  Latest analysis
                </div>
              </div>
              <div className="card__body">
                {latestReportQuery.isLoading ? (
                  <div className="stack" style={{ gap: 10 }}>
                    <Skeleton width="100%" height={14} />
                    <Skeleton width="70%" height={10} />
                  </div>
                ) : latestReport ? (
                  <>
                    <div className="row" style={{ gap: 14 }}>
                      <ScoreRing score={latestReport.overallScore} size="sm" />
                      <div className="grow">
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <strong style={{ fontSize: 13 }}>Overall score</strong>
                          {latestReport.saved ? (
                            <span className="badge badge--mint">Saved</span>
                          ) : null}
                        </div>
                        <div className="hint" style={{ marginTop: 3 }}>
                          {timeAgo(latestReport.createdAt)} ·{' '}
                          {pluralize(latestReport.filesAnalyzed, 'file')} ·{' '}
                          {latestReport.depth === 'deep' ? 'deep' : 'standard'} scan
                        </div>
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 14 }}>
                      <Link
                        to={`/analysis/${latestReport.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        View report
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={ScanSearch}
                        onClick={() => setAnalysisOpen(true)}
                      >
                        Re-run
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="hint">
                      No analysis is stored for this repository yet. Run one to get scores, risks,
                      and recommendations.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={Sparkles}
                      onClick={() => setAnalysisOpen(true)}
                      style={{ marginTop: 12 }}
                    >
                      Run analysis
                    </Button>
                  </>
                )}
              </div>
            </section>

            <section className="card">
              <div className="card__header">
                <div className="card__title">
                  <Code2 size={15} aria-hidden="true" />
                  Languages
                </div>
              </div>
              <div className="card__body">
                {topLanguages.length ? (
                  <>
                    <div className="language-bar" aria-hidden="true">
                      {topLanguages.map((lang) => (
                        <span
                          key={lang.name}
                          style={{
                            width: `${Math.max(lang.percent, 2)}%`,
                            background: languageColor(lang.name),
                          }}
                        />
                      ))}
                    </div>
                    <div className="language-legend">
                      {topLanguages.map((lang) => (
                        <div className="language-legend__row" key={lang.name}>
                          <i
                            className="lang-dot"
                            style={{ background: languageColor(lang.name) }}
                          />
                          <span>{lang.name}</span>
                          <span>{lang.percent.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="hint">
                    GitHub did not report language statistics for this repository.
                  </p>
                )}
              </div>
            </section>

            <section className="card">
              <div className="card__header">
                <div className="card__title">
                  <Info size={15} aria-hidden="true" />
                  Repository details
                </div>
              </div>
              <div className="card__body">
                <div className="fact-list">
                  <div className="fact-row">
                    <span>
                      <GitBranch size={12} aria-hidden="true" /> Default branch
                    </span>
                    <span>{repo.defaultBranch}</span>
                  </div>
                  <div className="fact-row">
                    <span>
                      <Scale size={12} aria-hidden="true" /> License
                    </span>
                    <span>{repo.license || 'Not declared'}</span>
                  </div>
                  <div className="fact-row">
                    <span>Stars</span>
                    <span>{formatNumber(repo.stars)}</span>
                  </div>
                  <div className="fact-row">
                    <span>Forks</span>
                    <span>{formatNumber(repo.forks)}</span>
                  </div>
                  <div className="fact-row">
                    <span>Open issues</span>
                    <span>{formatNumber(repo.openIssues)}</span>
                  </div>
                  <div className="fact-row">
                    <span>Repository size</span>
                    <span>{formatBytes((repo.size || 0) * 1024)}</span>
                  </div>
                  <div className="fact-row">
                    <span>
                      <Clock3 size={12} aria-hidden="true" /> Created
                    </span>
                    <span>{formatDate(repo.createdAt)}</span>
                  </div>
                  <div className="fact-row">
                    <span>Last push</span>
                    <span>{formatDate(repo.pushedAt)}</span>
                  </div>
                </div>
              </div>
            </section>

            {repo.topics?.length ? (
              <section className="card">
                <div className="card__header">
                  <div className="card__title">
                    <Tag size={15} aria-hidden="true" />
                    Topics
                  </div>
                </div>
                <div className="card__body">
                  <div className="report-card__tags">
                    {repo.topics.map((topic) => (
                      <span key={topic} className="chip">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      ) : (
        <>
          <p className="hint" style={{ marginBottom: 12 }}>
            Browsing the default branch <code>{repo.defaultBranch}</code>. File contents are loaded
            read-only from the GitHub API; repository code is never executed.
          </p>
          <FileBrowser key={fullName} owner={owner} repoName={repo.name} />
        </>
      )}

      <RunAnalysisModal
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        owner={repo.owner.login}
        repoName={repo.name}
      />
    </div>
  )
}
