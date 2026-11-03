import { randomUUID } from 'node:crypto'

import express, { Router } from 'express'
import { z } from 'zod'

import { parseContactsCsv } from '../lib/contact-csv.js'
import { createContactSchema } from '../lib/contact-schemas.js'
import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { getPermissions, requirePermission } from '../middleware/authorize.js'
import { parseQuery } from '../middleware/validate.js'

export const contactsImportRouter = Router()

type NewContact = z.infer<typeof createContactSchema>
type Rejected = { row: number; errors: Record<string, string>; name: string }

const importQuery = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

/** Distinct names, ignoring letter case; the first spelling in the file wins. */
function distinct(names: string[]) {
  const seen = new Map<string, string>()
  for (const name of names) if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name)
  return [...seen.values()]
}

const displayName = (fields: Record<string, unknown>) =>
  [fields.firstName, fields.lastName].filter(Boolean).join(' ') || '(no name)'

/**
 * Import contacts from CSV text (`Content-Type: text/csv`). Rows that fail validation, repeat an
 * email earlier in the file, or match an existing contact are skipped and reported; every other
 * row is imported. `?dryRun=true` does all the checks and saves nothing, for a preview.
 */
contactsImportRouter.post(
  '/contacts/import',
  requirePermission('contacts:write'),
  express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }),
  async (req, res) => {
    const { dryRun } = parseQuery(importQuery, req.query)
    if (typeof req.body !== 'string') {
      throw new HttpError(400, 'Send the file contents with Content-Type: text/csv', {
        file: 'Send the file contents with Content-Type: text/csv',
      })
    }
    const userId = req.auth!.userId
    const { rows, ignoredColumns } = parseContactsCsv(req.body)

    // 1. Validate each row on its own.
    const rejected: Rejected[] = []
    let accepted: { row: number; data: NewContact }[] = []
    for (const { row, fields } of rows) {
      const parsed = createContactSchema.safeParse(fields)
      if (parsed.success) accepted.push({ row, data: parsed.data })
      else {
        const errors: Record<string, string> = {}
        for (const issue of parsed.error.issues)
          errors[String(issue.path[0] ?? 'row')] ??= issue.message
        rejected.push({ row, errors, name: displayName(fields) })
      }
    }

    // 2. Skip emails that repeat earlier in the file or already belong to a contact.
    const emails = [...new Set(accepted.flatMap((a) => (a.data.email ? [a.data.email] : [])))]
    const existing = new Set(
      (
        await prisma.contact.findMany({ where: { email: { in: emails } }, select: { email: true } })
      ).map((c) => c.email),
    )
    const firstSeen = new Map<string, number>()
    accepted = accepted.filter(({ row, data }) => {
      const reject = (message: string) => {
        rejected.push({ row, errors: { email: message }, name: displayName(data) })
        return false
      }
      if (!data.email) return true
      if (existing.has(data.email)) return reject('A contact with this email already exists')
      const earlier = firstSeen.get(data.email)
      if (earlier) return reject(`Same email as row ${earlier} in this file`)
      firstSeen.set(data.email, row)
      return true
    })

    // 3. Companies that don't exist yet can only be created by people allowed to.
    const lower = (s: string) => s.toLowerCase()
    const companyNames = distinct(accepted.flatMap((a) => (a.data.company ? [a.data.company] : [])))
    const existingCompanies = companyNames.length
      ? await prisma.company.findMany({
          where: {
            OR: companyNames.map((name) => ({ name: { equals: name, mode: 'insensitive' } })),
          },
          select: { id: true, name: true },
        })
      : []
    const companyId = new Map(existingCompanies.map((c) => [lower(c.name), c.id]))
    if (!(await getPermissions(userId)).has('companies:write')) {
      accepted = accepted.filter(({ row, data }) => {
        if (!data.company || companyId.has(lower(data.company))) return true
        rejected.push({
          row,
          errors: { company: 'Company does not exist and you cannot create companies' },
          name: displayName(data),
        })
        return false
      })
    }

    rejected.sort((a, b) => a.row - b.row)
    const summary = {
      total: rows.length,
      valid: accepted.length,
      rejected,
      ignoredColumns,
    }
    if (dryRun || accepted.length === 0) {
      res.json({ ...summary, dryRun, imported: 0 })
      return
    }

    // 4. Save every accepted row together: all of them, or (on a database error) none.
    await prisma.$transaction(async (tx) => {
      for (const name of companyNames) {
        if (companyId.has(lower(name))) continue
        companyId.set(
          lower(name),
          (await tx.company.create({ data: { name, ownerId: userId } })).id,
        )
      }

      const tagNames = distinct(accepted.flatMap((a) => a.data.tags ?? []))
      const tagId = new Map<string, string>()
      for (const name of tagNames) {
        const found = await tx.tag.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        })
        const tag =
          found ?? (await tx.tag.upsert({ where: { name }, update: {}, create: { name } }))
        tagId.set(lower(name), tag.id)
      }

      const withIds = accepted.map((a) => ({ ...a, id: randomUUID() }))
      await tx.contact.createMany({
        data: withIds.map(({ id, data: { company, tags: _tags, note: _note, ...fields } }) => ({
          ...fields,
          id,
          companyId: company ? companyId.get(lower(company)) : undefined,
          ownerId: userId,
        })),
      })
      await tx.tagOnContact.createMany({
        data: withIds.flatMap(({ id, data }) =>
          [...new Set((data.tags ?? []).map(lower))].map((t) => ({
            contactId: id,
            tagId: tagId.get(t)!,
          })),
        ),
      })
      await tx.note.createMany({
        data: withIds.flatMap(({ id, data }) =>
          data.note ? [{ contactId: id, body: data.note, authorId: userId }] : [],
        ),
      })
      await tx.auditLog.create({
        data: {
          action: 'IMPORT',
          entityType: 'Contact',
          userId,
          ipAddress: req.ip,
          changes: { imported: withIds.length, skipped: rejected.length },
        },
      })
    })

    res.status(201).json({ ...summary, dryRun: false, imported: accepted.length })
  },
)
