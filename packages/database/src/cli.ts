import { fileURLToPath } from 'node:url'
import { loadEnv, resolveRepoPath } from '@erax/config'
import { config as loadDotenv } from 'dotenv'
import { createDatabase, migrateDatabase } from './client'
import { assertRemoteMigrationApproved } from './target'

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url))
loadDotenv({ path: rootEnv })

const env = loadEnv()
const connectionString =
  env.DATABASE_DRIVER === 'postgres' && env.DATABASE_MIGRATION_URL
    ? env.DATABASE_MIGRATION_URL
    : env.DATABASE_URL
const target =
  env.DATABASE_DRIVER === 'postgres'
    ? assertRemoteMigrationApproved(connectionString, process.env.ERAX_APPROVE_REMOTE_MIGRATE)
    : null
if (target) {
  console.error(`Migrating ${target.host}/${target.database}. No tables will be dropped.`)
}

const runtime = await createDatabase({ ...env, DATABASE_URL: connectionString })
const result = await migrateDatabase(runtime)
await runtime.close()
console.log(
  JSON.stringify({
    driver: env.DATABASE_DRIVER,
    host: target?.host ?? null,
    database: target?.database ?? null,
    dir: env.DATABASE_DRIVER === 'pglite' ? resolveRepoPath(env.PGLITE_DIR) : null,
    ...result,
  }),
)
