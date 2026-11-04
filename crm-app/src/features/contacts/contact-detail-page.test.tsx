import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as contacts from '@/services/contacts'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/contacts')

const user = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['contacts:read', 'contacts:write'],
  role: 'SALES' as const,
}
const ann = { id: '1', firstName: 'Ann', lastName: 'Lee' }
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()

const overview: contacts.ContactOverview = {
  contact: {
    id: 'c1',
    firstName: 'Alice',
    lastName: 'Adams',
    email: 'alice@initech.test',
    phone: '111',
    jobTitle: 'CTO',
    address: '1 Main St',
    city: 'Sofia',
    postalCode: '1000',
    country: 'Bulgaria',
    linkedinUrl: 'https://linkedin.com/in/alice',
    twitterUrl: null,
    facebookUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    company: { id: 'co1', name: 'Initech' },
    owner: ann,
    tags: ['vip', 'hot'],
  },
  activities: {
    total: 1,
    items: [
      {
        id: 'a1',
        type: 'MEETING',
        subject: 'Kick-off',
        description: 'Agreed scope',
        occurredAt: '2026-03-01T12:00:00Z',
        user: ann,
      },
    ],
  },
  tasks: {
    total: 3,
    items: [
      { id: 't1', title: 'Send quote', status: 'TODO', dueDate: daysFromNow(-3), assignee: ann },
      {
        id: 't2',
        title: 'Plan demo',
        status: 'IN_PROGRESS',
        dueDate: daysFromNow(5),
        assignee: null,
      },
      { id: 't3', title: 'Intro call', status: 'DONE', dueDate: daysFromNow(-30), assignee: null },
    ],
  },
  emails: {
    total: 2,
    items: [
      {
        id: 'e1',
        subject: 'Proposal',
        fromAddr: 'me@us.test',
        toAddr: 'alice@initech.test',
        sentAt: '2026-03-02T09:00:00Z',
        createdAt: '2026-03-02T08:00:00Z',
      },
      {
        id: 'e2',
        subject: 'Follow-up',
        fromAddr: 'me@us.test',
        toAddr: 'alice@initech.test',
        sentAt: null,
        createdAt: '2026-03-05T08:00:00Z',
      },
    ],
  },
  notes: {
    total: 1,
    items: [{ id: 'n1', body: 'Prefers email', createdAt: '2026-02-01T10:00:00Z', author: ann }],
  },
}

function renderAt(url: string, permissions = user.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...user, permissions }, initialized: true })
  const router = createMemoryRouter(routes, { initialEntries: [url] })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const apiError = (status: number, message: string) =>
  new AxiosError('bad', String(status), undefined, undefined, {
    status,
    data: { error: { message } },
  } as AxiosResponse)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(contacts.getContactOverview).mockResolvedValue(overview)
})

describe('Contact page', () => {
  it('shows the contact’s details and their whole history in one page', async () => {
    renderAt('/contacts/c1')
    expect(await screen.findByRole('heading', { name: 'Alice Adams' })).toBeInTheDocument()
    expect(contacts.getContactOverview).toHaveBeenCalledWith('c1')

    expect(screen.getByRole('link', { name: 'Initech' })).toHaveAttribute('href', '/companies/co1')
    expect(screen.getByText(/CTO/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'alice@initech.test' })).toHaveAttribute(
      'href',
      'mailto:alice@initech.test',
    )
    expect(screen.getByText('1 Main St, 1000 Sofia, Bulgaria')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /LinkedIn/ })).toHaveAttribute(
      'href',
      'https://linkedin.com/in/alice',
    )
    expect(screen.queryByRole('link', { name: /Facebook/ })).not.toBeInTheDocument()
    const tags = within(screen.getByRole('list', { name: 'Tags' }))
    expect(tags.getByText('vip')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: /Activities/ })).toHaveTextContent('(1)')
    const activity = screen.getByText('Kick-off').closest('li')!
    expect(within(activity).getByText('Meeting')).toBeInTheDocument()
    expect(within(activity).getByText('Agreed scope')).toBeInTheDocument()
    expect(within(activity).getByText(/Ann Lee · Mar 1, 2026/)).toBeInTheDocument()

    expect(screen.getByText('Proposal').closest('li')).toHaveTextContent(
      'me@us.test → alice@initech.test · Mar 2, 2026',
    )
    expect(screen.getByText('Prefers email')).toBeInTheDocument()
  })

  it('marks overdue and finished tasks, and drafts', async () => {
    renderAt('/contacts/c1')
    const quote = (await screen.findByText('Send quote')).closest('li')!
    expect(within(quote).getByText('To do')).toBeInTheDocument()
    expect(within(quote).getByText(/^Overdue · /)).toBeInTheDocument()
    expect(within(quote).getByText('Ann Lee')).toBeInTheDocument()

    const demo = screen.getByText('Plan demo').closest('li')!
    expect(within(demo).getByText('In progress')).toBeInTheDocument()
    expect(within(demo).getByText(/^Due /)).toBeInTheDocument()

    // Finished work is never "overdue", however old its date.
    const done = screen.getByText('Intro call').closest('li')!
    expect(within(done).getByText('Done')).toBeInTheDocument()
    expect(within(done).queryByText(/Overdue/)).not.toBeInTheDocument()

    expect(
      within(screen.getByText('Follow-up').closest('li')!).getByText('Draft'),
    ).toBeInTheDocument()
    expect(within(screen.getByText('Proposal').closest('li')!).queryByText('Draft')).toBeNull()
  })

  it('offers editing only to people who can write', async () => {
    renderAt('/contacts/c1')
    expect(await screen.findByRole('link', { name: /Edit contact/ })).toHaveAttribute(
      'href',
      '/contacts/c1/edit',
    )
  })

  it('is read-only for roles that cannot write', async () => {
    renderAt('/contacts/c1', ['contacts:read'])
    await screen.findByRole('heading', { name: 'Alice Adams' })
    expect(screen.queryByRole('link', { name: /Edit contact/ })).not.toBeInTheDocument()
  })

  it('says so when there is no history yet, and shows quiet blanks', async () => {
    vi.mocked(contacts.getContactOverview).mockResolvedValue({
      ...overview,
      contact: {
        ...overview.contact,
        email: null,
        phone: null,
        jobTitle: null,
        company: null,
        address: null,
        city: null,
        postalCode: null,
        country: null,
        linkedinUrl: null,
        owner: null,
        tags: [],
      },
      activities: { total: 0, items: [] },
      tasks: { total: 0, items: [] },
      emails: { total: 0, items: [] },
      notes: { total: 0, items: [] },
    })
    renderAt('/contacts/c1')
    expect(await screen.findByText(/No calls, meetings or other activity/)).toBeInTheDocument()
    expect(screen.getByText('No tasks for this contact yet.')).toBeInTheDocument()
    expect(screen.getByText('No emails with this contact yet.')).toBeInTheDocument()
    expect(screen.getByText('No notes on this contact yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Tags' })).not.toBeInTheDocument()
  })

  it('leaves out sections the role may not read, and says when a list is cut short', async () => {
    vi.mocked(contacts.getContactOverview).mockResolvedValue({
      ...overview,
      emails: null,
      notes: null,
      activities: { ...overview.activities!, total: 80 },
    })
    renderAt('/contacts/c1')
    await screen.findByText('Kick-off')
    expect(screen.queryByRole('heading', { name: /Emails/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Notes/ })).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 80.')).toBeInTheDocument()
  })

  it('handles a missing contact and load errors', async () => {
    vi.mocked(contacts.getContactOverview).mockRejectedValue(apiError(404, 'Contact not found'))
    renderAt('/contacts/gone')
    expect(await screen.findByText('Contact not found')).toBeInTheDocument()
  })

  it('shows other failures', async () => {
    vi.mocked(contacts.getContactOverview).mockRejectedValue(new Error('boom'))
    renderAt('/contacts/c1')
    expect(await screen.findByText('Could not load the contact')).toBeInTheDocument()
  })

  it('is closed to roles without contacts:read', () => {
    renderAt('/contacts/c1', [])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(contacts.getContactOverview).not.toHaveBeenCalled()
  })

  it('does not swallow /contacts/new', () => {
    renderAt('/contacts/new')
    expect(screen.getByRole('heading', { name: 'New contact' })).toBeInTheDocument()
    expect(contacts.getContactOverview).not.toHaveBeenCalled()
  })
})
