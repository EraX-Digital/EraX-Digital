// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../../src/registry/CreatorRegistry.sol";
import {CreatorTipping} from "../../src/creator/CreatorTipping.sol";

contract TippingHandler is Test {
    CreatorTipping internal tipping;
    address internal creator;

    constructor(CreatorTipping tipping_, address creator_) {
        tipping = tipping_;
        creator = creator_;
    }

    function tip(uint96 amount) external {
        amount = uint96(bound(amount, 1, 10 ether));
        vm.deal(address(this), amount);
        tipping.tip{value: amount}(creator);
    }

    function sendRawEth() external {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(tipping).call{value: 1 ether}("");
        ok;
    }

    receive() external payable {}
}

contract TippingInvariantTest is Test {
    CreatorTipping internal tipping;
    TippingHandler internal handler;

    function setUp() public {
        CreatorRegistry registry = new CreatorRegistry();
        tipping = new CreatorTipping(address(registry));
        address creator = makeAddr("creator");
        vm.prank(creator);
        registry.register("ipfs://creator");
        handler = new TippingHandler(tipping, creator);
        targetContract(address(handler));
    }

    function invariant_TippingHoldsNoEth() public view {
        assertEq(address(tipping).balance, 0);
    }
}
