# Phase 5 completion report

Date: 2026-11-04

Phase 5 adds `CreatorRegistry` and `CreatorTipping` in a Foundry workspace. Both contracts compile. Local tests passed. Nothing was deployed. No mainnet or testnet transaction was sent. Phase 6 was not started.

## 1. Summary

Creators can register a wallet and an https or ipfs metadata URI on one chain, then update that URI or their payout address. Other users can send native ETH to a registered creator. The tipping contract forwards the full value and keeps nothing. There is no fee, no token, no administrator, and no proxy.

The existing wallet package can encode the three user transactions. The web app does not call them, because there is no deployed address.

## 2. Files

Created:

- `contracts/evm/foundry.toml`
- `contracts/evm/remappings.txt`
- `contracts/evm/README.md`
- `contracts/evm/src/interfaces/ICreatorRegistry.sol`
- `contracts/evm/src/libraries/MetadataUri.sol`
- `contracts/evm/src/registry/CreatorRegistry.sol`
- `contracts/evm/src/creator/CreatorTipping.sol`
- `contracts/evm/test/CreatorRegistry.t.sol`
- `contracts/evm/test/CreatorTipping.t.sol`
- `contracts/evm/test/invariant/RegistryInvariant.t.sol`
- `contracts/evm/test/invariant/TippingInvariant.t.sol`
- `contracts/evm/script/DeploySepolia.s.sol`
- `contracts/evm/script/DeployBaseSepolia.s.sol`
- `contracts/evm/deployments/sepolia.json`
- `contracts/evm/deployments/base-sepolia.json`
- `contracts/evm/deployments/ethereum.json`
- `contracts/evm/deployments/base.json`
- `packages/wallet-evm/src/creator-contracts.ts`
- `packages/wallet-evm/src/creator-contracts.test.ts`
- `docs/PHASE_5_ARCHITECTURE.md`
- `docs/CREATOR_REGISTRY.md`
- `docs/CREATOR_TIPPING.md`
- `docs/EVM_CONTRACT_SECURITY.md`
- `docs/EVM_DEPLOYMENT_GUIDE.md`
- `docs/PHASE_5_COMPLETION_REPORT.md`

Modified:

- `packages/wallet-evm/src/index.ts` re-exports the call builders.
- `docs/IMPLEMENTATION_PROGRESS.md`
- `docs/BLOCKCHAIN_INDEXER_GUIDE.md`
- `README.md`
- `.env.example` adds empty `ETHERSCAN_API_KEY` and `BASESCAN_API_KEY` placeholders.
- `.gitignore`, `.prettierignore`, and `eslint.config.js` ignore Foundry build output and cloned libraries.
- `.github/workflows/ci.yml` adds a Foundry job. That job has not run on GitHub yet.

`contracts/evm/lib` is cloned locally and gitignored. It contains forge-std `v1.11.0` (`8e40513d678f392f398620b3ef2b418648b33e89`) and OpenZeppelin Contracts `v5.4.0` (`c64a1edb67b6e3f4a15cca8909c9482ad33a02b0`).

## 3. Architecture

`CreatorRegistry` stores one record per wallet on the chain where it is deployed. `CreatorTipping` reads that registry and forwards ETH to the payout. The same key on Ethereum and Base is not one identity: each network needs its own deployment, and the addresses will differ. Details are in `docs/PHASE_5_ARCHITECTURE.md`.

## 4. Functions and events

`CreatorRegistry`

- `register(string)`
- `registerWithPayout(string,address)`
- `updateMetadata(string)`
- `updatePayout(address)`
- `isRegistered(address)`
- `payoutOf(address)`
- `getCreator(address)` returns payout, URI, and `registeredAt`
- `CreatorRegistered`
- `CreatorMetadataUpdated`
- `CreatorPayoutUpdated`

`CreatorTipping`

- `tip(address)` payable
- `tipCount()`
- `registry()`
- `receive` and `fallback` revert
- `TipSent(sender, creator, payout, amount, tipId)`

## 5. Compiler and dependencies

| Tool | Version |
| --- | --- |
| Foundry | 1.9.0 (`6056c5845d34205a83cf7108042adb137325c9df`) |
| Solidity | 0.8.30 |
| Optimizer | on, 200 runs |
| EVM version | cancun |
| OpenZeppelin Contracts | v5.4.0, `ReentrancyGuard` only |
| forge-std | v1.11.0 |

## 6. Build

```text
forge build
Compiling 31 files with Solc 0.8.30
Compiler run successful!
```

A second build after the lint comments compiled 9 changed files and succeeded with no warnings. `forge fmt --check` exited 0.

## 7. Tests

`forge test -vvv` and a later `forge test --summary` both passed. No test was skipped. No test used a public network or real funds.

```text
CreatorRegistryTest      14 passed, 0 failed, 0 skipped
CreatorTippingTest       11 passed, 0 failed, 0 skipped
RegistryInvariantTest     1 passed, 0 failed, 0 skipped
TippingInvariantTest      1 passed, 0 failed, 0 skipped
Total                    27 passed, 0 failed, 0 skipped
```

Fuzz tests ran 256 times each. Each invariant ran 64 times and 1280 calls, with 0 reverts. The registry invariant checks a non-zero payout and an empty registry balance. The tipping invariant checks that the tipping contract holds no ETH.

`packages/wallet-evm` in the same session:

```text
creator-contracts.test.ts   4 passed
siwe.test.ts                3 passed
transfer.test.ts            3 passed
```

The full `pnpm test` suite was not rerun for this phase. Its last recorded result remains 56 passed and 1 skipped, from Phase 4. The skipped test is still the live PostgreSQL migration test.

## 8. Security measures

Documented in `docs/EVM_CONTRACT_SECURITY.md`. In short: caller-owned records, no admin, duplicate and zero-address checks, URI limits, OpenZeppelin reentrancy guard, checks-effects-interactions, failed transfers revert, direct ETH is rejected, Solidity 0.8 checked math, and no loops over creators.

These tests do not make the contracts audited or production-secure.

## 9. Deployment scripts and configuration

- `script/DeploySepolia.s.sol` reverts unless the chain id is 11155111.
- `script/DeployBaseSepolia.s.sol` reverts unless the chain id is 84532.
- There is no mainnet script.
- RPC endpoints in `foundry.toml` read `EVM_RPC_URL_11155111`, `EVM_RPC_URL_84532`, `EVM_RPC_URL_1`, and `EVM_RPC_URL_8453`.
- Explorer keys are `${ETHERSCAN_API_KEY}` and `${BASESCAN_API_KEY}`. Both are empty in `.env.example`.
- The signer is supplied by the Foundry CLI. No private key is in the repository.
- `deployments/sepolia.json`, `base-sepolia.json`, `ethereum.json`, and `base.json` say `not_deployed`. Addresses and transaction hashes are `null`.

Neither script was executed.

## 10. Limitations

- Not deployed on Sepolia, Base Sepolia, or either mainnet.
- Not independently audited.
- No ERC-20 tipping.
- A payout that reverts cannot receive a tip. The sender keeps the ETH.
- The creator can point the payout at any non-zero address. The contract does not prove that address is a wallet the creator still controls beyond the update transaction itself.
- Metadata is not fetched or sanitized beyond the URI grammar.
- The indexer does not decode `TipSent`. A tip's outer transaction would look like ETH sent to the tipping contract.
- Ethereum and Base registrations are independent.
- Live wallet-extension approval is still blocked in this browser, so the encoded calls were not approved by MetaMask or Coinbase Wallet.

## 11. Integration status

| Piece | Status |
| --- | --- |
| Typed ABI and `register` / `updateMetadata` / `tip` builders | Implemented, unit tested |
| Wallet `sendTransactionAsync` can submit `to`, `data`, and `value` | Already implemented in Phase 4 |
| Web page for register or tip | Not implemented. No deployed address exists, so a page would be a placeholder |
| API persistence of creator records | Not implemented. The chain is the record |
| Indexer support for `TipSent` | Not implemented |
| Testnet deployment | Not deployed |
| Mainnet | Not authorized and not deployed |

## 12. Commands

From `contracts/evm`, after installing Foundry 1.9.0:

```powershell
git clone --depth 1 --branch v1.11.0 https://github.com/foundry-rs/forge-std lib/forge-std
git clone --depth 1 --branch v5.4.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
forge build
forge test -vvv
forge fmt --check
```

From the repository root:

```powershell
pnpm exec vitest run packages/wallet-evm/src/creator-contracts.test.ts
```

Do not run `forge script` with `--broadcast` unless you intend to deploy, and do not deploy to mainnet.

## Acceptance

| Criterion | Result |
| --- | --- |
| Foundry workspace builds | Met |
| Both contracts compile | Met |
| Required unit tests pass | Met |
| Fuzz and invariant tests pass | Met |
| Registration, metadata updates, and ETH tips work locally | Met |
| Recipient receives the exact amount | Met |
| Security cases covered | Met. Not an audit |
| Sepolia and Base Sepolia scripts exist | Met. Not executed |
| ABIs available for integration | Met, in `packages/wallet-evm` |
| Documentation matches the code | Met |
| Existing social app left in place | Met. Social routes were not edited |
| No mainnet or real-fund transaction | Met |

Phase 5 stops here.
