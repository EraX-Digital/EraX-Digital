// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CreatorRegistry} from "../src/registry/CreatorRegistry.sol";
import {CreatorTipping} from "../src/creator/CreatorTipping.sol";

/// @notice Deploys the registry and tipping contracts on Ethereum Sepolia.
/// @dev Refuses every other chain id, including mainnet. Do not pass `--broadcast`
/// until a deployment is explicitly approved. The signer comes from the Foundry
/// CLI (`--account` or `--private-key`), not from this file.
contract DeploySepolia is Script {
    uint256 internal constant SEPOLIA_CHAIN_ID = 11155111;

    function run() external returns (CreatorRegistry registry, CreatorTipping tipping) {
        if (block.chainid != SEPOLIA_CHAIN_ID) revert("refusing deployment: chain is not Ethereum Sepolia");
        vm.startBroadcast();
        registry = new CreatorRegistry();
        tipping = new CreatorTipping(address(registry));
        vm.stopBroadcast();
        console2.log("CreatorRegistry", address(registry));
        console2.log("CreatorTipping", address(tipping));
    }
}
