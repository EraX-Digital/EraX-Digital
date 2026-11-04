# Solana creator tipping

The `creator_tipping` program sends native SOL to a registered creator. The creator receives the exact lamport amount in the instruction. The sender's network fee is charged by the runtime and is not taken out of that amount.

Program id: `5Z4UJ9gbtfZc4Ha7c4ibHYsd2V77anFpv7KHnqjf5ANV`

This id is the public key of the local program keypair. The program is not deployed.

## Instruction

`tip(amount)` accounts, in order:

| Account | Constraint |
| --- | --- |
| sender | Signer, mutable. The source of the lamports. |
| payout | Mutable. Must equal `creator.payout`. |
| creator | `Account<CreatorAccount>` with seeds `["creator", creator.authority]` and `seeds::program = creator_registry::ID` |
| system_program | The real system program |

The instruction rejects `amount == 0`. It loads the creator account through Anchor, so an unregistered creator, a fake account, or an account owned by another program fails account deserialization or the PDA constraint. The address constraint rejects a payout that is not the one stored on the creator account.

The transfer is `anchor_lang::system_program::transfer` for `amount` lamports. There is no other CPI. The program has no admin, no fee account, and no vault.

`TipSent { sender, creator, payout, amount, timestamp }` is emitted after the transfer returns. If the transfer fails, the whole transaction reverts and the event is not committed.

`creator` in the event is the registered authority, not the PDA address. `payout` is the wallet that received the lamports.

## What the sender approves

`buildCreatorTipInstruction` places the sender, the stored payout, the creator PDA, and the system program on one instruction. `/wallet/creator` reads the creator account first. If the account is missing or its owner is not the registry program, the page stops before asking the wallet to sign. The wallet still has to approve the transaction. The page does not sign by itself.

## What this program does not do

- It does not accept an arbitrary recipient.
- It does not keep a balance for later withdrawal.
- It does not charge a platform fee or take a hidden deduction.
- It does not mint or transfer a token.
- It does not tip an Ethereum or Base creator. Those records live in the Phase 5 contracts and are a different identity.
