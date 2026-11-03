import { api } from '@/api/client'

export type NewContact = {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  jobTitle?: string
  company?: string
  address?: string
  city?: string
  postalCode?: string
  country?: string
  linkedinUrl?: string
  twitterUrl?: string
  facebookUrl?: string
  tags?: string[]
  note?: string
}

export type CreatedContact = { id: string; firstName: string; lastName: string }

export const createContact = (body: NewContact) =>
  api.post<{ contact: CreatedContact }>('/contacts', body).then((r) => r.data.contact)

export const searchCompanies = (q: string) =>
  api
    .get<{ companies: { id: string; name: string }[] }>('/companies', { params: { q } })
    .then((r) => r.data.companies)

export const searchTags = (q: string) =>
  api.get<{ tags: string[] }>('/tags', { params: { q } }).then((r) => r.data.tags)

/** On update, `null` clears an optional field and a missing field is left alone. */
export type ContactUpdate = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  company: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  country: string | null
  linkedinUrl: string | null
  twitterUrl: string | null
  facebookUrl: string | null
  tags: string[]
}

export type ContactDetail = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  company: { id: string; name: string } | null
  address: string | null
  city: string | null
  postalCode: string | null
  country: string | null
  linkedinUrl: string | null
  twitterUrl: string | null
  facebookUrl: string | null
  tags: string[]
  /** What deleting the contact would remove (notes, tasks, activities) or unlink (deals, leads). */
  related: { notes: number; tasks: number; activities: number; deals: number; leads: number }
  /** Whether the signed-in user may delete this contact. */
  canDelete: boolean
}

export const getContact = (id: string) =>
  api.get<{ contact: ContactDetail }>(`/contacts/${id}`).then((r) => r.data.contact)

export const updateContact = (id: string, body: ContactUpdate) =>
  api.patch<{ contact: CreatedContact }>(`/contacts/${id}`, body).then((r) => r.data.contact)

export const deleteContact = (id: string) => api.delete(`/contacts/${id}`).then(() => undefined)
