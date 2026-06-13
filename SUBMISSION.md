# Submission Guide — Skill-to-Agent Dual Cascade Hackathon (Phase 1)

Everything needed to submit, plus a ready-to-paste writeup. **Deadline EXTENDED: 2026-06-17 17:00**
(judging Jun 17–22). The only hard submission requirement is a GitHub link; a demo video is strongly
recommended (it's where the UX/clarity score is won).

## Pre-flight checklist

- [x] Public GitHub repo: https://github.com/PugarHuda/pharos-trust-agent-suite
- [x] 11 skills in official `SKILL.md` format, 208 passing tests, **green CI** (`.github/workflows/test.yml`)
- [x] On-chain proof on Atlantic incl. a **full gasless x402 → reputation loop**, a **full escrow lifecycle**, a **real ERC-8004 validation**, and a **reputation-gated payment** (addresses + tx in `DEPLOYMENTS.md`)
- [x] Live read-only **web dashboard** (`web/`) — reads the deployed contracts in-browser; deploy with `vercel --prod`
- [ ] **Demo video (strongly recommended)** — record per `DEMO.md` / `NARRATION.md` (contracts are live; film the real tx on Pharosscan), or screen-record the dashboard
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

> **Pharos Trust-First Agent Suite** — eleven composable Skills that form the trust & infrastructure
> layer for the Pharos agent economy: the things every other agent needs but few build.
>
> **What makes it different from the field:** the most crowded category this round is agent "safety", and
> almost every such entry *returns advice* — a score or ALLOW/WARN/BLOCK verdict the agent can ignore. A
> jailbroken agent ignores advice. This suite *enforces* on-chain: the treasury **reverts** an
> out-of-policy spend before it can broadcast, and reputation is **payment-gated** so it cannot be faked.
> It's the only entry that proves the *entire* agent-commerce loop on-chain — and it's nine composable
> skills, not one.
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
>    of the specific work — clears a threshold. *Live on Atlantic; a gated payment succeeded to a trusted
>    provider, a 0-reputation address is blocked, and composite trust (reputation + validation) is proven.*
>
> The skills are wired together in code, and proven on Atlantic with a **full agent-commerce loop** —
> discover → hire (escrow) → gasless x402 pay/settle → record → rate → on-chain reputation → ERC-8004
> validation → reputation-gated funding — plus a treasury successful + blocked spend. It is the **only
> complete ERC-8004 + ERC-8183 + x402 stack** in the field, and the only one where reputation actually
> gates money on-chain. **208 passing tests with green CI**; hardened across four adversarial QA rounds
> (see QA.md). A zero-backend **live web dashboard** (`web/`) reads the deployed contracts in-browser.
> Nine contracts + all tx hashes in DEPLOYMENTS.md.
