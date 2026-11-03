import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'
import { createS3Storage } from './media-s3'

describe('S3 media storage', () => {
  it('stores, reads, and removes an object without using the local disk', async () => {
    const objects = new Map<string, Buffer>()
    const client = {
      async send(command: {
        constructor: { name: string }
        input: { Key?: string; Body?: Buffer }
      }) {
        const key = command.input.Key ?? ''
        if (command instanceof PutObjectCommand) {
          objects.set(key, Buffer.from(command.input.Body ?? []))
          return {}
        }
        if (command instanceof GetObjectCommand) {
          const body = objects.get(key)
          if (!body) {
            const error = new Error('missing') as Error & { $metadata: { httpStatusCode: number } }
            error.name = 'NoSuchKey'
            error.$metadata = { httpStatusCode: 404 }
            throw error
          }
          return { Body: { transformToByteArray: async () => new Uint8Array(body) } }
        }
        if (command instanceof DeleteObjectCommand) {
          objects.delete(key)
          return {}
        }
        throw new Error(`Unexpected command ${command.constructor.name}`)
      },
    }
    const storage = createS3Storage(
      {
        endpoint: 'https://s3.example.test',
        region: 'auto',
        bucket: 'erax-media',
        accessKeyId: 'example',
        secretAccessKey: 'example-secret',
        forcePathStyle: true,
      },
      client as never,
    )

    await storage.put('posts/one/photo.png', Buffer.from('png'))
    const stored = await storage.read('posts/one/photo.png')
    expect(stored?.bytes.toString()).toBe('png')
    expect(stored?.contentType).toBe('image/png')
    expect(await storage.read('posts/one/missing.png')).toBeNull()
    await expect(storage.put('../secret.png', Buffer.from('no'))).rejects.toThrow(
      /Invalid media key/,
    )
    await storage.remove('posts/one/photo.png')
    expect(objects.size).toBe(0)
    expect(storage.driver).toBe('s3')
  })
})
