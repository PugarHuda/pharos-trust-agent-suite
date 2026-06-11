# Strategy & Judging-Criteria Mapping

The official judging factors (from the hackathon page) and how this suite is engineered to score on
each. Use this as the narrative backbone for the README, demo video, and DoraHacks writeup.

## Official judging factors → suite response

| Judging factor | How the suite answers it |
|----------------|--------------------------|
| Originality & creativity | Trust/infrastructure layer instead of yet-another revenue skill. Stylus-compute is a Pharos-exclusive capability nobody else can copy. |
| Technical quality & completeness | Every skill targets real Atlantic testnet (688689), follows the official SKILL.md + references/ + assets/ layout, and ships a runnable demo with on-chain tx hashes. |
| Practical use case for AI agents | "Can an agent safely hold and spend money?" is the #1 unsolved problem of the agent economy — Treasury + Shield answer it head-on. |
| Reusability & composability | Treasury, Shield, and Mesh are middleware: other teams' skills route through them. Networks are parameterized via assets/networks.json, never hardcoded. |
| Successful deployment on Pharos | On-chain artifacts: Treasury account factory + policy module, Shield honeypot/drainer demo, Strategy swap, Mesh registry + reputation, Stylus WASM contract — all with Pharosscan links. |
| UX & documentation | Each SKILL.md has explicit trigger phrases, example prompts, a pre-execution checklist, and troubleshooting. |
| Alignment with Pharos AI Agent & on-chain economy vision | Payments (x402/PROS), A2A collaboration (Mesh), agent safety (Treasury/Shield), heterogeneous compute (Stylus) — the exact pillars Pharos and Anvita Flow describe. |

## Security posture (CertiK Skill Scanner readiness)

CertiK Skill Scanner produces a 0–100 score with pass/warn/fail and graded findings; it does static
analysis **and** runtime behavior evaluation, targeting hidden malicious behavior, unauthorized data
access, and uncontrolled autonomous execution. Every skill here is built to pass cleanly:

- **No private keys in code, ever.** Keys arrive via `--private-key` or `$PRIVATE_KEY` only; never
  logged, never committed. `.env` is gitignored.
- **Testnet by default.** Mainnet (chainId 1672) requires an explicit, separate confirmation.
- **Write operations gated.** Pre-execution checklist: confirm key present → derive address → show
  target network → balance check → human-readable simulation → explicit approval.
- **Documented permission model.** Each SKILL.md states what the skill reads, what it signs, and when
  it requires approval — the transparency CertiK scoring rewards.
- **No `curl | bash`, no data exfiltration, no opaque network calls.** External calls (oracles, x402,
  GoPlus) are explicit, optional, and degrade gracefully to local-only logic.

Treasury and Shield go further: Treasury enforces limits **on-chain** (a jailbroken prompt still
can't exceed the policy), and Shield is **100% read-only** (it never holds a key or signs anything),
so both should score near the top of the scanner.

## Submission checklist (per skill)

1. Public GitHub repo with official skill layout (`SKILL.md` + `references/` + `assets/`).
2. Demo video (required) — show an agent (Claude Code / OpenCode, frameworks Anvita Flow supports)
   actually invoking the skill end to end.
3. On-chain proof on Atlantic testnet with clickable Pharosscan links in the README.
4. Security pass: assume CertiK will scan it — no keys, gated writes, documented permissions.
5. Register the skill/agent on Anvita Flow (flow.anvita.xyz) per Phase 1 instructions.
6. Confirm exact submission spec in the dev Telegram (Anvita may provide a template/registry not
   published in the docs).

## Demo-video script template (90 seconds)

1. **0–10s** — One sentence: what the skill does and the agent-economy problem it solves.
2. **10–40s** — Live: an agent receives a natural-language instruction and invokes the skill.
3. **40–70s** — The on-chain effect: show the tx on Pharosscan; for Treasury/Shield show the *blocked*
   case (revert / warning) — the safety story is the differentiator.
4. **70–90s** — Composability: show another skill calling this one, and the Phase 2 / Invocation Race
   angle (other agents will call it).

## Build order recommendation

1. `shared/networks.json` (done) — single source of truth.
2. **agent-shield** first (read-only, lowest risk, fastest to a working demo, de-risks everything else).
3. **agent-treasury** (the flagship; Shield plugs into its pre-flight).
4. **agent-strategy** (composes oracle + Treasury + swap).
5. **a2a-mesh** (composes x402 + reputation; ties the suite to Anvita's A2A vision).
6. **stylus-compute** (highest-risk/highest-originality; do last, ship even a minimal version).
