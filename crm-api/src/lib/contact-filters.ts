import { z } from 'zod'

import type { Prisma } from '../generated/prisma/client.js'

/** The search and filters shared by the contact list and the export. */
export const contactFilterSchema = z.object({
  /** Every word must match the name, email, phone, job title or company name. */
  q: z.string().trim().max(100).default(''),
  /** Company id. */
  company: z.string().trim().min(1).optional(),
  /** Tag names: repeat the parameter (`tag=a&tag=b`) to filter by several. */
  tag: z
    .preprocess(
      (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
      z.array(z.string().trim().min(1).max(50)).max(20),
    )
    .default([]),
  /** With several tags: `any` keeps contacts with at least one, `all` only those with every one. */
  tagMode: z.enum(['any', 'all']).default('any'),
  /** `me`: only contacts I own. */
  owner: z.enum(['me']).optional(),
})
export const contactSortSchema = z.object({
  sort: z.enum(['name', 'company', 'createdAt']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
})

type Filters = z.infer<typeof contactFilterSchema>

const hasTag = (name: string): Prisma.ContactWhereInput => ({
  tags: { some: { tag: { name: { equals: name, mode: 'insensitive' } } } },
})

/** One clause for the tag filter: every tag (`all`) or at least one of them (`any`). */
function tagClauses(tag: string[], mode: 'any' | 'all'): Prisma.ContactWhereInput[] {
  if (tag.length === 0) return []
  return [mode === 'all' ? { AND: tag.map(hasTag) } : { OR: tag.map(hasTag) }]
}

export function buildContactWhere(
  { q, company, tag, tagMode, owner }: Filters,
  userId: string,
): Prisma.ContactWhereInput {
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const })
  return {
    // "bob ray" finds Bob Ray: each word may match any field, but all words must match.
    AND: [
      ...q
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
      ...tagClauses(tag, tagMode),
    ],
    companyId: company,
    ownerId: owner === 'me' ? userId : undefined,
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
