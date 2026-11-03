import { afterEach, describe, expect, it } from 'vitest'
import { publicApiUrl } from './public-url'

const previous = process.env.VERCEL_ENV

afterEach(() => {
  if (previous === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = previous
})

describe('publicApiUrl', () => {
  it('uses the local API during development', () => {
    delete process.env.VERCEL_ENV
    expect(publicApiUrl(undefined)).toBe('http://127.0.0.1:4000')
  })

  it('rejects a local API URL for a Vercel production build', () => {
    process.env.VERCEL_ENV = 'production'
    expect(() => publicApiUrl('http://127.0.0.1:4000')).toThrow(/https/)
    expect(publicApiUrl('https://api.erax.digital')).toBe('https://api.erax.digital')
  })
})
