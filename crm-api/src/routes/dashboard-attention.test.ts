import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  sales: `attn-sales-${stamp}@crm.local`,
  other: `attn-other-${stamp}@crm.local`,
}
const ids = { sales: '', other: '' }
let token = ''
let supportToken = ''
const supportEmail = `attn-support-${stamp}@crm.local`

const attention = (t = token) =>
  request(app).get('/api/dashboard/attention').set('Authorization', `Bearer ${t}`)
const day = 24 * 60 * 60 * 1000

beforeAll(async () => {
  await syncPermissions(prisma)
  const roles = await prisma.role.findMany()
  const roleId = (n: string) => roles.find((r) => r.name === n)!.id
  const passwordHash = await bcrypt.hash(password, 4)
  const make = (email: string, role: string) =>
    prisma.user.create({
      data: { email, passwordHash, firstName: 'Attn', lastName: role, roleId: roleId(role) },
    })

  ids.sales = (await make(emails.sales, 'SALES')).id
  ids.other = (await make(emails.other, 'SALES')).id
  await make(supportEmail, 'SUPPORT')
  const login = async (email: string) =>
    (await request(app).post('/api/auth/login').send({ email, password })).body.token as string
  token = await login(emails.sales)
  supportToken = await login(supportEmail)

  const now = Date.now()
  const task = (title: string, extra: object) => ({
    title: `attn-${stamp}-${title}`,
    creatorId: ids.sales,
    assigneeId: ids.sales,
    ...extra,
  })
  await prisma.task.createMany({
    data: [
      task('later', { dueDate: new Date(now + 5 * day) }),
      task('overdue', { dueDate: new Date(now - 2 * day) }),
      task('undated', {}),
      task('soon', { dueDate: new Date(now + day), status: 'IN_PROGRESS' }),
      task('done', { dueDate: new Date(now - day), status: 'DONE' }),
      { ...task('theirs', { dueDate: new Date(now) }), assigneeId: ids.other },
    ],
  })
  await prisma.activity.create({
    data: { type: 'CALL', subject: `attn-${stamp}-call`, userId: ids.other },
  })
  await prisma.notification.createMany({
    data: [
      { userId: ids.sales, type: 'task', message: `attn-${stamp}-unread` },
      { userId: ids.sales, type: 'task', message: `attn-${stamp}-read`, readAt: new Date() },
      { userId: ids.other, type: 'task', message: `attn-${stamp}-not-mine` },
    ],
  })
})

afterAll(async () => {
  const users = { in: [ids.sales, ids.other] }
  await prisma.task.deleteMany({ where: { creatorId: users } })
  await prisma.activity.deleteMany({ where: { userId: users } })
  await prisma.user.deleteMany({
    where: { email: { in: [...Object.values(emails), supportEmail] } },
  })
  await prisma.$disconnect()
})

describe('GET /api/dashboard/attention', () => {
  it('requires login', async () => {
    expect((await request(app).get('/api/dashboard/attention')).status).toBe(401)
  })

  it('lists only my open tasks, soonest due first, undated last', async () => {
    const { tasks } = (await attention()).body
    const titles = tasks.items.map((t: { title: string }) => t.title.replace(`attn-${stamp}-`, ''))
    expect(titles).toEqual(['overdue', 'soon', 'later', 'undated'])
    expect(tasks.open).toBe(4)
    expect(tasks.overdue).toBe(1)
  })

  it('shows the latest team activity with who did it', async () => {
    const { activities } = (await attention()).body
    expect(activities[0]).toMatchObject({
      subject: `attn-${stamp}-call`,
      type: 'CALL',
      user: { firstName: 'Attn', lastName: 'SALES' },
    })
  })

  it('shows only my notifications and counts the unread ones', async () => {
    const { notifications } = (await attention()).body
    const messages = notifications.items.map((n: { message: string }) => n.message)
    expect(messages).toHaveLength(2)
    expect(messages).not.toContain(`attn-${stamp}-not-mine`)
    expect(notifications.unread).toBe(1)
  })

  it('still gives support their notifications, with tasks and activity per their permissions', async () => {
    const res = await attention(supportToken)
    expect(res.status).toBe(200)
    expect(res.body.tasks).toMatchObject({ open: 0 })
    expect(res.body.notifications.items).toEqual([])
  })
})
