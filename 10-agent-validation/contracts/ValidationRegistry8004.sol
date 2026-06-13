// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IIdentityRegistry8004 } from "./IIdentityRegistry8004.sol";
import { IValidationRegistry8004 } from "./IValidationRegistry8004.sol";

/// @title ValidationRegistry8004
/// @notice The ERC-8004 (Trustless Agents) **Validation Registry** for Pharos — the third leg of the
///         trio alongside the suite's Identity Registry and (payment-gated) Reputation Registry. An
///         agent's work, referenced by a `dataHash`, is independently verified by a designated
///         validator agent which posts a 0–100 score on-chain. `stylus-compute` is the natural
///         validator: its bit-identical, verifiable risk/quality score becomes the `validationResponse`.
/// @dev    Resolves agent → wallet via an external IdentityRegistry, so only the registered validator
///         can respond and only the server agent can request validation of its own work (anti-griefing
///         on the `dataHash` space, consistent with the rest of the suite). No owner, no admin.
contract ValidationRegistry8004 is IValidationRegistry8004 {
    IIdentityRegistry8004 public immutable identity;

    struct Validation {
        uint256 validatorAgentId;
        uint256 serverAgentId;
        uint8   response;     // 0..100, meaningful once `responded`
        bool    requested;
        bool    responded;
    }

    mapping(bytes32 => Validation) private _validations; // dataHash => validation

    error AlreadyRequested();
    error UnknownValidator();
    error UnknownServer();
    error NotServerAgent();
    error SelfValidation();
    error UnknownValidation();
    error AlreadyResponded();
    error NotValidator();
    error BadResponse();

    constructor(address identityRegistry) {
        identity = IIdentityRegistry8004(identityRegistry);
    }

    /// @inheritdoc IValidationRegistry8004
    function validationRequest(uint256 validatorAgentId, uint256 serverAgentId, bytes32 dataHash) external {
        if (_validations[dataHash].requested) revert AlreadyRequested();
        if (identity.ownerOf(validatorAgentId) == address(0)) revert UnknownValidator();
        address serverOwner = identity.ownerOf(serverAgentId);
        if (serverOwner == address(0)) revert UnknownServer();
        if (validatorAgentId == serverAgentId) revert SelfValidation();
        // Only the server agent (owner or its operating wallet) may request validation of its own work,
        // so no third party can squat a dataHash to misdirect or block the real validation.
        if (msg.sender != serverOwner && msg.sender != identity.getAgentWallet(serverAgentId)) revert NotServerAgent();

        _validations[dataHash] = Validation({
            validatorAgentId: validatorAgentId,
            serverAgentId: serverAgentId,
            response: 0,
            requested: true,
            responded: false
        });
        emit ValidationRequest(validatorAgentId, serverAgentId, dataHash);
    }

    /// @inheritdoc IValidationRegistry8004
    function validationResponse(bytes32 dataHash, uint8 response) external {
        Validation storage v = _validations[dataHash];
        if (!v.requested) revert UnknownValidation();
        if (v.responded) revert AlreadyResponded();
        if (response > 100) revert BadResponse();
        address validatorOwner = identity.ownerOf(v.validatorAgentId);
        if (msg.sender != validatorOwner && msg.sender != identity.getAgentWallet(v.validatorAgentId)) revert NotValidator();

        v.response = response;
        v.responded = true;
        emit ValidationResponse(v.validatorAgentId, v.serverAgentId, dataHash, response);
    }

    /// @inheritdoc IValidationRegistry8004
    function getValidation(bytes32 dataHash)
        external
        view
        returns (uint256 validatorAgentId, uint256 serverAgentId, uint8 response, bool requested, bool responded)
    {
        Validation storage v = _validations[dataHash];
        return (v.validatorAgentId, v.serverAgentId, v.response, v.requested, v.responded);
    }
}
