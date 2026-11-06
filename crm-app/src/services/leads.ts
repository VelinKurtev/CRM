import axios from 'axios'

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
  attachmentCount: number
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
  /** Only sent by people who may assign leads; leaving it out keeps the owner. */
  ownerId?: string | null
}

export type LeadsPage = {
  leads: Lead[]
  total: number
  page: number
  pageSize: number
  /** Leads in each stage under the current search and priority, whichever stage is chosen. */
  stageCounts: Record<LeadStatus, number>
}

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

/** Move a lead to another pipeline stage, leaving everything else as it is. */
export const setLeadStage = (id: string, status: LeadStatus) =>
  api.patch<{ lead: Lead }>(`/leads/${id}`, { status }).then((r) => r.data.lead)

/** Give a lead to someone, or to nobody (`null`). Needs `leads:assign`. */
export const setLeadOwner = (id: string, ownerId: string | null) =>
  api.patch<{ lead: Lead }>(`/leads/${id}`, { ownerId }).then((r) => r.data.lead)

export const listLeadOwners = () =>
  api.get<{ owners: Person[] }>('/leads/owners').then((r) => r.data.owners)

// ───────── Attachments ─────────

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_LEAD = 25

export type LeadAttachment = {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  uploadedBy: Person
}

export const listLeadAttachments = (leadId: string) =>
  api
    .get<{ attachments: LeadAttachment[] }>(`/leads/${leadId}/attachments`)
    .then((r) => r.data.attachments)

/** The body is the file itself, always sent as octet-stream; its real type goes in the query. */
export const uploadLeadAttachment = (leadId: string, file: File) =>
  api
    .post<{ attachment: LeadAttachment }>(`/leads/${leadId}/attachments`, file, {
      params: { name: file.name, type: file.type || undefined },
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    .then((r) => r.data.attachment)

export const downloadLeadAttachment = (leadId: string, attachmentId: string) =>
  api
    .get<Blob>(`/leads/${leadId}/attachments/${attachmentId}`, { responseType: 'blob' })
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

export const deleteLeadAttachment = (leadId: string, attachmentId: string) =>
  api.delete(`/leads/${leadId}/attachments/${attachmentId}`).then(() => undefined)
