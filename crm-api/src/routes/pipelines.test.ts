import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { app } from '../app.js'
import { syncPermissions } from '../lib/permissions.js'
import { prisma } from '../lib/prisma.js'

const stamp = Date.now()
const password = 'Secret123!'
const emails = {
  admin: `pl-admin-${stamp}@crm.local`,
  manager: `pl-manager-${stamp}@crm.local`,
  sales: `pl-sales-${stamp}@crm.local`,
}
const tokens = { admin: '', manager: '', sales: '' }
const ids = { admin: '' }
const name = (n: string) => `${n} Pl ${stamp}`

type Who = keyof typeof tokens
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` })
const api = (who: Who) => ({
  post: (url: string, body: object = {}) => request(app).post(url).set(as(who)).send(body),
  patch: (url: string, body: object = {}) => request(app).patch(url).set(as(who)).send(body),
  put: (url: string, body: object = {}) => request(app).put(url).set(as(who)).send(body),
  del: (url: string) => request(app).delete(url).set(as(who)),
  get: (url: string) => request(app).get(url).set(as(who)),
})
const admin = api('admin')

type Stage = {
  id: string
  name: string
  position: number
  probability: number
  isWon: boolean
  isLost: boolean
  dealCount: number
}
type Pipeline = { id: string; name: string; isDefault: boolean; dealCount: number; stages: Stage[] }

const newPipeline = async (label: string) =>
  (await admin.post('/api/pipelines', { name: name(label) })).body.pipeline as Pipeline
const stageNames = (p: Pipeline) => p.stages.map((s) => s.name)
const addDeal = async (stageId: string, label: string, extra: object = {}) => {
  const stage = await prisma.stage.findUniqueOrThrow({ where: { id: stageId } })
  return prisma.deal.create({
    data: {
      title: name(label),
      pipelineId: stage.pipelineId,
      stageId,
      probability: stage.probability,
      ...extra,
    },
  })
}

let originalDefault: string | undefined

beforeAll(async () => {
  await syncPermissions(prisma)
  originalDefault = (await prisma.pipeline.findFirst({ where: { isDefault: true } }))?.id
  const roles = await prisma.role.findMany()
  const passwordHash = await bcrypt.hash(password, 4)
  for (const [key, role] of [
    ['admin', 'ADMIN'],
    ['manager', 'MANAGER'],
    ['sales', 'SALES'],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        email: emails[key],
        passwordHash,
        firstName: key,
        lastName: 'Pl',
        roleId: roles.find((r) => r.name === role)!.id,
      },
    })
    if (key === 'admin') ids.admin = u.id
    const login = await request(app).post('/api/auth/login').send({ email: emails[key], password })
    tokens[key] = login.body.token
  }
})

afterAll(async () => {
  await prisma.deal.deleteMany({ where: { title: { contains: String(stamp) } } })
  await prisma.pipeline.deleteMany({ where: { name: { contains: String(stamp) } } })
  // Put the default back where it was, whatever the tests did with it.
  if (originalDefault) {
    await prisma.pipeline.updateMany({ data: { isDefault: false } })
    await prisma.pipeline.update({ where: { id: originalDefault }, data: { isDefault: true } })
  }
  await prisma.auditLog.deleteMany({ where: { userId: ids.admin } })
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } })
  await prisma.$disconnect()
})

describe('who may change pipelines', () => {
  it('is admins only; everyone with deals:read can look', async () => {
    const p = await newPipeline('Perm')
    const stage = p.stages[0].id
    const writes: [string, string, object?][] = [
      ['post', '/api/pipelines', { name: 'x' }],
      ['patch', `/api/pipelines/${p.id}`, { name: 'x' }],
      ['del', `/api/pipelines/${p.id}`],
      ['post', `/api/pipelines/${p.id}/stages`, { name: 'x' }],
      ['patch', `/api/pipelines/${p.id}/stages/${stage}`, { name: 'x' }],
      ['put', `/api/pipelines/${p.id}/stages/order`, { stageIds: [stage] }],
      ['del', `/api/pipelines/${p.id}/stages/${stage}`],
    ]
    for (const who of ['manager', 'sales'] as const) {
      for (const [method, url, body] of writes) {
        const res = await (
          api(who) as never as Record<
            string,
            (u: string, b?: object) => Promise<{ status: number }>
          >
        )[method](url, body)
        expect(res.status, `${who} ${method} ${url}`).toBe(403)
      }
    }
    for (const [method, url, body] of writes) {
      const anon = request(app) as never as Record<
        string,
        (u: string) => { send: (b?: object) => Promise<{ status: number }> }
      >
      const res = await anon[method === 'del' ? 'delete' : method](url).send(body)
      expect(res.status, `anon ${method} ${url}`).toBe(401)
    }
    expect((await api('sales').get('/api/pipelines')).status).toBe(200)
    expect(
      (await admin.get('/api/pipelines')).body.pipelines.find((x: Pipeline) => x.id === p.id).name,
    ).toBe(name('Perm'))
  })
})

describe('pipelines', () => {
  it('creates one with the standard stages, not the default, with deal counts', async () => {
    const res = await admin.post('/api/pipelines', { name: `  ${name('New')}  ` })
    expect(res.status).toBe(201)
    const p = res.body.pipeline as Pipeline
    expect(p).toMatchObject({ name: name('New'), isDefault: false, dealCount: 0 })
    expect(stageNames(p)).toEqual([
      'Qualification',
      'Proposal',
      'Negotiation',
      'Closed won',
      'Closed lost',
    ])
    expect(p.stages.map((s) => s.position)).toEqual([1, 2, 3, 4, 5])
    expect(p.stages.map((s) => [s.isWon, s.isLost])).toEqual([
      [false, false],
      [false, false],
      [false, false],
      [true, false],
      [false, true],
    ])
    expect(
      await prisma.auditLog.count({ where: { action: 'PIPELINE_CREATED', entityId: p.id } }),
    ).toBe(1)
  })

  it('needs a name that no other pipeline has, whatever the letter case', async () => {
    const p = await newPipeline('Dupe')
    expect((await admin.post('/api/pipelines', { name: '  ' })).status).toBe(400)
    const dupe = await admin.post('/api/pipelines', { name: p.name.toUpperCase() })
    expect(dupe.status).toBe(409)
    expect(dupe.body.error.details).toHaveProperty('name')
  })

  it('renames, and keeps the name unique', async () => {
    const a = await newPipeline('Rename A')
    const b = await newPipeline('Rename B')
    const ok = await admin.patch(`/api/pipelines/${a.id}`, { name: name('Renamed') })
    expect(ok.status).toBe(200)
    expect(ok.body.pipeline.name).toBe(name('Renamed'))
    expect((await admin.patch(`/api/pipelines/${b.id}`, { name: name('renamed') })).status).toBe(
      409,
    )
    // Keeping its own name is fine.
    expect((await admin.patch(`/api/pipelines/${a.id}`, { name: name('Renamed') })).status).toBe(
      200,
    )
    expect((await admin.patch('/api/pipelines/missing', { name: 'x' })).status).toBe(404)
  })

  it('makes another pipeline the default, so there is only ever one', async () => {
    const p = await newPipeline('Default')
    const res = await admin.patch(`/api/pipelines/${p.id}`, { isDefault: true })
    expect(res.status).toBe(200)
    expect(res.body.pipeline.isDefault).toBe(true)
    expect(await prisma.pipeline.count({ where: { isDefault: true } })).toBe(1)
    const list = (await admin.get('/api/pipelines')).body.pipelines as Pipeline[]
    expect(list[0].id).toBe(p.id)
    // New deals start in the new default's first stage.
    const quick = await request(app)
      .post('/api/deals')
      .set(as('admin'))
      .send({ title: name('Starts') })
    expect(quick.body.deal.pipelineId).toBe(p.id)
    // A pipeline stops being the default by another one becoming it.
    expect((await admin.patch(`/api/pipelines/${p.id}`, { isDefault: false })).status).toBe(400)
  })

  it('deletes an empty pipeline but not the default one or one with deals', async () => {
    const p = await newPipeline('Delete')
    await addDeal(p.stages[0].id, 'Resident')
    const blocked = await admin.del(`/api/pipelines/${p.id}`)
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.message).toContain('1 deal is')

    const empty = await newPipeline('Empty')
    expect((await admin.del(`/api/pipelines/${empty.id}`)).status).toBe(204)
    expect(await prisma.pipeline.count({ where: { id: empty.id } })).toBe(0)
    expect((await admin.del(`/api/pipelines/${empty.id}`)).status).toBe(404)

    const def = await prisma.pipeline.findFirstOrThrow({ where: { isDefault: true } })
    const refused = await admin.del(`/api/pipelines/${def.id}`)
    expect(refused.status).toBe(409)
    expect(refused.body.error.message).toContain('default')
  })

  it('reports how many deals each stage and pipeline holds', async () => {
    const p = await newPipeline('Counts')
    await addDeal(p.stages[0].id, 'C1')
    await addDeal(p.stages[0].id, 'C2')
    await addDeal(p.stages[1].id, 'C3')
    const got = (await admin.get('/api/pipelines')).body.pipelines.find(
      (x: Pipeline) => x.id === p.id,
    )
    expect(got.dealCount).toBe(3)
    expect(got.stages.map((s: Stage) => s.dealCount)).toEqual([2, 1, 0, 0, 0])
  })
})

describe('adding stages', () => {
  it('puts an open stage before the closed ones and a closed one last', async () => {
    const p = await newPipeline('Add')
    const open = await admin.post(`/api/pipelines/${p.id}/stages`, {
      name: 'Demo',
      probability: 55,
    })
    expect(open.status).toBe(201)
    expect(stageNames(open.body.pipeline)).toEqual([
      'Qualification',
      'Proposal',
      'Negotiation',
      'Demo',
      'Closed won',
      'Closed lost',
    ])
    expect(open.body.pipeline.stages[3]).toMatchObject({
      probability: 55,
      isWon: false,
      isLost: false,
    })

    const won = await admin.post(`/api/pipelines/${p.id}/stages`, {
      name: 'Renewed',
      kind: 'won',
      probability: 20,
    })
    const last = won.body.pipeline.stages.at(-1)
    expect(last).toMatchObject({ name: 'Renewed', isWon: true, probability: 100 })
    expect(won.body.pipeline.stages.map((s: Stage) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('can go at a chosen position, and shifts the rest down', async () => {
    const p = await newPipeline('At')
    const res = await admin.post(`/api/pipelines/${p.id}/stages`, { name: 'First', position: 1 })
    expect(stageNames(res.body.pipeline)[0]).toBe('First')
    expect(res.body.pipeline.stages.map((s: Stage) => s.position)).toEqual([1, 2, 3, 4, 5, 6])
    // Past the end means the end.
    const end = await admin.post(`/api/pipelines/${p.id}/stages`, { name: 'Far', position: 99 })
    expect(end.body.pipeline.stages.at(-1).name).toBe('Far')
  })

  it('refuses a closed stage first, a repeated name and a bad probability', async () => {
    const p = await newPipeline('Bad')
    const first = await admin.post(`/api/pipelines/${p.id}/stages`, {
      name: 'Done',
      kind: 'won',
      position: 1,
    })
    expect(first.status).toBe(400)
    expect(first.body.error.details).toHaveProperty('kind')
    expect((await admin.post(`/api/pipelines/${p.id}/stages`, { name: ' proposal ' })).status).toBe(
      409,
    )
    for (const probability of [-1, 101, 5.5, '10']) {
      expect(
        (await admin.post(`/api/pipelines/${p.id}/stages`, { name: 'P', probability })).status,
      ).toBe(400)
    }
    expect((await admin.post(`/api/pipelines/${p.id}/stages`, { name: '  ' })).status).toBe(400)
    expect(
      (await admin.post(`/api/pipelines/${p.id}/stages`, { name: 'K', kind: 'maybe' })).status,
    ).toBe(400)
    expect((await admin.post('/api/pipelines/missing/stages', { name: 'x' })).status).toBe(404)
    expect(await prisma.stage.count({ where: { pipelineId: p.id } })).toBe(5)
  })
})

describe('changing a stage', () => {
  it('renames it and changes its probability', async () => {
    const p = await newPipeline('Edit')
    const [first] = p.stages
    const res = await admin.patch(`/api/pipelines/${p.id}/stages/${first.id}`, {
      name: 'Discovery',
      probability: 15,
    })
    expect(res.status).toBe(200)
    expect(res.body.pipeline.stages[0]).toMatchObject({
      id: first.id,
      name: 'Discovery',
      probability: 15,
    })
    expect(
      (await admin.patch(`/api/pipelines/${p.id}/stages/${first.id}`, { name: 'PROPOSAL' })).status,
    ).toBe(409)
    expect(
      (await admin.patch(`/api/pipelines/${p.id}/stages/${first.id}`, { probability: 200 })).status,
    ).toBe(400)
    expect((await admin.patch(`/api/pipelines/${p.id}/stages/missing`, { name: 'x' })).status).toBe(
      404,
    )
    // Another pipeline's stage is not found through this one.
    const other = await newPipeline('Other')
    expect(
      (await admin.patch(`/api/pipelines/${other.id}/stages/${first.id}`, { name: 'x' })).status,
    ).toBe(404)
  })

  it('leaves existing deals’ own probabilities alone when only the stage’s changes', async () => {
    const p = await newPipeline('Prob')
    const deal = await addDeal(p.stages[1].id, 'Own', { probability: 33 })
    await admin.patch(`/api/pipelines/${p.id}/stages/${p.stages[1].id}`, { probability: 90 })
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).probability).toBe(33)
  })

  it('closes the deals in a stage that becomes won, and reopens them when it becomes open again', async () => {
    const p = await newPipeline('Kind')
    const stage = p.stages[1]
    const fresh = await addDeal(stage.id, 'Fresh')
    const already = await addDeal(stage.id, 'Already', {
      status: 'LOST',
      closedAt: new Date('2026-01-02T00:00:00Z'),
    })

    const won = await admin.patch(`/api/pipelines/${p.id}/stages/${stage.id}`, { kind: 'won' })
    expect(won.status).toBe(200)
    expect(won.body.pipeline.stages[1]).toMatchObject({
      isWon: true,
      isLost: false,
      probability: 100,
    })
    const afterWon = await prisma.deal.findMany({
      where: { stageId: stage.id },
      orderBy: { title: 'asc' },
    })
    expect(afterWon.map((d) => [d.status, d.probability])).toEqual([
      ['WON', 100],
      ['WON', 100],
    ])
    expect(afterWon.find((d) => d.id === fresh.id)!.closedAt).not.toBeNull()
    // A deal that had already closed keeps the day it did.
    expect(afterWon.find((d) => d.id === already.id)!.closedAt!.toISOString()).toBe(
      '2026-01-02T00:00:00.000Z',
    )

    const reopened = await admin.patch(`/api/pipelines/${p.id}/stages/${stage.id}`, {
      kind: 'open',
      probability: 45,
    })
    expect(reopened.body.pipeline.stages[1]).toMatchObject({
      isWon: false,
      isLost: false,
      probability: 45,
    })
    const afterOpen = await prisma.deal.findMany({ where: { stageId: stage.id } })
    expect(
      afterOpen.every((d) => d.status === 'OPEN' && d.closedAt === null && d.probability === 45),
    ).toBe(true)
  })

  it('fixes a lost stage at 0 and gives a reopened one a probability of its own', async () => {
    const p = await newPipeline('Fixed')
    const lost = await admin.patch(`/api/pipelines/${p.id}/stages/${p.stages[1].id}`, {
      kind: 'lost',
      probability: 70,
    })
    expect(lost.body.pipeline.stages[1]).toMatchObject({ isLost: true, probability: 0 })
    const reopened = await admin.patch(`/api/pipelines/${p.id}/stages/${p.stages[3].id}`, {
      kind: 'open',
    })
    expect(reopened.body.pipeline.stages[3]).toMatchObject({ isWon: false, probability: 50 })
    // Probability on a closed stage cannot be set.
    const won = await admin.patch(`/api/pipelines/${p.id}/stages/${p.stages[4].id}`, {
      probability: 30,
    })
    expect(won.body.pipeline.stages[4].probability).toBe(0)
  })

  it('will not close the first stage', async () => {
    const p = await newPipeline('First')
    const res = await admin.patch(`/api/pipelines/${p.id}/stages/${p.stages[0].id}`, {
      kind: 'won',
    })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toHaveProperty('kind')
    expect((await prisma.stage.findUniqueOrThrow({ where: { id: p.stages[0].id } })).isWon).toBe(
      false,
    )
  })
})

describe('putting stages in order', () => {
  const order = (p: Pipeline, ...names: string[]) =>
    names.map((n) => p.stages.find((s) => s.name === n)!.id)

  it('puts them in the order given, numbered from 1', async () => {
    const p = await newPipeline('Order')
    const ids = order(p, 'Proposal', 'Qualification', 'Negotiation', 'Closed lost', 'Closed won')
    const res = await admin.put(`/api/pipelines/${p.id}/stages/order`, { stageIds: ids })
    expect(res.status).toBe(200)
    expect(stageNames(res.body.pipeline)).toEqual([
      'Proposal',
      'Qualification',
      'Negotiation',
      'Closed lost',
      'Closed won',
    ])
    expect(res.body.pipeline.stages.map((s: Stage) => s.position)).toEqual([1, 2, 3, 4, 5])
    expect(
      await prisma.auditLog.count({ where: { action: 'STAGES_REORDERED', entityId: p.id } }),
    ).toBe(1)
  })

  it('needs every stage exactly once, and an open stage first', async () => {
    const p = await newPipeline('Order bad')
    const all = p.stages.map((s) => s.id)
    for (const stageIds of [
      all.slice(1),
      [...all, all[0]],
      [...all.slice(1), 'nope'],
      [all[0], all[0], ...all.slice(2)],
    ]) {
      const res = await admin.put(`/api/pipelines/${p.id}/stages/order`, { stageIds })
      expect(res.status).toBe(400)
      expect(res.body.error.details).toHaveProperty('stageIds')
    }
    const closedFirst = await admin.put(`/api/pipelines/${p.id}/stages/order`, {
      stageIds: order(p, 'Closed won', 'Qualification', 'Proposal', 'Negotiation', 'Closed lost'),
    })
    expect(closedFirst.status).toBe(400)
    expect(closedFirst.body.error.message).toContain('first stage')
    expect(
      stageNames(
        (await admin.get('/api/pipelines')).body.pipelines.find((x: Pipeline) => x.id === p.id),
      ),
    ).toEqual(stageNames(p))
    expect(
      (await admin.put('/api/pipelines/missing/stages/order', { stageIds: ['a'] })).status,
    ).toBe(404)
  })
})

describe('deleting a stage', () => {
  it('removes an empty stage and closes the gap in the numbering', async () => {
    const p = await newPipeline('Del')
    const res = await admin.del(`/api/pipelines/${p.id}/stages/${p.stages[1].id}`)
    expect(res.status).toBe(204)
    const now = (await admin.get('/api/pipelines')).body.pipelines.find(
      (x: Pipeline) => x.id === p.id,
    )
    expect(stageNames(now)).toEqual(['Qualification', 'Negotiation', 'Closed won', 'Closed lost'])
    expect(now.stages.map((s: Stage) => s.position)).toEqual([1, 2, 3, 4])
    expect((await admin.del(`/api/pipelines/${p.id}/stages/${p.stages[1].id}`)).status).toBe(404)
  })

  it('will not delete a stage with deals unless they are moved, and moves them as asked', async () => {
    const p = await newPipeline('Move')
    const [qual, prop, , won] = p.stages
    const deal = await addDeal(prop.id, 'Moving')
    const blocked = await admin.del(`/api/pipelines/${p.id}/stages/${prop.id}`)
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.details).toHaveProperty('moveDealsTo')

    // Not into itself, a stage that does not exist, or another pipeline's.
    const other = await newPipeline('Elsewhere')
    for (const target of [prop.id, 'nope', other.stages[0].id]) {
      const res = await admin.del(`/api/pipelines/${p.id}/stages/${prop.id}?moveDealsTo=${target}`)
      expect(res.status, target).toBe(400)
    }
    expect(await prisma.stage.count({ where: { id: prop.id } })).toBe(1)

    // Into a won stage: they close.
    const ok = await admin.del(`/api/pipelines/${p.id}/stages/${prop.id}?moveDealsTo=${won.id}`)
    expect(ok.status).toBe(204)
    const moved = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })
    expect(moved).toMatchObject({ stageId: won.id, status: 'WON', probability: 100 })
    expect(moved.closedAt).not.toBeNull()
    expect(await prisma.stage.count({ where: { id: prop.id } })).toBe(0)

    // Into an open stage: they take its probability.
    const again = await addDeal(qual.id, 'Opening')
    const neg = (await admin.get('/api/pipelines')).body.pipelines
      .find((x: Pipeline) => x.id === p.id)
      .stages.find((s: Stage) => s.name === 'Negotiation')
    await admin.del(`/api/pipelines/${p.id}/stages/${qual.id}?moveDealsTo=${neg.id}`)
    expect(await prisma.deal.findUniqueOrThrow({ where: { id: again.id } })).toMatchObject({
      stageId: neg.id,
      status: 'OPEN',
      probability: neg.probability,
      closedAt: null,
    })
  })

  it('keeps a pipeline usable: a stage, and an open one first', async () => {
    const p = await newPipeline('Keep')
    // Deleting the first leaves an open stage first, so that is fine...
    expect((await admin.del(`/api/pipelines/${p.id}/stages/${p.stages[0].id}`)).status).toBe(204)
    expect((await admin.del(`/api/pipelines/${p.id}/stages/${p.stages[1].id}`)).status).toBe(204)
    // ...until only the open one remains in front of the closed ones.
    const last = (await admin.get('/api/pipelines')).body.pipelines.find(
      (x: Pipeline) => x.id === p.id,
    ).stages[0]
    expect(last.name).toBe('Negotiation')
    const res = await admin.del(`/api/pipelines/${p.id}/stages/${last.id}`)
    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain('first stage')
    // A single-stage pipeline cannot lose its stage.
    const solo = await newPipeline('Solo')
    for (const s of solo.stages.slice(1).reverse())
      await admin.del(`/api/pipelines/${solo.id}/stages/${s.id}`)
    const only = await admin.del(`/api/pipelines/${solo.id}/stages/${solo.stages[0].id}`)
    expect(only.status).toBe(409)
    expect(only.body.error.message).toContain('at least one stage')
  })
})
