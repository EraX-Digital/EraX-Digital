import { describe, expect, it } from 'vitest'
import { publicCheckDetail } from './public-error'

describe('public check details', () => {
  it('hides connection strings and keeps ordinary failure text', () => {
    expect(
      publicCheckDetail(
        new Error('connect failed: postgres://erax:secret@db.example/erax'),
        'Database check failed',
      ),
    ).toBe('Database check failed')
    expect(
      publicCheckDetail(new Error('connect ECONNREFUSED 10.0.0.8:5432'), 'Database check failed'),
    ).toBe('connect ECONNREFUSED 10.0.0.8:5432')
  })
})
