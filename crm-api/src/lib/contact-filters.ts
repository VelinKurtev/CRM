import { z } from 'zod'

import type { Prisma } from '../generated/prisma/client.js'

/** The search and filters shared by the contact list and the export. */
export const contactFilterSchema = z.object({
  /** Every word must match the name, email, phone, job title or company name. */
  q: z.string().trim().max(100).default(''),
  /** Company id. */
  company: z.string().trim().min(1).optional(),
  /** Tag name. */
  tag: z.string().trim().min(1).optional(),
  /** `me`: only contacts I own. */
  owner: z.enum(['me']).optional(),
})
export const contactSortSchema = z.object({
  sort: z.enum(['name', 'company', 'createdAt']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
})

type Filters = z.infer<typeof contactFilterSchema>

export function buildContactWhere(
  { q, company, tag, owner }: Filters,
  userId: string,
): Prisma.ContactWhereInput {
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const })
  return {
    // "bob ray" finds Bob Ray: each word may match any field, but all words must match.
    AND: q
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => ({
        OR: [
          { firstName: contains(word) },
          { lastName: contains(word) },
          { email: contains(word) },
          { phone: contains(word) },
          { jobTitle: contains(word) },
          { company: { name: contains(word) } },
        ],
      })),
    companyId: company,
    ownerId: owner === 'me' ? userId : undefined,
    tags: tag ? { some: { tag: { name: { equals: tag, mode: 'insensitive' } } } } : undefined,
  }
}

export function contactOrderBy({
  sort,
  dir,
}: z.infer<typeof contactSortSchema>): Prisma.ContactOrderByWithRelationInput[] {
  const order: Prisma.ContactOrderByWithRelationInput[] =
    sort === 'name'
      ? [{ lastName: dir }, { firstName: dir }]
      : sort === 'company'
        ? [{ company: { name: dir } }, { lastName: 'asc' }]
        : [{ createdAt: dir }]
  return [...order, { id: 'asc' }] // a stable order keeps pages from overlapping
}
