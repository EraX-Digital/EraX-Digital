// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../../src/registry/CreatorRegistry.sol";

contract RegistryHandler is Test {
    CreatorRegistry internal registry;
    address[] internal registered;

    constructor(CreatorRegistry registry_) {
        registry = registry_;
    }

    function register(uint256 salt) external {
        address actor = address(uint160(uint256(keccak256(abi.encode(salt, registered.length)))));
        if (actor == address(0) || registry.isRegistered(actor)) return;
        vm.prank(actor);
        registry.register(string.concat("ipfs://", vm.toString(salt)));
        registered.push(actor);
    }

    function registeredCount() external view returns (uint256) {
        return registered.length;
    }

    function registeredAt(uint256 index) external view returns (address) {
        return registered[index];
    }
}

contract RegistryInvariantTest is Test {
    CreatorRegistry internal registry;
    RegistryHandler internal handler;

    function setUp() public {
        registry = new CreatorRegistry();
        handler = new RegistryHandler(registry);
        targetContract(address(handler));
    }

    function invariant_RegisteredPayoutIsNotZero() public view {
        uint256 count = handler.registeredCount();
        for (uint256 i = 0; i < count; ++i) {
            address actor = handler.registeredAt(i);
            assertTrue(registry.isRegistered(actor));
            assertTrue(registry.payoutOf(actor) != address(0));
        }
    }

    function invariant_RegistryHoldsNoEth() public view {
        assertEq(address(registry).balance, 0);
    }
}
