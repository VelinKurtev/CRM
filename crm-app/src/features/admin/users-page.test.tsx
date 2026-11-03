import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as users from '@/services/users'
import { useAuthStore } from '@/store/auth-store'
import type { AuthUser } from '@/types/auth'
import { groupPermissions } from './roles'

vi.mock('@/services/users')
vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}))

const base = { avatarUrl: null, lastName: 'Lee' }
const admin: AuthUser = {
  ...base,
  id: 'a1',
  email: 'admin@x.com',
  firstName: 'Ada',
  role: 'ADMIN',
  permissions: ['users:manage', 'users:read'],
}
const sales: AuthUser = {
  ...base,
  id: 's1',
  email: 'sam@x.com',
  firstName: 'Sam',
  role: 'SALES',
  permissions: ['contacts:read'],
}
const managed = (u: AuthUser) => ({ ...u, isActive: true, createdAt: '2026-01-01' })

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
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
  vi.mocked(users.listUsers).mockResolvedValue({
    users: [managed(admin), managed(sales)],
    total: 2,
    page: 1,
    pageSize: 10,
  })
  vi.mocked(users.listRoles).mockResolvedValue([
    { name: 'ADMIN', permissions: ['contacts:read', 'contacts:write'] },
    { name: 'SALES', permissions: ['contacts:read'] },
  ])
})

describe('permission gating', () => {
  it('shows "Access denied" on the admin page to roles without users:manage', async () => {
    useAuthStore.setState({ token: 't', user: sales, initialized: true })
    renderAt('/admin/users')
    expect(await screen.findByText('Access denied')).toBeInTheDocument()
    expect(users.listUsers).not.toHaveBeenCalled()
  })

  it('still sends anonymous visitors to login', async () => {
    useAuthStore.setState({ token: null, user: null, initialized: true })
    const router = renderAt('/admin/users')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('hides the Users & roles sidebar link from roles without users:manage', () => {
    useAuthStore.setState({ token: 't', user: sales, initialized: true })
    renderAt('/dashboard')
    expect(screen.queryByRole('link', { name: 'Users & roles' })).not.toBeInTheDocument()
  })

  it('shows the Users & roles sidebar link to admins', () => {
    useAuthStore.setState({ token: 't', user: admin, initialized: true })
    renderAt('/dashboard')
    expect(screen.getByRole('link', { name: 'Users & roles' })).toBeInTheDocument()
  })
})

describe('users page', () => {
  beforeEach(() => useAuthStore.setState({ token: 't', user: admin, initialized: true }))

  it('lists users and disables changing your own role', async () => {
    renderAt('/admin/users')
    expect(await screen.findByText('sam@x.com')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Role for Ada Lee' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Role for Sam Lee' })).toBeEnabled()
  })

  it('assigns a new role to another user', async () => {
    vi.mocked(users.assignRole).mockResolvedValue(managed({ ...sales, role: 'MANAGER' }))
    renderAt('/admin/users')
    await userEvent.click(await screen.findByRole('combobox', { name: 'Role for Sam Lee' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Manager' }))

    await waitFor(() => expect(users.assignRole).toHaveBeenCalledWith('s1', 'MANAGER'))
  })

  it('shows each role’s permissions on the Roles tab', async () => {
    renderAt('/admin/users')
    await userEvent.click(await screen.findByRole('tab', { name: /roles/i }))
    const card = (
      await screen.findByText('Admin', { selector: '[data-slot="card-title"]' })
    ).closest('[data-slot="card"]') as HTMLElement
    expect(within(card).getByText('write')).toBeInTheDocument()
  })
})

describe('groupPermissions', () => {
  it('groups actions by resource', () => {
    expect(groupPermissions(['contacts:read', 'contacts:write', 'reports:read'])).toEqual({
      contacts: ['read', 'write'],
      reports: ['read'],
    })
  })
})
