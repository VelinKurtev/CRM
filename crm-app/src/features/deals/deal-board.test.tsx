import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as deals from '@/services/deals'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/deals')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from 'sonner'

const sales = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['deals:read', 'deals:write'],
  role: 'SALES' as const,
}

const deal = (id: string, title: string, stage: { id: string; name: string }, extra = {}) =>
  ({
    id,
    title,
    amount: 1000,
    currency: 'USD',
    status: 'OPEN',
    probability: 10,
    expectedClose: null,
    closedAt: null,
    pipelineId: 'p1',
    stage,
    company: null,
    contact: null,
    owner: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    ...extra,
  }) as deals.Deal

const LEAD = { id: 's1', name: 'Lead in' }
const PITCH = { id: 's2', name: 'Pitch' }
const stageBase = { position: 1, probability: 10, isWon: false, isLost: false }

const makeBoard = (): deals.Board => ({
  pipeline: { id: 'p1', name: 'Sales pipeline' },
  stages: [
    {
      ...stageBase,
      ...LEAD,
      count: 2,
      value: 3000,
      deals: [
        deal('d1', 'Website redesign', LEAD, {
          amount: 2000,
          company: { id: 'c1', name: 'Acme' },
          expectedClose: '2027-03-31T23:59:59.999Z',
        }),
        deal('d2', 'Cold deal', LEAD, { contact: { id: 'ct', firstName: 'Cy', lastName: 'Dole' } }),
      ],
    },
    { ...stageBase, ...PITCH, position: 2, probability: 60, count: 0, value: 0, deals: [] },
    {
      ...stageBase,
      id: 's3',
      name: 'Closed won',
      position: 3,
      probability: 100,
      isWon: true,
      count: 120,
      value: 90000,
      deals: [deal('d3', 'Signed deal', { id: 's3', name: 'Closed won' }, { status: 'WON' })],
    },
  ],
})

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

const column = (name: string) => screen.getByRole('region', { name })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(deals.listPipelines).mockResolvedValue([
    {
      id: 'p1',
      name: 'Sales pipeline',
      isDefault: true,
      stages: makeBoard().stages.map(({ count: _c, value: _v, deals: _d, ...s }) => s),
    },
  ])
  vi.mocked(deals.getBoard).mockImplementation(async () => makeBoard())
  vi.mocked(deals.listDeals).mockResolvedValue({ deals: [], total: 0, page: 1, pageSize: 20 })
})

describe('Deal board', () => {
  it('has a column per stage, in order, with how many deals and their value', async () => {
    renderAt('/deals/board')
    await screen.findByText('Website redesign')
    expect(
      screen.getAllByRole('region').map((r) => within(r).getByRole('heading').textContent),
    ).toEqual(['Lead in', 'Pitch', 'Closed won'])
    expect(column('Lead in')).toHaveTextContent('2 · $3,000')
    expect(column('Pitch')).toHaveTextContent('0 · $0')
    expect(within(column('Pitch')).getByText('No deals')).toBeInTheDocument()
    expect(column('Closed won')).toHaveTextContent('120 · $90,000')
  })

  it('shows each card’s customer, value, probability and closing date', async () => {
    renderAt('/deals/board')
    const card = (await screen.findByText('Website redesign')).closest('li')!
    expect(within(card).getByText('Acme')).toBeInTheDocument()
    expect(within(card).getByText('$2,000')).toBeInTheDocument()
    expect(within(card).getByText('10%')).toBeInTheDocument()
    expect(within(card).getByText('Mar 31, 2027')).toBeInTheDocument()
    // A contact stands in when there is no company.
    expect(
      within(screen.getByText('Cold deal').closest('li')!).getByText('Cy Dole'),
    ).toBeInTheDocument()
  })

  it('says when a column shows only the latest of many', async () => {
    renderAt('/deals/board')
    await screen.findByText('Signed deal')
    expect(
      within(column('Closed won')).getByText('Showing the latest 1 of 120'),
    ).toBeInTheDocument()
    expect(within(column('Lead in')).queryByText(/Showing the latest/)).not.toBeInTheDocument()
  })

  it('is reached from the list, and goes back to it', async () => {
    const router = renderAt('/deals')
    await userEvent.click(await screen.findByRole('link', { name: 'Board' }))
    await screen.findByText('Website redesign')
    expect(router.state.location.pathname).toBe('/deals/board')
    await userEvent.click(screen.getByRole('link', { name: 'List' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/deals'))
  })

  it('denies access without deals:read', () => {
    renderAt('/deals/board', [])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(deals.getBoard).not.toHaveBeenCalled()
  })

  it('loads the default pipeline’s board', async () => {
    renderAt('/deals/board')
    await screen.findByText('Website redesign')
    expect(deals.getBoard).toHaveBeenCalledWith('p1')
  })

  it('lets you choose between pipelines when there are several', async () => {
    vi.mocked(deals.listPipelines).mockResolvedValue([
      { id: 'p1', name: 'Sales pipeline', isDefault: true, stages: [] },
      { id: 'p2', name: 'Partners', isDefault: false, stages: [] },
    ])
    renderAt('/deals/board')
    await screen.findByText('Website redesign')
    await userEvent.selectOptions(screen.getByLabelText('Pipeline'), 'p2')
    await waitFor(() => expect(deals.getBoard).toHaveBeenCalledWith('p2'))
  })

  it('shows an error if the board cannot be loaded', async () => {
    vi.mocked(deals.getBoard).mockRejectedValue(new Error('boom'))
    renderAt('/deals/board')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the board')
  })
})

describe('Moving a deal', () => {
  const moveTo = async (title: string, stageId: string) =>
    userEvent.selectOptions(await screen.findByLabelText(`Move ${title} to`), stageId)

  it('shows the card in the new column at once, then keeps it once the server agrees', async () => {
    let finish!: (d: deals.Deal) => void
    vi.mocked(deals.moveDeal).mockReturnValue(new Promise((r) => (finish = r)))
    renderAt('/deals/board')
    await moveTo('Website redesign', 's2')

    expect(deals.moveDeal).toHaveBeenCalledWith('d1', 's2')
    // Before the server has answered.
    expect(within(column('Pitch')).getByText('Website redesign')).toBeInTheDocument()
    expect(within(column('Lead in')).queryByText('Website redesign')).not.toBeInTheDocument()
    expect(column('Pitch')).toHaveTextContent('1 · $2,000')
    expect(column('Lead in')).toHaveTextContent('1 · $1,000')
    // The new stage's probability, as the server will give it.
    expect(
      within(within(column('Pitch')).getByText('Website redesign').closest('li')!).getByText('60%'),
    ).toBeInTheDocument()

    finish(deal('d1', 'Website redesign', PITCH))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Website redesign moved to Pitch'),
    )
  })

  it('puts the card back and says so if the move is refused', async () => {
    vi.mocked(deals.moveDeal).mockRejectedValue(
      new AxiosError('bad', '400', undefined, undefined, {
        status: 400,
        data: { error: { message: 'Choose a stage from this deal’s pipeline' } },
      } as AxiosResponse),
    )
    renderAt('/deals/board')
    await moveTo('Website redesign', 's2')
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Choose a stage from this deal’s pipeline'),
    )
    await waitFor(() =>
      expect(within(column('Lead in')).getByText('Website redesign')).toBeInTheDocument(),
    )
    expect(within(column('Pitch')).queryByText('Website redesign')).not.toBeInTheDocument()
    expect(column('Lead in')).toHaveTextContent('2 · $3,000')
  })

  it('refreshes the board from the server afterwards', async () => {
    vi.mocked(deals.moveDeal).mockResolvedValue(deal('d1', 'Website redesign', PITCH))
    renderAt('/deals/board')
    await moveTo('Website redesign', 's2')
    await waitFor(() => expect(deals.getBoard).toHaveBeenCalledTimes(2))
  })

  it('moves a deal into a won column too, as won', async () => {
    // Left unanswered, so the board still shows the move rather than the mock's fixed data.
    vi.mocked(deals.moveDeal).mockReturnValue(new Promise(() => {}))
    renderAt('/deals/board')
    await moveTo('Cold deal', 's3')
    await waitFor(() => expect(deals.moveDeal).toHaveBeenCalledWith('d2', 's3'))
    const moved = within(column('Closed won')).getByText('Cold deal').closest('li')!
    expect(within(moved).getByText('100%')).toBeInTheDocument()
    expect(column('Closed won')).toHaveTextContent('121 · $91,000')
  })

  it('moves a deal when it is dragged to another column with the keyboard', async () => {
    // jsdom has no layout, so lay the columns out by hand: 300px wide, side by side. A card's
    // rectangle is wherever its column is.
    const rect = (x: number, w: number) =>
      ({
        x,
        y: 0,
        left: x,
        top: 0,
        width: w,
        height: 400,
        right: x + w,
        bottom: 400,
        toJSON() {},
      }) as DOMRect
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const region = this.closest('section[aria-label]')
      const column = region
        ? Array.from(document.querySelectorAll('section[aria-label]')).indexOf(region)
        : -1
      if (column >= 0)
        return this.tagName === 'SECTION' || this.tagName === 'UL'
          ? rect(column * 300, 300)
          : rect(column * 300 + 10, 280)
      // The card that follows the pointer is outside every column; it starts over the first.
      return rect(10, 280)
    })
    try {
      vi.mocked(deals.moveDeal).mockReturnValue(new Promise(() => {}))
      renderAt('/deals/board')
      const handle = await screen.findByRole('button', { name: 'Drag Website redesign' })
      handle.focus()
      fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
      const pause = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)))
      // dnd-kit starts listening for the arrow keys a moment after the card is picked up...
      await pause(20)
      // ...each press moves it 25px, so twelve carry it past halfway into the next column...
      for (let i = 0; i < 12; i++) {
        fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' })
      }
      // ...and it measures where the columns are a moment after that.
      await pause(50)
      fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' })
      await pause(50)
      fireEvent.keyDown(document, { code: 'Space', key: ' ' })
      await waitFor(() => expect(deals.moveDeal).toHaveBeenCalledWith('d1', 's2'))
    } finally {
      spy.mockRestore()
    }
  })

  it('has no way to move or drag a deal for read-only roles', async () => {
    renderAt('/deals/board', ['deals:read'])
    await screen.findByText('Website redesign')
    expect(screen.queryByLabelText(/^Move /)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /New deal/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Website redesign' })).not.toBeInTheDocument()
  })

  it('offers each card a handle for keyboard dragging, and a link to edit it', async () => {
    renderAt('/deals/board')
    const card = (await screen.findByText('Website redesign')).closest('li')!
    expect(within(card).getByRole('button', { name: 'Drag Website redesign' })).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Website redesign' })).toHaveAttribute(
      'href',
      '/deals/d1/edit',
    )
  })
})
