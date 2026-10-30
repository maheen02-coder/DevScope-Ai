import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Layers, ScanSearch, Sparkles, Zap } from 'lucide-react'
import clsx from 'clsx'
import { api, errorMessage } from '../lib/api.js'
import { formatReset, pluralize } from '../lib/format.js'
import { useHealth, useUsage } from '../lib/hooks.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { Alert, Button, Modal, UsageMeter } from './ui.jsx'
import { AiConfigNotice } from './SystemNotices.jsx'

const stages = [
  'Resolving repository and default branch',
  'Collecting the file tree',
  'Reading README and prioritized source files',
  'Groq is reasoning over the codebase',
  'Validating the structured report',
]

function AnalysisDialog({ open, onClose, owner, repoName, defaultDepth }) {
  const auth = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: usage } = useUsage()
  const { data: health } = useHealth()

  const preferredDepth = defaultDepth || auth.user?.preferences?.defaultDepth || 'standard'
  const [depth, setDepth] = useState(preferredDepth)
  const [stage, setStage] = useState(-1)
  const [error, setError] = useState(null)

  const analysis = usage?.analysis
  const remaining = analysis?.remaining ?? health?.limits?.analysis ?? null
  const used = analysis?.used ?? 0
  const limit = analysis?.limit ?? health?.limits?.analysis ?? 10
  const quotaBlocked = remaining === 0
  const aiBlocked = health?.ai?.configured === false

  const mutation = useMutation({
    mutationFn: () => api.post('/analyze', { owner, repo: repoName, depth }),
    onSuccess: ({ report }) => {
      setStage(stages.length)
      queryClient.invalidateQueries({ queryKey: ['usage'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['repo-latest-report'] })
      queryClient.invalidateQueries({ queryKey: ['chat-history'] })
      toast.success(
        'Analysis complete',
        `${report.repoFullName} scored ${report.analysis?.scores?.overall ?? '—'}/100.`,
      )
      onClose?.()
      navigate(`/analysis/${report.id}`)
    },
    onError: (mutationError) => {
      setError(mutationError)
      queryClient.invalidateQueries({ queryKey: ['usage'] })
    },
  })

  useEffect(() => {
    if (!mutation.isPending) return undefined
    const interval = setInterval(() => {
      setStage((current) => Math.min(current + 1, stages.length - 2))
    }, 2300)
    return () => clearInterval(interval)
  }, [mutation.isPending])

  function start() {
    setError(null)
    setStage(0)
    mutation.mutate()
  }

  const canStart = !mutation.isPending && !quotaBlocked && !aiBlocked

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run repository analysis"
      description={`${owner}/${repoName}`}
      closeDisabled={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={start}
            loading={mutation.isPending}
            disabled={!canStart}
            leftIcon={ScanSearch}
          >
            {mutation.isPending ? 'Analyzing…' : 'Run analysis'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {aiBlocked ? <AiConfigNotice title="Add a Groq API key before running analyses" /> : null}

        {quotaBlocked ? (
          <Alert tone="warning" title="No analyses remaining">
            You have used all {pluralize(limit, 'analysis', 'analyses')} in the rolling 24 hour
            window.
            {analysis?.resetsAt ? ` The next slot opens in ${formatReset(analysis.resetsAt)}.` : ''}
          </Alert>
        ) : null}

        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            Analysis depth
          </div>
          <div className="depth-options">
            <button
              type="button"
              className="option-card"
              data-selected={depth === 'standard'}
              onClick={() => setDepth('standard')}
              disabled={mutation.isPending}
              aria-pressed={depth === 'standard'}
            >
              <span className="option-card__radio" aria-hidden="true" />
              <span>
                <strong>
                  <Zap size={13} aria-hidden="true" />
                  Standard
                </strong>
                <p>
                  Up to 10 prioritized source files, README, and the file tree. Best for a fast
                  overview.
                </p>
              </span>
            </button>
            <button
              type="button"
              className="option-card"
              data-selected={depth === 'deep'}
              onClick={() => setDepth('deep')}
              disabled={mutation.isPending}
              aria-pressed={depth === 'deep'}
            >
              <span className="option-card__radio" aria-hidden="true" />
              <span>
                <strong>
                  <Layers size={13} aria-hidden="true" />
                  Deep
                </strong>
                <p>
                  Up to 18 files with a larger context window. Better for architecture and security
                  review.
                </p>
              </span>
            </button>
          </div>
        </div>

        <div className="card" style={{ background: 'var(--surface-2)' }}>
          <div className="card__body" style={{ padding: 14 }}>
            <UsageMeter
              label="Analyses used"
              icon={ScanSearch}
              used={used}
              limit={limit}
              resetsAt={analysis?.resetsAt}
            />
            <p className="hint" style={{ marginTop: 10 }}>
              Each run consumes one server-enforced analysis slot. The slot is released
              automatically if the repository cannot be collected or the AI call fails.
            </p>
          </div>
        </div>

        {mutation.isPending || stage >= 0 ? (
          <div className="run-progress" role="status" aria-live="polite">
            {stages.map((label, index) => {
              const state = index < stage ? 'done' : index === stage ? 'active' : 'pending'
              return (
                <div
                  key={label}
                  className={clsx(
                    'run-step',
                    state === 'active' && 'run-step--active',
                    state === 'done' && 'run-step--done',
                  )}
                >
                  <span className="run-step__dot" aria-hidden="true">
                    {state === 'done' ? <Check size={10} /> : index + 1}
                  </span>
                  <span>{label}</span>
                </div>
              )
            })}
            <p className="hint" style={{ marginTop: 8 }}>
              <Sparkles size={11} aria-hidden="true" /> Repository content is treated as untrusted
              data. No repository code is executed, and no secrets are sent to the model.
            </p>
          </div>
        ) : null}

        {error ? (
          <Alert tone="error" title="Analysis failed">
            <p>{errorMessage(error)}</p>
            {error?.code === 'QUOTA_EXCEEDED' && error?.details?.resetsAt ? (
              <p className="hint">
                Next analysis slot opens in {formatReset(error.details.resetsAt)}.
              </p>
            ) : null}
            {['AI_CONTEXT_TOO_LARGE', 'AI_RATE_LIMITED'].includes(error?.code) &&
            error?.details?.suggestion ? (
              <p className="hint">{error.details.suggestion}</p>
            ) : null}
            {error?.code === 'AI_LIMITS_TOO_SMALL' ? (
              <p className="hint">
                Raise <code>AI_MAX_INPUT_TOKENS</code> or choose a model with a larger context
                window.
              </p>
            ) : null}
          </Alert>
        ) : null}
      </div>
    </Modal>
  )
}

export default function RunAnalysisModal({ open, ...props }) {
  if (!open) return null
  return <AnalysisDialog open={open} {...props} />
}
