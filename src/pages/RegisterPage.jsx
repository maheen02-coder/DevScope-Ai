import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, UserPlus } from 'lucide-react'
import clsx from 'clsx'
import AuthLayout from '../components/AuthLayout.jsx'
import { OAuthButtons } from '../components/OAuthButtons.jsx'
import { Alert, Button, Field, PasswordField } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { errorMessage, fieldErrors } from '../lib/api.js'
import { usePageTitle } from '../lib/hooks.js'

const checks = [
  { label: '8+ characters', test: (value) => value.length >= 8 },
  { label: 'upper & lowercase', test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: 'a number', test: (value) => /\d/.test(value) },
  { label: 'a symbol', test: (value) => /[^A-Za-z0-9]/.test(value) },
]

export default function RegisterPage() {
  usePageTitle('Create account')
  const auth = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const passed = checks.filter((check) => check.test(form.password)).length

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }))
      setErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (form.name.trim().length < 2) nextErrors.name = 'Enter your name (at least 2 characters).'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.'
    }
    if (form.password.length < 8) nextErrors.password = 'Use at least 8 characters.'
    if (form.password.length > 72) nextErrors.password = 'Passwords are limited to 72 characters.'
    if (form.confirm !== form.password) nextErrors.confirm = 'Passwords do not match.'

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setBusy(true)
    setFormError(null)
    try {
      await auth.register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      })
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setErrors(fieldErrors(error))
      setFormError(errorMessage(error, 'Unable to create your account. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="A clearer read on every repository."
      subtitle="Create a workspace to run AI analyses, save the reports that matter, and keep a private conversation history per repository."
    >
      <h1 className="auth__heading">Create your workspace</h1>
      <p className="auth__sub">
        Your first repository analysis is one search away. No GitHub installation required.
      </p>

      {formError ? (
        <div style={{ marginTop: 20 }}>
          <Alert tone="error" title="Could not create the account">
            <p>{formError}</p>
          </Alert>
        </div>
      ) : null}

      <form className="auth__fields" onSubmit={handleSubmit} noValidate>
        <Field label="Name" htmlFor="register-name" error={errors.name}>
          <input
            id="register-name"
            className="input"
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={form.name}
            onChange={update('name')}
            aria-invalid={errors.name ? 'true' : undefined}
            required
          />
        </Field>

        <Field label="Email" htmlFor="register-email" error={errors.email}>
          <input
            id="register-email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={update('email')}
            aria-invalid={errors.email ? 'true' : undefined}
            required
          />
        </Field>

        <div>
          <PasswordField
            id="register-password"
            label="Password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
            autoComplete="new-password"
          />
          <div className="password-strength" aria-hidden="true">
            {checks.map((check, index) => (
              <span key={check.label} className={clsx(index < passed && 'on')} />
            ))}
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            {form.password
              ? `${passed} of ${checks.length} strength checks · ${
                  checks
                    .filter((check) => !check.test(form.password))
                    .map((check) => check.label)
                    .join(', ') || 'all checks passed'
                }`
              : 'Passwords are hashed with bcrypt on the server.'}
          </p>
        </div>

        <PasswordField
          id="register-confirm"
          label="Confirm password"
          value={form.confirm}
          onChange={update('confirm')}
          error={errors.confirm}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={busy}
          leftIcon={UserPlus}
          style={{ marginTop: 6 }}
        >
          {busy ? 'Creating workspace…' : 'Create account'}
        </Button>
      </form>

      <OAuthButtons />

      <p className="auth__switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>

      <p className="auth__legal">
        By creating an account you agree to use DevScope only on repositories you are authorized to
        inspect. Analyses use the public GitHub API and are subject to server-enforced daily quotas.
        <span className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
          <Link to="/" className="link">
            Back to overview
          </Link>
          <ArrowRight size={12} aria-hidden="true" className="faint" />
        </span>
      </p>
    </AuthLayout>
  )
}
