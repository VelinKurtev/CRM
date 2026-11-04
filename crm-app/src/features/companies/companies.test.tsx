import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as companies from '@/services/companies'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/companies')

const sales = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['companies:read', 'companies:write'],
  role: 'SALES' as const,
}

const acme: companies.Company = {
  id: 'co1',
  name: 'Acme',
  industry: 'Manufacturing',
  employees: 12500,
  revenue: 1250000.5,
  website: 'https://www.acme.example.com/',
  owner: { id: '1', firstName: 'Ann', lastName: 'Lee' },
  contactCount: 4,
  dealCount: 1,
}
const bare: companies.Company = {
  ...acme,
  id: 'co2',
  name: 'Bare Ltd',
  industry: null,
  employees: null,
  revenue: null,
  website: null,
  contactCount: 0,
}

function renderAt(url: string, permissions = sales.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...sales, permissions }, initialized: true })
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

const apiError = (status: number, message: string, details?: object) =>
  new AxiosError('bad', String(status), undefined, undefined, {
    status,
    data: { error: { message, details } },
  } as AxiosResponse)

const lastList = () => vi.mocked(companies.listCompanyDetails).mock.lastCall![0]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(companies.listCompanyDetails).mockResolvedValue({
    companies: [acme, bare],
    total: 2,
    page: 1,
    pageSize: 20,
  })
})

describe('Companies list', () => {
  it('shows each company’s details, with quiet blanks', async () => {
    renderAt('/companies')
    const row = (await screen.findByText('Acme')).closest('tr')!
    expect(within(row).getByText('Manufacturing')).toBeInTheDocument()
    expect(within(row).getByText('12,500')).toBeInTheDocument()
    expect(within(row).getByText('$1,250,001')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'www.acme.example.com' })).toHaveAttribute(
      'href',
      'https://www.acme.example.com/',
    )
    expect(within(row).getByText('4')).toBeInTheDocument()
    const blank = screen.getByText('Bare Ltd').closest('tr')!
    expect(within(blank).getAllByText('None')).toHaveLength(4)
    expect(screen.getByText('2 companies')).toBeInTheDocument()
  })

  it('is in the sidebar', async () => {
    renderAt('/companies')
    await screen.findByText('Acme')
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]
    expect(within(nav).getByRole('link', { name: 'Companies' })).toHaveAttribute(
      'href',
      '/companies',
    )
  })

  it('denies access without companies:read', () => {
    renderAt('/companies', [])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(companies.listCompanyDetails).not.toHaveBeenCalled()
  })

  it('searches, keeping the query in the address and resetting the page', async () => {
    const router = renderAt('/companies?page=3')
    await screen.findByText('Acme')
    expect(lastList()).toMatchObject({ page: 3 })
    await userEvent.type(screen.getByRole('searchbox'), 'acme')
    await waitFor(() => expect(lastList()).toMatchObject({ q: 'acme', page: 1 }))
    expect(router.state.location.search).toBe('?q=acme')
  })

  it('lets writers open the edit page, but read-only roles only look', async () => {
    renderAt('/companies')
    expect(await screen.findByRole('link', { name: 'Acme' })).toHaveAttribute(
      'href',
      '/companies/co1/edit',
    )
    expect(screen.getByRole('link', { name: /New company/ })).toHaveAttribute(
      'href',
      '/companies/new',
    )
  })

  it('hides create and edit from read-only roles', async () => {
    renderAt('/companies', ['companies:read'])
    expect(await screen.findByText('Acme')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Acme' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /New company/ })).not.toBeInTheDocument()
  })

  it('has empty states for no companies and no matches', async () => {
    vi.mocked(companies.listCompanyDetails).mockResolvedValue({
      companies: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })
    const router = renderAt('/companies')
    expect(await screen.findByText('No companies yet')).toBeInTheDocument()
    router.navigate('/companies?q=zzz')
    expect(await screen.findByText('No companies match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all companies' }))
    expect(await screen.findByText('No companies yet')).toBeInTheDocument()
  })

  it('shows an error if loading fails', async () => {
    vi.mocked(companies.listCompanyDetails).mockRejectedValue(new Error('boom'))
    renderAt('/companies')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load companies')
  })
})

describe('New company', () => {
  const fill = async (label: string, value: string) =>
    userEvent.type(screen.getByLabelText(label), value)

  it('is for roles with companies:write', () => {
    renderAt('/companies/new', ['companies:read'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('creates a company, sending numbers as numbers and leaving blanks out', async () => {
    vi.mocked(companies.createCompany).mockResolvedValue(acme)
    const router = renderAt('/companies/new')
    await fill('Company name', '  Acme ')
    await fill('Industry (optional)', 'Manufacturing')
    await fill('Employees (optional)', '12500')
    await fill('Annual revenue in USD (optional)', '1250000.50')
    await userEvent.click(screen.getByRole('button', { name: 'Create company' }))

    await waitFor(() =>
      expect(companies.createCompany).toHaveBeenCalledWith({
        name: 'Acme',
        industry: 'Manufacturing',
        employees: 12500,
        revenue: 1250000.5,
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies'))
  })

  it('needs only a name', async () => {
    renderAt('/companies/new')
    await userEvent.click(screen.getByRole('button', { name: 'Create company' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(companies.createCompany).not.toHaveBeenCalled()
  })

  it('checks employees, revenue and website before sending', async () => {
    renderAt('/companies/new')
    await fill('Company name', 'Acme')
    await fill('Employees (optional)', '1.5')
    await fill('Annual revenue in USD (optional)', '12,5')
    await fill('Website (optional)', 'acme.com')
    await userEvent.click(screen.getByRole('button', { name: 'Create company' }))
    expect(await screen.findByText('Enter a whole number')).toBeInTheDocument()
    expect(screen.getByText(/Enter an amount/)).toBeInTheDocument()
    expect(screen.getByText(/starting with http/)).toBeInTheDocument()
    expect(companies.createCompany).not.toHaveBeenCalled()
  })

  it('shows a name that is taken next to the field', async () => {
    vi.mocked(companies.createCompany).mockRejectedValue(
      apiError(409, 'A company with this name already exists', {
        name: 'A company with this name already exists',
      }),
    )
    const router = renderAt('/companies/new')
    await fill('Company name', 'Acme')
    await userEvent.click(screen.getByRole('button', { name: 'Create company' }))
    expect(await screen.findByText('A company with this name already exists')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/companies/new')
  })

  it('shows other failures at the top', async () => {
    vi.mocked(companies.createCompany).mockRejectedValue(new Error('boom'))
    renderAt('/companies/new')
    await fill('Company name', 'Acme')
    await userEvent.click(screen.getByRole('button', { name: 'Create company' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the company')
  })
})

describe('Edit company', () => {
  it('fills the form and saves changes, clearing emptied fields with null', async () => {
    vi.mocked(companies.getCompany).mockResolvedValue(acme)
    vi.mocked(companies.updateCompany).mockResolvedValue({ ...acme, name: 'Acme Inc' })
    const router = renderAt('/companies/co1/edit')

    const name = await screen.findByLabelText('Company name')
    expect(name).toHaveValue('Acme')
    expect(screen.getByLabelText('Employees (optional)')).toHaveValue('12500')
    expect(screen.getByLabelText('Annual revenue in USD (optional)')).toHaveValue('1250000.5')

    await userEvent.clear(name)
    await userEvent.type(name, 'Acme Inc')
    await userEvent.clear(screen.getByLabelText('Industry (optional)'))
    await userEvent.clear(screen.getByLabelText('Employees (optional)'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(companies.updateCompany).toHaveBeenCalledWith('co1', {
        name: 'Acme Inc',
        industry: null,
        employees: null,
        revenue: 1250000.5,
        website: 'https://www.acme.example.com/',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies'))
  })

  it('says when the company does not exist', async () => {
    vi.mocked(companies.getCompany).mockRejectedValue(apiError(404, 'Company not found'))
    renderAt('/companies/gone/edit')
    expect(await screen.findByText('Company not found')).toBeInTheDocument()
  })

  it('shows a conflict from the server on the name field', async () => {
    vi.mocked(companies.getCompany).mockResolvedValue(acme)
    vi.mocked(companies.updateCompany).mockRejectedValue(
      apiError(409, 'A company with this name already exists', {
        name: 'A company with this name already exists',
      }),
    )
    renderAt('/companies/co1/edit')
    await screen.findByLabelText('Company name')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('A company with this name already exists')).toBeInTheDocument()
  })

  it('is for roles with companies:write', () => {
    renderAt('/companies/co1/edit', ['companies:read'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(companies.getCompany).not.toHaveBeenCalled()
  })
})
