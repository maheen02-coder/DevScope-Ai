import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, FileCode2, FileQuestion, FolderTree, Search } from 'lucide-react'
import { api, errorMessage } from '../lib/api.js'
import { formatBytes, formatNumber } from '../lib/format.js'
import { CopyButton, EmptyState, ErrorState, LoadingState, Skeleton } from './ui.jsx'

function pickDefaultFile(entries) {
  if (!entries?.length) return ''
  const readme = entries.find((entry) => /^readme(\.[a-z0-9]+)?$/i.test(entry.path))
  return readme?.path || entries[0].path
}

export default function FileBrowser({ owner, repoName }) {
  const [search, setSearch] = useState('')
  const [selectedPath, setSelectedPath] = useState('')

  const treeQuery = useQuery({
    queryKey: ['repo-tree', owner, repoName],
    queryFn: () => api.get(`/github/repos/${owner}/${repoName}/tree`),
    staleTime: 5 * 60_000,
  })

  const entries = useMemo(() => treeQuery.data?.tree?.entries || [], [treeQuery.data])
  const effectivePath = useMemo(() => {
    if (selectedPath && entries.some((entry) => entry.path === selectedPath)) return selectedPath
    return pickDefaultFile(entries)
  }, [entries, selectedPath])

  const fileQuery = useQuery({
    queryKey: ['repo-file', owner, repoName, effectivePath],
    queryFn: () =>
      api.get(`/github/repos/${owner}/${repoName}/file?path=${encodeURIComponent(effectivePath)}`),
    enabled: Boolean(effectivePath),
    staleTime: 5 * 60_000,
  })

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const visible = needle
      ? entries.filter((entry) => entry.path.toLowerCase().includes(needle))
      : entries
    const map = new Map()
    for (const entry of visible) {
      const slash = entry.path.indexOf('/')
      const group = slash === -1 ? '' : entry.path.slice(0, slash)
      if (!map.has(group)) map.set(group, [])
      map.get(group).push(entry)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.path.localeCompare(b.path))
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === '') return -1
      if (b === '') return 1
      return a.localeCompare(b)
    })
  }, [entries, search])

  const tree = treeQuery.data?.tree
  const file = fileQuery.data?.file
  const visibleCount = groups.reduce((sum, [, list]) => sum + list.length, 0)

  return (
    <div className="card file-browser">
      <div className="file-tree-pane">
        <div className="file-tree-pane__head">
          <div className="input-wrap">
            <Search size={14} className="input-wrap__icon" aria-hidden="true" />
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter files…"
              aria-label="Filter repository files"
            />
          </div>
        </div>

        <div className="file-tree">
          {treeQuery.isLoading ? (
            <div className="stack" style={{ gap: 8, padding: 8 }}>
              {[70, 55, 82, 44, 64].map((width) => (
                <Skeleton key={width} width={`${width}%`} height={14} />
              ))}
            </div>
          ) : treeQuery.isError ? (
            <ErrorState
              title="Could not load the file tree"
              message={errorMessage(treeQuery.error)}
              onRetry={() => treeQuery.refetch()}
            />
          ) : !entries.length ? (
            <EmptyState
              icon={FolderTree}
              title="No files returned"
              description="This repository appears to be empty or the tree could not be listed."
            />
          ) : !visibleCount ? (
            <EmptyState
              icon={Search}
              title="No matching files"
              description="Try a different path fragment."
            />
          ) : (
            groups.map(([group, list]) => (
              <div key={group || 'root'}>
                <div className="file-group__label" title={group || 'Repository root'}>
                  {group ? `${group}/` : 'Repository root'}
                </div>
                {list.map((entry) => (
                  <button
                    key={entry.path}
                    type="button"
                    className="file-item"
                    aria-current={entry.path === effectivePath ? 'true' : undefined}
                    onClick={() => setSelectedPath(entry.path)}
                    title={entry.path}
                  >
                    <FileCode2 size={13} aria-hidden="true" />
                    <span>{group ? entry.path.slice(group.length + 1) : entry.path}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {tree ? (
          <div className="card__footer" style={{ padding: '10px 14px' }}>
            <div className="hint">
              {formatNumber(tree.totalFiles)} files indexed
              {tree.truncated ? ' · tree truncated by GitHub' : ''}
            </div>
          </div>
        ) : null}
      </div>

      <div className="file-preview-pane">
        <div className="file-preview__head">
          <div
            className="file-preview__path"
            title={file?.path || effectivePath || 'No file selected'}
          >
            {file?.path || effectivePath || 'No file selected'}
          </div>
          {file?.language ? <span className="badge badge--muted">{file.language}</span> : null}
          {file?.truncated ? <span className="badge badge--amber">Truncated</span> : null}
          {file ? <span className="hint nowrap">{formatBytes(file.size)}</span> : null}
          {file?.content ? <CopyButton value={file.content} /> : null}
          {file?.htmlUrl ? (
            <a
              className="btn btn-ghost btn-sm"
              href={file.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          ) : null}
        </div>

        <div className="file-preview__body">
          {!effectivePath ? (
            <div className="file-preview__hint">
              <FileQuestion size={20} aria-hidden="true" />
              Select a file to preview its raw content.
            </div>
          ) : fileQuery.isLoading ? (
            <div style={{ padding: 18 }}>
              <LoadingState label="Loading file content…" />
            </div>
          ) : fileQuery.isError ? (
            <div style={{ padding: 18 }}>
              <ErrorState
                title="Could not load this file"
                message={errorMessage(fileQuery.error)}
                onRetry={() => fileQuery.refetch()}
              />
            </div>
          ) : file?.binary || file?.content === null ? (
            <div className="file-preview__hint">
              <FileQuestion size={20} aria-hidden="true" />
              <div>
                <strong style={{ color: 'var(--text-secondary)' }}>Binary or oversized file</strong>
                <p style={{ marginTop: 6 }}>
                  Preview is limited to text files under 512 KB. Use “Open” to inspect it on GitHub.
                </p>
              </div>
            </div>
          ) : (
            <pre tabIndex={0} aria-label={`Contents of ${file?.path || effectivePath}`}>
              {file?.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
