import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { useAuthStore } from '@/store/auth-store'
import { ProtectedRoute } from './protected-route'

const user = {
  id: '1',
  email: 'a@b.com',
  firstName: 'A',
  lastName: 'B',
  avatarUrl: null,
  role: 'SALES' as const,
}

function renderGuard() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>login page</p> },
      { element: <ProtectedRoute />, children: [{ path: '/secret', element: <p>secret</p> }] },
    ],
    { initialEntries: ['/secret'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('ProtectedRoute', () => {
  it('shows a loading state, not the login page, until the session check finishes', () => {
    useAuthStore.setState({ token: null, user: null, initialized: false })
    const router = renderGuard()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/secret')
  })

  it('redirects unauthenticated users to login, remembering where they were going', async () => {
    useAuthStore.setState({ token: null, user: null, initialized: true })
    const router = renderGuard()
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ from: '/secret' })
  })

  it('renders the page for authenticated users', () => {
    useAuthStore.setState({ token: 't', user, initialized: true })
    renderGuard()
    expect(screen.getByText('secret')).toBeInTheDocument()
  })

  it('redirects as soon as the session is lost', async () => {
    useAuthStore.setState({ token: 't', user, initialized: true })
    renderGuard()
    act(() => useAuthStore.getState().clearSession())
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('lets the user in once the silent refresh succeeds', async () => {
    useAuthStore.setState({ token: null, user: null, initialized: false })
    renderGuard()
    act(() => {
      useAuthStore.getState().setSession('t', user)
      useAuthStore.getState().setInitialized()
    })
    expect(await screen.findByText('secret')).toBeInTheDocument()
  })
})
