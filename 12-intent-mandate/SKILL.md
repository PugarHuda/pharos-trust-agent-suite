---
name: intent-mandate
description: >-
  A cryptographic leash for autonomous agents, modeled on Google AP2's "Intent Mandate". A user funds a
  contract and signs (off-chain, gasless, EIP-712) an envelope authorizing a specific agent to spend up
  to a cap, to allowed recipients, before an expiry. The agent can move the user's funds — but ONLY
  inside that signed envelope. A jailbroken or hallucinating agent cannot overspend, pay a disallowed
  recipient, act after expiry, or act after the user revokes. Use to bind an agent's spending to an
  explicit, user-signed intent.
  Triggers on "sign spending intent agent", "ap2 mandate pharos", "authorize agent to spend limit",
  "user signed payment authorization agent", "revocable agent spending permission".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
  contract: "0x4Ca9b16E6a107717A7c68F615ca4D5EFE4F2Ee4a"
---

# Intent Mandate

Google's AP2 (Agent Payments Protocol) captures consent as three signed **Mandates** — Intent, Cart,
Payment — so an autonomous purchase is anchored to "deterministic, cryptographically signed proof of
intent." This skill brings the **Intent Mandate** on-chain for Pharos: the user signs *what they want*
(an agent, a cap, allowed recipients, an expiry), and the contract enforces it.

It's the per-task, user-signed complement to `agent-treasury`'s standing policy: the treasury answers
"is this within my long-running budget?"; the mandate answers "did the human actually authorize *this*
task, and within what bounds?" — and both are enforced in the contract, not the prompt.

## How it works

```
user  ── fund() ───────────────────────────────►  deposits native PHRS
user  ── signTypedData(IntentMandate) ─────────►  off-chain, gasless: agent + cap + recipient + expiry + nonce
agent ── spendUnderMandate(m, sig, to, amount) ►  contract verifies the signature and EVERY bound, then pays
user  ── revoke(m) / withdraw(amount) ─────────►  cancel a mandate or pull unspent funds anytime
```

Every spend reverts unless: the caller **is** the authorized agent, the EIP-712 signature recovers to
the mandate's user, the cumulative spend stays **≤ maxAmount**, the recipient is allowed (or the mandate
allows any), the mandate is **not expired** and **not revoked**, and the user's deposited balance
covers it. Partial spends accrue against the cap.

## Commands

```bash
mandate deploy
mandate fund      --mandate 0x.. --amount 0.01
mandate sign      --mandate 0x.. --agent 0x.. --recipient 0x.. --max 0.01 [--expiry 1h] [--nonce 1] [--out mandate.json]
mandate spend     --file mandate.json --to 0x.. --amount 0.005     # the authorized agent executes
mandate remaining --file mandate.json
mandate revoke    --file mandate.json
mandate withdraw  --mandate 0x.. --amount 0.005
```

Keys from a gitignored `.env`: `$USER_PRIVATE_KEY` (funds/signs/revokes/withdraws), `$AGENT_PRIVATE_KEY`
(executes). The signature is produced off-chain with no gas.

## Security posture

- **EIP-712** typed-data signatures with an EIP-2 malleability guard (low-s, v ∈ {27,28}); a tampered
  field or wrong signer reverts `BadSignature`.
- **Pull-payments + reentrancy guard**; effects before the single external call. Funds are custodial
  only to the depositing user, who can `withdraw` unspent funds at any time.
- **No owner, no admin, no upgradability.** Typed custom-error reverts for agent branching.
- 14 tests on an in-memory EVM with real ethers-signed mandates (happy path, every guard, revoke,
  reentrancy, zero-amount).

## How it composes

- Wrap `agent-treasury` or `agent-escrow` funding so the agent's autonomous action is bounded by an
  explicit, user-signed intent — defense in depth: standing policy **and** per-task consent.
- The mandate's `recipient` can be required to clear `reputation-gate` first, so the user authorizes
  *spending* and the gate authorizes *the counterparty*.

## Live on Atlantic (chainId 688689)

`IntentMandate` → [`0x4Ca9b16E6a107717A7c68F615ca4D5EFE4F2Ee4a`](https://atlantic.pharosscan.xyz/address/0x4Ca9b16E6a107717A7c68F615ca4D5EFE4F2Ee4a).
Proven on-chain: a user funded 0.002 PHRS and signed a mandate (cap 0.002, fixed recipient); the agent
spent 0.001 under it (the mandate enforced), leaving 0.001 remaining. Tx hashes in `DEPLOYMENTS.md`.
