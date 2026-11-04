import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/authenticate.js'
import { getPermissions, requirePermission } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'

export const notesRouter = Router()

const noteBody = z
  .string()
  .trim()
  .min(1, 'Note cannot be empty')
  .max(5000, 'Keep it under 5000 characters')

/** A note belongs to exactly one contact, company or deal. */
const createNoteSchema = z
  .object({
    body: noteBody,
    contactId: z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),
    dealId: z.string().min(1).optional(),
  })
  .refine((v) => [v.contactId, v.companyId, v.dealId].filter((x) => x !== undefined).length === 1, {
    message: 'Give exactly one of contactId, companyId or dealId',
    path: ['_'],
  })

const updateNoteSchema = z.object({ body: noteBody })

const noteSelect = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, firstName: true, lastName: true } },
} as const

const idOf = (req: { params: Record<string, string | string[] | undefined> }) =>
  req.params.id as string

// ───────── Add ─────────

notesRouter.post(
  '/notes',
  requirePermission('notes:write'),
  validateBody(createNoteSchema),
  async (req, res) => {
    const userId = req.auth!.userId
    const { body, contactId, companyId, dealId } = req.body as z.infer<typeof createNoteSchema>

    // You can note a record you may look at, and it has to exist.
    const [kind, label, exists] = contactId
      ? (['contacts', 'Contact', () => prisma.contact.count({ where: { id: contactId } })] as const)
      : companyId
        ? ([
            'companies',
            'Company',
            () => prisma.company.count({ where: { id: companyId } }),
          ] as const)
        : (['deals', 'Deal', () => prisma.deal.count({ where: { id: dealId } })] as const)
    if (!(await getPermissions(userId)).has(`${kind}:read`)) {
      throw new HttpError(403, 'You do not have permission')
    }
    if (!(await exists())) throw new HttpError(404, `${label} not found`)

    const note = await prisma.note.create({
      data: { body, authorId: userId, contactId, companyId, dealId },
      select: noteSelect,
    })
    res.status(201).json({ note })
  },
)

// ───────── Edit and delete ─────────

/** Edit your own notes only: a note is a record of who wrote what. */
notesRouter.patch(
  '/notes/:id',
  requirePermission('notes:write'),
  validateBody(updateNoteSchema),
  async (req, res) => {
    const id = idOf(req)
    const existing = await prisma.note.findUnique({ where: { id }, select: { authorId: true } })
    if (!existing) throw new HttpError(404, 'Note not found')
    if (existing.authorId !== req.auth!.userId) {
      throw new HttpError(403, 'You can only edit your own notes')
    }
    const note = await prisma.note.update({
      where: { id },
      data: { body: (req.body as z.infer<typeof updateNoteSchema>).body },
      select: noteSelect,
    })
    res.json({ note })
  },
)

/** Delete your own notes, or anyone's with `notes:delete`. */
notesRouter.delete('/notes/:id', authenticate, async (req, res) => {
  const userId = req.auth!.userId
  const permissions = await getPermissions(userId)
  const id = idOf(req)
  const existing = await prisma.note.findUnique({ where: { id }, select: { authorId: true } })
  if (!existing) throw new HttpError(404, 'Note not found')

  const own = existing.authorId === userId && permissions.has('notes:write')
  if (!own && !permissions.has('notes:delete')) {
    throw new HttpError(403, 'You can only delete your own notes')
  }
  await prisma.note.delete({ where: { id } })
  res.status(204).end()
})
