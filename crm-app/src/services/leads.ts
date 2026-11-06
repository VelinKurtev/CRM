import { api } from '@/api/client'
import type { LeadPriority, LeadStatus } from './lead-options'

export type Person = { id: string; firstName: string; lastName: string }

export type Lead = {
  id: string
  title: string
  source: string | null
  /** Estimated worth, in USD. */
  value: number | null
  priority: LeadPriority
  status: LeadStatus
  notes: string | null
  createdAt: string
  owner: Person | null
}

export type NewLead = {
  title: string
  source?: string
  value?: number
  priority: LeadPriority
  status: LeadStatus
  notes?: string
  ownerId?: string
}

/** On update, `null` clears an optional field and a missing field is left alone. */
export type LeadUpdate = {
  title: string
  source: string | null
  value: number | null
  priority: LeadPriority
  status: LeadStatus
  notes: string | null
  ownerId: string | null
}

export type LeadsPage = { leads: Lead[]; total: number; page: number; pageSize: number }

export const listLeads = (params: {
  q?: string
  status?: string
  priority?: string
  page?: number
  pageSize?: number
}) => api.get<LeadsPage>('/leads', { params }).then((r) => r.data)

export const getLead = (id: string) =>
  api.get<{ lead: Lead }>(`/leads/${id}`).then((r) => r.data.lead)

export const createLead = (body: NewLead) =>
  api.post<{ lead: Lead }>('/leads', body).then((r) => r.data.lead)

export const updateLead = (id: string, body: LeadUpdate) =>
  api.patch<{ lead: Lead }>(`/leads/${id}`, body).then((r) => r.data.lead)

export const listLeadOwners = () =>
  api.get<{ owners: Person[] }>('/leads/owners').then((r) => r.data.owners)
