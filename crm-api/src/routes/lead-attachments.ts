import express, { Router } from 'express'
import { z } from 'zod'

import { audit } from '../lib/audit.js'
import { HttpError } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { requirePermission } from '../middleware/authorize.js'
import { parseQuery } from '../middleware/validate.js'

export const leadAttachmentsRouter = Router()

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_LEAD = 25

const param = (req: { params: Record<string, string | string[] | undefined> }, key: string) =>
  req.params[key] as string

const attachmentSelect = {
  id: true,
  name: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
} as const

async function assertLeadExists(id: string) {
  if (!(await prisma.lead.findUnique({ where: { id }, select: { id: true } }))) {
    throw new HttpError(404, 'Lead not found')
  }
}

/** Path separators and control characters (including line breaks) become spaces. */
// oxlint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f/\\]/g
const cleanName = (v: string) => v.replace(UNSAFE_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim()

/** A file name with no path, control characters or surrounding blanks. */
const fileName = z
  .string('Send the file name as ?name=')
  .transform(cleanName)
  .pipe(
    z.string().min(1, 'The file needs a name').max(200, 'Keep the file name under 200 characters'),
  )

const uploadQuery = z.object({
  name: fileName,
  /** The file's real type; the body itself is always sent as application/octet-stream. */
  type: z
    .string()
    .max(100)
    .regex(/^[\w.+-]+\/[\w.+-]+$/)
    .catch('application/octet-stream')
    .default('application/octet-stream'),
})

/** The files attached to a lead, oldest first. */
leadAttachmentsRouter.get(
  '/leads/:id/attachments',
  requirePermission('leads:read'),
  async (req, res) => {
    const id = param(req, 'id')
    await assertLeadExists(id)
    const attachments = await prisma.leadAttachment.findMany({
      where: { leadId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: attachmentSelect,
    })
    res.json({ attachments })
  },
)

/**
 * Attach a file. The request body is the file itself, sent as `Content-Type: application/octet-stream`,
 * with `?name=` (required) and `?type=` (the file's real media type). Up to 10 MB, 25 files per lead.
 */
leadAttachmentsRouter.post(
  '/leads/:id/attachments',
  requirePermission('leads:write'),
  express.raw({ type: 'application/octet-stream', limit: MAX_ATTACHMENT_BYTES }),
  async (req, res) => {
    const id = param(req, 'id')
    const { name, type } = parseQuery(uploadQuery, req.query)
    await assertLeadExists(id)
    const body: unknown = req.body
    if (!Buffer.isBuffer(body)) {
      throw new HttpError(400, 'Send the file as the request body (application/octet-stream)', {
        file: 'Send the file as the request body (application/octet-stream)',
      })
    }
    if (body.length === 0)
      throw new HttpError(400, 'That file is empty', { file: 'That file is empty' })
    if (
      (await prisma.leadAttachment.count({ where: { leadId: id } })) >= MAX_ATTACHMENTS_PER_LEAD
    ) {
      throw new HttpError(409, `A lead can have up to ${MAX_ATTACHMENTS_PER_LEAD} files`)
    }

    const attachment = await prisma.leadAttachment.create({
      data: {
        leadId: id,
        name,
        mimeType: type,
        sizeBytes: body.length,
        data: new Uint8Array(body),
        uploadedById: req.auth!.userId,
      },
      select: attachmentSelect,
    })
    await audit({
      action: 'LEAD_ATTACHMENT_ADDED',
      userId: req.auth!.userId,
      entityType: 'Lead',
      entityId: id,
      changes: { name, sizeBytes: body.length },
      ip: req.ip,
    })
    res.status(201).json({ attachment })
  },
)

/** Download a file. Always as a download, never shown in the page, whatever its type. */
leadAttachmentsRouter.get(
  '/leads/:id/attachments/:attachmentId',
  requirePermission('leads:read'),
  async (req, res) => {
    const file = await prisma.leadAttachment.findFirst({
      where: { id: param(req, 'attachmentId'), leadId: param(req, 'id') },
      select: { name: true, mimeType: true, sizeBytes: true, data: true },
    })
    if (!file) throw new HttpError(404, 'Attachment not found')
    const ascii = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    res
      .status(200)
      .set({
        'Content-Type': file.mimeType,
        'Content-Length': String(file.sizeBytes),
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
      })
      .end(Buffer.from(file.data))
  },
)

leadAttachmentsRouter.delete(
  '/leads/:id/attachments/:attachmentId',
  requirePermission('leads:write'),
  async (req, res) => {
    const leadId = param(req, 'id')
    const found = await prisma.leadAttachment.findFirst({
      where: { id: param(req, 'attachmentId'), leadId },
      select: { id: true, name: true },
    })
    if (!found) throw new HttpError(404, 'Attachment not found')
    await prisma.leadAttachment.delete({ where: { id: found.id } })
    await audit({
      action: 'LEAD_ATTACHMENT_REMOVED',
      userId: req.auth!.userId,
      entityType: 'Lead',
      entityId: leadId,
      changes: { name: found.name },
      ip: req.ip,
    })
    res.status(204).end()
  },
)
