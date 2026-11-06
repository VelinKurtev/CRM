import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as leads from '@/services/leads'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/leads')

const sales = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['leads:read', 'leads:write'],
  role: 'SALES' as const,
}

const hot: leads.Lead = {
  id: 'l1',
  title: 'Website redesign',
  source: 'Trade show',
  value: 15000.5,
  priority: 'HIGH',
  status: 'CONTACTED',
  notes: 'Wants a demo',
  createdAt: '2026-11-01T10:00:00.000Z',
  owner: { id: '2', firstName: 'Bob', lastName: 'Ray' },
  attachmentCount: 2,
  contact: null,
  deal: null,
}
const bare: leads.Lead = {
  ...hot,
  id: 'l2',
  title: 'Cold enquiry',
  source: null,
  value: null,
  priority: 'LOW',
  status: 'NEW',
  notes: null,
  owner: null,
  attachmentCount: 0,
}

/** A manager: everything sales can do, and may give leads to other people. */
const manager = [...sales.permissions, 'leads:assign']

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

const counts: leads.LeadsPage['stageCounts'] = {
  NEW: 1,
  CONTACTED: 1,
  QUALIFIED: 0,
  PROPOSAL_SENT: 0,
  NEGOTIATION: 0,
  WON: 0,
  LOST: 0,
}

const lastList = () => vi.mocked(leads.listLeads).mock.lastCall![0]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(leads.listLeads).mockResolvedValue({
    leads: [hot, bare],
    total: 2,
    page: 1,
    pageSize: 20,
    stageCounts: counts,
  })
  vi.mocked(leads.listLeadOwners).mockResolvedValue([
    { id: '1', firstName: 'Ann', lastName: 'Lee' },
    { id: '2', firstName: 'Bob', lastName: 'Ray' },
  ])
})

describe('Leads list', () => {
  it('shows each lead’s details, with quiet blanks', async () => {
    renderAt('/leads')
    const row = (await screen.findByText('Website redesign')).closest('tr')!
    expect(within(row).getByText('Trade show')).toBeInTheDocument()
    expect(within(row).getByText('$15,001')).toBeInTheDocument()
    expect(within(row).getByText('High')).toBeInTheDocument()
    expect(within(row).getByLabelText('Stage for Website redesign')).toHaveValue('CONTACTED')
    expect(within(row).getByText('Bob Ray')).toBeInTheDocument()
    expect(within(row).getByText('files attached')).toBeInTheDocument()
    const blank = screen.getByText('Cold enquiry').closest('tr')!
    expect(within(blank).getAllByText('None')).toHaveLength(3)
    expect(screen.getByText('2 leads')).toBeInTheDocument()
  })

  it('is in the sidebar', async () => {
    renderAt('/leads')
    await screen.findByText('Website redesign')
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]
    expect(within(nav).getByRole('link', { name: 'Leads' })).toHaveAttribute('href', '/leads')
  })

  it('denies access without leads:read', () => {
    renderAt('/leads', [])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(leads.listLeads).not.toHaveBeenCalled()
  })

  it('searches, keeping the query in the address and resetting the page', async () => {
    const router = renderAt('/leads?page=3')
    await screen.findByText('Website redesign')
    expect(lastList()).toMatchObject({ page: 3 })
    await userEvent.type(screen.getByRole('searchbox'), 'show')
    await waitFor(() => expect(lastList()).toMatchObject({ q: 'show', page: 1 }))
    expect(router.state.location.search).toBe('?q=show')
  })

  it('filters by status and priority from the address', async () => {
    renderAt('/leads?status=QUALIFIED&priority=HIGH')
    await screen.findByText('Website redesign')
    expect(lastList()).toMatchObject({ status: 'QUALIFIED', priority: 'HIGH' })
  })

  it('leaves converted leads out unless “Show converted” is ticked, keeping it in the address', async () => {
    const router = renderAt('/leads?page=2')
    await screen.findByText('Website redesign')
    expect(lastList()).not.toHaveProperty('converted', true)
    const box = screen.getByRole('checkbox', { name: 'Show converted' })
    expect(box).not.toBeChecked()

    await userEvent.click(box)
    await waitFor(() => expect(lastList()).toMatchObject({ converted: true, page: 1 }))
    expect(router.state.location.search).toBe('?converted=1')
    expect(screen.getByRole('checkbox', { name: 'Show converted' })).toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Show converted' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(lastList().converted).toBeUndefined()
  })

  it('starts with converted leads shown when the address says so', async () => {
    renderAt('/leads?converted=1')
    await screen.findByText('Website redesign')
    expect(lastList()).toMatchObject({ converted: true })
    expect(screen.getByRole('checkbox', { name: 'Show converted' })).toBeChecked()
  })

  it('shows how many leads are in each stage, in pipeline order, and filters on click', async () => {
    const router = renderAt('/leads')
    await screen.findByText('Website redesign')
    const stages = within(screen.getByRole('navigation', { name: 'Pipeline stages' }))
    expect(stages.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'New Lead1',
      'Contacted1',
      'Qualified0',
      'Proposal Sent0',
      'Negotiation0',
      'Won0',
      'Lost0',
    ])
    await userEvent.click(stages.getByRole('button', { name: /Proposal Sent/ }))
    await waitFor(() => expect(lastList()).toMatchObject({ status: 'PROPOSAL_SENT', page: 1 }))
    expect(router.state.location.search).toBe('?status=PROPOSAL_SENT')
    expect(stages.getByRole('button', { name: /Proposal Sent/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(stages.getByRole('button', { name: /Proposal Sent/ }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('moves a lead to another stage from the list', async () => {
    vi.mocked(leads.setLeadStage).mockResolvedValue({ ...hot, status: 'NEGOTIATION' })
    renderAt('/leads')
    await screen.findByText('Website redesign')
    await userEvent.selectOptions(
      screen.getByLabelText('Stage for Website redesign'),
      'NEGOTIATION',
    )
    await waitFor(() => expect(leads.setLeadStage).toHaveBeenCalledWith('l1', 'NEGOTIATION'))
    await waitFor(() => expect(leads.listLeads).toHaveBeenCalledTimes(2))
  })

  it('lets a manager give a lead to someone else from the list', async () => {
    vi.mocked(leads.setLeadOwner).mockResolvedValue({
      ...hot,
      owner: { id: '1', firstName: 'Ann', lastName: 'Lee' },
    })
    renderAt('/leads', manager)
    await screen.findByText('Website redesign')
    const owner = await screen.findByLabelText('Owner of Website redesign')
    await waitFor(() => expect(owner).toBeEnabled())
    expect(owner).toHaveDisplayValue('Bob Ray')
    expect(screen.getByLabelText('Owner of Cold enquiry')).toHaveDisplayValue('Nobody')
    await userEvent.selectOptions(owner, '1')
    await waitFor(() => expect(leads.setLeadOwner).toHaveBeenCalledWith('l1', '1'))
    await waitFor(() => expect(leads.listLeads).toHaveBeenCalledTimes(2))
  })

  it('lets a manager take a lead off its owner', async () => {
    vi.mocked(leads.setLeadOwner).mockResolvedValue({ ...hot, owner: null })
    renderAt('/leads', manager)
    const owner = await screen.findByLabelText('Owner of Website redesign')
    await waitFor(() => expect(owner).toBeEnabled())
    await userEvent.selectOptions(owner, '')
    await waitFor(() => expect(leads.setLeadOwner).toHaveBeenCalledWith('l1', null))
  })

  it('shows the owner as plain text to people who cannot assign, without fetching owners', async () => {
    renderAt('/leads')
    const row = (await screen.findByText('Website redesign')).closest('tr')!
    expect(within(row).getByText('Bob Ray')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Owner of/)).not.toBeInTheDocument()
    expect(leads.listLeadOwners).not.toHaveBeenCalled()
  })

  it('only shows the stage, without a control, to read-only roles', async () => {
    renderAt('/leads', ['leads:read'])
    const row = (await screen.findByText('Website redesign')).closest('tr')!
    expect(within(row).getByText('Contacted')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Stage for/)).not.toBeInTheDocument()
  })

  it('offers New lead and Edit to writers only', async () => {
    renderAt('/leads')
    await screen.findByText('Website redesign')
    expect(screen.getByRole('link', { name: /New lead/ })).toHaveAttribute('href', '/leads/new')
    expect(screen.getByRole('link', { name: 'Edit Website redesign' })).toHaveAttribute(
      'href',
      '/leads/l1/edit',
    )
  })

  it('lets read-only roles look at leads but not change them', async () => {
    renderAt('/leads', ['leads:read'])
    expect(await screen.findByText('Website redesign')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /New lead/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Edit/ })).not.toBeInTheDocument()
  })

  it('has empty states for no leads and no matches', async () => {
    vi.mocked(leads.listLeads).mockResolvedValue({
      leads: [],
      total: 0,
      page: 1,
      pageSize: 20,
      stageCounts: counts,
    })
    const router = renderAt('/leads')
    expect(await screen.findByText('No leads yet')).toBeInTheDocument()
    router.navigate('/leads?q=zzz')
    expect(await screen.findByText('No leads match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all leads' }))
    expect(await screen.findByText('No leads yet')).toBeInTheDocument()
  })

  it('shows an error if loading fails', async () => {
    vi.mocked(leads.listLeads).mockRejectedValue(new Error('boom'))
    renderAt('/leads')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load leads')
  })
})

describe('New lead', () => {
  it('is for roles with leads:write', () => {
    renderAt('/leads/new', ['leads:read'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })

  it('creates a lead with every field, sending the value as a number', async () => {
    vi.mocked(leads.createLead).mockResolvedValue(hot)
    const router = renderAt('/leads/new', manager)
    await userEvent.type(screen.getByLabelText('Title'), '  Website redesign ')
    await userEvent.type(screen.getByLabelText('Source (optional)'), 'Trade show')
    await userEvent.type(screen.getByLabelText('Estimated value in USD (optional)'), '15000.50')
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'HIGH')
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'CONTACTED')
    await screen.findByRole('option', { name: 'Bob Ray' })
    await userEvent.selectOptions(screen.getByLabelText('Owner'), '2')
    await userEvent.type(screen.getByLabelText('Notes (optional)'), 'Wants a demo')
    await userEvent.click(screen.getByRole('button', { name: 'Create lead' }))

    await waitFor(() =>
      expect(leads.createLead).toHaveBeenCalledWith({
        title: 'Website redesign',
        source: 'Trade show',
        value: 15000.5,
        priority: 'HIGH',
        status: 'CONTACTED',
        notes: 'Wants a demo',
        ownerId: '2',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/leads'))
  })

  it('has no owner choice for sales: a new lead is theirs', async () => {
    vi.mocked(leads.createLead).mockResolvedValue(bare)
    renderAt('/leads/new')
    await userEvent.type(screen.getByLabelText('Title'), 'Cold enquiry')
    expect(screen.queryByLabelText('Owner')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create lead' }))
    await waitFor(() => expect(leads.createLead).toHaveBeenCalled())
    expect(vi.mocked(leads.createLead).mock.lastCall![0]).not.toHaveProperty('ownerId')
    expect(leads.listLeadOwners).not.toHaveBeenCalled()
  })

  it('needs only a title: medium priority, new, owned by me', async () => {
    vi.mocked(leads.createLead).mockResolvedValue(bare)
    renderAt('/leads/new', manager)
    expect(screen.getByLabelText('Owner')).toHaveDisplayValue('Me')
    await userEvent.click(screen.getByRole('button', { name: 'Create lead' }))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(leads.createLead).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Title'), 'Cold enquiry')
    await userEvent.click(screen.getByRole('button', { name: 'Create lead' }))
    await waitFor(() =>
      expect(leads.createLead).toHaveBeenCalledWith({
        title: 'Cold enquiry',
        priority: 'MEDIUM',
        status: 'NEW',
      }),
    )
  })

  it('checks the value before sending', async () => {
    renderAt('/leads/new')
    await userEvent.type(screen.getByLabelText('Title'), 'Lead')
    await userEvent.type(screen.getByLabelText('Estimated value in USD (optional)'), '12,5')
    await userEvent.click(screen.getByRole('button', { name: 'Create lead' }))
    expect(await screen.findByText(/Enter an amount/)).toBeInTheDocument()
    expect(leads.createLead).not.toHaveBeenCalled()
  })

  it('shows a field error from the server next to the field', async () => {
    vi.mocked(leads.createLead).mockRejectedValue(
      apiError(400, 'Choose an active user as owner', {
        ownerId: 'Choose an active user as owner',
      }),
    )
    const router = renderAt('/leads/new', manager)
    await userEvent.type(screen.getByLabelText('Title'), 'Lead')
    await userEvent.click(screen.getByRole('button', { name: 'Create lead' }))
    expect(await screen.findByText('Choose an active user as owner')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/leads/new')
  })

  it('shows other failures at the top', async () => {
    vi.mocked(leads.createLead).mockRejectedValue(new Error('boom'))
    renderAt('/leads/new')
    await userEvent.type(screen.getByLabelText('Title'), 'Lead')
    await userEvent.click(screen.getByRole('button', { name: 'Create lead' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the lead')
  })
})

describe('Edit lead', () => {
  it('fills the form and saves changes, clearing emptied fields with null', async () => {
    vi.mocked(leads.getLead).mockResolvedValue(hot)
    vi.mocked(leads.updateLead).mockResolvedValue({ ...hot, title: 'Redesign' })
    const router = renderAt('/leads/l1/edit', manager)

    const title = await screen.findByLabelText('Title')
    expect(title).toHaveValue('Website redesign')
    expect(screen.getByLabelText('Estimated value in USD (optional)')).toHaveValue('15000.5')
    expect(screen.getByLabelText('Priority')).toHaveValue('HIGH')
    expect(screen.getByLabelText('Stage')).toHaveValue('CONTACTED')
    expect(screen.getByLabelText('Notes (optional)')).toHaveValue('Wants a demo')
    await waitFor(() => expect(screen.getByLabelText('Owner')).toHaveValue('2'))

    await userEvent.clear(title)
    await userEvent.type(title, 'Redesign')
    await userEvent.clear(screen.getByLabelText('Source (optional)'))
    await userEvent.clear(screen.getByLabelText('Notes (optional)'))
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'QUALIFIED')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(leads.updateLead).toHaveBeenCalledWith('l1', {
        title: 'Redesign',
        source: null,
        value: 15000.5,
        priority: 'HIGH',
        status: 'QUALIFIED',
        notes: null,
        ownerId: '2',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/leads'))
  })

  it('leaves the owner alone when sales edit a lead', async () => {
    vi.mocked(leads.getLead).mockResolvedValue(hot)
    vi.mocked(leads.updateLead).mockResolvedValue(hot)
    renderAt('/leads/l1/edit')
    await screen.findByLabelText('Title')
    expect(screen.queryByLabelText('Owner')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(leads.updateLead).toHaveBeenCalled())
    expect(vi.mocked(leads.updateLead).mock.lastCall![1]).not.toHaveProperty('ownerId')
  })

  it('can set the owner to nobody, and still shows an owner who was deactivated', async () => {
    vi.mocked(leads.getLead).mockResolvedValue({
      ...hot,
      owner: { id: '9', firstName: 'Gone', lastName: 'User' },
    })
    vi.mocked(leads.updateLead).mockResolvedValue(hot)
    renderAt('/leads/l1/edit', manager)
    await screen.findByRole('option', { name: 'Bob Ray' })
    const owner = screen.getByLabelText('Owner')
    expect(owner).toHaveDisplayValue('Former user (inactive)')
    await userEvent.selectOptions(owner, '')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(leads.updateLead).toHaveBeenCalledWith(
        'l1',
        expect.objectContaining({ ownerId: null }),
      ),
    )
  })

  it('says when the lead does not exist', async () => {
    vi.mocked(leads.getLead).mockRejectedValue(apiError(404, 'Lead not found'))
    renderAt('/leads/gone/edit')
    expect(await screen.findByText('Lead not found')).toBeInTheDocument()
  })

  it('is for roles with leads:write', () => {
    renderAt('/leads/l1/edit', ['leads:read'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(leads.getLead).not.toHaveBeenCalled()
  })
})
