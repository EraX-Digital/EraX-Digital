import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'erax',
  'support',
  'help',
  'system',
  'root',
  'security',
  'official',
  'staff',
  'mod',
  'moderator',
  'null',
  'undefined',
  'api',
  'wallet',
])

export function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  })
}

export function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  return verify(hashValue, password)
}

export function validatePassword(password: string, email: string): string | null {
  if (password.length < 12 || password.length > 128) {
    return 'Password must be between 12 and 128 characters'
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include a letter and a number'
  }
  if (password.toLowerCase() === email.toLowerCase()) {
    return 'Password must be different from the email address'
  }
  return null
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function validateUsername(username: string): string | null {
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return 'Username must be 3-20 characters and use lowercase letters, numbers, or underscores'
  }
  if (RESERVED_USERNAMES.has(username)) {
    return 'That username is reserved'
  }
  return null
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokensMatch(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
