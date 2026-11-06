export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type LeadPriority = (typeof LEAD_PRIORITIES)[number]

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]
