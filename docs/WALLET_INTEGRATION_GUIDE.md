# Wallet integration guide

EraX wallet support is an addition to the existing social application. Email and password registration does not ask for a wallet. A wallet signature is a second way to open a session, and a signed-in user can link more than one wallet.

The browser connectors live in `apps/web`. The API verifies signatures, reads balances, and checks receipts. It does not hold keys and it does not broadcast transactions.

## Packages

| Package | Role |
| --- | --- |
| `packages/wallet-core` | Shared types, decimal-safe amounts, rejection of secret field names. |
| `packages/blockchain-common` | The six networks, trusted assets, RPC URL selection. |
| `packages/wallet-evm` | SIWE, ETH and ERC-20 fields, Viem reads. |
| `packages/wallet-solana` | SIWS, SOL and SPL fields, web3.js 1.99.0 reads. |
| `services/api/src/wallets.ts` | Challenges, linking, balances, previews, history. |
| `services/indexer` | Forward scan and checkpoints. |

## Routes

| Path | What it does |
| --- | --- |
| `/wallet` | Linked wallets and native or token quantities. Valuation is labeled unavailable. |
| `/wallet/connect` | Connect an injected EVM wallet or a Solana wallet, then sign the EraX challenge. |
| `/wallet/assets` | Trusted catalog and unverified balances. |
| `/wallet/receive` | Public address, copy, explorer link, and a QR code of the address. |
| `/wallet/send` | Preview, wallet approval, then receipt refresh. |
| `/wallet/transactions` | Paginated history. The page says the list is not complete. |

The social navigation includes Wallet. The wallet pages link back to Social.

## What the user does

1. Open `/wallet/connect`.
2. Choose a network. Development defaults are Ethereum Sepolia and Solana devnet.
3. Connect the browser wallet. That step does not sign anything.
4. Choose **Sign the EraX challenge**. The wallet shows the message. EraX stores a session only after the API verifies the signature.
5. If an EraX session already exists, the same button links the address to that account instead of creating a new one.

Disconnect on the wallet list sets `disconnected_at`. The address stays reserved for that account. Another account cannot claim it in this phase.

## API

Challenge and verify:

- `POST /api/v1/auth/siwe/challenge`
- `POST /api/v1/auth/siwe/verify`
- `POST /api/v1/auth/siws/challenge`
- `POST /api/v1/auth/siws/verify`

Wallet data, all session-authenticated:

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

Mutations require an allowed `Origin` and the CSRF header `x-erax-csrf`.

## Environment

Server RPC URLs. Leave them empty to disable that network outside development. Development falls back to keyless public endpoints. Test and production do not.

```text
EVM_RPC_URL_1=
EVM_RPC_URL_8453=
EVM_RPC_URL_11155111=
EVM_RPC_URL_84532=
SOLANA_RPC_URL_MAINNET=
SOLANA_RPC_URL_DEVNET=
TRUSTED_TOKEN_LIST_JSON=
```

Browser variables. These are visible in the page, so they must not contain an API key.

```text
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_SOLANA_RPC_URL_DEVNET=
NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET=
```

`WEB_ORIGIN` is the domain and URI embedded in SIWE and SIWS messages. For local web it is `http://127.0.0.1:3000`, and the domain includes the port.

## Amounts

Balances and transfer amounts are integer base units (`bigint` in the services, decimal strings at the HTTP boundary). `parseDecimalToBaseUnits` and `formatBaseUnits` do not use floating-point division. A displayed symbol from an unknown token is truncated and marked unverified.

## Local checks

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @erax/web build
```

`pnpm test` uses PGlite and mocked chain readers. It does not send funds. A browser wallet approval requires MetaMask, Coinbase Wallet, Phantom, Solflare, or Backpack installed in the browser. This environment did not complete that approval.

## Not in this phase

No EraX token, no contract deployment, no dollar prices, no transfer of a linked address to another account, and no claim that wallet history is complete.
