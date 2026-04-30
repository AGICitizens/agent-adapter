// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Agent Adapter Escrow
/// @notice Records and forwards x402-style payments. Each payment is keyed by
/// a server-issued nonce and can be redeemed only once. Funds are forwarded
/// to the payee in the same transaction; the contract does not hold any
/// balance between calls.
contract AgentAdapterEscrow {
    /// @notice Emitted when a payment is recorded and forwarded.
    /// @param nonce Server-issued unique identifier for the payment.
    /// @param payer Address that funded the call.
    /// @param payee Address that received the forwarded funds.
    /// @param amount Native amount forwarded (wei).
    event Paid(
        bytes32 indexed nonce,
        address indexed payer,
        address indexed payee,
        uint256 amount
    );

    error AmountZero();
    error NonceConsumed();
    error TransferFailed();

    /// @notice Marks each nonce as consumed once `pay` succeeds.
    mapping(bytes32 => bool) public consumedNonces;

    /// @notice Pay `payee` with native funds, recording the call against `nonce`.
    /// @dev State change before external call — reentrancy-safe even without a
    /// guard, because a re-entrant call with the same nonce reverts on
    /// `NonceConsumed`. Funds are forwarded with `call{value:}` to support
    /// both EOA and contract recipients.
    /// @param nonce Server-issued unique identifier for this payment.
    /// @param payee Recipient of the forwarded funds.
    function pay(bytes32 nonce, address payee) external payable {
        if (msg.value == 0) revert AmountZero();
        if (consumedNonces[nonce]) revert NonceConsumed();
        consumedNonces[nonce] = true;

        (bool ok,) = payee.call{value: msg.value}("");
        if (!ok) revert TransferFailed();

        emit Paid(nonce, msg.sender, payee, msg.value);
    }
}
