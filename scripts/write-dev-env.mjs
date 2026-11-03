import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

const lite = process.argv.includes('--lite')
if (existsSync('.env') && !process.argv.includes('--force')) {
  console.log('.env already exists. Pass --force to replace it.')
  process.exit(0)
}

const secret = randomBytes(32).toString('base64url')
const lines = [
  'NODE_ENV=development',
  'API_HOST=127.0.0.1',
  'API_PORT=4000',
  'API_PUBLIC_ORIGIN=http://127.0.0.1:4000',
  'INDEXER_HOST=127.0.0.1',
  'INDEXER_PORT=4001',
  lite ? 'DATABASE_DRIVER=pglite' : 'DATABASE_DRIVER=postgres',
  'DATABASE_URL=postgres://erax:erax_local_dev_only@127.0.0.1:5432/erax',
  'PGLITE_DIR=./var/pglite',
  lite ? 'RATE_LIMIT_STORE=memory' : 'RATE_LIMIT_STORE=valkey',
  'VALKEY_URL=redis://127.0.0.1:6379',
  'WEB_ORIGIN=http://127.0.0.1:3000',
  'ADMIN_ORIGIN=http://127.0.0.1:3001',
  `SESSION_COOKIE_SECRET=${secret}`,
  'SESSION_TTL_SECONDS=604800',
  'COOKIE_SECURE=false',
  'EMAIL_MODE=outbox',
  'EMAIL_OUTBOX_DIR=./var/outbox',
  'SMTP_HOST=127.0.0.1',
  'SMTP_PORT=1025',
  'SMTP_FROM=EraX <no-reply@localhost>',
  'MEDIA_ROOT=./var/media',
  'ENABLE_API_DOCS=true',
  '',
]
writeFileSync('.env', lines.join('\n'), 'utf8')
console.log(
  lite
    ? 'Wrote .env for embedded PGlite and in-process rate limits.'
    : 'Wrote .env for local PostgreSQL and Valkey.',
)
console.log('Email mode is outbox. Messages are stored in ./var/outbox and are not sent.')
