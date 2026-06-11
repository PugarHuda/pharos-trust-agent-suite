---
name: agent-shield
description: >-
  Pre-flight security for any on-chain action an agent takes on Pharos. Before a transaction is signed,
  Shield simulates it, shows a human-readable balance diff, verifies token/contract addresses against
  the official Pharos registry (catching address poisoning), flags dangerous approvals (unlimited /
  unknown spender), and scans third-party skills for exfiltration patterns before an agent uses them.
  100% read-only — never holds a key, never signs. Use as the safety gate in front of every write.
  Triggers on "is this transaction safe", "simulate before sending", "check this contract pharos",
  "scan this skill", "agent security pharos", "verify address pharos".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
  readOnly: true
---

# Agent Shield

A **pre-flight security gate** an agent runs before any on-chain action on Pharos. Shield never holds a
private key and never signs — it only reads, simulates, and reports a verdict (`pass` / `warn` / `fail`)
with reasons. It is the runtime complement to CertiK's submission-time Skill Scanner: CertiK audits a
skill before it's published; Shield protects the agent at the moment of execution.

## When to use this skill

- Before signing **any** transaction (transfer, approve, swap, contract call).
- Before an agent **installs/uses a third-party skill** (scan its SKILL.md + scripts).
- When a destination address or token looks suspicious (possible address poisoning / honeypot).
- As the mandatory pre-flight step inside agent-treasury, agent-strategy, and a2a-mesh.

## Four checks

| Check | What it catches | How |
|-------|-----------------|-----|
| 1. Simulate & diff | "you send X, receive 0" drains, honeypots | `eth_call` / `cast run`, decode pre/post balances |
| 2. Registry verify | address poisoning, spoofed tokens/contracts | match against assets/registry.json (official Pharos addresses) |
| 3. Approval guard | unlimited approvals, unknown spenders | decode calldata for `approve`, flag `type(uint).max` & non-allowlisted spenders |
| 4. Skill scan | malicious third-party skills | regex/AST scan for key exfiltration, `curl|bash`, opaque endpoints |

## Permission model

- **Reads only.** Calls public RPC (`eth_call`, `eth_getBalance`, `eth_getCode`) and reads local files
  for the skill scan. No key, no signing, no state change, no outbound data beyond the RPC it's told to use.
- **Network:** Atlantic testnet (688689) by default; can verify mainnet read-only too.

## Quickstart

```bash
# Zero npm dependencies — run directly with Node >= 18.
# Exit codes: 0 = pass, 1 = warn, 2 = fail (agents can gate on $?).

# 1. Vet a transaction before signing (simulates via eth_call, returns pass/warn/fail + reasons)
node scripts/shield.mjs check-tx --from $AGENT --to $TARGET --data 0x... --value 0
#   optional: --rpc-url $RPC --network atlantic-testnet --check-sell-token $TOKEN --json

# 2. Verify an address against the official Pharos registry (catches poisoning look-alikes)
node scripts/shield.mjs verify-address --address 0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B
# -> Address verified: USDC (testnet) (official)

# 3. Inspect an approval before granting it
node scripts/shield.mjs check-approval --token $USDC --spender $ROUTER --amount max
# -> FAIL: unlimited approval to non-allowlisted spender — do-not-sign

# 4. Scan a third-party skill before using it
node scripts/shield.mjs scan-skill ./some-skill/
# -> FAIL: private key flows toward a network call (file:line)

# Run the test suite (20 tests, no network needed)
npm test
```

## Output format

```
verdict: warn            # pass | warn | fail
score: 62                # 0-100, mirrors CertiK-style scoring
findings:
  - severity: high
    title: Unlimited approval to unverified spender
    detail: approve(0xRouter, type(uint256).max); spender not in registry
  - severity: info
    title: Balance diff
    detail: -1.0 USDC, +0.0 (no token received)
recommendation: do-not-sign
```

## Composability

- **agent-treasury** calls `check-tx` inside its pre-execution checklist before every `spend`.
- **agent-strategy** runs `check-tx` before executing a swap.
- **a2a-mesh** runs `scan-skill` before an agent consumes a peer's advertised skill.

## Safety notes

Shield is deliberately powerless: it cannot move funds. Its only job is to say *no* convincingly. This
also means it should score near-perfect on the CertiK Skill Scanner (no keys, no writes, no exfiltration).

See `SPEC.md` for detection logic and the live honeypot/drainer demo.
