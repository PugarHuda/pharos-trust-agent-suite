---
name: agent-utils
description: >-
  High-frequency read-only on-chain utilities every Pharos agent needs on almost every action: live
  oracle price, a gas-limit advisor tuned for Pharos's charge-by-gas_limit model, ERC-20 token info,
  balances (native + token), and an address-safety check that catches poisoning look-alikes. 100%
  read-only — no keys, no writes, no gas — so it's the cheapest skill to adopt and the most-called.
  Triggers on "price pharos", "gas estimate pharos", "token info pharos", "check balance pharos",
  "is this address safe pharos", "verify address pharos".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
  readOnly: true
---

# Agent Utils

The small, **read-only** calls an agent makes constantly — bundled into one zero-dependency-of-keys
skill. Designed for the **Invocation Race**: low friction to adopt (no key, no deploy, no gas) and
called on nearly every agent action, so it accrues invocations.

## When to use this skill

- Before a trade/decision: get a **live price** with a freshness guard.
- Before any write: get a **tight gas limit** (Pharos charges by `gas_limit`, so don't over-provision).
- Before a transfer: **check the destination address** for poisoning / verify a token.
- Anytime: read **token metadata** or **balances**.

## Commands (all read-only)

```bash
npm install

node scripts/utils.mjs price        --feed BTC/USD            # live Chainlink price (+ STALE guard)
node scripts/utils.mjs gas          --to 0x.. --data 0x..     # suggested gas limit (+15%) + max fee
node scripts/utils.mjs token        --token USDC              # name/symbol/decimals/totalSupply
node scripts/utils.mjs balance      --address 0x.. [--token USDC]
node scripts/utils.mjs safe-address --address 0x..            # registry + poisoning check (exit 1 = unsafe)

npm test   # 7 offline tests (gas math, price scaling, units, poisoning detection)
```

Exit codes let an agent gate on `$?`: `price` exits 1 if stale; `safe-address` exits 1 if unknown/unsafe.

## Composability

- **agent-strategy** can call `price`; **agent-treasury**/anything signing a tx can call `gas`;
  **agent-shield** and any transfer flow can call `safe-address`. These are the primitives the rest of
  the suite (and other teams' agents) lean on — a natural invocation hub.

## Safety

Read-only by construction: only public `eth_call`/`eth_getBalance`/`eth_estimateGas`/`getFeeData`. No
key, no signing, no state change — scores cleanly on the CertiK Skill Scanner.
