import { mkdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { resolveRepoPath, type Env } from '@erax/config'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import pg from 'pg'
import { migrate, type SqlExecutor } from './migrate'
import { schema } from './schema'

const { Pool } = pg

export type Database = NodePgDatabase<typeof schema>

export type DatabaseRuntime = {
  db: Database
  executor: SqlExecutor
  ping(): Promise<void>
  close(): Promise<void>
}

type PgResult = { rows: Record<string, unknown>[] }

export async function createDatabase(
  env: Pick<Env, 'DATABASE_DRIVER' | 'DATABASE_URL' | 'PGLITE_DIR'>,
): Promise<DatabaseRuntime> {
  if (env.DATABASE_DRIVER === 'pglite') {
    let client: PGlite
    if (env.PGLITE_DIR === ':memory:') {
      client = new PGlite()
    } else {
      const directory = resolveRepoPath(env.PGLITE_DIR)
      await mkdir(directory, { recursive: true })
      client = new PGlite(directory)
    }
    await client.waitReady
    const db = drizzlePglite(client, { schema }) as unknown as Database
    const executor: SqlExecutor = {
      exec: (sql) => client.exec(sql),
      query: async (sql: string) => {
        const result = await client.query<Record<string, unknown>>(sql)
        return { rows: result.rows }
      },
    }
    return {
      db,
      executor,
      ping: async () => {
        await client.query('select 1 as ok')
      },
      close: () => client.close(),
    }
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL })
  const db = drizzle(pool, { schema })
  const executor: SqlExecutor = {
    exec: (sql) => pool.query(sql),
    query: async (sql: string) => {
      const result = (await pool.query(sql)) as PgResult
      return { rows: result.rows }
    },
  }
  return {
    db,
    executor,
    ping: async () => {
      await pool.query('select 1')
    },
    close: () => pool.end(),
  }
}

export async function migrateDatabase(runtime: DatabaseRuntime) {
  return migrate(runtime.executor)
}
