import pg from 'pg'
import { migrate, type SqlExecutor } from './migrate'
import { describeDatabaseUrl } from './target'

const { Pool } = pg

const EXPECTED_TABLES = [
  'audit_logs',
  'auth_challenges',
  'blockchain_assets',
  'blockchain_networks',
  'comment_likes',
  'comments',
  'communities',
  'community_invites',
  'community_members',
  'conversation_participants',
  'conversations',
  'email_verification_tokens',
  'follows',
  'hashtags',
  'media_assets',
  'messages',
  'notification_preferences',
  'notifications',
  'password_reset_tokens',
  'post_bookmarks',
  'post_hashtags',
  'post_likes',
  'post_media',
  'post_reposts',
  'posts',
  'profiles',
  'schema_migrations',
  'indexer_checkpoints',
  'sessions',
  'transaction_status_updates',
  'user_blocks',
  'user_mentions',
  'users',
  'wallet_auth_events',
  'wallet_preferences',
  'wallet_transactions',
  'wallets',
] as const

const EXPECTED_INDEXES = [
  'communities_slug_unique',
  'follows_followee_idx',
  'media_assets_owner_idx',
  'posts_public_created_idx',
  'profiles_username_unique',
  'users_email_unique',
  'wallets_address_exact',
] as const

export type PostgresVerification = {
  host: string
  database: string
  version: string
  role: string
  roleIsSuperuser: boolean
  applied: string[]
  skipped: string[]
  tables: string[]
  indexes: string[]
  foreignKeys: number
  uniqueConstraints: number
  transactionRollback: 'passed'
  uniqueViolation: 'passed'
  foreignKeyViolation: 'passed'
  destructiveStatements: 'none'
}

export async function verifyPostgres(
  connectionString: string,
  options: { ssl?: 'disable' | 'require'; max?: number } = {},
): Promise<PostgresVerification> {
  const target = describeDatabaseUrl(connectionString)
  const pool = new Pool({
    connectionString,
    max: options.max ?? 2,
    application_name: 'erax-verify',
    ...(options.ssl === 'require' ? { ssl: { rejectUnauthorized: true } } : {}),
  })
  const client = await pool.connect()
  try {
    const executor: SqlExecutor = {
      exec: (sql) => client.query(sql),
      query: async (sql) => {
        const result = await client.query<Record<string, unknown>>(sql)
        return { rows: result.rows }
      },
    }
    const first = await migrate(executor)
    const second = await migrate(executor)
    if (second.applied.length > 0) {
      throw new Error(`Migrations were applied again: ${second.applied.join(', ')}`)
    }

    const version = await client.query<{ version: string }>('SELECT version() AS version')
    const role = await client.query<{ role: string; superuser: boolean }>(
      'SELECT current_user AS role, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user',
    )
    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    )
    const tableNames = tables.rows.map((row) => row.table_name)
    const missingTables = EXPECTED_TABLES.filter((name) => !tableNames.includes(name))
    if (missingTables.length > 0) {
      throw new Error(`Missing tables: ${missingTables.join(', ')}`)
    }

    const indexes = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    )
    const indexNames = indexes.rows.map((row) => row.indexname)
    const missingIndexes = EXPECTED_INDEXES.filter((name) => !indexNames.includes(name))
    if (missingIndexes.length > 0) {
      throw new Error(`Missing indexes: ${missingIndexes.join(', ')}`)
    }

    const constraints = await client.query<{ contype: string }>(
      `SELECT contype::text AS contype FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace`,
    )
    const foreignKeys = constraints.rows.filter((row) => row.contype === 'f').length
    const uniqueConstraints = constraints.rows.filter((row) => row.contype === 'u').length
    if (foreignKeys < 1) throw new Error('No foreign keys were created')

    const columns = await client.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'
         AND column_name IN ('id', 'email', 'created_at')`,
    )
    const columnType = new Map(columns.rows.map((row) => [row.column_name, row.data_type]))
    if (columnType.get('id') !== 'uuid') throw new Error('users.id is not uuid')
    if (columnType.get('email') !== 'text') throw new Error('users.email is not text')
    if (columnType.get('created_at') !== 'timestamp with time zone') {
      throw new Error('users.created_at is not timestamp with time zone')
    }

    await client.query('BEGIN')
    await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES ('verify-rollback@example.invalid', 'not-a-real-password-hash')`,
    )
    await client.query('ROLLBACK')
    const rolledBack = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users WHERE email = 'verify-rollback@example.invalid'`,
    )
    if (rolledBack.rows[0]?.count !== '0') {
      throw new Error('A rolled-back insert remained in the database')
    }

    await client.query('BEGIN')
    await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES ('verify-unique@example.invalid', 'not-a-real-password-hash')`,
    )
    let uniqueRejected = false
    try {
      await client.query(
        `INSERT INTO users (email, password_hash)
         VALUES ('verify-unique@example.invalid', 'not-a-real-password-hash')`,
      )
    } catch (error) {
      uniqueRejected = error instanceof Error && 'code' in error && error.code === '23505'
    }
    await client.query('ROLLBACK')
    if (!uniqueRejected) throw new Error('The unique email index did not reject a duplicate')
    const uniqueGone = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users WHERE email = 'verify-unique@example.invalid'`,
    )
    if (uniqueGone.rows[0]?.count !== '0') {
      throw new Error('The unique-constraint probe left a row behind')
    }

    await client.query('BEGIN')
    let foreignKeyRejected = false
    try {
      await client.query(
        `INSERT INTO profiles (user_id, username, display_name)
         VALUES ('00000000-0000-0000-0000-000000000099', 'verify_user', 'Verify')`,
      )
    } catch (error) {
      foreignKeyRejected = error instanceof Error && 'code' in error && error.code === '23503'
    }
    await client.query('ROLLBACK')
    if (!foreignKeyRejected)
      throw new Error('The profile foreign key did not reject an unknown user')

    const roleRow = role.rows[0]
    return {
      host: target.host,
      database: target.database,
      version: version.rows[0]?.version ?? '',
      role: roleRow?.role ?? '',
      roleIsSuperuser: roleRow?.superuser ?? false,
      applied: first.applied,
      skipped: first.skipped,
      tables: tableNames,
      indexes: indexNames,
      foreignKeys,
      uniqueConstraints,
      transactionRollback: 'passed',
      uniqueViolation: 'passed',
      foreignKeyViolation: 'passed',
      destructiveStatements: 'none',
    }
  } finally {
    client.release()
    await pool.end()
  }
}
