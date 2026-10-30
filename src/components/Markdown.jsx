import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'

export function Markdown({ children, className }) {
  return (
    <div className={clsx('markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // react-markdown passes `node`; keep it out of the rendered DOM props.
          // eslint-disable-next-line no-unused-vars
          a({ node, ...props }) {
            return <a {...props} target="_blank" rel="noopener noreferrer" />
          },
          // eslint-disable-next-line no-unused-vars
          img({ node, alt, ...props }) {
            return <img {...props} alt={alt || ''} loading="lazy" referrerPolicy="no-referrer" />
          },
        }}
      >
        {String(children || '')}
      </ReactMarkdown>
    </div>
  )
}
