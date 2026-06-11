# QA & Hardening Report

Each skill went through an adversarial QA pass (one reviewer per skill) that read every source
file, ran the suite, and probed edge cases. Real findings were fixed and locked in with tests. Test
count rose from **69 → 110**. This document is the audit trail.

## agent-treasury

| Severity | Finding | Fix |
|----------|---------|-----|
| **High** | `executeCall` debited `spendAmount` against the budget but never bound it to the actual token movement — an allow-listed target could move more than the accounted amount, making the budget *advisory*. | `executeCall` now snapshots `balanceOf(this)` before/after and reverts `SpendExceedsAccounted` if the call moved more `token` out than `spendAmount`. Approvals (0 movement) still pass. Proven by a dedicated drain-attempt test. |
| Medium | Session budget was a single number debited against *any* allow-listed token (a 5-USDC budget spendable as 5 WPHRS). | Sessions are now **bound to one token** (`grantSession(key, token, budget, expiry)`); a mismatched token reverts `SessionTokenMismatch`. |
| Medium | `ownerWithdraw` moved funds with no event; native PHRS sent to the treasury was stuck. | Added `OwnerWithdrew`/`NativeWithdrew` events and `ownerWithdrawNative`. |
| Medium | No zero-address checks (owner/token/target); `grantSession` accepted a past/zero expiry. | `ZeroAddress` guards on constructor/`setPolicy`/`grantSession`/`transferOwnership`; `BadExpiry` if expiry ≤ now. |
| Low | `parseAmount` silently truncated sub-decimal precision (e.g. `--daily-cap 0.0000001` rounded to 0, *disabling* the token); `parseExpiry` had an ambiguous bare-number-as-timestamp heuristic. | `parseAmount` rejects over-precision; `parseExpiry` uses explicit duration units + `@<ts>` for absolute timestamps. CLI-helper unit tests added. |

## agent-shield

| Severity | Finding | Fix |
|----------|---------|-----|
| **High** | `check-tx` never ran the approval guard — a real `approve(spender, MAX)` tx produced only an info line, so the headline "unlimited approval" detector silently did nothing on the most common input. | `check-tx` now decodes approval-shaped calls and runs the guard (`checkApprovalFromDecoded`). |
| High | Skill scanner missed `privateKey` (camelCase — the dominant ethers/viem form), `setApprovalForAll`, and Permit2's uint160-max "unlimited". | Broadened the key-token set (camelCase, raw `0x{64}`), added `setApprovalForAll` decoding + guard, and per-type "unlimited" ceilings (uint160 vs uint256). |
| Medium | Non-JSON RPC responses were reported as transaction *reverts*; an RPC failure on `getCode` crashed the command. | `rpc.mjs` raises a distinct transport error on non-JSON; `simulate.mjs` degrades gracefully on `getCode` failure. |
| Medium | Scanner evasions: `curl | sudo bash`, key split across lines from the network call. | Pipe-to-shell rule allows `sudo`/args/process-substitution; added a file-level taint rule (secret read **and** outbound call in the same file). Broader transports (sendBeacon/WebSocket/python requests). |
| Low (FP) | Leading-zero address prefixes (Permit2/EntryPoint) inflated poisoning matches; small uint amounts were mis-extracted as addresses. | Poisoning now requires ≥3 non-zero shared prefix chars; `extractAddresses` skips words with >30 leading zero nibbles. Honeypot reverse-check restricted to plain `transfer`. |
| Low | A partial custom `severityWeights` registry silently zeroed unspecified severities. | Weights merge over defaults. |

## agent-strategy

| Severity | Finding | Fix |
|----------|---------|-----|
| **High** | 18-decimal Pharos feeds lose precision: the raw int256 (BTC ≈ 6e22) exceeds `Number.MAX_SAFE_INTEGER`, so `Number(answer)/10**18` corrupts low digits. | `scalePrice` divides in BigInt to an exact 6-dp "micro" integer first, then to a float. |
| **High** | NL misparse: "every 2 months" collided with "minutes" (→ a 2-minute DCA); "0.5% slippage" was read as the stop-loss drop %; "$4,000" truncated to 4. | Full-word interval parser (months ≠ minutes, adds weekly; rejects unknown), slippage clause stripped before reading drop/band/price, comma-grouped numbers parsed, "percent" word + negative drops supported. |
| Medium | `applySlippage` had no bounds — a zero quote yielded `minAmountOut = 0` (unbounded swap). | Asserts `quoteOut > 0` and `0 < slippageBps ≤ 10000`. |
| Medium | `buildSwapPlan`'s approve step double-wrapped `executeCall` confusingly and was untested. | Simplified to a direct `executeCall(tokenIn, tokenIn, 0, approve(...))`; clock-skew (negative oracle age) now rejected; added a live `quote` command (getAmountsOut) so `plan --quote-out` isn't a guess. |

## a2a-mesh

| Severity | Finding | Fix |
|----------|---------|-----|
| **High** | `recordPayment` blindly overwrote an existing ref, resetting `rated` → the recorder could let the same payer rate the same interaction repeatedly. | `recordPayment` reverts `AlreadyRecorded` on an existing ref. |
| **High (anti-sybil)** | No `payer != provider` check — a provider colluding with the recorder could self-pay and self-rate to fabricate reputation. | `SelfDeal` revert when `payer == provider`; `ZeroAddress` guard (a zero payer was permanently unrateable — the latent footgun the tests had sidestepped with `i+1`). |
| Medium | Past `PAIR_CAP`, the 11th rating still flipped `rated` and emitted `Rated` without counting → wasted gas and indexer over-count. | The 11th rating reverts `PairCapReached`, so every `Rated` event is one that counted. |
| Medium | `getActiveByTag` was an unbounded O(n) view → eth_call gas-cap DoS as a tag grows. | Added `tagCount` + paginated `getByTagPaged(tag, offset, limit)`. |
| Low | CLI `record-payment` passed addresses through unvalidated. | `isAddress` validation + a self-deal pre-check in the CLI. |
| Doc | SPEC claimed recency/volume weighting that `scoreOf` doesn't implement, and a stale `recordPayment` signature. | Score formula documented as it actually is (avg × confidence, capped); volume/recency weighting noted as roadmap. |

## stylus-compute

| Severity | Finding | Fix |
|----------|---------|-----|
| Medium | Rust accepted a wrong-length feature vector (silent `min()`) while JS threw — so `verify` couldn't cover off-length inputs and a short vector could pass the on-chain gate. | The Rust contract now `assert!`s exactly 4 features (reverts), matching the JS reference exactly. |
| Low | `toFixed` used float arithmetic, with rounding ambiguity at the 6-dp boundary — at odds with the "no floats near the contract" promise. | `toFixed` parses the decimal string directly (integer-only). |
| Doc | SKILL.md showed the example vector scoring `0.49…`; the true value is `0.647887`. | Corrected. |
| Test | The bit-identical claim lacked negative-z and fuzz coverage. | Added negative-z parity cases and a **1000-vector parity fuzz** (score() vs an independent integer reimplementation), plus a gate-boundary test. |

## Notes

- All findings above were verified and fixed against the in-memory EVM / live Atlantic RPC, then locked
  in with tests (now 110 total, all passing).
- The reviewers ran in a restricted permission mode and so reported via static analysis; every fix here
  was re-validated by actually running the code and the suite.
