import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const CSV = 'first_name,last_name,email\nAnna,Ivanova,a@x.com\n,Nameless,b@x.com\n'
const file = (text = CSV, name = 'people.csv') => new File([text], name, { type: 'text/csv' })

const preview: contacts.ImportResult = {
  dryRun: true,
  total: 3,
  valid: 2,
  imported: 0,
  ignoredColumns: ['Internal ID'],
  rejected: [
    { row: 3, name: 'Gus', errors: { lastName: 'Last name is required' } },
    {
      row: 5,
      name: 'Hana Ivanova',
      errors: { email: 'Enter a valid email', linkedinUrl: 'Enter a valid URL' },
    },
  ],
}

let queryClient: QueryClient
function renderPage(permissions = user.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...user, permissions }, initialized: true })
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: ['/contacts/import'] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const choose = (f = file()) => userEvent.upload(screen.getByLabelText('CSV file'), f)
const failure = (status: number, message: string) =>
  new AxiosError('bad', String(status), undefined, undefined, {
    status,
    data: { error: { message } },
  } as AxiosResponse)

beforeEach(() => {
  vi.resetAllMocks()
  // The list page (reached via "View contacts") loads these.
  vi.mocked(contacts.listContacts).mockResolvedValue({
    contacts: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
  vi.mocked(contacts.listTags).mockResolvedValue([])
  vi.mocked(contacts.listCompanies).mockResolvedValue([])
})

describe('Import contacts page', () => {
  it('is for roles with contacts:write only', () => {
    renderPage(['contacts:read'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('explains the format and offers a template', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Import contacts' })).toBeInTheDocument()
    expect(screen.getByText(/First name/, { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Download template/ })).toHaveAttribute(
      'href',
      '/contacts-template.csv',
    )
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      'ContactsImport',
    )
  })

  it('shows the file state apart from the Choose file button, then the chosen name', async () => {
    vi.mocked(contacts.importContacts).mockResolvedValue(preview)
    renderPage()
    expect(screen.getByText('No file selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument()

    await choose(file(CSV, 'people.csv'))
    expect(await screen.findByText('2 contacts ready to import')).toBeInTheDocument()
    expect(screen.queryByText('No file selected')).not.toBeInTheDocument()
    expect(screen.getAllByText('people.csv').length).toBeGreaterThan(0)
  })

  it('also accepts a file dropped onto the box', async () => {
    vi.mocked(contacts.importContacts).mockResolvedValue(preview)
    renderPage()
    const zone = screen.getByText('No file selected').closest('div[class*="border-dashed"]')!
    fireEvent.drop(zone, { dataTransfer: { files: [file()] } })
    expect(await screen.findByText('2 contacts ready to import')).toBeInTheDocument()
    expect(contacts.importContacts).toHaveBeenCalledWith(CSV, true)
  })

  it('checks the file first, saving nothing, and lists the rows that will be skipped', async () => {
    vi.mocked(contacts.importContacts).mockResolvedValue(preview)
    renderPage()
    await choose()

    expect(await screen.findByText('2 contacts ready to import')).toBeInTheDocument()
    expect(contacts.importContacts).toHaveBeenCalledTimes(1)
    expect(contacts.importContacts).toHaveBeenCalledWith(CSV, true)

    expect(screen.getByText(/2 rows will be skipped/)).toBeInTheDocument()
    expect(screen.getByText('Ignored columns: Internal ID')).toBeInTheDocument()
    const row = screen.getByText('Hana Ivanova').closest('tr')!
    expect(within(row).getByText('5')).toBeInTheDocument()
    expect(within(row).getByText('Enter a valid email')).toBeInTheDocument()
    expect(within(row).getByText('LinkedIn:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 2 contacts' })).toBeEnabled()
  })

  it('imports on confirmation and reports what happened, with a way to see the contacts', async () => {
    vi.mocked(contacts.importContacts).mockImplementation(async (_csv, dryRun) =>
      dryRun ? preview : { ...preview, dryRun: false, imported: 2 },
    )
    const router = renderPage()
    const refresh = vi.spyOn(queryClient, 'invalidateQueries')
    await choose()
    await userEvent.click(await screen.findByRole('button', { name: 'Import 2 contacts' }))

    expect(await screen.findByText('2 contacts imported, 2 skipped')).toBeInTheDocument()
    expect(contacts.importContacts).toHaveBeenLastCalledWith(CSV, false)
    expect(screen.getByText(/These rows were skipped\./)).toBeInTheDocument()
    expect(screen.getByText('Gus')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledWith({ queryKey: ['contacts'] })
    expect(screen.queryByLabelText('CSV file')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'View contacts' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/contacts'))
  })

  it('imports a clean file without any warnings', async () => {
    vi.mocked(contacts.importContacts).mockResolvedValue({
      ...preview,
      rejected: [],
      ignoredColumns: [],
      valid: 3,
    })
    renderPage()
    await choose()
    expect(await screen.findByText('3 contacts ready to import')).toBeInTheDocument()
    expect(screen.queryByText(/will be skipped/)).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('cannot import when every row has a problem', async () => {
    vi.mocked(contacts.importContacts).mockResolvedValue({ ...preview, valid: 0 })
    renderPage()
    await choose()
    expect(await screen.findByText(/Nothing in this file can be imported/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 0 contacts' })).toBeDisabled()
  })

  it('shows why a file cannot be used at all', async () => {
    vi.mocked(contacts.importContacts).mockRejectedValue(
      failure(400, 'The file needs a "last name" column (for example first_name / last_name).'),
    )
    renderPage()
    await choose()
    expect(await screen.findByRole('alert')).toHaveTextContent('needs a "last name" column')
    expect(screen.queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument()
  })

  it('rejects a file over 2 MB without sending it', async () => {
    renderPage()
    await choose(file('x'.repeat(2 * 1024 * 1024 + 1), 'huge.csv'))
    expect(await screen.findByRole('alert')).toHaveTextContent('larger than 2 MB')
    expect(contacts.importContacts).not.toHaveBeenCalled()
  })

  it('keeps the preview if the import itself fails, and says nothing was saved', async () => {
    vi.mocked(contacts.importContacts).mockImplementation(async (_csv, dryRun) => {
      if (dryRun) return preview
      throw failure(500, 'Internal server error')
    })
    renderPage()
    await choose()
    await userEvent.click(await screen.findByRole('button', { name: 'Import 2 contacts' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error')
    expect(screen.getByRole('button', { name: 'Import 2 contacts' })).toBeEnabled()
  })

  it('starts over when you choose a different file', async () => {
    vi.mocked(contacts.importContacts).mockResolvedValue(preview)
    renderPage()
    await choose()
    await userEvent.click(await screen.findByRole('button', { name: 'Choose a different file' }))
    expect(screen.queryByText('2 contacts ready to import')).not.toBeInTheDocument()
    expect(screen.getByLabelText('CSV file')).toBeInTheDocument()
  })

  it('shows the first 100 problems and says how many more there are', async () => {
    const many = Array.from({ length: 130 }, (_, i) => ({
      row: i + 2,
      name: `Person ${i}`,
      errors: { email: 'Enter a valid email' },
    }))
    vi.mocked(contacts.importContacts).mockResolvedValue({ ...preview, valid: 0, rejected: many })
    renderPage()
    await choose()
    await screen.findByText('Person 0')
    expect(screen.getAllByRole('row')).toHaveLength(101) // header + 100
    expect(screen.getByText(/…and 30 more problems not shown/)).toBeInTheDocument()
  })
})
