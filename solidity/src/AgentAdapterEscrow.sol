// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentAdapterEscrow {
    event Paid(
        bytes32 indexed nonce,
        address indexed payer,
        address indexed payee,
        uint256 amount
    );

    error AmountZero();
    error NonceConsumed();
    error TransferFailed();

    mapping(bytes32 => bool) public consumedNonces;

    function pay(bytes32 nonce, address payee) external payable {
        if (msg.value == 0) revert AmountZero();
        if (consumedNonces[nonce]) revert NonceConsumed();
        consumedNonces[nonce] = true;

        (bool ok,) = payee.call{value: msg.value}("");
        if (!ok) revert TransferFailed();

        emit Paid(nonce, msg.sender, payee, msg.value);
    }
}
