---
name: x402-facilitator
description: >-
  Self-hostable x402 payment facilitator for Pharos. Pharos documents the x402 protocol but ships no
  public facilitator — this fills that gap so AI agents (and resource servers) can accept gasless
  stablecoin payments. It verifies and settles EIP-3009 "transferWithAuthorization" payment
  authorizations: the payer signs off-chain, the facilitator submits on-chain and pays the gas, so an
  agent pays for an API/service in one signature. Exposes the standard x402 facilitator endpoints
  (GET /supported, POST /verify, POST /settle) plus a CLI to sign, verify, and settle.
  Triggers on "x402 facilitator pharos", "accept payments agent pharos", "gasless USDC pharos",
  "paid API pharos", "settle x402 payment", "verify x402 payment".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
---

# x402 Facilitator

The piece the Pharos x402 docs assume you already have but don't provide: a **facilitator**. A resource
server replies `402 Payment Required`; the client signs an **EIP-3009 `transferWithAuthorization`** for
the settlement token (USDC-style); the facilitator **verifies** the signature and **settles** it
on-chain — paying the gas itself, so the payer needs no native PHRS. This is what makes agent-to-agent
and agent-to-API micropayments actually work on Pharos.

## When to use this skill

- You're building a **paid API / service** an agent pays per call, and need to verify + settle x402 payments.
- An agent needs to **pay** a resource server gaslessly (one signature, no PHRS).
- **a2a-mesh** settlement: the settlement tx hash becomes the `interactionRef` that gates a reputation rating.

## What it does (and the permission model)

| Endpoint / cmd | Does | Touches chain? | Key |
|----------------|------|----------------|-----|
| `GET /supported` / `x402 supported` | lists `{scheme: exact-evm, network: eip155:688689}` | no | none |
| `POST /verify` / `x402 verify` | checks the payer's signature + amount/asset/recipient/expiry | **no** (read-only) | none |
| `POST /settle` / `x402 settle` | submits `transferWithAuthorization` on-chain | yes (write) | `FACILITATOR_PRIVATE_KEY` (gas payer) |
| `x402 pay` | payer signs an authorization, prints the `X-PAYMENT` header | no | `PAYER_PRIVATE_KEY` (sign only) |

The payer signs but never sends a tx; the facilitator's key only pays gas to relay an *already-authorized*
transfer — it cannot move funds the payer didn't sign for. Keys come from env / a gitignored `.env`.

## Quickstart

```bash
npm install

# Payer (agent) signs a 1-USDC authorization to a merchant -> X-PAYMENT header
PAYER_PRIVATE_KEY=0x... node scripts/x402.mjs pay \
  --token 0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8 --to 0xMERCHANT --amount 1000000 --ttl 600

# Anyone can verify it off-chain (no key, no gas)
node scripts/x402.mjs verify --payment @payment.json \
  --token 0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8 --to 0xMERCHANT --amount 1000000

# The facilitator settles it on-chain, paying the gas (payer spends none)
FACILITATOR_PRIVATE_KEY=0x... node scripts/x402.mjs settle --payment @payment.json \
  --token 0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8

# Or run it as a server a resource server points FACILITATOR_URL at:
FACILITATOR_PRIVATE_KEY=0x... npm run serve   # http://localhost:4021
```

Run `npm test` for the 11-case suite (signature recovery, under/overpayment, wrong recipient/asset,
expiry/not-yet-valid, forged-payer rejection, scheme/network mismatch).

## Composability

- **a2a-mesh**: settle a payment here, feed the settlement tx hash into `mesh record-signed` as the
  `interactionRef` so the payer can rate the provider — payment-gated reputation, end to end.
- **agent-treasury**: an agent's payment can be routed through the treasury so it respects the policy.

## Notes

- Uses the canonical x402 **exact-evm** scheme over **EIP-3009**; settlement token must support
  `transferWithAuthorization` (USDC does). The x402 demo USDC on Atlantic is
  `0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8` (per Pharos docs, not an official address).
- Replay-safe: each authorization has a unique `nonce`; `settle` checks `authorizationState` before
  submitting. Malleable / wrong-`v` signatures are rejected.

See `SPEC.md` for the protocol flow and the EIP-3009 scheme details.
