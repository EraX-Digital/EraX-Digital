import { fileURLToPath } from 'node:url'
import { hashPassword, normalizeEmail } from '@erax/auth'
import { loadEnv } from '@erax/config'
import { config as loadDotenv } from 'dotenv'
import { eq } from 'drizzle-orm'
import { createDatabase, migrateDatabase } from './client'
import { auditLogs, profiles, users } from './schema'
import { assertLocalSeedTarget } from './target'

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url))
loadDotenv({ path: rootEnv })

const env = loadEnv()
if (env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed a production database')
}
for (const candidate of [env.DATABASE_URL, env.DATABASE_MIGRATION_URL]) {
  if (candidate.startsWith('postgres')) assertLocalSeedTarget(candidate)
}

const email = process.env.DEV_ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.DEV_ADMIN_PASSWORD
if (!email || !password || password.length < 12) {
  throw new Error('Set DEV_ADMIN_EMAIL and a DEV_ADMIN_PASSWORD of at least 12 characters')
}

const runtime = await createDatabase(env)
await migrateDatabase(runtime)
const existing = await runtime.db
  .select()
  .from(users)
  .where(eq(users.email, normalizeEmail(email)))
  .limit(1)
if (existing[0]) {
  console.log(JSON.stringify({ seeded: false, reason: 'admin email already exists', email }))
  await runtime.close()
  process.exit(0)
}

const passwordHash = await hashPassword(password)
const username = 'erax_admin'
await runtime.db.transaction(async (tx) => {
  const inserted = await tx
    .insert(users)
    .values({
      email: normalizeEmail(email),
      passwordHash,
      role: 'admin',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning()
  const user = inserted[0]
  if (!user) throw new Error('Admin insert failed')
  await tx.insert(profiles).values({
    userId: user.id,
    username,
    displayName: 'Development admin',
    bio: 'Local development fixture. This is not a production account.',
  })
  await tx.insert(auditLogs).values({
    actorUserId: user.id,
    action: 'dev.admin_seeded',
    targetType: 'user',
    targetId: user.id,
    metadata: { fixture: 'development-admin' },
  })
})

console.log(JSON.stringify({ seeded: true, fixture: 'development-admin', email, username }))
await runtime.close()
