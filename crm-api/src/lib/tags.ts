import type { Prisma } from '../generated/prisma/client.js'

type Tx = Prisma.TransactionClient

/** Ids for the tag names: reuse tags regardless of letter case, create the rest. */
export async function resolveTagIds(tx: Tx, names: string[]) {
  const ids: string[] = []
  for (const name of new Map(names.map((t) => [t.toLowerCase(), t])).values()) {
    const found = await tx.tag.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
    const tag = found ?? (await tx.tag.upsert({ where: { name }, update: {}, create: { name } }))
    ids.push(tag.id)
  }
  return ids
}
