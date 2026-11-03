import { describe, expect, it } from 'vitest'
import { assertLocalSeedTarget, assertRemoteMigrationApproved, describeDatabaseUrl } from './target'

describe('database target guards', () => {
  it('describes a connection without exposing the password', () => {
    const target = describeDatabaseUrl(
      'postgres://erax:super-secret@ep-example.neon.tech/erax?sslmode=require',
    )
    expect(target).toEqual({ host: 'ep-example.neon.tech', database: 'erax', local: false })
  })

  it('refuses a remote migration until the operator approves that command', () => {
    const url = 'postgres://erax:secret@ep-example.neon.tech/erax'
    expect(() => assertRemoteMigrationApproved(url, undefined)).toThrow(
      /ERAX_APPROVE_REMOTE_MIGRATE/,
    )
    expect(assertRemoteMigrationApproved(url, '1').host).toBe('ep-example.neon.tech')
  })

  it('allows a local migration and refuses to seed a remote database', () => {
    expect(
      assertRemoteMigrationApproved(
        'postgres://erax:erax_local_dev_only@127.0.0.1:5432/erax',
        undefined,
      ).local,
    ).toBe(true)
    expect(() => assertLocalSeedTarget('postgres://erax:secret@ep-example.neon.tech/erax')).toThrow(
      /Refusing to seed/,
    )
  })
})
