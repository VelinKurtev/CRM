import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
import { signToken } from '../lib/jwt.js'
import { ROLES } from '../lib/permissions.js'
import { passwordSchema } from '../lib/password-schema.js'
import { prisma } from '../lib/prisma.js'
import { publicUser, userInclude } from '../lib/public-user.js'
import { startSession } from '../lib/session.js'
import { authenticate } from '../middleware/authenticate.js'
import { requirePermission } from '../middleware/authorize.js'
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
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude })
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
      include: userInclude,
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

// ───────── Admin: users & roles ─────────

const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

usersRouter.get('/users', requirePermission('users:manage'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) throw new HttpError(400, 'Invalid query')
  const { q, page, pageSize } = parsed.data

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' as const } },
          { firstName: { contains: q, mode: 'insensitive' as const } },
          { lastName: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  res.json({
    users: users.map((u) => ({ ...publicUser(u), isActive: u.isActive, createdAt: u.createdAt })),
    total,
    page,
    pageSize,
  })
})

const assignRoleSchema = z.object({
  role: z.enum(ROLES, 'Choose Admin, Manager, Sales or Support'),
})

usersRouter.patch(
  '/users/:id/role',
  requirePermission('users:manage'),
  validateBody(assignRoleSchema),
  async (req, res) => {
    const id = req.params.id as string
    const { role: roleName } = req.body as z.infer<typeof assignRoleSchema>

    // Prevents an admin locking themselves (and possibly everyone) out.
    if (id === req.auth!.userId) throw new HttpError(400, 'You cannot change your own role')

    const target = await prisma.user.findUnique({ where: { id }, include: userInclude })
    if (!target) throw new HttpError(404, 'User not found')

    const role = await prisma.role.findUnique({ where: { name: roleName } })
    if (!role) throw new HttpError(500, 'Roles are not set up; run the seed')

    const [updated] = await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { roleId: role.id }, include: userInclude }),
      prisma.auditLog.create({
        data: {
          action: 'ROLE_CHANGE',
          entityType: 'User',
          entityId: id,
          userId: req.auth!.userId,
          changes: { from: target.role.name, to: roleName },
        },
      }),
    ])
    res.json({ user: { ...publicUser(updated), isActive: updated.isActive } })
  },
)

usersRouter.get('/roles', requirePermission('users:manage'), async (_req, res) => {
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
  })
  const order = (n: string) => ROLES.indexOf(n as (typeof ROLES)[number])
  res.json({
    roles: roles
      .sort((a, b) => order(a.name) - order(b.name))
      .map((r) => ({
        name: r.name,
        permissions: r.permissions.map((rp) => rp.permission.key).sort(),
      })),
  })
})
