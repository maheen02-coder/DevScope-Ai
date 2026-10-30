import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, LogIn } from 'lucide-react'
import AuthLayout from '../components/AuthLayout.jsx'
import { OAuthButtons } from '../components/OAuthButtons.jsx'
import { Alert, Button, Field, PasswordField } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { errorMessage, fieldErrors } from '../lib/api.js'
import { usePageTitle } from '../lib/hooks.js'

const oauthErrors = {
  state: 'The sign-in request expired or was tampered with. Please try again.',
  email: 'The provider did not share a verified email address, so the account could not be linked.',
  failed: 'OAuth sign-in did not complete. Please try again or use your password.',
}

function safeRedirect(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/dashboard'
}

export default function LoginPage() {
  usePageTitle('Sign in')
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const oauthError = new URLSearchParams(location.search).get('oauth')

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }))
      setErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!form.email.trim()) nextErrors.email = 'Enter your email address.'
    if (!form.password) nextErrors.password = 'Enter your password.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setBusy(true)
    setFormError(null)
    try {
      await auth.login({ email: form.email.trim(), password: form.password })
      navigate(safeRedirect(location.state?.from), { replace: true })
    } catch (error) {
      setErrors(fieldErrors(error))
      setFormError(errorMessage(error, 'Unable to sign in. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back to the scope."
      subtitle="Sign in to analyze repositories, revisit saved reports, and continue conversations with the codebase."
    >
      <h1 className="auth__heading">Sign in</h1>
      <p className="auth__sub">
        Use the email and password for this DevScope workspace. Sessions are stored in an HTTP-only
        cookie.
      </p>

      {formError ? (
        <div style={{ marginTop: 20 }}>
          <Alert tone="error" title="Could not sign in">
            <p>{formError}</p>
          </Alert>
        </div>
      ) : null}

      {oauthError && oauthErrors[oauthError] ? (
        <div style={{ marginTop: 20 }}>
          <Alert tone="error" title="Social sign-in problem">
            <p>{oauthErrors[oauthError]}</p>
          </Alert>
        </div>
      ) : null}

      <form className="auth__fields" onSubmit={handleSubmit} noValidate>
        <Field label="Email" htmlFor="login-email" error={errors.email}>
          <input
            id="login-email"
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

        <PasswordField
          id="login-password"
          label="Password"
          value={form.password}
          onChange={update('password')}
          error={errors.password}
          autoComplete="current-password"
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={busy}
          leftIcon={LogIn}
          style={{ marginTop: 6 }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <OAuthButtons />

      <p className="auth__switch">
        New to DevScope? <Link to="/register">Create an account</Link>
      </p>

      <p className="auth__legal">
        DevScope never asks for your GitHub password. Repository access uses the public GitHub API.
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
