---
name: agent-strategy
description: >-
  Autonomous DeFi strategy execution for agents on Pharos. Reads prices from on-chain oracles
  (Chainlink / Supra), evaluates a strategy rule (rebalance, DCA, stop-loss, threshold buy/sell), and
  executes the resulting swap on-chain — all from one natural-language instruction. Routes execution
  through agent-treasury so trades inherit the agent's spending policy. Use when an agent should manage
  a position or react to market conditions on Pharos.
  Triggers on "rebalance my portfolio pharos", "DCA pharos", "stop loss agent", "buy when price drops
  pharos", "auto trade pharos", "manage position pharos".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
---

# Agent Strategy Engine

Turns a natural-language trading mandate into an autonomous on-chain loop: **read price → evaluate
rule → (optionally) swap**. It composes three Pharos primitives that already exist but are rarely used
together — on-chain oracles, a DEX, and policy-bounded execution — into a single agent skill.

## When to use this skill

- "Keep my portfolio 50/50 PROS/USDC, rebalance when it drifts 5%."
- "DCA 1 USDC into WETH every day."
- "Sell my WETH if it drops 10% from here (stop-loss)."
- "Buy WPHRS when PHRS/USD < $0.20."

## How it works

1. **Read price** from an oracle (Chainlink Data Feed / Push, or Supra pull) on Pharos.
2. **Evaluate** the strategy rule against current price + current balances.
3. **Decide**: no-op, or a specific swap (token in, token out, amount, min-out with slippage).
4. **Pre-flight** the swap through agent-shield (simulate + slippage + balance diff).
5. **Execute** the swap through agent-treasury's `executeCall` so it respects the spending policy.

## Permission model

- **Reads:** oracle prices, pool reserves, balances. 
- **Signs:** only the swap, and only via agent-treasury (policy-bounded) using the agent's session key.
  Standalone mode (direct router call with session key) is available but treasury-routed is the default.
- **Network:** Atlantic testnet (688689) by default.

## Pre-execution checklist (every trade)

1. Confirm session key present and treasury reachable.
2. Read oracle price; reject if stale (check `updatedAt`) — never trade on a stale feed.
3. Compute `minAmountOut` from a slippage bound; never swap with zero/again-stale slippage protection.
4. agent-shield `check-tx` on the swap calldata.
5. Gas limit 15% above estimate (Pharos charges by gas_limit).
6. Confirm, then execute via treasury.

## Quickstart

```bash
npm install   # ethers only; no contracts to compile (this skill composes agent-treasury)

# Compile a mandate into a validated struct (only the struct ever executes)
node scripts/strategy.mjs compile --rule "sell WETH if it drops 10%, 0.5% slippage"

# Read a live oracle price with freshness guard (Pharos Chainlink Push Engine)
node scripts/strategy.mjs price --feed BTC/USD

# Evaluate a rule against the live price -> NOOP or a swap decision
node scripts/strategy.mjs eval --rule "sell WBTC when price > 60000" --feed BTC/USD

# Build the slippage-bounded swap calldata, wrapped as treasury.executeCall (does NOT broadcast)
node scripts/strategy.mjs plan --rule "sell WETH if it drops 10%" --price 80 --ref 100 \
  --router 0xROUTER --treasury 0xTREASURY --amount-in 1000000000000000000 --quote-out 2000000
```

The `plan` output is two `treasury.executeCall` calldatas (exact-amount approve, then swap). Pre-flight
each with `shield check-tx`, then submit them with the treasury **session key** — so the trade inherits
the on-chain spending policy and a runaway strategy still can't exceed the daily cap.

> **Pharos oracle quirk:** Atlantic Chainlink proxies are `SelfManagedFeedsCacheProxy` contracts that
> revert on the standard `latestRoundData()`. The adapter tries `latestRoundData()` first (so the same
> code works on real Chainlink) and falls back to `latestAnswer()`/`latestTimestamp()`, which is what
> Pharos actually supports. Either way it enforces freshness (`age <= heartbeat`) and `answer > 0`.

Run `npm test` for the 25-case suite (rule compiler + misparse regressions, evaluator branches, oracle precision, slippage math, calldata
encoding) — all offline and deterministic.

## Composability

- **agent-treasury** is the execution substrate (policy enforcement).
- **agent-shield** is the pre-trade safety gate.
- **a2a-mesh** can sell this strategy as a paid service to other agents (signal-as-a-service via x402).

## Safety notes

- Always enforce slippage and oracle freshness; both are common loss vectors for naive agents.
- Treasury policy bounds the worst case: even a runaway strategy can't exceed the daily cap.

See `SPEC.md` for oracle wiring, the rule DSL, and the demo.
