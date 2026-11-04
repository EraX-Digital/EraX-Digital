import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { migrate, type SqlExecutor } from './migrate'

describe('migrations', () => {
  it('creates the foundation tables and does nothing on the second run', async () => {
    const client = new PGlite()
    await client.waitReady
    const executor: SqlExecutor = {
      exec: (sql) => client.exec(sql),
      query: async (sql) => {
        const result = await client.query<Record<string, unknown>>(sql)
        return { rows: result.rows }
      },
    }

    const first = await migrate(executor)
    const second = await migrate(executor)
    expect(first.applied).toEqual([
      '0001_foundation',
      '0002_social',
      '0003_wallet',
      '0004_solana_programs',
      '0005_socialfi',
      '0006_socialfi_product',
    ])
    expect(second.applied).toEqual([])
    expect(second.skipped).toEqual([
      '0001_foundation',
      '0002_social',
      '0003_wallet',
      '0004_solana_programs',
      '0005_socialfi',
      '0006_socialfi_product',
    ])

    const tables = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    )
    const names = tables.rows.map((row) => row.tablename)
    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'profiles',
        'wallets',
        'auth_challenges',
        'sessions',
        'email_verification_tokens',
        'password_reset_tokens',
        'audit_logs',
        'schema_migrations',
        'posts',
        'communities',
        'notifications',
        'messages',
        'wallet_transactions',
        'indexer_checkpoints',
        'blockchain_networks',
        'wallet_preferences',
      ]),
    )

    await expect(
      client.exec(
        "insert into wallets (user_id, chain_family, network, address) values ('00000000-0000-0000-0000-000000000000', 'evm', 'eip155:1', '0x0000000000000000000000000000000000000000')",
      ),
    ).rejects.toThrow()

    await client.close()
  })
})
