// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IIdentityRegistry8004 (minimal)
/// @notice The slice of the ERC-8004 Identity Registry that the Validation Registry needs to resolve an
///         agentId to its controlling address. Implemented by the suite's `IdentityRegistry8004`
///         (deployed in a2a-mesh). Kept as a local interface so this skill stays self-contained.
interface IIdentityRegistry8004 {
    function ownerOf(uint256 agentId) external view returns (address);
    function getAgentWallet(uint256 agentId) external view returns (address);
}
