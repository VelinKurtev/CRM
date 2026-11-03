import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios'
import { vi } from 'vitest'

import { useAuthStore } from '@/store/auth-store'
import { api } from './client'

const user = {
  id: '1',
  email: 'a@b.com',
  firstName: 'A',
  lastName: 'B',
  avatarUrl: null,
  permissions: [] as string[],
  role: 'SALES' as const,
}

const reply = (config: Parameters<AxiosAdapter>[0], status: number, data = {}) => {
  const response = { data, status, statusText: '', headers: {}, config } as AxiosResponse
  return status < 400
    ? Promise.resolve(response)
    : Promise.reject(new AxiosError('fail', String(status), config, null, response))
}

/** Protected endpoint that only accepts the token "new". */
const adapter: AxiosAdapter = (config) =>
  config.headers.get('Authorization') === 'Bearer new'
    ? reply(config, 200, { ok: true })
    : reply(config, 401)

beforeEach(() => {
  api.defaults.adapter = adapter
  useAuthStore.setState({ token: 'old', user, initialized: true })
})
afterEach(() => vi.restoreAllMocks())

describe('api client', () => {
  it('refreshes once on 401 and retries the request with the new token', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { token: 'new', user } } as AxiosResponse)

    const res = await api.get('/contacts')

    expect(res.data).toEqual({ ok: true })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toMatch(/\/auth\/refresh$/)
    expect(useAuthStore.getState().token).toBe('new')
  })

  it('shares one refresh between concurrent 401s', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { token: 'new', user } } as AxiosResponse)

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')])

    expect(post).toHaveBeenCalledTimes(1)
  })

  it('clears the session when the refresh fails', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('401'))

    await expect(api.get('/contacts')).rejects.toBeTruthy()

    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('does not try to refresh when logging in with bad credentials', async () => {
    const post = vi.spyOn(axios, 'post')
    api.defaults.adapter = (config) => reply(config, 401)

    await expect(api.post('/auth/login', {})).rejects.toBeTruthy()

    expect(post).not.toHaveBeenCalled()
    expect(useAuthStore.getState().token).toBe('old')
  })
})
