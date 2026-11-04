import { afterEach, describe, expect, it } from 'vitest'
import { publicApiUrl } from './public-url'

const previousVercel = process.env.VERCEL
const previousEnv = process.env.VERCEL_ENV
const previousUrl = process.env.VERCEL_URL

afterEach(() => {
  if (previousVercel === undefined) delete process.env.VERCEL
  else process.env.VERCEL = previousVercel
  if (previousEnv === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = previousEnv
  if (previousUrl === undefined) delete process.env.VERCEL_URL
  else process.env.VERCEL_URL = previousUrl
})

describe('publicApiUrl', () => {
  it('uses the configured local API during development', () => {
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
    expect(publicApiUrl('http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000')
  })

  it('uses this deployment when Vercel has no separate API URL', () => {
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_URL = 'erax-digital.vercel.app'
    expect(publicApiUrl(undefined)).toBe('https://erax-digital.vercel.app')
    expect(publicApiUrl('https://api.erax.digital')).toBe('https://api.erax.digital')
  })

  it('rejects a local API URL for a Vercel build', () => {
    process.env.VERCEL_ENV = 'preview'
    expect(() => publicApiUrl('http://127.0.0.1:4000')).toThrow(/https/)
  })
})
