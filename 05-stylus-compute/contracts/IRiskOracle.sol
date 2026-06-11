// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRiskOracle
/// @notice EVM-side interface to the Stylus (Rust/WASM) risk classifier deployed on Pharos.
///         A Solidity agent or the treasury can gate an action on this view call — the heavy
///         compute runs in WASM, the decision is consumed in EVM context.
interface IRiskOracle {
    /// @return risk score in [0, 1e6] (0.0 .. 1.0), fixed-point scaled by 1e6
    function score(int64[] calldata features) external view returns (int64);

    /// @return true when score <= threshold (allow the action)
    function gate(int64[] calldata features, int64 threshold) external view returns (bool);

    function model_bias() external view returns (int64);
}

/// @notice Example consumer: release funds only if the Stylus risk score passes the gate.
///         This is the "verifiable heavy compute gating a real on-chain action" demo — wire the
///         same check into agent-treasury.executeCall to make a spend conditional on the score.
contract RiskGatedAction {
    IRiskOracle public immutable oracle;
    int64 public constant THRESHOLD = 500_000; // 0.5 risk

    error RiskTooHigh(int64 score);

    constructor(address stylusOracle) {
        oracle = IRiskOracle(stylusOracle);
    }

    /// @dev Reverts if the action's risk exceeds THRESHOLD. Caller proceeds only on success.
    function assertSafe(int64[] calldata features) external view {
        if (!oracle.gate(features, THRESHOLD)) {
            revert RiskTooHigh(oracle.score(features));
        }
    }
}
