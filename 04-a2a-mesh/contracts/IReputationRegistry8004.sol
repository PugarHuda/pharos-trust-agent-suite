// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IReputationRegistry8004
/// @notice The ERC-8004 (Trustless Agents) Reputation Registry interface, included so a2a-mesh can
///         expose a standard-compatible read surface for its payment-gated reputation. See
///         references/erc-8004.md for the mapping. Our `Reputation` enforces a STRONGER rule than the
///         standard's "submitter != agent owner": a rating must come from the address that actually
///         paid (EIP-712 payer signature, keyed by (payer, ref)).
/// @dev    Reference: https://eips.ethereum.org/EIPS/eip-8004
interface IReputationRegistry8004 {
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    /// @notice Submit feedback for an agent. Submitter must not be the agent owner/operator.
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    /// @notice Aggregate feedback for an agent (optionally filtered by clients/tags).
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);

    function getClients(uint256 agentId) external view returns (address[] memory);

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64);
}
