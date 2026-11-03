import { fileURLToPath } from 'node:url'
import { loadEnv } from '@erax/config'
import { config as loadDotenv } from 'dotenv'
import { assertRemoteMigrationApproved } from './target'
import { verifyPostgres } from './verify'

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url))
loadDotenv({ path: rootEnv })

const env = loadEnv()
if (env.DATABASE_DRIVER !== 'postgres') {
  throw new Error('db:verify requires DATABASE_DRIVER=postgres. It does not verify PGlite.')
}

const connectionString = env.DATABASE_MIGRATION_URL || env.DATABASE_URL
const target = assertRemoteMigrationApproved(connectionString, process.env.ERAX_APPROVE_REMOTE_MIGRATE)
console.error(`Verifying ${target.host}/${target.database}. No tables will be dropped.`)
const result = await verifyPostgres(connectionString, { ssl: env.DATABASE_SSL, max: 2 })
console.log(JSON.stringify(result, null, 2))
