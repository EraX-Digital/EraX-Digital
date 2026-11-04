# Solana integration guide

Solana uses `@solana/web3.js` 1.99.0. That version is pinned in the root `pnpm.overrides` because the current npm latest, 3.x, does not match Wallet Adapter or `@solana/spl-token` 0.4.15. Solana Kit is not installed. Do not remove the override.

Server signatures use `@noble/curves` 2.4.0 (`@noble/curves/ed25519.js`). The browser uses Wallet Adapter.

## Networks

| Cluster | CAIP-2 | Server RPC variable | Browser default |
| --- | --- | --- | --- |
| mainnet-beta | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `SOLANA_RPC_URL_MAINNET` | `https://api.mainnet-beta.solana.com` |
| devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | `SOLANA_RPC_URL_DEVNET` | `https://api.devnet.solana.com` |

The browser defaults can be replaced with `NEXT_PUBLIC_SOLANA_RPC_URL_DEVNET` and `NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET`. Those values are compiled into the client. Do not put an API key in them.

Development uses the public URL when the server variable is empty. Test and production do not.

## Connectors

`apps/web/components/wallet-providers.tsx` registers:

- Phantom (`@solana/wallet-adapter-phantom` 0.9.30)
- Solflare (`@solana/wallet-adapter-solflare` 0.6.34)
- Backpack (`@solana/wallet-adapter-backpack` 0.1.14)

The umbrella `@solana/wallet-adapter-wallets` package is not used. It pulled `@solana/web3.js` 3. The Backpack adapter package is deprecated upstream and is still the package that was installed.

Wallet Adapter prints a React 19 peer warning. The web typecheck and production build are the compatibility check used here.

## Sign-In with Solana

The challenge is a text message, not a transaction:

```text
<domain> wants you to sign in with your Solana account:
<base58 address>
<statement>

URI: <WEB_ORIGIN>
Version: 1
Chain ID: <CAIP-2>
Nonce: <32 hex characters>
Issued At: <ISO-8601>
Expiration Time: <10 minutes later>
```

The wallet's `signMessage` signs the UTF-8 bytes. The API accepts a 64-byte signature as base64 or `0x` hex and verifies it with ed25519 against the address. The nonce is consumed once. Replay returns `wallet_challenge_reused` and does not set a cookie.

Solana addresses are stored in their canonical base58 form. They are not lowercased. The database unique key is the exact address, not `lower(address)`.

## Transfers

Native SOL is a System Program transfer. The lamport amount must be a safe integer before it is passed to web3.js 1.

SPL transfers use `@solana/spl-token` 0.4.15. The preview adds an idempotent associated-token-account instruction so the recipient account can be created in the same approval. Token-2022 uses program `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` when the asset kind is `token2022`. The classic program is `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`.

The wallet broadcasts with `sendTransaction`. EraX stores the signature as `pending`. Refresh marks it finalized only when the parsed system or SPL transfer matches the sender, recipient or associated token account, and amount. Anything else is `failed` or stays `pending`.

## History limit

`POST /api/v1/wallets/:id/history/sync` asks the RPC for a page of recent finalized signatures and stores decoded system transfers. SPL transfers in that page are not decoded by the sync route. The indexer records decoded finalized system transfers it sees after the checkpoint. Neither path is a full account history.

## Checked live read

On 2026-11-04, `createSolanaReader` against `https://api.devnet.solana.com` returned `1` lamport for the System Program address `11111111111111111111111111111111`. No transaction was sent.

## Local validator

Automated tests construct instructions and verify signatures with keys created in the test. They do not start `solana-test-validator` and they do not request an airdrop.
