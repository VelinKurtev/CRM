import { z } from 'zod'

import {
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  type LeadPriority,
  type LeadStatus,
} from '@/services/lead-options'
import type { Lead, LeadUpdate, NewLead } from '@/services/leads'

export const PRIORITY_LABELS: Record<LeadPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  UNQUALIFIED: 'Unqualified',
  CONVERTED: 'Converted',
}

export const leadSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Keep it under 200 characters'),
  source: z.string().trim().max(100, 'Keep it under 100 characters'),
  value: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), 'Enter an amount, e.g. 15000.50')
    .refine((v) => Number(v) <= 999_999_999_999, 'That value is too large'),
  priority: z.enum(LEAD_PRIORITIES),
  status: z.enum(LEAD_STATUSES),
  /** An empty string means the signed-in user (on create) or nobody (on edit). */
  ownerId: z.string(),
  notes: z.string().trim().max(5000, 'Keep notes under 5000 characters'),
})
export type LeadFormValues = z.infer<typeof leadSchema>

export const emptyLead = (ownerId = ''): LeadFormValues => ({
  title: '',
  source: '',
  value: '',
  priority: 'MEDIUM',
  status: 'NEW',
  ownerId,
  notes: '',
})

/** The API body: blank fields are left out. */
export function toNewLead(v: LeadFormValues): NewLead {
  const body: NewLead = { title: v.title.trim(), priority: v.priority, status: v.status }
  if (v.source.trim()) body.source = v.source.trim()
  if (v.value.trim()) body.value = Number(v.value)
  if (v.notes.trim()) body.notes = v.notes.trim()
  if (v.ownerId) body.ownerId = v.ownerId
  return body
}

/** The update body: blank optional fields become `null`, which clears them on the server. */
export function toLeadUpdate(v: LeadFormValues): LeadUpdate {
  return {
    title: v.title.trim(),
    source: v.source.trim() || null,
    value: v.value.trim() ? Number(v.value) : null,
    priority: v.priority,
    status: v.status,
    notes: v.notes.trim() || null,
    ownerId: v.ownerId || null,
  }
}

export function fromLead(l: Lead): LeadFormValues {
  return {
    title: l.title,
    source: l.source ?? '',
    value: l.value === null ? '' : String(l.value),
    priority: l.priority,
    status: l.status,
    ownerId: l.owner?.id ?? '',
    notes: l.notes ?? '',
  }
}
