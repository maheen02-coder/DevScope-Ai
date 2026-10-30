import { Component } from 'react'
import { Logo } from './Logo.jsx'
import { Button } from './ui.jsx'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('DevScope UI error', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="loading-screen" role="alert">
        <Logo />
        <div className="card" style={{ maxWidth: 460, width: '100%' }}>
          <div className="card__body stack" style={{ textAlign: 'center', alignItems: 'center' }}>
            <div>
              <h1 className="auth__heading">Something broke in the interface</h1>
              <p className="auth__sub">
                The error was logged in the console. Reloading usually restores the session.
              </p>
            </div>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload DevScope
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
