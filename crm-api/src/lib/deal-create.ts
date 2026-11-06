import { z } from 'zod'

import type { PrismaClient } from '../generated/prisma/client.js'
import { ensureFirstDealStage } from './default-pipeline.js'
import { outcomeOf } from './deal-stage.js'
import { HttpError } from './http-error.js'
import { requiredText } from './validation.js'

/** What deals need from the database: a transaction can be passed as well as the client itself. */
export type DealDb = Pick<PrismaClient, 'company' | 'contact' | 'stage' | 'pipeline' | 'deal'>

/** A calendar date from a date input; deals are due to close at the end of that day. */
export const endOfDay = (d: string) => new Date(`${d}T23:59:59.999Z`)

// ───────── Shapes ─────────

export const amount = z
  .number('Value must be a number')
  .min(0, 'Value cannot be negative')
  .max(999_999_999_999, 'That value is too large')
  .refine((v) => Math.round(v * 100) / 100 === v, 'Use at most two decimal places')
export const probability = z
  .number('Probability must be a number')
  .int('Probability must be a whole number')
  .min(0, 'Probability cannot be below 0')
  .max(100, 'Probability cannot be above 100')
export const date = z.iso.date('Enter a valid date')
export const id = (label: string) => z.string().min(1, label)

export const createDealSchema = z.object({
  title: requiredText('Name'),
  amount: amount.optional(),
  stageId: id('Choose a stage').optional(),
  probability: probability.optional(),
  expectedClose: date.optional(),
  companyId: id('Choose a company').optional(),
  contactId: id('Choose a contact').optional(),
})
export type NewDeal = z.infer<typeof createDealSchema>

export const fieldError = (field: string, message: string) =>
  new HttpError(400, message, { [field]: message })

/** The company and contact a deal is for must exist. */
export async function assertCustomer(
  db: DealDb,
  companyId?: string | null,
  contactId?: string | null,
) {
  if (companyId && !(await db.company.findUnique({ where: { id: companyId } }))) {
    throw fieldError('companyId', 'That company does not exist')
  }
  if (contactId && !(await db.contact.findUnique({ where: { id: contactId } }))) {
    throw fieldError('contactId', 'That contact does not exist')
  }
}

/**
 * Add a deal. Without a stage it starts in the first stage of the default pipeline; its probability
 * is the stage's unless one is given, and a deal started in a won or lost stage is closed at once.
 * Returns the new deal's id.
 */
export async function createDealRecord(db: DealDb, input: NewDeal, ownerId: string | null) {
  const { expectedClose, stageId, ...body } = input
  await assertCustomer(db, body.companyId, body.contactId)

  const stage = stageId
    ? await db.stage.findUnique({ where: { id: stageId } })
    : await ensureFirstDealStage(db)
  if (!stage) throw fieldError('stageId', 'That stage does not exist')

  const outcome = outcomeOf(stage)
  const created = await db.deal.create({
    data: {
      ...body,
      expectedClose: expectedClose ? endOfDay(expectedClose) : undefined,
      pipelineId: stage.pipelineId,
      stageId: stage.id,
      status: outcome.status,
      closedAt: outcome.closedAt,
      probability: outcome.probability ?? body.probability ?? stage.probability,
      ownerId,
    },
    select: { id: true },
  })
  return created.id
}
