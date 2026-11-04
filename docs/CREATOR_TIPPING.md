# Creator tipping

`contracts/evm/src/creator/CreatorTipping.sol`

Status: implemented and covered by local Foundry tests. Not deployed. Not audited.

## Purpose

A user sends native ETH to a creator who has registered on the same chain. The contract forwards the full `msg.value` to the creator's current payout address and emits `TipSent`. It does not keep the funds.

## Why direct ETH

The sender already holds ETH on the network they are using. A direct transfer needs no token allowance, no custody, and no platform balance. The wallet shows the value before the user approves it.

Limits of this choice:

- The payout must accept ETH. A contract that reverts in `receive` or `fallback` cannot be tipped. The tip reverts and the sender keeps the ETH.
- The payout is called with the remaining gas, not the 2300-gas stipend, so a contract payout can run logic. `ReentrancyGuard` blocks a nested `tip` during that call.
- There is no memo field beyond the event.
- ERC-20 is not accepted. A token allowlist has not been designed.
- The current indexer does not treat `TipSent` as a creator payment. It would see the outer transaction as ETH sent to this contract.

## Function

`tip(address creator) payable`

1. Reject zero value, the zero address, and an unregistered creator.
2. Read `payoutOf`. Reject a zero payout.
3. Increment `tipCount` and emit `TipSent(sender, creator, payout, amount, tipId)`.
4. `payout.call{value: amount}("")`. If that returns false, revert `TransferFailed`.

The event and the counter are written before the call. A revert rolls both back, so a failed tip does not consume an id.

`receive` and `fallback` revert with `UnexpectedEth`. There is no withdrawal function, so ETH must not be sent any other way.

## Rules that are absent on purpose

- No fee and no treasury.
- No administrator.
- No stored user balance.
- No automatic or scheduled transfer.
- No upgrade path.

The constructor stores the registry as an immutable address. It rejects the zero address and an account with no code. Tipping on one chain reads only the registry given to that deployment. A creator registered on a different registry is unregistered here.

## Event

`TipSent(address indexed sender, address indexed creator, address indexed payout, uint256 amount, uint256 tipId)`

`amount` is the wei the payout receives. It equals `msg.value`.

## Integration

`buildCreatorTip` encodes `tip(address)` and sets `value` to the wei amount. The existing send page can submit a transaction that has `to`, `data`, and `value`, and the wallet must approve it. The web app does not call this builder yet, because no tipping contract is deployed. Pass the address for the selected chain. Do not reuse the Ethereum address on Base.
