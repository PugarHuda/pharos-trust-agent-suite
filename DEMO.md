# Demo-Video Script

A demo video is **required** for the DoraHacks submission. The safety story is the differentiator, so
the *blocked* cases are the money shots — show a guardrail a jailbroken prompt cannot bypass, proven
on-chain.

You can submit one ~2-minute video for the flagship pair (**treasury + shield**), or a ~3-minute video
covering the full Trust Suite. Both scripts below.

---

## Option A — Flagship (90–120s): "Can an agent safely hold and spend money?"

**0–10s — The problem.** "Prompt rules like *don't spend more than $10* aren't a security boundary — a
jailbroken agent ignores them. The boundary has to live on-chain." Show the README title.

**10–35s — Set up the guardrail.** Terminal:
```
node scripts/treasury.mjs deploy
node scripts/treasury.mjs set-policy --treasury 0xT --token USDC --daily-cap 10
node scripts/treasury.mjs grant-session --treasury 0xT --key 0xSESSION --token USDC --budget 5 --expires 7d
```
Show the deploy tx on Pharosscan.

**35–60s — Normal operation.** A legitimate spend within policy:
```
node scripts/treasury.mjs spend --treasury 0xT --token USDC --to 0xALLOWED --amount 1
```
Point out the **shield pre-flight** lines (registry check + simulation OK), then the confirmed tx on
Pharosscan.

**60–90s — The attack is blocked.** Simulate a jailbroken agent trying to drain to an attacker:
```
node scripts/treasury.mjs spend --treasury 0xT --token USDC --to 0xATTACKER --amount 50
```
→ shield pre-flight prints **REVERT → ContractNotAllowed**, the spend is blocked before broadcast. Then
hit the kill-switch:
```
node scripts/treasury.mjs kill --treasury 0xT
```
"Even a fully compromised agent can't exceed the policy — the limit is in the contract, not the prompt."

**90–120s — Composability.** One line: "Shield, treasury, strategy, mesh, and a Stylus risk model all
compose — every other agent's skill becomes safer routed through this trust layer. That's the Phase 2
Agent Arena and the Invocation Race angle."

---

## Option B — Full Trust Suite (~3 min)

1. **(0–20s) Framing** — most entrants build revenue skills (swaps, transfers). We built the **trust and
   infrastructure layer** those depend on: detection (shield), enforcement (treasury), autonomy
   (strategy), a market (mesh), and Pharos-exclusive verifiable compute (stylus).

2. **(20–50s) shield** — `verify-address` recognizes official USDC; feed it a poisoned look-alike →
   **FAIL (address poisoning)**; `scan-skill` on a malicious skill → **FAIL (private key → network
   call)**. 100% read-only, zero npm dependencies → clean CertiK-style story.

3. **(50–95s) treasury** — deploy, set policy, grant a session key, one good spend (tx on Pharosscan),
   one policy-violating spend **blocked**, kill-switch. (Same as Option A's middle.)

4. **(95–135s) strategy** — `strategy price --feed BTC/USD` reads a **live Chainlink price on Atlantic**;
   `strategy eval` turns it into a SWAP/NOOP decision; `strategy plan` emits the `treasury.executeCall`
   calldata — autonomy with a seatbelt (the treasury cap clamps the order).

5. **(135–165s) a2a-mesh** — register two services, `discover` sorts by on-chain reputation; the payer
   rates a paid interaction and the score updates on-chain; an outsider who didn't pay tries to rate →
   **revert (NotPayer)**. Payment-gated reputation = anti-sybil.

6. **(165–180s) stylus-compute** — `compute gate --features 1,1,1,1` → **BLOCK**; explain the same
   fixed-point risk model runs as a Rust/WASM contract whose result `compute verify` confirms matches
   the JS reference exactly — verifiable heavy compute gating a treasury spend, only on Pharos.

**Close:** "Five composable skills, 69 passing tests, real Atlantic testnet integration — a trust layer
for the Pharos agent economy."

---

## Recording tips

- Pre-fund keys and pre-deploy contracts **before** recording so you only show the interesting calls.
- Keep a Pharosscan tab open; click each tx hash live — the on-chain proof is the point.
- For blocked cases, make the revert reason visible (the CLIs print it). That frame wins.
- Mention the numbers: 5 skills, 69 tests, live oracle read, on-chain policy enforcement.
