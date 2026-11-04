import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
}

const KEY_PREFIX = /^(avatars|covers|posts|communities)\//

export type StoredObject = {
  bytes: Buffer
  contentType: string
}

export type MediaStorage = {
  driver: 'filesystem' | 's3' | 'none'
  put(key: string, bytes: Buffer): Promise<void>
  read(key: string): Promise<StoredObject | null>
  remove(key: string): Promise<void>
}

export function createUnavailableStorage(): MediaStorage {
  const fail = () => Promise.reject(new Error('Media storage is not configured on this deployment'))
  return { driver: 'none', put: fail, read: () => Promise.resolve(null), remove: fail }
}

export function assertMediaKey(key: string): void {
  if (!KEY_PREFIX.test(key) || key.includes('..') || key.includes('\\') || path.isAbsolute(key)) {
    throw new Error('Invalid media key')
  }
}

export function mediaContentType(key: string): string {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream'
}

export function createFilesystemStorage(root: string): MediaStorage {
  const resolvedRoot = path.resolve(root)

  function resolveKey(key: string): string {
    assertMediaKey(key)
    const full = path.resolve(resolvedRoot, key)
    if (!full.startsWith(resolvedRoot + path.sep)) {
      throw new Error('Invalid media key')
    }
    return full
  }

  return {
    driver: 'filesystem',
    async put(key, bytes) {
      const full = resolveKey(key)
      await mkdir(path.dirname(full), { recursive: true })
      await writeFile(full, bytes)
    },
    async read(key) {
      const full = resolveKey(key)
      try {
        const bytes = await readFile(full)
        const contentType = mediaContentType(full)
        return { bytes, contentType }
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
        throw error
      }
    },
    async remove(key) {
      if (!key) return
      try {
        await rm(resolveKey(key))
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
        throw error
      }
    },
  }
}
