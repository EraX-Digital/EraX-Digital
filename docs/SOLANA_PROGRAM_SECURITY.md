# Solana program security

This note describes the checks in the Phase 6 programs. It is not an independent audit. The programs have not been deployed.

## Registry

- The creator account is a PDA of `["creator", authority]`. The authority cannot choose a different address.
- `init` fails when the PDA already exists, so one wallet cannot register twice.
- Updates require the authority signature, the same seeds, the stored bump, and `has_one = authority`.
- Another wallet cannot replace the creator account in an update instruction. The seeds would not match that wallet.
- Metadata is length-limited and restricted to `https://` and `ipfs://` without whitespace or control bytes.
- The zero pubkey cannot be a payout.
- The account is allocated at the maximum URI size. Updates do not reallocate.
- There is no close instruction, so rent cannot be pulled out by closing the account under a different owner.
- The account stores a URI and two public keys. It does not store email, posts, or keys.

## Tipping

- The only lamport movement is a system-program transfer of the instruction amount from the signer to `creator.payout`.
- The payout account is constrained with `address = creator.payout`. Passing a different wallet fails before the transfer.
- The creator account must be the registry PDA for the authority stored inside it. A substitute account owned by the registry program still fails the seed check.
- `seeds::program = creator_registry::ID` stops the tipping program from accepting a PDA of some other program.
- A missing or malformed creator account fails Anchor deserialization. That covers an unregistered creator.
- Zero amounts are rejected. The amount is a `u64` passed into the system transfer, which uses checked lamport math.
- The event is emitted only after the transfer CPI returns. A failed transfer reverts the transaction.
- There is no fee wallet, no admin signer, and no instruction that moves lamports anywhere else.

## Application

- Instruction builders live in the browser. The wallet signs. The server does not hold a creator key.
- Program keypairs under `contracts/solana/keypairs` are gitignored. They are deploy keys, not user keys. Do not print them or commit them.
- `NEXT_PUBLIC_SOLANA_CREATOR_*_PROGRAM_ID` may hold public program ids only. A private key in a `NEXT_PUBLIC_` variable would be shipped to the browser.
- The indexer stores event payloads from finalized logs. It skips signatures whose status is an error, so a failed tip is not stored as `TipSent`.
- Duplicate `(network, signature, event_index)` rows are ignored.

## Limits of this review

- `cargo test` runs the entrypoints as native code. It does not prove an SBF build or a validator deployment.
- No devnet or mainnet transaction was sent.
- Passing these tests is not a third-party audit.
- The indexer only sees the latest 20 finalized signatures of verified linked wallets. It can miss a tip whose sender and payout are not linked EraX wallets, and it does not backfill older slots.
