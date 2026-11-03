import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { DataPagination } from './data-pagination'
import { EmptyState } from './empty-state'
import { Filters } from './filters'
import { Modal } from './modal'
import { SearchInput } from './search-input'

describe('SearchInput', () => {
  it('debounces onSearch', () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    render(<SearchInput onSearch={onSearch} debounceMs={200} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'acme' } })
    expect(onSearch).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(onSearch).toHaveBeenCalledWith('acme')
    vi.useRealTimers()
  })
})

describe('DataPagination', () => {
  it('calls onPageChange for next and numbered pages', async () => {
    const onPageChange = vi.fn()
    render(<DataPagination page={2} pageCount={5} onPageChange={onPageChange} />)
    await userEvent.click(screen.getByRole('link', { name: /next/i }))
    expect(onPageChange).toHaveBeenCalledWith(3)
    await userEvent.click(screen.getByRole('link', { name: '4' }))
    expect(onPageChange).toHaveBeenCalledWith(4)
  })
  it('renders nothing for a single page', () => {
    const { container } = render(<DataPagination page={1} pageCount={1} onPageChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('EmptyState', () => {
  it('shows title, description and action', () => {
    render(<EmptyState title="Nothing" description="Add one" action={<button>Add</button>} />)
    expect(screen.getByText('Nothing')).toBeInTheDocument()
    expect(screen.getByText('Add one')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })
})

describe('Modal', () => {
  it('renders content when open and nothing when closed', () => {
    const { rerender } = render(
      <Modal open onOpenChange={vi.fn()} title="Hello">
        Body
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    rerender(
      <Modal open={false} onOpenChange={vi.fn()} title="Hello">
        Body
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Filters', () => {
  it('shows Clear only when a filter is active and resets', async () => {
    const onChange = vi.fn()
    const filters = [{ key: 's', label: 'Status', options: [{ value: 'a', label: 'A' }] }]
    const { rerender } = render(<Filters filters={filters} values={{}} onChange={onChange} />)
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
    rerender(<Filters filters={filters} values={{ s: 'a' }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith({})
  })
})
