// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIntentMandate {
    function fund() external payable;
    function withdraw(uint256 amount) external;
}

/// @notice Test fixture: a user that tries to re-enter withdraw() on receive. The nonReentrant guard
///         + effects-before-interaction must defeat it (the whole withdraw reverts; no double pay).
contract Reenterer {
    IIntentMandate public im;
    bool private attacking;
    constructor(address a) { im = IIntentMandate(a); }
    function load() external payable { im.fund{ value: msg.value }(); }
    function pull(uint256 amt) external { attacking = true; im.withdraw(amt); attacking = false; }
    receive() external payable { if (attacking) im.withdraw(1); }
}
