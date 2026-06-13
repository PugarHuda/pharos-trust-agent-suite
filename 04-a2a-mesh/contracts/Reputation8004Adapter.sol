// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReputationRegistry8004} from "./IReputationRegistry8004.sol";

interface IMeshReputation {
    function scoreOf(address provider) external view returns (uint256);
    function ratingCount(address provider) external view returns (uint256);
    function ratingSum(address provider) external view returns (uint256);
    function pairCount(address payer, address provider) external view returns (uint256);
}

/// @title Reputation8004Adapter
/// @notice Exposes a2a-mesh's payment-gated reputation through the ERC-8004 Reputation Registry read
///         interface, so ERC-8004 consumers (and other ecosystems' agents) can read our scores without
///         changes to the core contract. The provider address IS the agent: agentId = uint160(provider).
/// @dev    Our reputation is STRONGER than ERC-8004 requires — feedback is accepted only from the
///         address that actually PAID (EIP-712 payer signature, keyed by (payer,ref)), not merely
///         "submitter != owner". So `giveFeedback` here reverts and directs callers to the paid path.
///         See references/erc-8004.md.
contract Reputation8004Adapter is IReputationRegistry8004 {
    IMeshReputation public immutable reputation;

    error FeedbackIsPaymentGated();
    error ClientsNotEnumerable();

    constructor(address reputation_) {
        reputation = IMeshReputation(reputation_);
    }

    /// @notice agentId <-> provider address mapping (the agent is the service provider).
    function agentToProvider(uint256 agentId) public pure returns (address) {
        return address(uint160(agentId));
    }
    function providerToAgent(address provider) public pure returns (uint256) {
        return uint256(uint160(provider));
    }

    /// @inheritdoc IReputationRegistry8004
    /// @dev value/valueDecimals map our 0-100 score with 0 decimals ("starred" quality metric).
    function getSummary(uint256 agentId, address[] calldata, string calldata, string calldata)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        address provider = agentToProvider(agentId);
        count = uint64(reputation.ratingCount(provider));
        summaryValue = int128(int256(reputation.scoreOf(provider))); // 0..100
        summaryValueDecimals = 0;
    }

    /// @inheritdoc IReputationRegistry8004
    /// @dev Returns how many counted ratings this client (payer) gave this agent (provider).
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return uint64(reputation.pairCount(clientAddress, agentToProvider(agentId)));
    }

    /// @inheritdoc IReputationRegistry8004
    function getClients(uint256) external pure returns (address[] memory) {
        // The core stores aggregates, not a client list — enumerate off-chain from PaymentRecorded/Rated
        // events (or via an indexer). Reverting is explicit about that rather than returning empty.
        revert ClientsNotEnumerable();
    }

    /// @inheritdoc IReputationRegistry8004
    function giveFeedback(uint256, int128, uint8, string calldata, string calldata, string calldata, string calldata, bytes32)
        external
        pure
    {
        // Feedback is payment-gated: settle a payment via x402, record it (recordPaymentSigned), then
        // rate() as the payer. This is stricter than ERC-8004's submitter!=owner rule.
        revert FeedbackIsPaymentGated();
    }
}
