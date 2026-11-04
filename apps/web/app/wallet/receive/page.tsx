'use client'

import { ApiClientError } from '@erax/api-client'
import { useConnection } from 'wagmi'
import { Alert } from '@erax/ui'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'

type WalletRow = Awaited<ReturnType<typeof api.wallets>>['wallets'][number]

export default function ReceivePage() {
  const connection = useConnection()
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [walletId, setWalletId] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    api
      .wallets()
      .then((result) => {
        if (!active) return
        const connected = result.wallets.filter((wallet) => wallet.connected)
        setWallets(connected)
        setWalletId(connected[0]?.id ?? '')
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof ApiClientError ? caught.message : 'Wallets could not be loaded')
      })
    return () => {
      active = false
    }
  }, [])

  const selected = wallets.find((wallet) => wallet.id === walletId) ?? null

  useEffect(() => {
    if (!selected) {
      setQr(null)
      return
    }
    let active = true
    QRCode.toDataURL(selected.address, { margin: 1, width: 220 })
      .then((url) => {
        if (active) setQr(url)
      })
      .catch(() => {
        if (active) setQr(null)
      })
    return () => {
      active = false
    }
  }, [selected])

  const evmChain = selected?.network.startsWith('eip155:') ? Number(selected.network.slice('eip155:'.length)) : null
  const wrongNetwork = evmChain !== null && connection.chainId !== undefined && connection.chainId !== evmChain

  return (
    <section className="erax-feed">
      <h1>Receive</h1>
      {error ? <Alert>{error}</Alert> : null}
      {wallets.length === 0 ? <p>Not connected. Connect a wallet before showing a receiving address.</p> : null}
      {wallets.length > 0 ? (
        <label className="erax-field">
          <span>Wallet and network</span>
          <select value={walletId} onChange={(event) => setWalletId(event.target.value)}>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.networkName} · {wallet.address}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {selected ? (
        <article className="erax-card">
          <h2>{selected.networkName}</h2>
          <p className="erax-address">{selected.address}</p>
          {qr ? <img src={qr} alt="QR code for this public address" width={220} height={220} /> : null}
          {wrongNetwork ? (
            <Alert>The connected browser wallet is on a different network from this receiving address.</Alert>
          ) : null}
          <p className="erax-muted">Send only assets on {selected.networkName} to this address. The QR code contains the address and nothing else.</p>
          <div className="erax-actions">
            <button
              className="erax-button"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(selected.address).then(() => setCopied(true))
              }}
            >
              {copied ? 'Copied' : 'Copy address'}
            </button>
            {selected.explorerUrl ? (
              <a className="erax-button-secondary" href={selected.explorerUrl} target="_blank" rel="noreferrer">
                View on explorer
              </a>
            ) : null}
          </div>
        </article>
      ) : null}
    </section>
  )
}
