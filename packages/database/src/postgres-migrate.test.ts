import { describe, expect, it } from 'vitest'
import { verifyPostgres } from './verify'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('PostgreSQL server migrations', () => {
  it('verifies migrations, constraints, and rollback on a real PostgreSQL database', async () => {
    const result = await verifyPostgres(databaseUrl ?? '', {
      ssl: process.env.DATABASE_SSL === 'require' ? 'require' : 'disable',
    })
    expect(result.transactionRollback).toBe('passed')
    expect(result.uniqueViolation).toBe('passed')
    expect(result.foreignKeyViolation).toBe('passed')
    expect(result.foreignKeys).toBeGreaterThan(0)
    expect(result.applied.length + result.skipped.length).toBeGreaterThan(0)
  })
})
