import { api } from '@/api/client'

export type Note = {
  id: string
  body: string
  createdAt: string
  updatedAt: string
  author: { id: string; firstName: string; lastName: string }
}

/** A note belongs to one contact, company or deal. */
export type NoteTarget = { contactId: string } | { companyId: string } | { dealId: string }

export const addNote = (target: NoteTarget, body: string) =>
  api.post<{ note: Note }>('/notes', { body, ...target }).then((r) => r.data.note)

export const updateNote = (id: string, body: string) =>
  api.patch<{ note: Note }>(`/notes/${id}`, { body }).then((r) => r.data.note)

export const deleteNote = (id: string) => api.delete(`/notes/${id}`).then(() => undefined)
