# Demo-Video Script

> **⚠️ Canonical flow:** the up-to-date recording flow is **`node demo.mjs`** + word-for-word voice-over
> in **`NARRATION.md`** — covering all **13 skills, 236 tests, 11 live contracts**. The storyboards below
> are earlier long-form scripts (written when the suite was smaller); the numbers in them are historical.

> **One-command live driver:** `node demo.mjs` (from the repo root) runs the suite's real, read-only
> commands against the deployed Atlantic contracts in sequence with section headers, then prints the
> on-chain tx links for the full agent-commerce loop. Run it on screen and narrate — everything shown
> is live/real and safe (no writes, no keys). The scripts below are the longer-form storyboards.


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

**Close:** "Thirteen composable skills, 236 passing tests, real Atlantic testnet integration — a trust layer
for the Pharos agent economy."

---

## Recording tips

- Pre-fund keys and pre-deploy contracts **before** recording so you only show the interesting calls.
- Keep a Pharosscan tab open; click each tx hash live — the on-chain proof is the point.
- For blocked cases, make the revert reason visible (the CLIs print it). That frame wins.
- Mention the numbers: **13 skills, 236 tests, CI green, 11 live contracts on Atlantic**.

---

## Storyboard mapped to the LIVE artifacts (copy-paste, ~3 min)

All addresses/tx below are real and already on-chain (see `DEPLOYMENTS.md`). For the video you can
**click the existing tx hashes on Pharosscan** and run the read-only / blocked commands live (those
need no gas), so nothing can fail on camera. `.env` is already set for the funded test wallet.

**0:00–0:20 — Hook.** "Can an agent hold and spend money safely? Here's a trust layer for the Pharos
agent economy: 13 composable skills, 236 tests, live on testnet." Show README badges + the
`DEPLOYMENTS.md` address table.

**0:20–1:00 — agent-treasury (the guardrail).** Dir `01-agent-treasury`.
```
node scripts/treasury.mjs status --treasury 0x0954E50cBC85836C9E3FC6868d24b6118d974E9d --token 0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0
node scripts/treasury.mjs spend  --treasury 0x0954E50cBC85836C9E3FC6868d24b6118d974E9d --token 0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0 --to 0x000000000000000000000000000000000000dEaD --amount 1
```
The blocked spend prints `simulation: REVERT -> ContractNotAllowed` and refuses to broadcast. Then open
the **successful** spend already on-chain: pharosscan.xyz/tx/`0x1fcd2c629d0a805bed93d99edfc150d3afcf375f44157b7ee331329c49d50634`.
Line: "the limit lives in the contract, not the prompt — a jailbroken agent still can't exceed it."

**1:00–1:35 — agent-shield (detection).** Dir `02-agent-shield`.
```
node scripts/shield.mjs verify-address --address 0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B
node scripts/shield.mjs check-approval --token 0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B --spender 0x9999999999999999999999999999999999999999 --amount max
```
→ FAIL: unlimited approval to unverified spender. "Zero dependencies, 100% read-only — clean by
construction for the CertiK scanner."

**1:35–2:05 — a2a-mesh (trustless reputation).** Dir `04-a2a-mesh`.
```
node scripts/mesh.mjs discover --registry 0xa4d6d9932B19f9B03D0439264F1188F39F8522f0 --reputation 0x8010e567b6f68dcfD19312644F1c3E6249b43ef7 --tag price-feed
```
Shows the provider ranked by on-chain reputation 5/100. Open the live
`recordPaymentSigned` tx pharosscan.xyz/tx/`0x972295c47b832da56cebf7c4212510299074caac6703b0819c241a84a3abc565`
and the `rate` tx `0xcef892b3ae1604ffaa17369ed03d1ae4c7608c35ceec522329a74ab9fa530de9`. Line: "the
payer signs; a relayer can't fake reputation, and a non-payer's rating reverts."

**2:05–2:30 — agent-strategy (live oracle).** Dir `03-agent-strategy`.
```
node scripts/strategy.mjs price --feed BTC/USD
node scripts/strategy.mjs eval  --rule "sell WBTC when price > 60000" --feed BTC/USD
```
Live Chainlink price drives a SWAP/NOOP decision (routed through treasury + shield).

**2:30–2:55 — x402-facilitator + stylus-compute (the rails + verifiable compute).** Dir `06-x402-facilitator`:
`node scripts/x402.mjs pay ...` then `verify` → VALID (gasless agent payment). Dir `05-stylus-compute`:
`node scripts/compute.mjs gate --features 1,1,1,1` → BLOCK (the risk model that gates a treasury spend).

**2:55–3:00 — Close.** "Thirteen skills, wired together, 236 tests, green CI, real tx on Pharosscan — the
trust layer the agent economy needs. Cascades straight into the Agent Arena."

### Bonus segment — the full agent-commerce loop (all LIVE on Atlantic)

The strongest single frame: one continuous **discover → pay → settle → record → rate** loop, on-chain.
Open these tx on Pharosscan in sequence:
1. **discover/best** (read): `bazaar best --tag price-feed` picks the highest-reputation provider.
2. **gasless x402 settle**: pharosscan.xyz/tx/`0x873f98cf344dcffb8268fba0673933091be9805d4944c693616c433306a5225b`
   — the payer signed once (no gas); a relayer moved 0.001 USDC (EIP-3009 `transferWithAuthorization`).
3. **record the settlement in the mesh** (payer-signed): `0xbc8940027763de6d9a2d645d3188713609e1736bdcd8f15d600b4a75fcf49c0b`
4. **rate** (only the payer can): `0xc97221b6c1797be3b61986976b183d8522481f2ad1b86e92c73cd1c6689d5fb0` → provider reputation rises to **10/100**.
5. **ERC-8004 read**: the same score is readable through the standard `getSummary` interface at adapter
   `0x6B99B00BD52Bc134D5658745E64DF1938592e468`.
Line: "An agent found a service, paid for it gaslessly, and the payment minted real, un-fakeable
reputation — the agent economy in one transaction sequence, on Pharos."
