import { sha256 } from '@noble/hashes/sha256'
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'

export const LOCAL_CREATOR_REGISTRY_PROGRAM_ID = 'CW9G6KwD29Zu6MdEFXfJ4c31zWvispLY5hNovprn2Qv1'
export const LOCAL_CREATOR_TIPPING_PROGRAM_ID = '5Z4UJ9gbtfZc4Ha7c4ibHYsd2V77anFpv7KHnqjf5ANV'

const EVENT_NAMES = ['CreatorRegistered', 'CreatorMetadataUpdated', 'CreatorPayoutUpdated', 'TipSent'] as const

export type SolanaCreatorEventName = (typeof EVENT_NAMES)[number]

export type DecodedSolanaCreatorEvent = {
  programId: string
  eventName: SolanaCreatorEventName
  payload: Record<string, string | number>
}

export function anchorDiscriminator(namespace: 'event' | 'global', name: string): Buffer {
  return Buffer.from(sha256(new TextEncoder().encode(`${namespace}:${name}`))).subarray(0, 8)
}

function pubkey(buffer: Buffer, offset: number): { value: string; next: number } {
  return { value: new PublicKey(buffer.subarray(offset, offset + 32)).toBase58(), next: offset + 32 }
}

function text(buffer: Buffer, offset: number): { value: string; next: number } {
  const length = buffer.readUInt32LE(offset)
  const start = offset + 4
  const end = start + length
  return { value: buffer.subarray(start, end).toString('utf8'), next: end }
}

function decodeEvent(buffer: Buffer): { eventName: SolanaCreatorEventName; payload: Record<string, string | number> } | null {
  for (const eventName of EVENT_NAMES) {
    const discriminator = anchorDiscriminator('event', eventName)
    if (!buffer.subarray(0, 8).equals(discriminator)) continue
    const offset = 8
    if (eventName === 'CreatorRegistered') {
      const authority = pubkey(buffer, offset)
      const payout = pubkey(buffer, authority.next)
      const uri = text(buffer, payout.next)
      return { eventName, payload: { authority: authority.value, payout: payout.value, metadataUri: uri.value } }
    }
    if (eventName === 'CreatorMetadataUpdated') {
      const authority = pubkey(buffer, offset)
      const uri = text(buffer, authority.next)
      return { eventName, payload: { authority: authority.value, metadataUri: uri.value } }
    }
    if (eventName === 'CreatorPayoutUpdated') {
      const authority = pubkey(buffer, offset)
      const previous = pubkey(buffer, authority.next)
      const payout = pubkey(buffer, previous.next)
      return {
        eventName,
        payload: { authority: authority.value, previousPayout: previous.value, payout: payout.value },
      }
    }
    const sender = pubkey(buffer, offset)
    const creator = pubkey(buffer, sender.next)
    const payout = pubkey(buffer, creator.next)
    const amount = buffer.readBigUInt64LE(payout.next).toString()
    const timestamp = buffer.readBigInt64LE(payout.next + 8).toString()
    return { eventName, payload: { sender: sender.value, creator: creator.value, payout: payout.value, amount, timestamp } }
  }
  return null
}

export function decodeSolanaProgramLogs(logs: readonly string[]): DecodedSolanaCreatorEvent[] {
  const events: DecodedSolanaCreatorEvent[] = []
  let programId = ''
  for (const line of logs) {
    const invoke = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke/.exec(line)
    if (invoke?.[1]) programId = invoke[1]
    if (!line.startsWith('Program data: ') || programId.length === 0) continue
    const decoded = decodeEvent(Buffer.from(line.slice('Program data: '.length), 'base64'))
    if (decoded) events.push({ programId, ...decoded })
  }
  return events
}

function encodeString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  const length = Buffer.alloc(4)
  length.writeUInt32LE(bytes.length)
  return Buffer.concat([length, bytes])
}

export type DecodedCreatorAccount = {
  authority: string
  payout: string
  metadataUri: string
  registeredAt: string
  updatedAt: string
  bump: number
}

export function decodeCreatorAccount(data: Uint8Array): DecodedCreatorAccount | null {
  const buffer = Buffer.from(data)
  const discriminator = Buffer.from(sha256(new TextEncoder().encode('account:CreatorAccount'))).subarray(0, 8)
  if (buffer.length < 8 + 32 + 32 + 4 + 8 + 8 + 1 || !buffer.subarray(0, 8).equals(discriminator)) return null
  const authority = pubkey(buffer, 8)
  const payout = pubkey(buffer, authority.next)
  const uri = text(buffer, payout.next)
  if (uri.next + 17 > buffer.length) return null
  return {
    authority: authority.value,
    payout: payout.value,
    metadataUri: uri.value,
    registeredAt: buffer.readBigInt64LE(uri.next).toString(),
    updatedAt: buffer.readBigInt64LE(uri.next + 8).toString(),
    bump: buffer[uri.next + 16] ?? 0,
  }
}

export function creatorPda(authority: string, registryProgramId: string): string {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator'), new PublicKey(authority).toBuffer()],
    new PublicKey(registryProgramId),
  )
  return address.toBase58()
}

export function buildCreatorRegisterInstruction(input: {
  registryProgramId: string
  authority: string
  metadataUri: string
  payout?: string
}): TransactionInstruction {
  const authority = new PublicKey(input.authority)
  const programId = new PublicKey(input.registryProgramId)
  const [creator] = PublicKey.findProgramAddressSync([Buffer.from('creator'), authority.toBuffer()], programId)
  const payout = input.payout ? Buffer.concat([Buffer.from([1]), new PublicKey(input.payout).toBuffer()]) : Buffer.from([0])
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: creator, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([anchorDiscriminator('global', 'register'), encodeString(input.metadataUri), payout]),
  })
}

export function buildCreatorUpdateMetadataInstruction(input: {
  registryProgramId: string
  authority: string
  metadataUri: string
}): TransactionInstruction {
  const authority = new PublicKey(input.authority)
  const programId = new PublicKey(input.registryProgramId)
  const [creator] = PublicKey.findProgramAddressSync([Buffer.from('creator'), authority.toBuffer()], programId)
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: creator, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([anchorDiscriminator('global', 'update_metadata'), encodeString(input.metadataUri)]),
  })
}

export function buildCreatorTipInstruction(input: {
  tippingProgramId: string
  registryProgramId: string
  sender: string
  creatorAuthority: string
  payout: string
  lamports: bigint
}): TransactionInstruction {
  if (input.lamports <= 0n) throw new Error('Tip amount must be greater than zero')
  const sender = new PublicKey(input.sender)
  const payout = new PublicKey(input.payout)
  const registry = new PublicKey(input.registryProgramId)
  const [creator] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator'), new PublicKey(input.creatorAuthority).toBuffer()],
    registry,
  )
  const amount = Buffer.alloc(8)
  amount.writeBigUInt64LE(input.lamports)
  return new TransactionInstruction({
    programId: new PublicKey(input.tippingProgramId),
    keys: [
      { pubkey: sender, isSigner: true, isWritable: true },
      { pubkey: payout, isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([anchorDiscriminator('global', 'tip'), amount]),
  })
}
