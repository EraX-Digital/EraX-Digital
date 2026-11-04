import { fileURLToPath } from 'node:url'
import { loadEnv } from '@erax/config'
import { config as loadDotenv } from 'dotenv'
import { createDatabase, migrateDatabase } from './client'
import { demoPlan } from '../seeds/socialfi-demo-content'
import { assertDemoSeedAllowed, cleanupSocialDemo, countSocialDemo, seedSocialDemo } from './socialfi-demo'

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url))
loadDotenv({ path: rootEnv })
const env = loadEnv()

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ dryRun: true, ...demoPlan() }))
  process.exit(0)
}

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
  : process.argv.includes('--count')
    ? await countSocialDemo(runtime.db)
    : await seedSocialDemo(runtime.db)
console.log(JSON.stringify(result))
await runtime.close()
