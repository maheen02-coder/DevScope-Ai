import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Compass, FolderGit2, Search, Sparkles, User } from 'lucide-react'
import { api, errorMessage } from '../lib/api.js'
import { pluralize } from '../lib/format.js'
import { useDebouncedValue, usePageTitle } from '../lib/hooks.js'
import { Button, EmptyState, ErrorState, LoadingState, Tabs } from '../components/ui.jsx'
import { RepoCard, UserCard } from '../components/Cards.jsx'
import { GitHubLimitNotice } from '../components/SystemNotices.jsx'

const RECENT_KEY = 'devscope:recent-searches'

const suggestions = {
  users: ['octocat', 'torvalds', 'sindresorhus', 'gaearon'],
  repositories: [
    'facebook/react',
    'vercel/next.js',
    'tailwindlabs/tailwindcss',
    'microsoft/vscode',
  ],
}

function readRecent() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(stored)
      ? stored.filter((item) => item && item.q && item.type).slice(0, 6)
      : []
  } catch {
    return []
  }
}

export default function ExplorePage() {
  usePageTitle('Explore')
  const [params, setParams] = useSearchParams()
  const initialQuery = params.get('q') || ''
  const initialTab = params.get('type') === 'repositories' ? 'repositories' : 'users'
  const [query, setQuery] = useState(initialQuery)
  const [tab, setTab] = useState(initialTab)
  const [recent, setRecent] = useState(readRecent)
  const [inputError, setInputError] = useState(null)
  const inputRef = useRef(null)
  const debounced = useDebouncedValue(query.trim(), 400)
  const focusSearch = params.get('focus') === 'search'

  useEffect(() => {
    if (!focusSearch) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [focusSearch])

  const searchQuery = useQuery({
    queryKey: ['github-search', tab, debounced],
    queryFn: () => api.get(`/github/search/${tab}?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 0,
  })

  const results = debounced.length >= 2 ? searchQuery.data?.items || [] : []
  const total = searchQuery.data?.total ?? 0
  const isSearching = debounced.length >= 2
  const activeSuggestions = useMemo(() => suggestions[tab], [tab])

  function recordSearch(nextQuery, nextTab = tab) {
    const entry = { q: nextQuery.trim(), type: nextTab }
    if (!entry.q) return
    setRecent((current) => {
      const next = [
        entry,
        ...current.filter((item) => !(item.q === entry.q && item.type === entry.type)),
      ].slice(0, 6)
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        /* storage can be unavailable in private mode */
      }
      return next
    })
  }

  function runSearch(value, nextTab = tab) {
    const trimmed = String(value || '').trim()
    if (trimmed.length < 2) {
      setInputError('Enter at least 2 characters to search GitHub.')
      return
    }
    setInputError(null)
    setQuery(trimmed)
    setTab(nextTab)
    setParams({ q: trimmed, type: nextTab })
    recordSearch(trimmed, nextTab)
  }

  function changeTab(nextTab) {
    setTab(nextTab)
    if (query.trim().length >= 2) {
      setParams({ q: query.trim(), type: nextTab })
      recordSearch(query.trim(), nextTab)
    }
  }

  return (
    <div className="page page--narrow">
      <div className="explore-hero">
        <div className="hero__eyebrow" style={{ marginBottom: 15 }}>
          <span className="dot" aria-hidden="true" />
          GitHub, live
        </div>
        <h1>Find a developer or a repository worth understanding</h1>
        <p>
          Search public GitHub profiles and repositories in real time, then open a repository to
          inspect its actual files or run an AI analysis.
        </p>

        <div className="search-shell">
          <form
            className="search-shell__row"
            onSubmit={(event) => {
              event.preventDefault()
              runSearch(query)
            }}
          >
            <div className="search-shell__input">
              <Search size={17} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setInputError(null)
                }}
                placeholder={
                  tab === 'users'
                    ? 'Search GitHub users or organizations…'
                    : 'Search repositories, e.g. rust-lang/rust…'
                }
                aria-label={tab === 'users' ? 'Search GitHub users' : 'Search repositories'}
                aria-invalid={inputError ? 'true' : undefined}
                autoComplete="off"
                spellCheck="false"
              />
            </div>
            <Button type="submit" variant="primary" leftIcon={Search}>
              Search
            </Button>
          </form>
          <div className="search-shell__tabs">
            <Tabs
              items={[
                { value: 'users', label: 'Users', icon: User },
                { value: 'repositories', label: 'Repositories', icon: FolderGit2 },
              ]}
              value={tab}
              onChange={changeTab}
              label="Search type"
            />
            <span className="search-hint">
              <Sparkles size={12} aria-hidden="true" />
              Real GitHub Search API · results cached briefly
            </span>
          </div>
        </div>

        {inputError ? (
          <p className="field-error" role="alert" style={{ marginTop: 10 }}>
            {inputError}
          </p>
        ) : null}

        <div className="search-suggestions">
          <span>Try:</span>
          {activeSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="chip"
              onClick={() => runSearch(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div className="banner-stack">
        <GitHubLimitNotice />
      </div>

      {isSearching ? (
        <>
          <div className="result-head">
            <h2>
              {searchQuery.isLoading
                ? 'Searching…'
                : `${pluralize(total, 'result')} for “${debounced}”`}
            </h2>
            <span>{tab === 'users' ? 'Users' : 'Repositories'}</span>
          </div>

          {searchQuery.isLoading ? (
            <LoadingState label={`Searching GitHub ${tab}…`} />
          ) : searchQuery.isError ? (
            <ErrorState
              title="GitHub search failed"
              message={errorMessage(searchQuery.error)}
              onRetry={() => searchQuery.refetch()}
            />
          ) : !results.length ? (
            <div className="empty-card">
              <EmptyState
                icon={Search}
                title={tab === 'users' ? 'No users matched' : 'No repositories matched'}
                description="Try a shorter query, or paste an owner/repo pair directly into the dashboard quick start."
                actions={
                  <Button variant="secondary" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="result-grid">
              {tab === 'users'
                ? results.map((user) => <UserCard key={user.login} user={user} />)
                : results.map((repo) => <RepoCard key={repo.id || repo.fullName} repo={repo} />)}
            </div>
          )}
        </>
      ) : (
        <>
          {recent.length ? (
            <>
              <div className="result-head">
                <h2>Recent searches</h2>
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setRecent([])
                    try {
                      window.localStorage.removeItem(RECENT_KEY)
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Clear
                </button>
              </div>
              <div className="recent-strip">
                {recent.map((item) => (
                  <button
                    key={`${item.type}:${item.q}`}
                    type="button"
                    className="recent-chip"
                    onClick={() => runSearch(item.q, item.type)}
                  >
                    {item.type === 'users' ? (
                      <User size={13} aria-hidden="true" />
                    ) : (
                      <FolderGit2 size={13} aria-hidden="true" />
                    )}
                    <span>{item.q}</span>
                    <b>{item.type === 'users' ? 'user' : 'repo'}</b>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="empty-card" style={{ marginTop: 24 }}>
            <EmptyState
              icon={Compass}
              title="Start with a search"
              description="Enter at least two characters. Users open a profile with their public repositories; repositories open a file browser and analysis workspace."
            />
          </div>
        </>
      )}
    </div>
  )
}
