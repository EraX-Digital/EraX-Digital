import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'
import { verifyPostgres } from './verify'

const directory = path.join(tmpdir(), `erax-pg-${process.pid}`)
const port = 55432
const user = 'erax'
const password = 'erax_verify_only'
const database = 'erax_verify'
const postgres = new EmbeddedPostgres({
  databaseDir: directory,
  user,
  password,
  port,
  persistent: false,
  autoRehydrateSymlinks: true,
})

let verified = false
try {
  await postgres.initialise()
  try {
    await postgres.start()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    throw new Error(
      message ||
        'PostgreSQL did not become ready. It refuses to start when the process token is an administrator.',
    )
  }
  await postgres.createDatabase(database)
  const result = await verifyPostgres(
    `postgres://${user}:${password}@127.0.0.1:${port}/${database}`,
    {
      ssl: 'disable',
      max: 2,
    },
  )
  console.log(JSON.stringify(result, null, 2))
  verified = true
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await postgres.stop().catch(() => undefined)
  await rm(directory, { recursive: true, force: true })
}
if (!verified) process.exitCode = 1
