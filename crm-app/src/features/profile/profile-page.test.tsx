import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as authService from '@/services/auth'
import { useAuthStore } from '@/store/auth-store'
import { profileSchema } from './schemas'

vi.mock('@/services/auth')

const user = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: [] as string[],
  role: 'SALES' as const,
}

function renderProfile() {
  const router = createMemoryRouter(routes, { initialEntries: ['/profile'] })
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
  vi.resetAllMocks()
  useAuthStore.setState({ token: 'jwt', user, initialized: true })
})

describe('profileSchema', () => {
  it('allows an empty avatar and http(s) URLs only', () => {
    const base = { firstName: 'A', lastName: 'B' }
    expect(profileSchema.safeParse({ ...base, avatarUrl: '' }).success).toBe(true)
    expect(profileSchema.safeParse({ ...base, avatarUrl: 'https://x.io/a.png' }).success).toBe(true)
    expect(profileSchema.safeParse({ ...base, avatarUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    )
  })
})

describe('profile page', () => {
  it('is protected', async () => {
    useAuthStore.setState({ token: null, user: null, initialized: true })
    const router = renderProfile()
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('shows the current details, with email read-only', () => {
    renderProfile()
    expect(screen.getByLabelText('First name')).toHaveValue('Ann')
    expect(screen.getByLabelText('Last name')).toHaveValue('Lee')
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Email')).toHaveValue('ann@b.com')
    expect(screen.getByText('SALES')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('saves changes and updates the session user', async () => {
    vi.mocked(authService.updateProfile).mockResolvedValue({ ...user, firstName: 'Grace' })
    renderProfile()

    const first = screen.getByLabelText('First name')
    await userEvent.clear(first)
    await userEvent.type(first, 'Grace')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(useAuthStore.getState().user?.firstName).toBe('Grace'))
    expect(authService.updateProfile).toHaveBeenCalledWith({
      firstName: 'Grace',
      lastName: 'Lee',
      avatarUrl: '',
    })
    expect(useAuthStore.getState().token).toBe('jwt')
  })

  it('validates before calling the API', async () => {
    renderProfile()
    await userEvent.clear(screen.getByLabelText('First name'))
    await userEvent.type(screen.getByLabelText('Avatar URL'), 'not a url')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('First name is required')).toBeInTheDocument()
    expect(authService.updateProfile).not.toHaveBeenCalled()
  })

  it('shows server field errors', async () => {
    const response = {
      status: 400,
      data: { error: { message: 'Validation failed', details: { lastName: 'Too long' } } },
    } as AxiosResponse
    vi.mocked(authService.updateProfile).mockRejectedValue(
      new AxiosError('bad', '400', undefined, undefined, response),
    )
    renderProfile()
    await userEvent.type(screen.getByLabelText('Last name'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Too long')).toBeInTheDocument()
  })
})
