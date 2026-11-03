import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as contacts from '@/services/contacts'
import * as dashboard from '@/services/dashboard'
import { useAuthStore } from '@/store/auth-store'
import { toNewContact, emptyContact } from './schemas'

vi.mock('@/services/contacts')
vi.mock('@/services/dashboard')

const user = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['contacts:write'],
  role: 'SALES' as const,
}

function renderPage(permissions = user.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...user, permissions }, initialized: true })
  const router = createMemoryRouter(routes, { initialEntries: ['/contacts/new'] })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(contacts.searchCompanies).mockResolvedValue([{ id: 'c1', name: 'Acme' }])
  vi.mocked(contacts.searchTags).mockResolvedValue(['vip'])
  vi.mocked(dashboard.getDashboardSummary).mockResolvedValue({
    sales: null,
    newLeads: null,
    openDeals: null,
  })
  vi.mocked(dashboard.getAttention).mockResolvedValue({
    tasks: null,
    activities: null,
    notifications: { items: [], unread: 0 },
  })
})

describe('New contact page', () => {
  it('is for roles with contacts:write only', () => {
    renderPage([])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument()
  })

  it('shows breadcrumbs and offers existing companies as suggestions', async () => {
    renderPage()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      'ContactsNew contact',
    )
    await waitFor(() =>
      expect(document.querySelector('datalist option[value="Acme"]')).toBeInTheDocument(),
    )
  })

  it('requires a name and checks email and links before sending', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText('Email (optional)'), 'nope')
    await userEvent.type(screen.getByLabelText('LinkedIn (optional)'), 'linkedin.com/in/x')
    await userEvent.click(screen.getByRole('button', { name: 'Create contact' }))

    expect(await screen.findByText('First name is required')).toBeInTheDocument()
    expect(screen.getByText('Last name is required')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument()
    expect(screen.getByText(/starting with http/)).toBeInTheDocument()
    expect(contacts.createContact).not.toHaveBeenCalled()
  })

  it('sends every field, tags and note included, then goes back to the dashboard', async () => {
    vi.mocked(contacts.createContact).mockResolvedValue({
      id: 'n1',
      firstName: 'Bob',
      lastName: 'Ray',
    })
    const router = renderPage()

    await userEvent.type(screen.getByLabelText('First name'), 'Bob')
    await userEvent.type(screen.getByLabelText('Last name'), 'Ray')
    await userEvent.type(screen.getByLabelText('Email (optional)'), 'bob@x.com')
    await userEvent.type(screen.getByLabelText('Phone (optional)'), '123')
    await userEvent.type(screen.getByLabelText('Company (optional)'), 'Acme')
    await userEvent.type(screen.getByLabelText('City (optional)'), 'Sofia')
    await userEvent.type(
      screen.getByLabelText('LinkedIn (optional)'),
      'https://linkedin.com/in/bob',
    )
    await userEvent.type(screen.getByLabelText('Tags (optional)'), 'vip{Enter}hot,')
    await userEvent.type(screen.getByLabelText('Note (optional)'), 'Met at the fair')
    await userEvent.click(screen.getByRole('button', { name: 'Create contact' }))

    await waitFor(() =>
      expect(contacts.createContact).toHaveBeenCalledWith({
        firstName: 'Bob',
        lastName: 'Ray',
        email: 'bob@x.com',
        phone: '123',
        company: 'Acme',
        city: 'Sofia',
        linkedinUrl: 'https://linkedin.com/in/bob',
        tags: ['vip', 'hot'],
        note: 'Met at the fair',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
  })

  it('shows the server’s message under the right field and stays on the page', async () => {
    const response = {
      status: 400,
      data: { error: { message: 'Validation failed', details: { email: 'Enter a valid email' } } },
    } as AxiosResponse
    vi.mocked(contacts.createContact).mockRejectedValue(
      new AxiosError('bad', '400', undefined, undefined, response),
    )
    const router = renderPage()
    await userEvent.type(screen.getByLabelText('First name'), 'Bob')
    await userEvent.type(screen.getByLabelText('Last name'), 'Ray')
    await userEvent.click(screen.getByRole('button', { name: 'Create contact' }))

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/contacts/new')
  })
})

describe('Tag input', () => {
  it('adds on Enter without submitting, ignores duplicates in any case, and removes', async () => {
    renderPage()
    const input = screen.getByLabelText('Tags (optional)')
    await userEvent.type(input, 'VIP{Enter}vip{Enter}Hot{Enter}')

    const list = screen.getByRole('list', { name: 'Tags' })
    expect(list).toHaveTextContent('VIP')
    expect(list).toHaveTextContent('Hot')
    expect(list.querySelectorAll('li')).toHaveLength(2)
    expect(contacts.createContact).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag VIP' }))
    expect(list.querySelectorAll('li')).toHaveLength(1)

    await userEvent.type(input, '{Backspace}')
    expect(screen.queryByRole('list', { name: 'Tags' })).not.toBeInTheDocument()
  })
})

describe('toNewContact', () => {
  it('leaves out blank fields and trims the rest', () => {
    expect(toNewContact({ ...emptyContact, firstName: ' A ', lastName: 'B', city: '  ' })).toEqual({
      firstName: 'A',
      lastName: 'B',
    })
  })
})
