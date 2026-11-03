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
