export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type LeadPriority = (typeof LEAD_PRIORITIES)[number]

/** The pipeline in order: a lead ends Won or Lost. */
export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]
