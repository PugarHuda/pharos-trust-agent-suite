---
name: reputation-gate
description: >-
  Makes reputation economic, not just informational. An on-chain gate (the ERC-8183 / Agentic Commerce
  Protocol "ReputationGateHook" pattern, live on Base from Virtuals + the Ethereum Foundation) that only
  lets a payment or action through if the counterparty's ERC-8004 reputation — and optionally an
  independent validation of the specific work — clears a threshold. The capstone that ties the suite's
  reputation, validation, escrow, and treasury together. Use when an agent must NOT pay or hire a peer
  whose on-chain trust is too low.
  Triggers on "only pay trusted agents pharos", "reputation gated payment", "erc-8183 reputation gate",
  "block payment low reputation agent", "require validation before paying agent".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
  contract: "0x425d3F086D8e98B7462cc987ED9B1aF9F396608d"
  reputation: "0x8010e567b6f68dcfD19312644F1c3E6249b43ef7"
  validationRegistry: "0xd3F1DEf0c294405Cbd02b8b84D1De861A8C058DC"
---

# Reputation Gate

The rest of the suite *produces* trust signals — payment-gated reputation (`a2a-mesh`) and ERC-8004
validation scores (`agent-validation`). **This skill spends them.** It is the Pharos-native version of
ERC-8183's `ReputationGateHook` (the Agentic Commerce Protocol from Virtuals + the Ethereum Foundation,
live on Base): a payment is only allowed if the counterparty's on-chain trust clears a bar. That turns
reputation from a *number you can read* into a *permission that moves money* — and, like the rest of the
suite, it's enforced in the contract, so a jailbroken or naive agent **cannot** pay an untrusted peer.

## Why it matters (the bleeding edge)

The most concrete production use of ERC-8004 today is exactly this pattern: ERC-8183's hook "won't fund
the escrow unless reputation meets the threshold, making reputation economic — not just informational."
`reputation-gate` brings that to Pharos and goes one step further with **composite trust**: it can
require BOTH a paid track record (reputation) AND an independent ERC-8004 validation of the specific
deliverable before a single token moves.

## Capabilities

| Function | What it does |
|----------|--------------|
| `meetsReputation(provider, min)` | view — does the provider clear the reputation bar? |
| `requireReputation(provider, min)` | reverting guard for composition inside other contracts |
| `requireTrusted(provider, minRep, dataHash, minVal)` | composite: reputation **and** a validated work score |
| `isTrusted(...)` | non-reverting verdict + the underlying signals |
| `gatedPay(provider, min)` `payable` | forwards native PHRS **only** to a provider that clears the bar |

## Commands

```bash
gate deploy --reputation 0x.. [--validation 0x..]
gate check  --gate 0x.. --provider 0x.. --min-reputation 10 \
            [--data <hash> --min-validation 90]          # composite (reputation + validation)
gate pay    --gate 0x.. --provider 0x.. --min-reputation 10 --amount 0.001
```

Defaults to the suite's live Reputation (`0x8010e567…`) + Validation v2 (`0xd3F1DEf0…`) registries. Reads
need no key; `pay` forwards PHRS via `$PAYER_PRIVATE_KEY`. Global: `--network atlantic-testnet`.

## How it composes (the capstone)

```
a2a-mesh ──reputation──┐
                       ├──► reputation-gate ──gate──► agent-escrow funding / treasury spend / x402 pay
agent-validation ──score┘        (pay only the trusted; block the rest, on-chain)
```

- A **buyer agent** runs `gate check` before hiring through `agent-escrow`, or routes funding through
  `gatedPay` so an untrusted provider is refused at the contract level.
- The composite mode uses the **same `dataHash` an escrow job and a validation share**, so "pay only if
  this exact deliverable was both reputation-backed and independently validated" is one call.
- Pairs with `agent-treasury`: the policy answers "is this spend within budget?"; the gate answers "is
  the counterparty trustworthy enough?" — two orthogonal, on-chain authorizations.

## Live on Atlantic (chainId 688689)

`ReputationGate` (v2) → [`0x425d3F086D8e98B7462cc987ED9B1aF9F396608d`](https://atlantic.pharosscan.xyz/address/0x425d3F086D8e98B7462cc987ED9B1aF9F396608d),
wired to the live Reputation + Validation v2 registries. Proven on-chain: a **gated payment** succeeded to a
provider with reputation 10/100 (bar 10), the same gate **blocks** a 0-reputation address, and the
**composite** check returns TRUSTED for a provider whose escrowed work was validated 95/100 — using the
live `agent-escrow` jobId as the `dataHash`. Tx hashes in `DEPLOYMENTS.md`.

10 tests on an in-memory EVM (reputation checks, composite trust, the gatedPay hook incl. a failed-transfer case).
