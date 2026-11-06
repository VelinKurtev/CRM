import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as deals from '@/services/deals'
import * as leads from '@/services/leads'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/leads')
vi.mock('@/services/deals')
vi.mock('@/services/companies')
vi.mock('@/services/contacts')

const sales = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['leads:read', 'leads:write', 'deals:read', 'deals:write', 'contacts:read'],
  role: 'SALES' as const,
}

const lead = (id: string, title: string, status: leads.Lead['status'], extra = {}): leads.Lead => ({
  id,
  title,
  source: null,
  value: 15000.5,
  priority: 'MEDIUM',
  status,
  notes: 'Wants a demo',
  createdAt: '2026-11-01T10:00:00.000Z',
  owner: null,
  contact: { id: 'ct1', firstName: 'Cy', lastName: 'Dole' },
  deal: null,
  attachmentCount: 0,
  ...extra,
})

const qualified = lead('l1', 'Website redesign', 'QUALIFIED')
const fresh = lead('l2', 'Cold enquiry', 'NEW')
const converted = lead('l3', 'Signed lead', 'WON', { deal: { id: 'd9', title: 'Signed deal' } })

const stages: deals.PipelineStage[] = [
  { id: 's1', name: 'Lead in', position: 1, probability: 10, isWon: false, isLost: false },
  { id: 's2', name: 'Pitch', position: 2, probability: 60, isWon: false, isLost: false },
]

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

const apiError = (status: number, message: string) =>
  new AxiosError('bad', String(status), undefined, undefined, {
    status,
    data: { error: { message } },
  } as AxiosResponse)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(leads.listLeads).mockResolvedValue({
    leads: [qualified, fresh, converted],
    total: 3,
    page: 1,
    pageSize: 20,
    stageCounts: {
      NEW: 1,
      CONTACTED: 0,
      QUALIFIED: 1,
      PROPOSAL_SENT: 0,
      NEGOTIATION: 0,
      WON: 1,
      LOST: 0,
    },
  })
  vi.mocked(leads.getLead).mockResolvedValue(qualified)
  vi.mocked(leads.listLeadOwners).mockResolvedValue([])
  vi.mocked(leads.listLeadAttachments).mockResolvedValue([])
  vi.mocked(deals.listPipelines).mockResolvedValue([
    { id: 'p1', name: 'Sales pipeline', isDefault: true, stages },
  ])
  vi.mocked(deals.listDeals).mockResolvedValue({ deals: [], total: 0, page: 1, pageSize: 20 })
})

describe('Convert buttons', () => {
  it('are on qualified leads in the list, but not on new or converted ones', async () => {
    renderAt('/leads')
    await screen.findByText('Website redesign')
    expect(
      screen.getByRole('link', { name: 'Convert Website redesign to a deal' }),
    ).toHaveAttribute('href', '/leads/l1/convert')
    expect(screen.queryByRole('link', { name: /Convert Cold enquiry/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Convert Signed lead/ })).not.toBeInTheDocument()
  })

  it('need permission to write deals as well', async () => {
    renderAt('/leads', ['leads:read', 'leads:write'])
    await screen.findByText('Website redesign')
    expect(screen.queryByRole('link', { name: /Convert/ })).not.toBeInTheDocument()
  })

  it('show a converted lead as Converted, linking to its deal', async () => {
    renderAt('/leads')
    const row = (await screen.findByText('Signed lead')).closest('tr')!
    expect(
      within(row).getByRole('link', { name: 'Converted to deal Signed deal' }),
    ).toHaveAttribute('href', '/deals/d9/edit')
    expect(
      within(screen.getByText('Cold enquiry').closest('tr')!).queryByText('Converted'),
    ).toBeNull()
  })

  it('show only the text Converted to people who cannot open deals', async () => {
    renderAt('/leads', ['leads:read'])
    const row = (await screen.findByText('Signed lead')).closest('tr')!
    expect(within(row).getByText('Converted')).toBeInTheDocument()
    expect(within(row).queryByRole('link')).not.toBeInTheDocument()
  })

  it('are on the lead’s edit page too', async () => {
    renderAt('/leads/l1/edit')
    expect(await screen.findByRole('link', { name: /Convert to deal/ })).toHaveAttribute(
      'href',
      '/leads/l1/convert',
    )
  })

  it('give way, on the edit page, to a note of which deal a converted lead became', async () => {
    vi.mocked(leads.getLead).mockResolvedValue(converted)
    renderAt('/leads/l3/edit')
    expect(await screen.findByRole('link', { name: 'Signed deal' })).toHaveAttribute(
      'href',
      '/deals/d9/edit',
    )
    expect(screen.queryByRole('link', { name: /Convert to deal/ })).not.toBeInTheDocument()
  })
})

describe('Convert lead page', () => {
  it('needs permission to write leads and deals', () => {
    renderAt('/leads/l1/convert', ['leads:read', 'leads:write'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(leads.getLead).not.toHaveBeenCalled()
  })

  it('starts the deal form off with what the lead already says', async () => {
    renderAt('/leads/l1/convert')
    expect(
      await screen.findByRole('heading', { name: 'Convert Website redesign to a deal' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Deal name')).toHaveValue('Website redesign')
    expect(screen.getByLabelText('Value in USD (optional)')).toHaveValue('15000.5')
    expect(screen.getByLabelText('Contact')).toHaveTextContent('Cy Dole')
    expect(screen.getByLabelText('Stage')).toHaveDisplayValue('Lead in')
    expect(screen.getByLabelText('Probability of winning (%)')).toHaveValue('10')
  })

  it('converts the lead with what is on the form, then opens the new deal', async () => {
    vi.mocked(leads.convertLead).mockResolvedValue({
      deal: { id: 'd1' } as deals.Deal,
      lead: { ...qualified, status: 'WON' },
    })
    const router = renderAt('/leads/l1/convert')
    const name = await screen.findByLabelText('Deal name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Redesign project')
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 's2')
    await userEvent.click(screen.getByRole('button', { name: 'Convert to deal' }))

    await waitFor(() =>
      expect(leads.convertLead).toHaveBeenCalledWith('l1', {
        title: 'Redesign project',
        stageId: 's2',
        probability: 60,
        amount: 15000.5,
        contactId: 'ct1',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/deals/d1/edit'))
  })

  it('lets the contact be taken off', async () => {
    vi.mocked(leads.convertLead).mockResolvedValue({
      deal: { id: 'd1' } as deals.Deal,
      lead: qualified,
    })
    renderAt('/leads/l1/convert')
    await userEvent.click(await screen.findByRole('button', { name: 'Clear contact' }))
    await userEvent.click(screen.getByRole('button', { name: 'Convert to deal' }))
    await waitFor(() => expect(leads.convertLead).toHaveBeenCalled())
    expect(vi.mocked(leads.convertLead).mock.lastCall![1]).not.toHaveProperty('contactId')
  })

  it('shows a refusal from the server at the top and stays put', async () => {
    vi.mocked(leads.convertLead).mockRejectedValue(
      apiError(409, 'This lead has already been converted to a deal'),
    )
    const router = renderAt('/leads/l1/convert')
    await userEvent.click(await screen.findByRole('button', { name: 'Convert to deal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already been converted')
    expect(router.state.location.pathname).toBe('/leads/l1/convert')
  })

  it('explains why a lead that is not qualified cannot be converted', async () => {
    vi.mocked(leads.getLead).mockResolvedValue(fresh)
    renderAt('/leads/l2/convert')
    expect(await screen.findByText('Only a qualified lead can be converted')).toBeInTheDocument()
    expect(screen.getByText(/New Lead/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convert to deal' })).not.toBeInTheDocument()
  })

  it('points to the deal if the lead was converted already', async () => {
    vi.mocked(leads.getLead).mockResolvedValue(converted)
    renderAt('/leads/l3/convert')
    expect(await screen.findByText('This lead is already a deal')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the deal' })).toHaveAttribute(
      'href',
      '/deals/d9/edit',
    )
  })

  it('says when the lead does not exist', async () => {
    vi.mocked(leads.getLead).mockRejectedValue(apiError(404, 'Lead not found'))
    renderAt('/leads/gone/convert')
    expect(await screen.findByText('Lead not found')).toBeInTheDocument()
  })

  it('says so when there is no pipeline to put the deal in', async () => {
    vi.mocked(deals.listPipelines).mockResolvedValue([])
    renderAt('/leads/l1/convert')
    expect(await screen.findByText('There is no pipeline to add the deal to')).toBeInTheDocument()
  })
})
