// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IValidationRegistry8004
/// @notice The ERC-8004 (Trustless Agents) Validation Registry interface: a validator agent posts an
///         independent 0–100 verification score for another agent's work, referenced by a dataHash.
///         Payments are out of scope in ERC-8004 (deferred to x402). See references/erc-8004.md.
/// @dev    Reference: https://eips.ethereum.org/EIPS/eip-8004
interface IValidationRegistry8004 {
    event ValidationRequest(uint256 indexed validatorAgentId, uint256 indexed serverAgentId, bytes32 indexed dataHash);
    event ValidationResponse(uint256 indexed validatorAgentId, uint256 indexed serverAgentId, bytes32 indexed dataHash, uint8 response);

    /// @notice Request that `validatorAgentId` validate `serverAgentId`'s work identified by `dataHash`.
    function validationRequest(uint256 validatorAgentId, uint256 serverAgentId, bytes32 dataHash) external;

    /// @notice The designated validator posts its verdict (0–100) for `dataHash`.
    function validationResponse(bytes32 dataHash, uint8 response) external;

    /// @notice Read a validation by `dataHash`.
    function getValidation(bytes32 dataHash)
        external
        view
        returns (uint256 validatorAgentId, uint256 serverAgentId, uint8 response, bool requested, bool responded);
}
