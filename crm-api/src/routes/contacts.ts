import { Router } from 'express'
import { z } from 'zod'

import type { Prisma } from '../generated/prisma/client.js'
import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import {
  buildContactWhere,
  contactFilterSchema,
  contactOrderBy,
  contactSortSchema,
} from '../lib/contact-filters.js'
import { createContactSchema, optionalEmail, tagsSchema } from '../lib/contact-schemas.js'
import { httpUrl, requiredText } from '../lib/validation.js'
import { authenticate } from '../middleware/authenticate.js'
import { getPermissions, requirePermission } from '../middleware/authorize.js'
import { parseQuery, validateBody } from '../middleware/validate.js'

export const contactsRouter = Router()

// ───────── Shared pieces ─────────

/** On update, `null` clears an optional field and leaving it out keeps it as it is. */
const clearable = <T extends z.ZodType>(schema: T) => schema.nullable().optional()

const updateContactSchema = z.object({
  firstName: requiredText('First name', 100).optional(),
  lastName: requiredText('Last name', 100).optional(),
  email: clearable(optionalEmail),
  phone: clearable(requiredText('Phone', 50)),
  jobTitle: clearable(requiredText('Job title', 100)),
  company: clearable(requiredText('Company', 200)),
  address: clearable(requiredText('Address', 200)),
  city: clearable(requiredText('City', 100)),
  postalCode: clearable(requiredText('Postal code', 20)),
  country: clearable(requiredText('Country', 100)),
  linkedinUrl: clearable(httpUrl),
  twitterUrl: clearable(httpUrl),
  facebookUrl: clearable(httpUrl),
  /** Replaces the contact's tags. */
  tags: tagsSchema.optional(),
})

type Tx = Prisma.TransactionClient

/** The company to link to: an existing one (any letter case), or a new one if allowed. */
async function findCompanyOrCheckCanCreate(name: string, canCreate: boolean) {
  const existing = await prisma.company.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  })
  if (!existing && !canCreate) {
    throw new HttpError(403, 'You cannot create new companies', {
      company: 'Pick an existing company; you cannot create new ones',
    })
  }
  return existing
}

async function resolveCompanyId(
  tx: Tx,
  name: string,
  existing: { id: string } | null,
  ownerId: string,
) {
  return (existing ?? (await tx.company.create({ data: { name, ownerId } }))).id
}

/** Ids for the tag names: reuse tags regardless of letter case, create the rest. */
async function resolveTagIds(tx: Tx, names: string[]) {
  const ids: string[] = []
  for (const name of new Map(names.map((t) => [t.toLowerCase(), t])).values()) {
    const found = await tx.tag.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
    const tag = found ?? (await tx.tag.upsert({ where: { name }, update: {}, create: { name } }))
    ids.push(tag.id)
  }
  return ids
}

const contactInclude = {
  company: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { name: true } } } },
  notes: { select: { id: true, body: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
} as const satisfies Prisma.ContactInclude

type ContactWithRelations = Prisma.ContactGetPayload<{ include: typeof contactInclude }>

/** API shape: tags as plain names. */
const present = ({ tags, ...contact }: ContactWithRelations) => ({
  ...contact,
  tags: tags.map((t) => t.tag.name).sort(),
})

/** Deleting needs `contacts:delete`, or `contacts:delete_own` for a contact you own. */
const mayDelete = (permissions: Set<string>, contact: { ownerId: string | null }, userId: string) =>
  permissions.has('contacts:delete') ||
  (permissions.has('contacts:delete_own') && contact.ownerId === userId)

const idOf = (req: { params: Record<string, string | string[] | undefined> }) =>
  req.params.id as string

// ───────── List, search and filter ─────────

const listQuerySchema = contactFilterSchema.extend(contactSortSchema.shape).extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

contactsRouter.get('/contacts', requirePermission('contacts:read'), async (req, res) => {
  const query = parseQuery(listQuerySchema, req.query)
  const { page, pageSize } = query
  const where = buildContactWhere(query, req.auth!.userId)

  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: contactOrderBy(query),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        jobTitle: true,
        createdAt: true,
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    }),
  ])

  res.json({
    contacts: contacts.map(({ tags, ...c }) => ({
      ...c,
      tags: tags.map((t) => t.tag.name).sort(),
    })),
    total,
    page,
    pageSize,
  })
})

// ───────── Create ─────────

contactsRouter.post(
  '/contacts',
  requirePermission('contacts:write'),
  validateBody(createContactSchema),
  async (req, res) => {
    const userId = req.auth!.userId
    const { company, tags = [], note, ...fields } = req.body as z.infer<typeof createContactSchema>

    const existingCompany = company
      ? await findCompanyOrCheckCanCreate(
          company,
          (await getPermissions(userId)).has('companies:write'),
        )
      : null

    const contact = await prisma.$transaction(async (tx) => {
      const companyId = company
        ? await resolveCompanyId(tx, company, existingCompany, userId)
        : undefined
      const tagIds = await resolveTagIds(tx, tags)

      return tx.contact.create({
        data: {
          ...fields,
          companyId,
          ownerId: userId,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
          notes: note ? { create: { body: note, authorId: userId } } : undefined,
        },
        include: contactInclude,
      })
    })

    res.status(201).json({ contact: present(contact) })
  },
)

// ───────── Read, update, delete ─────────

contactsRouter.get('/contacts/:id', requirePermission('contacts:read'), async (req, res) => {
  const userId = req.auth!.userId
  const contact = await prisma.contact.findUnique({
    where: { id: idOf(req) },
    include: {
      ...contactInclude,
      _count: { select: { deals: true, leads: true, tasks: true, activities: true, notes: true } },
    },
  })
  if (!contact) throw new HttpError(404, 'Contact not found')

  const { _count, ...rest } = contact
  res.json({
    contact: {
      ...present(rest),
      // What deleting would remove or detach, so the UI can warn before it happens.
      related: _count,
      canDelete: mayDelete(await getPermissions(userId), contact, userId),
    },
  })
})

contactsRouter.patch(
  '/contacts/:id',
  requirePermission('contacts:write'),
  validateBody(updateContactSchema),
  async (req, res) => {
    const userId = req.auth!.userId
    const id = idOf(req)
    const { company, tags, ...fields } = req.body as z.infer<typeof updateContactSchema>

    if (!(await prisma.contact.findUnique({ where: { id }, select: { id: true } }))) {
      throw new HttpError(404, 'Contact not found')
    }
    const existingCompany = company
      ? await findCompanyOrCheckCanCreate(
          company,
          (await getPermissions(userId)).has('companies:write'),
        )
      : null

    const contact = await prisma.$transaction(async (tx) => {
      // `null` unlinks the company; a name links (or creates) it; absent leaves it alone.
      const companyId =
        company === undefined
          ? undefined
          : company === null
            ? null
            : await resolveCompanyId(tx, company, existingCompany, userId)

      if (tags) {
        const tagIds = await resolveTagIds(tx, tags)
        await tx.tagOnContact.deleteMany({ where: { contactId: id } })
        await tx.tagOnContact.createMany({
          data: tagIds.map((tagId) => ({ tagId, contactId: id })),
        })
      }

      return tx.contact.update({
        where: { id },
        data: { ...fields, companyId },
        include: contactInclude,
      })
    })

    res.json({ contact: present(contact) })
  },
)

contactsRouter.delete('/contacts/:id', authenticate, async (req, res) => {
  const userId = req.auth!.userId
  const permissions = await getPermissions(userId)
  // Either permission lets you in; which contacts you may delete is decided below.
  if (!permissions.has('contacts:delete') && !permissions.has('contacts:delete_own')) {
    throw new HttpError(403, 'You do not have permission')
  }

  const id = idOf(req)
  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { id: true, ownerId: true, firstName: true, lastName: true },
  })
  if (!contact) throw new HttpError(404, 'Contact not found')
  if (!mayDelete(permissions, contact, userId)) {
    throw new HttpError(403, 'You can only delete contacts you own')
  }

  // Notes, tasks, activities and tag links go with the contact; deals and leads stay unlinked.
  await prisma.$transaction([
    prisma.contact.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        action: 'DELETE',
        entityType: 'Contact',
        entityId: id,
        userId,
        ipAddress: req.ip,
        changes: { name: `${contact.firstName} ${contact.lastName}` },
      },
    }),
  ])
  res.status(204).end()
})

// ───────── Suggestions for the create form ─────────

const suggestionQuery = z.object({
  q: z.string().trim().max(100).default(''),
  /** Suggestions stay short; filter dropdowns ask for more. */
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

contactsRouter.get('/companies', requirePermission('companies:read'), async (req, res) => {
  const { q, limit } = parseQuery(suggestionQuery, req.query)
  const companies = await prisma.company.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
    orderBy: { name: 'asc' },
    take: limit,
    select: { id: true, name: true },
  })
  res.json({ companies })
})

contactsRouter.get('/tags', requirePermission('contacts:read'), async (req, res) => {
  const { q, limit } = parseQuery(suggestionQuery, req.query)
  const tags = await prisma.tag.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
    orderBy: { name: 'asc' },
    take: limit,
    select: { name: true },
  })
  res.json({ tags: tags.map((t) => t.name) })
})
