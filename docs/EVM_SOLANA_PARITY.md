# EVM and Solana parity

The product behavior is the same on both sides: a creator registers a metadata URI with their own wallet, and a user sends a native-coin tip to that creator with no platform fee. The mechanics differ because the chains differ. The Phase 5 Solidity contracts were not modified.

| Behavior | Ethereum and Base | Solana |
| --- | --- | --- |
| Registration | `CreatorRegistry.register` | `creator_registry::register` |
| Metadata URI | `https://` or `ipfs://`, max 2048, no whitespace | Same rules |
| Owner | The EVM caller | The Solana authority signer |
| Separate payout | `registerWithPayout` and `updatePayout` | Optional payout argument and `update_payout` |
| Tip | `CreatorTipping.tip` with `msg.value` | `creator_tipping::tip` with a system transfer |
| Fee | None | None. The sender still pays the Solana network fee. |
| Custody | None. ETH is forwarded in the same call. | None. Lamports move in the same instruction. |
| Token | None | None |
| Registration event | `CreatorRegistered` | `CreatorRegistered` |
| Metadata event | `CreatorMetadataUpdated` | `CreatorMetadataUpdated` |
| Payout event | `CreatorPayoutUpdated` | `CreatorPayoutUpdated` |
| Tip event | `TipSent` before the call | `TipSent` after a successful transfer |
| Failed tip | Reverts. The sender keeps the ETH. | Reverts. The sender keeps the SOL, apart from a fee only if the runtime charges one for a failed transaction. |

## Differences that are intentional

- An EVM creator is an address in contract storage. A Solana creator is a PDA. The same person can have both. They are not automatically the same creator.
- Ethereum and Base deployments are separate even when the EVM address matches. Solana devnet and mainnet-beta are also separate. No program is deployed on any of them yet.
- The creator pays Solana rent to open the account. There is no equivalent storage deposit on the EVM contracts. Rent is not a tip fee.
- The EVM tip indexes poorly today: the indexer does not decode `TipSent`, and the outer transaction looks like ETH sent to the tipping contract. The Solana indexer can decode `Program data:` logs into `chain_program_events` after a program is deployed and a wallet is watched. It still does not backfill older slots.
- The Solana tip form reads the creator PDA and passes the stored payout. The program rejects any other recipient. The EVM `tip(address)` uses `payoutOf` inside the contract, so the caller does not pass the payout.
- Account closure is absent on both sides.

## Required EVM changes

None. No incompatibility required a Solidity edit.
