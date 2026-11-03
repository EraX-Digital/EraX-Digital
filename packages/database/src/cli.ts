import { fileURLToPath } from 'node:url'
import { loadEnv, resolveRepoPath } from '@erax/config'
import { config as loadDotenv } from 'dotenv'
import { createDatabase, migrateDatabase } from './client'

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url))
loadDotenv({ path: rootEnv })

const env = loadEnv()
const runtime = await createDatabase(env)
const result = await migrateDatabase(runtime)
await runtime.close()
console.log(
  JSON.stringify({
    driver: env.DATABASE_DRIVER,
    dir: env.DATABASE_DRIVER === 'pglite' ? resolveRepoPath(env.PGLITE_DIR) : null,
    ...result,
  }),
)
