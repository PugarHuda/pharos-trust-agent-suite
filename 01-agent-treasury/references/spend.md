# Reference: Agent Spending & Status

Agent operations use `$SESSION_PRIVATE_KEY`. Read operations need no key.

## Direct token transfer (within policy)

```bash
# Agent pays 1 USDC to an allow-listed destination
cast send $TREASURY "spendToken(address,address,uint256)" $USDC $TO 1000000 \
  --rpc-url $RPC --private-key $SESSION_PRIVATE_KEY --gas-limit 150000
```

## Arbitrary call to an allow-listed contract (e.g. swap, x402 settle)

`executeCall(token, target, spendAmount, data)` accounts `spendAmount` of `token` against policy, then
forwards `data` to `target`. Use for approve+swap, x402 settlement, or any composed action.

```bash
DATA=$(cast calldata "settle(bytes)" $PAYLOAD)
cast send $TREASURY "executeCall(address,address,uint256,bytes)" $USDC $FACILITATOR 1000000 $DATA \
  --rpc-url $RPC --private-key $SESSION_PRIVATE_KEY --gas-limit 400000
```

## Always simulate first (agent-shield hook)

Before broadcasting, dry-run and show the balance diff:

```bash
cast call $TREASURY "executeCall(address,address,uint256,bytes)" $USDC $FACILITATOR 1000000 $DATA \
  --rpc-url $RPC --from $SESSION_ADDRESS
# If this reverts, the policy would block it — surface the reason to the user, do not broadcast.
```

## Status

```bash
# Remaining spend allowed for USDC today
cast call $TREASURY "remainingToday(address)(uint256)" $USDC --rpc-url $RPC

# Session state
cast call $TREASURY "sessions(address)(uint96,uint48,bool)" $AGENT --rpc-url $RPC

# Killed?
cast call $TREASURY "killed()(bool)" --rpc-url $RPC
```

## Reading reverts

The contract uses custom errors. A failed spend returns one of: `NotSession`, `SessionExpired`,
`SessionBudgetExceeded`, `TokenNotAllowed`, `ContractNotAllowed`, `DailyCapExceeded`, `Killed_`.
Decode and present in plain language, e.g. "Blocked: destination not on the allowlist."
