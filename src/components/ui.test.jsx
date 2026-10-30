// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { Pagination, ScoreRing, Tabs } from './ui.jsx'

afterEach(cleanup)

describe('ScoreRing', () => {
  it('renders an accessible score and clamps values above 100', () => {
    render(<ScoreRing score={140} label="Overall score" />)
    expect(screen.getByRole('img', { name: 'Overall score: 100 out of 100' })).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('describes missing scores without inventing a number', () => {
    render(<ScoreRing score={null} label="Overall score" />)
    expect(
      screen.getByRole('img', { name: 'Overall score: not scored out of 100' }),
    ).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('Pagination', () => {
  it('summarizes the visible range and emits page changes', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination
        page={1}
        totalPages={3}
        total={25}
        limit={10}
        onPageChange={onPageChange}
        label="reports"
      />,
    )

    expect(screen.getByText('Showing 1–10 of 25 reports')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})

describe('Tabs', () => {
  it('exposes the selected tab and reports changes', () => {
    const onChange = vi.fn()
    render(
      <Tabs
        items={[
          { value: 'all', label: 'All reports' },
          { value: 'saved', label: 'Saved' },
        ]}
        value="all"
        onChange={onChange}
        label="Report filter"
      />,
    )

    expect(screen.getByRole('tab', { name: 'All reports' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Saved' })).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(screen.getByRole('tab', { name: 'Saved' }))
    expect(onChange).toHaveBeenCalledWith('saved')
  })
})
