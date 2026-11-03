import { api } from '@/api/client'

export type QuickRecord = 'contact' | 'lead' | 'deal' | 'task'
type DialogRecord = Exclude<QuickRecord, 'contact'>

const paths: Record<DialogRecord, string> = {
  lead: '/leads',
  deal: '/deals',
  task: '/tasks',
}

/** Quick-create: sends only the essential fields for each record type. */
export const createRecord = (type: DialogRecord, body: Record<string, unknown>) =>
  api.post(paths[type], body).then((r) => r.data)
