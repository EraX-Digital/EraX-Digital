# Creator registry

`contracts/evm/src/registry/CreatorRegistry.sol`

Status: implemented and covered by local Foundry tests. Not deployed. Not audited.

## Purpose

A creator registers the wallet they connect to EraX. The contract stores a metadata URI and a payout address. It does not store a name, an email, a post, or a social graph. Profile content stays at the URI.

## Functions

| Function | Who can call it | Effect |
| --- | --- | --- |
| `register(string metadataUri)` | Any unregistered wallet | Creates the record. Payout is the caller. |
| `registerWithPayout(string metadataUri, address payout)` | Any unregistered wallet | Creates the record with an explicit payout. |
| `updateMetadata(string metadataUri)` | The registered wallet only | Replaces that wallet's URI. |
| `updatePayout(address payout)` | The registered wallet only | Replaces that wallet's payout. |
| `isRegistered(address)` | Anyone | False for unknown addresses, including the zero address. |
| `payoutOf(address)` | Anyone | The payout, or the zero address when unregistered. |
| `getCreator(address)` | Anyone | Payout, URI, and `registeredAt`. Reverts with `NotRegistered` when absent. |

There is no function that takes a creator address and writes their record. Another wallet cannot update Alice's URI, because the storage key is `msg.sender`. There is no owner.

## Events

- `CreatorRegistered(address indexed creator, address indexed payout, string metadataUri)`
- `CreatorMetadataUpdated(address indexed creator, string metadataUri)`
- `CreatorPayoutUpdated(address indexed creator, address indexed previousPayout, address indexed payout)`

## Validation

- A second `register` from the same wallet reverts with `AlreadyRegistered`.
- A zero payout reverts with `ZeroAddress`.
- The URI must start with `https://` or `ipfs://`, be at most 2048 bytes, and contain no whitespace or ASCII control characters. Empty, `http://`, and `javascript:` values revert.
- ETH sent straight to the registry is rejected. The contract has no receive function and no withdrawal.

## Identity across networks

Registration on Ethereum Sepolia does not register the same address on Base Sepolia. Deploy a separate registry on each chain. Read `docs/PHASE_5_ARCHITECTURE.md` for the cross-chain model.

## Integration

`buildCreatorRegistration` and `buildCreatorMetadataUpdate` in `packages/wallet-evm` return an unsigned transaction: `to` is the registry for that chain, `value` is zero, and `data` is the encoded call. The caller must pass the deployed address. The zero address is rejected. No address is hardcoded.
