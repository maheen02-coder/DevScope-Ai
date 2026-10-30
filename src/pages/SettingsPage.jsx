import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Database,
  HardDrive,
  KeyRound,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import { api, errorMessage, fieldErrors } from '../lib/api.js'
import { formatDate } from '../lib/format.js'
import { usePageTitle } from '../lib/hooks.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  Alert,
  Avatar,
  Button,
  ConfirmDialog,
  Field,
  PageHeader,
  PasswordField,
} from '../components/ui.jsx'

const sections = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'preferences', label: 'Preferences', icon: Settings2 },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'data', label: 'Data & privacy', icon: Database },
  { id: 'danger', label: 'Danger zone', icon: TriangleAlert },
]

const dataScopes = {
  reports: {
    title: 'Delete all reports?',
    description: 'Every analysis report stored in your account will be permanently removed.',
    confirm: 'Delete reports',
  },
  chats: {
    title: 'Delete chat history?',
    description: 'All AI chat messages across every repository will be permanently removed.',
    confirm: 'Delete chats',
  },
  all: {
    title: 'Delete all workspace data?',
    description:
      'Every report and chat message will be removed. Your account and preferences stay intact.',
    confirm: 'Delete all data',
  },
}

export default function SettingsPage() {
  usePageTitle('Settings')
  const { user, updateUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState(user?.name || '')
  const [profileErrors, setProfileErrors] = useState({})

  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordAlert, setPasswordAlert] = useState(null)

  const [dataScope, setDataScope] = useState(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountPassword, setAccountPassword] = useState('')
  const [accountError, setAccountError] = useState(null)

  const profileMutation = useMutation({
    mutationFn: (payload) => api.patch('/users/me', payload),
    onSuccess: ({ user: next }) => {
      updateUser(next)
      setName(next.name)
      setProfileErrors({})
      toast.success('Profile updated', 'Your display name has been saved.')
    },
    onError: (error) => {
      setProfileErrors(fieldErrors(error))
      toast.error('Could not update your profile', errorMessage(error))
    },
  })

  const preferencesMutation = useMutation({
    mutationFn: (preferences) => api.patch('/users/me', { preferences }),
    onSuccess: ({ user: next }) => {
      updateUser(next)
      toast.success('Preferences saved', 'New analyses and chats will use these defaults.')
    },
    onError: (error) => toast.error('Could not save preferences', errorMessage(error)),
  })

  const passwordMutation = useMutation({
    mutationFn: (payload) => api.post('/users/me/password', payload),
    onSuccess: ({ user: next }) => {
      updateUser(next)
      setPassword({ currentPassword: '', newPassword: '', confirm: '' })
      setPasswordErrors({})
      setPasswordAlert(null)
      toast.success('Password updated', 'Other sessions have been signed out.')
    },
    onError: (error) => {
      setPasswordErrors(fieldErrors(error))
      setPasswordAlert(errorMessage(error))
    },
  })

  const dataMutation = useMutation({
    mutationFn: (scope) => api.delete('/users/me/data', { scope }),
    onSuccess: ({ deleted }, scope) => {
      queryClient.invalidateQueries({
        predicate: (query) => !['auth', 'health'].includes(query.queryKey[0]),
      })
      const parts = []
      if (scope !== 'chats')
        parts.push(`${deleted.reports} ${deleted.reports === 1 ? 'report' : 'reports'}`)
      if (scope !== 'reports')
        parts.push(`${deleted.chats} chat ${deleted.chats === 1 ? 'message' : 'messages'}`)
      toast.success('Workspace data deleted', `${parts.join(' and ')} removed.`)
      setDataScope(null)
    },
    onError: (error) => toast.error('Could not delete data', errorMessage(error)),
  })

  const accountMutation = useMutation({
    mutationFn: (passwordValue) => api.delete('/users/me', { password: passwordValue }),
    onSuccess: () => {
      // Mirror logout: clear the cached session before leaving the protected
      // route, or GuestOnly still sees the deleted user and bounces to /dashboard.
      queryClient.setQueryData(['auth', 'me'], null)
      queryClient.removeQueries({
        predicate: (query) => !['auth', 'health'].includes(query.queryKey[0]),
      })
      navigate('/login', { replace: true })
    },
    onError: (error) => {
      setAccountError(errorMessage(error))
      toast.error('Could not delete your account', errorMessage(error))
    },
  })

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function submitProfile(event) {
    event.preventDefault()
    const trimmed = name.trim()
    const errors = {}
    if (trimmed.length < 2) errors.name = 'Name must be at least 2 characters.'
    else if (trimmed.length > 60) errors.name = 'Name must be at most 60 characters.'
    setProfileErrors(errors)
    if (Object.keys(errors).length) return
    profileMutation.mutate({ name: trimmed })
  }

  function submitPassword(event) {
    event.preventDefault()
    const errors = {}
    if (!password.currentPassword) errors.currentPassword = 'Enter your current password.'
    if (password.newPassword.length < 8) {
      errors.newPassword = 'New password must be at least 8 characters.'
    } else if (password.newPassword.length > 72) {
      errors.newPassword = 'New password must be at most 72 characters.'
    } else if (password.newPassword === password.currentPassword) {
      errors.newPassword = 'Choose a password different from your current one.'
    }
    if (password.confirm !== password.newPassword) errors.confirm = 'Passwords do not match.'
    setPasswordErrors(errors)
    setPasswordAlert(null)
    if (Object.keys(errors).length) return
    passwordMutation.mutate({
      currentPassword: password.currentPassword,
      newPassword: password.newPassword,
    })
  }

  function openAccountDialog() {
    setAccountPassword('')
    setAccountError(null)
    setAccountOpen(true)
  }

  function confirmAccountDelete() {
    if (!accountPassword) {
      setAccountError('Enter your password to confirm.')
      return
    }
    accountMutation.mutate(accountPassword)
  }

  const preferences = user?.preferences || { defaultDepth: 'standard', chatStyle: 'concise' }
  const nameUnchanged = name.trim() === (user?.name || '')
  const scopeCopy = dataScope ? dataScopes[dataScope] : null

  return (
    <div className="page page--narrow">
      <PageHeader
        eyebrow={
          <>
            <span className="accent">Workspace</span> · Account settings
          </>
        }
        title="Settings"
        description="Manage how DevScope looks on your profile, how analyses run by default, and what data is stored in your private workspace."
      />

      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Settings sections">
          <div className="settings-nav__label">Settings</div>
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <button key={section.id} type="button" onClick={() => scrollToSection(section.id)}>
                <span className="row" style={{ gap: 8 }}>
                  <Icon size={14} aria-hidden="true" />
                  {section.label}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="settings-stack">
          <section id="profile" className="card settings-section">
            <div className="card__header">
              <div className="card__title">
                <UserRound size={16} aria-hidden="true" />
                Profile
              </div>
              <span className="badge badge--muted">Private workspace</span>
            </div>
            <div className="card__body">
              <form className="settings-form" onSubmit={submitProfile} noValidate>
                <div className="row" style={{ gap: 14 }}>
                  <Avatar name={user?.name} size="lg" />
                  <div className="grow">
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{user?.name}</div>
                    <div className="hint">{user?.email}</div>
                  </div>
                </div>

                <Field
                  label="Display name"
                  htmlFor="settings-name"
                  error={profileErrors.name}
                  hint="Shown across your workspace and in report headers."
                >
                  <input
                    id="settings-name"
                    className="input"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setProfileErrors({})
                    }}
                    maxLength={60}
                    autoComplete="name"
                    aria-invalid={profileErrors.name ? 'true' : undefined}
                  />
                </Field>

                <div className="setting-row">
                  <div className="setting-row__label">
                    <h4>Email address</h4>
                    <p>Used to sign in to this workspace. Email changes are not available yet.</p>
                  </div>
                  <div className="setting-row__control">
                    <span className="chip">{user?.email}</span>
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-row__label">
                    <h4>Member since</h4>
                    <p>Your account was created on {formatDate(user?.createdAt)}.</p>
                  </div>
                  <div className="setting-row__control">
                    <span className="chip">{formatDate(user?.createdAt)}</span>
                  </div>
                </div>

                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <Button
                    type="submit"
                    variant="primary"
                    leftIcon={Check}
                    loading={profileMutation.isPending}
                    disabled={nameUnchanged || name.trim().length < 2}
                  >
                    Save profile
                  </Button>
                </div>
              </form>
            </div>
          </section>

          <section id="preferences" className="card settings-section">
            <div className="card__header">
              <div className="card__title">
                <Settings2 size={16} aria-hidden="true" />
                Preferences
              </div>
              <span className="hint">Applied to new analyses</span>
            </div>
            <div className="card__body">
              <div className="setting-row">
                <div className="setting-row__label">
                  <h4>Default analysis depth</h4>
                  <p>
                    Standard reads the most relevant files for a quick review. Deep reads more of
                    the repository and takes longer, producing a more thorough analysis.
                  </p>
                </div>
                <div className="setting-row__control">
                  <select
                    className="select setting-select"
                    value={preferences.defaultDepth}
                    onChange={(event) =>
                      preferencesMutation.mutate({ defaultDepth: event.target.value })
                    }
                    disabled={preferencesMutation.isPending}
                    aria-label="Default analysis depth"
                  >
                    <option value="standard">Standard</option>
                    <option value="deep">Deep</option>
                  </select>
                </div>
              </div>

              <div className="setting-row">
                <div className="setting-row__label">
                  <h4>Chat answer style</h4>
                  <p>
                    Concise keeps answers short and focused. Detailed asks the copilot for more
                    context, examples, and reasoning in every reply.
                  </p>
                </div>
                <div className="setting-row__control">
                  <select
                    className="select setting-select"
                    value={preferences.chatStyle}
                    onChange={(event) =>
                      preferencesMutation.mutate({ chatStyle: event.target.value })
                    }
                    disabled={preferencesMutation.isPending}
                    aria-label="Chat answer style"
                  >
                    <option value="concise">Concise</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </div>
              </div>

              <p className="hint" style={{ marginTop: 14 }}>
                Preferences are saved automatically. You can still override the depth for any single
                analysis before it starts.
              </p>
            </div>
          </section>

          <section id="security" className="card settings-section">
            <div className="card__header">
              <div className="card__title">
                <ShieldCheck size={16} aria-hidden="true" />
                Security
              </div>
              <span className="badge badge--mint badge--dot">Session protected</span>
            </div>
            <div className="card__body">
              <form className="settings-form" onSubmit={submitPassword} noValidate>
                <p className="hint" style={{ margin: 0 }}>
                  Passwords are hashed with bcrypt and never stored or logged in plain text.
                  Changing your password signs out every other session.
                </p>

                {passwordAlert ? (
                  <Alert tone="error" title="Password not changed">
                    <p>{passwordAlert}</p>
                  </Alert>
                ) : null}

                <PasswordField
                  id="settings-current-password"
                  label="Current password"
                  value={password.currentPassword}
                  onChange={(event) => {
                    setPassword((current) => ({ ...current, currentPassword: event.target.value }))
                    setPasswordErrors({})
                    setPasswordAlert(null)
                  }}
                  error={passwordErrors.currentPassword}
                  autoComplete="current-password"
                />

                <div className="form-row">
                  <PasswordField
                    id="settings-new-password"
                    label="New password"
                    value={password.newPassword}
                    onChange={(event) => {
                      setPassword((current) => ({ ...current, newPassword: event.target.value }))
                      setPasswordErrors({})
                      setPasswordAlert(null)
                    }}
                    error={passwordErrors.newPassword}
                    hint="At least 8 characters."
                    autoComplete="new-password"
                  />
                  <PasswordField
                    id="settings-confirm-password"
                    label="Confirm new password"
                    value={password.confirm}
                    onChange={(event) => {
                      setPassword((current) => ({ ...current, confirm: event.target.value }))
                      setPasswordErrors({})
                      setPasswordAlert(null)
                    }}
                    error={passwordErrors.confirm}
                    autoComplete="new-password"
                  />
                </div>

                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <Button
                    type="submit"
                    variant="primary"
                    leftIcon={KeyRound}
                    loading={passwordMutation.isPending}
                    disabled={
                      !password.currentPassword || !password.newPassword || !password.confirm
                    }
                  >
                    Update password
                  </Button>
                </div>
              </form>
            </div>
          </section>

          <section id="data" className="card settings-section">
            <div className="card__header">
              <div className="card__title">
                <Database size={16} aria-hidden="true" />
                Data & privacy
              </div>
              <span className="hint">Stored in your account only</span>
            </div>
            <div className="card__body">
              <div className="setting-row">
                <div className="setting-row__label">
                  <h4>Analysis reports</h4>
                  <p>
                    Stored reports include scores, findings, and metadata for the repositories you
                    analyzed. Remove them without touching your account or chats.
                  </p>
                </div>
                <div className="setting-row__control">
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={Trash2}
                    onClick={() => setDataScope('reports')}
                    disabled={dataMutation.isPending}
                  >
                    Delete reports
                  </Button>
                </div>
              </div>

              <div className="setting-row">
                <div className="setting-row__label">
                  <h4>Chat history</h4>
                  <p>
                    Every question and answer exchanged with the copilot is stored per repository so
                    conversations can continue later.
                  </p>
                </div>
                <div className="setting-row__control">
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={Trash2}
                    onClick={() => setDataScope('chats')}
                    disabled={dataMutation.isPending}
                  >
                    Delete chats
                  </Button>
                </div>
              </div>

              <div className="setting-row">
                <div className="setting-row__label">
                  <h4>All workspace data</h4>
                  <p>
                    Remove every report and chat message at once. Your account, sign-in, and
                    preferences remain. This action cannot be undone.
                  </p>
                </div>
                <div className="setting-row__control">
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={HardDrive}
                    onClick={() => setDataScope('all')}
                    disabled={dataMutation.isPending}
                  >
                    Delete everything
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section id="danger" className="card settings-section danger-zone">
            <div className="card__header">
              <div className="card__title">
                <TriangleAlert size={16} aria-hidden="true" />
                Danger zone
              </div>
            </div>
            <div className="card__body">
              <div className="setting-row">
                <div className="setting-row__label">
                  <h4>Delete account</h4>
                  <p>
                    Permanently delete your account, reports, chat history, and session. There is no
                    recovery and no grace period.
                  </p>
                </div>
                <div className="setting-row__control">
                  <Button
                    variant="danger-solid"
                    size="sm"
                    leftIcon={Trash2}
                    onClick={openAccountDialog}
                  >
                    Delete account
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(dataScope)}
        onClose={() => {
          if (!dataMutation.isPending) setDataScope(null)
        }}
        onConfirm={() => dataMutation.mutate(dataScope)}
        title={scopeCopy?.title || 'Delete data?'}
        description="This action cannot be undone."
        confirmLabel={scopeCopy?.confirm || 'Delete'}
        loading={dataMutation.isPending}
      >
        <Alert tone="warning" title="Permanent removal">
          <p>{scopeCopy?.description}</p>
        </Alert>
      </ConfirmDialog>

      <ConfirmDialog
        open={accountOpen}
        onClose={() => {
          if (!accountMutation.isPending) setAccountOpen(false)
        }}
        onConfirm={confirmAccountDelete}
        title="Delete your account?"
        description="Your workspace will be permanently removed."
        confirmLabel="Delete my account"
        loading={accountMutation.isPending}
      >
        <div className="settings-form">
          <Alert tone="error" title="This cannot be undone">
            <p>
              All reports and chat history are deleted immediately, and you are signed out of this
              session.
            </p>
          </Alert>
          <Field
            label="Confirm with your password"
            htmlFor="settings-account-password"
            error={accountError}
          >
            <input
              id="settings-account-password"
              className="input"
              type="password"
              value={accountPassword}
              onChange={(event) => {
                setAccountPassword(event.target.value)
                setAccountError(null)
              }}
              autoComplete="current-password"
              placeholder="Your password"
              aria-invalid={accountError ? 'true' : undefined}
            />
          </Field>
        </div>
      </ConfirmDialog>
    </div>
  )
}
