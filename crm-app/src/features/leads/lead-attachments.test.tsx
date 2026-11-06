import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as leads from '@/services/leads'
import { useAuthStore } from '@/store/auth-store'
import { saveBlob } from '@/utils/download'

vi.mock('@/services/leads', async (importOriginal) => ({
  ...(await importOriginal<typeof leads>()),
  getLead: vi.fn(),
  listLeadOwners: vi.fn(),
  listLeadAttachments: vi.fn(),
  uploadLeadAttachment: vi.fn(),
  downloadLeadAttachment: vi.fn(),
  deleteLeadAttachment: vi.fn(),
}))
vi.mock('@/utils/download', () => ({ saveBlob: vi.fn() }))

const sales = {
  id: '1',
  email: 'ann@b.com',
  firstName: 'Ann',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['leads:read', 'leads:write'],
  role: 'SALES' as const,
}

const lead: leads.Lead = {
  id: 'l1',
  title: 'Website redesign',
  source: null,
  value: null,
  priority: 'MEDIUM',
  status: 'NEW',
  notes: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  owner: null,
  attachmentCount: 1,
  contact: null,
  deal: null,
}
const quote: leads.LeadAttachment = {
  id: 'a1',
  name: 'quote.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 250 * 1024,
  createdAt: '2026-11-02T10:00:00.000Z',
  uploadedBy: { id: '1', firstName: 'Ann', lastName: 'Lee' },
}

function renderEdit() {
  useAuthStore.setState({ token: 'jwt', user: sales, initialized: true })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/leads/l1/edit'] })} />
    </QueryClientProvider>,
  )
}

const apiError = (status: number, message: string) =>
  new AxiosError('bad', String(status), undefined, undefined, {
    status,
    data: { error: { message } },
  } as AxiosResponse)

const file = (name: string, size = 10, type = 'application/pdf') =>
  new File([new Uint8Array(size)], name, { type })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(leads.getLead).mockResolvedValue(lead)
  vi.mocked(leads.listLeadOwners).mockResolvedValue([])
  vi.mocked(leads.listLeadAttachments).mockResolvedValue([quote])
})

describe('Lead attachments', () => {
  it('lists the files with size, who added them and when', async () => {
    renderEdit()
    const item = (await screen.findByText('quote.pdf')).closest('li')!
    expect(within(item).getByText(/250 KB · Ann Lee · Nov 2, 2026/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Attachments/ })).toHaveTextContent('(1)')
  })

  it('says when there are no files', async () => {
    vi.mocked(leads.listLeadAttachments).mockResolvedValue([])
    renderEdit()
    expect(await screen.findByText(/No files yet/)).toBeInTheDocument()
  })

  it('uploads the chosen files one by one and refreshes the list', async () => {
    vi.mocked(leads.uploadLeadAttachment).mockResolvedValue({ ...quote, id: 'a2', name: 'b.pdf' })
    renderEdit()
    await screen.findByText('quote.pdf')
    const a = file('a.pdf')
    const b = file('b.png', 20, 'image/png')
    await userEvent.upload(screen.getByLabelText('Choose files to attach'), [a, b])

    await waitFor(() => expect(leads.uploadLeadAttachment).toHaveBeenCalledTimes(2))
    expect(leads.uploadLeadAttachment).toHaveBeenNthCalledWith(1, 'l1', a)
    expect(leads.uploadLeadAttachment).toHaveBeenNthCalledWith(2, 'l1', b)
    await waitFor(() => expect(leads.listLeadAttachments).toHaveBeenCalledTimes(2))
  })

  it('reports a file that fails without stopping the others', async () => {
    vi.mocked(leads.uploadLeadAttachment)
      .mockRejectedValueOnce(apiError(409, 'A lead can have up to 25 files'))
      .mockResolvedValueOnce({ ...quote, id: 'a3' })
    renderEdit()
    await screen.findByText('quote.pdf')
    await userEvent.upload(screen.getByLabelText('Choose files to attach'), [
      file('first.pdf'),
      file('second.pdf'),
    ])
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'first.pdf: A lead can have up to 25 files',
    )
    expect(leads.uploadLeadAttachment).toHaveBeenCalledTimes(2)
  })

  it('does not send files that are empty or too big', async () => {
    renderEdit()
    await screen.findByText('quote.pdf')
    await userEvent.upload(screen.getByLabelText('Choose files to attach'), [
      file('empty.txt', 0),
      file('huge.zip', leads.MAX_ATTACHMENT_BYTES + 1),
    ])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('empty.txt: the file is empty')
    expect(alert).toHaveTextContent('huge.zip: files can be up to 10.0 MB')
    expect(leads.uploadLeadAttachment).not.toHaveBeenCalled()
  })

  it('downloads a file under its own name', async () => {
    const blob = new Blob(['pdf'])
    vi.mocked(leads.downloadLeadAttachment).mockResolvedValue(blob)
    renderEdit()
    await userEvent.click(await screen.findByRole('button', { name: 'Download quote.pdf' }))
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'quote.pdf'))
    expect(leads.downloadLeadAttachment).toHaveBeenCalledWith('l1', 'a1')
  })

  it('asks before removing a file, and keeps it if you change your mind', async () => {
    vi.mocked(leads.deleteLeadAttachment).mockResolvedValue(undefined)
    renderEdit()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove quote.pdf' }))
    expect(await screen.findByText('Remove this file?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep file' }))
    expect(leads.deleteLeadAttachment).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Remove quote.pdf' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove file' }))
    await waitFor(() => expect(leads.deleteLeadAttachment).toHaveBeenCalledWith('l1', 'a1'))
    await waitFor(() => expect(leads.listLeadAttachments).toHaveBeenCalledTimes(2))
  })

  it('stops offering uploads once the lead has 25 files', async () => {
    vi.mocked(leads.listLeadAttachments).mockResolvedValue(
      Array.from({ length: leads.MAX_ATTACHMENTS_PER_LEAD }, (_, i) => ({
        ...quote,
        id: `a${i}`,
        name: `f${i}.pdf`,
      })),
    )
    renderEdit()
    await screen.findByText('f0.pdf')
    expect(screen.getByRole('button', { name: /Add files/ })).toBeDisabled()
    expect(screen.getByText(/up to 25 files/)).toBeInTheDocument()
  })

  it('shows an error if the list cannot be loaded', async () => {
    vi.mocked(leads.listLeadAttachments).mockRejectedValue(new Error('boom'))
    renderEdit()
    expect(await screen.findByText('Could not load the attachments')).toBeInTheDocument()
  })
})
