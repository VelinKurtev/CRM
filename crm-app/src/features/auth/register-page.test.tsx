import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as authService from '@/services/auth'
import { useAuthStore } from '@/store/auth-store'
import { registerSchema } from './schemas'

vi.mock('@/services/auth')

const user = {
  id: '1',
  email: 'a@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  role: 'SUPPORT' as const,
}

function renderRegister() {
  const router = createMemoryRouter(routes, { initialEntries: ['/register'] })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

async function fill(overrides: Partial<Record<string, string>> = {}) {
  const v = {
    'First name': 'Ann',
    'Last name': 'Lee',
    Email: 'a@b.com',
    Password: 'Secret123',
    'Confirm password': 'Secret123',
    ...overrides,
  }
  for (const [label, value] of Object.entries(v)) {
    await userEvent.type(screen.getByLabelText(label), value)
  }
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, initialized: true })
  vi.resetAllMocks()
})

describe('registerSchema', () => {
  const ok = {
    firstName: 'A',
    lastName: 'B',
    email: 'a@b.com',
    password: 'Secret123',
    confirmPassword: 'Secret123',
  }
  it('accepts valid input', () => expect(registerSchema.safeParse(ok).success).toBe(true))
  it.each([
    ['short', 'Ab1'],
    ['no uppercase', 'secret123'],
    ['no lowercase', 'SECRET123'],
    ['no number', 'SecretSecret'],
  ])('rejects a password with %s', (_name, password) => {
    expect(registerSchema.safeParse({ ...ok, password, confirmPassword: password }).success).toBe(
      false,
    )
  })
})

describe('register page', () => {
  it('registers, stores the session and goes to the dashboard', async () => {
    vi.mocked(authService.register).mockResolvedValue({ token: 'jwt', user })
    const router = renderRegister()
    await fill()

    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
    expect(authService.register).toHaveBeenCalledWith({
      firstName: 'Ann',
      lastName: 'Lee',
      email: 'a@b.com',
      password: 'Secret123',
    })
    expect(useAuthStore.getState().token).toBe('jwt')
  })

  it('blocks submit when passwords differ', async () => {
    renderRegister()
    await fill({ 'Confirm password': 'Different1' })
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(authService.register).not.toHaveBeenCalled()
  })

  it('shows the duplicate-email error on the email field', async () => {
    const response = {
      status: 409,
      data: {
        error: {
          message: 'exists',
          details: { email: 'An account with this email already exists' },
        },
      },
    } as AxiosResponse
    vi.mocked(authService.register).mockRejectedValue(
      new AxiosError('conflict', '409', undefined, undefined, response),
    )
    const router = renderRegister()
    await fill()

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/register')
    expect(useAuthStore.getState().token).toBeNull()
  })
})
