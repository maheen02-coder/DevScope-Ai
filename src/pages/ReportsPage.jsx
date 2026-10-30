import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Compass, FileText, Search, Star } from 'lucide-react'
import { api, errorMessage } from '../lib/api.js'
import { pluralize } from '../lib/format.js'
import { useDebouncedValue, usePageTitle } from '../lib/hooks.js'
import { useToast } from '../context/ToastContext.jsx'
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Skeleton,
  Tabs,
} from '../components/ui.jsx'
import { ReportCard } from '../components/Cards.jsx'

const PAGE_SIZE = 10

export default function ReportsPage() {
  usePageTitle('Reports')
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page') || 1) || 1)
  const filter = params.get('filter') === 'saved' ? 'saved' : 'all'
  const [searchInput, setSearchInput] = useState(params.get('q') || '')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const debounced = useDebouncedValue(searchInput.trim(), 350)

  const reportsQuery = useQuery({
    queryKey: ['reports', debounced, filter, page],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (debounced) query.set('q', debounced)
      if (filter === 'saved') query.set('saved', 'true')
      return api.get(`/reports?${query.toString()}`)
    },
    placeholderData: keepPreviousData,
  })

  const toggleSaved = useMutation({
    mutationFn: ({ id, saved }) => api.patch(`/reports/${id}`, { saved }),
    onSuccess: ({ report }) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['repo-latest-report'] })
      queryClient.setQueryData(['report', report.id], { report })
      toast.success(report.saved ? 'Report saved' : 'Removed from saved', report.repoFullName)
    },
    onError: (error) => toast.error('Could not update the report', errorMessage(error)),
  })

  const deleteReport = useMutation({
    mutationFn: (id) => api.delete(`/reports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['repo-latest-report'] })
      toast.success('Report deleted', 'The stored analysis has been removed.')
      setDeleteTarget(null)
    },
    onError: (error) => toast.error('Could not delete the report', errorMessage(error)),
  })

  function updateParams(mutator) {
    const next = new URLSearchParams(params)
    mutator(next)
    setParams(next, { replace: true })
  }

  function changeFilter(next) {
    updateParams((nextParams) => {
      if (next === 'saved') nextParams.set('filter', 'saved')
      else nextParams.delete('filter')
      nextParams.delete('page')
      if (debounced) nextParams.set('q', debounced)
      else nextParams.delete('q')
    })
  }

  function changePage(next) {
    updateParams((nextParams) => {
      nextParams.set('page', String(next))
      if (debounced) nextParams.set('q', debounced)
      else nextParams.delete('q')
    })
  }

  function submitSearch(event) {
    event.preventDefault()
    updateParams((nextParams) => {
      if (searchInput.trim()) nextParams.set('q', searchInput.trim())
      else nextParams.delete('q')
      nextParams.delete('page')
    })
  }

  const data = reportsQuery.data
  const items = data?.items || []
  const total = data?.total ?? 0

  return (
    <div className="page page--narrow">
      <PageHeader
        eyebrow={
          <>
            <span className="accent">Library</span> · {pluralize(total, 'report')}
          </>
        }
        title="Analysis reports"
        description="Every analysis you have run, kept privately in your workspace, including its AI valuation estimate. Save the ones worth revisiting, search by repository, or delete what you no longer need."
        actions={
          <>
            <Link to="/compare" className="btn btn-secondary">
              <ArrowLeftRight size={15} aria-hidden="true" />
              Compare reports
            </Link>
            <Link to="/explore" className="btn btn-primary">
              <Compass size={15} aria-hidden="true" />
              Analyze something new
            </Link>
          </>
        }
      />

      <div className="reports-toolbar">
        <form className="reports-toolbar__search input-wrap" onSubmit={submitSearch}>
          <Search size={14} className="input-wrap__icon" aria-hidden="true" />
          <input
            className="input"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by repository or title…"
            aria-label="Search reports"
          />
        </form>
        <Tabs
          items={[
            { value: 'all', label: 'All reports', icon: FileText },
            { value: 'saved', label: 'Saved', icon: Star },
          ]}
          value={filter}
          onChange={changeFilter}
          label="Report filter"
        />
        {reportsQuery.isFetching && !reportsQuery.isLoading ? (
          <span className="hint row" style={{ gap: 6 }}>
            <span className="spinner spinner--sm" aria-hidden="true" /> Updating
          </span>
        ) : null}
      </div>

      {reportsQuery.isLoading ? (
        <div className="report-list">
          {[0, 1, 2].map((index) => (
            <div key={index} className="card report-card">
              <Skeleton circle width={54} height={54} />
              <div className="stack" style={{ gap: 9 }}>
                <Skeleton width="45%" height={14} />
                <Skeleton width="70%" height={10} />
                <Skeleton width="90%" height={10} />
              </div>
              <Skeleton width={84} height={30} />
            </div>
          ))}
        </div>
      ) : reportsQuery.isError ? (
        <ErrorState
          title="Could not load your reports"
          message={errorMessage(reportsQuery.error)}
          onRetry={() => reportsQuery.refetch()}
        />
      ) : !items.length ? (
        <div className="empty-card">
          {debounced ? (
            <EmptyState
              icon={Search}
              title="No reports match this search"
              description={`Nothing matched “${debounced}”. Try a different repository name or clear the search.`}
              actions={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchInput('')
                    updateParams((nextParams) => {
                      nextParams.delete('q')
                      nextParams.delete('page')
                    })
                  }}
                >
                  Clear search
                </Button>
              }
            />
          ) : filter === 'saved' ? (
            <EmptyState
              icon={Star}
              title="No saved reports yet"
              description="Open any analysis and choose “Save report” to keep it in this view."
              actions={
                <Button variant="secondary" onClick={() => changeFilter('all')}>
                  View all reports
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="No reports yet"
              description="Find a repository on GitHub, open it, and run your first AI analysis. The report will appear here automatically."
              actions={
                <Link to="/explore" className="btn btn-primary btn-sm">
                  Explore repositories
                </Link>
              }
            />
          )}
        </div>
      ) : (
        <>
          <div className="report-list">
            {items.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                busy={
                  (toggleSaved.isPending && toggleSaved.variables?.id === report.id) ||
                  (deleteReport.isPending && deleteReport.variables === report.id)
                }
                onToggleSaved={(target) =>
                  toggleSaved.mutate({ id: target.id, saved: !target.saved })
                }
                onDelete={(target) => setDeleteTarget(target)}
              />
            ))}
          </div>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            limit={data.limit}
            onPageChange={changePage}
            label="reports"
          />
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteReport.mutate(deleteTarget.id)}
        title="Delete this report?"
        description={
          deleteTarget
            ? `${deleteTarget.repoFullName} · ${pluralize(deleteTarget.filesAnalyzed, 'file')} analyzed`
            : ''
        }
        confirmLabel="Delete report"
        loading={deleteReport.isPending}
      >
        <Alert tone="warning" title="This cannot be undone">
          <p>
            The stored analysis and its scores will be removed from your account. Chat history for
            this repository is stored separately.
          </p>
        </Alert>
      </ConfirmDialog>
    </div>
  )
}
