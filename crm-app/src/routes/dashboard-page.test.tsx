import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as dashboard from '@/services/dashboard'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/dashboard')

const user = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: [] as string[],
  role: 'SALES' as const,
}

function renderDashboard() {
  const router = createMemoryRouter(routes, { initialEntries: ['/dashboard'] })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ token: 'jwt', user, initialized: true })
})

describe('DashboardPage', () => {
  it('shows sales overview, new leads and open deals', async () => {
    vi.mocked(dashboard.getDashboardSummary).mockResolvedValue({
      sales: { wonThisMonth: { revenue: 15000, deals: 1 }, wonLastMonthRevenue: 10000 },
      newLeads: { last7Days: 5, awaitingContact: 12 },
      openDeals: { count: 8, value: 96500 },
    })
    renderDashboard()

    expect(await screen.findByText('$15,000')).toBeInTheDocument()
    expect(screen.getByText(/Won this month from 1 deal · \+50% vs last month/)).toBeInTheDocument()
    expect(screen.getByText('New leads')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText(/12 awaiting contact/)).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('$96,500 in the pipeline')).toBeInTheDocument()
  })

  it('skips sections the role cannot read and the trend when there is no last month', async () => {
    vi.mocked(dashboard.getDashboardSummary).mockResolvedValue({
      sales: { wonThisMonth: { revenue: 0, deals: 0 }, wonLastMonthRevenue: 0 },
      newLeads: null,
      openDeals: { count: 0, value: 0 },
    })
    renderDashboard()

    expect(await screen.findByText('Sales overview')).toBeInTheDocument()
    expect(screen.queryByText('New leads')).not.toBeInTheDocument()
    expect(screen.getByText('Won this month from 0 deals')).toBeInTheDocument()
  })

  it('shows an error when the summary cannot be loaded', async () => {
    vi.mocked(dashboard.getDashboardSummary).mockRejectedValue(new Error('boom'))
    renderDashboard()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the dashboard')
  })
})

describe('Revenue chart', () => {
  const summary = { sales: null, newLeads: null, openDeals: null }
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    revenue: i === 10 ? 42000 : i * 1000,
    deals: i === 10 ? 3 : 1,
  }))
  const manager = { ...user, role: 'MANAGER' as const, permissions: ['reports:read'] }

  it('is hidden from roles without reports:read', async () => {
    vi.mocked(dashboard.getDashboardSummary).mockResolvedValue(summary)
    renderDashboard()
    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(screen.queryByText('Revenue')).not.toBeInTheDocument()
    expect(dashboard.getRevenueTrend).not.toHaveBeenCalled()
  })

  it('shows the trend and reads out a month by keyboard', async () => {
    useAuthStore.setState({ user: manager })
    vi.mocked(dashboard.getDashboardSummary).mockResolvedValue(summary)
    vi.mocked(dashboard.getRevenueTrend).mockResolvedValue(months)
    renderDashboard()

    const chart = await screen.findByRole('img', { name: /Monthly revenue won, last 12 months/ })
    expect(chart).toHaveAccessibleName(/Latest month \$11,000/)
    chart.focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(await screen.findByRole('status')).toHaveTextContent('December 2026')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    const tip = screen.getByRole('status')
    expect(tip).toHaveTextContent('October 2026')
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('status')).toHaveTextContent('November 2026')
    expect(screen.getByRole('status')).toHaveTextContent('$42,000')
    expect(screen.getByRole('status')).toHaveTextContent('3 deals won')
  })

  it('offers the same numbers as a table', async () => {
    useAuthStore.setState({ user: manager })
    vi.mocked(dashboard.getDashboardSummary).mockResolvedValue(summary)
    vi.mocked(dashboard.getRevenueTrend).mockResolvedValue(months)
    renderDashboard()

    await userEvent.click(await screen.findByRole('button', { name: 'Show table' }))
    expect(screen.getByRole('cell', { name: 'November 2026' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '$42,000' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show chart' }))
    expect(screen.getByRole('img', { name: /Monthly revenue won/ })).toBeInTheDocument()
  })

  it('shows an empty state when nothing has been won', async () => {
    useAuthStore.setState({ user: manager })
    vi.mocked(dashboard.getDashboardSummary).mockResolvedValue(summary)
    vi.mocked(dashboard.getRevenueTrend).mockResolvedValue(
      months.map((m) => ({ ...m, revenue: 0, deals: 0 })),
    )
    renderDashboard()
    expect(await screen.findByText('No revenue yet')).toBeInTheDocument()
  })
})
