import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { assertMediaKey, mediaContentType, type MediaStorage } from './media'

export type S3MediaConfig = {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

function missingObject(error: unknown): boolean {
  if (error instanceof NoSuchKey) return true
  if (!(error instanceof Error)) return false
  const named = error as Error & { $metadata?: { httpStatusCode?: number } }
  return named.name === 'NotFound' || named.$metadata?.httpStatusCode === 404
}

export function createS3Storage(config: S3MediaConfig, client?: S3Client): MediaStorage {
  const s3 =
    client ??
    new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })

  return {
    driver: 's3',
    async put(key, bytes) {
      assertMediaKey(key)
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: mediaContentType(key),
        }),
      )
    },
    async read(key) {
      assertMediaKey(key)
      try {
        const result = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
        if (!result.Body) return null
        const bytes = Buffer.from(await result.Body.transformToByteArray())
        return { bytes, contentType: mediaContentType(key) }
      } catch (error) {
        if (missingObject(error)) return null
        throw error
      }
    },
    async remove(key) {
      if (!key) return
      assertMediaKey(key)
      await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
    },
  }
}
