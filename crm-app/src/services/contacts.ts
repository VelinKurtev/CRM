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

export type ContactSort = 'name' | 'company' | 'createdAt'

export type ContactListParams = {
  q?: string
  company?: string
  tag?: string
  owner?: 'me'
  sort?: ContactSort
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export type ContactListItem = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  createdAt: string
  company: { id: string; name: string } | null
  owner: { id: string; firstName: string; lastName: string } | null
  tags: string[]
}

export type ContactsPage = {
  contacts: ContactListItem[]
  total: number
  page: number
  pageSize: number
}

export const listContacts = (params: ContactListParams) =>
  api.get<ContactsPage>('/contacts', { params }).then((r) => r.data)

/** Options for the filter dropdowns (the API caps these at 100). */
export const listTags = () =>
  api.get<{ tags: string[] }>('/tags', { params: { limit: 100 } }).then((r) => r.data.tags)

export const listCompanies = () =>
  api
    .get<{ companies: { id: string; name: string }[] }>('/companies', { params: { limit: 100 } })
    .then((r) => r.data.companies)
