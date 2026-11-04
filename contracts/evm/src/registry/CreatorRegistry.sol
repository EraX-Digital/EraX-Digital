// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ICreatorRegistry} from "../interfaces/ICreatorRegistry.sol";
import {MetadataUri} from "../libraries/MetadataUri.sol";

/// @title CreatorRegistry
/// @notice On-chain creator identity for one EVM network.
/// @dev The registering wallet is the only account that can change its own record.
/// There is no owner and no administrator. The same address on another chain is a
/// separate identity because this contract's storage is not bridged.
contract CreatorRegistry is ICreatorRegistry {
    struct Registration {
        address payout;
        string metadataUri;
        uint64 registeredAt;
        bool exists;
    }

    mapping(address account => Registration registration) private _creators;

    error ZeroAddress();
    error AlreadyRegistered();
    error NotRegistered();

    event CreatorRegistered(address indexed creator, address indexed payout, string metadataUri);
    event CreatorMetadataUpdated(address indexed creator, string metadataUri);
    event CreatorPayoutUpdated(address indexed creator, address indexed previousPayout, address indexed payout);

    /// @notice Registers the caller and uses the caller as the payout address.
    /// @param metadataUri https or ipfs URI for off-chain profile data. Personal data is not stored here.
    function register(string calldata metadataUri) external {
        _register(metadataUri, msg.sender);
    }

    /// @notice Registers the caller and sets a distinct payout address.
    /// @param payout Address that receives ETH tips. It cannot be the zero address.
    function registerWithPayout(string calldata metadataUri, address payout) external {
        _register(metadataUri, payout);
    }

    /// @notice Replaces the caller's metadata URI.
    function updateMetadata(string calldata metadataUri) external {
        Registration storage registration = _creators[msg.sender];
        if (!registration.exists) revert NotRegistered();
        MetadataUri.validate(metadataUri);
        registration.metadataUri = metadataUri;
        emit CreatorMetadataUpdated(msg.sender, metadataUri);
    }

    /// @notice Replaces the caller's payout address.
    function updatePayout(address payout) external {
        if (payout == address(0)) revert ZeroAddress();
        Registration storage registration = _creators[msg.sender];
        if (!registration.exists) revert NotRegistered();
        address previous = registration.payout;
        registration.payout = payout;
        emit CreatorPayoutUpdated(msg.sender, previous, payout);
    }

    /// @inheritdoc ICreatorRegistry
    function isRegistered(address account) external view returns (bool) {
        return _creators[account].exists;
    }

    /// @inheritdoc ICreatorRegistry
    function payoutOf(address account) external view returns (address) {
        return _creators[account].payout;
    }

    /// @notice Returns the caller's chain-local registration.
    /// @dev Reverts when `account` is not registered, including the zero address.
    function getCreator(address account)
        external
        view
        returns (address payout, string memory metadataUri, uint64 registeredAt)
    {
        Registration storage registration = _creators[account];
        if (!registration.exists) revert NotRegistered();
        return (registration.payout, registration.metadataUri, registration.registeredAt);
    }

    function _register(string calldata metadataUri, address payout) private {
        if (payout == address(0)) revert ZeroAddress();
        if (_creators[msg.sender].exists) revert AlreadyRegistered();
        MetadataUri.validate(metadataUri);
        _creators[msg.sender] = Registration({
            payout: payout,
            metadataUri: metadataUri,
            // casting to 'uint64' is safe because a unix timestamp fits until year 2554
            // forge-lint: disable-next-line(unsafe-typecast)
            registeredAt: uint64(block.timestamp),
            exists: true
        });
        emit CreatorRegistered(msg.sender, payout, metadataUri);
    }
}
