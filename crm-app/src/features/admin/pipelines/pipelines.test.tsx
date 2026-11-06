import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as svc from '@/services/pipelines'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/pipelines')

const admin = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['settings:manage', 'users:manage', 'deals:read'],
  role: 'ADMIN' as const,
}

const stage = (
  id: string,
  name: string,
  position: number,
  probability: number,
  dealCount: number,
  kind: 'open' | 'won' | 'lost' = 'open',
): svc.ManagedStage => ({
  id,
  name,
  position,
  probability,
  dealCount,
  isWon: kind === 'won',
  isLost: kind === 'lost',
})

const sales = (): svc.ManagedPipeline => ({
  id: 'p1',
  name: 'Sales pipeline',
  isDefault: true,
  dealCount: 5,
  stages: [
    stage('a', 'Qualification', 1, 10, 3),
    stage('b', 'Proposal', 2, 40, 2),
    stage('c', 'Closed won', 3, 100, 0, 'won'),
    stage('d', 'Closed lost', 4, 0, 0, 'lost'),
  ],
})
const partners = (): svc.ManagedPipeline => ({
  id: 'p2',
  name: 'Partners',
  isDefault: false,
  dealCount: 0,
  stages: [stage('x', 'Intro', 1, 20, 0), stage('y', 'Signed', 2, 100, 0, 'won')],
})

function renderAt(url = '/admin/pipelines', permissions = admin.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...admin, permissions }, initialized: true })
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

const rows = () => within(screen.getByRole('list', { name: /Stages of/ })).getAllByRole('listitem')
const row = (name: string) => rows().find((r) => within(r).queryByText(name))!

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(svc.listManagedPipelines).mockResolvedValue([sales(), partners()])
})

describe('Pipelines page', () => {
  it('lists the default pipeline’s stages in order, with type, probability and deals', async () => {
    renderAt()
    await screen.findByRole('list', { name: 'Stages of Sales pipeline' })
    expect(rows().map((r) => r.querySelector('p')!.textContent)).toEqual([
      'Qualification',
      'Proposal',
      'Closed won',
      'Closed lost',
    ])
    expect(within(row('Qualification')).getByText('10% · 3 deals')).toBeInTheDocument()
    expect(within(row('Qualification')).getByText('Open')).toBeInTheDocument()
    expect(within(row('Proposal')).getByText('40% · 2 deals')).toBeInTheDocument()
    expect(within(row('Closed won')).getByText('100% · no deals')).toBeInTheDocument()
    expect(within(row('Closed won')).getByText('Won')).toBeInTheDocument()
    expect(within(row('Closed lost')).getByText('Lost')).toBeInTheDocument()
    expect(screen.getByLabelText('Pipeline')).toHaveDisplayValue('Sales pipeline (default)')
    expect(screen.getByText('5 deals')).toBeInTheDocument()
  })

  it('is in the sidebar for admins, and for them only', async () => {
    renderAt()
    await screen.findByRole('list', { name: /Stages of/ })
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]
    expect(within(nav).getByRole('link', { name: 'Pipelines' })).toHaveAttribute(
      'href',
      '/admin/pipelines',
    )
  })

  it('denies access without settings:manage', () => {
    renderAt('/admin/pipelines', ['users:manage', 'deals:read'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(svc.listManagedPipelines).not.toHaveBeenCalled()
  })

  it('switches between pipelines', async () => {
    renderAt()
    await screen.findByRole('list', { name: 'Stages of Sales pipeline' })
    await userEvent.selectOptions(screen.getByLabelText('Pipeline'), 'p2')
    expect(await screen.findByRole('list', { name: 'Stages of Partners' })).toBeInTheDocument()
    expect(rows()).toHaveLength(2)
    expect(screen.queryByText('Default')).not.toBeInTheDocument()
  })

  it('shows an error if the pipelines cannot be loaded', async () => {
    vi.mocked(svc.listManagedPipelines).mockRejectedValue(new Error('boom'))
    renderAt()
    expect(await screen.findByText('Could not load the pipelines')).toBeInTheDocument()
  })
})

describe('Pipelines', () => {
  it('creates a pipeline and shows it', async () => {
    vi.mocked(svc.createPipeline).mockResolvedValue({ ...partners(), id: 'p3', name: 'Renewals' })
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /New pipeline/ }))
    await userEvent.type(await screen.findByLabelText('Pipeline name'), '  Renewals ')
    await userEvent.click(screen.getByRole('button', { name: 'Create pipeline' }))
    await waitFor(() => expect(svc.createPipeline).toHaveBeenCalledWith('Renewals'))
  })

  it('shows a name that is taken in the dialog', async () => {
    vi.mocked(svc.createPipeline).mockRejectedValue(
      apiError(409, 'A pipeline with this name already exists', {
        name: 'A pipeline with this name already exists',
      }),
    )
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /New pipeline/ }))
    await userEvent.type(await screen.findByLabelText('Pipeline name'), 'Partners')
    await userEvent.click(screen.getByRole('button', { name: 'Create pipeline' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
  })

  it('needs a name before it can be created', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /New pipeline/ }))
    expect(await screen.findByRole('button', { name: 'Create pipeline' })).toBeDisabled()
  })

  it('renames the pipeline', async () => {
    vi.mocked(svc.renamePipeline).mockResolvedValue({ ...sales(), name: 'Main' })
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /Rename/ }))
    const input = await screen.findByLabelText('Pipeline name')
    expect(input).toHaveValue('Sales pipeline')
    await userEvent.clear(input)
    await userEvent.type(input, 'Main')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(svc.renamePipeline).toHaveBeenCalledWith('p1', 'Main'))
  })

  it('makes another pipeline the default; the default has no such button', async () => {
    vi.mocked(svc.makeDefaultPipeline).mockResolvedValue({ ...partners(), isDefault: true })
    renderAt()
    await screen.findByRole('list', { name: /Stages of/ })
    expect(screen.queryByRole('button', { name: /Make default/ })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Pipeline'), 'p2')
    await userEvent.click(await screen.findByRole('button', { name: /Make default/ }))
    await waitFor(() => expect(svc.makeDefaultPipeline).toHaveBeenCalledWith('p2'))
  })

  it('deletes an empty pipeline after asking, but not the default or one with deals', async () => {
    vi.mocked(svc.deletePipeline).mockResolvedValue(undefined)
    renderAt()
    await screen.findByRole('list', { name: /Stages of/ })
    // The default pipeline, which also has deals.
    expect(screen.getByRole('button', { name: /^Delete$/ })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Pipeline'), 'p2')
    await userEvent.click(await screen.findByRole('button', { name: /^Delete$/ }))
    expect(await screen.findByText('Delete this pipeline?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep pipeline' }))
    expect(svc.deletePipeline).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /^Delete$/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete pipeline' }))
    await waitFor(() => expect(svc.deletePipeline).toHaveBeenCalledWith('p2'))
  })
})

describe('Stages', () => {
  it('adds an open stage with its probability', async () => {
    vi.mocked(svc.addStage).mockResolvedValue(sales())
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /Add stage/ }))
    await userEvent.type(await screen.findByLabelText('Stage name'), 'Demo')
    const probability = screen.getByLabelText('Probability of winning (%)')
    await userEvent.clear(probability)
    await userEvent.type(probability, '55')
    await userEvent.click(screen.getByRole('button', { name: 'Add stage' }))
    await waitFor(() =>
      expect(svc.addStage).toHaveBeenCalledWith('p1', {
        name: 'Demo',
        kind: 'open',
        probability: 55,
      }),
    )
  })

  it('adds a won stage, whose probability is fixed', async () => {
    vi.mocked(svc.addStage).mockResolvedValue(sales())
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /Add stage/ }))
    await userEvent.type(await screen.findByLabelText('Stage name'), 'Renewed')
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'won')
    expect(screen.getByLabelText('Probability of winning (%)')).toBeDisabled()
    expect(screen.getByLabelText('Probability of winning (%)')).toHaveValue('100')
    await userEvent.click(screen.getByRole('button', { name: 'Add stage' }))
    await waitFor(() =>
      expect(svc.addStage).toHaveBeenCalledWith('p1', { name: 'Renewed', kind: 'won' }),
    )
  })

  it('checks the name and probability before sending', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /Add stage/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add stage' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required')
    await userEvent.type(screen.getByLabelText('Stage name'), 'X')
    await userEvent.clear(screen.getByLabelText('Probability of winning (%)'))
    await userEvent.type(screen.getByLabelText('Probability of winning (%)'), '150')
    await userEvent.click(screen.getByRole('button', { name: 'Add stage' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot be above 100')
    expect(svc.addStage).not.toHaveBeenCalled()
  })

  it('shows what the server says about a stage name', async () => {
    vi.mocked(svc.addStage).mockRejectedValue(
      apiError(409, 'taken', { name: 'This pipeline already has a stage with this name' }),
    )
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: /Add stage/ }))
    await userEvent.type(await screen.findByLabelText('Stage name'), 'Proposal')
    await userEvent.click(screen.getByRole('button', { name: 'Add stage' }))
    expect(
      await screen.findByText('This pipeline already has a stage with this name'),
    ).toBeInTheDocument()
  })

  it('edits a stage, starting from what it is now', async () => {
    vi.mocked(svc.updateStage).mockResolvedValue(sales())
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Proposal' }))
    const name = await screen.findByLabelText('Stage name')
    expect(name).toHaveValue('Proposal')
    expect(screen.getByLabelText('Type')).toHaveValue('open')
    expect(screen.getByLabelText('Probability of winning (%)')).toHaveValue('40')
    await userEvent.clear(name)
    await userEvent.type(name, 'Quote sent')
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'lost')
    await userEvent.click(screen.getByRole('button', { name: 'Save stage' }))
    await waitFor(() =>
      expect(svc.updateStage).toHaveBeenCalledWith('p1', 'b', { name: 'Quote sent', kind: 'lost' }),
    )
  })

  it('keeps the first stage open', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Qualification' }))
    await screen.findByLabelText('Stage name')
    expect(screen.getByRole('option', { name: 'Won' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Lost' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Open' })).toBeEnabled()
  })

  it('moves a stage up or down by swapping it with its neighbour', async () => {
    vi.mocked(svc.reorderStages).mockResolvedValue(sales())
    renderAt()
    await screen.findByRole('list', { name: /Stages of/ })
    await userEvent.click(screen.getByRole('button', { name: 'Move Proposal up' }))
    await waitFor(() => expect(svc.reorderStages).toHaveBeenCalledWith('p1', ['b', 'a', 'c', 'd']))
    await userEvent.click(screen.getByRole('button', { name: 'Move Closed lost up' }))
    await waitFor(() =>
      expect(svc.reorderStages).toHaveBeenLastCalledWith('p1', ['a', 'b', 'd', 'c']),
    )
  })

  it('does not offer moves that would go off the ends or put a closed stage first', async () => {
    renderAt()
    await screen.findByRole('list', { name: /Stages of/ })
    expect(screen.getByRole('button', { name: 'Move Qualification up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Closed lost down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Qualification down' })).toBeEnabled()
    // Only a closed stage second would come first.
    await userEvent.selectOptions(screen.getByLabelText('Pipeline'), 'p2')
    await screen.findByRole('list', { name: 'Stages of Partners' })
    expect(screen.getByRole('button', { name: 'Move Intro down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Signed up' })).toBeDisabled()
  })

  it('deletes an empty stage after asking', async () => {
    vi.mocked(svc.deleteStage).mockResolvedValue(undefined)
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Closed won' }))
    expect(await screen.findByText('Delete this stage?')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Move its/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete stage' }))
    await waitFor(() => expect(svc.deleteStage).toHaveBeenCalledWith('p1', 'c', undefined))
  })

  it('makes you choose where a stage’s deals go before it can be deleted', async () => {
    vi.mocked(svc.deleteStage).mockResolvedValue(undefined)
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Qualification' }))
    const target = await screen.findByLabelText('Move its 3 deals to')
    const confirm = screen.getByRole('button', { name: 'Delete stage' })
    expect(confirm).toBeDisabled()
    // Not itself, and each says what it would make of the deals.
    expect(within(target).queryByRole('option', { name: /^Qualification/ })).not.toBeInTheDocument()
    expect(within(target).getByRole('option', { name: 'Closed won (Won)' })).toBeInTheDocument()

    await userEvent.selectOptions(target, 'b')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    await waitFor(() => expect(svc.deleteStage).toHaveBeenCalledWith('p1', 'a', 'b'))
  })

  it('shows why a stage could not be deleted', async () => {
    vi.mocked(svc.deleteStage).mockRejectedValue(
      apiError(
        409,
        'The first stage must stay open: new deals start there. Put an open stage first.',
      ),
    )
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Closed lost' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete stage' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('first stage must stay open')
  })

  it('cannot delete a pipeline’s only stage', async () => {
    vi.mocked(svc.listManagedPipelines).mockResolvedValue([
      { ...sales(), stages: [stage('a', 'Only', 1, 10, 0)] },
    ])
    renderAt()
    expect(await screen.findByRole('button', { name: 'Delete Only' })).toBeDisabled()
  })
})
