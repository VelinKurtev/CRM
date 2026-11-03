import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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
