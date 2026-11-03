import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as authService from '@/services/auth'

vi.mock('@/services/auth')
vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn() },
}))

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

beforeEach(() => vi.resetAllMocks())

describe('forgot password', () => {
  it('is reachable from the login page', async () => {
    const router = renderAt('/login')
    await userEvent.click(screen.getByRole('link', { name: 'Forgot password?' }))
    expect(router.state.location.pathname).toBe('/forgot-password')
  })

  it('sends the email and shows the confirmation', async () => {
    vi.mocked(authService.forgotPassword).mockResolvedValue({ message: 'Link sent' })
    renderAt('/forgot-password')
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Link sent')
    expect(authService.forgotPassword).toHaveBeenCalledWith('a@b.com')
  })

  it('validates the email', async () => {
    renderAt('/forgot-password')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    expect(authService.forgotPassword).not.toHaveBeenCalled()
  })
})

describe('reset password', () => {
  it('asks for a new link when the token is missing', () => {
    renderAt('/reset-password')
    expect(screen.getByText('Invalid reset link')).toBeInTheDocument()
  })

  it('submits the token and new password, then goes to login', async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue({ message: 'Password updated' })
    const router = renderAt('/reset-password?token=abc123')
    await userEvent.type(screen.getByLabelText('New password'), 'NewPass456')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'NewPass456')
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(authService.resetPassword).toHaveBeenCalledWith('abc123', 'NewPass456')
  })

  it('blocks mismatched passwords', async () => {
    renderAt('/reset-password?token=abc123')
    await userEvent.type(screen.getByLabelText('New password'), 'NewPass456')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Different1')
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(authService.resetPassword).not.toHaveBeenCalled()
  })

  it('shows an error for an invalid or expired link', async () => {
    vi.mocked(authService.resetPassword).mockRejectedValue(new Error('400'))
    renderAt('/reset-password?token=old')
    await userEvent.type(screen.getByLabelText('New password'), 'NewPass456')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'NewPass456')
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument()
  })
})
