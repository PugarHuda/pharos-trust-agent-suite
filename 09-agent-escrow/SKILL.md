---
name: agent-escrow
description: >-
  Agent-to-agent escrow on Pharos — the "hire" primitive for the agent economy. A client agent locks
  native funds for a job; settlement happens by code: release on the client's approval, refund on
  timeout, or an arbiter's split on dispute. All exits are pull-payments (no custodian, no admin), and
  the jobId doubles as the a2a-mesh reputation `ref`, so a completed escrow mints payment-gated
  reputation. Use when one agent hires another and neither side can be trusted to go first.
  Triggers on "hire agent pharos", "escrow payment agent", "lock funds for a job", "release escrow",
  "agent dispute resolution", "milestone payment agent pharos".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
  contract: "0x5919e995b29Bf81B322171769C9e63c5964258A7"
---

# Agent Escrow

Two agents that have never met cannot safely use a raw transfer: pay first and the provider can vanish;
deliver first and the client can ghost. **AgentEscrow is the missing handshake.** A client locks native
PHRS for a job and settlement is decided by code through exactly three exits:

| Exit | Who triggers it | Effect |
|------|-----------------|--------|
| **Release** | client approves | provider is credited the full amount |
| **Refund** | client, after the deadline, *only if undelivered* | client reclaims the funds |
| **Arbiter split** | a neutral arbiter, after either party disputes | amount split between provider and client |

All exits are **pull-payments**: settled balances accrue to `withdrawable[party]` and each party calls
`withdraw()`. There is exactly one external call site in the contract, reentrancy-guarded.

## When to use this skill

- An agent wants to **hire** another agent for a unit of work and pay on completion.
- A buyer needs **protection** against a provider taking the money and disappearing.
- A provider needs **protection** against a buyer receiving the work and refusing to pay.
- A dispute needs a **neutral resolver** (a human, a multisig/DAO, or another agent/oracle skill).

## Lifecycle

```
createJob (client locks PHRS)
      │
      ├── markDelivered (provider)  ── optional, but blocks timeout-refund (anti-rug)
      │
      ├── release (client) ─────────────► provider withdrawable
      ├── refundTimeout (client, past deadline & undelivered) ─► client withdrawable
      └── dispute (either) ─► resolve (arbiter, split) ─► provider & client withdrawable
                                                              │
                                                        withdraw() (pull)
```

## Commands

```bash
escrow deploy                                                         # → AgentEscrow address
escrow create   --escrow 0x.. --job <ref|label> --provider 0x.. --amount 0.01 \
                [--arbiter 0x..] [--deadline 7d|@unix] [--terms <hash|text>]
escrow deliver  --escrow 0x.. --job <ref> [--deliverable <hash|text>]   # provider
escrow release  --escrow 0x.. --job <ref>                               # client → provider paid
escrow refund   --escrow 0x.. --job <ref>                               # client, after deadline
escrow dispute  --escrow 0x.. --job <ref> [--as provider]               # either party
escrow resolve  --escrow 0x.. --job <ref> --to-provider 0.01            # arbiter splits
escrow withdraw --escrow 0x.. [--role provider|arbiter]                 # pull settled funds
escrow status   --escrow 0x.. --job <ref>
escrow ref      --label "job-42"                                        # derive a jobId
```

Keys come from a gitignored `.env` (auto-loaded): `$CLIENT_PRIVATE_KEY` (default for client actions),
`$PROVIDER_PRIVATE_KEY` (deliver), `$ARBITER_PRIVATE_KEY` (resolve). Never hardcode a key.

## How it composes (the point)

`agent-escrow` is the **hire** verb the rest of the suite was missing, turning the loop into
**discover → hire (escrow) → deliver → release → rate**:

- The **`jobId` is the mesh `ref`.** After `release`, the client records the settled payment in
  `a2a-mesh` (`recordPaymentSigned`) and `rate`s the provider — so a completed escrow mints
  **payment-gated, un-fakeable reputation**. `pharos-bazaar discover` then ranks providers by that
  reputation, closing the loop.
- The **arbiter is a socket.** It can be a human, a multisig/DAO, or another skill — e.g. a judge that
  reads the on-chain `termsHash`/`deliverableHash` and calls `resolve()` autonomously.
- A client agent can route `createJob` through **`agent-treasury`** so the lock respects an on-chain
  spending policy, and pre-flight the arbiter/provider addresses with **`agent-shield`**.

## Security posture (built audit-first)

- **Checks-effects-interactions** throughout; exactly **one external call** (`withdraw`), reentrancy-guarded.
- **Pull-payments** only — the contract never pushes to arbitrary addresses.
- **Anti-rug:** delivered work cannot be silently timeout-refunded (only a still-`Funded` job can).
- **No owner, no admin, no upgradability, no external dependencies.** Custom-error reverts for typed
  agent branching.
- **Value conservation** is asserted in the test suite; a reentrancy attacker contract is proven blocked.
- 23 tests on an in-memory EVM (full lifecycle + every guard + reentrancy + value conservation).

## Live on Atlantic (chainId 688689)

`AgentEscrow` → [`0x5919e995b29Bf81B322171769C9e63c5964258A7`](https://atlantic.pharosscan.xyz/address/0x5919e995b29Bf81B322171769C9e63c5964258A7).
A full lifecycle is on-chain: a **release** path (create → release, provider credited) and a
**dispute** path (create → dispute → arbiter resolve → withdraw, funds pulled back to a real wallet).
Tx hashes are in the repo `DEPLOYMENTS.md`.
