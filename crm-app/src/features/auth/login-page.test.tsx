import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as authService from '@/services/auth'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/auth')

const user = {
  id: '1',
  email: 'a@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  role: 'SALES' as const,
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  useAuthStore.getState().logout()
  vi.resetAllMocks()
})

describe('login', () => {
  it('redirects to the dashboard and stores the token on success', async () => {
    vi.mocked(authService.login).mockResolvedValue({ token: 'jwt', user })
    const router = renderAt('/login')

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
    expect(authService.login).toHaveBeenCalledWith('a@b.com', 'secret')
    expect(useAuthStore.getState().token).toBe('jwt')
    expect(await screen.findByText(/Welcome, Ann Lee/)).toBeInTheDocument()
  })

  it('shows an error for invalid credentials and stays on the page', async () => {
    vi.mocked(authService.login).mockRejectedValue(new Error('401'))
    const router = renderAt('/login')

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('validates required fields without calling the API', async () => {
    renderAt('/login')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    expect(authService.login).not.toHaveBeenCalled()
  })

  it('protects the dashboard when logged out', async () => {
    const router = renderAt('/dashboard')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})
