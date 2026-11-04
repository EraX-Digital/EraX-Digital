# Phase 4 architecture — wallets and chains

This document is the integration design for EraX Social. It was written before the Phase 4 code. The implementation follows it. It does not replace the social application, and it does not add a token or any smart contract.

## What already existed

Phase 2 left these pieces in place. Phase 4 extends them instead of creating a second account system.

- `wallets` stores a public address, `chain_family` (`evm` or `solana`), a network id, and `verified_at`. The unique key was `(chain_family, network, lower(address))`.
- `auth_challenges` stores `siwe` or `siws`, the address, network, domain, a unique nonce, expiry, and `consumed_at`.
- `POST /api/v1/auth/siwe/verify` and `POST /api/v1/auth/siws/verify` returned HTTP 501. A body that contains a private key, seed, or mnemonic is rejected with `wallet_secret_rejected`.
- `packages/wallet-core` parses integer base-unit strings and rejects secret field names.
- `packages/wallet-evm` and `packages/wallet-solana` only checked address shape and reported wallet authentication as unimplemented.
- `packages/blockchain-common` listed Ethereum, Base, and Solana mainnet and reported the indexer as not connected.
- The indexer process exposes `/health` and `/ready` and does not read chain state.
- Email and password registration does not ask for a wallet. That stays true.

## Package split

| Package | Responsibility |
| --- | --- |
| `packages/wallet-core` | Shared types and decimal-safe amounts. No chain SDK. |
| `packages/blockchain-common` | The six networks, trusted asset catalog, RPC URL selection. No SDK. |
| `packages/wallet-evm` | Viem. SIWE messages, ECDSA and EIP-1271 verification, ETH and ERC-20 transaction fields, receipt checks. |
| `packages/wallet-solana` | `@solana/web3.js` 1.x, `@solana/spl-token`, `@noble/curves`. SIWS messages, ed25519 verification, SOL and SPL instruction construction. |
| `apps/web` | Wagmi, Viem, TanStack Query, and Solana Wallet Adapter. This is the only place wallet connectors run. |
| `services/api` | Challenges, verification, sessions, linked wallets, balance reads, transfer previews, receipt checks. |
| `services/indexer` | Checkpoints and forward scanning. A separate long-running process, not a Vercel function. |

The browser never receives a server RPC URL that could contain an API key. Balance and receipt routes run on the API. The browser uses the connected wallet's own provider for EVM sends. Solana sends use a public cluster URL, or `NEXT_PUBLIC_SOLANA_RPC_URL_DEVNET` / `NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET` when the operator sets one. Those public variables are visible in the browser, so they must not contain a secret.

## Versions

Installed versions are recorded in `docs/PHASE_4_COMPLETION_REPORT.md` after `pnpm install`. The compatibility choices are:

- EVM uses Wagmi 3.7.11, Viem 2.57.16, and TanStack Query 5.105.3. Wagmi 3 is the current release; the connection hook is `useConnection`. Connectors are the ones Wagmi ships: `injected`, `metaMask`, `coinbaseWallet`, and `walletConnect` only when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set. RainbowKit and Reown AppKit are not used.
- Solana uses Wallet Adapter with `@solana/web3.js` 1.99.0, pinned by a pnpm override. The current npm latest, 3.x, is not compatible with Wallet Adapter or `@solana/spl-token` 0.4.15. Solana Kit is not installed.
- Server-side Solana signatures use `@noble/curves` ed25519 over the UTF-8 SIWS message. The API does not import the wallet adapter.

## Networks

| Network | CAIP-2 | Chain id | Environment | RPC environment variable |
| --- | --- | --- | --- | --- |
| Ethereum | `eip155:1` | 1 | mainnet | `EVM_RPC_URL_1` |
| Base | `eip155:8453` | 8453 | mainnet | `EVM_RPC_URL_8453` |
| Ethereum Sepolia | `eip155:11155111` | 11155111 | testnet | `EVM_RPC_URL_11155111` |
| Base Sepolia | `eip155:84532` | 84532 | testnet | `EVM_RPC_URL_84532` |
| Solana mainnet-beta | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | — | mainnet | `SOLANA_RPC_URL_MAINNET` |
| Solana devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | — | testnet | `SOLANA_RPC_URL_DEVNET` |

`resolveRpcUrl` returns the environment variable when it is set. In `NODE_ENV=development` only, an empty variable falls back to a keyless public endpoint so local reads can succeed. In `test` and `production`, an empty variable means the network is not configured. The API then returns `chain_rpc_not_configured` and does not invent a balance, a fee, or a confirmation.

The wallet UI defaults to Sepolia and Solana devnet. Mainnet is selectable. Nothing in the automated tests sends a transaction.

## Shared wallet model

`packages/wallet-core` defines `WalletProvider`, `WalletConnector`, `WalletAccount`, `WalletNetwork`, `WalletBalance`, `WalletTransaction`, `WalletSignature`, and `WalletError`.

Amounts are `bigint` base units. `formatBaseUnits` and `parseDecimalToBaseUnits` use integer arithmetic. Display code does not divide with JavaScript numbers.

Chain errors stay chain errors. An RPC failure is `chain_rpc_failed`. A missing endpoint is `chain_rpc_not_configured`. A reverted receipt is `reverted` or `failed`. A submitted hash is `pending` until a receipt or finalized status is read.

## Accounts and linking

One EraX user can have many wallets. One address on one network belongs to one user.

- Email registration is unchanged and does not require a wallet.
- Wallet sign-in is an additional path. A verified signature creates a session.
- If the address is new, the API creates a user with no email and no password, plus a profile. `users.email` and `users.password_hash` become nullable for this case. Password login still requires a password hash.
- If the address is already verified for a user, the signature opens a session for that user.
- If the caller already has a session, the same signature links the wallet to that user. Linking by address alone is not accepted.
- If the address belongs to a different user, the API returns `wallet_owned_elsewhere`. There is no ownership-transfer flow in this phase.
- Disconnect sets `disconnected_at`. It does not delete the row and does not free the address for another account. The same owner can sign again to clear `disconnected_at`.
- A preferred wallet is stored on `wallet_preferences` and on `wallets.preferred`. One active preferred wallet per user is enforced by a partial unique index.

The session cookie, CSRF cookie, and Origin check are the same ones email login uses.

## Sign-In with Ethereum

`POST /api/v1/auth/siwe/challenge` builds an EIP-4361 message and stores it with a 32 hex-character nonce. The message is valid for 10 minutes.

The message includes the domain and URI from `WEB_ORIGIN`, chain id, nonce, issued-at, and expiration. The client must sign that exact string.

`POST /api/v1/auth/siwe/verify` checks, in order:

1. The body has no secret field.
2. The message matches the stored message.
3. Domain, URI, chain id, nonce, issued-at, and expiration match the rules above.
4. The nonce row is consumed once. A second use fails even if the signature is valid.
5. Viem `verifyMessage` checks the ECDSA signature for an externally owned account.
6. If that does not succeed and the chain has an RPC URL, Viem's public client runs the EIP-1271 `isValidSignature` check. Without an RPC URL, a contract wallet gets a specific error instead of a success response.
7. Only then does the API issue or keep a session.

A failed signature still consumes the nonce. The user requests a new challenge.

## Sign-In with Solana

The Solana message uses the same field set as the Sign In With Solana text challenge: domain, account, statement, URI, version, CAIP-2 chain id, nonce, issued-at, and expiration. The wallet signs the UTF-8 bytes with ed25519 (`signMessage`). The API verifies them with `@noble/curves` against the 32-byte public key. Nonce, domain, expiry, and single use follow the SIWE rules.

This is the message-and-auth flow, not a transaction. The API does not ask the wallet to pay a fee to sign in.

## Balances and assets

Native balances are ETH on Ethereum and Base, including the two testnets, and SOL on mainnet-beta and devnet.

ERC-20 balances use `balanceOf`. Decimals, symbol, and name are read from the contract. SPL and Token-2022 balances use `getParsedTokenAccountsByOwner` for both token programs. Unknown tokens are not marked verified. Their symbol from the chain is sanitized, truncated, and labeled unverified. A symbol that merely says USDC is not treated as USDC.

The trusted catalog is code plus optional `TRUSTED_TOKEN_LIST_JSON`. Built-in verified entries are native ETH and SOL, plus Circle's published USDC contracts on Ethereum mainnet (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`) and Base mainnet (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`). Display uses the chain's decimals. If those decimals disagree with the trusted catalog, the asset is shown as unverified so the human amount cannot be mis-scaled.

No price feed is configured. The UI shows quantities and says portfolio valuation is unavailable. It does not show a dollar total.

There is no EraX token.

## Send and receive

Receive shows the selected wallet's public address, a QR code of that address only, the network, and a warning when the connected wallet's network differs.

Send is a preview, then an explicit wallet approval:

1. The API validates the address, network, asset, and base-unit amount.
2. When an RPC is configured, it reads the balance and estimates the fee. An insufficient balance is rejected. An RPC error is returned as an error.
3. When no RPC is configured, the preview says the fee and balance are unavailable. It does not fill in a zero fee.
4. The UI freezes the preview. Editing the form clears it.
5. The user approves in the wallet. The wallet broadcasts. EraX does not sign and does not hold the key.
6. The API records the hash as `pending` with source `erax`. The client cannot set the status to confirmed.
7. A refresh reads the receipt or the finalized Solana status. Confirmed or finalized is stored only when the chain transaction's sender, recipient, asset, and amount match the record. A mismatch is `failed`. A missing receipt stays `pending`.

EVM transfers are native ETH and ERC-20 `transfer`. Solana transfers are system-program SOL transfers and SPL transfers. SPL previews include an idempotent associated-token-account instruction so a missing recipient account can be created in the same wallet approval. Token-2022 uses the Token-2022 program id when the asset says so.

## History

`wallet_transactions` stores EraX-recorded transfers and rows the indexer observed. Pagination is cursor-based on `(created_at, id)`.

The response says the list is not a complete wallet history. EVM history is EraX submissions plus blocks scanned after the indexer checkpoint. Solana history adds the recent finalized signatures returned by `getSignaturesForAddress` (a bounded RPC page, not the full account history). Rows are marked `erax` or `chain`.

## Indexer

The indexer keeps `indexer_checkpoints` in the same database as the API.

- Each tick checks the RPC result before advancing the cursor.
- The first successful tick stores the current head and does not backfill older blocks or slots.
- Later EVM ticks scan at most 25 blocks. Native transfers and ERC-20 `Transfer` logs for verified linked wallets are inserted. The unique key is `(network, hash, log_index)`.
- A block whose parent hash does not match the stored head is a reorg. The cursor rewinds up to 12 blocks, and rows above the new cursor are marked `dropped`. The next ticks scan the replacement blocks.
- Solana ticks read finalized signatures for linked wallets and record them. Commitment below finalized is not treated as final.
- Restarts read the checkpoint and continue. A failed RPC leaves the checkpoint where it was.
- Reads retry with backoff on rate limits and network failures. Logs omit query strings so an API key in an RPC URL is not written out.

If the database or the RPC URL is missing, `/ready` stays `not_configured` for that work. The process still serves `/health`.

## API surface

- `POST /api/v1/auth/siwe/challenge`
- `POST /api/v1/auth/siwe/verify`
- `POST /api/v1/auth/siws/challenge`
- `POST /api/v1/auth/siws/verify`
- `GET /api/v1/wallet/networks`
- `GET /api/v1/wallet/assets`
- `GET /api/v1/wallets`
- `DELETE /api/v1/wallets/:id`
- `POST /api/v1/wallets/:id/preferred`
- `GET /api/v1/wallets/:id/balances`
- `POST /api/v1/wallets/:id/history/sync`
- `POST /api/v1/wallets/transfers/preview`
- `POST /api/v1/wallets/transactions`
- `GET /api/v1/wallets/transactions`
- `POST /api/v1/wallets/transactions/:id/refresh`

Challenge and verify use the auth rate limit. Wallet reads and writes require a session. Mutations require the CSRF header when a session cookie is present, and every mutation still requires an allowed Origin.

## Web routes

The social shell links to `/wallet`. These routes use the existing EraX layout styles:

- `/wallet`
- `/wallet/connect`
- `/wallet/assets`
- `/wallet/receive`
- `/wallet/send`
- `/wallet/transactions`

Connecting a wallet does not sign by itself. A second button asks the wallet to sign the challenge or the transfer.

## Tests

Unit tests sign with keys created in the test process. Those keys are not stored and are not user keys. API tests use PGlite. Indexer tests use an in-memory chain reader. No test broadcasts a transaction. A live public RPC read is attempted only as a manual check and is reported as blocked when the endpoint does not answer.

## Out of scope

- Smart contracts, contract deployment, and an EraX token.
- Mainnet transfers from this repository's tests or from the agent.
- Ownership transfer of a linked address.
- Dollar pricing.
- A complete historical index of every past transaction.
- Custodial signing.
