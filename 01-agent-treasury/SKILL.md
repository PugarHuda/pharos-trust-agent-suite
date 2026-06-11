---
name: agent-treasury
description: >-
  On-chain treasury and spending policy for AI agents on Pharos. Deploys an ERC-4337 smart account
  with enforced daily spend limits, token/contract allowlists, expiring session keys, and an owner
  kill-switch — so an agent can transact autonomously but can never exceed its mandate. Use when an
  agent needs to hold funds, pay for services, or execute transactions on Pharos with guardrails.
  Triggers on "agent wallet pharos", "agent treasury", "spending limit agent", "session key pharos",
  "give my agent a budget", "smart account pharos".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
---

# Agent Treasury

Gives an AI agent a **smart-account wallet whose spending rules are enforced on-chain**, not by a
prompt. The owner sets a policy (daily cap, allowed tokens, allowed destination contracts, session
key + expiry); the agent operates within it. A jailbroken or misled agent still cannot move funds
outside the policy, because the limits live in the contract, not the instructions.

## When to use this skill

- An agent needs to **hold and spend funds** on Pharos with a safety boundary.
- You want to delegate a **time-boxed budget** to an agent (e.g. "$10/day for 7 days").
- You need an **emergency stop** for an autonomous agent.
- Another skill (agent-strategy, a2a-mesh, an x402 client) should execute **through** a guarded wallet.

## What this skill reads and signs (permission model)

- **Reads:** account address, policy state, balances, transaction simulations. No private data leaves
  the machine.
- **Signs:** only (a) owner operations (deploy account, set/update policy, fund, kill-switch) with the
  **owner key**, and (b) agent operations (spend within policy) with a **session key**. The session
  key cannot change policy or withdraw beyond limits.
- **Network:** Atlantic testnet (688689) by default. Mainnet requires explicit, separate confirmation.

## Pre-execution checklist (every write)

1. Confirm a key is available (`$OWNER_PRIVATE_KEY` for owner ops, `$SESSION_PRIVATE_KEY` for agent ops).
   Keys are read from the environment only — never pass them on the command line or in a prompt.
2. Display the target network from `assets/networks.json` (testnet default; the CLI warns loudly on mainnet).
3. `spend` automatically runs an **agent-shield pre-flight**: it verifies the token + destination against
   the registry and `staticCall`s the treasury tx so a policy violation reverts *before* broadcasting
   (saving gas — Pharos charges by gas_limit even on revert). A blocked pre-flight stops the spend
   unless `--yes` is passed.
4. The CLI sets gas limit +15% over estimate automatically (Pharos charges by gas_limit; refunds don't
   reduce the charge).
5. Every successful write prints the tx hash and a Pharosscan link.

## Core operations

| Operation | What it does | Key used | Reference |
|-----------|--------------|----------|-----------|
| `deploy` | Deploy the agent's smart account via the factory | owner | references/deploy.md |
| `set-policy` | Set daily cap, token allowlist, contract allowlist | owner | references/policy.md |
| `grant-session` | Issue a session key with budget + expiry | owner | references/policy.md |
| `spend` | Execute a transfer/call within policy | session | references/spend.md |
| `revoke` | Revoke a session key | owner | references/policy.md |
| `kill` | Pause all spending (emergency stop) | owner | references/policy.md |
| `status` | Show policy, remaining daily budget, active sessions | none (read) | references/spend.md |

## Quickstart

```bash
# 0. Build artifacts once (compiles AgentTreasury.sol with the solc npm package — no Foundry needed)
npm install && npm run build
cp .env.example .env   # then fill OWNER_PRIVATE_KEY / SESSION_PRIVATE_KEY

# 1. Deploy the agent's treasury (owner key); prints the deployed address
node scripts/treasury.mjs deploy

# 2. Set policy: 10 USDC/day cap on USDC, allow a destination contract
node scripts/treasury.mjs set-policy     --treasury 0xTREASURY --token USDC --daily-cap 10
node scripts/treasury.mjs allow-contract --treasury 0xTREASURY --target 0xService

# 3. Grant the agent a 7-day session key with a 5 USDC sub-budget
node scripts/treasury.mjs grant-session  --treasury 0xTREASURY --key 0xSESSION --token USDC --budget 5 --expires 7d

# 4. The agent spends within policy (session key) — shield pre-flight runs automatically
node scripts/treasury.mjs spend          --treasury 0xTREASURY --token USDC --to 0xService --amount 1

# 5. Inspect, or emergency-stop
node scripts/treasury.mjs status         --treasury 0xTREASURY --token USDC --key 0xSESSION
node scripts/treasury.mjs kill           --treasury 0xTREASURY
```

Run `npm test` to execute the 12-case policy suite (cap, budget, expiry, allowlist, kill-switch,
owner-guard) against an in-memory EVM — no network or funded key required.

## Composability

- **agent-shield** runs as the pre-flight simulation step before any `spend`.
- **agent-strategy** and **a2a-mesh** route their on-chain actions through `spend` so trades and
  agent-to-agent payments inherit the policy automatically.

## Safety notes

- Never paste a private key into a prompt or commit it. Use environment variables; `.env` is gitignored.
- The session key is intentionally limited: even if leaked, loss is bounded by the remaining daily cap
  and the session budget/expiry, and the owner can `revoke` or `kill` instantly.

See `SPEC.md` for architecture and contract design; `references/` for operation detail.
