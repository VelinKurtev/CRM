import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as companies from '@/services/companies'
import * as contacts from '@/services/contacts'
import * as deals from '@/services/deals'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/deals')
vi.mock('@/services/companies')
vi.mock('@/services/contacts')

const sales = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['deals:read', 'deals:write', 'companies:read', 'contacts:read'],
  role: 'SALES' as const,
}

const stages: deals.PipelineStage[] = [
  { id: 's1', name: 'Lead in', position: 1, probability: 10, isWon: false, isLost: false },
  { id: 's2', name: 'Pitch', position: 2, probability: 60, isWon: false, isLost: false },
  { id: 's3', name: 'Closed won', position: 3, probability: 100, isWon: true, isLost: false },
  { id: 's4', name: 'Closed lost', position: 4, probability: 0, isWon: false, isLost: true },
]
const pipelines: deals.Pipeline[] = [
  { id: 'p1', name: 'Sales pipeline', isDefault: true, stages },
  {
    id: 'p2',
    name: 'Other',
    isDefault: false,
    stages: [
      { id: 'x1', name: 'Elsewhere', position: 1, probability: 5, isWon: false, isLost: false },
    ],
  },
]

const redesign: deals.Deal = {
  id: 'd1',
  title: 'Website redesign',
  amount: 15000.5,
  currency: 'USD',
  status: 'OPEN',
  probability: 60,
  expectedClose: '2027-03-31T23:59:59.999Z',
  closedAt: null,
  pipelineId: 'p1',
  stage: { id: 's2', name: 'Pitch' },
  company: { id: 'c1', name: 'Acme' },
  contact: { id: 'ct1', firstName: 'Cy', lastName: 'Dole' },
  owner: { id: '2', firstName: 'Bob', lastName: 'Ray' },
  createdAt: '2026-11-01T10:00:00.000Z',
}
const bare: deals.Deal = {
  ...redesign,
  id: 'd2',
  title: 'Cold deal',
  amount: 0,
  probability: 10,
  expectedClose: null,
  stage: { id: 's1', name: 'Lead in' },
  company: null,
  contact: null,
  owner: null,
}
const won: deals.Deal = {
  ...redesign,
  id: 'd3',
  title: 'Signed deal',
  status: 'WON',
  probability: 100,
  stage: { id: 's3', name: 'Closed won' },
  company: null,
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

const lastList = () => vi.mocked(deals.listDeals).mock.lastCall![0]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(deals.listDeals).mockResolvedValue({
    deals: [redesign, bare, won],
    total: 3,
    page: 1,
    pageSize: 20,
  })
  vi.mocked(deals.listPipelines).mockResolvedValue(pipelines)
  vi.mocked(companies.listCompanyDetails).mockResolvedValue({
    companies: [
      {
        id: 'c1',
        name: 'Acme',
        industry: 'Manufacturing',
        employees: null,
        revenue: null,
        website: null,
        owner: null,
        contactCount: 0,
        dealCount: 0,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 8,
  })
  vi.mocked(contacts.listContacts).mockResolvedValue({
    contacts: [
      {
        id: 'ct1',
        firstName: 'Cy',
        lastName: 'Dole',
        email: 'cy@acme.com',
        phone: null,
        jobTitle: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        company: { id: 'c1', name: 'Acme' },
        owner: null,
        tags: [],
      },
    ],
    total: 1,
    page: 1,
    pageSize: 8,
  })
})

describe('Deals list', () => {
  it('shows each deal’s details, with quiet blanks', async () => {
    renderAt('/deals')
    const row = (await screen.findByText('Website redesign')).closest('tr')!
    expect(within(row).getByText('Acme')).toBeInTheDocument()
    expect(within(row).getByText('Pitch')).toBeInTheDocument()
    expect(within(row).getByText('$15,001')).toBeInTheDocument()
    expect(within(row).getByText('60%')).toBeInTheDocument()
    // The day it was chosen, not shifted by the viewer's time zone.
    expect(within(row).getByText('Mar 31, 2027')).toBeInTheDocument()
    expect(within(row).getByText('Bob Ray')).toBeInTheDocument()
    const blank = screen.getByText('Cold deal').closest('tr')!
    expect(within(blank).getAllByText('None')).toHaveLength(3)
    expect(screen.getByText('3 deals')).toBeInTheDocument()
  })

  it('shows a contact when there is no company, and marks closed deals', async () => {
    renderAt('/deals')
    const row = (await screen.findByText('Signed deal')).closest('tr')!
    expect(within(row).getByText('Cy Dole')).toBeInTheDocument()
    expect(within(row).getByText('Won')).toBeInTheDocument()
    expect(
      within(screen.getByText('Website redesign').closest('tr')!).queryByText('Open'),
    ).toBeNull()
  })

  it('is in the sidebar', async () => {
    renderAt('/deals')
    await screen.findByText('Website redesign')
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]
    expect(within(nav).getByRole('link', { name: 'Deals' })).toHaveAttribute('href', '/deals')
  })

  it('denies access without deals:read', () => {
    renderAt('/deals', [])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(deals.listDeals).not.toHaveBeenCalled()
  })

  it('searches, keeping the query in the address and resetting the page', async () => {
    const router = renderAt('/deals?page=3')
    await screen.findByText('Website redesign')
    expect(lastList()).toMatchObject({ page: 3 })
    await userEvent.type(screen.getByRole('searchbox'), 'acme')
    await waitFor(() => expect(lastList()).toMatchObject({ q: 'acme', page: 1 }))
    expect(router.state.location.search).toBe('?q=acme')
  })

  it('filters by status from the address', async () => {
    renderAt('/deals?status=WON')
    await screen.findByText('Website redesign')
    expect(lastList()).toMatchObject({ status: 'WON' })
  })

  it('offers New deal and Edit to writers only', async () => {
    renderAt('/deals')
    await screen.findByText('Website redesign')
    expect(screen.getByRole('link', { name: /New deal/ })).toHaveAttribute('href', '/deals/new')
    expect(screen.getByRole('link', { name: 'Edit Website redesign' })).toHaveAttribute(
      'href',
      '/deals/d1/edit',
    )
  })

  it('lets read-only roles look at deals but not change them', async () => {
    renderAt('/deals', ['deals:read'])
    expect(await screen.findByText('Website redesign')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /New deal/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Edit/ })).not.toBeInTheDocument()
  })

  it('has empty states for no deals and no matches', async () => {
    vi.mocked(deals.listDeals).mockResolvedValue({ deals: [], total: 0, page: 1, pageSize: 20 })
    const router = renderAt('/deals')
    expect(await screen.findByText('No deals yet')).toBeInTheDocument()
    router.navigate('/deals?q=zzz')
    expect(await screen.findByText('No deals match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all deals' }))
    expect(await screen.findByText('No deals yet')).toBeInTheDocument()
  })

  it('shows an error if loading fails', async () => {
    vi.mocked(deals.listDeals).mockRejectedValue(new Error('boom'))
    renderAt('/deals')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load deals')
  })
})

/** Search for a company or contact in its picker and choose the first result. */
async function pick(label: string, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: new RegExp(option) }))
}

describe('New deal', () => {
  it('is for roles with deals:write', () => {
    renderAt('/deals/new', ['deals:read'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('starts in the default pipeline’s first stage with that stage’s probability', async () => {
    renderAt('/deals/new')
    const stage = await screen.findByLabelText('Stage')
    expect(stage).toHaveDisplayValue('Lead in')
    expect(
      within(stage)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Lead in', 'Pitch', 'Closed won', 'Closed lost'])
    expect(screen.getByLabelText('Probability of winning (%)')).toHaveValue('10')
  })

  it('creates a deal with every field', async () => {
    vi.mocked(deals.createDeal).mockResolvedValue(redesign)
    const router = renderAt('/deals/new')
    await userEvent.type(await screen.findByLabelText('Deal name'), '  Website redesign ')
    await pick('Company', 'Acme')
    await pick('Contact', 'Cy Dole')
    await userEvent.type(screen.getByLabelText('Value in USD (optional)'), '15000.50')
    await userEvent.type(screen.getByLabelText('Expected closing date (optional)'), '2027-03-31')
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 's2')
    // Choosing the stage brought its probability; it can still be changed.
    const probability = screen.getByLabelText('Probability of winning (%)')
    expect(probability).toHaveValue('60')
    await userEvent.clear(probability)
    await userEvent.type(probability, '75')
    await userEvent.click(screen.getByRole('button', { name: 'Create deal' }))

    await waitFor(() =>
      expect(deals.createDeal).toHaveBeenCalledWith({
        title: 'Website redesign',
        stageId: 's2',
        probability: 75,
        amount: 15000.5,
        expectedClose: '2027-03-31',
        companyId: 'c1',
        contactId: 'ct1',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/deals'))
  })

  it('needs only a name', async () => {
    vi.mocked(deals.createDeal).mockResolvedValue(bare)
    renderAt('/deals/new')
    await userEvent.click(await screen.findByRole('button', { name: 'Create deal' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(deals.createDeal).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Deal name'), 'Cold deal')
    await userEvent.click(screen.getByRole('button', { name: 'Create deal' }))
    await waitFor(() =>
      expect(deals.createDeal).toHaveBeenCalledWith({
        title: 'Cold deal',
        stageId: 's1',
        probability: 10,
      }),
    )
  })

  it('fixes the probability for won and lost stages', async () => {
    renderAt('/deals/new')
    await userEvent.selectOptions(await screen.findByLabelText('Stage'), 's3')
    const probability = screen.getByLabelText('Probability of winning (%)')
    expect(probability).toHaveValue('100')
    expect(probability).toBeDisabled()
    expect(screen.getByText('Fixed for won and lost deals')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 's4')
    expect(probability).toHaveValue('0')
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 's1')
    expect(probability).toBeEnabled()
    expect(probability).toHaveValue('10')
  })

  it('checks the value and probability before sending', async () => {
    renderAt('/deals/new')
    await userEvent.type(await screen.findByLabelText('Deal name'), 'Deal')
    await userEvent.type(screen.getByLabelText('Value in USD (optional)'), '12,5')
    const probability = screen.getByLabelText('Probability of winning (%)')
    await userEvent.clear(probability)
    await userEvent.type(probability, '101')
    await userEvent.click(screen.getByRole('button', { name: 'Create deal' }))
    expect(await screen.findByText(/Enter an amount/)).toBeInTheDocument()
    expect(screen.getByText('Probability cannot be above 100')).toBeInTheDocument()
    expect(deals.createDeal).not.toHaveBeenCalled()
  })

  it('lets the company and contact be searched, and cleared again', async () => {
    renderAt('/deals/new')
    await userEvent.type(await screen.findByRole('combobox', { name: 'Company' }), 'Ac')
    await waitFor(() =>
      expect(companies.listCompanyDetails).toHaveBeenCalledWith({ q: 'Ac', pageSize: 8 }),
    )
    await userEvent.click(await screen.findByRole('option', { name: /Acme/ }))
    expect(screen.queryByRole('combobox', { name: 'Company' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Company')).toHaveTextContent('Acme')
    await userEvent.click(screen.getByRole('button', { name: 'Clear company' }))
    expect(screen.getByRole('combobox', { name: 'Company' })).toBeInTheDocument()
  })

  it('keeps the list open while an option is pressed, whatever the browser focuses', async () => {
    renderAt('/deals/new')
    await userEvent.click(await screen.findByRole('combobox', { name: 'Company' }))
    const option = await screen.findByRole('option', { name: /Acme/ })
    // Some browsers do not focus a clicked button, so the search box would blur and close the list
    // before the click. Pressing must therefore not move focus away from it (default prevented).
    expect(fireEvent.mouseDown(option)).toBe(false)
  })

  it('hides the company and contact choices from roles that cannot read them', async () => {
    renderAt('/deals/new', ['deals:read', 'deals:write'])
    await screen.findByLabelText('Deal name')
    expect(screen.queryByRole('combobox', { name: 'Company' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Contact' })).not.toBeInTheDocument()
  })

  it('shows a server error next to the company field', async () => {
    vi.mocked(deals.createDeal).mockRejectedValue(
      apiError(400, 'That company does not exist', { companyId: 'That company does not exist' }),
    )
    const router = renderAt('/deals/new')
    await userEvent.type(await screen.findByLabelText('Deal name'), 'Deal')
    await pick('Company', 'Acme')
    await userEvent.click(screen.getByRole('button', { name: 'Create deal' }))
    expect(await screen.findByText('That company does not exist')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/deals/new')
  })

  it('shows other failures at the top', async () => {
    vi.mocked(deals.createDeal).mockRejectedValue(new Error('boom'))
    renderAt('/deals/new')
    await userEvent.type(await screen.findByLabelText('Deal name'), 'Deal')
    await userEvent.click(screen.getByRole('button', { name: 'Create deal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the deal')
  })

  it('says so when there is no pipeline to add to', async () => {
    vi.mocked(deals.listPipelines).mockRejectedValue(new Error('boom'))
    renderAt('/deals/new')
    expect(await screen.findByText('Could not load the deal stages')).toBeInTheDocument()
  })
})

describe('Edit deal', () => {
  it('fills the form and saves changes, clearing emptied fields with null', async () => {
    vi.mocked(deals.getDeal).mockResolvedValue(redesign)
    vi.mocked(deals.updateDeal).mockResolvedValue({ ...redesign, title: 'Redesign' })
    const router = renderAt('/deals/d1/edit')

    const name = await screen.findByLabelText('Deal name')
    expect(name).toHaveValue('Website redesign')
    expect(screen.getByLabelText('Company')).toHaveTextContent('Acme')
    expect(screen.getByLabelText('Contact')).toHaveTextContent('Cy Dole')
    expect(screen.getByLabelText('Value in USD (optional)')).toHaveValue('15000.5')
    expect(screen.getByLabelText('Expected closing date (optional)')).toHaveValue('2027-03-31')
    expect(screen.getByLabelText('Stage')).toHaveDisplayValue('Pitch')
    expect(screen.getByLabelText('Probability of winning (%)')).toHaveValue('60')

    await userEvent.clear(name)
    await userEvent.type(name, 'Redesign')
    await userEvent.click(screen.getByRole('button', { name: 'Clear contact' }))
    await userEvent.clear(screen.getByLabelText('Expected closing date (optional)'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(deals.updateDeal).toHaveBeenCalledWith('d1', {
        title: 'Redesign',
        amount: 15000.5,
        stageId: 's2',
        probability: 60,
        expectedClose: null,
        companyId: 'c1',
        contactId: null,
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/deals'))
  })

  it('only offers the stages of the deal’s own pipeline', async () => {
    vi.mocked(deals.getDeal).mockResolvedValue({
      ...redesign,
      pipelineId: 'p2',
      stage: { id: 'x1', name: 'Elsewhere' },
    })
    renderAt('/deals/d1/edit')
    const stage = await screen.findByLabelText('Stage')
    expect(
      within(stage)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Elsewhere'])
  })

  it('moves a deal to another stage, taking that stage’s probability', async () => {
    vi.mocked(deals.getDeal).mockResolvedValue(redesign)
    vi.mocked(deals.updateDeal).mockResolvedValue(won)
    renderAt('/deals/d1/edit')
    await userEvent.selectOptions(await screen.findByLabelText('Stage'), 's3')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(deals.updateDeal).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ stageId: 's3', probability: 100 }),
      ),
    )
  })

  it('says when the deal does not exist', async () => {
    vi.mocked(deals.getDeal).mockRejectedValue(apiError(404, 'Deal not found'))
    renderAt('/deals/gone/edit')
    expect(await screen.findByText('Deal not found')).toBeInTheDocument()
  })

  it('is for roles with deals:write', () => {
    renderAt('/deals/d1/edit', ['deals:read'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(deals.getDeal).not.toHaveBeenCalled()
  })
})
