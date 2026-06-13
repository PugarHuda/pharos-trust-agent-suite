// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEscrow {
    function withdraw() external;
    function release(bytes32 jobId) external;
}

/// @notice Test fixture: a malicious provider that tries to re-enter withdraw() on receive.
///         The escrow's nonReentrant guard + effects-before-interaction must defeat it.
contract Reenterer {
    IEscrow public escrow;
    bool private attacking;

    constructor(address e) { escrow = IEscrow(e); }

    function pull() external {
        attacking = true;
        escrow.withdraw();
        attacking = false;
    }

    receive() external payable {
        if (attacking) {
            // Re-enter; the guard should make this inner call revert, and because the outer
            // call bubbles that, the whole withdraw reverts (so no double payment).
            escrow.withdraw();
        }
    }
}
