# Submission Guide — Skill-to-Agent Dual Cascade Hackathon (Phase 1)

Everything needed to submit, plus a ready-to-paste writeup. **Deadline: 2026-06-15 22:59** (page
header; body says submission by Jun 16, judging Jun 17–22).

## Pre-flight checklist

- [x] Public GitHub repo: https://github.com/PugarHuda/pharos-trust-agent-suite
- [x] 6 skills in official `SKILL.md` format, 132 passing tests, CI (`.github/workflows/test.yml`)
- [x] On-chain proof on Atlantic (addresses + tx hashes in `DEPLOYMENTS.md`)
- [ ] **Demo video (REQUIRED)** — record per `DEMO.md` (contracts are live; film the real tx on Pharosscan)
- [ ] Submit BUIDL on DoraHacks (link below)
- [ ] Register on Anvita Flow (flow.anvita.xyz)

## 1. Demo video (the one hard requirement left)

Follow `DEMO.md`. Fastest path now that everything is live:
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

> **Pharos Trust-First Agent Suite** — six composable Skills that form the trust & infrastructure layer
> for the Pharos agent economy: the things every other agent needs but few build.
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
>    EIP-712 payer signature**, so a relayer can't fabricate reputation. *Live on Atlantic.*
> 5. **stylus-compute** — a Rust/WASM risk classifier that gates a treasury spend, with a bit-identical
>    JS reference so the on-chain result is independently verifiable.
> 6. **x402-facilitator** — a self-hostable x402 facilitator (verify + **gasless** EIP-3009 settle),
>    filling the gap that Pharos documents x402 but ships no public facilitator.
>
> The skills are wired together in code (strategy → shield → treasury; stylus gates a spend; mesh +
> x402 settle → reputation), 132 passing tests with CI, and real on-chain artifacts on Atlantic testnet
> (addresses + tx hashes in DEPLOYMENTS.md). Hardened across three adversarial QA rounds (see QA.md).
