import { Router } from 'express'
import { z } from 'zod'

import { audit } from '../lib/audit.js'
import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { tagsSchema } from '../lib/contact-schemas.js'
import { resolveTagIds } from '../lib/tags.js'
import { requiredText } from '../lib/validation.js'
import { requirePermission } from '../middleware/authorize.js'
import { parseQuery, validateBody } from '../middleware/validate.js'

export const tagsRouter = Router()

const MAX_BULK_CONTACTS = 500
const MAX_TAGS_PER_CONTACT = 20 // same limit as editing one contact

const idOf = (req: { params: Record<string, string | string[] | undefined> }) =>
  req.params.id as string

// ───────── Tag many contacts at once ─────────

const bulkTagsSchema = z
  .object({
    contactIds: z
      .array(z.string().trim().min(1))
      .min(1, 'Select at least one contact')
      .max(MAX_BULK_CONTACTS, `At most ${MAX_BULK_CONTACTS} contacts at a time`),
    /** Tags to put on every selected contact (new tags are created). */
    add: tagsSchema.default([]),
    /** Tags to take off every selected contact (unknown tags are ignored). */
    remove: tagsSchema.default([]),
  })
  .refine((v) => v.add.length + v.remove.length > 0, { message: 'Choose tags to add or remove' })
  .refine(
    (v) => {
      const added = new Set(v.add.map((t) => t.toLowerCase()))
      return !v.remove.some((t) => added.has(t.toLowerCase()))
    },
    { message: 'A tag cannot be both added and removed', path: ['remove'] },
  )

tagsRouter.post(
  '/contacts/bulk-tags',
  requirePermission('contacts:write'),
  validateBody(bulkTagsSchema),
  async (req, res) => {
    const { contactIds, add, remove } = req.body as z.infer<typeof bulkTagsSchema>
    const ids = [...new Set(contactIds)]

    const updated = await prisma.$transaction(async (tx) => {
      const contacts = await tx.contact.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      })
      const found = contacts.map((c) => c.id)

      if (remove.length > 0) {
        await tx.tagOnContact.deleteMany({
          where: {
            contactId: { in: found },
            tag: { OR: remove.map((name) => ({ name: { equals: name, mode: 'insensitive' } })) },
          },
        })
      }
      if (add.length > 0) {
        const tagIds = await resolveTagIds(tx, add)
        await tx.tagOnContact.createMany({
          data: found.flatMap((contactId) => tagIds.map((tagId) => ({ tagId, contactId }))),
          skipDuplicates: true,
        })
        const crowded = await tx.tagOnContact.groupBy({
          by: ['contactId'],
          where: { contactId: { in: found } },
          _count: { tagId: true },
          having: { tagId: { _count: { gt: MAX_TAGS_PER_CONTACT } } },
        })
        if (crowded.length > 0) {
          // Throwing rolls everything back, so a refused request changes nothing.
          throw new HttpError(
            400,
            `${crowded.length} of the selected contacts would have more than ${MAX_TAGS_PER_CONTACT} tags`,
            { add: `A contact can have at most ${MAX_TAGS_PER_CONTACT} tags` },
          )
        }
      }
      return found.length
    })

    await audit({
      action: 'BULK_TAG',
      userId: req.auth!.userId,
      entityType: 'Contact',
      ip: req.ip,
      changes: {
        contacts: updated,
        added: add.join('; ') || null,
        removed: remove.join('; ') || null,
      },
    })
    // Ids that matched no contact (deleted meanwhile) are skipped, and counted here.
    res.json({ updated, skipped: ids.length - updated })
  },
)

// ───────── Manage tags ─────────

const detailsQuery = z.object({
  q: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

/** Every tag with its colour and how many records use it, for the filter dropdowns and admin page. */
tagsRouter.get('/tags/details', requirePermission('contacts:read'), async (req, res) => {
  const { q, limit } = parseQuery(detailsQuery, req.query)
  const tags = await prisma.tag.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
    orderBy: { name: 'asc' },
    take: limit,
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { contacts: true, companies: true, leads: true, deals: true } },
    },
  })
  res.json({
    tags: tags.map(({ _count, ...t }) => ({
      ...t,
      contactCount: _count.contacts,
      // Tags are shared by contacts, companies, leads and deals; deleting one affects all of them.
      usageCount: _count.contacts + _count.companies + _count.leads + _count.deals,
    })),
  })
})

const updateTagSchema = z
  .object({
    name: requiredText('Name', 50).optional(),
    /** `#rrggbb`, or `null` for no colour. */
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #3b82f6')
      .transform((c) => c.toLowerCase())
      .nullable()
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.color !== undefined, {
    message: 'Nothing to change',
  })

tagsRouter.patch(
  '/tags/:id',
  requirePermission('tags:manage'),
  validateBody(updateTagSchema),
  async (req, res) => {
    const id = idOf(req)
    const { name, color } = req.body as z.infer<typeof updateTagSchema>

    const tag = await prisma.tag.findUnique({ where: { id } })
    if (!tag) throw new HttpError(404, 'Tag not found')

    if (name !== undefined) {
      // Tag names are unique whatever their letter case; changing only the case of this tag's own
      // name is fine.
      const clash = await prisma.tag.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } },
        select: { id: true },
      })
      if (clash) throw new HttpError(409, 'A tag with this name already exists', { name: 'Taken' })
    }

    const updated = await prisma.tag.update({ where: { id }, data: { name, color } })
    await audit({
      action: 'UPDATE',
      userId: req.auth!.userId,
      entityType: 'Tag',
      entityId: id,
      ip: req.ip,
      changes: {
        ...(name !== undefined && name !== tag.name ? { name: `${tag.name} → ${name}` } : {}),
        ...(color !== undefined && color !== tag.color
          ? { color: `${tag.color ?? 'none'} → ${color ?? 'none'}` }
          : {}),
      },
    })
    res.json({ tag: { id: updated.id, name: updated.name, color: updated.color } })
  },
)

/** Removes the tag from everything that uses it. The records themselves stay. */
tagsRouter.delete('/tags/:id', requirePermission('tags:manage'), async (req, res) => {
  const id = idOf(req)
  const tag = await prisma.tag.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!tag) throw new HttpError(404, 'Tag not found')

  await prisma.tag.delete({ where: { id } }) // links cascade
  await audit({
    action: 'DELETE',
    userId: req.auth!.userId,
    entityType: 'Tag',
    entityId: id,
    ip: req.ip,
    changes: { name: tag.name },
  })
  res.status(204).end()
})
