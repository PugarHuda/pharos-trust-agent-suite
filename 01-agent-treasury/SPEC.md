# agent-treasury — Technical Specification

## Problem

The single biggest blocker to a real agent economy is: **how do you give an AI agent money without
risking it draining the account?** Prompt-level rules ("don't spend more than $10") are not a security
boundary — they can be jailbroken, misread, or ignored. The boundary has to live where the agent
cannot reach it: **on-chain**.

## Solution

A smart-account treasury contract that enforces a spending **policy** in Solidity. The owner (human)
configures the policy with their key; the agent operates with a **session key** that is structurally
incapable of exceeding the policy. Even a fully compromised agent loses at most "today's remaining cap
within the session budget," and the owner can `revoke` or `kill` instantly.

## Architecture

```
        owner key (human)                          session key (agent)
              │                                            │
   setPolicy / grantSession / kill              spendToken / executeCall
              │                                            │
              ▼                                            ▼
        ┌───────────────────────── AgentTreasury (on-chain) ─────────────────────────┐
        │  dailyCap[token]   allowedContract[target]   sessions[key]{budget, expiry}  │
        │  enforced on every spend: token allowed? dest allowed? cap ok? budget ok?   │
        └────────────────────────────────────────────────────────────────────────────┘
              │
              ▼  policy-checked ERC-20 transfer / arbitrary call
        destination (x402 facilitator, DEX router, another agent, ...)
```

The contract (`contracts/AgentTreasury.sol`) is intentionally dependency-light:

- **Owner ops:** `setPolicy(token, cap)`, `setAllowedContract(target, bool)`, `grantSession(key, budget, expiry)`,
  `revokeSession(key)`, `setKilled(bool)`, `transferOwnership`, `ownerWithdraw`.
- **Agent ops:** `spendToken(token, to, amount)` and `executeCall(token, target, spendAmount, data)` —
  both gated by: session active + not expired, session budget, token allowlist (`dailyCap > 0`),
  destination allowlist, and rolling per-day cap.
- **Views:** `remainingToday(token)`, public mappings for transparency.

### Two integration modes

1. **Standalone (recommended for the hackathon demo):** the session key signs an EOA transaction that
   calls `spendToken`/`executeCall`. Simple, no bundler needed, fully on-chain enforcement. Works
   today on Atlantic testnet.
2. **ERC-4337 mode (stretch):** wrap the policy in an account that implements `validateUserOp`, using
   Pharos canonical EntryPoint v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`). Since there is no
   documented public bundler on Pharos, self-bundle by calling `EntryPoint.handleOps` from a relayer
   EOA. Demonstrates depth; keep it optional so the core demo never depends on it.

> The standalone mode already delivers the full security story (on-chain policy enforcement). Lead the
> demo with it; mention 4337 mode as the production path.

## Why it scores on every judging criterion

- **Practical use case:** the defining problem of agent finance.
- **Composability:** strategy/mesh/x402 skills call `executeCall`, inheriting the policy for free.
- **On-chain deployment:** factory + policy contract + real testnet spends, all on Pharosscan.
- **Originality:** most entrants build transfer/swap skills; almost none build the *policy layer*.
- **Security (CertiK):** the headline feature *is* a guardrail; enforcement is on-chain, not prompt-level.

## Build plan

1. **Contracts** — `AgentTreasury.sol` (done). Add a tiny `AgentTreasuryFactory` (CREATE2 via the
   canonical Create2Deployer) so each agent gets a deterministic account address. Foundry tests for:
   cap rollover at day boundary, session expiry, disallowed token/contract revert, kill-switch.
2. **Skill CLI** (`scripts/`) — thin wrappers over `cast`/`forge`:
   - `deploy`, `set-policy`, `grant-session`, `spend`, `revoke`, `kill`, `status`.
   - Owner ops read `$OWNER_PRIVATE_KEY`; agent ops read `$SESSION_PRIVATE_KEY`.
   - Network from `assets/networks.json`; gas limit auto-bumped 15%.
3. **Shield hook** — before any `spend`, call agent-shield's simulate + balance-diff and print the
   result; require confirmation.
4. **Demo** — see below.

## Demo (the money shot)

1. Deploy a treasury, fund it with 20 testnet USDC.
2. Set policy: daily cap 10 USDC, allow USDC, allow the x402 facilitator + a DEX router only.
3. Grant the agent a 5 USDC / 7-day session key.
4. Agent pays 3 services via x402 (3 successful `executeCall`s) — show tx hashes on Pharosscan.
5. Agent (prompt-jailbroken on camera) tries to send 50 USDC to an attacker address →
   **transaction reverts** (`ContractNotAllowed` / `DailyCapExceeded`). Show the revert on Pharosscan.
6. Owner hits `kill`; show further spends revert.

The revert is the winning frame: a guardrail that a jailbroken prompt cannot bypass, proven on-chain.

## Foundry quickstart

```bash
forge init --force
# set Pharos testnet RPC in foundry.toml or pass --rpc-url
forge create contracts/AgentTreasury.sol:AgentTreasury \
  --rpc-url https://atlantic.dplabs-internal.com \
  --private-key $OWNER_PRIVATE_KEY \
  --constructor-args $OWNER_ADDRESS \
  --gas-limit 3000000   # ~15% headroom; Pharos charges by gas_limit
```

## Test matrix (Foundry)

| Test | Expectation |
|------|-------------|
| spend within cap & budget | success, balances move, events emitted |
| spend exceeding daily cap | revert DailyCapExceeded |
| spend to non-allowlisted contract | revert ContractNotAllowed |
| spend of non-allowlisted token | revert TokenNotAllowed |
| spend after session expiry | revert SessionExpired |
| spend exceeding session budget | revert SessionBudgetExceeded |
| spend while killed | revert Killed_ |
| day boundary rollover | cap resets next day |
| owner withdraw / revoke / kill | succeed for owner, revert for others |

## Security notes for the scanner

- Checks-effects-interactions ordering in `spendToken`/`executeCall` (state decremented before the
  external call) to avoid reentrancy on the spend path.
- No `delegatecall`, no `selfdestruct`, no key material in code.
- `executeCall` is powerful (arbitrary calldata) but doubly bounded by the destination allowlist and
  the token-denominated budget — document this clearly; it is the main thing a reviewer will probe.
