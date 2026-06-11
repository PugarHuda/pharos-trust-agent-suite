# Reference: Rule DSL & Oracle Reads

## Compiling a mandate

Parse natural language into a validated struct; only the struct executes.

```jsonc
// "sell WETH if it drops 10% from here, 0.5% slippage"
{
  "kind": "stop-loss",
  "asset": "WETH",
  "quote": "USDC",
  "dropPct": 10,
  "referencePrice": null,   // set to current price at arm time
  "slippageBps": 50
}
```

Reject any struct missing slippage, with an unknown token, or with nonsensical params. Echo the parsed
struct back to the user for confirmation before arming.

## Reading a Chainlink feed

```bash
cast call $FEED "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url $RPC
# returns: roundId, answer, startedAt, updatedAt, answeredInRound
```

Guards before using `answer`:
- `answer > 0`
- `now - updatedAt <= maxOracleStalenessSeconds` (else treat as stale → do not trade)
- `answeredInRound >= roundId`

Scale `answer` by the feed's `decimals()` to get a human price.

## Reading pool reserves / quoting (Uniswap-style)

```bash
# v2-style quote
cast call $ROUTER "getAmountsOut(uint256,address[])(uint256[])" $AMOUNT_IN "[$TOKEN_IN,$TOKEN_OUT]" --rpc-url $RPC
```

`minAmountOut = amountsOut[last] * (10000 - slippageBps) / 10000`.

## Building the swap (routed through treasury)

```bash
DEADLINE=$(($(date +%s) + 600))
SWAPDATA=$(cast calldata "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)" \
  $AMOUNT_IN $MIN_OUT "[$TOKEN_IN,$TOKEN_OUT]" $TREASURY $DEADLINE)

# Pre-flight via shield, then execute via treasury (policy-bounded)
shield check-tx --from $TREASURY --to $ROUTER --data $SWAPDATA --rpc-url $RPC
cast send $TREASURY "executeCall(address,address,uint256,bytes)" $TOKEN_IN $ROUTER $AMOUNT_IN $SWAPDATA \
  --rpc-url $RPC --private-key $SESSION_PRIVATE_KEY --gas-limit 500000
```

Note: the treasury must hold `tokenIn` and have approved the router (do the approval once, as an
allow-listed `executeCall` to `tokenIn.approve(router, exactAmount)` — never unlimited).
