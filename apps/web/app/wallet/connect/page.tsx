'use client'

import { ApiClientError } from '@erax/api-client'
import { useWallet } from '@solana/wallet-adapter-react'
import { Alert } from '@erax/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useConnect, useConnection, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi'
import { api } from '../../../lib/api'
import { walletConnectConfigured } from '../../../lib/wagmi-config'
import { SOLANA_DEVNET, SOLANA_MAINNET, useSolanaEndpoint } from '../../../components/wallet-providers'

const evmNetworks = [
  { caip2: 'eip155:11155111', chainId: 11155111, name: 'Ethereum Sepolia' },
  { caip2: 'eip155:84532', chainId: 84532, name: 'Base Sepolia' },
  { caip2: 'eip155:1', chainId: 1, name: 'Ethereum' },
  { caip2: 'eip155:8453', chainId: 8453, name: 'Base' },
]

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export default function ConnectWalletPage() {
  const router = useRouter()
  const connection = useConnection()
  const { connectAsync, connectors, isPending } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const { switchChainAsync } = useSwitchChain()
  const solana = useWallet()
  const { endpoint, setEndpoint } = useSolanaEndpoint()
  const [network, setNetwork] = useState(evmNetworks[0]?.caip2 ?? 'eip155:11155111')
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('Not connected')
  const [error, setError] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  const selected = evmNetworks.find((item) => item.caip2 === network) ?? evmNetworks[0]
  const wrongNetwork = Boolean(connection.address && selected && connection.chainId !== selected.chainId)

  async function purpose(): Promise<'sign-in' | 'link'> {
    try {
      await api.me()
      setSignedIn(true)
      return 'link'
    } catch {
      setSignedIn(false)
      return 'sign-in'
    }
  }

  async function signEvm() {
    if (!connection.address || !selected) return
    setError(null)
    setStatus('Waiting for the wallet signature…')
    try {
      if (connection.chainId !== selected.chainId) {
        await switchChainAsync({ chainId: selected.chainId })
      }
      const intent = await purpose()
      const challenge = await api.walletChallenge('siwe', {
        address: connection.address,
        network: selected.caip2,
        purpose: intent,
      })
      const signature = await signMessageAsync({ message: challenge.message })
      await api.walletVerify('siwe', { message: challenge.message, signature })
      setStatus('Connected')
      router.push('/wallet')
      router.refresh()
    } catch (caught) {
      setStatus('Not connected')
      setError(caught instanceof ApiClientError ? caught.message : caught instanceof Error ? caught.message : 'The wallet did not approve the request')
    }
  }

  async function signSolana() {
    if (!solana.publicKey || !solana.signMessage) {
      setError('This Solana wallet cannot sign messages.')
      return
    }
    setError(null)
    setStatus('Waiting for the wallet signature…')
    const cluster = endpoint === SOLANA_MAINNET ? 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' : 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
    try {
      const intent = await purpose()
      const challenge = await api.walletChallenge('siws', {
        address: solana.publicKey.toBase58(),
        network: cluster,
        purpose: intent,
      })
      const signature = await solana.signMessage(new TextEncoder().encode(challenge.message))
      await api.walletVerify('siws', { message: challenge.message, signature: bytesToBase64(signature) })
      setStatus('Connected')
      router.push('/wallet')
      router.refresh()
    } catch (caught) {
      setStatus('Not connected')
      setError(caught instanceof ApiClientError ? caught.message : caught instanceof Error ? caught.message : 'The wallet did not approve the request')
    }
  }

  return (
    <section className="erax-feed">
      <h1>Connect</h1>
      <p className="erax-muted">
        {signedIn ? 'A wallet signature will link this address to the signed-in EraX account.' : 'A wallet signature can create a session. Email registration does not require a wallet.'}
      </p>
      <p className="erax-pill">{isPending || solana.connecting ? 'Connecting' : connection.address || solana.connected ? 'Connected' : status}</p>
      {wrongNetwork ? <Alert>Wrong network. Switch to {selected?.name} before signing.</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <article className="erax-card">
        <h2>Ethereum and Base</h2>
        <label className="erax-field">
          <span>Network</span>
          <select value={network} onChange={(event) => setNetwork(event.target.value)}>
            {evmNetworks.map((item) => (
              <option key={item.caip2} value={item.caip2}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {connection.address ? <p className="erax-address">{connection.address}</p> : <p>Not connected</p>}
        <div className="erax-actions">
          {ready ? connectors.map((connector) => (
            <button
              className="erax-button-secondary"
              key={connector.uid}
              type="button"
              disabled={isPending}
              onClick={() => void connectAsync({ connector }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'The wallet did not connect'))}
            >
              {isPending ? 'Connecting…' : connector.name}
            </button>
          )) : <p className="erax-muted">Loading wallets…</p>}
          {connection.address ? (
            <>
              {wrongNetwork ? (
                <button className="erax-button" type="button" onClick={() => selected && void switchChainAsync({ chainId: selected.chainId })}>
                  Switch network
                </button>
              ) : null}
              <button className="erax-button" type="button" onClick={() => void signEvm()}>
                Sign the EraX challenge
              </button>
              <button className="erax-button-secondary" type="button" onClick={() => void disconnectAsync()}>
                Disconnect this browser wallet
              </button>
            </>
          ) : null}
        </div>
        {walletConnectConfigured ? null : <p className="erax-muted">WalletConnect is hidden until NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.</p>}
      </article>
      <article className="erax-card">
        <h2>Solana</h2>
        <label className="erax-field">
          <span>Cluster</span>
          <select
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
          >
            <option value={SOLANA_DEVNET}>Solana Devnet</option>
            <option value={SOLANA_MAINNET}>Solana mainnet-beta</option>
          </select>
        </label>
        {endpoint === SOLANA_MAINNET ? <Alert>This is Solana mainnet. A transfer still waits for your wallet approval.</Alert> : null}
        {solana.publicKey ? <p className="erax-address">{solana.publicKey.toBase58()}</p> : <p>Not connected</p>}
        <div className="erax-actions">
          {ready ? solana.wallets.map((wallet) => (
            <button
              className="erax-button-secondary"
              key={wallet.adapter.name}
              type="button"
              onClick={() => {
                solana.select(wallet.adapter.name)
                void solana.connect().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'The wallet did not connect'))
              }}
            >
              {solana.connecting ? 'Connecting…' : wallet.adapter.name}
            </button>
          )) : <p className="erax-muted">Loading wallets…</p>}
          {solana.connected ? (
            <>
              <button className="erax-button" type="button" onClick={() => void signSolana()}>
                Sign the EraX challenge
              </button>
              <button className="erax-button-secondary" type="button" onClick={() => void solana.disconnect()}>
                Disconnect this browser wallet
              </button>
            </>
          ) : null}
        </div>
      </article>
    </section>
  )
}
