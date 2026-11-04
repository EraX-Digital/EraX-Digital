'use client'

import { Alert, Button, Note, TextField } from '@erax/ui'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { useEffect, useState } from 'react'
import {
  buildCreatorRegisterInstruction,
  buildCreatorTipInstruction,
  buildCreatorUpdateMetadataInstruction,
  creatorPda,
  decodeCreatorAccount,
  type DecodedCreatorAccount,
} from '@erax/wallet-solana/creator-programs'

function explorerTransactionUrl(signature: string, rpc: string): string {
  const base = `https://explorer.solana.com/tx/${signature}`
  if (rpc.includes('devnet')) return `${base}?cluster=devnet`
  if (rpc.includes('127.0.0.1') || rpc.includes('localhost')) {
    return `${base}?cluster=custom&customUrl=${encodeURIComponent(rpc)}`
  }
  return base
}

const registryProgramId = process.env.NEXT_PUBLIC_SOLANA_CREATOR_REGISTRY_PROGRAM_ID?.trim() ?? ''
const tippingProgramId = process.env.NEXT_PUBLIC_SOLANA_CREATOR_TIPPING_PROGRAM_ID?.trim() ?? ''

export default function CreatorPage() {
  const wallet = useWallet()
  const connection = useConnection()
  const [metadataUri, setMetadataUri] = useState('ipfs://')
  const [creator, setCreator] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [registration, setRegistration] = useState<DecodedCreatorAccount | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const configured = registryProgramId.length > 0 && tippingProgramId.length > 0
  const address = wallet.publicKey?.toBase58() ?? ''
  const rpc = connection.connection.rpcEndpoint

  useEffect(() => {
    if (!configured || !address) {
      setRegistration(null)
      return
    }
    let cancelled = false
    const pda = creatorPda(address, registryProgramId)
    connection.connection
      .getAccountInfo(new PublicKey(pda))
      .then((account) => {
        if (!cancelled) setRegistration(account && account.owner.toBase58() === registryProgramId ? decodeCreatorAccount(account.data) : null)
      })
      .catch(() => {
        if (!cancelled) setRegistration(null)
      })
    return () => {
      cancelled = true
    }
  }, [address, configured, connection, rpc, status])

  async function approve(instructions: ReturnType<typeof buildCreatorRegisterInstruction>[]) {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      throw new Error('Connect a Solana wallet before approving a transaction.')
    }
    const transaction = new Transaction()
    for (const instruction of instructions) transaction.add(instruction)
    const submitted = await wallet.sendTransaction(transaction, connection.connection)
    const result = await connection.connection.confirmTransaction(submitted, 'finalized')
    if (result.value.err) throw new Error('The Solana transaction failed on-chain.')
    setSignature(submitted)
    return submitted
  }

  async function register() {
    if (!address) return
    setPending(true)
    setError(null)
    setStatus('Waiting for the wallet signature…')
    try {
      const signature = await approve([
        buildCreatorRegisterInstruction({
          registryProgramId,
          authority: address,
          metadataUri,
        }),
      ])
      setStatus(`Registered. Signature ${signature}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Registration was not submitted')
      setStatus(null)
    } finally {
      setPending(false)
    }
  }

  async function updateMetadata() {
    if (!address) return
    setPending(true)
    setError(null)
    setStatus('Waiting for the wallet signature…')
    try {
      const signature = await approve([
        buildCreatorUpdateMetadataInstruction({
          registryProgramId,
          authority: address,
          metadataUri,
        }),
      ])
      setStatus(`Metadata updated. Signature ${signature}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The metadata update was not submitted')
      setStatus(null)
    } finally {
      setPending(false)
    }
  }

  async function tip() {
    if (!address) return
    setPending(true)
    setError(null)
    setStatus('Waiting for the wallet signature…')
    try {
      if (!/^\d+(\.\d{1,9})?$/.test(amount)) throw new Error('Enter a SOL amount with up to 9 decimal places.')
      const [whole, fraction = ''] = amount.split('.')
      const lamports = BigInt(whole ?? '0') * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'))
      if (lamports <= 0n) throw new Error('Tip amount must be greater than zero')
      const creatorAuthority = new PublicKey(creator).toBase58()
      const account = await connection.connection.getAccountInfo(new PublicKey(creatorPda(creatorAuthority, registryProgramId)))
      const registered = account && account.owner.toBase58() === registryProgramId ? decodeCreatorAccount(account.data) : null
      if (!registered) throw new Error('That wallet is not a registered Solana creator on this cluster.')
      const signature = await approve([
        buildCreatorTipInstruction({
          tippingProgramId,
          registryProgramId,
          sender: address,
          creatorAuthority,
          payout: registered.payout,
          lamports,
        }),
      ])
      setStatus(`Tip submitted. Signature ${signature}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The tip was not submitted')
      setStatus(null)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="erax-panel">
      <h1>Solana creator</h1>
      <p className="erax-muted">
        A Solana registration belongs to the connected Solana wallet. It is separate from an Ethereum or Base registration on the same EraX account.
      </p>
      {configured ? null : (
        <Note>
          The creator programs are not deployed. Registration and tipping stay unavailable until the devnet program ids are set in
          NEXT_PUBLIC_SOLANA_CREATOR_REGISTRY_PROGRAM_ID and NEXT_PUBLIC_SOLANA_CREATOR_TIPPING_PROGRAM_ID.
        </Note>
      )}
      {error ? <Alert>{error}</Alert> : null}
      {status ? <Note>{status}</Note> : null}
      {configured ? (
        <form
          className="erax-form"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <p className="erax-muted">{address ? `Connected ${address}` : 'Connect a Solana wallet to continue.'}</p>
          {address ? (
            <p className="erax-muted">
              {registration
                ? `Registered. Payout ${registration.payout}. Metadata ${registration.metadataUri}`
                : `Not registered. Account ${creatorPda(address, registryProgramId)}`}
            </p>
          ) : null}
          {signature ? (
            <p className="erax-muted">
              <a href={explorerTransactionUrl(signature, rpc)}>View the confirmed signature</a>
            </p>
          ) : null}
          <TextField label="Metadata URI" name="metadataUri" value={metadataUri} onChange={(event) => setMetadataUri(event.target.value)} />
          <Button type="button" disabled={pending || !address} onClick={() => void register()}>
            {pending ? 'Waiting…' : 'Register on Solana'}
          </Button>
          <Button type="button" disabled={pending || !address || !registration} onClick={() => void updateMetadata()}>
            {pending ? 'Waiting…' : 'Update metadata'}
          </Button>
          <p className="erax-muted">The tip is sent to the payout stored in the creator account. The wallet must approve it. The program adds no fee.</p>
          <TextField label="Creator wallet" name="creator" value={creator} onChange={(event) => setCreator(event.target.value)} />
          <TextField label="SOL amount" name="amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
          {creator && amount ? (
            <p className="erax-muted">
              Preview: send {amount} SOL from {address || 'the connected wallet'} to the payout stored for {creator}. The network fee is separate. The program adds no fee.
            </p>
          ) : null}
          <Button type="button" disabled={pending || !address || !creator || !amount} onClick={() => void tip()}>
            Review and approve tip
          </Button>
        </form>
      ) : null}
    </section>
  )
}
