import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { TagBadge } from './tag-badge'

describe('TagBadge', () => {
  it('uses the tag’s colour, with text that stays readable on it', () => {
    render(
      <>
        <TagBadge name="dark" color="#1e3a8a" />
        <TagBadge name="light" color="#fde047" />
        <TagBadge name="plain" color={null} />
      </>,
    )
    expect(screen.getByText('dark')).toHaveStyle({ backgroundColor: '#1e3a8a', color: '#ffffff' })
    expect(screen.getByText('light')).toHaveStyle({ backgroundColor: '#fde047', color: '#111827' })
    expect(screen.getByText('plain').getAttribute('style')).toBeNull() // default look
  })

  it('becomes a button only when it has something to do', async () => {
    const onClick = vi.fn()
    render(
      <>
        <TagBadge name="static" />
        <TagBadge name="clickable" onClick={onClick} />
      </>,
    )
    expect(screen.queryByRole('button', { name: 'static' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'clickable' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
