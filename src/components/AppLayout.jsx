import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  Compass,
  FileText,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  MessagesSquare,
  ScanSearch,
  Search,
  Settings,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useHealth, useUsage } from '../lib/hooks.js'
import { Avatar, UsageMeter } from './ui.jsx'
import { Logo } from './Logo.jsx'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/limits', label: 'Rate limits', icon: Gauge },
  { to: '/compare', label: 'Compare', icon: ArrowLeftRight },
  { to: '/chat', label: 'AI Chat', icon: MessagesSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function useCrumb() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/analysis/')) {
    return { parent: { to: '/reports', label: 'Reports' }, label: 'Analysis report' }
  }
  if (pathname.startsWith('/u/')) {
    return {
      parent: { to: '/explore', label: 'Explore' },
      label: `@${pathname.split('/')[2] || ''}`,
    }
  }
  if (pathname.startsWith('/r/')) {
    const [, , owner, repo] = pathname.split('/')
    return { parent: { to: '/explore', label: 'Explore' }, label: `${owner}/${repo}` }
  }
  const match = navItems.find((item) => item.to === pathname)
  return { label: match?.label || 'Workspace' }
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { data: usage } = useUsage()
  const { data: health } = useHealth()
  const toast = useToast()
  const navigate = useNavigate()
  const crumb = useCrumb()
  const [navOpen, setNavOpen] = useState(false)

  const analysis = usage?.analysis
  const chat = usage?.chat
  const analysisLimit = analysis?.limit ?? health?.limits?.analysis ?? 10
  const chatLimit = chat?.limit ?? health?.limits?.chat ?? 60
  const analysesLeft = analysis?.remaining ?? analysisLimit
  const lowQuota = analysesLeft <= 2
  const shortcut = /Mac|iPhone|iPad/.test(window.navigator.platform || '') ? '⌘K' : 'Ctrl K'

  useEffect(() => {
    if (!navOpen) return undefined
    function handleKey(event) {
      if (event.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [navOpen])

  useEffect(() => {
    function handleShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        navigate('/explore?focus=search')
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [navigate])

  async function handleLogout() {
    try {
      await logout()
      toast.info('Signed out', 'Your session cookie has been cleared.')
      navigate('/login', { replace: true })
    } catch {
      toast.error('Could not sign out', 'Please check your connection and retry.')
    }
  }

  return (
    <div className="app-shell">
      <aside
        className={clsx('sidebar', navOpen && 'open')}
        id="app-navigation"
        aria-label="Main navigation"
      >
        <div className="sidebar__brand" onClick={() => setNavOpen(false)}>
          <Logo to="/dashboard" />
        </div>

        <nav className="sidebar__nav" aria-label="Workspace sections">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => clsx('nav-item', isActive && 'active')}
                onClick={() => setNavOpen(false)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar__section">Rolling 24h usage</div>
        <div className="sidebar__usage">
          <div className="sidebar__usage-head">
            <span>Server-enforced quota</span>
            <strong>{analysesLeft > 0 ? 'Active' : 'Paused'}</strong>
          </div>
          <UsageMeter
            label="Analyses"
            icon={ScanSearch}
            used={analysis?.used ?? 0}
            limit={analysisLimit}
            resetsAt={analysis?.resetsAt}
            compact
          />
          <UsageMeter
            label="Chat messages"
            icon={MessageSquare}
            used={chat?.used ?? 0}
            limit={chatLimit}
            resetsAt={chat?.resetsAt}
            compact
          />
          <Link to="/limits" className="sidebar__usage-link" onClick={() => setNavOpen(false)}>
            Open rate-limit report
            <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </div>

        <div className="sidebar__spacer" />

        <div className="sidebar__user">
          <Avatar src={null} name={user?.name} size="sm" />
          <div className="sidebar__user-info">
            <div className="sidebar__user-name">{user?.name || 'Account'}</div>
            <div className="sidebar__user-email">{user?.email}</div>
          </div>
          <button
            type="button"
            className="sidebar__logout"
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {navOpen ? (
        <div
          className="sidebar-overlay"
          onClick={() => setNavOpen(false)}
          role="presentation"
          aria-hidden="true"
        />
      ) : null}

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="topbar__menu"
            onClick={() => setNavOpen((open) => !open)}
            aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={navOpen}
            aria-controls="app-navigation"
          >
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="topbar__crumb">
            {crumb.parent ? (
              <>
                <Link to={crumb.parent.to}>{crumb.parent.label}</Link>
                <ChevronRight size={13} aria-hidden="true" />
              </>
            ) : null}
            <strong className="truncate">{crumb.label}</strong>
          </div>

          <div className="topbar__right">
            <Link to="/explore?focus=search" className="topbar__search" aria-label="Search GitHub">
              <Search size={14} aria-hidden="true" />
              <span>Search GitHub</span>
              <kbd className="kbd">{shortcut}</kbd>
            </Link>
            <span
              className={clsx('quota-chip', lowQuota && 'quota-chip--low')}
              title="Analyses remaining in the rolling 24 hour window"
            >
              <ScanSearch size={13} aria-hidden="true" />
              {analysesLeft} left
            </span>
          </div>
        </header>

        <Outlet />
      </div>
    </div>
  )
}
