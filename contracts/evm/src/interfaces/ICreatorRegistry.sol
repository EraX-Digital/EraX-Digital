// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Read interface used by tipping and by off-chain indexers.
/// @dev A registration exists only on the chain where this contract is deployed.
interface ICreatorRegistry {
    /// @notice Returns true when `account` has registered on this chain.
    function isRegistered(address account) external view returns (bool);

    /// @notice Returns the payout address for `account`, or the zero address when unregistered.
    function payoutOf(address account) external view returns (address);
}
