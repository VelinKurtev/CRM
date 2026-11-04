import axios from 'axios'

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
  /** Tag names; with several, `tagMode` decides between any of them and all of them. */
  tag?: string[]
  tagMode?: 'any' | 'all'
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

/** Repeat array params (`tag=a&tag=b`) instead of axios's default `tag[]=a`. */
const repeatArrays = { indexes: null } as const

export const listContacts = (params: ContactListParams) =>
  api.get<ContactsPage>('/contacts', { params, paramsSerializer: repeatArrays }).then((r) => r.data)

export type TagDetail = {
  id: string
  name: string
  /** `#rrggbb`, or null for the default look. */
  color: string | null
  contactCount: number
  /** Contacts, companies, leads and deals that carry the tag. */
  usageCount: number
}

/** Every tag with its colour and usage: filter options, badge colours and the tags page. */
export const listTagDetails = (q = '') =>
  api
    .get<{ tags: TagDetail[] }>('/tags/details', { params: { q: q || undefined, limit: 500 } })
    .then((r) => r.data.tags)

export const updateTag = (id: string, body: { name?: string; color?: string | null }) =>
  api
    .patch<{ tag: Pick<TagDetail, 'id' | 'name' | 'color'> }>(`/tags/${id}`, body)
    .then((r) => r.data.tag)

export const deleteTag = (id: string) => api.delete(`/tags/${id}`).then(() => undefined)

export type BulkTagsRequest = { contactIds: string[]; add?: string[]; remove?: string[] }

/** Add and/or remove tags on several contacts at once. */
export const bulkTagContacts = (body: BulkTagsRequest) =>
  api.post<{ updated: number; skipped: number }>('/contacts/bulk-tags', body).then((r) => r.data)

export const listCompanies = () =>
  api
    .get<{ companies: { id: string; name: string }[] }>('/companies', { params: { limit: 100 } })
    .then((r) => r.data.companies)

export type ImportProblem = {
  /** Spreadsheet row: the header is row 1. */
  row: number
  name: string
  errors: Record<string, string>
}

export type ImportResult = {
  dryRun: boolean
  total: number
  valid: number
  imported: number
  ignoredColumns: string[]
  rejected: ImportProblem[]
}

/** With `dryRun` the server checks the file and saves nothing, for a preview. */
export const importContacts = (csv: string, dryRun: boolean) =>
  api
    .post<ImportResult>('/contacts/import', csv, {
      params: { dryRun },
      headers: { 'Content-Type': 'text/csv' },
    })
    .then((r) => r.data)

export type ExportParams = Pick<
  ContactListParams,
  'q' | 'company' | 'tag' | 'tagMode' | 'owner'
> & {
  /** Semicolons suit Excel in many European locales. */
  delimiter: 'comma' | 'semicolon'
}

/** Every contact matching the filters (not one page) as a CSV file. Needs `contacts:export`. */
export const exportContacts = (params: ExportParams) =>
  api
    .get<Blob>('/contacts/export', { params, paramsSerializer: repeatArrays, responseType: 'blob' })
    .then((r) => r.data)
    .catch(async (error: unknown) => {
      // An error body arrives as a Blob too; turn it back into JSON so its message can be shown.
      if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
        try {
          error.response.data = JSON.parse(await error.response.data.text())
        } catch {
          /* keep the generic message */
        }
      }
      throw error
    })

type Person = { id: string; firstName: string; lastName: string }
/** The first few of something, with how many there are in all. */
type Section<T> = { total: number; items: T[] }

export type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'OTHER'
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'

export type ContactOverview = {
  contact: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    jobTitle: string | null
    address: string | null
    city: string | null
    postalCode: string | null
    country: string | null
    linkedinUrl: string | null
    twitterUrl: string | null
    facebookUrl: string | null
    createdAt: string
    company: { id: string; name: string } | null
    owner: Person | null
    tags: string[]
  }
  /** A section is `null` when the signed-in role may not read that kind of record. */
  activities: Section<{
    id: string
    type: ActivityType
    subject: string
    description: string | null
    occurredAt: string
    user: Person
  }> | null
  tasks: Section<{
    id: string
    title: string
    status: TaskStatus
    dueDate: string | null
    assignee: Person | null
  }> | null
  emails: Section<{
    id: string
    subject: string
    fromAddr: string
    toAddr: string
    /** Null for a draft that was never sent. */
    sentAt: string | null
    createdAt: string
  }> | null
  notes: Section<{ id: string; body: string; createdAt: string; author: Person }> | null
}

export const getContactOverview = (id: string) =>
  api.get<ContactOverview>(`/contacts/${id}/overview`).then((r) => r.data)
