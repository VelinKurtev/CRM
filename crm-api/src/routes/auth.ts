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
