import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'

import { HttpError } from '../lib/http-error.js'
import { signToken } from '../lib/jwt.js'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/authenticate.js'
import { validateBody } from '../middleware/validate.js'

export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  password: z.string().min(1, 'Password is required'),
})

const publicUser = (u: {
  id: string
  email: string
  firstName: string
  lastName: string
  role: { name: string }
}) => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  role: u.role.name,
})

// A hash to compare against when the user doesn't exist, so timing doesn't reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

/** Role given to self-registered users (least privilege); an admin can change it later. */
const DEFAULT_ROLE = 'SUPPORT'

const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
})

const duplicateEmail = () =>
  new HttpError(409, 'An account with this email already exists', {
    email: 'An account with this email already exists',
  })

authRouter.post('/auth/register', validateBody(registerSchema), async (req, res) => {
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
      include: { role: true },
    })
    res
      .status(201)
      .json({ token: signToken({ sub: user.id, role: user.role.name }), user: publicUser(user) })
  } catch (err) {
    // Two simultaneous sign-ups with the same email: the unique index decides.
    if ((err as { code?: string }).code === 'P2002') throw duplicateEmail()
    throw err
  }
})

authRouter.post('/auth/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>
  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } })

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !valid || !user.isActive) throw new HttpError(401, 'Invalid email or password')

  res.json({ token: signToken({ sub: user.id, role: user.role.name }), user: publicUser(user) })
})

authRouter.get('/auth/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { role: true },
  })
  if (!user || !user.isActive) throw new HttpError(401, 'Invalid or expired token')
  res.json({ user: publicUser(user) })
})
