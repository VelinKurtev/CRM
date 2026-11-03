import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const alice: contacts.ContactListItem = {
  id: 'c1',
  firstName: 'Alice',
  lastName: 'Adams',
  email: 'alice@initech.test',
  phone: '111',
  jobTitle: 'CTO',
  createdAt: '2026-01-01T00:00:00Z',
  company: { id: 'co1', name: 'Initech' },
  owner: { id: '1', firstName: 'Ann', lastName: 'Lee' },
  tags: ['a', 'b', 'c', 'd', 'e'],
}
const bob: contacts.ContactListItem = {
  ...alice,
  id: 'c2',
  firstName: 'Bob',
  lastName: 'Baker',
  email: null,
  phone: null,
  jobTitle: null,
  company: null,
  owner: null,
  tags: [],
}

const page = (items: contacts.ContactListItem[], extra = {}) => ({
  contacts: items,
  total: items.length,
  page: 1,
  pageSize: 20,
  ...extra,
})
const lastCall = () => vi.mocked(contacts.listContacts).mock.lastCall![0]

function renderList(url = '/contacts', permissions = user.permissions) {
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

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(contacts.listContacts).mockResolvedValue(page([alice, bob]))
  vi.mocked(contacts.listTags).mockResolvedValue(['vip', 'hot'])
  vi.mocked(contacts.listCompanies).mockResolvedValue([{ id: 'co1', name: 'Initech' }])
})

describe('Contacts list', () => {
  it('shows each contact’s details, with a tidy tag summary and quiet blanks', async () => {
    renderList()
    const alicesRow = (await screen.findByText('Alice Adams')).closest('tr')!
    expect(within(alicesRow).getByText('CTO')).toBeInTheDocument()
    expect(within(alicesRow).getByText('Initech')).toBeInTheDocument()
    expect(within(alicesRow).getByRole('link', { name: 'alice@initech.test' })).toHaveAttribute(
      'href',
      'mailto:alice@initech.test',
    )
    expect(within(alicesRow).getByText('a')).toBeInTheDocument()
    expect(within(alicesRow).queryByText('d')).not.toBeInTheDocument()
    expect(within(alicesRow).getByText('+2')).toHaveAttribute('title', 'd, e')
    expect(within(alicesRow).getByText('Ann Lee')).toBeInTheDocument()

    const bobsRow = screen.getByText('Bob Baker').closest('tr')!
    expect(within(bobsRow).getAllByText('None').length).toBeGreaterThanOrEqual(5)
    expect(screen.getByText('2 contacts')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument()
  })

  it('has a Contacts item in the sidebar and breadcrumbs', async () => {
    renderList()
    await screen.findByText('Alice Adams')
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]
    expect(within(nav).getByRole('link', { name: 'Contacts' })).toHaveAttribute('href', '/contacts')
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Contacts')
  })

  it('searches after you stop typing and resets to the first page', async () => {
    renderList('/contacts?page=3')
    await screen.findByText('Alice Adams')
    expect(lastCall()).toMatchObject({ page: 3 })

    await userEvent.type(screen.getByRole('searchbox'), 'alice')
    await waitFor(() => expect(lastCall()).toMatchObject({ q: 'alice', page: 1 }))
  })

  it('restores search and filters from the URL and says results are filtered', async () => {
    renderList('/contacts?q=bob&tag=vip&owner=me&company=co1&sort=company&dir=desc')
    await screen.findByText('Alice Adams')
    expect(lastCall()).toEqual({
      q: 'bob',
      tag: 'vip',
      owner: 'me',
      company: 'co1',
      sort: 'company',
      dir: 'desc',
      page: 1,
      pageSize: 20,
    })
    expect(screen.getByRole('searchbox')).toHaveValue('bob')
    expect(screen.getByText('2 contacts match your search')).toBeInTheDocument()
  })

  it('filters from the dropdowns', async () => {
    renderList()
    await screen.findByText('Alice Adams')
    await userEvent.click(await screen.findByRole('combobox', { name: 'Tag' }))
    await userEvent.click(await screen.findByRole('option', { name: 'vip' }))
    await waitFor(() => expect(lastCall()).toMatchObject({ tag: 'vip', page: 1 }))

    await userEvent.click(screen.getByRole('combobox', { name: 'Owner' }))
    await userEvent.click(await screen.findByRole('option', { name: 'My contacts' }))
    await waitFor(() => expect(lastCall()).toMatchObject({ tag: 'vip', owner: 'me' }))

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(lastCall().tag).toBeUndefined())
    expect(lastCall().owner).toBeUndefined()
  })

  it('sorts by clicking a column, flipping direction on the second click', async () => {
    renderList()
    await screen.findByText('Alice Adams')
    const company = screen.getByRole('columnheader', { name: 'Company' })
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )

    await userEvent.click(within(company).getByRole('button'))
    await waitFor(() => expect(lastCall()).toMatchObject({ sort: 'company', dir: 'asc' }))
    expect(screen.getByRole('columnheader', { name: 'Company' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )

    await userEvent.click(
      within(screen.getByRole('columnheader', { name: 'Company' })).getByRole('button'),
    )
    await waitFor(() => expect(lastCall()).toMatchObject({ sort: 'company', dir: 'desc' }))
    expect(screen.getByRole('columnheader', { name: 'Company' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  it('pages through results and keeps the page in the URL', async () => {
    vi.mocked(contacts.listContacts).mockImplementation(async ({ page = 1 }) =>
      page === 1 ? page_(1) : page_(2),
    )
    function page_(n: number) {
      return { contacts: [n === 1 ? alice : bob], total: 45, page: n, pageSize: 20 }
    }
    const router = renderList()
    expect(await screen.findByText('Showing 1–1 of 45')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: '2' }))
    await waitFor(() => expect(lastCall()).toMatchObject({ page: 2 }))
    expect(router.state.location.search).toBe('?page=2')
    expect(await screen.findByText('Showing 21–21 of 45')).toBeInTheDocument()
  })

  it('offers an empty state, with a way to start, when there are no contacts', async () => {
    vi.mocked(contacts.listContacts).mockResolvedValue(page([]))
    renderList()
    expect(await screen.findByText('No contacts yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /New contact/ }).length).toBeGreaterThan(0)
  })

  it('says nothing matched, and clears the search and filters in one click', async () => {
    vi.mocked(contacts.listContacts).mockResolvedValue(page([]))
    const router = renderList('/contacts?q=zzz&tag=vip')
    expect(await screen.findByText('No contacts match')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(lastCall()).toMatchObject({ q: '' })
  })

  it('shows an error if loading fails', async () => {
    vi.mocked(contacts.listContacts).mockRejectedValue(new Error('boom'))
    renderList()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load contacts')
  })

  it('lets read-only roles look but not create or edit', async () => {
    renderList('/contacts', ['contacts:read'])
    expect(await screen.findByText('Alice Adams')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Alice Adams' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /New contact/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Import CSV/ })).not.toBeInTheDocument()
  })

  it('offers CSV import to people who can create contacts', async () => {
    renderList()
    expect(await screen.findByRole('link', { name: /Import CSV/ })).toHaveAttribute(
      'href',
      '/contacts/import',
    )
  })

  it('links names to the edit page for people who can edit', async () => {
    renderList()
    expect(await screen.findByRole('link', { name: 'Alice Adams' })).toHaveAttribute(
      'href',
      '/contacts/c1/edit',
    )
  })

  it('is closed to roles without contacts:read', () => {
    renderList('/contacts', [])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(contacts.listContacts).not.toHaveBeenCalled()
  })
})
