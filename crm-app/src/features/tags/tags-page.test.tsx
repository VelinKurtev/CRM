import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

import { routes } from '@/routes'
import * as contacts from '@/services/contacts'
import { useAuthStore } from '@/store/auth-store'

vi.mock('@/services/contacts')

const manager = {
  id: '1',
  email: 'm@b.com',
  firstName: 'Mia',
  lastName: 'Lee',
  avatarUrl: null,
  permissions: ['contacts:read', 'contacts:write', 'tags:manage'],
  role: 'MANAGER' as const,
}
const vip: contacts.TagDetail = {
  id: 't1',
  name: 'vip',
  color: '#ff0000',
  contactCount: 3,
  usageCount: 5,
}
const cold: contacts.TagDetail = {
  id: 't2',
  name: 'cold',
  color: null,
  contactCount: 0,
  usageCount: 0,
}

function renderPage(permissions = manager.permissions) {
  useAuthStore.setState({ token: 'jwt', user: { ...manager, permissions }, initialized: true })
  const router = createMemoryRouter(routes, { initialEntries: ['/tags'] })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const apiError = (status: number, message: string) =>
  new AxiosError('bad', String(status), undefined, undefined, {
    status,
    data: { error: { message } },
  } as AxiosResponse)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(contacts.listTagDetails).mockResolvedValue([vip, cold])
})

describe('Tags page', () => {
  it('is for people who may manage tags, and linked from the sidebar', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Tags' })).toBeInTheDocument()
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]
    expect(within(nav).getByRole('link', { name: 'Tags' })).toHaveAttribute('href', '/tags')
  })

  it('is closed to everyone else', () => {
    renderPage(['contacts:read', 'contacts:write'])
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(contacts.listTagDetails).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Tags' })).not.toBeInTheDocument()
  })

  it('lists tags with colour and usage, linking to their contacts', async () => {
    renderPage()
    const row = (await screen.findByText('vip')).closest('tr')!
    expect(within(row).getByText('vip')).toHaveStyle({ backgroundColor: '#ff0000' })
    expect(within(row).getByRole('link', { name: '3' })).toHaveAttribute(
      'href',
      '/contacts?tag=vip',
    )
    expect(within(row).getByText('5')).toBeInTheDocument()
    const unused = screen.getByText('cold').closest('tr')!
    expect(within(unused).queryByRole('link')).not.toBeInTheDocument()
  })

  it('searches by name', async () => {
    renderPage()
    await screen.findByText('vip')
    await userEvent.type(screen.getByRole('searchbox'), 'vi')
    await waitFor(() => expect(contacts.listTagDetails).toHaveBeenLastCalledWith('vi'))
  })

  it('says when there are no tags', async () => {
    vi.mocked(contacts.listTagDetails).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No tags yet')).toBeInTheDocument()
  })

  it('renames and recolours a tag', async () => {
    vi.mocked(contacts.updateTag).mockResolvedValue({ id: 't1', name: 'VIPs', color: '#00ff00' })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit tag vip' }))

    const dialog = await screen.findByRole('dialog', { name: 'Edit tag' })
    expect(dialog).toHaveTextContent('Changes apply to all 5 records that use this tag.')
    const name = within(dialog).getByLabelText('Name')
    expect(name).toHaveValue('vip')
    await userEvent.clear(name)
    await userEvent.type(name, ' VIPs ')
    fireColor(within(dialog).getByLabelText('Colour'), '#00ff00')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(contacts.updateTag).toHaveBeenCalledWith('t1', { name: 'VIPs', color: '#00ff00' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(contacts.listTagDetails).toHaveBeenCalledTimes(2) // list refreshed
  })

  it('can remove a tag’s colour', async () => {
    vi.mocked(contacts.updateTag).mockResolvedValue({ id: 't1', name: 'vip', color: null })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit tag vip' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'No colour' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(contacts.updateTag).toHaveBeenCalledWith('t1', { name: 'vip', color: null }),
    )
  })

  it('explains a name clash and keeps the dialog open', async () => {
    vi.mocked(contacts.updateTag).mockRejectedValue(
      apiError(409, 'A tag with this name already exists'),
    )
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit tag vip' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Another tag already has this name.',
    )
  })

  it('does not allow an empty name', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit tag vip' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.clear(within(dialog).getByLabelText('Name'))
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('asks before deleting, and says how many records lose the tag', async () => {
    vi.mocked(contacts.deleteTag).mockResolvedValue(undefined)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tag vip' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete “vip”?' })
    expect(dialog).toHaveTextContent('removed from 5 records')
    expect(contacts.deleteTag).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete tag' }))
    await waitFor(() => expect(contacts.deleteTag).toHaveBeenCalledWith('t1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('can be cancelled, and reports a failed delete', async () => {
    vi.mocked(contacts.deleteTag).mockRejectedValue(new Error('boom'))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tag cold' }))
    let dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('No record uses this tag.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(contacts.deleteTag).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Delete tag cold' }))
    dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete tag' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not delete the tag')
  })

  it('shows an error if the tags cannot be loaded', async () => {
    vi.mocked(contacts.listTagDetails).mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tags')
  })
})

/** `userEvent` can't drive a colour input; set its value the way the browser would. */
function fireColor(input: HTMLElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
