import { describe, expect, it } from 'vitest'
import {
  hashPassword,
  hashToken,
  validatePassword,
  validateUsername,
  verifyPassword,
} from './index'

describe('password hashing', () => {
  it('verifies Argon2id hashes and rejects the wrong password', async () => {
    const hashed = await hashPassword('correct-horse-1')
    expect(hashed.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(hashed, 'correct-horse-1')).toBe(true)
    expect(await verifyPassword(hashed, 'correct-horse-2')).toBe(false)
  })

  it('rejects weak passwords', () => {
    expect(validatePassword('short1', 'a@b.co')).toMatch(/12/)
    expect(validatePassword('longpassword', 'a@b.co')).toMatch(/number/)
    expect(validatePassword('person1@example.com', 'person1@example.com')).toMatch(/email/)
  })
})

describe('usernames', () => {
  it('reserves administrative names', () => {
    expect(validateUsername('erax')).toMatch(/reserved/)
    expect(validateUsername('ada_lovelace')).toBeNull()
    expect(validateUsername('Bad')).toMatch(/lowercase/)
  })
})

describe('token hashing', () => {
  it('does not store the raw token as the hash', () => {
    const token = 'raw-token-value'
    expect(hashToken(token)).not.toBe(token)
    expect(hashToken(token)).toBe(hashToken(token))
  })
})
