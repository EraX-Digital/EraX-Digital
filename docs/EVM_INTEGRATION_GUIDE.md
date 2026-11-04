# EVM integration guide

Ethereum and Base use Viem on the server and Wagmi in the browser. The installed versions are Viem 2.57.16, Wagmi 3.7.11, and TanStack Query 5.105.3.

Wagmi 3 names the account hook `useConnection`. `useAccount` is a deprecated alias and is not used.

## Networks

| Network | Chain id | CAIP-2 | Server RPC variable |
| --- | --- | --- | --- |
| Ethereum | 1 | `eip155:1` | `EVM_RPC_URL_1` |
| Base | 8453 | `eip155:8453` | `EVM_RPC_URL_8453` |
| Ethereum Sepolia | 11155111 | `eip155:11155111` | `EVM_RPC_URL_11155111` |
| Base Sepolia | 84532 | `eip155:84532` | `EVM_RPC_URL_84532` |

Production RPC URLs must be `https`. An empty variable in production or test means that chain is not configured. The API returns `chain_rpc_not_configured` and does not invent a balance or a fee.

Development, when the variable is empty, uses these keyless endpoints:

- Ethereum: `https://ethereum.publicnode.com`
- Base: `https://mainnet.base.org`
- Sepolia: `https://ethereum-sepolia-rpc.publicnode.com`
- Base Sepolia: `https://sepolia.base.org`

Browser reads through Wagmi use the wallet provider and the chain's default public transport from `http()`. Those transports are not a place to put a keyed URL.

## Connectors

`apps/web/lib/wagmi-config.ts` registers:

- `injected()` for wallets that expose `window.ethereum`
- `metaMask()`, which needs `@metamask/connect-evm` 2.1.1. Wagmi treats that package as an optional peer, so EraX depends on it directly.
- `coinbaseWallet({ appName: 'EraX' })`, which needs `@coinbase/wallet-sdk` 4.4.0, also a direct dependency.
- `walletConnect({ projectId })` only when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set. `@walletconnect/ethereum-provider` is not installed until that connector is configured.

RainbowKit is not used. Connecting does not sign. The user then presses **Sign the EraX challenge** or approves a send.

## Sign-In with Ethereum

`packages/wallet-evm` builds an EIP-4361 message:

```text
<domain> wants you to sign in with your Ethereum account:
<address>
<statement>

URI: <WEB_ORIGIN>
Version: 1
Chain ID: <chain id>
Nonce: <32 hex characters>
Issued At: <ISO-8601>
Expiration Time: <10 minutes later>
```

The statement is exactly `Sign in to EraX.` or `Link this wallet to your EraX account.`

Verification order:

1. Reject a body that contains a private key, seed, or mnemonic field.
2. Parse the message and require the EraX domain, URI, chain, nonce, and time window.
3. Consume the stored nonce once. A second request fails with `wallet_challenge_reused`.
4. Verify the ECDSA signature with Viem `verifyMessage`.
5. If that fails and an RPC URL is configured, try EIP-1271 `isValidSignature`. There is no contract-wallet fixture in the tests, so that path is implemented and not integration-tested.
6. Open or keep the EraX session only after the signature matches.

A failed signature still consumes the nonce.

## Transfers

Native ETH uses a transaction with empty calldata `0x` and the value in wei. ERC-20 uses `transfer(address,uint256)`, selector `0xa9059cbb`.

The preview is built on the API. The browser calls `sendTransactionAsync` after `switchChainAsync` when the wallet is on another chain. EraX records the hash as `pending`. Refresh reads the receipt. The row becomes `confirmed` only when the receipt succeeded and the transaction's sender, recipient, asset, and amount match the record. A mismatch is `failed`. A missing receipt stays `pending`. A reverted receipt is `reverted`.

The client cannot set the status.

## Trusted tokens

Native ETH on each configured network is trusted. Circle USDC is trusted only at these contracts, and only when the on-chain decimals are 6:

- Ethereum: `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`
- Base: `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`

Other ERC-20 contracts can be read. They are labeled unverified. `TRUSTED_TOKEN_LIST_JSON` can add more objects:

```json
[{ "network": "eip155:11155111", "kind": "erc20", "symbol": "USDC", "name": "USD Coin", "contractAddress": "0x...", "decimals": 6 }]
```

## Checked live read

On 2026-11-04, `createViemReader` against `https://ethereum-sepolia-rpc.publicnode.com` returned `133855804691232740709454` wei for `0x0000000000000000000000000000000000000000`. No transaction was sent.
