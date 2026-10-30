import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatReset,
  languageColor,
  parseRepoInput,
  pluralize,
  scoreTone,
} from './format.js'

describe('parseRepoInput', () => {
  it('accepts owner/repo pairs', () => {
    expect(parseRepoInput('vercel/next.js')).toEqual({ owner: 'vercel', repo: 'next.js' })
    expect(parseRepoInput('  facebook/react  ')).toEqual({ owner: 'facebook', repo: 'react' })
  })

  it('accepts GitHub URLs and strips .git', () => {
    expect(parseRepoInput('https://github.com/expressjs/express.git')).toEqual({
      owner: 'expressjs',
      repo: 'express',
    })
    expect(parseRepoInput('github.com/rust-lang/rust/tree/master')).toEqual({
      owner: 'rust-lang',
      repo: 'rust',
    })
  })

  it('rejects malformed input', () => {
    expect(parseRepoInput('')).toBeNull()
    expect(parseRepoInput('just-a-name')).toBeNull()
    expect(parseRepoInput('a/b/c')).toBeNull()
    expect(parseRepoInput('-bad/repo')).toBeNull()
  })
})

describe('formatting helpers', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(1024 * 1024 * 3)).toBe('3.0 MB')
  })

  it('maps scores to tones', () => {
    expect(scoreTone(82).label).toBe('Strong')
    expect(scoreTone(65).label).toBe('Solid')
    expect(scoreTone(45).label).toBe('Needs work')
    expect(scoreTone(12).label).toBe('At risk')
    expect(scoreTone(null).label).toBe('Not scored')
  })

  it('formats reset windows and plural labels', () => {
    const inNinetyMinutes = new Date(Date.now() + 90 * 60 * 1000 + 30_000).toISOString()
    expect(formatReset(inNinetyMinutes)).toBe('1h 30m')
    expect(formatReset(new Date(Date.now() - 1000).toISOString())).toBe('now')
    expect(pluralize(1, 'report')).toBe('1 report')
    expect(pluralize(3, 'report')).toBe('3 reports')
  })

  it('falls back to the accent color for unknown languages', () => {
    expect(languageColor('JavaScript')).toBe('#f1e05a')
    expect(languageColor('UnknownLang')).toBe('#7c9cff')
  })
})
