// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CreatorRegistry} from "../src/registry/CreatorRegistry.sol";
import {CreatorTipping} from "../src/creator/CreatorTipping.sol";

/// @notice Deploys the registry and tipping contracts on Base Sepolia.
/// @dev Refuses every other chain id. A Base deployment is a different pair of
/// addresses from Ethereum Sepolia. Do not broadcast without explicit approval.
contract DeployBaseSepolia is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    function run() external returns (CreatorRegistry registry, CreatorTipping tipping) {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID) revert("refusing deployment: chain is not Base Sepolia");
        vm.startBroadcast();
        registry = new CreatorRegistry();
        tipping = new CreatorTipping(address(registry));
        vm.stopBroadcast();
        console2.log("CreatorRegistry", address(registry));
        console2.log("CreatorTipping", address(tipping));
    }
}
