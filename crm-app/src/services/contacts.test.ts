import { AxiosError, type AxiosResponse } from 'axios'
import { vi } from 'vitest'

import { api, getErrorMessage } from '@/api/client'
import { bulkTagContacts, exportContacts, listContacts } from './contacts'

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
      paramsSerializer: { indexes: null },
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

describe('tag filters', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends each tag as its own repeated parameter', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { contacts: [] } })
    await listContacts({ tag: ['vip', 'hot lead'], tagMode: 'all', q: 'bob' })
    const config = get.mock.calls[0][1]!
    expect(api.getUri({ url: '/contacts', ...config })).toMatch(
      /\/contacts\?tag=vip&tag=hot\+lead&tagMode=all&q=bob$/,
    )
  })
})

describe('bulkTagContacts', () => {
  afterEach(() => vi.restoreAllMocks())

  it('posts the selection and the tags to add and remove', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { updated: 2, skipped: 0 } })
    const body = { contactIds: ['a', 'b'], add: ['vip'], remove: ['cold'] }
    expect(await bulkTagContacts(body)).toEqual({ updated: 2, skipped: 0 })
    expect(post).toHaveBeenCalledWith('/contacts/bulk-tags', body)
  })
})
