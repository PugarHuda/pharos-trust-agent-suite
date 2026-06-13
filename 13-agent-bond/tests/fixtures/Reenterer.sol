// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentBond {
    function bondUp() external payable;
    function requestUnbond(uint256 amount) external;
    function claimUnbond() external;
}

/// @notice Test fixture: tries to re-enter claimUnbond() on receive. The nonReentrant guard +
///         effects-before-interaction must defeat it.
contract Reenterer {
    IAgentBond public ab;
    bool private attacking;
    constructor(address a) { ab = IAgentBond(a); }
    function load() external payable { ab.bondUp{ value: msg.value }(); }
    function startExit(uint256 amt) external { ab.requestUnbond(amt); }
    function pull() external { attacking = true; ab.claimUnbond(); attacking = false; }
    receive() external payable { if (attacking) ab.claimUnbond(); }
}
