# agent-shield — Technical Specification

## Problem

Agents that hold funds are a honeypot magnet. The dominant failure mode of autonomous on-chain agents
is not bad math — it's being *tricked*: a honeypot token you can buy but never sell, a drainer contract
behind a friendly function name, an unlimited approval to a malicious router, an address-poisoned
recipient one character off from the real one, or a malicious third-party skill that exfiltrates a key.

CertiK's Skill Scanner solves this at **submission time** (audit). Nothing solves it at **execution
time** on the agent's side. Shield is that runtime gate.

## Solution

A read-only skill that, given a pending action, returns `pass | warn | fail` with graded findings —
the same shape as CertiK's output, so it slots naturally into the hackathon's security framing. Four
independent detectors; any `fail` blocks, any `warn` requires explicit human/agent confirmation.

## Detectors

### 1. Simulate & balance-diff
- Run the transaction via `eth_call` (or `cast run` for a full trace) against the current state.
- Compute token balance deltas for `from` across all involved tokens (parse Transfer logs from the
  trace, or pre/post `balanceOf`).
- **Red flags:** outflow with zero inflow on a "swap"/"buy"; inability to simulate a *sell* after a buy
  (honeypot heuristic — simulate the reverse path); revert-on-transfer tokens.

### 2. Registry verification
- `assets/registry.json` holds official Pharos token + canonical contract addresses (from the docs).
- For every address in the tx (`to`, token, spender, decoded params), classify: official / known /
  unknown. Flag **address poisoning**: an address that is a near-match (same prefix/suffix, different
  middle) to a registry address but not equal.

### 3. Approval guard
- Decode calldata. If selector is `approve(address,uint256)` or `Permit2` equivalents:
  - `amount == type(uint256).max` → high severity (unlimited).
  - spender not in registry/allowlist → high severity.
  - Recommend exact-amount approvals instead.

### 4. Skill scan (third-party skills)
- Static scan of a skill's `SKILL.md` + scripts for:
  - Key exfiltration: `$PRIVATE_KEY` / `$OWNER_PRIVATE_KEY` flowing into a URL, `curl`, or write to a
    remote endpoint.
  - `curl ... | bash`, `wget ... | sh`, base64-decoded eval, obfuscated payloads.
  - Network calls to non-allowlisted hosts.
  - Mismatch between declared permissions (frontmatter) and actual behavior.
- Output mirrors CertiK severity grading. This is explicitly a *lightweight runtime echo* of CertiK,
  not a replacement — state that in the README to avoid "you reinvented CertiK" pushback.

## Why it scores

- **Direct alignment with the rubric:** the official judging includes CertiK Skill Scanner and GoPlus
  sponsors Builder Season. A security skill speaks the judges' language.
- **Maximum composability:** middleware in front of every other skill (yours and competitors').
- **Top CertiK score by construction:** read-only, keyless, no exfiltration.
- **Great demo:** a live save-from-drainer is visceral and memorable.

## Build plan

1. **registry.json** — compile official Pharos addresses (tokens + canonical contracts) from the docs
   (already in `shared/networks.json`). Add a small allowlist of known-good DEX routers / facilitators.
2. **Detectors** — implement as small TypeScript (or Python) modules; each returns `Finding[]`.
   - simulate: viem `call` + trace parsing, or shell out to `cast run`.
   - registry: address normalization + Levenshtein-style near-match for poisoning.
   - approval: `viem` `decodeFunctionData` against a small ABI set.
   - skillscan: regex ruleset + optional tree-sitter for JS/TS.
3. **Aggregator** — combine findings → score (start at 100, subtract by severity) → verdict.
4. **CLI** — `check-tx`, `verify-address`, `check-approval`, `scan-skill`.
5. **GoPlus (optional)** — if GoPlus indexes Pharos, enrich token/contract checks; otherwise local-only.

## Demo (live save-from-drainer)

1. Deploy a **honeypot token** on Atlantic testnet (transfer reverts for non-owner) and a **drainer**
   contract with a friendly `claimReward()` that actually `transferFrom`s the caller's USDC.
2. Show a naive agent about to call `claimReward()` after granting approval → it would lose funds.
3. Run `shield check-approval` → **FAIL: unlimited approval to unverified spender**; run
   `shield check-tx` on the buy of the honeypot → **WARN: cannot simulate sell (honeypot)**.
4. Show the agent refusing to sign because Shield returned `fail`. Contrast: same flow without Shield
   loses the testnet USDC (show the drained tx on Pharosscan).

Two tx hashes side by side — drained vs. protected — is the proof.

## Test matrix

| Case | Expected verdict |
|------|------------------|
| transfer to official USDC | pass |
| transfer to poisoned look-alike address | fail (poisoning) |
| approve(router, max) to unknown spender | fail |
| approve(router, exact) to allow-listed router | pass |
| buy honeypot (sell simulation reverts) | warn/fail |
| skill that writes $PRIVATE_KEY to a URL | fail |
| benign skill (official x402) | pass |

## Notes for the scanner

Shield itself: no keys, no writes, no `child_process` beyond read-only `cast call`/`cast run`, no
outbound network except the user-supplied RPC and (optional, opt-in) GoPlus. Document this prominently.
