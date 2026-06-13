// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IReputationScore } from "./IReputationScore.sol";
import { IValidationRead } from "./IValidationRead.sol";

/// @title ReputationGate
/// @notice Makes reputation **economic, not just informational** — the capstone that ties the suite
///         together. This is the Pharos-native version of ERC-8183's `ReputationGateHook` (the
///         Agentic Commerce Protocol from Virtuals + the Ethereum Foundation, live on Base): a payment
///         or action is only allowed if the counterparty's on-chain trust clears a threshold. A
///         jailbroken or naive agent literally cannot pay an untrusted peer, because the bar is enforced
///         in the contract — not advised in a prompt.
/// @dev    Reads the suite's live Reputation Registry (`scoreOf`) and, optionally, the ERC-8004
///         Validation Registry (`getValidation`) so the gate can require BOTH a paid track record AND an
///         independently validated piece of work. No owner, no admin, no stored balances; `gatedPay`
///         is a single atomic forward (no custody, nothing to reenter).
contract ReputationGate {
    IReputationScore public immutable reputation;
    IValidationRead  public immutable validation; // may be address(0) if validation gating is unused

    event GatedPayment(address indexed provider, uint256 amount, uint256 reputation, uint256 minReputation);

    error BelowReputationThreshold(uint256 have, uint256 need);
    error WorkNotValidated(bytes32 dataHash);
    error BelowValidationThreshold(uint8 have, uint8 need);
    error NoValidationRegistry();
    error TransferFailed();

    constructor(address reputationRegistry, address validationRegistry) {
        reputation = IReputationScore(reputationRegistry);
        validation = IValidationRead(validationRegistry);
    }

    // ----- read-only checks (compose these inside other contracts or agent pre-flight) -----

    /// @notice Does `provider` clear the reputation bar?
    function meetsReputation(address provider, uint256 minReputation) public view returns (bool) {
        return reputation.scoreOf(provider) >= minReputation;
    }

    /// @notice Revert unless `provider` clears the reputation bar (for use as a composable guard).
    function requireReputation(address provider, uint256 minReputation) public view {
        uint256 s = reputation.scoreOf(provider);
        if (s < minReputation) revert BelowReputationThreshold(s, minReputation);
    }

    /// @notice Composite trust: `provider` must clear `minReputation` AND the work `dataHash` must have a
    ///         validation response of at least `minValidation` (0–100). This is the strongest gate — a
    ///         paid track record plus an independent ERC-8004 validation of the specific deliverable.
    function requireTrusted(address provider, uint256 minReputation, bytes32 dataHash, uint8 minValidation)
        public
        view
    {
        requireReputation(provider, minReputation);
        if (address(validation) == address(0)) revert NoValidationRegistry();
        (, , uint8 response, , bool responded) = validation.getValidation(dataHash);
        if (!responded) revert WorkNotValidated(dataHash);
        if (response < minValidation) revert BelowValidationThreshold(response, minValidation);
    }

    /// @notice Like `requireTrusted` but non-reverting — returns the verdict and the underlying signals.
    function isTrusted(address provider, uint256 minReputation, bytes32 dataHash, uint8 minValidation)
        external
        view
        returns (bool trusted, uint256 rep, uint8 validationScore, bool validated)
    {
        rep = reputation.scoreOf(provider);
        if (address(validation) != address(0)) {
            (, , validationScore, , validated) = validation.getValidation(dataHash);
        }
        trusted = rep >= minReputation && validated && validationScore >= minValidation;
    }

    // ----- the ReputationGateHook itself: gate real value on trust -----

    /// @notice Forward `msg.value` to `provider` only if it clears the reputation bar. The economic
    ///         expression of reputation: an untrusted agent cannot be paid through this gate.
    function gatedPay(address payable provider, uint256 minReputation) external payable {
        uint256 s = reputation.scoreOf(provider);
        if (s < minReputation) revert BelowReputationThreshold(s, minReputation);
        (bool ok, ) = provider.call{ value: msg.value }("");
        if (!ok) revert TransferFailed();
        emit GatedPayment(provider, msg.value, s, minReputation);
    }
}
