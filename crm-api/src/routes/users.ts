import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
import { signToken } from '../lib/jwt.js'
import { passwordSchema } from '../lib/password-schema.js'
import { prisma } from '../lib/prisma.js'
import { publicUser } from '../lib/public-user.js'
import { startSession } from '../lib/session.js'
import { authenticate } from '../middleware/authenticate.js'
import { validateBody } from '../middleware/validate.js'

export const usersRouter = Router()

const httpUrl = z
  .url('Enter a valid URL')
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v), 'URL must start with http:// or https://')

/** Email and role are deliberately not editable here. */
const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required').max(100),
    lastName: z.string().trim().min(1, 'Last name is required').max(100),
    // Empty string or null clears the avatar.
    avatarUrl: z.union([httpUrl, z.literal(''), z.null()]).transform((v) => v || null),
  })
  .partial()
  .strict()

async function loadUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, include: { role: true } })
  if (!user || !user.isActive) throw new HttpError(401, 'Invalid or expired token')
  return user
}

usersRouter.get('/users/me', authenticate, async (req, res) => {
  res.json({ user: publicUser(await loadUser(req.auth!.userId)) })
})

usersRouter.patch(
  '/users/me',
  authenticate,
  validateBody(updateProfileSchema),
  async (req, res) => {
    await loadUser(req.auth!.userId)
    const data = req.body as z.infer<typeof updateProfileSchema>
    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data,
      include: { role: true },
    })
    res.json({ user: publicUser(user) })
  },
)

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
})

usersRouter.post(
  '/users/me/password',
  authenticate,
  validateBody(changePasswordSchema),
  async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>
    const user = await loadUser(req.auth!.userId)

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'Current password is incorrect', {
        currentPassword: 'Current password is incorrect',
      })
    }
    if (currentPassword === newPassword) {
      throw new HttpError(400, 'New password must be different', {
        newPassword: 'New password must be different from the current one',
      })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      // Sign out every device, including this one; this device gets a fresh session below.
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])

    await startSession(res, user.id)
    res.json({ token: signToken({ sub: user.id, role: user.role.name }), user: publicUser(user) })
  },
)
