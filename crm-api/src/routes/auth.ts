import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'

import { config } from '../config.js'
import { audit } from '../lib/audit.js'
import { HttpError } from '../lib/http-error.js'
import { signToken } from '../lib/jwt.js'
import { logger } from '../lib/logger.js'
import { sendMail } from '../lib/mailer.js'
import { authLimiter } from '../lib/rate-limit.js'
import { prisma } from '../lib/prisma.js'
import { publicUser, userInclude } from '../lib/public-user.js'
import { endSession, rotateSession, startSession } from '../lib/session.js'
import { authenticate } from '../middleware/authenticate.js'
import { passwordSchema } from '../lib/password-schema.js'
import { validateBody } from '../middleware/validate.js'

export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  password: z.string().min(1, 'Password is required'),
})

// A hash to compare against when the user doesn't exist, so timing doesn't reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

/** Role given to self-registered users (least privilege); an admin can change it later. */
const DEFAULT_ROLE = 'SUPPORT'

const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  password: passwordSchema,
})

const duplicateEmail = () =>
  new HttpError(409, 'An account with this email already exists', {
    email: 'An account with this email already exists',
  })

authRouter.post('/auth/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const { firstName, lastName, email, password } = req.body as z.infer<typeof registerSchema>

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw duplicateEmail()
  }

  const role = await prisma.role.upsert({
    where: { name: DEFAULT_ROLE },
    update: {},
    create: { name: DEFAULT_ROLE },
  })

  try {
    const user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash: await bcrypt.hash(password, 10),
        roleId: role.id,
      },
      include: userInclude,
    })
    await startSession(res, user.id)
    res
      .status(201)
      .json({ token: signToken({ sub: user.id, role: user.role.name }), user: publicUser(user) })
  } catch (err) {
    // Two simultaneous sign-ups with the same email: the unique index decides.
    if ((err as { code?: string }).code === 'P2002') throw duplicateEmail()
    throw err
  }
})

authRouter.post('/auth/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>
  const user = await prisma.user.findUnique({ where: { email }, include: userInclude })

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !valid || !user.isActive) {
    // The reason is recorded for admins only; the client always gets the same message.
    await audit({
      action: 'LOGIN_FAILED',
      userId: user?.id,
      changes: {
        email,
        reason: !user ? 'unknown_email' : !user.isActive ? 'inactive' : 'bad_password',
      },
      ip: req.ip,
    })
    throw new HttpError(401, 'Invalid email or password')
  }

  await audit({ action: 'LOGIN', userId: user.id, ip: req.ip })
  await startSession(res, user.id)
  res.json({ token: signToken({ sub: user.id, role: user.role.name }), user: publicUser(user) })
})

authRouter.post('/auth/refresh', async (req, res) => {
  const user = await rotateSession(req, res)
  res.json({ token: signToken({ sub: user.id, role: user.role.name }), user: publicUser(user) })
})

authRouter.post('/auth/logout', async (req, res) => {
  await endSession(req, res)
  res.status(204).end()
})

authRouter.get('/auth/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: userInclude,
  })
  if (!user || !user.isActive) throw new HttpError(401, 'Invalid or expired token')
  res.json({ user: publicUser(user) })
})

// ───────── Forgot / reset password ─────────

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
})
const resetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
})

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const FORGOT_MESSAGE = 'If an account exists for that email, a reset link has been sent.'

authRouter.post(
  '/auth/forgot-password',
  authLimiter,
  validateBody(forgotSchema),
  async (req, res) => {
    const { email } = req.body as z.infer<typeof forgotSchema>
    const user = await prisma.user.findUnique({ where: { email } })

    if (user?.isActive) {
      const token = randomBytes(32).toString('hex')
      // Only the newest link works: expire any earlier unused ones.
      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + config.RESET_TOKEN_TTL_MINUTES * 60_000),
          },
        }),
      ])

      const link = `${config.APP_URL}/reset-password?token=${token}`
      try {
        await sendMail({
          to: user.email,
          subject: 'Reset your CRM password',
          text: `Hi ${user.firstName},\n\nUse this link to reset your password (valid for ${config.RESET_TOKEN_TTL_MINUTES} minutes):\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
        })
      } catch (err) {
        // Don't tell the client: a failure here must not reveal that the account exists.
        logger.error({ err }, 'Failed to send password reset email')
      }
    }

    // Same response whether or not the account exists.
    res.json({ message: FORGOT_MESSAGE })
  },
)

authRouter.post(
  '/auth/reset-password',
  authLimiter,
  validateBody(resetSchema),
  async (req, res) => {
    const { token, password } = req.body as z.infer<typeof resetSchema>
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    })

    if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
      throw new HttpError(400, 'This reset link is invalid or has expired')
    }

    const passwordHash = await bcrypt.hash(password, 10)
    // Claim the token atomically so a link can't be used twice, even concurrently.
    const claimed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      if (count === 0) return false
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } })
      // Everyone signed in with the old password is signed out.
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      return true
    })
    if (!claimed) throw new HttpError(400, 'This reset link is invalid or has expired')

    await audit({ action: 'PASSWORD_RESET', userId: record.userId, ip: req.ip })
    res.json({ message: 'Password updated. You can now sign in.' })
  },
)
