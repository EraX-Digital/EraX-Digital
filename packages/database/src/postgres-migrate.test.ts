import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { migrate, type SqlExecutor } from './migrate'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('PostgreSQL server migrations', () => {
  it('applies the foundation migration to a real PostgreSQL database', async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl })
    const executor: SqlExecutor = {
      exec: (sql) => pool.query(sql),
      query: async (sql) => {
        const result = await pool.query<Record<string, unknown>>(sql)
        return { rows: result.rows }
      },
    }
    const first = await migrate(executor)
    const second = await migrate(executor)
    expect(second.applied).toEqual([])
    expect(first.applied.length + first.skipped.length).toBeGreaterThan(0)
    await pool.end()
  })
})
