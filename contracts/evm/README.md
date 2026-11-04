# EraX EVM contracts

Foundry workspace for the EraX creator registry and native ETH tipping contracts. These contracts are not deployed. They have no owner, no proxy, and no token.

## Layout

- `src/registry/CreatorRegistry.sol` — one creator record per wallet, on this chain only.
- `src/creator/CreatorTipping.sol` — forwards ETH to that creator's payout address.
- `src/interfaces` — the registry view used by tipping.
- `src/libraries/MetadataUri.sol` — https and ipfs URI checks.
- `test` — unit, fuzz, and invariant tests. They use Foundry's local EVM. No network and no real funds.
- `script` — Sepolia and Base Sepolia deployment scripts. They revert on every other chain id.
- `deployments` — records of what was deployed. Every address is `null`.

## Install

Foundry v1.9.0 and Solidity 0.8.30. Dependencies are not committed.

```powershell
git clone --depth 1 --branch v1.11.0 https://github.com/foundry-rs/forge-std lib/forge-std
git clone --depth 1 --branch v5.4.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
```

Run those commands from `contracts/evm`.

## Checks

```powershell
forge build
forge test -vvv
forge fmt --check
```

`forge test` does not broadcast. The deployment scripts are compiled by `forge build` and are not executed by the test command.

## Deployment

Do not broadcast without explicit approval. There is no mainnet script. RPC URLs come from `EVM_RPC_URL_11155111` and `EVM_RPC_URL_84532`. The signer comes from a Foundry keystore or a shell variable, never from this repository. See `docs/EVM_DEPLOYMENT_GUIDE.md`.

## Integration

`packages/wallet-evm/src/creator-contracts.ts` encodes `register`, `updateMetadata`, and `tip` for the existing wallet sender. The web app does not call these yet, because there is no deployed address to call. A transaction still requires the connected wallet's approval. The same bytecode on Ethereum and Base will not share storage, and the addresses will differ.
