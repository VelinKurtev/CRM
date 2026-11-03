import { render, screen } from '@testing-library/react'

import { useAuthStore } from '@/store/auth-store'

import { vi } from 'vitest'

import * as session from '@/features/auth/session'
import App from './App'

vi.mock('@/features/auth/session')

describe('App', () => {
  it('sends unauthenticated visitors to the login page', async () => {
    vi.mocked(session.initAuth).mockResolvedValue()
    useAuthStore.setState({ token: null, user: null, initialized: true })
    render(<App />)
    expect(
      await screen.findByText('Enter your email and password to access the CRM.'),
    ).toBeInTheDocument()
  })
})
