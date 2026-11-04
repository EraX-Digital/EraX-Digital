import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type SqlExecutor = {
  exec(sql: string): Promise<unknown>
  query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>
}

const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex')
}

export async function migrate(
  executor: SqlExecutor,
): Promise<{ applied: string[]; skipped: string[] }> {
  await executor.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort()

  const applied: string[] = []
  const skipped: string[] = []

  for (const file of files) {
    const id = file.replace(/\.sql$/, '')
    const sql = await readFile(path.join(migrationsDirectory, file), 'utf8')
    const digest = checksum(sql)
    const existing = await executor.query(
      `SELECT checksum FROM schema_migrations WHERE id = '${id.replaceAll("'", "''")}'`,
    )
    const row = existing.rows[0]
    if (row) {
      if (row.checksum !== digest) {
        throw new Error(`Migration ${id} was already applied with a different checksum`)
      }
      skipped.push(id)
      continue
    }
    await executor.exec(sql)
    await executor.exec(
      `INSERT INTO schema_migrations (id, checksum) VALUES ('${id.replaceAll("'", "''")}', '${digest}')`,
    )
    applied.push(id)
  }

  return { applied, skipped }
}
