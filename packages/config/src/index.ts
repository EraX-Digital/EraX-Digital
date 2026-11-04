import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export function resolveRepoPath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value)
}

const httpsOrigin = z.string().url()

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    API_PUBLIC_ORIGIN: httpsOrigin.default('http://127.0.0.1:4000'),
    INDEXER_HOST: z.string().min(1).default('127.0.0.1'),
    INDEXER_PORT: z.coerce.number().int().positive().default(4001),
    DATABASE_DRIVER: z.enum(['postgres', 'pglite']).default('postgres'),
    DATABASE_URL: z.string().optional().default(''),
    DATABASE_MIGRATION_URL: z.string().optional().default(''),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(10),
    DATABASE_SSL: z.enum(['disable', 'require']).default('disable'),
    PGLITE_DIR: z.string().min(1).default('./var/pglite'),
    RATE_LIMIT_STORE: z.enum(['valkey', 'memory']).default('valkey'),
    VALKEY_URL: z.string().optional().default(''),
    WEB_ORIGIN: httpsOrigin,
    ADMIN_ORIGIN: httpsOrigin,
    SESSION_COOKIE_SECRET: z.string().min(32),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(60 * 60 * 24 * 30)
      .default(604800),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    COOKIE_DOMAIN: z.string().default(''),
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    ERAX_AUTO_MIGRATE: z.enum(['true', 'false']).optional(),
    EMAIL_MODE: z.enum(['outbox', 'smtp', 'link']),
    ERAX_RUNTIME: z.enum(['standalone', 'vercel']).default('standalone'),
    EMAIL_OUTBOX_DIR: z.string().min(1).default('./var/outbox'),
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_FROM: z.string().min(1).default('EraX <no-reply@localhost>'),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASSWORD: z.string().optional().default(''),
    MEDIA_DRIVER: z.enum(['filesystem', 's3', 'none']).default('filesystem'),
    MEDIA_ROOT: z.string().min(1).default('./var/media'),
    S3_ENDPOINT: z.string().optional().default(''),
    S3_REGION: z.string().optional().default(''),
    S3_BUCKET: z.string().optional().default(''),
    S3_ACCESS_KEY_ID: z.string().optional().default(''),
    S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    EVM_RPC_URL_1: z.string().optional().default(''),
    EVM_RPC_URL_8453: z.string().optional().default(''),
    EVM_RPC_URL_11155111: z.string().optional().default(''),
    EVM_RPC_URL_84532: z.string().optional().default(''),
    SOLANA_RPC_URL_MAINNET: z.string().optional().default(''),
    SOLANA_RPC_URL_DEVNET: z.string().optional().default(''),
    TRUSTED_TOKEN_LIST_JSON: z.string().optional().default(''),
    ENABLE_API_DOCS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  })
  .superRefine((value, context) => {
    if (
      value.SESSION_COOKIE_SECRET.includes('replace-with') ||
      value.SESSION_COOKIE_SECRET.trim().length < 32
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_COOKIE_SECRET'],
        message: 'SESSION_COOKIE_SECRET must be a generated secret of at least 32 characters',
      })
    }

    if (value.DATABASE_DRIVER === 'postgres' && !value.DATABASE_URL.startsWith('postgres')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL must be a postgres connection string when DATABASE_DRIVER=postgres',
      })
    }

    if (
      value.DATABASE_MIGRATION_URL.length > 0 &&
      !value.DATABASE_MIGRATION_URL.startsWith('postgres')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_MIGRATION_URL'],
        message: 'DATABASE_MIGRATION_URL must be a postgres connection string',
      })
    }

    if (value.RATE_LIMIT_STORE === 'valkey' && value.VALKEY_URL.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['VALKEY_URL'],
        message: 'VALKEY_URL is required when RATE_LIMIT_STORE=valkey',
      })
    }

    if (value.EMAIL_MODE === 'smtp' && value.SMTP_HOST.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_MODE=smtp',
      })
    }

    if (value.MEDIA_DRIVER === 's3') {
      for (const key of [
        'S3_ENDPOINT',
        'S3_REGION',
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (value[key].length === 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when MEDIA_DRIVER=s3`,
          })
        }
      }
    }

    if (value.COOKIE_DOMAIN.length > 0 && !value.COOKIE_DOMAIN.startsWith('.')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_DOMAIN'],
        message: 'COOKIE_DOMAIN must start with a dot, for example .erax.digital',
      })
    }

    const rpcKeys = [
      'EVM_RPC_URL_1',
      'EVM_RPC_URL_8453',
      'EVM_RPC_URL_11155111',
      'EVM_RPC_URL_84532',
      'SOLANA_RPC_URL_MAINNET',
      'SOLANA_RPC_URL_DEVNET',
    ] as const
    for (const key of rpcKeys) {
      const url = value[key]
      if (url.length === 0) continue
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be an http or https URL`,
        })
        continue
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be an http or https URL`,
        })
      }
      if (value.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must use https in production`,
        })
      }
    }

    if (value.NODE_ENV === 'production') {
      const vercelRuntime = value.ERAX_RUNTIME === 'vercel'
      if (value.DATABASE_DRIVER !== 'postgres') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_DRIVER'],
          message: 'Production requires PostgreSQL. PGlite is a development database.',
        })
      }
      if (value.DATABASE_SSL !== 'require') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_SSL'],
          message: 'Production database connections must set DATABASE_SSL=require',
        })
      }
      if (/localhost|127\.0\.0\.1|erax_local_dev_only/i.test(value.DATABASE_URL)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'Production DATABASE_URL must not use a local development database',
        })
      }
      if (!vercelRuntime && value.RATE_LIMIT_STORE !== 'valkey') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RATE_LIMIT_STORE'],
          message: 'Production requires Valkey. The in-process rate limiter is development-only.',
        })
      }
      if (value.RATE_LIMIT_STORE === 'valkey' && /localhost|127\.0\.0\.1/i.test(value.VALKEY_URL)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['VALKEY_URL'],
          message: 'Production VALKEY_URL must not point at localhost',
        })
      }
      if (!vercelRuntime && value.EMAIL_MODE !== 'smtp') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_MODE'],
          message:
            'Production requires SMTP email delivery. The development outbox is not a mail server.',
        })
      }
      if (vercelRuntime && value.EMAIL_MODE === 'outbox') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_MODE'],
          message: 'The Vercel runtime cannot use the development outbox.',
        })
      }
      if (
        value.EMAIL_MODE === 'smtp' &&
        (/localhost|127\.0\.0\.1/i.test(value.SMTP_HOST) || value.SMTP_FROM.includes('localhost'))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_HOST'],
          message: 'Production SMTP settings must not use the local development mail server',
        })
      }
      if (!value.COOKIE_SECURE) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECURE'],
          message: 'Production cookies must be marked secure',
        })
      }
      if (!vercelRuntime && value.MEDIA_DRIVER !== 's3') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MEDIA_DRIVER'],
          message:
            'Production media must use S3-compatible object storage. Local disk is ephemeral.',
        })
      }
      if (vercelRuntime && value.MEDIA_DRIVER === 'filesystem') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MEDIA_DRIVER'],
          message: 'The Vercel runtime cannot store media on local disk.',
        })
      }
      if (value.ENABLE_API_DOCS) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENABLE_API_DOCS'],
          message: 'Production must set ENABLE_API_DOCS=false',
        })
      }
      for (const key of ['WEB_ORIGIN', 'ADMIN_ORIGIN', 'API_PUBLIC_ORIGIN'] as const) {
        if (!value[key].startsWith('https://')) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} must use https in production`,
          })
        }
      }
      const webHost = new URL(value.WEB_ORIGIN).hostname
      const apiHost = new URL(value.API_PUBLIC_ORIGIN).hostname
      if (webHost !== apiHost && value.COOKIE_DOMAIN.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_DOMAIN'],
          message:
            'COOKIE_DOMAIN is required when the web app and API use different hosts so the CSRF cookie is visible to the app',
        })
      }
      if (value.COOKIE_DOMAIN.length > 0) {
        const suffix = value.COOKIE_DOMAIN.slice(1)
        for (const key of ['WEB_ORIGIN', 'ADMIN_ORIGIN', 'API_PUBLIC_ORIGIN'] as const) {
          const host = new URL(value[key]).hostname
          if (host !== suffix && !host.endsWith(`.${suffix}`)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['COOKIE_DOMAIN'],
              message: `COOKIE_DOMAIN must be a parent of ${key}`,
            })
          }
        }
      }
    }
  })

export type Env = z.infer<typeof schema>

export function shouldAutoMigrate(env: Pick<Env, 'NODE_ENV' | 'ERAX_AUTO_MIGRATE'>): boolean {
  if (env.NODE_ENV === 'production') return env.ERAX_AUTO_MIGRATE === 'true'
  return env.ERAX_AUTO_MIGRATE !== 'false'
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment\n${message}`)
  }
  return parsed.data
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return parseEnv(source)
}
