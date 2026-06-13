---
name: pharos-bazaar
description: >-
  The discover -> pay -> rate hub for agent-to-agent commerce on Pharos. Bazaar lets an agent find the
  best service for a task (ranked by on-chain reputation), pay for it gaslessly via x402, and rate it
  afterward — composing a2a-mesh (discovery + payment-gated reputation) and x402-facilitator into one
  marketplace, the Pharos-native answer to Coinbase's x402 Bazaar. Use when an agent needs to hire,
  pay, or compare other agents' services.
  Triggers on "find a service pharos", "hire an agent pharos", "agent marketplace pharos", "best
  service pharos", "bazaar pharos", "discover and pay pharos".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
---

# Pharos Bazaar

A marketplace hub for the agent economy: **discover** services, **pay** for them gaslessly, **rate**
the outcome — all on Pharos, all trust-anchored on-chain. Coinbase's x402 Bazaar proved the model
(100M+ agentic payments, 155+ services); Bazaar brings it to Pharos with an **on-chain reputation
layer** so the "best" pick is provable, not advertised.

## Why this is the invocation hub

The Pharos Agent Carnival rewards **frequently-called** skills (Caller/Developer Invocation Races). A
marketplace is, by construction, the thing every other agent calls: to find a price feed, a compute
service, a data API — agents hit `discover`/`best` constantly, then pay and rate. It's the natural
high-adoption position, and it cascades straight into the Phase 2 Agent Arena.

## Commands

```bash
npm install

# Discover services for a tag, ranked by on-chain reputation (read-only)
node scripts/bazaar.mjs discover --registry 0xREG --reputation 0xREP --tag price-feed

# Pick the single best service under constraints (the "self-improving index" decision)
node scripts/bazaar.mjs best --registry 0xREG --reputation 0xREP --tag price-feed --min-reputation 50 --max-price 1000

# Hire a service: emits the exact x402 pay/settle + mesh record/rate steps to run
node scripts/bazaar.mjs hire --registry 0xREG --reputation 0xREP --service 1 --token 0xUSDC

# Rate a paid interaction (payer-only; needs PAYER_PRIVATE_KEY)
node scripts/bazaar.mjs rate --reputation 0xREP --ref 0xSETTLEMENT_TX --score 5
```

Default deployed mesh addresses for Atlantic are in `assets/networks.json`.

## How it composes the suite

- **a2a-mesh** — discovery (`ServiceRegistry`) + payment-gated reputation (`Reputation`).
- **x402-facilitator** — the gasless payment rail (EIP-3009 settle); the settlement tx hash becomes the
  `ref` that gates the rating.
- **agent-treasury** — an agent can route Bazaar payments through its policy.
- **agent-shield / agent-utils** — vet a peer's endpoint / address before acting on it.

Aligns with **ERC-8004** (Trustless Agents): discovery = Identity, reputation = Reputation Registry,
x402 = the deferred payment layer. See `04-a2a-mesh/references/erc-8004.md`.

Run `npm test` for the ranking/selection suite (reputation-desc, price tiebreak, constraint filtering).
