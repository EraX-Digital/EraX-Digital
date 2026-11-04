# Solana deployment guide

Do not deploy from this phase. Devnet needs a separate approval. Mainnet-beta is prohibited. No production funds are used.

## Current status

| Network | Status | Signature |
| --- | --- | --- |
| Local program test | Tests run in-process. No validator process is deployed. | none |
| Devnet | `contracts/solana/deployments/devnet.json` is `not_deployed` | null |
| Mainnet-beta | `contracts/solana/deployments/mainnet-beta.json` is `not_deployed` | null |

The program ids in those files are the public keys of the local keypairs. They are the ids that would be deployed later. They are not proof that a program is on a cluster.

| Program | Public key |
| --- | --- |
| creator_registry | `CW9G6KwD29Zu6MdEFXfJ4c31zWvispLY5hNovprn2Qv1` |
| creator_tipping | `5Z4UJ9gbtfZc4Ha7c4ibHYsd2V77anFpv7KHnqjf5ANV` |

## Toolchain on this machine

Rust stable is installed. The Anchor crate is `anchor-lang` 0.31.3. The `solana` and `anchor` CLIs are not installed. Because of that, this phase uses:

```powershell
cargo test --manifest-path contracts/solana/Cargo.toml
```

That command does not contact a cluster and does not airdrop. `contracts/solana/scripts/deploy-devnet.ps1` exits 1 unless `ERAX_APPROVE_SOLANA_DEPLOY` is `devnet`, and even then it refuses to broadcast. `deploy-mainnet.ps1` always exits 1.

## Keypairs

Generate program keypairs only on the machine that will deploy, and keep them out of git. This workspace already has local keypairs in `contracts/solana/keypairs/`. That directory is gitignored. A fresh clone does not have them, so it cannot sign a deployment of these program ids.

Do not commit the JSON keypair files. Do not paste them into chat, docs, or `NEXT_PUBLIC_` variables. The public keys above are safe to publish. The secret key bytes are not.

## Before any approved devnet deploy

1. Install a Solana CLI and Anchor CLI that match `anchor-lang` 0.31.3.
2. Build the SBF artifacts. `cargo test` is not that build.
3. Measure rent. The payer needs a rent-exempt balance for each program account, plus a transaction fee. Run `solana rent` against the built `.so` length. Use a devnet faucet airdrop. Do not use a mainnet wallet.
4. Point the CLI at `https://api.devnet.solana.com` or another devnet RPC. Do not point it at mainnet-beta.
5. Deploy only the two programs, with the keypairs that match the ids above.
6. Write the real transaction signatures into `contracts/solana/deployments/devnet.json`. Leave a signature null if the deploy did not happen.
7. Set `NEXT_PUBLIC_SOLANA_CREATOR_REGISTRY_PROGRAM_ID` and `NEXT_PUBLIC_SOLANA_CREATOR_TIPPING_PROGRAM_ID` to those public ids. Do not put a keypair in either variable.
8. Confirm with `solana program show <PROGRAM_ID> --url devnet` that the owner is a loader and the program is executable. That confirmation has not been run, because nothing was deployed.

## Verification after a real deploy

Compare the on-chain program hash with a rebuild from this source. `anchor verify` is the intended command once the Anchor CLI is installed and the program has an upgrade authority. Until that command has been run against a real deployment, do not claim the bytes on the cluster match this repository.

## Mainnet-beta

There is no approved mainnet path. `deploy-mainnet.ps1` does not broadcast. Do not fund a mainnet deployer for this phase.
