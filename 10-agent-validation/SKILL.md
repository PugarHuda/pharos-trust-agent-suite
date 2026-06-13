---
name: agent-validation
description: >-
  ERC-8004 Validation Registry on Pharos — independent verification of agent work. A validator agent
  posts a 0–100 score for another agent's output, referenced by a dataHash (reuse an escrow jobId or an
  x402 settlement hash to validate that exact work). Completes the ERC-8004 trio for the suite:
  Identity + Reputation + Validation, with payments deferred to x402. Use when an agent's result needs
  to be checked by a neutral verifier before it is trusted, paid, or composed on.
  Triggers on "validate agent work pharos", "verify agent output", "erc-8004 validation", "agent quality
  score onchain", "independent verification agent pharos".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
  contract: "0xd3F1DEf0c294405Cbd02b8b84D1De861A8C058DC"
  identityRegistry: "0xa048D4F17282488B60D96E6FB01FbdA106F38B8A"
---

# Agent Validation (ERC-8004 Validation Registry)

ERC-8004 (Trustless Agents) defines three on-chain registries — **Identity**, **Reputation**, and
**Validation** — and defers payments to x402. This suite already ships the first two
(`IdentityRegistry8004` + the payment-gated `Reputation`/`Reputation8004Adapter` in `a2a-mesh`) and the
payment rail (`x402-facilitator`). **`agent-validation` adds the third leg**, so the suite is a complete
Pharos-native ERC-8004 + x402 implementation.

A **validator** agent independently verifies a **server** agent's work — referenced by a `dataHash` —
and posts a 0–100 score on-chain. Reputation answers *"did people pay and rate this agent well?"*;
validation answers *"is this specific piece of work correct?"* — a different, complementary trust signal.

## When to use this skill

- An agent's output must be **independently checked** before it is trusted or paid for.
- A buyer wants a **neutral verifier** to score a provider's deliverable (the `dataHash` can be the
  `agent-escrow` jobId, so the same work that was hired is the work that gets validated).
- `stylus-compute` is the natural validator: its bit-identical, **verifiable** risk/quality score is
  exactly what `validationResponse` should carry.

## How it works

```
server agent  ── validationRequest(validatorAgentId, serverAgentId, dataHash) ──►  Validation Registry
validator     ── validationResponse(dataHash, 0..100) ─────────────────────────►  score recorded on-chain
anyone        ── getValidation(dataHash) ──────────────────────────────────────►  (validator, server, score, status)
```

- Agents are resolved through the live **ERC-8004 Identity Registry** (`agentId → wallet`), so only the
  registered validator can respond.
- **Anti-griefing:** only the server agent (owner or its operating wallet) can request validation of its
  own work, so no third party can squat a `dataHash`. One request and one response per `dataHash`.
- No owner, no admin, no upgradability. Custom-error reverts for typed agent branching.

## Commands

```bash
validate deploy   --identity 0x..                                   # deploys against an Identity Registry
validate register --uri https://card.json [--as validator]          # mint an agentId in the Identity Registry
validate request  --validation 0x.. --validator <id> --server <id> --data <hash|label>
validate respond  --validation 0x.. --data <hash> --response 95     # designated validator only
validate get      --validation 0x.. --data <hash>                   # read-only
```

Keys come from a gitignored `.env` (auto-loaded): `$SERVER_PRIVATE_KEY` (requester),
`$VALIDATOR_PRIVATE_KEY` (responder). Global: `--network atlantic-testnet`.

## How it composes

- **`agent-escrow` → `agent-validation`:** validate the escrowed `jobId` before the client releases.
- **`stylus-compute` → `agent-validation`:** the verifiable on-chain risk/quality score *is* the
  `validationResponse`.
- **`agent-validation` + `a2a-mesh`:** validation (work correctness) and reputation (paid track record)
  together give a consumer two orthogonal, on-chain trust signals — the full ERC-8004 picture.

## Live on Atlantic (chainId 688689)

`ValidationRegistry8004` (v2, with a per-server pending-request cap) → [`0xd3F1DEf0c294405Cbd02b8b84D1De861A8C058DC`](https://atlantic.pharosscan.xyz/address/0xd3F1DEf0c294405Cbd02b8b84D1De861A8C058DC),
wired to the live Identity Registry `0xa048D4F17282488B60D96E6FB01FbdA106F38B8A`. A real validation is
on-chain: validator agent #3 scored server agent #2's work **95/100**, where the `dataHash` is the live
`agent-escrow` jobId — i.e. the hired work was independently validated. Tx hashes in `DEPLOYMENTS.md`.

13 tests on an in-memory EVM (full flow + every guard + agentWallet resolution + independence).
