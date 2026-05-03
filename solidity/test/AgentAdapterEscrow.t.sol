// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AgentAdapterEscrow} from "../src/AgentAdapterEscrow.sol";

contract AgentAdapterEscrowTest is Test {
    AgentAdapterEscrow internal escrow;
    address internal payer = address(0xCAFE);
    address payable internal payee = payable(address(0xBEEF));

    event Paid(
        bytes32 indexed nonce,
        address indexed payer,
        address indexed payee,
        uint256 amount
    );

    function setUp() public {
        escrow = new AgentAdapterEscrow();
        vm.deal(payer, 10 ether);
    }

    function test_Pay_ForwardsFundsAndConsumesNonce() public {
        bytes32 nonce = keccak256("alpha");
        uint256 balanceBefore = payee.balance;

        vm.prank(payer);
        vm.expectEmit(true, true, true, true);
        emit Paid(nonce, payer, payee, 1 ether);
        escrow.pay{value: 1 ether}(nonce, payee);

        assertEq(payee.balance, balanceBefore + 1 ether);
        assertTrue(escrow.consumedNonces(nonce));
        assertEq(address(escrow).balance, 0);
    }

    function test_Pay_RevertsOnZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(AgentAdapterEscrow.AmountZero.selector);
        escrow.pay{value: 0}(keccak256("zero"), payee);
    }

    function test_Pay_RevertsOnReusedNonce() public {
        bytes32 nonce = keccak256("beta");
        vm.prank(payer);
        escrow.pay{value: 1 ether}(nonce, payee);

        vm.prank(payer);
        vm.expectRevert(AgentAdapterEscrow.NonceConsumed.selector);
        escrow.pay{value: 1 ether}(nonce, payee);
    }

    function test_Pay_RevertsOnFailedTransfer() public {
        Reverter rev = new Reverter();
        bytes32 nonce = keccak256("gamma");
        vm.prank(payer);
        vm.expectRevert(AgentAdapterEscrow.TransferFailed.selector);
        escrow.pay{value: 1 ether}(nonce, payable(address(rev)));
    }
}

contract Reverter {
    receive() external payable {
        revert("nope");
    }
}
