# Phase 5 architecture

Date: 2026-11-04

Phase 5 adds a Foundry workspace for two non-upgradeable contracts: `CreatorRegistry` and `CreatorTipping`. It does not add a token, a proxy, or a frontend that pretends a deployment exists.

## Phase 4 check

Phase 4 is implemented in the repository and is the prerequisite for this work.

- SIWE message construction and ECDSA verification live in `packages/wallet-evm`. The API challenge and verify routes persist a one-time nonce and open an EraX session only after the signature matches. `services/api/test/wallet.test.ts` covers that path.
- Wagmi 3 registers injected, MetaMask, and Coinbase Wallet connectors for Ethereum, Base, Sepolia, and Base Sepolia. The send page submits `to`, `data`, and `value` through `sendTransactionAsync`, so a contract call can be approved by the connected wallet.
- Balance reads and receipt checks use Viem. Automated tests inject readers. A Sepolia `eth_getBalance` read was recorded in the Phase 4 report. No mainnet transaction was sent.
- The indexer stores native value transfers and ERC-20 logs for linked wallets. It does not decode `TipSent`.

These items are still limited, and they do not block the contract workspace:

- A browser extension approval was not completed in the previous session. The connect buttons are real connectors, not simulated wallets.
- EIP-1271 is implemented and has no contract-wallet test.
- Portfolio pricing, ownership transfer, and historical backfill were left out of Phase 4 on purpose.
- PostgreSQL does not start under this Administrator account. Wallet migration `0003_wallet.sql` was applied on PGlite.

No Solidity or Foundry project existed before this phase. The database can store a transaction hash, sender, recipient, and amount, which is compatible with recording a tip later. The current indexer would mislabel a tip as ETH sent to the tipping contract, so it is not wired to these contracts.

## Workspace

`contracts/evm` is the Foundry project.

| Path | Role |
| --- | --- |
| `src/registry/CreatorRegistry.sol` | Creator identity for one chain |
| `src/creator/CreatorTipping.sol` | Native ETH forwarding |
| `src/interfaces/ICreatorRegistry.sol` | Views tipping depends on |
| `src/libraries/MetadataUri.sol` | URI validation |
| `test` | Unit, fuzz, and invariant tests |
| `script` | Sepolia and Base Sepolia only |
| `deployments` | Empty records. Addresses are null |

Compiler: Solidity 0.8.30, optimizer on, 200 runs, EVM version `cancun`. Foundry v1.9.0. OpenZeppelin Contracts v5.4.0 supplies `ReentrancyGuard`. forge-std v1.11.0 supplies the test harness. Both libraries are cloned into `contracts/evm/lib` and are gitignored.

## Cross-chain identity

An EOA derived from the same key has the same address on Ethereum and Base. That does not make it one creator record. Each network has its own registry deployment and its own storage. A creator registers on each network where they want to be payable. A contract wallet can also sit at different addresses on the two networks. EraX must store the pair `(chainId, address)` and must not copy a registration, a payout, or a contract address from one network to the other.

## What calls what

```text
wallet user
  -> CreatorRegistry.register / updateMetadata / updatePayout
  -> CreatorTipping.tip (msg.value)
       -> CreatorRegistry.isRegistered
       -> CreatorRegistry.payoutOf
       -> payout.call{value: amount}
```

The API does not sign and does not hold the ETH. The connected wallet sends the transaction. `packages/wallet-evm/src/creator-contracts.ts` encodes those three calls. The web app does not expose them yet, because `deployments/*.json` has no addresses.

## Explicitly not in this phase

- Mainnet deployment and any broadcast.
- ERC-20 tipping, fees, custody, and an EraX token.
- Upgradeable proxies and administrator impersonation.
- A creator page in the web app.
- Indexer decoding of `TipSent`.
- An independent security audit.
