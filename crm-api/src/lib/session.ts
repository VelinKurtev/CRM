import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { CookieOptions, Request, Response } from 'express'

import { config } from '../config.js'
import { HttpError } from './http-error.js'
import { prisma } from './prisma.js'

export const REFRESH_COOKIE = 'crm_refresh'
/** A just-rotated token presented again within this window is a benign race (e.g. two tabs). */
const REUSE_GRACE_MS = 10_000

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const ttlMs = () => config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth', // only sent to the auth endpoints
})

function setCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), maxAge: ttlMs() })
}

export function clearCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions())
}

async function issue(res: Response, userId: string, familyId: string) {
  const token = randomBytes(48).toString('base64url')
  await prisma.refreshToken.create({
    data: { userId, familyId, tokenHash: hash(token), expiresAt: new Date(Date.now() + ttlMs()) },
  })
  setCookie(res, token)
}

/** Start a new session (new token family) after login/register. */
export const startSession = (res: Response, userId: string) => issue(res, userId, randomUUID())

/** Validate the refresh cookie, rotate it, and return the user it belongs to. */
export async function rotateSession(req: Request, res: Response) {
  const fail = () => {
    clearCookie(res)
    return new HttpError(401, 'Session expired')
  }

  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined
  if (!raw) throw fail()

  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash(raw) },
    include: { user: { include: { role: true } } },
  })
  if (!record || record.expiresAt < new Date() || !record.user.isActive) throw fail()

  if (record.revokedAt) {
    // A rotated token was replayed. Outside the grace window assume theft: kill the whole family.
    if (Date.now() - record.revokedAt.getTime() > REUSE_GRACE_MS) {
      await prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    throw fail()
  }

  // Claim atomically so concurrent refreshes can't both succeed.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (count === 0) throw fail()

  await issue(res, record.userId, record.familyId)
  return record.user
}

export async function endSession(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined
  if (raw) {
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(raw) } })
    if (record) {
      await prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
  }
  clearCookie(res)
}
