import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'

const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

// Relative links in a README are relative to that file on GitHub, so resolve them there
// instead of letting the browser point them at the app's own routes.
function resolveRepoUrl(url, repo, { raw = false } = {}) {
  if (!repo?.fullName || !url || ABSOLUTE_URL.test(url)) return url
  const filePath = repo.path ? `/${String(repo.path).replace(/^\/+/, '')}` : ''
  try {
    if (raw && url.startsWith('/')) {
      return new URL(
        `https://raw.githubusercontent.com/${repo.fullName}/${repo.branch}/${url.slice(1)}`,
      ).href
    }
    const base = raw
      ? `https://raw.githubusercontent.com/${repo.fullName}/${repo.branch}${filePath}`
      : `https://github.com/${repo.fullName}/blob/${repo.branch}${filePath}`
    return new URL(url, base).href
  } catch {
    return url
  }
}

export function Markdown({ children, className, repo }) {
  return (
    <div className={clsx('markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // react-markdown passes `node`; keep it out of the rendered DOM props.
          // eslint-disable-next-line no-unused-vars
          a({ node, href, ...props }) {
            return (
              <a
                {...props}
                href={resolveRepoUrl(href, repo)}
                target="_blank"
                rel="noopener noreferrer"
              />
            )
          },
          // eslint-disable-next-line no-unused-vars
          img({ node, alt, src, ...props }) {
            return (
              <img
                {...props}
                src={resolveRepoUrl(src, repo, { raw: true })}
                alt={alt || ''}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            )
          },
        }}
      >
        {String(children || '')}
      </ReactMarkdown>
    </div>
  )
}
