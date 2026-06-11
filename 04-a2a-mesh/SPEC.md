# a2a-mesh — Technical Specification

## Problem

Anvita Flow's premise is agent-to-agent collaboration: agents discovering and paying each other. But
discovery + payment alone produce a market with **no trust signal** — a consumer agent can't tell a
reliable provider from a scammer. Discovery and x402 payment will be widely copied; the missing,
defensible piece is **on-chain reputation that is provably tied to real paid interactions**.

## Solution

A skill exposing three functions — discover, pay, rate — over two small contracts (ServiceRegistry,
Reputation) plus x402 for settlement. The key design choice: **only the payer of an interaction can
rate it**, verified on-chain against the x402 settlement reference. That makes reputation expensive to
fake (you must pay real USDC for real traffic to move a score), which is what makes the marketplace
usable.

## Architecture

```
   Provider agent                                Consumer agent
        │ register(tag, endpoint, price)               │ discover(tag) -> [services sorted by rep]
        ▼                                               ▼
  ┌──────────────── ServiceRegistry (on-chain) ────────────────┐
  │ services[id] = {owner, tag, endpoint, price, active}        │
  └─────────────────────────────────────────────────────────────┘
        │                                               │ call endpoint (HTTP 402)
        │                                               ▼
        │                                   x402: 402 -> sign payment -> settle USDC
        │                                   (payment routed via agent-treasury)
        ▼                                               ▼
  ┌──────────────── Reputation (on-chain) ─────────────────────┐
  │ rate(interactionRef, score): accepted only if msg.sender   │
  │ is the verified payer of interactionRef. Updates provider  │
  │ score = f(count, recency, volume), capped per counterparty.│
  └─────────────────────────────────────────────────────────────┘
```

## Contracts

### ServiceRegistry
- `register(bytes32 tag, string endpoint, uint256 price) -> uint256 id`
- `update(id, ...)`, `setActive(id, bool)`
- `getByTag(tag) -> id[]` (or emit events and index off-chain / via Goldsky)
- Stores `owner`, `tag`, `endpoint` (x402 URL), `price`, `active`.

### Reputation
- `recordPayment(uint256 serviceId, bytes32 interactionRef, uint256 amount)` — called as part of /
  right after x402 settlement; binds `interactionRef` → payer + provider + amount.
- `rate(bytes32 interactionRef, uint8 score)` — requires `msg.sender == paymentOf[interactionRef].payer`
  and that it hasn't been rated yet. Updates the provider's aggregate.
- `scoreOf(address provider) -> uint256` — count/recency/volume weighted, per-counterparty cap.

> Binding payment to rating on-chain is the anti-sybil core. Without a paid, unique `interactionRef`,
> `rate` reverts.

## x402 wiring

Use the official Pharos x402 stack (`@x402/express` server side, `@x402/fetch` client side,
`ExactEvmScheme`, network `eip155:688689`). The consumer's payment is built as a treasury
`executeCall` to the facilitator/settlement so it inherits the spending policy. Capture the settlement
tx hash / payment reference as `interactionRef` for `recordPayment`.

## Why it scores

- **Highest vision alignment** — it *is* the Anvita Flow A2A story, made callable.
- **Originality** — reputation tied to verified payment is rare and hard to copy.
- **Composability** — treasury (pay), shield (vet peer skill), strategy (sold as a service) all plug in.
- **Invocation Race fit** — a discovery/payment hub is exactly the kind of skill other agents call
  repeatedly, which the broader 150k PROS campaign rewards.

## Build plan

1. Contracts: ServiceRegistry + Reputation (Foundry), with the payment-gated `rate`.
2. x402 client/server using the official packages; bind settlement → `interactionRef`.
3. CLI: `discover`, `register`, `call`, `rate`.
4. Treasury + Shield integration.
5. Off-chain index (optional): Goldsky subgraph for fast discovery queries.
6. Three-agent demo.

## Demo (the agent economy in two minutes)

Three agents on Atlantic testnet:
1. **Provider A** registers a `price-feed` service (x402 endpoint, 0.001 USDC/call).
2. **Provider B** registers a `compute` service.
3. **Consumer C** runs `mesh discover --tag price-feed`, picks A (higher reputation), pays via x402
   (USDC settles on Pharos — show the tx), receives the data, then `mesh rate --score 5`.
4. Show A's reputation increment **on-chain**, and show that an outsider who didn't pay **cannot** rate
   A (revert). 

That sequence — discover → pay → deliver → rate, all on Pharos — is the literal sentence judges want to
see come alive.

## Test matrix

| Case | Expected |
|------|----------|
| discover by tag | returns active services sorted by reputation |
| pay via x402 | USDC settles, interactionRef recorded |
| payer rates interaction | reputation updates |
| non-payer tries to rate | revert (not the payer) |
| double-rate same interaction | revert (already rated) |
| payment exceeds treasury cap | blocked by policy |

## Notes for the scanner

Payments routed through treasury (policy-bounded), no keys in code, attestations gated by on-chain
payment proof. The endpoint a provider registers is untrusted input — consumers should run
`shield scan-skill` / `shield check-tx` before acting on a peer's response. Document this.
