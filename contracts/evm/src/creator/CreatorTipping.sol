// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICreatorRegistry} from "../interfaces/ICreatorRegistry.sol";

/// @title CreatorTipping
/// @notice Forwards native ETH from the caller to a registered creator's payout address.
/// @dev This contract does not keep balances, charge a fee, or expose a withdrawal.
/// The caller approves the value in their wallet. A failed payout reverts the whole
/// transaction, so ETH is not left in this contract.
contract CreatorTipping is ReentrancyGuard {
    ICreatorRegistry public immutable registry;

    uint256 public tipCount;

    error ZeroAddress();
    error InvalidRegistry();
    error ZeroValue();
    error UnregisteredCreator();
    error TransferFailed();
    error UnexpectedEth();

    /// @param sender Wallet that approved the tip.
    /// @param creator Registered identity that was tipped.
    /// @param payout Address that received the ETH. This may differ from `creator`.
    /// @param amount Wei forwarded. No fee is deducted.
    /// @param tipId Monotonic id assigned before the transfer.
    event TipSent(
        address indexed sender, address indexed creator, address indexed payout, uint256 amount, uint256 tipId
    );

    /// @param registry_ Creator registry deployed on this same chain.
    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        if (registry_.code.length == 0) revert InvalidRegistry();
        registry = ICreatorRegistry(registry_);
    }

    /// @notice Rejects ETH sent without calling `tip`. There is no way to recover it otherwise.
    receive() external payable {
        revert UnexpectedEth();
    }

    /// @notice Rejects unknown calldata and any attached ETH.
    fallback() external payable {
        revert UnexpectedEth();
    }

    /// @notice Sends `msg.value` to the creator's current payout address.
    /// @dev Checks the registry, records the tip, then transfers. The payout call
    /// uses the full gas stipend and is guarded against reentrancy. Direct ETH is
    /// used so no token allowance or custodial balance is required. A payout that
    /// reverts causes this call to revert; the sender keeps the ETH.
    function tip(address creator) external payable nonReentrant {
        if (msg.value == 0) revert ZeroValue();
        if (creator == address(0)) revert ZeroAddress();
        if (!registry.isRegistered(creator)) revert UnregisteredCreator();
        address payout = registry.payoutOf(creator);
        if (payout == address(0)) revert ZeroAddress();

        uint256 tipId = ++tipCount;
        uint256 amount = msg.value;
        emit TipSent(msg.sender, creator, payout, amount, tipId);

        // The creator chose this payout, and the sender approved the value.
        // nonReentrant sets the guard before this body, so a nested tip reverts.
        // forge-lint: disable-next-line(arbitrary-send-eth, reentrancy-eth)
        (bool ok,) = payout.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
