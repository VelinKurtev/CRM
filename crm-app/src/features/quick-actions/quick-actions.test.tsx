import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import * as records from '@/services/records'
import { useAuthStore } from '@/store/auth-store'
import { QuickActions } from './quick-actions'

vi.mock('@/services/records')

const user = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['contacts:write', 'leads:write', 'deals:write', 'tasks:write'],
  role: 'SALES' as const,
}

let queryClient: QueryClient
function setup(permissions = user.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...user, permissions }, initialized: true })
  queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QuickActions />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('QuickActions', () => {
  it('shows a button only for records the role may create', () => {
    setup(['tasks:write'])
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add contact' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add deal' })).not.toBeInTheDocument()
  })

  it('opens the full contact form instead of a dialog', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Add contact' })).toHaveAttribute(
      'href',
      '/contacts/new',
    )
  })

  it('creates a lead, sending only filled fields, then refreshes the dashboard', async () => {
    vi.mocked(records.createRecord).mockResolvedValue({})
    setup()
    const refresh = vi.spyOn(queryClient, 'invalidateQueries')

    await userEvent.click(screen.getByRole('button', { name: 'Add lead' }))
    await userEvent.type(screen.getByLabelText('Title'), ' Website enquiry ')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(records.createRecord).toHaveBeenCalledWith('lead', { title: 'Website enquiry' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(refresh).toHaveBeenCalled()
  })

  it('validates before sending', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add deal' }))
    await userEvent.type(screen.getByLabelText('Value in USD (optional)'), '-5')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid amount')).toBeInTheDocument()
    expect(records.createRecord).not.toHaveBeenCalled()
  })

  it('sends a deal value as a number', async () => {
    vi.mocked(records.createRecord).mockResolvedValue({})
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add deal' }))
    await userEvent.type(screen.getByLabelText('Title'), 'Big one')
    await userEvent.type(screen.getByLabelText('Value in USD (optional)'), '1500.5')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(records.createRecord).toHaveBeenCalledWith('deal', {
        title: 'Big one',
        amount: 1500.5,
      }),
    )
  })

  it('shows server field errors and keeps the dialog open', async () => {
    const response = {
      status: 400,
      data: { error: { message: 'Validation failed', details: { title: 'Title is too long' } } },
    } as AxiosResponse
    vi.mocked(records.createRecord).mockRejectedValue(
      new AxiosError('bad', '400', undefined, undefined, response),
    )
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add lead' }))
    await userEvent.type(screen.getByLabelText('Title'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Title is too long')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
