import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquarePlus, NotebookPen, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../lib/api.js'
import { formatDateTime } from '../lib/format.js'
import { useToast } from '../context/ToastContext.jsx'
import { Button, ErrorState, Skeleton } from './ui.jsx'

export function ReportNotes({ reportId }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const notesKey = ['report-notes', reportId]

  const notesQuery = useQuery({
    queryKey: notesKey,
    queryFn: () => api.get(`/reports/${reportId}/notes`),
  })

  const addNote = useMutation({
    mutationFn: (text) => api.post(`/reports/${reportId}/notes`, { body: text }),
    onSuccess: () => {
      setBody('')
      queryClient.invalidateQueries({ queryKey: notesKey })
      toast.success('Note added', 'Only you can see notes on this report.')
    },
    onError: (error) => toast.error('Could not add the note', errorMessage(error)),
  })

  const removeNote = useMutation({
    mutationFn: (noteId) => api.delete(`/reports/${reportId}/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKey })
      toast.success('Note deleted', 'The annotation has been removed.')
    },
    onError: (error) => toast.error('Could not delete the note', errorMessage(error)),
  })

  const notes = notesQuery.data?.notes || []
  const trimmed = body.trim()

  function submit(event) {
    event.preventDefault()
    if (!trimmed) return
    addNote.mutate(trimmed)
  }

  return (
    <section className="card">
      <div className="card__header">
        <div className="card__title">
          <NotebookPen size={15} aria-hidden="true" />
          Private notes
        </div>
        <span className="hint">Only visible to you</span>
      </div>
      <div className="card__body">
        <form className="notes-form" onSubmit={submit}>
          <label className="label" htmlFor="report-note-body">
            Add a note
          </label>
          <textarea
            id="report-note-body"
            className="input notes-form__input"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Track decisions, follow-ups, or what you want to verify before acting on this report…"
          />
          <div className="notes-form__foot">
            <span className="hint">{body.length}/2000</span>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              leftIcon={MessageSquarePlus}
              loading={addNote.isPending}
              disabled={!trimmed}
            >
              Add note
            </Button>
          </div>
        </form>

        {notesQuery.isLoading ? (
          <div className="stack" style={{ gap: 10, marginTop: 18 }}>
            <Skeleton width="65%" height={12} />
            <Skeleton width="45%" height={12} />
          </div>
        ) : notesQuery.isError ? (
          <ErrorState
            title="Could not load notes"
            message={errorMessage(notesQuery.error)}
            onRetry={() => notesQuery.refetch()}
          />
        ) : notes.length ? (
          <ul className="notes-list">
            {notes.map((note) => (
              <li key={note.id} className="notes-list__item">
                <div className="grow">
                  <p className="notes-list__body">{note.body}</p>
                  <span className="hint">{formatDateTime(note.createdAt)}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => removeNote.mutate(note.id)}
                  disabled={removeNote.isPending && removeNote.variables === note.id}
                  aria-label="Delete note"
                  title="Delete note"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint" style={{ marginTop: 16 }}>
            No notes yet. Notes are stored with the report and are never included in share links.
          </p>
        )}
      </div>
    </section>
  )
}
