import { Router } from 'express'
import { z } from 'zod'

import { audit } from '../lib/audit.js'
import { createDealRecord, createDealSchema } from '../lib/deal-create.js'
import { HttpError } from '../lib/http-error.js'
import { CONVERTIBLE_LEAD_STAGES } from '../lib/lead-stages.js'
import { prisma } from '../lib/prisma.js'
import { requiredText } from '../lib/validation.js'
import { requirePermission } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'
import { loadDeal } from './deals.js'
import { loadLead } from './leads.js'

export const leadConvertRouter = Router()

/** Anything left out is taken from the lead, so the body can be empty. */
const convertSchema = createDealSchema.extend({ title: requiredText('Name').optional() })

/**
 * Turn a qualified lead into a deal without re-entering anything. The deal is the lead's name,
 * value, contact and owner unless the request says otherwise; the lead's notes become a note on
 * the deal and its tags are copied. The lead is then won and linked to its deal, and cannot be
 * converted again. All of it happens or none of it does.
 */
leadConvertRouter.post(
  '/leads/:id/convert',
  requirePermission('leads:write', 'deals:write'),
  validateBody(convertSchema),
  async (req, res) => {
    const leadId = req.params.id as string
    const userId = req.auth!.userId
    const body = req.body as z.infer<typeof convertSchema>

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        title: true,
        value: true,
        notes: true,
        status: true,
        contactId: true,
        ownerId: true,
        dealId: true,
        tags: { select: { tagId: true } },
      },
    })
    if (!lead) throw new HttpError(404, 'Lead not found')
    if (lead.dealId) throw new HttpError(409, 'This lead has already been converted to a deal')
    if (!(CONVERTIBLE_LEAD_STAGES as readonly string[]).includes(lead.status)) {
      throw new HttpError(
        409,
        'Only a qualified lead can be converted: move it to Qualified, Proposal Sent or Negotiation first',
      )
    }

    const dealId = await prisma.$transaction(async (tx) => {
      const newDealId = await createDealRecord(
        tx,
        {
          title: lead.title,
          amount: lead.value === null ? 0 : Number(lead.value),
          ...(lead.contactId ? { contactId: lead.contactId } : {}),
          ...body,
        },
        // The deal stays with whoever was working the lead.
        lead.ownerId ?? userId,
      )
      if (lead.notes) {
        await tx.note.create({ data: { body: lead.notes, authorId: userId, dealId: newDealId } })
      }
      await tx.tagOnDeal.createMany({
        data: lead.tags.map((t) => ({ tagId: t.tagId, dealId: newDealId })),
        skipDuplicates: true,
      })
      // Only one request can win this: a second one finds the lead already linked.
      const claimed = await tx.lead.updateMany({
        where: { id: leadId, dealId: null },
        data: { dealId: newDealId, status: 'WON' },
      })
      if (claimed.count === 0) {
        throw new HttpError(409, 'This lead has already been converted to a deal')
      }
      return newDealId
    })

    await audit({
      action: 'LEAD_CONVERTED',
      userId,
      entityType: 'Lead',
      entityId: leadId,
      changes: { dealId },
      ip: req.ip,
    })
    res.status(201).json({ deal: await loadDeal(dealId), lead: await loadLead(leadId) })
  },
)
