import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { EmailDelivery } from '@erax/shared-types'
import nodemailer from 'nodemailer'

export type OutboundEmail = {
  to: string
  subject: string
  text: string
  purpose: 'verify-email' | 'reset-password'
}

export type EmailSender = {
  send(message: OutboundEmail): Promise<EmailDelivery>
}

export type OutboxRecord = OutboundEmail & {
  id: string
  createdAt: string
  delivered: false
  transport: 'development-outbox'
}

export function createOutboxSender(directory: string): EmailSender {
  return {
    async send(message) {
      await mkdir(directory, { recursive: true })
      const id = randomUUID()
      const record: OutboxRecord = {
        ...message,
        text: `${message.text}\n\nThis message was stored in the local development outbox. It was not delivered to an email server.`,
        id,
        createdAt: new Date().toISOString(),
        delivered: false,
        transport: 'development-outbox',
      }
      await writeFile(path.join(directory, `${id}.json`), JSON.stringify(record, null, 2), 'utf8')
      return { delivered: false, transport: 'development-outbox', messageId: id }
    },
  }
}

export async function readOutbox(directory: string): Promise<OutboxRecord[]> {
  let files: string[] = []
  try {
    files = await readdir(directory)
  } catch {
    return []
  }
  const records: OutboxRecord[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const raw = await readFile(path.join(directory, file), 'utf8')
    records.push(JSON.parse(raw) as OutboxRecord)
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function createLinkSender(): EmailSender {
  return {
    async send(message) {
      return {
        delivered: false,
        transport: 'smtp',
        messageId: null,
        reason: `Email delivery is not configured. ${message.text}`,
      }
    },
  }
}

export function createSmtpSender(options: {
  host: string
  port: number
  from: string
  user: string
  password: string
}): EmailSender {
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.port === 465,
    auth: options.user ? { user: options.user, pass: options.password } : undefined,
  })
  return {
    async send(message) {
      try {
        const info = await transporter.sendMail({
          from: options.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
        })
        return { delivered: true, transport: 'smtp', messageId: info.messageId }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'SMTP delivery failed'
        return { delivered: false, transport: 'smtp', messageId: null, reason }
      }
    },
  }
}
