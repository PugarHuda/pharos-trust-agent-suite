# Submission Guide — Skill-to-Agent Dual Cascade Hackathon (Phase 1)

Everything needed to submit, plus a ready-to-paste writeup. **Deadline EXTENDED: 2026-06-17 17:00**
(judging Jun 17–22). The only hard submission requirement is a GitHub link; a demo video is strongly
recommended (it's where the UX/clarity score is won).

## Pre-flight checklist

- [x] Public GitHub repo: https://github.com/PugarHuda/pharos-trust-agent-suite
- [x] 13 skills in official `SKILL.md` format, 236 passing tests, **green CI** (`.github/workflows/test.yml`)
- [x] On-chain proof on Atlantic incl. a **full gasless x402 → reputation loop**, a **full escrow lifecycle**, a **real ERC-8004 validation**, a **reputation-gated payment**, a **signed AP2-style Intent Mandate spend**, and a **staked bond** (addresses + tx in `DEPLOYMENTS.md`)
- [x] Live read-only **web dashboard + walkthrough** deployed on GitHub Pages → https://pugarhuda.github.io/pharos-trust-agent-suite/ (`/demo.html` for the narrated tour)
- [ ] **Demo video (strongly recommended)** — record per `DEMO.md` / `NARRATION.md` (contracts are live; film the real tx on Pharosscan), or screen-record the dashboard
- [ ] Submit BUIDL on DoraHacks (link below)
- [ ] Register on Anvita Flow (flow.anvita.xyz)

## 1. Demo video

**Easiest path — the interactive walkthrough is your video.** Open [`web/demo.html`](web/demo.html)
(deploy `web/` or `npx serve web`), press **▶ Play the walkthrough (with voice-over)**, and screen-record
the tab in one take (~3½ min). It auto-plays all 13 skills with synced captions, a moving pointer, real
browser voice-over, and real on-chain values + Pharosscan links — no manual typing, nothing can fail on
camera. Press **F** for fullscreen first. Upload to YouTube/Loom (unlisted is fine) and copy the link.

**One combined video — GitHub Actions → demo-combined.** Produces a single `pharos-combined.mp4`:
Part 1 the narrated (Piper voice-over) walkthrough, then Part 2 a real terminal running `node demo.mjs`
(all 13 skills live). The best single file to submit.

**Real terminal (most credible) — GitHub Actions → demo-terminal.** Records a genuine terminal *actually
running* `node demo.mjs`, which executes the read-only CLI of **all 13 skills live** against Atlantic.
Download the **pharos-terminal** artifact. (Run it yourself: `node demo.mjs`.)

**Fully automated narrated walkthrough — Playwright / GitHub Actions.** For a reproducible narrated video
with zero local setup: GitHub → **Actions → demo-video → Run workflow**; download the **pharos-demo**
artifact (`pharos-demo.mp4`, Piper voice-over).
Or locally: `cd video && npm install && npx playwright install chromium && npm run record`. (Playwright
video is silent — captions carry the narration; see `video/README.md`.)

**Alternative — live terminal.** Follow `DEMO.md` / `NARRATION.md`:
1. Screen-record a terminal + a Pharosscan tab.
2. Run the real CLIs against the deployed contracts (addresses in `DEPLOYMENTS.md`):
   - `treasury status` → `spend` (✅ allowed) then a blocked spend (❌ `ContractNotAllowed`).
   - `mesh discover` → `record-signed` → `rate`; show a non-payer rate rejected.
   - `strategy price --feed BTC/USD` (live oracle) → `eval`.
   - `shield scan-skill` on a malicious sample → FAIL.
3. Click each tx hash on Pharosscan on camera — the on-chain proof is the point.
4. Keep it 2–3 min. Upload to YouTube/Loom (unlisted is fine) and copy the link.

## 2. Submit on DoraHacks (the official channel)

1. Go to the hackathon page: **dorahacks.io/hackathon/pharos-phase1** (the "Pharos — Skill-to-Agent
   Dual Cascade" event). Log in / connect.
2. Click **Submit BUIDL** (or "Join → Submit"). Create a BUIDL if you don't have one.
3. Fill the BUIDL form:
   - **Name:** Pharos Trust-First Agent Suite
   - **GitHub:** https://github.com/PugarHuda/pharos-trust-agent-suite
   - **Demo video:** your video link (required)
   - **Description:** paste the writeup below.
   - **Tags:** Blockchain, AI, Agent, Onchain, AgentSkill, MCP
4. Attach the hackathon/BUIDL to the **pharos-phase1** event and **Submit**. Re-check it shows under
   the event's BUIDLs before the deadline.

## 3. Register on Anvita Flow

Open **flow.anvita.xyz**, sign in, and register the skills/agent per the Phase-1 instructions (the
Genesis Program application was already submitted; this is the skill/agent registration step). Use the
same repo link. Confirm any exact registry/template in the dev Telegram (t.me/+U27f5oGnJNlkZTI0).

---

## Ready-to-paste DoraHacks description

> **Pharos Trust-First Agent Suite** — thirteen composable Skills that form the trust & infrastructure
> layer for the Pharos agent economy: the things every other agent needs but few build.
>
> **What makes it different from the field:** the most crowded category this round is agent "safety", and
> almost every such entry *returns advice* — a score or ALLOW/WARN/BLOCK verdict the agent can ignore. A
> jailbroken agent ignores advice. This suite *enforces* on-chain: the treasury **reverts** an
> out-of-policy spend before it can broadcast, and reputation is **payment-gated** so it cannot be faked.
> It's the only entry that proves the *entire* agent-commerce loop on-chain — and it's thirteen
> composable skills, not one.
>
> 1. **agent-treasury** — a smart-account treasury that enforces a spending policy **on-chain** (daily
>    cap, token/contract allowlist, single-token session keys, kill-switch). A jailbroken agent still
>    can't exceed the policy. *Live; successful + blocked spends proven on Atlantic.*
> 2. **agent-shield** — zero-dependency, read-only pre-flight security: tx simulation, address-poisoning
>    & approval checks (incl. Permit2 / setApprovalForAll), and third-party skill scanning. The runtime
>    complement to CertiK's submission-time scanner.
> 3. **agent-strategy** — natural-language mandate → live Chainlink oracle read → policy-bounded swap
>    calldata (routed through treasury + shield).
> 4. **a2a-mesh** — agent discovery + payment-gated on-chain reputation. Recording is **trustless via an
>    EIP-712 payer signature**, so a relayer can't fabricate reputation. ERC-8004-aligned. *Live on Atlantic.*
> 5. **stylus-compute** — a Rust/WASM risk classifier that gates a treasury spend, with a bit-identical
>    JS reference so the on-chain result is independently verifiable.
> 6. **x402-facilitator** — a self-hostable x402 facilitator (verify + **gasless** EIP-3009 settle),
>    filling the gap that Pharos documents x402 but ships no public facilitator; incl. a paid risk-score API.
> 7. **agent-utils** — high-frequency read-only utilities (price, gas advisor, token info, balance,
>    address-safety) — the cheapest-to-adopt, most-called primitives, aimed at the Invocation Race.
> 8. **pharos-bazaar** — the discover→pay→rate marketplace hub composing mesh + x402 (Pharos's answer to
>    Coinbase's x402 Bazaar), reputation-ranked.
> 9. **agent-escrow** — the **"hire" primitive**: a client locks native funds for a job; settlement is by
>    code (release on approval / refund on timeout / arbiter split on dispute), all pull-payments, no
>    admin. The `jobId` doubles as the mesh reputation `ref`, so a settled hire mints un-fakeable
>    reputation. *Live on Atlantic; full lifecycle (release + dispute→resolve→withdraw) proven on-chain.*
> 10. **agent-validation** — the **ERC-8004 Validation Registry**: a validator agent posts an independent
>    0–100 score for another agent's work. This **completes the full ERC-8004 trio** (Identity +
>    Reputation + Validation). *Live on Atlantic, wired to the Identity Registry; a validator scored the
>    escrowed work 95/100 on-chain (the validated dataHash IS the live escrow jobId).*
> 11. **reputation-gate** — makes reputation **economic, not just informational**: an on-chain gate (the
>    **ERC-8183** ReputationGateHook pattern, live on Base from Virtuals + the Ethereum Foundation) that
>    forwards funds **only** to a counterparty whose reputation — and optionally an independent validation
>    of the specific work — clears a threshold. *Live; a gated payment succeeded, a 0-reputation address
>    is blocked, composite trust (reputation + validation) proven.*
> 12. **intent-mandate** — a cryptographic leash for agents, modeled on **Google's AP2** Intent Mandate: a
>    user signs an EIP-712 envelope (agent, cap, recipient, expiry) and the agent can spend their funds
>    ONLY inside it. *Live; a signed-mandate spend was enforced on-chain (over-spend/expiry/wrong-recipient
>    all revert).*
> 13. **agent-bond** — sybil resistance via skin-in-the-game (the **ERC-8004-recommended** registration
>    bond / minimum stake): agents lock a bond with an unbonding cooldown so consumers can require capital
>    at risk. *Live; bond + trust checks proven on-chain.*
>
> The skills are wired together in code, and proven on Atlantic with a **full agent-commerce loop** —
> discover → hire (escrow) → gasless x402 pay/settle → record → rate → on-chain reputation → ERC-8004
> validation → reputation-gated funding — plus an AP2-style signed-intent spend, a staked bond, and a
> treasury successful + blocked spend. It is the **only complete ERC-8004 + ERC-8183 + AP2 + x402 stack**
> in the field, and the only one where reputation actually gates money on-chain. **236 passing tests with
> green CI**; hardened across five adversarial QA rounds (see QA.md). A zero-backend **live web dashboard**
> (`web/`) reads the deployed contracts in-browser. Eleven contracts + all tx hashes in DEPLOYMENTS.md.
>
> **How to try it (judges):**
> - **Watch (0 setup):** open `web/demo.html` and press ▶ — a narrated, pointer-driven tour of all 13
>   skills with live on-chain values. (Or the combined video linked above.)
> - **Verify it's real (0 setup):** every contract + transaction is a clickable Pharosscan link in
>   `DEPLOYMENTS.md`; tests run on every push (green CI).
> - **Run all 13 skills live (Node 18+, read-only, no keys):** `node setup.mjs` then `node demo.mjs`.
> - **Test any skill offline:** `cd 02-agent-shield && npm install && npm test` (236 tests total).
>
> Repo: https://github.com/PugarHuda/pharos-trust-agent-suite
