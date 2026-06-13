// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IReputationScore
/// @notice The slice of the suite's payment-gated Reputation Registry the gate needs: an agent's
///         0–100 score. Implemented by a2a-mesh `Reputation` (live at 0x8010e567…).
interface IReputationScore {
    function scoreOf(address agent) external view returns (uint256);
}
