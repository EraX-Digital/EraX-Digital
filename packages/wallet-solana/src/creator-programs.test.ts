import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Keypair } from '@solana/web3.js'
import {
  anchorDiscriminator,
  buildCreatorRegisterInstruction,
  buildCreatorTipInstruction,
  buildCreatorUpdateMetadataInstruction,
  creatorPda,
  decodeCreatorAccount,
  decodeSolanaProgramLogs,
  LOCAL_CREATOR_REGISTRY_PROGRAM_ID,
} from './creator-programs'

function eventLog(name: string, body: Buffer): string {
  const data = Buffer.concat([anchorDiscriminator('event', name), body])
  return `Program data: ${data.toString('base64')}`
}

describe('solana creator programs', () => {
  it('derives one PDA from the creator seed and authority', () => {
    const authority = Keypair.generate().publicKey
    const first = creatorPda(authority.toBase58(), LOCAL_CREATOR_REGISTRY_PROGRAM_ID)
    const second = creatorPda(authority.toBase58(), LOCAL_CREATOR_REGISTRY_PROGRAM_ID)
    expect(first).toBe(second)
    expect(first).not.toBe(authority.toBase58())
  })

  it('builds a register instruction for the connected authority', () => {
    const authority = Keypair.generate().publicKey.toBase58()
    const instruction = buildCreatorRegisterInstruction({
      registryProgramId: LOCAL_CREATOR_REGISTRY_PROGRAM_ID,
      authority,
      metadataUri: 'ipfs://alice',
    })
    expect(instruction.programId.toBase58()).toBe(LOCAL_CREATOR_REGISTRY_PROGRAM_ID)
    expect(instruction.keys[0]?.pubkey.toBase58()).toBe(authority)
    expect(instruction.keys[0]?.isSigner).toBe(true)
    expect(instruction.data.subarray(0, 8)).toEqual(anchorDiscriminator('global', 'register'))
  })

  it('builds a metadata update for the same creator PDA', () => {
    const authority = Keypair.generate().publicKey.toBase58()
    const instruction = buildCreatorUpdateMetadataInstruction({
      registryProgramId: LOCAL_CREATOR_REGISTRY_PROGRAM_ID,
      authority,
      metadataUri: 'https://example.com/creator.json',
    })
    expect(instruction.keys[1]?.pubkey.toBase58()).toBe(creatorPda(authority, LOCAL_CREATOR_REGISTRY_PROGRAM_ID))
    expect(instruction.data.subarray(0, 8)).toEqual(anchorDiscriminator('global', 'update_metadata'))
  })

  it('rejects a zero tip before a transaction is built', () => {
    const sender = Keypair.generate().publicKey.toBase58()
    expect(() =>
      buildCreatorTipInstruction({
        tippingProgramId: Keypair.generate().publicKey.toBase58(),
        registryProgramId: LOCAL_CREATOR_REGISTRY_PROGRAM_ID,
        sender,
        creatorAuthority: sender,
        payout: sender,
        lamports: 0n,
      }),
    ).toThrow(/greater than zero/)
  })

  it('decodes a TipSent program-data log and ignores other programs', () => {
    const sender = Keypair.generate().publicKey
    const creator = Keypair.generate().publicKey
    const payout = Keypair.generate().publicKey
    const rest = Buffer.alloc(16)
    rest.writeBigUInt64LE(250000n)
    rest.writeBigInt64LE(1_700_000_000n, 8)
    const body = Buffer.concat([sender.toBuffer(), creator.toBuffer(), payout.toBuffer(), rest])
    const tipping = Keypair.generate().publicKey.toBase58()
    const events = decodeSolanaProgramLogs([
      `Program ${tipping} invoke [1]`,
      eventLog('TipSent', body),
      `Program ${tipping} success`,
    ])
    expect(events).toEqual([
      {
        programId: tipping,
        eventName: 'TipSent',
        payload: {
          sender: sender.toBase58(),
          creator: creator.toBase58(),
          payout: payout.toBase58(),
          amount: '250000',
          timestamp: '1700000000',
        },
      },
    ])
    expect(createHash('sha256').update('event:TipSent').digest().subarray(0, 8)).toEqual(
      anchorDiscriminator('event', 'TipSent'),
    )
  })

  it('decodes a creator account and rejects a short buffer', () => {
    const authority = Keypair.generate().publicKey
    const payout = Keypair.generate().publicKey
    const uri = Buffer.from('ipfs://alice')
    const length = Buffer.alloc(4)
    length.writeUInt32LE(uri.length)
    const times = Buffer.alloc(16)
    times.writeBigInt64LE(10n)
    times.writeBigInt64LE(11n, 8)
    const data = Buffer.concat([
      createHash('sha256').update('account:CreatorAccount').digest().subarray(0, 8),
      authority.toBuffer(),
      payout.toBuffer(),
      length,
      uri,
      times,
      Buffer.from([7]),
    ])
    expect(decodeCreatorAccount(data)).toEqual({
      authority: authority.toBase58(),
      payout: payout.toBase58(),
      metadataUri: 'ipfs://alice',
      registeredAt: '10',
      updatedAt: '11',
      bump: 7,
    })
    expect(decodeCreatorAccount(Buffer.alloc(4))).toBeNull()
  })
})