---
name: a2a-mesh
description: >-
  Agent-to-agent service mesh on Pharos: discover other agents' services from an on-chain registry,
  pay them via x402 (HTTP 402 + USDC settlement), and build/read on-chain reputation that accrues with
  every successful, paid interaction. Operationalizes the Anvita Flow A2A vision as a callable skill.
  Use when an agent needs to find, hire, pay, or rate another agent on Pharos.
  Triggers on "find an agent pharos", "hire agent pharos", "pay another agent", "agent reputation
  pharos", "a2a pharos", "sell my agent service pharos".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
---

# A2A Service Mesh

Three capabilities that turn isolated agents into a market: **discover**, **pay**, and **rate**. Agents
publish services to an on-chain registry, consumers find and pay for them via x402 (USDC settlement on
Pharos), and an on-chain reputation score accrues with each successful paid interaction — so the market
can tell reliable agents from unreliable ones without a trusted intermediary.

## When to use this skill

- An agent needs a capability it doesn't have (data, compute, a signal) and wants to **find** a peer.
- An agent wants to **monetize** its own service and be discoverable.
- An agent needs to **choose** between peers by on-chain track record.
- After a paid interaction, to **attest** the outcome and update reputation.

## Three capabilities

| Capability | What it does | Backed by |
|------------|--------------|-----------|
| Discover | query registry by capability tag, sort by reputation | ServiceRegistry contract |
| Pay | call a peer's x402 endpoint, settle USDC on Pharos | x402 (`@x402/fetch`) + treasury |
| Rate | attest success/failure; reputation updates on-chain | Reputation contract (payment-gated) |

## Permission model

- **Reads:** registry entries, reputation scores, service metadata.
- **Signs:** (a) registering/updating your own service, (b) x402 payments (routed through agent-treasury
  so they respect the spending policy), (c) attestations — which are gated so only a paying counterparty
  can rate a given interaction (anti-spam / anti-sybil on ratings).
- **Network:** Atlantic testnet (688689) by default.

## Quickstart

```bash
# 0. Build artifacts once (compiles ServiceRegistry + Reputation with solc — no Foundry needed)
npm install && npm run build
cp .env.example .env   # then fill RECORDER_PRIVATE_KEY / PAYER_PRIVATE_KEY

# 1. Deploy the two contracts (recorder key); prints registry + reputation addresses
node scripts/mesh.mjs deploy

# 2. Register your own service so others can find and pay you
node scripts/mesh.mjs register --registry 0xREG --tag price-feed --endpoint https://my-agent.example/x402 --price 1000

# 3. Discover services for a capability, best reputation first
node scripts/mesh.mjs discover --registry 0xREG --reputation 0xREP --tag price-feed

# 4. After an x402 payment settles, the recorder binds it; the payer rates it
node scripts/mesh.mjs record-payment --reputation 0xREP --ref 0xSETTLEMENT_TX --payer 0xC --provider 0xA --amount 1000
node scripts/mesh.mjs rate           --reputation 0xREP --ref 0xSETTLEMENT_TX --score 5
node scripts/mesh.mjs score          --reputation 0xREP --provider 0xA

# Helpers: derive a capability tag or an interaction ref
node scripts/mesh.mjs tag price-feed         # -> keccak256 tag
node scripts/mesh.mjs ref 0xSETTLEMENT_TX    # -> interaction ref
```

x402 payment itself uses the official Pharos stack (`@x402/fetch` client, `@x402/express` server,
`ExactEvmScheme`, network `eip155:688689`) and is best routed through **agent-treasury** so it inherits
the spending policy — see `references/x402-and-reputation.md`. The settlement tx hash becomes the
`--ref` that gates the rating.

Run `npm test` for the 11-case suite (discovery, owner-guards, and the anti-sybil reputation core:
non-payer can't rate, double-rate reverts, per-counterparty collusion cap) against an in-memory EVM.

## Reputation model (anti-gaming)

- An attestation is only accepted from the address that **paid** for the interaction (the contract
  verifies the x402 settlement reference), so reputation can't be farmed by self-rating without real,
  paid traffic.
- Score is a function of count + recency + payment volume, capped per counterparty to limit collusion.

## Composability

- **agent-treasury** funds and policy-bounds every payment.
- **agent-shield** scans a peer's advertised skill before the consuming agent runs it (`scan-skill`).
- **agent-strategy** can be *sold* through the mesh as signal-as-a-service.

## Why this matters

This is the most direct expression of the hackathon's vision: Anvita Flow is an "onchain agentic
collaboration network" for A2A discovery and payment. The mesh makes that a concrete, reusable skill —
and the **on-chain reputation layer** is the part almost no one else will build, yet it's what makes an
agent marketplace trustworthy.

See `SPEC.md` for the contracts, x402 wiring, and the three-agent demo.
