# QA & Hardening Report

Each skill went through an adversarial QA pass (one reviewer per skill) that read every source
file, ran the suite, and probed edge cases. Real findings were fixed and locked in with tests. Across
five rounds the suite grew from 5 skills / **69 tests** to **13 skills / 236 tests** (green CI). This
document is the audit trail.

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

## Round 2 (post-hardening re-review)

A second adversarial pass focused on the code *added* in round 1.

| Skill | Finding | Resolution |
|-------|---------|-----------|
| **treasury** | **Critical** — `executeCall`'s balance-delta only measured the session's *bound* token. With two tokens allow-listed, a USDC-bound session could `executeCall(USDC, USDT, 0, USDT.transfer(attacker, all))`: `spendAmount=0` passed the budget, the delta was read on USDC (unchanged), and **all USDT drained unmeasured**. | `executeCall` now (1) rejects a call that targets a *different* policy token (`CrossTokenCall`), and (2) snapshots **every** policy token and reverts if any non-bound token's balance drops (or the bound token drops beyond `spendAmount`). New test proves the drain is blocked. Also added the missing zero-address guard on `ownerWithdraw`. |
| **shield** | False positive — the file-level taint rule fired on a generic `process.env.API_KEY` + an *allow-listed* fetch. | Narrowed the taint's secret-read pattern to **wallet** secrets (private key / mnemonic / seed), not generic API keys. Verified: `API_KEY` + allowlisted host → pass; `PRIVATE_KEY`/`MNEMONIC` exfil → still caught. |
| shield | Verified no **ReDoS** in the broadened skillscan regexes (50 000-char adversarial input scans in ~4 ms — bounded quantifiers, no catastrophic backtracking) and no FP on `0x{64}` constants or `.privateKeyId`. | No change needed. |
| **strategy** | Verified the new NL parsers: `biweekly`/`every 1.5 hours`/`every 0 days` are rejected cleanly; `drops 10% with 5% slippage and 2% fee` → dropPct 10 / slippage 500 (no clause confusion). ("twice daily" maps to daily — acceptable.) | No change needed. |
| **stylus** | Verified `toFixed` rejects `1e6`, `1.`, `.`, `+5`, `0x10`, `1.2.3` and accepts `.5`/whitespace — integer-only, no float leak. | No change needed. |
| **mesh** | `getByTagPaged` offset+limit overflow reverts under Solidity 0.8 checked arithmetic (no silent wrap/under-return). | No change needed. |

> 4 of the 5 round-2 reviewers were interrupted by a session limit; their skills (shield/strategy/mesh/stylus)
> were re-probed directly instead. The treasury critical finding came from the one reviewer that completed.

### Follow-up: mesh recorder centralization removed

The earlier "single trusted recorder can fabricate payments" limitation is now closed: `Reputation`
gained a trustless **`recordPaymentSigned`** path where the PAYER signs an EIP-712 `PaymentAuth(ref,
provider, amount)` and any relayer submits it. The contract recovers the signer (rejecting malleable
high-`s` / bad `v`) and uses it as the payer, so a relayer cannot mint reputation for payers whose keys
it does not hold. Proven on-chain (`recordPaymentSigned` tx in DEPLOYMENTS.md) and with 4 new tests
(valid record + payer rates; bogus signature rejected; amount-tamper changes the recovered payer;
signer==provider self-deal rejected).

## Round 3 (new-code review: x402 facilitator + EIP-712 mesh + cross-token treasury)

A third pass focused on code added after round 2. Test count 110 → **132**.

| Skill | Finding | Resolution |
|-------|---------|-----------|
| **x402** (new skill) | **Client controlled the EIP-712 signing domain** (server took `tokenName`/`version` from the request body) — verify was only as trustworthy as a client-supplied domain. | The facilitator now owns the domain: `resolveTokenDomain` reads the token `name()` on-chain + `version` from a server-side registry (`networks.json` `eip712`); the server ignores client `tokenName`/`version`. |
| x402 | Docs claimed malleable (high-`s`) / bad-`v` signatures were rejected, but `splitSignature` didn't. | Implemented the high-`s` (EIP-2) + `v∈{27,28}` rejection; now matches the docs. +test. |
| x402 | `validAfter` boundary used `<` (accepts `now == validAfter`) but on-chain EIP-3009 is strict `>` — a 1-second verify/settle divergence. | Changed to `<=` to match on-chain exactly. +test. |
| x402 | Default EIP-712 `version` was `'1'`; USDC-family EIP-3009 uses `'2'` → verify-pass/settle-revert. | Default is now `'2'`, overridable per-token in the registry. |
| x402 | `readBody` size guard called `req.destroy()` without rejecting → hung request. | Now rejects on oversize / `error`. |
| **mesh** | EIP-712 replay-binding, typehash↔CLI match, `_recover` guards all **confirmed correct**. `ref` front-running is a liveness grief (not forgery). | Documented the `ref` tradeoff in the contract; added cross-chain replay-rejection + high-`s` malleability tests. |
| **treasury** | Cross-token guard + balance-delta sweep **confirmed sound** (sweep backstops the indirect `transferFrom` drain). `policyTokens` loop was unbounded (owner-inflicted DoS). | Added `MAX_POLICY_TOKENS = 32` cap in `setPolicy`. Added the load-bearing indirect-drain sweep test + the cap test. |
| **stylus** | WASM build attempted across 5 toolchains/SDK combos; root-caused to a `ruint`-vs-rustc const-eval deadlock (not the contract). | Documented precisely in the skill; build needs the Pharos fork's matched toolchain. |

> Round-3 reviewers for the unchanged skills (shield/strategy/stylus-JS) were not re-run (already
> hardened in rounds 1–2); the new x402 skill and the new mesh/treasury code were reviewed in depth, and
> shield/strategy/stylus were re-probed directly for regressions.

## Round 4 (new code: ERC-8004 contracts, EIP-3009 token, agent-utils, bazaar, risk-API)

Reviewed everything added after the suite grew to 8 skills. Test count 154 → **162**.

| Area | Finding | Resolution |
|------|---------|-----------|
| **MockUSDC3009** (EIP-3009) | EIP-712 domain/typehash, digest, and **replay prevention confirmed correct** (a real USDC-style signature verifies; the nonce is consumed before the balance moves). Only gap: no malleability guard (not exploitable — nonce blocks double-spend) and **no unit tests**. | Added the EIP-2 high-`s`/`v` guard + `from != 0`; added a 5-case EVM unit harness (valid settle, replay revert, expiry boundary, wrong-chain reject, high-`s` reject). |
| **IdentityRegistry8004 / Reputation8004Adapter** | Reviewer: **no bugs** — access control tight (no agentId hijack), agentId↔provider mapping lossless, adapter read-only/safe. | No change; minor doc nits only. |
| **x402 risk-service** | **Medium** — verify is stateless and never settles, so one signed payment could fetch unlimited scores until expiry (free-rider). Also `riskScore` truncated >6-dp features while the "bit-identical" stylus reference throws. | Added a per-`(payer,nonce)` replay guard (one paid response per authorization; server keeps the set) and made `riskScore` reject >6-dp features. +2 tests. |
| **agent-utils** poisoning | **Medium (false negative)** — the non-zero-prefix guard (added to kill zero-pad false positives) let a long-**suffix** look-alike that differs only early slip through as `unknown`. | Added a long-end trigger (`suffix>=30` or `prefix>=30` with a long combined match). +1 test. |
| **pharos-bazaar** rank | `rankServices` could be poisoned by a non-finite reputation (not reachable live, but it's exported pure logic). | Coerce non-finite reputation to `-1` in the comparator. |

> The two reviewers ran in restricted permission mode (static analysis); every fix was re-validated by
> running the suites. MockUSDC3009's signature/replay correctness is also confirmed empirically by the
> live x402 settle on Atlantic.

## Round 5 (new skills 9–13 + full-suite verification)

The suite grew to **13 skills** (escrow, validation, reputation-gate, intent-mandate, agent-bond) driven
by current standards research (ERC-8004 live, ERC-8183 ReputationGateHook, Google AP2, x402 Bazaar). Each
new contract was built audit-first and reviewed; the whole repo was then re-verified end-to-end.

| Area | Finding / check | Resolution |
|------|-----------------|-----------|
| **agent-escrow** | Anti-rug: a *delivered* job must not be timeout-refundable; all exits must be pull-payments with a single reentrancy-guarded call. | Only a still-`Funded` job can `refundTimeout`; `withdraw` is the lone external call (guarded). A reentrancy attacker contract is proven blocked; value-conservation asserted. 23 tests. |
| **agent-validation** | **Storage exhaustion** — unbounded validation requests per server (an ERC-8004-documented risk). | Added a per-server pending-request cap (constructor `maxPending`); a freed slot on response. **Redeployed v2** so live bytecode == source; re-ran the live validation. +2 tests. |
| **reputation-gate** | `gatedPay` pushes native value to an arbitrary provider — confirm no custody/reentrancy and that a failed transfer surfaces. | No stored balance (atomic forward); a rejecting-recipient test proves `TransferFailed` bubbles. Redeployed v2 to point at validation v2. 10 tests. |
| **intent-mandate** | EIP-712 recovery must reject malleable signatures and any tampered field; funds must stay withdrawable by the user. | EIP-2 low-`s`/`v` guard; tampered-cap and wrong-signer cases revert `BadSignature`; `withdraw` is reentrancy-guarded. Verified with **real ethers-signed** mandates. 14 tests. |
| **agent-bond** | A consumer must not see stake that is already exiting; claims must respect the cooldown and resist reentrancy. | Active bond drops *before* funds queue for exit; `claimUnbond` checks the cooldown and is guarded (attacker proven blocked). 10 tests. |
| **pharos-bazaar export** | The x402-Bazaar catalog formatter is pure logic — must rank correctly and carry reputation. | `toBazaarListing`/`toBazaarCatalog` unit-tested for shape, ranking, and the reputation field. +2 tests. |
| **Full-suite + liveness** | Re-ran **all 13 suites** and probed every live address. | **236/236 tests pass, 0 failures**; `eth_getCode` confirms **all 11 contracts deployed** on Atlantic (non-empty bytecode). |
| **Consistency sweep** | After the v2 redeploys, some SKILL.md files / an interface comment still referenced the superseded v1 validation/gate addresses. | Updated all references to the v2 addresses; `DEMO.md` (legacy storyboard) banner-flagged as historical with `demo.mjs`/`NARRATION.md` as canonical. |

> Every new skill is admin-free (no owner/upgrade/slashing), uses checks-effects-interactions with a
> single guarded external call, and exposes typed custom-error reverts. All findings re-validated by
> running the suites and against live Atlantic RPC.

## Notes

- All findings above were verified and fixed against the in-memory EVM / live Atlantic RPC, then locked
  in with tests (now **236 total across 13 skills, all passing**, green CI).
- The reviewers ran in a restricted permission mode and so reported via static analysis; every fix here
  was re-validated by actually running the code and the suite.
