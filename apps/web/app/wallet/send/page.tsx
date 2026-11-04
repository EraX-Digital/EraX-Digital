'use client'

import { ApiClientError } from '@erax/api-client'
import { useConnection as useSolanaConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { Alert, Button, TextField } from '@erax/ui'
import { useEffect, useState } from 'react'
import { useConnection, useSendTransaction, useSwitchChain } from 'wagmi'
import { api } from '../../../lib/api'

type WalletRow = Awaited<ReturnType<typeof api.wallets>>['wallets'][number]
type Preview = Awaited<ReturnType<typeof api.previewTransfer>>

export default function SendPage() {
  const evm = useConnection()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const solana = useWallet()
  const solanaConnection = useSolanaConnection()
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [assets, setAssets] = useState<Awaited<ReturnType<typeof api.walletAssets>>['assets']>([])
  const [walletId, setWalletId] = useState('')
  const [assetAddress, setAssetAddress] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [status, setStatus] = useState('Not connected')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([api.wallets(), api.walletAssets()])
      .then(([walletResult, assetResult]) => {
        if (!active) return
        const connected = walletResult.wallets.filter((wallet) => wallet.connected)
        setWallets(connected)
        setWalletId(connected.find((wallet) => wallet.preferred)?.id ?? connected[0]?.id ?? '')
        setAssets(assetResult.assets)
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof ApiClientError ? caught.message : 'Send data could not be loaded')
      })
    return () => {
      active = false
    }
  }, [])

  const wallet = wallets.find((item) => item.id === walletId) ?? null
  const choices = assets.filter((asset) => asset.network === wallet?.network && (asset.kind === 'native' || asset.contractAddress.length > 0))

  function edit(next: Partial<{ walletId: string; assetAddress: string; recipient: string; amount: string }>) {
    if (next.walletId !== undefined) setWalletId(next.walletId)
    if (next.assetAddress !== undefined) setAssetAddress(next.assetAddress)
    if (next.recipient !== undefined) setRecipient(next.recipient)
    if (next.amount !== undefined) setAmount(next.amount)
    setPreview(null)
    setStatus('Not connected')
  }

  async function prepare() {
    if (!wallet) return
    setPending(true)
    setError(null)
    setPreview(null)
    try {
      const result = await api.previewTransfer({
        walletId: wallet.id,
        recipient,
        assetAddress,
        amount,
      })
      setPreview(result)
      setStatus('Review the transfer, then approve it in your wallet.')
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'The transfer could not be prepared')
    } finally {
      setPending(false)
    }
  }

  async function approve() {
    if (!wallet || !preview) return
    setPending(true)
    setError(null)
    setStatus('Waiting for the wallet signature…')
    try {
      let hash = ''
      if (wallet.family === 'evm') {
        if (evm.address?.toLowerCase() !== preview.sender) {
          throw new Error('Connect the selected EVM wallet in this browser before sending.')
        }
        const chainId = preview.transaction.chainId
        if (!chainId || !preview.transaction.to || preview.transaction.data === undefined || preview.transaction.value === undefined) {
          throw new Error('The preview is missing EVM transaction fields.')
        }
        if (evm.chainId !== chainId) await switchChainAsync({ chainId })
        hash = await sendTransactionAsync({
          to: preview.transaction.to as `0x${string}`,
          data: preview.transaction.data,
          value: BigInt(preview.transaction.value),
          chainId,
        })
      } else {
        if (!solana.publicKey || solana.publicKey.toBase58() !== preview.sender || !solana.sendTransaction) {
          throw new Error('Connect the selected Solana wallet in this browser before sending.')
        }
        const transaction = new Transaction()
        for (const instruction of preview.transaction.instructions ?? []) {
          transaction.add(
            new TransactionInstruction({
              programId: new PublicKey(instruction.programId),
              keys: instruction.keys.map((key) => ({
                pubkey: new PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
              })),
              data: Buffer.from(instruction.dataBase64, 'base64'),
            }),
          )
        }
        hash = await solana.sendTransaction(transaction, solanaConnection.connection)
      }
      setStatus('Transaction pending')
      const recorded = await api.recordTransaction({
        walletId: wallet.id,
        recipient: preview.recipient,
        assetAddress: preview.asset.assetAddress,
        assetSymbol: preview.asset.symbol,
        amountBaseUnits: preview.amountBaseUnits,
        hash,
        ...(preview.feeBaseUnits ? { feeBaseUnits: preview.feeBaseUnits } : {}),
      })
      const refreshed = await api.refreshTransaction(recorded.transaction.id)
      setStatus(
        refreshed.transaction.status === 'pending'
          ? 'Transaction pending. Submission is not confirmation.'
          : `Transaction ${refreshed.transaction.status}`,
      )
    } catch (caught) {
      setStatus('Transaction failed')
      setError(caught instanceof ApiClientError ? caught.message : caught instanceof Error ? caught.message : 'The wallet did not approve the transfer')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="erax-feed">
      <h1>Send</h1>
      <p className="erax-muted">EraX does not sign this transfer. Your wallet has to approve the exact preview below.</p>
      {wallet?.network.endsWith(':1') || wallet?.network.includes('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp') ? (
        <Alert>This wallet is on a mainnet network.</Alert>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
      <p className="erax-pill">{status}</p>
      {wallets.length === 0 ? <p>Not connected.</p> : null}
      <label className="erax-field">
        <span>Wallet</span>
        <select value={walletId} onChange={(event) => edit({ walletId: event.target.value, assetAddress: '' })}>
          {wallets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.networkName} · {item.address}
            </option>
          ))}
        </select>
      </label>
      <label className="erax-field">
        <span>Asset</span>
        <select value={assetAddress} onChange={(event) => edit({ assetAddress: event.target.value })}>
          <option value="">Native coin</option>
          {choices
            .filter((asset) => asset.contractAddress.length > 0)
            .map((asset) => (
              <option key={asset.contractAddress} value={asset.contractAddress}>
                {asset.symbol} · {asset.verified ? 'trusted' : 'unverified'}
              </option>
            ))}
        </select>
      </label>
      <TextField label="Recipient" name="recipient" value={recipient} onChange={(event) => edit({ recipient: event.target.value })} />
      <TextField label="Amount" name="amount" value={amount} onChange={(event) => edit({ amount: event.target.value })} />
      <Button type="button" disabled={pending || !wallet} onClick={() => void prepare()}>
        {pending ? 'Working…' : 'Preview transfer'}
      </Button>
      {preview ? (
        <article className="erax-card">
          <h2>Review</h2>
          <p>Network: {preview.network}</p>
          <p className="erax-address">From: {preview.sender}</p>
          <p className="erax-address">To: {preview.recipient}</p>
          <p>
            Asset: {preview.asset.symbol} {preview.asset.verified ? '(trusted)' : '(unverified)'}
          </p>
          <p>Amount: {preview.amount}</p>
          <p>Estimated network fee: {preview.fee ?? 'unavailable'}</p>
          {preview.warnings.map((warning) => (
            <Alert key={warning}>{warning}</Alert>
          ))}
          <Button type="button" disabled={pending} onClick={() => void approve()}>
            Approve in wallet
          </Button>
        </article>
      ) : null}
    </section>
  )
}
