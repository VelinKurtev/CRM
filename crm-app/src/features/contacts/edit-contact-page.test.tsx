import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as contacts from '@/services/contacts'
import * as dashboard from '@/services/dashboard'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/contacts')
vi.mock('@/services/dashboard')

const user = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['contacts:read', 'contacts:write'],
  role: 'SALES' as const,
}

const contact: contacts.ContactDetail = {
  id: 'c1',
  firstName: 'Bob',
  lastName: 'Ray',
  email: 'bob@x.com',
  phone: '123',
  jobTitle: null,
  company: { id: 'co1', name: 'Acme' },
  address: null,
  city: 'Sofia',
  postalCode: null,
  country: null,
  linkedinUrl: 'https://linkedin.com/in/bob',
  twitterUrl: null,
  facebookUrl: null,
  tags: ['vip', 'hot'],
  related: { notes: 2, tasks: 1, activities: 0, deals: 3, leads: 0 },
  canDelete: true,
}

function renderPage(permissions = user.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...user, permissions }, initialized: true })
  const router = createMemoryRouter(routes, { initialEntries: ['/contacts/c1/edit'] })
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
  vi.mocked(contacts.getContact).mockResolvedValue(contact)
  vi.mocked(contacts.searchCompanies).mockResolvedValue([])
  vi.mocked(contacts.searchTags).mockResolvedValue([])
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

describe('Edit contact page', () => {
  it('needs contacts:write', () => {
    renderPage(['contacts:read'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(contacts.getContact).not.toHaveBeenCalled()
  })

  it('shows the contact’s current details, with no note box', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Edit Bob Ray' })).toBeInTheDocument()
    expect(screen.getByLabelText('First name')).toHaveValue('Bob')
    expect(screen.getByLabelText('Email (optional)')).toHaveValue('bob@x.com')
    expect(screen.getByLabelText('Company (optional)')).toHaveValue('Acme')
    expect(screen.getByLabelText('Job title (optional)')).toHaveValue('')
    expect(
      within(screen.getByRole('list', { name: 'Tags' })).getAllByRole('listitem'),
    ).toHaveLength(2)
    expect(screen.queryByLabelText('Note (optional)')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Edit contact')
  })

  it('saves edits; cleared fields are sent as null so they are removed', async () => {
    vi.mocked(contacts.updateContact).mockResolvedValue({
      id: 'c1',
      firstName: 'Robert',
      lastName: 'Ray',
    })
    const router = renderPage()
    await screen.findByRole('heading', { name: 'Edit Bob Ray' })

    await userEvent.clear(screen.getByLabelText('First name'))
    await userEvent.type(screen.getByLabelText('First name'), 'Robert')
    await userEvent.clear(screen.getByLabelText('Phone (optional)'))
    await userEvent.clear(screen.getByLabelText('Company (optional)'))
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag hot' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(contacts.updateContact).toHaveBeenCalledWith('c1', {
        firstName: 'Robert',
        lastName: 'Ray',
        email: 'bob@x.com',
        phone: null,
        jobTitle: null,
        company: null,
        address: null,
        city: 'Sofia',
        postalCode: null,
        country: null,
        linkedinUrl: 'https://linkedin.com/in/bob',
        twitterUrl: null,
        facebookUrl: null,
        tags: ['vip'],
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
  })

  it('validates before saving', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Edit Bob Ray' })
    await userEvent.clear(screen.getByLabelText('Last name'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Last name is required')).toBeInTheDocument()
    expect(contacts.updateContact).not.toHaveBeenCalled()
  })

  it('says so when the contact does not exist', async () => {
    const response = {
      status: 404,
      data: { error: { message: 'Contact not found' } },
    } as AxiosResponse
    vi.mocked(contacts.getContact).mockRejectedValue(
      new AxiosError('nf', '404', undefined, undefined, response),
    )
    renderPage()
    expect(await screen.findByText('Contact not found')).toBeInTheDocument()
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument()
  })
})

describe('Deleting a contact', () => {
  it('is only offered when the server says you may delete it', async () => {
    vi.mocked(contacts.getContact).mockResolvedValue({ ...contact, canDelete: false })
    renderPage()
    await screen.findByRole('heading', { name: 'Edit Bob Ray' })
    expect(screen.queryByRole('button', { name: 'Delete contact' })).not.toBeInTheDocument()
  })

  it('warns what will happen, and does nothing until confirmed', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete contact' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete Bob Ray?')).toBeInTheDocument()
    expect(within(dialog).getByText('This also deletes its 2 notes, 1 task.')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Its 3 deals will stay but lose the link to this contact.'),
    ).toBeInTheDocument()
    expect(contacts.deleteContact).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep contact' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(contacts.deleteContact).not.toHaveBeenCalled()
  })

  it('deletes once confirmed and returns to the dashboard', async () => {
    vi.mocked(contacts.deleteContact).mockResolvedValue(undefined)
    const router = renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete contact' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete contact' }))

    await waitFor(() => expect(contacts.deleteContact).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
  })

  it('keeps you on the page if the server refuses', async () => {
    const response = {
      status: 403,
      data: { error: { message: 'You can only delete contacts you own' } },
    } as AxiosResponse
    vi.mocked(contacts.deleteContact).mockRejectedValue(
      new AxiosError('no', '403', undefined, undefined, response),
    )
    const router = renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete contact' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete contact' }))

    expect(await screen.findByText('You can only delete contacts you own')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/contacts/c1/edit')
  })
})
