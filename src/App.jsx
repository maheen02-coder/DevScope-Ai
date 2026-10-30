import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { Logo } from './components/Logo.jsx'
import AppLayout from './components/AppLayout.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import ExplorePage from './pages/ExplorePage.jsx'
import GithubUserPage from './pages/GithubUserPage.jsx'
import RepoPage from './pages/RepoPage.jsx'
import AnalysisPage from './pages/AnalysisPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import ChatPage from './pages/ChatPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import ComparePage from './pages/ComparePage.jsx'
import SharedReportPage from './pages/SharedReportPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

export function LoadingScreen({ label = 'Checking your session…' }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <Logo />
      <div className="row">
        <span className="spinner" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  )
}

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from }} />
  }
  return <Outlet />
}

function GuestOnly() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/u/:username" element={<GithubUserPage />} />
            <Route path="/r/:owner/:repo" element={<RepoPage />} />
            <Route path="/analysis/:id" element={<AnalysisPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="/s/:token" element={<SharedReportPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
