# agent-strategy — Technical Specification

## Problem

"An agent that trades" is the most obvious agent-economy use case — and the one most entrants will
attempt as a thin swap wrapper. A thin wrapper is neither original nor safe. The winning version is the
**orchestration of three primitives done correctly**: oracle freshness, slippage-protected execution,
and policy-bounded autonomy. Getting all three right is the differentiator.

## Solution

A skill that compiles a natural-language mandate into a deterministic loop — read price, evaluate rule,
swap if triggered — and executes through agent-treasury (policy) behind agent-shield (safety). It
showcases Pharos infra that is documented but underused (Chainlink Data Streams/Push, Supra DORA,
Uniswap examples), which signals to judges that you read the docs deeply.

## Architecture

```
  NL mandate ──► rule compiler ──► Strategy{kind, asset, params}
                                        │
                 ┌──────────────────────┼───────────────────────┐
                 ▼                       ▼                        ▼
           oracle read            balance read              rule evaluate
        (Chainlink/Supra)        (treasury holdings)      (trigger? swap spec?)
                 └──────────────────────┬───────────────────────┘
                                        ▼
                          shield.check-tx(swap calldata)
                                        ▼
                  treasury.executeCall(tokenIn, router, amount, swapData)
                                        ▼
                                 on-chain swap (DEX)
```

## Rule DSL (start small, extend)

| Kind | Params | Trigger | Action |
|------|--------|---------|--------|
| `rebalance` | targets (e.g. 50/50), band % | |drift| > band | swap to restore targets |
| `dca` | amountIn, tokenIn→tokenOut, interval | interval elapsed | swap fixed amountIn |
| `stop-loss` | asset, drop % from reference | price ≤ ref·(1−drop) | swap asset → stable |
| `threshold` | asset, comparator, price | price crosses threshold | swap per side |

Compile NL → this struct with a small parser (or an LLM call that emits the struct, then validate it).
Never let free-form text reach execution — only the validated struct does.

## Oracle wiring

- **Chainlink Data Feed**: `latestRoundData()` → `(roundId, answer, startedAt, updatedAt, answeredInRound)`.
  Reject if `updatedAt` older than a max staleness (e.g. 1 hour) or `answer <= 0`.
- **Supra DORA (pull)**: fetch the price proof, submit on-chain, read the result; respect their pull
  flow. Use as fallback/secondary for cross-checking.
- **Sanity cross-check**: if two oracles disagree beyond a tolerance, treat as stale and do not trade.

## Execution & slippage

- Quote out-amount from pool reserves (Uniswap-style `getAmountsOut`).
- `minAmountOut = quote * (1 - slippageBps/10000)`. Refuse to build a swap with no slippage bound.
- Build router calldata (`swapExactTokensForTokens`/`exactInputSingle`), wrap it in
  `treasury.executeCall(tokenIn, router, amountIn, swapData)`.

## Why it scores

- **Originality through composition** (oracle + DEX + policy), not a single call.
- **Clear economic value** — trading/treasury management is obviously useful.
- **Deep Pharos integration** — uses oracle + DEX infra most entrants ignore.
- **Phase 2 cascade** — becomes a "DeFi Agent" directly in the Agent Arena.

## Build plan

1. Rule compiler + validator (struct only).
2. Oracle adapters (Chainlink first; Supra optional).
3. Quoter + slippage + router calldata builder.
4. Treasury + Shield integration (reuse skills #1, #2).
5. `eval` / `run` / `watch` CLI. `watch` can run under the `/loop` or a cron for continuous mode.
6. Demo.

## Demo

1. Seed a small Uniswap-style pool on Atlantic testnet (deploy via the official Foundry Uniswap
   example) so liquidity exists and prices are controllable.
2. Set a stop-loss: "sell WETH if it drops 10%."
3. Move the price (trade against the pool) to cross the threshold.
4. Agent reads the oracle/pool, detects the trigger, pre-flights via Shield, executes the sell via
   Treasury (policy-bounded). Show the swap tx on Pharosscan and the position closing.
5. Show that with the treasury daily cap, an oversized strategy order is clamped/blocked — autonomy
   with a seatbelt.

## Test matrix

| Case | Expected |
|------|----------|
| stale oracle (`updatedAt` old) | no trade, warn |
| rule not triggered | no-op |
| rule triggered, slippage ok | swap executes via treasury |
| slippage exceeded at execution | revert / abort (minAmountOut) |
| order exceeds treasury daily cap | blocked by policy |

## Notes for the scanner

No keys in code; execution is delegated to treasury (auditable policy). Document the oracle-freshness
and slippage guards explicitly — they are the safety story reviewers will look for in a trading skill.
