import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/prisma/client.js'
import { syncPermissions } from '../src/lib/permissions.js'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

async function main() {
  await syncPermissions(prisma)

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } })
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@crm.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!'
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      firstName: 'Admin',
      lastName: 'User',
      roleId: adminRole.id,
    },
  })
  console.log(`Seeded roles, permissions and admin user (${email})`)
}

main().finally(() => prisma.$disconnect())
