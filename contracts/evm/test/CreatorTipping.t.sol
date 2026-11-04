// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../src/registry/CreatorRegistry.sol";
import {CreatorTipping} from "../src/creator/CreatorTipping.sol";

contract RejectingPayout {
    receive() external payable {
        revert("no eth");
    }
}

contract ReenteringPayout {
    CreatorTipping internal tipping;
    address internal creator;
    bool public reentered;

    constructor(CreatorTipping tipping_, address creator_) {
        tipping = tipping_;
        creator = creator_;
    }

    receive() external payable {
        try tipping.tip{value: msg.value}(creator) {
            reentered = true;
        } catch {
            reentered = false;
        }
    }
}

contract CreatorTippingTest is Test {
    CreatorRegistry internal registry;
    CreatorTipping internal tipping;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        registry = new CreatorRegistry();
        tipping = new CreatorTipping(address(registry));
        vm.prank(alice);
        registry.register("ipfs://alice");
    }

    function test_TipForwardsExactAmount() public {
        vm.deal(bob, 1 ether);
        vm.expectEmit(true, true, true, true);
        emit CreatorTipping.TipSent(bob, alice, alice, 0.4 ether, 1);
        vm.prank(bob);
        tipping.tip{value: 0.4 ether}(alice);
        assertEq(alice.balance, 0.4 ether);
        assertEq(address(tipping).balance, 0);
        assertEq(tipping.tipCount(), 1);
    }

    function test_TipUsesUpdatedPayout() public {
        address payout = makeAddr("payout");
        vm.prank(alice);
        registry.updatePayout(payout);
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        tipping.tip{value: 0.2 ether}(alice);
        assertEq(payout.balance, 0.2 ether);
        assertEq(alice.balance, 0);
    }

    function test_ZeroValueReverts() public {
        vm.prank(bob);
        vm.expectRevert(CreatorTipping.ZeroValue.selector);
        tipping.tip{value: 0}(alice);
    }

    function test_UnregisteredCreatorReverts() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(CreatorTipping.UnregisteredCreator.selector);
        tipping.tip{value: 1 ether}(carol);
        assertEq(bob.balance, 1 ether);
        assertEq(address(tipping).balance, 0);
    }

    function test_FailedTransferReturnsFundsToSender() public {
        RejectingPayout rejecting = new RejectingPayout();
        vm.prank(alice);
        registry.updatePayout(address(rejecting));
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(CreatorTipping.TransferFailed.selector);
        tipping.tip{value: 1 ether}(alice);
        assertEq(bob.balance, 1 ether);
        assertEq(address(tipping).balance, 0);
        assertEq(tipping.tipCount(), 0);
    }

    function test_ReentrancyDoesNotDoublePay() public {
        ReenteringPayout payout = new ReenteringPayout(tipping, alice);
        vm.prank(alice);
        registry.updatePayout(address(payout));
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        tipping.tip{value: 1 ether}(alice);
        assertFalse(payout.reentered());
        assertEq(address(payout).balance, 1 ether);
        assertEq(address(tipping).balance, 0);
        assertEq(tipping.tipCount(), 1);
    }

    function test_MultipleUsersTipTheSameCreator() public {
        vm.deal(bob, 1 ether);
        vm.deal(carol, 1 ether);
        vm.prank(bob);
        tipping.tip{value: 0.3 ether}(alice);
        vm.prank(carol);
        tipping.tip{value: 0.5 ether}(alice);
        assertEq(alice.balance, 0.8 ether);
        assertEq(tipping.tipCount(), 2);
    }

    function test_DirectEthAndUnknownCallAreRejected() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        (bool plain,) = address(tipping).call{value: 1 ether}("");
        assertFalse(plain);
        vm.prank(bob);
        (bool unknown,) = address(tipping).call{value: 1 ether}(hex"12345678");
        assertFalse(unknown);
        assertEq(address(tipping).balance, 0);
        assertEq(bob.balance, 1 ether);
    }

    function test_ZeroRegistryAndEmptyCodeRevert() public {
        vm.expectRevert(CreatorTipping.ZeroAddress.selector);
        new CreatorTipping(address(0));
        vm.expectRevert(CreatorTipping.InvalidRegistry.selector);
        new CreatorTipping(bob);
    }

    function test_TippingUsesOnlyItsOwnRegistry() public {
        CreatorRegistry other = new CreatorRegistry();
        CreatorTipping otherTipping = new CreatorTipping(address(other));
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(CreatorTipping.UnregisteredCreator.selector);
        otherTipping.tip{value: 1 ether}(alice);
    }

    function testFuzz_TipAmount(uint96 amount) public {
        vm.assume(amount > 0);
        vm.deal(bob, amount);
        uint256 before = alice.balance;
        vm.prank(bob);
        tipping.tip{value: amount}(alice);
        assertEq(alice.balance - before, amount);
        assertEq(address(tipping).balance, 0);
    }
}
