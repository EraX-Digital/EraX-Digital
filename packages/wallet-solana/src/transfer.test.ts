import { Keypair } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import { buildSolTransfer, buildSplTransfer, solanaTransferMatches } from './index'

describe('Solana transfers', () => {
  it('builds a system transfer and matches the parsed instruction', () => {
    const from = Keypair.generate().publicKey.toBase58()
    const to = Keypair.generate().publicKey.toBase58()
    const instructions = buildSolTransfer({ from, to, amountBaseUnits: 1500n })
    expect(instructions).toHaveLength(1)
    expect(instructions[0]?.programId).toBe('11111111111111111111111111111111')
    expect(
      solanaTransferMatches(
        [{ program: 'system', type: 'transfer', info: { source: from, destination: to, lamports: 1500 } }],
        { sender: from, recipient: to, amountBaseUnits: 1500n, assetAddress: '' },
      ),
    ).toBe(true)
    expect(
      solanaTransferMatches(
        [{ program: 'system', type: 'transfer', info: { source: from, destination: to, lamports: 1500 } }],
        { sender: from, recipient: from, amountBaseUnits: 1500n, assetAddress: '' },
      ),
    ).toBe(false)
  })

  it('builds an SPL transfer with an associated token account instruction', () => {
    const from = Keypair.generate().publicKey.toBase58()
    const to = Keypair.generate().publicKey.toBase58()
    const mint = Keypair.generate().publicKey.toBase58()
    const instructions = buildSplTransfer({
      from,
      to,
      mint,
      amountBaseUnits: 5n,
      tokenProgram: 'spl',
    })
    expect(instructions).toHaveLength(2)
    expect(instructions[1]?.programId).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    const token2022 = buildSplTransfer({
      from,
      to,
      mint,
      amountBaseUnits: 5n,
      tokenProgram: 'token2022',
    })
    expect(token2022[1]?.programId).toBe('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
  })
})
