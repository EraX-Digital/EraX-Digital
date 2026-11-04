// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../src/registry/CreatorRegistry.sol";
import {MetadataUri} from "../src/libraries/MetadataUri.sol";

contract CreatorRegistryTest is Test {
    CreatorRegistry internal registry;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal payout = makeAddr("payout");

    function setUp() public {
        registry = new CreatorRegistry();
    }

    function test_RegisterSetsCallerAsPayout() public {
        vm.expectEmit(true, true, false, true);
        emit CreatorRegistry.CreatorRegistered(alice, alice, "ipfs://alice");
        vm.prank(alice);
        registry.register("ipfs://alice");

        assertTrue(registry.isRegistered(alice));
        (address storedPayout, string memory uri, uint64 registeredAt) = registry.getCreator(alice);
        assertEq(storedPayout, alice);
        assertEq(uri, "ipfs://alice");
        assertEq(registeredAt, uint64(block.timestamp));
        assertEq(registry.payoutOf(alice), alice);
    }

    function test_RegisterWithDistinctPayout() public {
        vm.prank(alice);
        registry.registerWithPayout("https://metadata.example/alice", payout);
        assertEq(registry.payoutOf(alice), payout);
    }

    function test_DuplicateRegistrationReverts() public {
        vm.startPrank(alice);
        registry.register("ipfs://alice");
        vm.expectRevert(CreatorRegistry.AlreadyRegistered.selector);
        registry.register("ipfs://alice-again");
        vm.stopPrank();
    }

    function test_UpdateMetadata() public {
        vm.startPrank(alice);
        registry.register("ipfs://alice");
        vm.expectEmit(true, false, false, true);
        emit CreatorRegistry.CreatorMetadataUpdated(alice, "https://metadata.example/alice.json");
        registry.updateMetadata("https://metadata.example/alice.json");
        vm.stopPrank();
        (, string memory uri,) = registry.getCreator(alice);
        assertEq(uri, "https://metadata.example/alice.json");
    }

    function test_UnregisteredUpdateReverts() public {
        vm.prank(bob);
        vm.expectRevert(CreatorRegistry.NotRegistered.selector);
        registry.updateMetadata("ipfs://bob");
        assertFalse(registry.isRegistered(alice));
    }

    function test_OtherCreatorCannotChangeAlice() public {
        vm.prank(alice);
        registry.register("ipfs://alice");
        vm.startPrank(bob);
        registry.register("ipfs://bob");
        registry.updateMetadata("ipfs://bob-new");
        vm.stopPrank();
        (, string memory aliceUri,) = registry.getCreator(alice);
        (, string memory bobUri,) = registry.getCreator(bob);
        assertEq(aliceUri, "ipfs://alice");
        assertEq(bobUri, "ipfs://bob-new");
    }

    function test_ZeroPayoutReverts() public {
        vm.prank(alice);
        vm.expectRevert(CreatorRegistry.ZeroAddress.selector);
        registry.registerWithPayout("ipfs://alice", address(0));
    }

    function test_UpdatePayoutRejectsZeroAddress() public {
        vm.startPrank(alice);
        registry.register("ipfs://alice");
        vm.expectRevert(CreatorRegistry.ZeroAddress.selector);
        registry.updatePayout(address(0));
        vm.stopPrank();
        assertEq(registry.payoutOf(alice), alice);
    }

    function test_EmptyAndInvalidMetadataRevert() public {
        vm.startPrank(alice);
        vm.expectRevert(MetadataUri.EmptyMetadata.selector);
        registry.register("");
        vm.expectRevert(MetadataUri.InvalidMetadata.selector);
        registry.register("http://example.com/a");
        vm.expectRevert(MetadataUri.InvalidMetadata.selector);
        registry.register("ipfs://has space");
        vm.stopPrank();
        assertFalse(registry.isRegistered(alice));
    }

    function test_MetadataTooLongReverts() public {
        string memory huge = _ipfsUri(MetadataUri.MAX_LENGTH);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MetadataUri.MetadataTooLong.selector, bytes(huge).length));
        registry.register(huge);
    }

    function test_UnknownCreatorReverts() public {
        assertFalse(registry.isRegistered(address(0)));
        vm.expectRevert(CreatorRegistry.NotRegistered.selector);
        registry.getCreator(address(0));
    }

    function test_DirectEthIsRejected() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(registry).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(registry).balance, 0);
    }

    function testFuzz_RegisterOrRevert(string calldata uri) public {
        if (registry.isRegistered(alice)) return;
        vm.prank(alice);
        try registry.register(uri) {
            (address storedPayout, string memory stored,) = registry.getCreator(alice);
            assertEq(storedPayout, alice);
            assertEq(stored, uri);
        } catch {
            assertFalse(registry.isRegistered(alice));
        }
    }

    function testFuzz_IndependentCreators(address first, address second, bytes32 label) public {
        vm.assume(first != address(0) && second != address(0) && first != second);
        string memory firstUri = string.concat("ipfs://", vm.toString(label));
        string memory secondUri = string.concat("https://metadata.example/", vm.toString(uint256(label)));
        vm.prank(first);
        registry.register(firstUri);
        vm.prank(second);
        registry.register(secondUri);
        assertTrue(registry.isRegistered(first));
        assertTrue(registry.isRegistered(second));
        assertEq(registry.payoutOf(first), first);
        assertEq(registry.payoutOf(second), second);
    }

    function _ipfsUri(uint256 targetLength) private pure returns (string memory) {
        bytes memory prefix = bytes("ipfs://");
        bytes memory value = new bytes(targetLength + 1);
        for (uint256 i = 0; i < prefix.length; ++i) {
            value[i] = prefix[i];
        }
        for (uint256 i = prefix.length; i < value.length; ++i) {
            value[i] = "a";
        }
        return string(value);
    }
}
