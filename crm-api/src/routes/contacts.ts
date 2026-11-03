import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { httpUrl, optionalText, requiredText } from '../lib/validation.js'
import { requirePermission, userHasPermission } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'

export const contactsRouter = Router()

const createContactSchema = z.object({
  firstName: requiredText('First name', 100),
  lastName: requiredText('Last name', 100),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')).optional(),
  phone: optionalText(50),
  jobTitle: optionalText(100),
  /** Company name: links to an existing company (any letter case) or creates one. */
  company: optionalText(200),
  address: optionalText(200),
  city: optionalText(100),
  postalCode: optionalText(20),
  country: optionalText(100),
  linkedinUrl: httpUrl.optional(),
  twitterUrl: httpUrl.optional(),
  facebookUrl: httpUrl.optional(),
  tags: z.array(requiredText('Tag', 50)).max(20, 'At most 20 tags').optional(),
  /** Becomes the first note on the contact. */
  note: z.string().trim().min(1).max(5000).optional(),
})

contactsRouter.post(
  '/contacts',
  requirePermission('contacts:write'),
  validateBody(createContactSchema),
  async (req, res) => {
    const userId = req.auth!.userId
    const { company, tags = [], note, ...fields } = req.body as z.infer<typeof createContactSchema>

    // Look up (or decide to create) the company before opening the transaction.
    const existingCompany = company
      ? await prisma.company.findFirst({
          where: { name: { equals: company, mode: 'insensitive' } },
        })
      : null
    if (company && !existingCompany && !(await userHasPermission(userId, 'companies:write'))) {
      throw new HttpError(403, 'You cannot create new companies', {
        company: 'Pick an existing company; you cannot create new ones',
      })
    }

    const contact = await prisma.$transaction(async (tx) => {
      const companyId = company
        ? (
            existingCompany ??
            (await tx.company.create({ data: { name: company, ownerId: userId } }))
          ).id
        : undefined

      // Reuse tags regardless of letter case; create the rest.
      const tagIds: string[] = []
      for (const name of new Map(tags.map((t) => [t.toLowerCase(), t])).values()) {
        const found = await tx.tag.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        })
        const tag =
          found ?? (await tx.tag.upsert({ where: { name }, update: {}, create: { name } }))
        tagIds.push(tag.id)
      }

      return tx.contact.create({
        data: {
          ...fields,
          companyId,
          ownerId: userId,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
          notes: note ? { create: { body: note, authorId: userId } } : undefined,
        },
        include: {
          company: { select: { id: true, name: true } },
          tags: { select: { tag: { select: { name: true } } } },
          notes: { select: { id: true, body: true } },
        },
      })
    })

    const { tags: tagLinks, ...rest } = contact
    res.status(201).json({ contact: { ...rest, tags: tagLinks.map((t) => t.tag.name) } })
  },
)

// ───────── Suggestions for the create form ─────────

const suggestionQuery = z.object({ q: z.string().trim().max(100).default('') })

contactsRouter.get('/companies', requirePermission('companies:read'), async (req, res) => {
  const { q } = suggestionQuery.parse(req.query)
  const companies = await prisma.company.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
    orderBy: { name: 'asc' },
    take: 20,
    select: { id: true, name: true },
  })
  res.json({ companies })
})

contactsRouter.get('/tags', requirePermission('contacts:read'), async (req, res) => {
  const { q } = suggestionQuery.parse(req.query)
  const tags = await prisma.tag.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
    orderBy: { name: 'asc' },
    take: 20,
    select: { name: true },
  })
  res.json({ tags: tags.map((t) => t.name) })
})
