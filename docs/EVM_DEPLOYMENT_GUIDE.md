# EVM deployment guide

Nothing in this repository has been deployed. The files in `contracts/evm/deployments/` record that fact. Their `address` and `transactionHash` fields are `null`. Do not invent values for them.

## Networks

| Network | Chain id | RPC variable | Script |
| --- | ---: | --- | --- |
| Ethereum Sepolia | 11155111 | `EVM_RPC_URL_11155111` | `script/DeploySepolia.s.sol` |
| Base Sepolia | 84532 | `EVM_RPC_URL_84532` | `script/DeployBaseSepolia.s.sol` |
| Ethereum mainnet | 1 | `EVM_RPC_URL_1` | none |
| Base mainnet | 8453 | `EVM_RPC_URL_8453` | none |

The scripts revert unless `block.chainid` is the testnet they name. There is no mainnet script. Do not add one, and do not pass `--broadcast`, until there is an explicit approval.

## Compiler

Recorded in each deployment file:

- Solidity `0.8.30`
- Optimizer enabled, 200 runs
- EVM version `cancun`
- OpenZeppelin Contracts `v5.4.0`
- forge-std `v1.11.0`
- Foundry `v1.9.0` for the local toolchain

## Signer

Use a Foundry keystore. Do not put a private key in `foundry.toml`, a script, or a committed env file.

```powershell
cast wallet import erax-deployer --interactive
```

`--account erax-deployer` selects that key at broadcast time. A shell variable is the fallback, and it must stay out of the repository:

```powershell
$env:DEPLOYER_PRIVATE_KEY = "<set in the shell only>"
```

## What a future approved broadcast looks like

Set the RPC URL in the shell. Foundry reads it from `contracts/evm/foundry.toml`.

```powershell
$env:EVM_RPC_URL_11155111 = "https://<sepolia-rpc>"
forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url sepolia --account erax-deployer
```

That command simulates. Add `--broadcast` only after approval. Repeat with `EVM_RPC_URL_84532`, `--rpc-url base_sepolia`, and `script/DeployBaseSepolia.s.sol:DeployBaseSepolia`. The two broadcasts produce two different address pairs. Save the addresses and transaction hashes from the broadcast output into the matching file under `deployments/`. Leave `status` as `not_deployed` until those hashes are real.

## Verification

After a real broadcast, and only then:

```powershell
$env:ETHERSCAN_API_KEY = "<set in the shell only>"
forge verify-contract <registry-address> src/registry/CreatorRegistry.sol:CreatorRegistry --chain 11155111 --watch

$env:BASESCAN_API_KEY = "<set in the shell only>"
forge verify-contract <tipping-address> src/creator/CreatorTipping.sol:CreatorTipping --chain 84532 --constructor-args <abi-encoded-registry> --watch
```

`CreatorTipping` takes the registry address as its only constructor argument. Verify the registry first. Do not verify a guessed address.

## Local tests are not a deployment

`forge test` runs against the in-process EVM. It does not spend testnet ETH and it does not write `deployments/`.
