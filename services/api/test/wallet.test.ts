import { ed25519 } from '@noble/curves/ed25519.js'
import { PublicKey } from '@solana/web3.js'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { EvmReader } from '@erax/wallet-evm'
import type { SolanaReader } from '@erax/wallet-solana'
import { readOutbox } from '../src/email'
import { createTestApp, origin, sessionCookie } from './app'

const receiptState: {
  receipt: { status: 'success' | 'reverted'; feeBaseUnits: string; blockNumber: bigint } | null
  transaction: { from: string; to: string | null; value: bigint; input: `0x${string}` } | null
} = { receipt: null, transaction: null }

const evmReader: EvmReader = {
  async getNativeBalance() {
    return 10n ** 18n
  },
  async readErc20() {
    return { balance: 1_000_000n, decimals: 6, symbol: 'USDC', name: 'USD Coin' }
  },
  async estimateFee() {
    return 21_000n
  },
  async getTransaction() {
    return receiptState.transaction
  },
  async getReceipt() {
    return receiptState.receipt
  },
  async verifyContractSignature() {
    return false
  },
}

const solanaReader: SolanaReader = {
  async getNativeBalance() {
    return 2_000_000_000n
  },
  async getTokenAccounts() {
    return []
  },
  async getMint() {
    return { decimals: 6, program: 'spl' }
  },
  async estimateFee() {
    return 5_000n
  },
  async getSignatureStatus() {
    return 'pending'
  },
  async getParsedTransfers() {
    return null
  },
  async getRecentSignatures() {
    return []
  },
}

describe('wallet authentication and transfers', () => {
  let context: Awaited<ReturnType<typeof createTestApp>>

  beforeAll(async () => {
    context = await createTestApp({
      chainReaders: {
        evm: { 'eip155:11155111': evmReader },
        solana: { 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': solanaReader },
      },
    })
  })

  afterAll(async () => {
    await context.app.close()
  })

  it('signs in with SIWE, rejects replay, links Solana, and refuses a second owner', async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const challenge = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/siwe/challenge',
      headers: { origin },
      payload: { address: account.address, network: 'eip155:11155111', purpose: 'sign-in' },
    })
    expect(challenge.statusCode).toBe(200)
    const message = challenge.json().message as string
    const signature = await account.signMessage({ message })
    const verified = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/siwe/verify',
      headers: { origin },
      payload: { message, signature },
    })
    expect(verified.statusCode).toBe(200)
    expect(verified.json().user.email).toBeNull()
    const cookies = sessionCookie(verified.headers['set-cookie'])

    const replay = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/siwe/verify',
      headers: { origin },
      payload: { message, signature },
    })
    expect(replay.statusCode).toBe(401)
    expect(replay.headers['set-cookie']).toBeUndefined()

    const solana = ed25519.keygen()
    const solanaAddress = new PublicKey(solana.publicKey).toBase58()
    const solanaChallenge = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/siws/challenge',
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
      payload: {
        address: solanaAddress,
        network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        purpose: 'link',
      },
    })
    expect(solanaChallenge.statusCode).toBe(200)
    const solanaMessage = solanaChallenge.json().message as string
    const solanaSignature = Buffer.from(
      ed25519.sign(new TextEncoder().encode(solanaMessage), solana.secretKey),
    ).toString('base64')
    const linked = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/siws/verify',
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
      payload: { message: solanaMessage, signature: solanaSignature },
    })
    expect(linked.statusCode).toBe(200)
    expect(linked.json().linked).toBe(true)

    const listed = await context.app.inject({
      method: 'GET',
      url: '/api/v1/wallets',
      headers: { cookie: cookies.cookie },
    })
    expect(listed.statusCode).toBe(200)
    const rows = listed.json().wallets as Array<{ id: string; family: string; address: string }>
    expect(rows).toHaveLength(2)
    const evmWallet = rows.find((wallet) => wallet.family === 'evm')
    const solanaWallet = rows.find((wallet) => wallet.family === 'solana')
    if (!evmWallet || !solanaWallet) throw new Error('expected both wallets')

    const preferred = await context.app.inject({
      method: 'POST',
      url: `/api/v1/wallets/${solanaWallet.id}/preferred`,
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
    })
    expect(preferred.statusCode).toBe(200)

    const balances = await context.app.inject({
      method: 'GET',
      url: `/api/v1/wallets/${evmWallet.id}/balances`,
      headers: { cookie: cookies.cookie },
    })
    expect(balances.statusCode).toBe(200)
    expect(balances.json().valuation).toBe('unavailable')
    expect(balances.json().balances[0].amountBaseUnits).toBe((10n ** 18n).toString())

    const preview = await context.app.inject({
      method: 'POST',
      url: '/api/v1/wallets/transfers/preview',
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
      payload: {
        walletId: evmWallet.id,
        recipient: '0x0000000000000000000000000000000000000004',
        assetAddress: '',
        amount: '0.001',
      },
    })
    expect(preview.statusCode).toBe(200)
    expect(preview.json().feeStatus).toBe('estimated')
    expect(preview.json().transaction.data).toBe('0x')
    expect(preview.json().sender).toBe(account.address.toLowerCase())

    const tooMuch = await context.app.inject({
      method: 'POST',
      url: '/api/v1/wallets/transfers/preview',
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
      payload: {
        walletId: evmWallet.id,
        recipient: '0x0000000000000000000000000000000000000004',
        assetAddress: '',
        amount: '2',
      },
    })
    expect(tooMuch.statusCode).toBe(400)
    expect(tooMuch.json().error.code).toBe('insufficient_balance')

    const invalid = await context.app.inject({
      method: 'POST',
      url: '/api/v1/wallets/transfers/preview',
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
      payload: { walletId: evmWallet.id, recipient: 'not-an-address', assetAddress: '', amount: '1' },
    })
    expect(invalid.statusCode).toBe(400)

    const hashes = ['1', '2', '3'].map((digit) => `0x${digit.repeat(64)}`)
    for (const hash of hashes) {
      const recorded = await context.app.inject({
        method: 'POST',
        url: '/api/v1/wallets/transactions',
        headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
        payload: {
          walletId: evmWallet.id,
          recipient: '0x0000000000000000000000000000000000000004',
          assetAddress: '',
          assetSymbol: 'ETH',
          amountBaseUnits: '1',
          hash,
        },
      })
      expect(recorded.statusCode).toBe(201)
      expect(recorded.json().confirmed).toBe(false)
      expect(recorded.json().transaction.status).toBe('pending')
    }

    const firstPage = await context.app.inject({
      method: 'GET',
      url: '/api/v1/wallets/transactions?limit=2',
      headers: { cookie: cookies.cookie },
    })
    expect(firstPage.json().transactions).toHaveLength(2)
    expect(firstPage.json().coverage).toMatch(/not a complete/i)
    const secondPage = await context.app.inject({
      method: 'GET',
      url: `/api/v1/wallets/transactions?limit=2&cursor=${encodeURIComponent(firstPage.json().nextCursor)}`,
      headers: { cookie: cookies.cookie },
    })
    expect(secondPage.json().transactions).toHaveLength(1)

    const pendingId = firstPage.json().transactions[0].id as string
    receiptState.receipt = null
    receiptState.transaction = null
    const pending = await context.app.inject({
      method: 'POST',
      url: `/api/v1/wallets/transactions/${pendingId}/refresh`,
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
    })
    expect(pending.json().transaction.status).toBe('pending')

    receiptState.receipt = { status: 'success', feeBaseUnits: '21000', blockNumber: 10n }
    receiptState.transaction = {
      from: account.address,
      to: '0x0000000000000000000000000000000000000004',
      value: 1n,
      input: '0x',
    }
    const confirmed = await context.app.inject({
      method: 'POST',
      url: `/api/v1/wallets/transactions/${pendingId}/refresh`,
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
    })
    expect(confirmed.json().transaction.status).toBe('confirmed')

    receiptState.transaction = { ...receiptState.transaction, value: 2n }
    const mismatched = await context.app.inject({
      method: 'POST',
      url: `/api/v1/wallets/transactions/${pendingId}/refresh`,
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
    })
    expect(mismatched.json().transaction.status).toBe('failed')

    const stranger = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin },
      payload: {
        email: 'wallet-stranger@example.com',
        password: 'correct-horse-1',
        username: 'stranger1',
        displayName: 'Stranger',
      },
    })
    expect(stranger.statusCode).toBe(201)
    const messages = await readOutbox(context.outboxDir)
    const messageText = messages.find((item) => item.to === 'wallet-stranger@example.com')?.text ?? ''
    const match = messageText.match(/token=([A-Za-z0-9_-]+)/)
    if (!match?.[1]) throw new Error('verification token missing')
    await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      headers: { origin },
      payload: { token: match[1] },
    })
    const login = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { email: 'wallet-stranger@example.com', password: 'correct-horse-1' },
    })
    const strangerCookies = sessionCookie(login.headers['set-cookie'])
    const steal = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/siwe/challenge',
      headers: { origin, cookie: strangerCookies.cookie, 'x-erax-csrf': strangerCookies.csrf },
      payload: { address: account.address, network: 'eip155:11155111', purpose: 'link' },
    })
    const stealMessage = steal.json().message as string
    const stealSignature = await account.signMessage({ message: stealMessage })
    const stolen = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/siwe/verify',
      headers: { origin, cookie: strangerCookies.cookie, 'x-erax-csrf': strangerCookies.csrf },
      payload: { message: stealMessage, signature: stealSignature },
    })
    expect(stolen.statusCode).toBe(409)
    expect(stolen.json().error.code).toBe('wallet_owned_elsewhere')

    const removed = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/wallets/${solanaWallet.id}`,
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
    })
    expect(removed.statusCode).toBe(200)
    const after = await context.app.inject({
      method: 'GET',
      url: '/api/v1/wallets',
      headers: { cookie: cookies.cookie },
    })
    expect(after.json().wallets.find((wallet: { id: string }) => wallet.id === solanaWallet.id).connected).toBe(
      false,
    )
  })
})
