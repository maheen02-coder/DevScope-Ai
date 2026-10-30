import { Alert } from './ui.jsx'
import { useHealth } from '../lib/hooks.js'
import { formatDateTime } from '../lib/format.js'

export function AiConfigNotice({ title = 'AI analysis requires a Groq API key' }) {
  const { data, isLoading, isError } = useHealth()
  if (isLoading || isError || !data || data.ai?.configured) return null

  return (
    <Alert tone="warning" title={title}>
      <p>
        The API is running and the database is healthy, but no <code>GROQ_API_KEY</code> is present,
        so analysis and chat requests will return <code>503 AI_NOT_CONFIGURED</code>. This is a
        server-side configuration step — no key is ever shipped to the browser.
      </p>
      <ol className="config-steps">
        <li>
          Create a key in the Groq console at{' '}
          <a
            className="link"
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noopener noreferrer"
          >
            console.groq.com/keys
          </a>
          .
        </li>
        <li>
          Add <code>GROQ_API_KEY=your_key</code> to the server environment (or <code>.env</code>).
        </li>
        <li>
          Restart the API. The configured model is{' '}
          <code>{data.ai?.model || 'openai/gpt-oss-120b'}</code>.
        </li>
      </ol>
    </Alert>
  )
}

export function GitHubLimitNotice() {
  const { data, isLoading, isError } = useHealth()
  if (isLoading || isError || !data?.github || data.github.configured) return null

  const { remaining, limit, resetAt } = data.github
  return (
    <Alert tone="info" title="GitHub requests are running anonymously">
      <p>
        {typeof remaining === 'number'
          ? `GitHub allows ${remaining} of ${limit ?? 60} requests per hour without a token.`
          : `GitHub allows ${limit ?? 60} requests per hour without a token.`}{' '}
        Set <code>GITHUB_TOKEN</code> on the server to raise the hourly limit to 5,000 and make
        repository browsing more reliable.
        {resetAt ? ` The current window resets ${formatDateTime(resetAt)}.` : ''}
      </p>
    </Alert>
  )
}
