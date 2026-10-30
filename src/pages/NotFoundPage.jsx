import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { usePageTitle } from '../lib/hooks.js'
import { Logo } from '../components/Logo.jsx'

export default function NotFoundPage() {
  usePageTitle('Page not found')
  const { isAuthenticated } = useAuth()
  const { pathname } = useLocation()

  return (
    <main className="notfound">
      <Logo to="/" />
      <div className="notfound__code">404</div>
      <h1>This page is out of scope</h1>
      <p>
        We could not find <code>{pathname}</code>. The link may be mistyped, or the page may have
        moved back into the repository it came from.
      </p>
      <div className="notfound__actions">
        <Link to="/" className="btn btn-secondary">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to home
        </Link>
        {isAuthenticated ? (
          <Link to="/dashboard" className="btn btn-primary">
            Go to dashboard
          </Link>
        ) : (
          <Link to="/login" className="btn btn-primary">
            <Compass size={15} aria-hidden="true" />
            Sign in to your workspace
          </Link>
        )}
      </div>
    </main>
  )
}
