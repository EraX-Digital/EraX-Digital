export type DatabaseTarget = {
  host: string
  database: string
  local: boolean
}

export function describeDatabaseUrl(connectionString: string): DatabaseTarget {
  let parsed: URL
  try {
    parsed = new URL(connectionString.replace(/^postgres(ql)?:/i, 'http:'))
  } catch {
    throw new Error('The database connection string is not a valid URL')
  }
  const host = parsed.hostname
  if (!host) throw new Error('The database connection string has no host')
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] ?? '')
  return {
    host,
    database,
    local: host === 'localhost' || host === '127.0.0.1' || host === '::1',
  }
}

export function assertRemoteMigrationApproved(
  connectionString: string,
  approval: string | undefined,
): DatabaseTarget {
  const target = describeDatabaseUrl(connectionString)
  if (!target.local && approval !== '1') {
    throw new Error(
      `Refusing to migrate ${target.host}/${target.database || '(no database name)'}. ` +
        'This command applies additive migrations and does not drop data. ' +
        'Set ERAX_APPROVE_REMOTE_MIGRATE=1 for this command only after you have confirmed the host.',
    )
  }
  return target
}

export function assertLocalSeedTarget(connectionString: string): void {
  const target = describeDatabaseUrl(connectionString)
  if (!target.local) {
    throw new Error(
      `Refusing to seed ${target.host}/${target.database || '(no database name)'}. ` +
        'The seed creates one development administrator and must not run against a remote or production database.',
    )
  }
}
