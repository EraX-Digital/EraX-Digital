# Phase 4 completion report

Date: 2026-11-04

Phase 4 adds real Ethereum, Base, and Solana wallet integration to the existing EraX Social application. No smart contract was deployed. No mainnet transaction was sent. Phase 5 was not started.

## Status by requirement

| Requirement | Status |
| --- | --- |
| Connect an EVM wallet from the browser | IMPLEMENTED BUT NOT FULLY TESTED |
| Connect a Solana wallet from the browser | IMPLEMENTED BUT NOT FULLY TESTED |
| Link more than one wallet to one EraX account | COMPLETED AND TESTED |
| Read balances from a chain | COMPLETED AND TESTED |
| Show native and token balances, with unknown tokens unverified | COMPLETED AND TESTED |
| Receive page with the public address | IMPLEMENTED BUT NOT FULLY TESTED |
| Prepare and submit an ETH transfer | IMPLEMENTED BUT NOT FULLY TESTED |
| Prepare and submit an ERC-20 transfer | IMPLEMENTED BUT NOT FULLY TESTED |
| Prepare and submit a SOL transfer | IMPLEMENTED BUT NOT FULLY TESTED |
| Prepare and submit an SPL transfer | IMPLEMENTED BUT NOT FULLY TESTED |
| Confirm a transaction from the chain receipt | COMPLETED AND TESTED |
| Transaction history from real records, with pagination | COMPLETED AND TESTED |
| Sign-In with Ethereum | COMPLETED AND TESTED |
| Sign-In with Solana | COMPLETED AND TESTED |
| Wallet ownership check | COMPLETED AND TESTED |
| Indexer checkpoint that survives a restart | COMPLETED AND TESTED |
| Wallet security tests | COMPLETED AND TESTED |
| Existing social application | COMPLETED AND TESTED |
| Builds and the automated suite | COMPLETED AND TESTED |
| Live wallet-extension approval | BLOCKED |
| Live PostgreSQL migration on this machine | BLOCKED |
| Dollar portfolio value | NOT IMPLEMENTED |
| Transfer of a linked address to another account | NOT IMPLEMENTED |
| Exhaustive historical index | NOT IMPLEMENTED |
| EIP-1271 against a contract wallet | IMPLEMENTED BUT NOT FULLY TESTED |
| Solana indexer tick unit test | PARTIALLY IMPLEMENTED |

Browser buttons, network selectors, and the signed-out empty states were exercised at `http://127.0.0.1:3000`. MetaMask, Coinbase Wallet, Phantom, Solflare, and Backpack are on the connect page. No extension completed an approval, so no address was linked from the browser and no transfer was broadcast.

## What was implemented

- SIWE (EIP-4361) and SIWS text challenges, 32-hex nonces, 10-minute expiry, domain and URI taken from `WEB_ORIGIN`, single use, and an EraX session only after the signature matches.
- Email registration is unchanged and does not require a wallet.
- One user can link several wallets. One address stays with the first verified owner. Disconnect does not release it. Another account receives `wallet_owned_elsewhere`.
- ETH and ERC-20 previews, and SOL and SPL previews including an idempotent associated-token account and Token-2022 when the asset says so.
- The wallet broadcasts. The API records `pending` and later reads the chain. A match is confirmed or finalized. A mismatch is failed. A missing receipt stays pending.
- Native ETH on Ethereum and Base, native SOL, ERC-20, and SPL or Token-2022 balances. Amounts are base-unit integers. Unknown tokens are labeled unverified. Valuation is shown as unavailable.
- Forward indexer for the six networks: head checkpoint, at most 25 EVM blocks, reorg rewind of up to 12 blocks, Solana finalized commitment, and no cursor movement when the RPC fails.

## Source paths

- `packages/wallet-core`
- `packages/blockchain-common`
- `packages/wallet-evm`
- `packages/wallet-solana`
- `packages/database/migrations/0003_wallet.sql`
- `services/api/src/wallets.ts`
- `services/api/src/wallet-routes.ts`
- `services/api/src/chain-readers.ts`
- `services/indexer/src/tick.ts`
- `services/indexer/src/index.ts`
- `apps/web/app/wallet`
- `apps/web/lib/wagmi-config.ts`
- `apps/web/components/wallet-providers.tsx`
- `apps/web/components/wallet-frame.tsx`

## Installed versions

| Package | Version |
| --- | --- |
| wagmi | 3.7.11 |
| viem | 2.57.16 |
| @tanstack/react-query | 5.105.3 |
| @metamask/connect-evm | 2.1.1 |
| @coinbase/wallet-sdk | 4.4.0 |
| @solana/web3.js | 1.99.0, pinned with `pnpm.overrides` |
| @solana/spl-token | 0.4.15 |
| @noble/curves | 2.4.0 |
| @solana/wallet-adapter-base | 0.9.28 |
| @solana/wallet-adapter-react | 0.15.40 |
| @solana/wallet-adapter-phantom | 0.9.30 |
| @solana/wallet-adapter-solflare | 0.6.34 |
| @solana/wallet-adapter-backpack | 0.1.14 (deprecated upstream) |
| qrcode | 1.5.4 |

`@solana/web3.js` 3.x was rejected. It does not match Wallet Adapter or `@solana/spl-token` 0.4.15. Solana Kit is not installed. Wagmi 3 is the release pnpm resolved; the account hook is `useConnection`.

## Networks

| Network | CAIP-2 | RPC variable |
| --- | --- | --- |
| Ethereum | `eip155:1` | `EVM_RPC_URL_1` |
| Base | `eip155:8453` | `EVM_RPC_URL_8453` |
| Ethereum Sepolia | `eip155:11155111` | `EVM_RPC_URL_11155111` |
| Base Sepolia | `eip155:84532` | `EVM_RPC_URL_84532` |
| Solana mainnet-beta | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `SOLANA_RPC_URL_MAINNET` |
| Solana devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | `SOLANA_RPC_URL_DEVNET` |

Development uses a keyless public endpoint when the variable is empty. Test and production do not. Production RPC URLs must be `https`.

Browser-only variables, which must not contain an API key:

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — WalletConnect is omitted when this is empty. The WalletConnect provider package is not installed in that case.
- `NEXT_PUBLIC_SOLANA_RPC_URL_DEVNET`
- `NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET`

## Connectors

Injected, MetaMask, and Coinbase Wallet are always registered. WalletConnect is registered only with a project id. Phantom, Solflare, and Backpack are registered for Solana. The connect page waits until after hydration before rendering those buttons, because the Solana adapters exist only in the browser.

## API

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

## Database

`packages/database/migrations/0003_wallet.sql` is additive. It makes `users.email` and `users.password_hash` nullable for wallet-only accounts, replaces the case-folded wallet unique index with an exact-address unique index, and adds `wallet_auth_events`, `wallet_preferences`, `blockchain_networks`, `blockchain_assets`, `wallet_transactions`, `transaction_status_updates`, and `indexer_checkpoints`.

The PGlite migration test applies it and skips it on the second run. It was not applied to a live PostgreSQL server here.

## Live chain reads

These reads used the EraX readers. No transaction was submitted.

- Sepolia `eth_getBalance` for `0x0000000000000000000000000000000000000000` through `createViemReader` and `https://ethereum-sepolia-rpc.publicnode.com` returned `133855804691232740709454` wei.
- Solana devnet `getBalance` for the System Program address through `createSolanaReader` and `https://api.devnet.solana.com` returned `1` lamport.

Automated tests do not call those endpoints. They inject fake readers. A balance of `1000000000000000000` wei and a fee of `21000` wei were returned by the fake reader and checked by the API test.

## Transaction verification in tests

The API test records three hashes as pending, pages them with `limit=2`, refreshes one while the reader has no receipt and keeps it pending, then returns a matching receipt and expects `confirmed`. Changing the receipt value to a different amount expects `failed`. The client cannot set the status.

Indexer tests store the head without backfill, scan a later block, rewind on a parent-hash mismatch, and leave the checkpoint in place when the fake RPC throws.

## Commands

```text
pnpm typecheck
exit 0

pnpm lint
exit 0

pnpm test
Test Files  22 passed | 1 skipped (23)
     Tests  56 passed | 1 skipped (57)
Duration  75.84s

pnpm --filter @erax/web build
exit 0 (Next.js 16.4.4). Routes include /wallet, /wallet/connect, /wallet/assets, /wallet/receive, /wallet/send, and /wallet/transactions.

pnpm --filter @erax/admin build
exit 0
```

`pnpm test` was run after the API wallet fixes. The later edits are the connect-page hydration gate, bottom-nav padding, and the MetaMask and Coinbase peer packages. The web build and lint were run again after those edits. The skipped test is still `packages/database/src/postgres-migrate.test.ts`.

## Browser check

Signed in as the existing local development account, `/app` still listed the home feed and a Wallet link. That link opens `/wallet`. The overview says valuation is unavailable and that no wallet is linked. `/wallet/connect` lists Injected, MetaMask, Coinbase Wallet, Phantom, Solflare, and Backpack, defaults to Sepolia and devnet, and says WalletConnect is hidden. `/wallet/receive` and `/wallet/assets` say not connected. `/wallet/send` accepts a recipient and keeps Preview disabled until a wallet is selected. `/wallet/transactions` says the list is not a complete history. `/login` links to wallet sign-in. A 390-pixel viewport still shows the wallet heading, the valuation notice, and the bottom navigation.

Clicking MetaMask entered `Connecting` and did not finish. No MetaMask window appeared. Clicking Phantom did not connect and did not report an installed extension. Those approvals are BLOCKED in this browser.

## Security limitations

- Private keys and seed phrases are rejected and are not stored. The server does not sign.
- EIP-1271 runs only when an RPC URL is configured. No contract wallet was tested.
- There is no flow to move an address from one EraX account to another.
- History is EraX submissions plus a forward index and a bounded Solana system-transfer page. SPL transfers in that sync page are not decoded. The product does not claim a full history.
- The indexer and the API cannot share one PGlite directory at the same time. Use PostgreSQL when both processes must scan together.
- A keyed RPC URL must stay in the server variables. Logs strip `http` URLs.

## Production requirements before wallets are useful there

- Set `https` RPC URLs for every network that should answer.
- Set `WEB_ORIGIN` to the public web origin. SIWE and SIWS bind the domain and URI to it.
- Run migration `0003_wallet.sql` on PostgreSQL. Do not point it at Neon until the production checklist is approved.
- Optional: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` and then install `@walletconnect/ethereum-provider` if WalletConnect should appear.
- Optional: `TRUSTED_TOKEN_LIST_JSON` for tokens beyond native coins and the two Circle USDC contracts.
- Do not put API keys in `NEXT_PUBLIC_` variables.

## Not started

Contract deployment, an EraX token, mainnet sends, and the next phase.
