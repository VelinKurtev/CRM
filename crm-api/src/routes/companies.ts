import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { httpUrl, optionalText, requiredText } from '../lib/validation.js'
import { getPermissions, requirePermission } from '../middleware/authorize.js'
import { parseQuery, validateBody } from '../middleware/validate.js'

export const companiesRouter = Router()

const idOf = (req: { params: Record<string, string | string[] | undefined> }) =>
  req.params.id as string

// ───────── Shapes ─────────

const employees = z
  .number('Employees must be a number')
  .int('Employees must be a whole number')
  .min(0, 'Employees cannot be negative')
  .max(10_000_000, 'That is too many employees')
const revenue = z
  .number('Revenue must be a number')
  .min(0, 'Revenue cannot be negative')
  .max(1_000_000_000_000, 'That revenue is too large')
  .refine((v) => Math.round(v * 100) / 100 === v, 'Use at most two decimal places')

const createCompanySchema = z.object({
  name: requiredText('Name', 200),
  industry: optionalText(100),
  employees: employees.optional(),
  revenue: revenue.optional(),
  website: httpUrl.optional(),
})

/** On update, `null` clears an optional field and leaving it out keeps it as it is. */
const updateCompanySchema = z.object({
  name: requiredText('Name', 200).optional(),
  industry: requiredText('Industry', 100).nullable().optional(),
  employees: employees.nullable().optional(),
  revenue: revenue.nullable().optional(),
  website: httpUrl.nullable().optional(),
})

const companySelect = {
  id: true,
  name: true,
  industry: true,
  employees: true,
  revenue: true,
  website: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { contacts: true, deals: true } },
} as const

type Row = Awaited<ReturnType<typeof findOne>>

const findOne = (id: string) => prisma.company.findUnique({ where: { id }, select: companySelect })

/** API shape: revenue as a plain number, counts flattened. */
const present = ({ revenue, _count, ...company }: NonNullable<Row>) => ({
  ...company,
  revenue: revenue === null ? null : Number(revenue),
  contactCount: _count.contacts,
  dealCount: _count.deals,
})

/** Company names are unique whatever their letter case: contacts find companies by name. */
async function assertNameFree(name: string, exceptId?: string) {
  const clash = await prisma.company.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })
  if (clash) {
    throw new HttpError(409, 'A company with this name already exists', {
      name: 'A company with this name already exists',
    })
  }
}

// ───────── List ─────────

const listQuery = z.object({
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

/** Companies with their details and counts, for the companies page. */
companiesRouter.get('/companies/details', requirePermission('companies:read'), async (req, res) => {
  const { q, page, pageSize } = parseQuery(listQuery, req.query)
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { industry: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}
  const [total, rows] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: companySelect,
    }),
  ])
  res.json({ companies: rows.map(present), total, page, pageSize })
})

// ───────── Everything about one company ─────────

/** Each section shows the newest or first this many; `total` says how many there are. */
const SECTION_LIMIT = 50

/**
 * The company with its contacts, deals and notes, for the detail page. A section the caller may
 * not read (`contacts:read`, `deals:read`, `notes:read`) comes back as `null`.
 */
companiesRouter.get(
  '/companies/:id/overview',
  requirePermission('companies:read'),
  async (req, res) => {
    const id = idOf(req)
    const company = await findOne(id)
    if (!company) throw new HttpError(404, 'Company not found')
    const can = await getPermissions(req.auth!.userId)

    const [contacts, deals, openDeals, notes] = await Promise.all([
      can.has('contacts:read')
        ? Promise.all([
            prisma.contact.count({ where: { companyId: id } }),
            prisma.contact.findMany({
              where: { companyId: id },
              orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
              take: SECTION_LIMIT,
              select: {
                id: true,
                firstName: true,
                lastName: true,
                jobTitle: true,
                email: true,
                phone: true,
              },
            }),
          ])
        : null,
      can.has('deals:read')
        ? Promise.all([
            prisma.deal.count({ where: { companyId: id } }),
            prisma.deal.findMany({
              where: { companyId: id },
              orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
              take: SECTION_LIMIT,
              select: {
                id: true,
                title: true,
                amount: true,
                currency: true,
                status: true,
                expectedClose: true,
                stage: { select: { name: true } },
              },
            }),
          ])
        : null,
      can.has('deals:read')
        ? prisma.deal.groupBy({
            by: ['currency'],
            where: { companyId: id, status: 'OPEN' },
            _sum: { amount: true },
            _count: true,
          })
        : null,
      can.has('notes:read')
        ? Promise.all([
            prisma.note.count({ where: { companyId: id } }),
            prisma.note.findMany({
              where: { companyId: id },
              orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
              take: SECTION_LIMIT,
              select: {
                id: true,
                body: true,
                createdAt: true,
                author: { select: { id: true, firstName: true, lastName: true } },
              },
            }),
          ])
        : null,
    ])

    res.json({
      company: present(company),
      contacts: contacts && { total: contacts[0], items: contacts[1] },
      deals: deals && {
        total: deals[0],
        items: deals[1].map(({ amount, stage, ...d }) => ({
          ...d,
          amount: Number(amount),
          stage: stage.name,
        })),
        // Open deals' value per currency, since deals may be in different currencies.
        open: (openDeals ?? []).map((g) => ({
          currency: g.currency,
          count: g._count,
          value: Number(g._sum.amount ?? 0),
        })),
      },
      notes: notes && { total: notes[0], items: notes[1] },
    })
  },
)

// ───────── Create, read, update ─────────

companiesRouter.post(
  '/companies',
  requirePermission('companies:write'),
  validateBody(createCompanySchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof createCompanySchema>
    await assertNameFree(body.name)
    const created = await prisma.company.create({
      data: { ...body, ownerId: req.auth!.userId },
      select: { id: true },
    })
    res.status(201).json({ company: present((await findOne(created.id))!) })
  },
)

companiesRouter.get('/companies/:id', requirePermission('companies:read'), async (req, res) => {
  const company = await findOne(idOf(req))
  if (!company) throw new HttpError(404, 'Company not found')
  res.json({ company: present(company) })
})

companiesRouter.patch(
  '/companies/:id',
  requirePermission('companies:write'),
  validateBody(updateCompanySchema),
  async (req, res) => {
    const id = idOf(req)
    const body = req.body as z.infer<typeof updateCompanySchema>
    if (!(await prisma.company.findUnique({ where: { id }, select: { id: true } }))) {
      throw new HttpError(404, 'Company not found')
    }
    if (body.name !== undefined) await assertNameFree(body.name, id)
    await prisma.company.update({ where: { id }, data: body })
    res.json({ company: present((await findOne(id))!) })
  },
)
