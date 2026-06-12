# x402-facilitator — Technical Specification

## Problem

Pharos documents the **x402** protocol and ships client/server examples, but there is **no public
facilitator** — the component that verifies a payment authorization and settles it on-chain. Every x402
integration on Pharos must self-host one. That is friction for exactly the agent-payment use case Pharos
is built for. This skill is a drop-in facilitator.

## Protocol flow

```
 client/agent                     resource server                    facilitator (this skill)
     │  GET /resource                   │                                      │
     │ ───────────────────────────────►│                                      │
     │  402 + PaymentRequirements       │                                      │
     │ ◄───────────────────────────────│                                      │
     │  sign EIP-3009 authorization     │                                      │
     │  (no gas, no tx — just a sig)    │                                      │
     │  GET /resource + X-PAYMENT       │                                      │
     │ ───────────────────────────────►│  POST /verify {payment, requirements}│
     │                                  │ ────────────────────────────────────►│  recover signer,
     │                                  │  { isValid, payer }                  │  check amount/asset/
     │                                  │ ◄────────────────────────────────────│  recipient/expiry
     │                                  │  POST /settle {payment}              │
     │                                  │ ────────────────────────────────────►│  transferWithAuthorization
     │                                  │  { success, txHash }                 │  on-chain (facilitator
     │  200 + result + PAYMENT-RESPONSE │ ◄────────────────────────────────────│  pays the gas)
     │ ◄───────────────────────────────│                                      │
```

## The "exact-evm" scheme (EIP-3009)

The payer signs an EIP-712 `TransferWithAuthorization(from,to,value,validAfter,validBefore,nonce)` typed
against the **token's** domain (USDC-style EIP-3009). The facilitator submits
`token.transferWithAuthorization(...,v,r,s)`; the token contract verifies the signature on-chain and
moves the funds. The payer therefore spends **no native gas** — the facilitator relays it.

This is the same trust model as a2a-mesh's `recordPaymentSigned`: the **signature** is the authorization,
so the facilitator (the relayer/gas payer) cannot move funds the payer did not sign for. It can only
choose whether/when to relay an already-authorized, amount/recipient-bound transfer.

## What `verify` checks (the security core, fully unit-tested)

1. `scheme` and `network` match the requirements.
2. authorization `to` == required `payTo`.
3. authorization `value` ≥ `maxAmountRequired` (overpayment allowed, underpayment rejected).
4. the signing-domain token == required `asset`.
5. `validAfter ≤ now < validBefore` (freshness).
6. the EIP-712 signature recovers to authorization `from` (the payer) — a forged `from` is rejected.

## What `settle` does

- Splits the 65-byte signature into `(v,r,s)`, rejecting malleable high-`s` / bad-`v`.
- Checks `authorizationState(from, nonce)` first (replay guard / idempotency).
- Estimates gas (+15% buffer for the Pharos charge-by-gas-limit quirk), submits, returns the tx hash.

## Why it scores

- **Fills the single biggest researched gap** in the Pharos x402 stack (no public facilitator).
- **Highest vision alignment** — Anvita Flow integrates x402 natively for agent payments; this is the
  rail those payments run on.
- **Composability** — pairs with a2a-mesh (settlement → reputation) and agent-treasury (policy-bounded
  payment), turning four skills into one payment-and-trust loop.
- **Security** — verify is read-only and keyless; settle only relays a signed, bounded authorization;
  replay- and malleability-guarded.

## Build status

Verify/settle logic, CLI, and HTTP server are complete with 11 passing tests against the EIP-3009
scheme. A live `settle` requires a settlement token that implements EIP-3009 `transferWithAuthorization`
(USDC does); confirm the Atlantic demo USDC exposes it before relying on the on-chain path.
