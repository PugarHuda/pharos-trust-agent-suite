// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IValidationRead
/// @notice The read slice of the ERC-8004 Validation Registry the gate needs. Implemented by
///         agent-validation `ValidationRegistry8004` (live at 0xc9142C34…).
interface IValidationRead {
    function getValidation(bytes32 dataHash)
        external
        view
        returns (uint256 validatorAgentId, uint256 serverAgentId, uint8 response, bool requested, bool responded);
}
