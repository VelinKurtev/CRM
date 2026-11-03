import { AxiosError, type AxiosResponse } from 'axios'
import { vi } from 'vitest'

import { api, getErrorMessage } from '@/api/client'
import { exportContacts } from './contacts'

const failure = (body: BlobPart) =>
  new AxiosError('bad', '400', undefined, undefined, {
    status: 400,
    data: new Blob([body], { type: 'application/json' }),
  } as AxiosResponse)

describe('exportContacts', () => {
  afterEach(() => vi.restoreAllMocks())

  it('asks for the file as a Blob with the filters and delimiter', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: new Blob(['csv']) })
    const blob = await exportContacts({ q: 'bob', delimiter: 'semicolon' })
    expect(get).toHaveBeenCalledWith('/contacts/export', {
      params: { q: 'bob', delimiter: 'semicolon' },
      responseType: 'blob',
    })
    expect(await blob.text()).toBe('csv')
  })

  it('turns an error body that arrived as a Blob back into a readable message', async () => {
    const message = 'Too many contacts to export at once (12000).'
    vi.spyOn(api, 'get').mockRejectedValue(failure(JSON.stringify({ error: { message } })))
    const error = await exportContacts({ delimiter: 'comma' }).catch((e: unknown) => e)
    expect(getErrorMessage(error, 'fallback')).toBe(message)
  })

  it('falls back gracefully if the error body is not JSON', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(failure('<html>oops</html>'))
    const error = await exportContacts({ delimiter: 'comma' }).catch((e: unknown) => e)
    expect(getErrorMessage(error, 'Could not export')).toBe('Could not export')
  })
})
