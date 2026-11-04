# EVM contract security

These notes describe the controls in the Phase 5 contracts. Passing tests are not an audit. No third party has reviewed this code. Do not deploy it to mainnet on the strength of this file.

## Controls in the code

| Risk | Control |
| --- | --- |
| Someone else edits a creator | Storage is keyed by `msg.sender`. There is no admin writer. |
| Duplicate registration | `AlreadyRegistered` after the first successful register. |
| Zero address | Payout, creator, and registry constructor reject `address(0)`. |
| Invalid metadata | `MetadataUri` requires `https://` or `ipfs://`, a 2048-byte cap, and no whitespace or control bytes. |
| Reentrancy | `tip` is `nonReentrant` (OpenZeppelin `ReentrancyGuard`). The counter and event are written before the payout call. |
| Failed payout | A false return from `call` reverts `TransferFailed`. The transaction rolls back, including the event. |
| ETH forced into the contracts | The registry has no receive function. Tipping reverts in `receive` and `fallback`. Neither contract has a withdrawal. |
| Overflow | Solidity 0.8.30 checks arithmetic. `tipCount` increments by one per successful tip. |
| Denial of service | Neither contract loops over creators. A reverting payout blocks only tips to that payout. Other creators are unaffected. A metadata URI cannot grow past 2048 bytes. |
| Cross-contract confusion | Tipping stores one immutable registry and checks `code.length` in the constructor. A creator registered on another registry is rejected. |
| Custody and fees | `tip` forwards `msg.value` unchanged. There is no balance mapping and no fee. |
| Upgrade or admin key | No proxy, no owner, no pause, no upgrade function. |

## Tests that exercise those cases

`contracts/evm/test/CreatorRegistry.t.sol` covers registration, duplicates, metadata updates, an unregistered update, a second creator who cannot change the first, zero payouts, invalid URIs, direct ETH, and fuzzed URIs and creator pairs.

`contracts/evm/test/CreatorTipping.t.sol` covers the exact amount received, an updated payout, zero value, an unregistered creator, a rejecting payout, a payout that tries to reenter `tip`, two senders, direct ETH, a zero or empty registry, a second registry, and fuzzed amounts.

`test/invariant/RegistryInvariant.t.sol` checks that every creator the handler registered still has a non-zero payout, and that the registry holds no ETH.

`test/invariant/TippingInvariant.t.sol` checks that the tipping contract holds no ETH after tips and raw transfers.

## Residual risks

- A payout contract can still run code with the forwarded gas. The guard stops a nested `tip`. It does not stop that contract from calling something else.
- `payout.call` can succeed while the recipient is a contract that does not credit the creator the user expected. The registry lets the creator set any non-zero payout. EraX does not verify that the payout belongs to the creator beyond the creator's own signature on the update.
- Metadata is not fetched. A URI can point at hostile content. Clients must treat it as untrusted.
- `CreatorPayoutUpdated` has three indexed fields, so the new payout is indexed and the URI-style data is not in that event. Clients that need the new payout read it from the indexed argument.
- No formal verification and no external audit.
- Deployment itself is a trust point: the address EraX configures must be the bytecode these tests compiled. The deployment records do not contain an address yet.
