import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import * as notes from '@/services/notes'
import { useAuthStore } from '@/store/auth-store'
import { NotesSection } from './notes-section'

vi.mock('@/services/notes')

const me = { id: 'u1', firstName: 'Ann', lastName: 'Lee' }
const bob = { id: 'u2', firstName: 'Bob', lastName: 'Ray' }
const mine: notes.Note = {
  id: 'n1',
  body: 'Budget is 50k',
  createdAt: '2026-02-01T10:00:00Z',
  updatedAt: '2026-02-01T10:00:00Z',
  author: me,
}
const theirs: notes.Note = {
  id: 'n2',
  body: 'Prefers email',
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-01-05T10:00:00Z', // edited later
  author: bob,
}

function renderNotes(permissions: string[], items = [mine, theirs], total = items.length) {
  useAuthStore.setState({
    token: 'jwt',
    user: {
      ...me,
      email: 'a@b.com',
      avatarUrl: null,
      role: 'SALES',
      permissions,
    },
    initialized: true,
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <NotesSection
        target={{ contactId: 'c1' }}
        notes={{ total, items }}
        queryKey={['contact', 'c1', 'overview']}
        emptyText="No notes yet."
      />
    </QueryClientProvider>,
  )
  return invalidate
}

const writer = ['notes:write']
const deleter = ['notes:write', 'notes:delete']

beforeEach(() => vi.resetAllMocks())

describe('Notes section', () => {
  it('lists notes with author and date, marking edited ones', () => {
    renderNotes(writer)
    expect(screen.getByRole('heading', { name: /Notes/ })).toHaveTextContent('(2)')
    expect(screen.getByText(/Ann Lee · Feb 1, 2026$/)).toBeInTheDocument()
    expect(screen.getByText(/Bob Ray · Jan 1, 2026 · edited/)).toBeInTheDocument()
  })

  it('says so when there are no notes', () => {
    renderNotes(writer, [])
    expect(screen.getByText('No notes yet.')).toBeInTheDocument()
  })

  it('adds a note, empties the box and refreshes the page data', async () => {
    vi.mocked(notes.addNote).mockResolvedValue(mine)
    const invalidate = renderNotes(writer)
    const box = screen.getByRole('textbox', { name: 'Add a note' })
    const button = screen.getByRole('button', { name: 'Add note' })
    expect(button).toBeDisabled() // nothing written yet

    await userEvent.type(box, '  Likes demos  ')
    await userEvent.click(button)
    await waitFor(() =>
      expect(notes.addNote).toHaveBeenCalledWith({ contactId: 'c1' }, 'Likes demos'),
    )
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Add a note' })).toHaveValue(''))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['contact', 'c1', 'overview'] })
  })

  it('keeps what you typed, and says why, if adding fails', async () => {
    vi.mocked(notes.addNote).mockRejectedValue(new Error('boom'))
    renderNotes(writer)
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a note' }), 'Important')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the note')
    expect(screen.getByRole('textbox', { name: 'Add a note' })).toHaveValue('Important')
  })

  it('is read-only without notes:write', () => {
    renderNotes(['contacts:read'])
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit note' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete note' })).not.toBeInTheDocument()
    expect(screen.getByText('Budget is 50k')).toBeInTheDocument()
  })

  it('lets you edit only your own notes', async () => {
    vi.mocked(notes.updateNote).mockResolvedValue({ ...mine, body: 'Budget is 80k' })
    renderNotes(deleter)
    expect(screen.getAllByRole('button', { name: 'Edit note' })).toHaveLength(1)

    const item = screen.getByText('Budget is 50k').closest('li')!
    await userEvent.click(within(item).getByRole('button', { name: 'Edit note' }))
    const box = within(item).getByRole('textbox', { name: 'Edit note' })
    expect(box).toHaveValue('Budget is 50k')
    await userEvent.clear(box)
    await userEvent.type(box, 'Budget is 80k')
    await userEvent.click(within(item).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(notes.updateNote).toHaveBeenCalledWith('n1', 'Budget is 80k'))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit note' })).toBeNull())
  })

  it('can cancel an edit', async () => {
    renderNotes(writer)
    await userEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('textbox', { name: 'Edit note' })).not.toBeInTheDocument()
    expect(notes.updateNote).not.toHaveBeenCalled()
  })

  it('does not save an emptied note', async () => {
    renderNotes(writer)
    await userEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Edit note' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('asks before deleting, and shows the note being deleted', async () => {
    vi.mocked(notes.deleteNote).mockResolvedValue(undefined)
    renderNotes(deleter)
    const item = screen.getByText('Prefers email').closest('li')!
    await userEvent.click(within(item).getByRole('button', { name: 'Delete note' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete this note?' })
    expect(dialog).toHaveTextContent('Prefers email')
    expect(notes.deleteNote).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete note' }))
    await waitFor(() => expect(notes.deleteNote).toHaveBeenCalledWith('n2'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lets someone without notes:delete remove only their own notes', () => {
    renderNotes(writer)
    const own = screen.getByText('Budget is 50k').closest('li')!
    const other = screen.getByText('Prefers email').closest('li')!
    expect(within(own).getByRole('button', { name: 'Delete note' })).toBeInTheDocument()
    expect(within(other).queryByRole('button', { name: 'Delete note' })).not.toBeInTheDocument()
  })

  it('shows a failed delete in the dialog', async () => {
    vi.mocked(notes.deleteNote).mockRejectedValue(new Error('boom'))
    renderNotes(deleter)
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete note' })[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete note' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not delete the note')
  })

  it('says when only some notes are shown', () => {
    renderNotes(writer, [mine], 80)
    expect(screen.getByText('Showing 1 of 80.')).toBeInTheDocument()
  })
})
