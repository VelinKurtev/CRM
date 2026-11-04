import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as contacts from '@/services/contacts'
import { useAuthStore } from '@/store/auth-store'
import { saveBlob } from '@/utils/download'

vi.mock('@/services/contacts')
vi.mock('@/utils/download')

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
  vi.mocked(contacts.listTagDetails).mockResolvedValue([
    { id: 't1', name: 'vip', color: '#ff0000', contactCount: 2, usageCount: 2 },
    { id: 't2', name: 'hot', color: null, contactCount: 1, usageCount: 1 },
  ])
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
      tag: ['vip'],
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
    await userEvent.click(screen.getByRole('button', { name: 'Tags' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'vip' }))
    await waitFor(() => expect(lastCall()).toMatchObject({ tag: ['vip'], page: 1 }))
    await userEvent.keyboard('{Escape}')

    await userEvent.click(screen.getByRole('combobox', { name: 'Owner' }))
    await userEvent.click(await screen.findByRole('option', { name: 'My contacts' }))
    await waitFor(() => expect(lastCall()).toMatchObject({ tag: ['vip'], owner: 'me' }))

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(lastCall().tag).toEqual([]))
    expect(lastCall().owner).toBeUndefined()
  })

  it('filters by several tags, matching any or all of them', async () => {
    const router = renderList()
    await screen.findByText('Alice Adams')
    await userEvent.click(screen.getByRole('button', { name: 'Tags' }))
    // The match choice only makes sense with two or more tags.
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'vip' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'hot' }))
    await waitFor(() =>
      expect(lastCall()).toMatchObject({ tag: ['vip', 'hot'], tagMode: undefined }),
    )

    await userEvent.click(screen.getByRole('radio', { name: 'all of these tags' }))
    await waitFor(() => expect(lastCall()).toMatchObject({ tag: ['vip', 'hot'], tagMode: 'all' }))
    expect(router.state.location.search).toBe('?tag=vip&tag=hot&tagMode=all')
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveTextContent('2 tags')

    await userEvent.click(screen.getByRole('checkbox', { name: 'hot' }))
    await waitFor(() => expect(router.state.location.search).toBe('?tag=vip')) // mode resets

    await userEvent.click(screen.getByRole('button', { name: 'Clear tags' }))
    await waitFor(() => expect(lastCall().tag).toEqual([]))
    expect(router.state.location.search).toBe('')
  })

  it('shows tags in their colour and filters by clicking one', async () => {
    vi.mocked(contacts.listContacts).mockResolvedValue(page([{ ...alice, tags: ['hot', 'VIP'] }]))
    const router = renderList()
    const row = (await screen.findByText('Alice Adams')).closest('tr')!
    // Colours come from the tag list, found whatever the letter case.
    expect(within(row).getByRole('button', { name: 'VIP' })).toHaveStyle({
      backgroundColor: '#ff0000',
    })

    await userEvent.click(within(row).getByRole('button', { name: 'hot' }))
    await waitFor(() => expect(lastCall()).toMatchObject({ tag: ['hot'] }))
    await userEvent.click(within(row).getByRole('button', { name: 'VIP' }))
    await waitFor(() => expect(lastCall()).toMatchObject({ tag: ['hot', 'VIP'] }))
    expect(router.state.location.search).toBe('?tag=hot&tag=VIP')

    // Clicking a tag that is already in the filter doesn't add it twice.
    await userEvent.click(within(row).getByRole('button', { name: 'hot' }))
    expect(router.state.location.search).toBe('?tag=hot&tag=VIP')
  })

  it('still lists contacts if the tag list cannot be loaded', async () => {
    vi.mocked(contacts.listTagDetails).mockRejectedValue(new Error('boom'))
    renderList()
    expect(await screen.findByText('Alice Adams')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tags' })).toBeInTheDocument()
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

describe('Exporting contacts', () => {
  const manager = ['contacts:read', 'contacts:write', 'contacts:export']

  it('is offered only to roles that may export', async () => {
    renderList('/contacts', user.permissions)
    await screen.findByText('Alice Adams')
    expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument()
  })

  it('downloads what the current search and filters match, as a file', async () => {
    vi.mocked(contacts.exportContacts).mockResolvedValue(new Blob(['csv']))
    renderList('/contacts?q=bob&tag=vip&tag=hot&tagMode=all&owner=me&page=2', manager)
    await screen.findByText('Alice Adams')

    await userEvent.click(screen.getByRole('button', { name: /Export/ }))
    expect(
      await screen.findByText(/2 contacts matching your search and filters/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }))

    await waitFor(() => expect(contacts.exportContacts).toHaveBeenCalled())
    // The whole result, not the page you happen to be on: no page number is sent.
    expect(contacts.exportContacts).toHaveBeenCalledWith({
      q: 'bob',
      tag: ['vip', 'hot'],
      tagMode: 'all',
      owner: 'me',
      company: undefined,
      delimiter: 'comma',
    })
    await waitFor(() =>
      expect(saveBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^contacts-\d{4}-\d{2}-\d{2}\.csv$/),
      ),
    )
  })

  it('has a semicolon version for Excel', async () => {
    vi.mocked(contacts.exportContacts).mockResolvedValue(new Blob(['csv']))
    renderList('/contacts', manager)
    await screen.findByText('Alice Adams')
    await userEvent.click(screen.getByRole('button', { name: /Export/ }))
    await userEvent.click(await screen.findByRole('button', { name: /for Excel/ }))
    await waitFor(() =>
      expect(contacts.exportContacts).toHaveBeenCalledWith(
        expect.objectContaining({ delimiter: 'semicolon' }),
      ),
    )
  })

  it('shows why an export failed and keeps the menu open', async () => {
    vi.mocked(contacts.exportContacts).mockRejectedValue(new Error('boom'))
    renderList('/contacts', manager)
    await screen.findByText('Alice Adams')
    await userEvent.click(screen.getByRole('button', { name: /Export/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Download CSV' }))
    expect(await screen.findByText('Could not export contacts')).toBeInTheDocument()
    expect(saveBlob).not.toHaveBeenCalled()
  })

  it('is disabled when there is nothing to export', async () => {
    vi.mocked(contacts.listContacts).mockResolvedValue(page([]))
    renderList('/contacts', manager)
    await screen.findByText('No contacts yet')
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled()
  })
})

describe('Tagging several contacts', () => {
  const tick = (name: string) => userEvent.click(screen.getByRole('checkbox', { name }))

  it('offers selection only to people who can edit contacts', async () => {
    renderList('/contacts', ['contacts:read'])
    await screen.findByText('Alice Adams')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('adds a tag to the ticked contacts, then clears the selection and refreshes the list', async () => {
    vi.mocked(contacts.bulkTagContacts).mockResolvedValue({ updated: 2, skipped: 0 })
    renderList()
    await screen.findByText('Alice Adams')
    expect(screen.queryByRole('region', { name: 'Selected contacts' })).not.toBeInTheDocument()

    await tick('Select all contacts on this page')
    const bar = screen.getByRole('region', { name: 'Selected contacts' })
    expect(bar).toHaveTextContent('2 selected')
    await userEvent.click(within(bar).getByRole('button', { name: 'Add tags' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add tags to 2 contacts' })
    const apply = within(dialog).getByRole('button', { name: 'Add tags' })
    expect(apply).toBeDisabled() // nothing to add yet
    await userEvent.type(within(dialog).getByRole('combobox'), 'newsletter{Enter}')
    await userEvent.click(apply)

    await waitFor(() =>
      expect(contacts.bulkTagContacts).toHaveBeenCalledWith({
        contactIds: ['c1', 'c2'],
        add: ['newsletter'],
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('region', { name: 'Selected contacts' })).not.toBeInTheDocument()
    expect(vi.mocked(contacts.listContacts).mock.calls.length).toBeGreaterThan(1) // refetched
  })

  it('removes a tag from just the contacts that were ticked', async () => {
    vi.mocked(contacts.bulkTagContacts).mockResolvedValue({ updated: 1, skipped: 0 })
    renderList()
    await screen.findByText('Alice Adams')
    await tick('Select Bob Baker')
    expect(screen.getByRole('region', { name: 'Selected contacts' })).toHaveTextContent(
      '1 selected',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove tags' }))

    const dialog = await screen.findByRole('dialog', { name: 'Remove tags from 1 contact' })
    await userEvent.type(within(dialog).getByRole('combobox'), 'cold{Enter}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove tags' }))
    await waitFor(() =>
      expect(contacts.bulkTagContacts).toHaveBeenCalledWith({
        contactIds: ['c2'],
        remove: ['cold'],
      }),
    )
  })

  it('shows the error and keeps the selection if tagging fails', async () => {
    vi.mocked(contacts.bulkTagContacts).mockRejectedValue(new Error('boom'))
    renderList()
    await screen.findByText('Alice Adams')
    await tick('Select Alice Adams')
    await userEvent.click(screen.getByRole('button', { name: 'Add tags' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('combobox'), 'x{Enter}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add tags' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not update the tags')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('region', { name: 'Selected contacts' })).toHaveTextContent(
      '1 selected',
    )
  })

  it('drops the selection when the filters change, and can clear it', async () => {
    renderList()
    await screen.findByText('Alice Adams')
    await tick('Select Alice Adams')
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByRole('region', { name: 'Selected contacts' })).not.toBeInTheDocument()

    await tick('Select Alice Adams')
    await userEvent.click(screen.getByRole('combobox', { name: 'Owner' }))
    await userEvent.click(await screen.findByRole('option', { name: 'My contacts' }))
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Selected contacts' })).not.toBeInTheDocument(),
    )
  })
})
