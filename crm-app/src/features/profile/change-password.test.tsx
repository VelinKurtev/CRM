import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { vi } from 'vitest'

import * as authService from '@/services/auth'
import { useAuthStore } from '@/store/auth-store'
import { ChangePasswordCard } from './change-password-card'
import { changePasswordSchema } from './schemas'

vi.mock('@/services/auth')

const user = {
  id: '1',
  email: 'a@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  role: 'SALES' as const,
}

function renderCard() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <ChangePasswordCard />
    </QueryClientProvider>,
  )
}

async function fill(current = 'OldPass123', next = 'NewPass456', confirm = next) {
  await userEvent.type(screen.getByLabelText('Current password'), current)
  await userEvent.type(screen.getByLabelText('New password'), next)
  await userEvent.type(screen.getByLabelText('Confirm new password'), confirm)
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ token: 'old-jwt', user, initialized: true })
})

describe('changePasswordSchema', () => {
  const ok = {
    currentPassword: 'OldPass123',
    newPassword: 'NewPass456',
    confirmPassword: 'NewPass456',
  }
  it('accepts valid input', () => expect(changePasswordSchema.safeParse(ok).success).toBe(true))
  it('rejects an unchanged password', () =>
    expect(
      changePasswordSchema.safeParse({
        ...ok,
        newPassword: 'OldPass123',
        confirmPassword: 'OldPass123',
      }).success,
    ).toBe(false))
  it('rejects a weak new password', () =>
    expect(
      changePasswordSchema.safeParse({ ...ok, newPassword: 'weak', confirmPassword: 'weak' })
        .success,
    ).toBe(false))
})

describe('ChangePasswordCard', () => {
  it('changes the password, swaps in the fresh token and clears the form', async () => {
    vi.mocked(authService.changePassword).mockResolvedValue({ token: 'new-jwt', user })
    renderCard()
    await fill()

    await waitFor(() => expect(useAuthStore.getState().token).toBe('new-jwt'))
    expect(authService.changePassword).toHaveBeenCalledWith('OldPass123', 'NewPass456')
    await waitFor(() => expect(screen.getByLabelText('Current password')).toHaveValue(''))
  })

  it('blocks mismatched passwords without calling the API', async () => {
    renderCard()
    await fill('OldPass123', 'NewPass456', 'Different1')
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(authService.changePassword).not.toHaveBeenCalled()
  })

  it('shows "incorrect" under the current password field', async () => {
    const response = {
      status: 400,
      data: {
        error: {
          message: 'Current password is incorrect',
          details: { currentPassword: 'Current password is incorrect' },
        },
      },
    } as AxiosResponse
    vi.mocked(authService.changePassword).mockRejectedValue(
      new AxiosError('bad', '400', undefined, undefined, response),
    )
    renderCard()
    await fill()

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(useAuthStore.getState().token).toBe('old-jwt')
  })
})
