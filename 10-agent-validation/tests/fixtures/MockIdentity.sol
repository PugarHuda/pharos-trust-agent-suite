// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test fixture: a minimal IdentityRegistry that satisfies the slice the ValidationRegistry
///         needs (ownerOf + getAgentWallet + register). Mirrors the suite's IdentityRegistry8004.
contract MockIdentity {
    uint256 public nextAgentId = 1;
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => address) private _wallet;

    function register(address owner) external returns (uint256 id) {
        id = nextAgentId++;
        ownerOf[id] = owner;
    }

    function setAgentWallet(uint256 id, address w) external { _wallet[id] = w; }

    function getAgentWallet(uint256 id) external view returns (address) {
        address w = _wallet[id];
        return w == address(0) ? ownerOf[id] : w;
    }
}
