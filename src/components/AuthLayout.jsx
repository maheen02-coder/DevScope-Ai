import { Link } from 'react-router-dom'
import { MessagesSquare, ScanSearch, ShieldCheck } from 'lucide-react'
import { Logo } from './Logo.jsx'

const defaultPoints = [
  {
    icon: ShieldCheck,
    text: 'Read-only GitHub access. DevScope never asks for your GitHub password.',
  },
  {
    icon: ScanSearch,
    text: 'Analyses are grounded in real files and validated against a strict schema.',
  },
  {
    icon: MessagesSquare,
    text: 'Reports and conversations are scoped to your account and enforced on the server.',
  },
]

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth">
      <aside className="auth__brand">
        <Logo to="/" />
        <div className="auth__quote">
          <div className="hero__eyebrow" style={{ marginBottom: 18 }}>
            <span className="dot" aria-hidden="true" />
            Repository intelligence
          </div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <ul className="auth__points">
            {defaultPoints.map((point) => {
              const Icon = point.icon
              return (
                <li key={point.text}>
                  <Icon size={15} aria-hidden="true" />
                  <span>{point.text}</span>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="auth__brand-foot">
          Server-side sessions · No repository code execution ·{' '}
          <Link to="/" className="link">
            Back to overview
          </Link>
        </div>
      </aside>
      <main className="auth__panel">
        <div className="auth__form">
          <div className="auth__mobile-brand">
            <Logo to="/" />
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
