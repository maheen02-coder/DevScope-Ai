// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { Markdown } from './Markdown.jsx'

afterEach(cleanup)

const repo = { fullName: 'acme/app', branch: 'main', path: 'docs/README.md' }

describe('Markdown', () => {
  it('resolves README-relative links and images against GitHub', () => {
    render(
      <Markdown repo={repo}>
        {
          '[Guide](./guide.md) [Root issue](/issues) ![Shot](./shot.png) [Site](https://example.com)'
        }
      </Markdown>,
    )

    expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute(
      'href',
      'https://github.com/acme/app/blob/main/docs/guide.md',
    )
    expect(screen.getByRole('link', { name: 'Root issue' })).toHaveAttribute(
      'href',
      'https://github.com/issues',
    )
    expect(screen.getByRole('img', { name: 'Shot' })).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/acme/app/main/docs/shot.png',
    )
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it('leaves links untouched when no repository context is provided', () => {
    render(<Markdown>{'[Guide](./guide.md)'}</Markdown>)

    expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute('href', './guide.md')
  })
})
