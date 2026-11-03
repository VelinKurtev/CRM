import { api } from '@/api/client'

export type QuickRecord = 'contact' | 'lead' | 'deal' | 'task'

const paths: Record<QuickRecord, string> = {
  contact: '/contacts',
  lead: '/leads',
  deal: '/deals',
  task: '/tasks',
}

/** Quick-create: sends only the essential fields for each record type. */
export const createRecord = (type: QuickRecord, body: Record<string, unknown>) =>
  api.post(paths[type], body).then((r) => r.data)
