import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = fileURLToPath(new URL('../migrations', import.meta.url))

describe('migration files', () => {
  it('does not contain destructive statements', async () => {
    const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDirectory, file), 'utf8')
      expect(sql, file).not.toMatch(/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i)
      expect(sql, file).not.toMatch(/\bTRUNCATE\b/i)
    }
  })
})
