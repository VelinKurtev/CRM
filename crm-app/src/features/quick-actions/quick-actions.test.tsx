import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
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
      <QuickActions />
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('QuickActions', () => {
  it('shows a button only for records the role may create', () => {
    setup(['tasks:write'])
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add contact' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add deal' })).not.toBeInTheDocument()
  })

  it('creates a contact, sending only filled fields, then refreshes the dashboard', async () => {
    vi.mocked(records.createRecord).mockResolvedValue({})
    setup()
    const refresh = vi.spyOn(queryClient, 'invalidateQueries')

    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }))
    await userEvent.type(screen.getByLabelText('First name'), ' Bob ')
    await userEvent.type(screen.getByLabelText('Last name'), 'Ray')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(records.createRecord).toHaveBeenCalledWith('contact', {
        firstName: 'Bob',
        lastName: 'Ray',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(refresh).toHaveBeenCalled()
  })

  it('validates before sending', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }))
    await userEvent.type(screen.getByLabelText('Email (optional)'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('First name is required')).toBeInTheDocument()
    expect(screen.getByText('Last name is required')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument()
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
