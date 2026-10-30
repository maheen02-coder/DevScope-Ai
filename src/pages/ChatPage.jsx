import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CornerDownLeft,
  FileText,
  MessagesSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'
import { api, errorMessage } from '../lib/api.js'
import { formatDateTime, formatNumber, formatReset, pluralize, timeAgo } from '../lib/format.js'
import { useDebouncedValue, useHealth, usePageTitle, useUsage } from '../lib/hooks.js'
import { useToast } from '../context/ToastContext.jsx'
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  UsageMeter,
} from '../components/ui.jsx'
import { Markdown } from '../components/Markdown.jsx'
import { AiConfigNotice } from '../components/SystemNotices.jsx'
import { getRealtimeSocket, sendChatMessageRealtime } from '../lib/realtime.js'

function messageTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function ChatMessage({ message, pending }) {
  const isUser = message.role === 'user'
  return (
    <div
      className={`chat-msg chat-msg--${isUser ? 'user' : 'assistant'}${pending ? ' chat-msg--pending' : ''}`}
    >
      <span className="chat-msg__avatar" aria-hidden="true">
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </span>
      <div>
        <div className="chat-msg__bubble">
          {isUser ? (
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>
              {message.content}
            </p>
          ) : (
            <Markdown>{message.content}</Markdown>
          )}
        </div>
        <div
          className="chat-msg__time"
          title={message.createdAt ? formatDateTime(message.createdAt) : ''}
        >
          {pending ? 'Sending…' : messageTime(message.createdAt)}
        </div>
      </div>
    </div>
  )
}

const suggestions = [
  'Where should a new contributor start?',
  'Summarize the architecture in five bullets.',
  'What are the riskiest parts of this codebase?',
  'How would I add a new feature end-to-end?',
]

export default function ChatPage() {
  usePageTitle('AI Chat')
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: health } = useHealth()
  const { data: usage } = useUsage()
  const [params, setParams] = useSearchParams()
  const owner = params.get('owner')
  const repoName = params.get('repo')
  const fullName = owner && repoName ? `${owner}/${repoName}` : null

  const [draft, setDraft] = useState('')
  const [pendingMessage, setPendingMessage] = useState(null)
  const [sendError, setSendError] = useState(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [clearOpen, setClearOpen] = useState(false)
  const [live, setLive] = useState(false)
  const textareaRef = useRef(null)
  const logRef = useRef(null)
  const pickerDebounced = useDebouncedValue(pickerQuery.trim(), 400)

  const conversationsQuery = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => api.get('/chat/conversations'),
  })

  const historyQuery = useQuery({
    queryKey: ['chat-history', fullName],
    queryFn: () =>
      api.get(
        `/chat/history?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repoName)}`,
      ),
    enabled: Boolean(fullName),
    retry: 1,
  })

  const recentReportsQuery = useQuery({
    queryKey: ['reports', 'chat-picker'],
    queryFn: () => api.get('/reports?limit=5'),
    staleTime: 60_000,
    enabled: !fullName,
  })

  const repoSearchQuery = useQuery({
    queryKey: ['github-search', 'repositories', pickerDebounced],
    queryFn: () => api.get(`/github/search/repositories?q=${encodeURIComponent(pickerDebounced)}`),
    enabled: !fullName && pickerDebounced.length >= 2,
    staleTime: 60_000,
    retry: 0,
  })

  const send = useMutation({
    mutationFn: async (message) => {
      try {
        return await sendChatMessageRealtime({ owner, repo: repoName, message })
      } catch (error) {
        if (!error?.fallback) throw error
        return api.post('/chat/message', { owner, repo: repoName, message })
      }
    },
    onSuccess: (data) => {
      const canonical = data.repo.fullName
      queryClient.setQueryData(['chat-history', canonical], (previous) => {
        const existing = previous?.messages || []
        const known = new Set(existing.map((item) => item.id))
        return {
          ...(previous || {}),
          messages: [...existing, ...data.messages.filter((item) => !known.has(item.id))],
          quota: data.quota,
          report: previous?.report || null,
        }
      })
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['usage'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setPendingMessage(null)
      setDraft('')
      setSendError(null)
      if (canonical !== fullName) {
        setParams({ owner: data.repo.owner, repo: data.repo.name }, { replace: true })
      }
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
    onError: (error) => {
      setPendingMessage(null)
      setSendError(error)
      queryClient.invalidateQueries({ queryKey: ['usage'] })
    },
  })

  const clearHistory = useMutation({
    mutationFn: () =>
      api.delete(
        `/chat/history?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repoName)}`,
      ),
    onSuccess: ({ deleted }) => {
      setClearOpen(false)
      setPendingMessage(null)
      queryClient.setQueryData(['chat-history', fullName], (previous) => ({
        ...(previous || {}),
        messages: [],
      }))
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] })
      toast.success(
        'Conversation cleared',
        `${pluralize(deleted, 'message')} removed from ${fullName}.`,
      )
    },
    onError: (error) => toast.error('Could not clear the conversation', errorMessage(error)),
  })

  const chatQuota = usage?.chat || historyQuery.data?.quota?.chat
  const quotaBlocked = chatQuota?.remaining === 0
  const aiBlocked = health?.ai?.configured === false
  const blocked = quotaBlocked || aiBlocked
  const messages = historyQuery.data?.messages || []
  const reportSummary = historyQuery.data?.report || null
  const conversations = conversationsQuery.data?.conversations || []
  const messageCount = messages.length + (pendingMessage ? 1 : 0)
  const canSend = Boolean(fullName && draft.trim() && !blocked && !send.isPending)

  useEffect(() => {
    const socket = getRealtimeSocket()
    function handleConnect() {
      setLive(true)
    }
    function handleDisconnect() {
      setLive(false)
    }
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleDisconnect)
    if (!socket.connected) socket.connect()
    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleDisconnect)
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!fullName) return undefined
    const socket = getRealtimeSocket()
    const payload = { owner, repo: repoName }

    function handleMessage(event) {
      if (String(event?.repoFullName || '').toLowerCase() !== fullName.toLowerCase()) return
      queryClient.setQueryData(['chat-history', fullName], (previous) => {
        const existing = previous?.messages || []
        const known = new Set(existing.map((item) => item.id))
        const additions = (event.messages || []).filter((item) => !known.has(item.id))
        if (!additions.length) return previous
        return {
          ...(previous || {}),
          messages: [...existing, ...additions],
          quota: event.quota || previous?.quota,
        }
      })
    }

    socket.emit('chat:join', payload)
    socket.on('chat:message', handleMessage)
    return () => {
      socket.emit('chat:leave', payload)
      socket.off('chat:message', handleMessage)
    }
  }, [fullName, owner, repoName, queryClient])

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messageCount, fullName, historyQuery.isLoading])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [draft, fullName])

  const pickerRepos = useMemo(() => {
    const seen = new Set()
    return (repoSearchQuery.data?.items || []).filter((repo) => {
      if (seen.has(repo.fullName)) return false
      seen.add(repo.fullName)
      return true
    })
  }, [repoSearchQuery.data])

  const recentReports = useMemo(() => {
    const seen = new Set()
    return (recentReportsQuery.data?.items || []).filter((item) => {
      if (seen.has(item.repoFullName)) return false
      seen.add(item.repoFullName)
      return true
    })
  }, [recentReportsQuery.data])

  function selectRepo(ownerName, name) {
    if (send.isPending) return
    setDraft('')
    setSendError(null)
    setPendingMessage(null)
    setPickerQuery('')
    setParams({ owner: ownerName, repo: name })
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function startNewChat() {
    if (send.isPending) return
    setParams({})
    setDraft('')
    setSendError(null)
  }

  function submit(event) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || !fullName || send.isPending || blocked) return
    setSendError(null)
    setPendingMessage({ role: 'user', content: text, createdAt: new Date().toISOString() })
    send.mutate(text)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="page page--chat">
      <PageHeader
        eyebrow={
          <>
            <span className="accent">Copilot</span> · grounded in repository files
          </>
        }
        title="Ask the codebase"
        description="Chat is scoped to one repository at a time. Answers use the README, file tree, and your latest saved analysis — never browse the internet on your behalf."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={Plus}
              onClick={startNewChat}
              disabled={send.isPending}
            >
              New chat
            </Button>
            <Link to="/explore" className="btn btn-ghost">
              <Search size={15} aria-hidden="true" />
              Find a repository
            </Link>
          </>
        }
      />

      <div className="banner-stack">
        <AiConfigNotice title="AI chat requires a Groq API key" />
      </div>

      <div className="chat-shell">
        <aside className="chat-sidebar">
          <div className="chat-sidebar__head">
            <span className="chat-sidebar__title">Conversations</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              onClick={startNewChat}
              disabled={send.isPending}
              aria-label="Start a new conversation"
              title="New chat"
            >
              <Plus size={15} />
            </button>
          </div>

          <div className="chat-sidebar__list">
            {conversationsQuery.isLoading ? (
              <div className="stack" style={{ gap: 8, padding: 8 }}>
                {[0, 1, 2].map((index) => (
                  <div key={index} className="stack" style={{ gap: 5 }}>
                    <div className="skeleton" style={{ width: '70%', height: 11 }} />
                    <div className="skeleton" style={{ width: '90%', height: 9 }} />
                  </div>
                ))}
              </div>
            ) : conversationsQuery.isError ? (
              <p className="hint" style={{ padding: 10 }}>
                Could not load conversations.
              </p>
            ) : !conversations.length ? (
              <p className="hint" style={{ padding: 10 }}>
                No conversations yet. Choose a repository to begin.
              </p>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.repoFullName}
                  type="button"
                  className="conversation"
                  aria-current={
                    fullName && fullName.toLowerCase() === conversation.repoFullName.toLowerCase()
                      ? 'true'
                      : undefined
                  }
                  onClick={() => selectRepo(conversation.owner, conversation.repo)}
                  disabled={send.isPending}
                >
                  <span className="conversation__name">
                    <MessagesSquare size={12} aria-hidden="true" />
                    {conversation.repoFullName}
                  </span>
                  <span className="conversation__preview">
                    {timeAgo(conversation.lastAt)} · {conversation.lastMessage || 'No messages yet'}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="chat-sidebar__foot">
            <UsageMeter
              label="Chat messages"
              used={chatQuota?.used ?? 0}
              limit={chatQuota?.limit ?? 60}
              resetsAt={chatQuota?.resetsAt}
            />
          </div>
        </aside>

        <div className="chat-main">
          <div className="chat-mobile-switcher">
            <select
              className="select"
              value={fullName || ''}
              onChange={(event) => {
                const value = event.target.value
                if (!value) {
                  startNewChat()
                  return
                }
                const [nextOwner, ...rest] = value.split('/')
                selectRepo(nextOwner, rest.join('/'))
              }}
              aria-label="Choose a conversation"
            >
              <option value="">Choose a repository…</option>
              {conversations.map((conversation) => (
                <option key={conversation.repoFullName} value={conversation.repoFullName}>
                  {conversation.repoFullName}
                </option>
              ))}
              {fullName && !conversations.some((item) => item.repoFullName === fullName) ? (
                <option value={fullName}>{fullName}</option>
              ) : null}
            </select>
          </div>

          {fullName ? (
            <>
              <div className="chat-head">
                <div className="chat-head__info">
                  <div className="chat-head__name">{fullName}</div>
                  <div className="chat-head__sub">
                    <span>{pluralize(messages.length, 'stored message')}</span>
                    {reportSummary ? (
                      <Link to={`/analysis/${reportSummary.id}`} className="link">
                        <FileText size={11} aria-hidden="true" /> Latest score{' '}
                        {reportSummary.overallScore ?? '—'}
                      </Link>
                    ) : (
                      <span>No analysis on file</span>
                    )}
                    {chatQuota ? (
                      <span>{pluralize(chatQuota.remaining, 'message left', 'messages left')}</span>
                    ) : null}
                    {live ? (
                      <span className="badge badge--mint" title="Real-time connection is active">
                        Live
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="chat-head__actions">
                  <Link
                    to={`/r/${owner}/${repoName}`}
                    className="btn btn-ghost btn-sm"
                    title="Open repository"
                  >
                    <ArrowUpRight size={14} aria-hidden="true" />
                    Repository
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={Trash2}
                    onClick={() => setClearOpen(true)}
                    disabled={!messages.length || send.isPending}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="chat-log" ref={logRef}>
                {historyQuery.isLoading ? (
                  <LoadingState label="Loading conversation…" />
                ) : historyQuery.isError ? (
                  <ErrorState
                    title="Could not load this conversation"
                    message={errorMessage(historyQuery.error)}
                    onRetry={() => historyQuery.refetch()}
                  />
                ) : !messages.length && !pendingMessage ? (
                  <div className="chat-empty" style={{ padding: '20px 0' }}>
                    <div className="chat-empty__icon">
                      <Sparkles size={22} aria-hidden="true" />
                    </div>
                    <h3>Start with what matters</h3>
                    <p>
                      Ask about architecture, risky code paths, onboarding, or how to extend the
                      project. Answers stay grounded in the repository context and your latest
                      analysis.
                    </p>
                    <div className="chat-suggestions">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="suggestion"
                          onClick={() => {
                            setDraft(suggestion)
                            requestAnimationFrame(() => textareaRef.current?.focus())
                          }}
                        >
                          <Sparkles size={12} aria-hidden="true" />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => (
                      <ChatMessage key={message.id} message={message} />
                    ))}
                    {pendingMessage ? <ChatMessage message={pendingMessage} pending /> : null}
                    {send.isPending ? (
                      <div className="chat-msg chat-msg--assistant">
                        <span className="chat-msg__avatar" aria-hidden="true">
                          <Sparkles size={14} />
                        </span>
                        <div className="chat-typing">
                          <span className="dots" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                          Reading the repository context…
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              {sendError ? (
                <div className="chat-error">
                  <Alert tone="error" title="Message failed" onDismiss={() => setSendError(null)}>
                    <p>{errorMessage(sendError)}</p>
                    {sendError.code === 'QUOTA_EXCEEDED' && sendError.details?.resetsAt ? (
                      <p className="hint">
                        Your next chat slot opens in {formatReset(sendError.details.resetsAt)}.
                      </p>
                    ) : null}
                  </Alert>
                </div>
              ) : null}

              {quotaBlocked ? (
                <div className="chat-error">
                  <Alert tone="warning" title="Chat quota reached">
                    <p>
                      You have used all {chatQuota.limit} chat messages in the rolling 24 hour
                      window.
                      {chatQuota.resetsAt
                        ? ` The next slot opens in ${formatReset(chatQuota.resetsAt)}.`
                        : ''}
                    </p>
                  </Alert>
                </div>
              ) : null}

              <form className="chat-composer" onSubmit={submit}>
                <div className="chat-composer__box">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      blocked
                        ? 'Chat is temporarily unavailable. See the notice above.'
                        : `Ask about ${fullName}…`
                    }
                    aria-label={`Message about ${fullName}`}
                    rows={1}
                    maxLength={4000}
                    disabled={blocked || send.isPending}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    className="chat-composer__send"
                    aria-label="Send message"
                    disabled={!canSend}
                    loading={send.isPending}
                  >
                    <Send size={15} />
                  </Button>
                </div>
                <div className="chat-composer__foot">
                  <span className="chat-composer__hint">
                    <CornerDownLeft size={11} aria-hidden="true" />
                    Enter to send · Shift + Enter for a new line
                  </span>
                  <span>
                    {draft.length}/4000 · ground truth: repository files
                    {health?.ai?.configured ? ` · ${health.ai.model}` : ''}
                  </span>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="chat-head">
                <div className="chat-head__info">
                  <div className="chat-head__name">New conversation</div>
                  <div className="chat-head__sub">
                    Choose a repository to ground the conversation
                  </div>
                </div>
              </div>

              <div className="chat-empty" style={{ justifyContent: 'flex-start' }}>
                <div className="chat-empty__icon">
                  <MessagesSquare size={22} aria-hidden="true" />
                </div>
                <h3>Which repository should we look at?</h3>
                <p>
                  Search public repositories, or pick one from your recent analyses and
                  conversations. Chat history is kept per repository.
                </p>

                <div className="chat-picker" style={{ width: 'min(560px, 100%)', marginTop: 22 }}>
                  <div className="input-wrap">
                    <Search size={14} className="input-wrap__icon" aria-hidden="true" />
                    <input
                      className="input"
                      value={pickerQuery}
                      onChange={(event) => setPickerQuery(event.target.value)}
                      placeholder="Search GitHub repositories…"
                      aria-label="Search repositories to chat about"
                      autoFocus
                    />
                  </div>

                  {repoSearchQuery.isFetching ? (
                    <p className="hint">Searching GitHub…</p>
                  ) : pickerRepos.length ? (
                    <div className="chat-picker__repos">
                      {pickerRepos.map((repo) => (
                        <button
                          key={repo.fullName}
                          type="button"
                          className="chat-picker__repo"
                          onClick={() => selectRepo(repo.owner.login, repo.name)}
                        >
                          <MessagesSquare size={13} aria-hidden="true" />
                          {repo.fullName}
                          <span>{formatNumber(repo.stars)} ★</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {recentReports.length ? (
                    <>
                      <div className="sidebar__section" style={{ padding: '14px 0 2px' }}>
                        Recent analyses
                      </div>
                      <div className="chat-picker__repos">
                        {recentReports.map((item) => {
                          const [reportOwner, ...rest] = item.repoFullName.split('/')
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className="chat-picker__repo"
                              onClick={() => selectRepo(reportOwner, rest.join('/'))}
                            >
                              <FileText size={13} aria-hidden="true" />
                              {item.repoFullName}
                              <span>score {item.overallScore ?? '—'}</span>
                            </button>
                          )
                        })}
                      </div>
                    </>
                  ) : null}

                  {conversations.length ? (
                    <>
                      <div className="sidebar__section" style={{ padding: '14px 0 2px' }}>
                        Recent conversations
                      </div>
                      <div className="chat-picker__repos">
                        {conversations.slice(0, 5).map((conversation) => (
                          <button
                            key={conversation.repoFullName}
                            type="button"
                            className="chat-picker__repo"
                            onClick={() => selectRepo(conversation.owner, conversation.repo)}
                          >
                            <MessagesSquare size={13} aria-hidden="true" />
                            {conversation.repoFullName}
                            <span>{timeAgo(conversation.lastAt)}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {!pickerRepos.length && !recentReports.length && !conversations.length ? (
                    <EmptyState
                      icon={Search}
                      title="Search for a repository"
                      description="Type at least two characters to search GitHub, or run an analysis first and it will appear here."
                    />
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => clearHistory.mutate()}
        title="Clear this conversation?"
        description={`${fullName} · ${messages.length} stored messages`}
        confirmLabel="Clear conversation"
        loading={clearHistory.isPending}
      >
        <Alert tone="warning" title="Stored messages will be deleted">
          <p>
            This removes your chat history for this repository. Analysis reports are stored
            separately and will not be deleted. Quota usage is not reset.
          </p>
        </Alert>
      </ConfirmDialog>
    </div>
  )
}
