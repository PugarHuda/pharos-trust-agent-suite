# Reference: Policy & Session Management

All owner operations. Require `$OWNER_PRIVATE_KEY`. Network defaults to Atlantic testnet (688689).

## Mental model

A policy is three lists plus a kill-switch:
- **Token caps** — `dailyCap[token]`. A token with cap 0 is not spendable. The cap is a *per-UTC-day*
  ceiling that auto-resets at the day boundary (`block.timestamp / 1 days`).
- **Contract allowlist** — `allowedContract[target]`. The agent may only send/transfer to these.
- **Sessions** — `sessions[key]{budgetRemaining, expiry, active}`. Each session key (an agent address)
  has a total budget and an expiry. Budget is consumed across spends; expiry is absolute unix seconds.

A spend succeeds only if **all** hold: not killed, session active & unexpired, amount ≤ session budget,
token cap > 0, destination allow-listed, amount ≤ today's remaining cap.

## Operations

```bash
# Allow USDC with a 10 USDC/day cap (USDC has 6 decimals -> 10_000000)
cast send $TREASURY "setPolicy(address,uint256)" $USDC 10000000 \
  --rpc-url $RPC --private-key $OWNER_PRIVATE_KEY --gas-limit 120000

# Allow a destination contract (e.g. x402 facilitator or DEX router)
cast send $TREASURY "setAllowedContract(address,bool)" $TARGET true \
  --rpc-url $RPC --private-key $OWNER_PRIVATE_KEY --gas-limit 80000

# Grant a session: 5 USDC budget, expires in 7 days (compute expiry off-chain)
cast send $TREASURY "grantSession(address,uint96,uint48)" $AGENT 5000000 $EXPIRY \
  --rpc-url $RPC --private-key $OWNER_PRIVATE_KEY --gas-limit 120000

# Revoke a session immediately
cast send $TREASURY "revokeSession(address)" $AGENT \
  --rpc-url $RPC --private-key $OWNER_PRIVATE_KEY --gas-limit 80000

# Emergency stop / resume
cast send $TREASURY "setKilled(bool)" true \
  --rpc-url $RPC --private-key $OWNER_PRIVATE_KEY --gas-limit 60000
```

## Choosing limits

- Set the **session budget** below the *cumulative* you trust the agent with over the whole period;
  set the **daily cap** below the most you'd tolerate losing in a single day. They compound: worst-case
  loss before you react ≈ min(remaining session budget, today's remaining cap).
- Keep the contract allowlist tight. The agent's flexibility comes from *which* allow-listed contracts
  it composes, not from being able to reach arbitrary addresses.
