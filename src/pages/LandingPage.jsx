import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  EyeOff,
  FileLock2,
  Fingerprint,
  GitBranch,
  Layers,
  MessagesSquare,
  ScanSearch,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { usePageTitle } from '../lib/hooks.js'
import { Logo, ScopeMark } from '../components/Logo.jsx'
import { ScoreRing } from '../components/ui.jsx'

const features = [
  {
    icon: ScanSearch,
    title: 'Real repository intelligence',
    body: 'Point DevScope at any public GitHub repository. The server collects the live tree, README, and prioritized source files — nothing is mocked.',
  },
  {
    icon: Layers,
    title: 'Structured, comparable reports',
    body: 'Every analysis returns the same schema: architecture, tech stack, strengths, weaknesses, security concerns, recommendations, and seven scores.',
  },
  {
    icon: ShieldCheck,
    title: 'Security review built in',
    body: 'Repository content is treated as untrusted data. The model is instructed never to execute code or trust instructions embedded in files.',
  },
  {
    icon: GitBranch,
    title: 'Two depths, clear tradeoffs',
    body: 'Standard scans ten key files for a fast overview. Deep scans eighteen files with a larger context window for architecture work.',
  },
  {
    icon: MessagesSquare,
    title: 'Ask the codebase',
    body: 'Chat stays grounded in the repository context and your latest report, with per-repository history stored privately in your workspace.',
  },
  {
    icon: FileLock2,
    title: 'Reports you own',
    body: 'Analyses are scoped to your account. Every read, update, and delete checks ownership before a row is returned.',
  },
]

const securityPoints = [
  {
    icon: EyeOff,
    title: 'Read-only by design',
    body: 'DevScope uses the GitHub REST API with optional server-side tokens. It never pushes, writes, or asks for your GitHub password.',
  },
  {
    icon: TerminalSquare,
    title: 'Repository code is never executed',
    body: 'Files are decoded as text and summarized. There is no container, sandbox, or shell in the analysis path.',
  },
  {
    icon: Server,
    title: 'Secrets stay on the server',
    body: 'Groq and GitHub credentials live in server environment variables. Browser bundles only talk to your own /api routes.',
  },
  {
    icon: Fingerprint,
    title: 'Sessions and ownership enforced',
    body: 'HTTP-only SameSite cookies, hashed passwords, origin checks, and user-scoped queries on every report and chat message.',
  },
]

export default function LandingPage() {
  const { isAuthenticated } = useAuth()
  usePageTitle(null)

  return (
    <div className="landing">
      <header className="landing__nav">
        <div className="landing__nav-inner">
          <Logo to="/" />
          <nav className="landing__links" aria-label="Product sections">
            <a href="#features">Capabilities</a>
            <a href="#workflow">Workflow</a>
            <a href="#security">Security</a>
          </nav>
          <div className="landing__nav-actions">
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary">
                Open dashboard
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost">
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-primary">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero__orb" aria-hidden="true" />
          <div className="radar" aria-hidden="true" />
          <div className="hero__copy">
            <span className="hero__eyebrow">
              <span className="dot" aria-hidden="true" />
              Repository intelligence
            </span>
            <h1>
              Understand a codebase
              <br />
              <span className="grad">before you commit to it.</span>
            </h1>
            <p className="hero__sub">
              DevScope reads a public GitHub repository the way a senior engineer would: structure,
              dependencies, documentation, testing, and risk. You get a scored, actionable report —
              then a chat that stays grounded in the actual files.
            </p>
            <div className="hero__actions">
              <Link
                to={isAuthenticated ? '/dashboard' : '/register'}
                className="btn btn-primary btn-lg"
              >
                {isAuthenticated ? 'Open your workspace' : 'Analyze your first repository'}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link to="/explore" className="btn btn-secondary btn-lg">
                <ScanSearch size={16} aria-hidden="true" />
                Explore repositories
              </Link>
            </div>
            <div className="hero__meta">
              <span>
                <CheckCircle2 size={13} aria-hidden="true" /> Real GitHub data
              </span>
              <span>
                <CheckCircle2 size={13} aria-hidden="true" /> Groq-powered reasoning
              </span>
              <span>
                <CheckCircle2 size={13} aria-hidden="true" /> Private, owned reports
              </span>
            </div>
          </div>

          <div className="hero__visual">
            <div
              className="preview-card"
              aria-label="Illustrative preview of a DevScope analysis report"
            >
              <div className="preview-card__chrome">
                <div className="preview-card__dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="preview-card__url">devscope.local/analysis/report</div>
                <span className="preview-card__tag">Interface preview</span>
              </div>
              <div className="preview-card__body">
                <div className="preview-repo">
                  <span className="preview-repo__logo">
                    <ScopeMark size={20} />
                  </span>
                  <div className="grow">
                    <div className="preview-repo__name">your-org / project</div>
                    <div className="preview-repo__meta">
                      Repository metadata loads live from GitHub
                    </div>
                  </div>
                  <Sparkles size={15} className="accent" aria-hidden="true" />
                </div>

                <div className="preview-score">
                  <ScoreRing score={82} size="md" label="Overall engineering score" />
                  <div className="preview-score__copy">
                    <div className="preview-score__label">Overall engineering score</div>
                    <div className="preview-score__headline">
                      Well-structured, lightly documented
                    </div>
                    <p className="preview-score__text">
                      Scores, risks, and recommendations are generated from the files you choose to
                      analyze.
                    </p>
                  </div>
                </div>

                <div className="preview-bars">
                  {[
                    ['Architecture', 86],
                    ['Testing', 61],
                    ['Documentation', 74],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="preview-bar__head">
                        <span>{label}</span>
                        <b>{value}</b>
                      </div>
                      <div className="preview-bar__track">
                        <div className="preview-bar__fill" style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="preview-tags">
                  <span>TypeScript</span>
                  <span>API</span>
                  <span>Test gaps</span>
                  <span>Docs drift</span>
                </div>
              </div>
            </div>
            <p className="hint" style={{ marginTop: 14, textAlign: 'center' }}>
              Illustrative layout. Real reports are generated from the repository you select.
            </p>
          </div>
        </section>

        <section className="section" id="features">
          <div className="section__head">
            <div className="section__eyebrow">Capabilities</div>
            <h2>Built for the first hour on a new codebase</h2>
            <p className="section__sub">
              Search GitHub, open a repository, read its files, and turn a large unknown into a
              short list of decisions you can act on today.
            </p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <article className="feature" key={feature.title}>
                  <span className="feature__icon">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="section" id="workflow">
          <div className="section__head">
            <div className="section__eyebrow">Workflow</div>
            <h2>From GitHub URL to a reviewed plan</h2>
            <p className="section__sub">
              No installation in the repository, no webhooks, no CI changes. DevScope works with the
              public API surface GitHub already exposes.
            </p>
          </div>
          <div className="workflow">
            <article className="step">
              <div className="step__number">01</div>
              <h3>Find the repository</h3>
              <p>
                Search users and repositories, or paste an <code>owner/repo</code> pair. Recent
                analyses and conversations stay one click away.
              </p>
            </article>
            <article className="step">
              <div className="step__number">02</div>
              <h3>Run a scoped analysis</h3>
              <p>
                Choose standard or deep. The server collects real files, sends a bounded context to
                Groq, and validates the structured response before storing it.
              </p>
            </article>
            <article className="step">
              <div className="step__number">03</div>
              <h3>Review and ask</h3>
              <p>
                Read scores, strengths, risks, and recommendations. Save the report, then ask
                follow-up questions grounded in the same repository context.
              </p>
            </article>
          </div>
        </section>

        <section className="section security-section" id="security">
          <div>
            <div className="section__eyebrow">Security posture</div>
            <h2 style={{ marginTop: 12 }}>Designed to be boring about trust</h2>
            <p className="section__sub" style={{ marginTop: 14 }}>
              DevScope handles other people&apos;s source code, so the defaults are conservative.
              Untrusted repository content is never treated as instructions, and provider errors are
              mapped without leaking upstream response bodies.
            </p>
            <div className="hero__meta">
              <span>
                <ShieldCheck size={13} aria-hidden="true" /> Origin + CSRF guard
              </span>
              <span>
                <ShieldCheck size={13} aria-hidden="true" /> Rolling 24h quotas
              </span>
              <span>
                <ShieldCheck size={13} aria-hidden="true" /> Prompt-injection defenses
              </span>
            </div>
          </div>
          <div className="security-list">
            {securityPoints.map((point) => {
              const Icon = point.icon
              return (
                <div className="security-item" key={point.title}>
                  <span className="security-item__icon">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <h4>{point.title}</h4>
                    <p>{point.body}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="cta-band">
          <div className="row" style={{ justifyContent: 'center', marginBottom: 14 }}>
            <span className="badge badge--mint badge--dot">Ready when you are</span>
          </div>
          <h2>Open a repository. Get a second opinion.</h2>
          <p>
            Create a workspace to run analyses, save reports, and keep conversations tied to the
            codebase they came from. Every analysis slot is enforced by the server, not the browser.
          </p>
          <div className="cta-band__actions">
            <Link
              to={isAuthenticated ? '/explore' : '/register'}
              className="btn btn-primary btn-lg"
            >
              {isAuthenticated ? 'Explore repositories' : 'Create your workspace'}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link
              to={isAuthenticated ? '/dashboard' : '/login'}
              className="btn btn-secondary btn-lg"
            >
              {isAuthenticated ? 'Go to dashboard' : 'Sign in'}
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing__footer">
        <div className="landing__footer-inner">
          <div className="stack" style={{ gap: 8 }}>
            <Logo to="/" />
            <p>Repository intelligence with real GitHub data and Groq reasoning.</p>
          </div>
          <div className="landing__footer-links">
            <a href="#features">Capabilities</a>
            <a href="#security">Security</a>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
