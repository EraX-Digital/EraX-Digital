import { fileURLToPath } from 'node:url'
import { loadEnv } from '@erax/config'
import { config as loadDotenv } from 'dotenv'
import { createDatabase, migrateDatabase } from './client'
import { assertDemoSeedAllowed, cleanupSocialDemo, seedSocialDemo } from './socialfi-demo'

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url))
loadDotenv({ path: rootEnv })
const env = loadEnv()

const target = process.argv.includes('--production')
  ? 'production'
  : process.argv.includes('--staging')
    ? 'staging'
    : 'local'
const confirm = process.argv.find((arg) => arg.startsWith('--confirm='))?.slice('--confirm='.length)

assertDemoSeedAllowed({
  nodeEnv: env.NODE_ENV,
  driver: env.DATABASE_DRIVER,
  databaseUrl: env.DATABASE_URL,
  target,
  confirm,
  stagingFlag: process.env.ERAX_DEMO_SEED_STAGING,
})

const runtime = await createDatabase(env)
await migrateDatabase(runtime)
const result = process.argv.includes('--cleanup')
  ? await cleanupSocialDemo(runtime.db)
  : await seedSocialDemo(runtime.db)
console.log(JSON.stringify(result))
await runtime.close()
