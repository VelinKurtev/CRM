import axios, { type AxiosResponse } from 'axios'
import { vi } from 'vitest'

import { useAuthStore } from '@/store/auth-store'
import { initAuth, resetAuthInit } from './session'

const user = {
  id: '1',
  email: 'a@b.com',
  firstName: 'A',
  lastName: 'B',
  avatarUrl: null,
  permissions: [] as string[],
  role: 'SALES' as const,
}

beforeEach(() => {
  resetAuthInit()
  useAuthStore.setState({ token: null, user: null, initialized: false })
})
afterEach(() => vi.restoreAllMocks())

describe('initAuth', () => {
  it('restores the session from the refresh cookie', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { token: 't', user } } as AxiosResponse)
    await initAuth()
    expect(useAuthStore.getState()).toMatchObject({ token: 't', user, initialized: true })
  })

  it('ends unauthenticated but initialized when there is no valid cookie', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('401'))
    await initAuth()
    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null, initialized: true })
  })

  it('only calls the API once', async () => {
    const post = vi.spyOn(axios, 'post').mockRejectedValue(new Error('401'))
    await Promise.all([initAuth(), initAuth()])
    expect(post).toHaveBeenCalledTimes(1)
  })
})
