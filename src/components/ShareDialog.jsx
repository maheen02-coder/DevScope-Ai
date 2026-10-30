import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, Link2, ShieldCheck, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../lib/api.js'
import { formatDateTime } from '../lib/format.js'
import { useToast } from '../context/ToastContext.jsx'
import { Alert, Button, Modal } from './ui.jsx'

export default function ShareDialog({ open, onClose, report }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [days, setDays] = useState(30)
  const [copied, setCopied] = useState(null)
  const shareKey = ['report-share', report?.id]

  const shareQuery = useQuery({
    queryKey: shareKey,
    queryFn: () => api.get(`/reports/${report.id}/share`),
    enabled: open && Boolean(report?.id),
  })

  const createShare = useMutation({
    mutationFn: () => api.post(`/reports/${report.id}/share`, { expiresInDays: days }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shareKey })
      toast.success(
        'Share link created',
        'Anyone with the link can view this report until it expires.',
      )
    },
    onError: (error) => toast.error('Could not create the share link', errorMessage(error)),
  })

  const revokeShare = useMutation({
    mutationFn: () => api.delete(`/reports/${report.id}/share`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shareKey })
      toast.success('Share link revoked', 'The previous link no longer opens this report.')
    },
    onError: (error) => toast.error('Could not revoke the share link', errorMessage(error)),
  })

  if (!report) return null

  function handleClose() {
    setCopied(null)
    onClose()
  }

  const share = shareQuery.data?.share
  const shareUrl = share ? `${window.location.origin}/s/${share.token}` : ''
  const badgeUrl = share
    ? `${window.location.origin}/api/public/reports/${share.token}/badge.svg`
    : ''
  const badgeMarkdown = share ? `[![DevScope score](${badgeUrl})](${shareUrl})` : ''

  async function copyValue(value, key) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      toast.error('Could not copy automatically', 'Select the text and copy it manually.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Share this report"
      description="Create a read-only link that anyone can open without an account."
      footer={
        <Button variant="ghost" onClick={handleClose}>
          Close
        </Button>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <Alert tone="info" title="What is shared">
          <p>
            The scores, summary, architecture, recommendations, and valuation estimate become
            publicly readable. Private notes, your email, account details, and chat history are
            never included.
          </p>
        </Alert>

        {shareQuery.isLoading ? (
          <p className="hint">Checking for an active link…</p>
        ) : shareQuery.isError ? (
          <Alert tone="danger" title="Could not load the share state">
            <p>{errorMessage(shareQuery.error)}</p>
          </Alert>
        ) : share ? (
          <>
            <div className="field">
              <label className="label" htmlFor="share-url">
                Public link
              </label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  id="share-url"
                  className="input"
                  value={shareUrl}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
                <Button
                  variant="secondary"
                  leftIcon={copied === 'url' ? Check : Copy}
                  onClick={() => copyValue(shareUrl, 'url')}
                >
                  {copied === 'url' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <span className="hint">Expires {formatDateTime(share.expiresAt)}</span>
            </div>

            <div className="field">
              <label className="label" htmlFor="badge-snippet">
                README badge
              </label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  id="badge-snippet"
                  className="input"
                  value={badgeMarkdown}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
                <Button
                  variant="secondary"
                  leftIcon={copied === 'badge' ? Check : Copy}
                  onClick={() => copyValue(badgeMarkdown, 'badge')}
                >
                  {copied === 'badge' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <span className="hint">
                Paste into a Markdown README to show the live score badge.
              </span>
            </div>

            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <a
                className="btn btn-secondary btn-sm"
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} aria-hidden="true" />
                Open public view
              </a>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={Trash2}
                loading={revokeShare.isPending}
                onClick={() => revokeShare.mutate()}
              >
                Revoke link
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label className="label" htmlFor="share-days">
                Link expiry
              </label>
              <select
                id="share-days"
                className="input"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button
                variant="primary"
                leftIcon={Link2}
                loading={createShare.isPending}
                onClick={() => createShare.mutate()}
              >
                Create share link
              </Button>
              <span className="hint row" style={{ gap: 6 }}>
                <ShieldCheck size={13} aria-hidden="true" />
                Unguessable, expiring, revocable
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
