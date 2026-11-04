import { Router } from 'express'
import { z } from 'zod'

import { audit } from '../lib/audit.js'
import { buildContactWhere, contactFilterSchema, contactOrderBy } from '../lib/contact-filters.js'
import { csvRow } from '../lib/csv-write.js'
import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { requirePermission } from '../middleware/authorize.js'
import { parseQuery } from '../middleware/validate.js'

export const contactsExportRouter = Router()

export const MAX_EXPORT_ROWS = 10_000
const BATCH = 1000

/** Same column names the import understands, so an export can be edited and imported elsewhere. */
export const EXPORT_COLUMNS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'job_title',
  'company',
  'address',
  'city',
  'postal_code',
  'country',
  'linkedin',
  'twitter',
  'facebook',
  'tags',
  'owner',
  'created',
]

const exportQuery = contactFilterSchema.extend({
  /** Excel in many European locales expects semicolons. */
  delimiter: z.enum(['comma', 'semicolon']).default('comma'),
})

/**
 * Download the contacts matching the same search and filters as the list (all of them, not one
 * page) as a UTF-8 CSV. Needs `contacts:export`. Notes are not included.
 */
contactsExportRouter.get(
  '/contacts/export',
  requirePermission('contacts:export'),
  async (req, res) => {
    const query = parseQuery(exportQuery, req.query)
    const userId = req.auth!.userId
    const delimiter = query.delimiter === 'semicolon' ? ';' : ','
    const where = buildContactWhere(query, userId)

    const total = await prisma.contact.count({ where })
    if (total > MAX_EXPORT_ROWS) {
      throw new HttpError(
        400,
        `Too many contacts to export at once (${total}). Narrow the search or filters to ${MAX_EXPORT_ROWS} or fewer.`,
      )
    }

    await audit({
      action: 'EXPORT',
      userId,
      entityType: 'Contact',
      ip: req.ip,
      changes: {
        rows: total,
        q: query.q || null,
        company: query.company ?? null,
        tag: query.tag.length ? query.tag.join('; ') : null,
        tagMode: query.tag.length > 1 ? query.tagMode : null,
        owner: query.owner ?? null,
      },
    })

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    )
    res.setHeader('Cache-Control', 'no-store') // personal data: don't let anything keep a copy
    res.write('﻿' + csvRow(EXPORT_COLUMNS, delimiter)) // BOM so Excel reads UTF-8 correctly

    // Read in batches so a large export doesn't sit in memory all at once.
    for (let skip = 0; skip < total; skip += BATCH) {
      const rows = await prisma.contact.findMany({
        where,
        orderBy: contactOrderBy({ sort: 'name', dir: 'asc' }),
        skip,
        take: BATCH,
        include: {
          company: { select: { name: true } },
          owner: { select: { firstName: true, lastName: true } },
          tags: { select: { tag: { select: { name: true } } } },
        },
      })
      res.write(
        rows
          .map((c) =>
            csvRow(
              [
                c.firstName,
                c.lastName,
                c.email,
                c.phone,
                c.jobTitle,
                c.company?.name,
                c.address,
                c.city,
                c.postalCode,
                c.country,
                c.linkedinUrl,
                c.twitterUrl,
                c.facebookUrl,
                c.tags
                  .map((t) => t.tag.name)
                  .sort()
                  .join('; '),
                c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : '',
                c.createdAt.toISOString().slice(0, 10),
              ],
              delimiter,
            ),
          )
          .join(''),
      )
    }
    res.end()
  },
)
