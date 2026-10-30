import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  CalendarDays,
  ChevronRight,
  FolderGit2,
  Link2,
  MapPin,
  Search,
  Users,
} from 'lucide-react'
import { api, errorMessage } from '../lib/api.js'
import { formatDate, formatNumber, pluralize } from '../lib/format.js'
import { usePageTitle } from '../lib/hooks.js'
import {
  Avatar,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Skeleton,
} from '../components/ui.jsx'
import { RepoCard } from '../components/Cards.jsx'
import { GitHubMark } from '../components/Logo.jsx'

export default function GithubUserPage() {
  const { username } = useParams()
  usePageTitle(`@${username}`)
  const [filter, setFilter] = useState('')
  const [language, setLanguage] = useState('all')
  const [sort, setSort] = useState('stars')
  const [hideForks, setHideForks] = useState(true)

  const userQuery = useQuery({
    queryKey: ['github-user', username],
    queryFn: () => api.get(`/github/users/${encodeURIComponent(username)}`),
    retry: 0,
  })

  const reposQuery = useQuery({
    queryKey: ['github-user-repos', username],
    queryFn: () => api.get(`/github/users/${encodeURIComponent(username)}/repos`),
    staleTime: 2 * 60_000,
    retry: 0,
  })

  const repos = useMemo(() => reposQuery.data?.repos || [], [reposQuery.data])
  const languages = useMemo(() => {
    const set = new Set(repos.map((repo) => repo.language).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [repos])

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const list = repos.filter((repo) => {
      if (hideForks && repo.isFork) return false
      if (language !== 'all' && repo.language !== language) return false
      if (!needle) return true
      return (
        repo.name.toLowerCase().includes(needle) ||
        (repo.description || '').toLowerCase().includes(needle)
      )
    })
    return list.sort((a, b) => {
      if (sort === 'updated') return new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0)
      if (sort === 'name') return a.name.localeCompare(b.name)
      return b.stars - a.stars
    })
  }, [repos, filter, language, sort, hideForks])

  if (userQuery.isLoading) {
    return (
      <div className="page page--narrow">
        <LoadingState label={`Loading @${username}…`} />
      </div>
    )
  }

  if (userQuery.isError) {
    const notFound = userQuery.error?.status === 404
    return (
      <div className="page page--narrow">
        <ErrorState
          title={notFound ? 'GitHub user not found' : 'Could not load this profile'}
          message={
            notFound
              ? `No public GitHub user or organization named “${username}” exists.`
              : errorMessage(userQuery.error)
          }
          onRetry={notFound ? undefined : () => userQuery.refetch()}
        >
          <Link to="/explore" className="btn btn-secondary" style={{ marginTop: 12 }}>
            Back to explore
          </Link>
        </ErrorState>
      </div>
    )
  }

  const user = userQuery.data.user

  return (
    <div className="page page--narrow">
      <div className="breadcrumb" style={{ marginBottom: 14 }}>
        <Link to="/explore">Explore</Link>
        <ChevronRight size={12} aria-hidden="true" />
        <span>@{user.login}</span>
      </div>

      <PageHeader
        eyebrow={user.type === 'Organization' ? 'Organization profile' : 'Developer profile'}
        title={user.name || user.login}
        description={user.bio || 'This GitHub account has no public bio.'}
        actions={
          <>
            <a
              className="btn btn-secondary"
              href={user.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GitHubMark size={15} />
              GitHub profile
            </a>
            <Link to="/explore" className="btn btn-ghost">
              <Search size={15} aria-hidden="true" />
              Search repositories
            </Link>
          </>
        }
      />

      <section className="card profile-card">
        <Avatar src={user.avatarUrl} name={user.name || user.login} size="xl" square />
        <div className="profile-card__info">
          <div className="profile-card__name">{user.name || user.login}</div>
          <div className="profile-card__login">@{user.login}</div>
          {user.bio ? <p className="profile-card__bio">{user.bio}</p> : null}
          <div className="profile-meta">
            {user.company ? (
              <span>
                <Building2 size={13} aria-hidden="true" />
                {user.company}
              </span>
            ) : null}
            {user.location ? (
              <span>
                <MapPin size={13} aria-hidden="true" />
                {user.location}
              </span>
            ) : null}
            {user.blog ? (
              <span>
                <Link2 size={13} aria-hidden="true" />
                <a className="link" href={user.blog} target="_blank" rel="noopener noreferrer">
                  {user.blog.replace(/^https?:\/\//, '')}
                </a>
              </span>
            ) : null}
            <span>
              <CalendarDays size={13} aria-hidden="true" />
              Joined {formatDate(user.createdAt)}
            </span>
          </div>
          <div className="profile-stats">
            <div className="profile-stat">
              <b>{formatNumber(user.publicRepos)}</b>
              <span>Public repos</span>
            </div>
            <div className="profile-stat">
              <b>{formatNumber(user.followers)}</b>
              <span>Followers</span>
            </div>
            <div className="profile-stat">
              <b>{formatNumber(user.following)}</b>
              <span>Following</span>
            </div>
            <div className="profile-stat">
              <b>{user.hireable ? 'Yes' : 'No'}</b>
              <span>Hireable</span>
            </div>
          </div>
        </div>
      </section>

      <div className="filter-bar">
        <div className="filter-bar__search input-wrap">
          <Search size={14} className="input-wrap__icon" aria-hidden="true" />
          <input
            className="input"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter repositories…"
            aria-label="Filter repositories by name or description"
          />
        </div>
        <select
          className="select"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          aria-label="Filter by language"
          style={{ width: 165 }}
        >
          <option value="all">All languages</option>
          {languages.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort repositories"
          style={{ width: 165 }}
        >
          <option value="stars">Most stars</option>
          <option value="updated">Recently updated</option>
          <option value="name">Name (A–Z)</option>
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={hideForks}
            onChange={(event) => setHideForks(event.target.checked)}
          />
          Hide forks
        </label>
      </div>

      <div className="result-head">
        <h2 className="row" style={{ gap: 8 }}>
          <FolderGit2 size={15} aria-hidden="true" />
          Public repositories
        </h2>
        <span>
          {reposQuery.isLoading
            ? 'Loading…'
            : `${pluralize(filtered.length, 'repository', 'repositories')} shown`}
        </span>
      </div>

      {reposQuery.isLoading ? (
        <div className="result-grid">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="card repo-card">
              <div className="row">
                <Skeleton width={32} height={32} />
                <div className="grow stack" style={{ gap: 8 }}>
                  <Skeleton width="50%" height={10} />
                  <Skeleton width="70%" height={14} />
                </div>
              </div>
              <Skeleton width="100%" height={10} />
              <Skeleton width="80%" height={10} />
            </div>
          ))}
        </div>
      ) : reposQuery.isError ? (
        <ErrorState
          title="Could not load repositories"
          message={errorMessage(reposQuery.error)}
          onRetry={() => reposQuery.refetch()}
        />
      ) : !repos.length ? (
        <div className="empty-card">
          <EmptyState
            icon={Users}
            title="No public repositories"
            description={`@${user.login} does not expose any public repositories, or they are all forks.`}
          />
        </div>
      ) : !filtered.length ? (
        <div className="empty-card">
          <EmptyState
            icon={Search}
            title="No repositories match these filters"
            description="Adjust the language, sort, or fork filter to see more repositories."
            actions={
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setFilter('')
                  setLanguage('all')
                  setHideForks(false)
                }}
              >
                Reset filters
              </button>
            }
          />
        </div>
      ) : (
        <div className="result-grid">
          {filtered.map((repo) => (
            <RepoCard key={repo.id || repo.fullName} repo={repo} />
          ))}
        </div>
      )}
    </div>
  )
}
