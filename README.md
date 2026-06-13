# Pharos Trust-First Agent Suite — Skill Hackathon (Phase 1)

[![tests](https://github.com/PugarHuda/pharos-trust-agent-suite/actions/workflows/test.yml/badge.svg)](https://github.com/PugarHuda/pharos-trust-agent-suite/actions/workflows/test.yml)

Thirteen composable Skills for the **Pharos Skill-to-Agent Dual Cascade Hackathon**, built in the
official Pharos Skill format (`SKILL.md` + `references/` + `assets/`). The suite is designed as a
**trust layer for the Pharos agent economy**: the things every other agent needs but few will build.

> Hackathon: Skill-to-Agent Dual Cascade (Phase 1) · Prize pool 50,000 PROS (Phase 1: 20,000 PROS / 40 winners)
> Network: Pharos Atlantic Testnet (chainId **688689**) · Submission deadline **2026-06-17 17:00**

> 🖥️ **Live dashboard:** [`web/`](web/) — a zero-backend page that reads the deployed Atlantic
> contracts *in the browser*: run the Bazaar live, click the on-chain commerce loop, and play with the
> Stylus risk gate. `npx serve web` or deploy in one command (see [`web/README.md`](web/README.md)).

## Status: thirteen skills implemented · 236 passing tests

| # | Skill | One-liner | Status | Tests |
|---|-------|-----------|--------|-------|
| 1 | **agent-treasury** | Smart-account wallet with on-chain spending policy, session keys, kill-switch | Contract compiles; CLI on ethers; policy proven on in-memory EVM | 28 |
| 2 | **agent-shield** | Pre-flight security: simulate, balance-diff, registry/poisoning verify, approval & skill scanning | Zero-dependency CLI; live-tested vs Atlantic RPC | 30 |
| 3 | **agent-strategy** | Autonomous DeFi: oracle read → rule DSL → policy-bounded swap, one NL instruction | Live Chainlink read on Atlantic; full evaluator | 25 |
| 4 | **a2a-mesh** | Agent-to-agent discovery + x402 payment + payment-gated on-chain reputation (EIP-712 trustless, ERC-8004-aligned) | Contracts compile (mesh + ERC-8004 Identity/adapter); anti-sybil core tested | 26 |
| 5 | **stylus-compute** | Rust/WASM risk classifier gating a treasury spend, with a bit-identical verifiable JS reference | Source + JS reference + CLI done; WASM build via Docker/gnu | 15 |
| 6 | **x402-facilitator** | Self-hostable x402 facilitator (verify + gasless settle of EIP-3009 payments) — fills the missing-facilitator gap | verify/settle/server/CLI + a paid risk-score resource; tested | 26 |
| 7 | **agent-utils** | High-frequency read-only utilities (price, gas advisor, token info, balance, address-safety) — cheapest to adopt, most-called | Zero-key CLI; live-verified on Atlantic | 8 |
| 8 | **pharos-bazaar** | The discover→pay→rate marketplace hub composing mesh + x402; exports an x402-Bazaar / Agent.market-compatible catalog with on-chain reputation attached | Live discovery vs deployed mesh; ranking + export tested | 6 |
| 9 | **agent-escrow** | The "hire" primitive: lock funds for a job, release on approval / refund on timeout / arbiter split on dispute; jobId doubles as the mesh reputation ref | Contract live on Atlantic; full lifecycle proven on-chain | 23 |
| 10 | **agent-validation** | ERC-8004 Validation Registry: a validator agent posts a 0–100 verification score for another agent's work; completes the ERC-8004 trio | Contract live on Atlantic, wired to Identity Registry; real validation on-chain | 13 |
| 11 | **reputation-gate** | Makes reputation *economic*: a gate (ERC-8183 ReputationGateHook pattern) that only pays/funds a counterparty whose reputation + validation clear a threshold | Contract live on Atlantic; gated payment + composite trust proven on-chain | 10 |
| 12 | **intent-mandate** | A cryptographic leash (Google AP2-style Intent Mandate): a user signs an EIP-712 envelope (agent, cap, recipient, expiry); the agent cannot spend outside it | Contract live on Atlantic; signed-mandate spend proven on-chain | 14 |
| 13 | **agent-bond** | Sybil resistance via skin-in-the-game (ERC-8004-recommended stake/bond): agents lock a bond with an unbonding cooldown; consumers require a minimum | Contract live on Atlantic; bond + gated checks proven on-chain | 10 |

A multi-agent adversarial QA pass hardened every skill against real findings — see [`QA.md`](QA.md).

### Live on Atlantic testnet (full details + tx hashes in [`DEPLOYMENTS.md`](DEPLOYMENTS.md))

| Contract | Address |
|----------|---------|
| AgentTreasury | [`0x0954E50cBC85836C9E3FC6868d24b6118d974E9d`](https://atlantic.pharosscan.xyz/address/0x0954E50cBC85836C9E3FC6868d24b6118d974E9d) |
| ServiceRegistry | [`0xa4d6d9932B19f9B03D0439264F1188F39F8522f0`](https://atlantic.pharosscan.xyz/address/0xa4d6d9932B19f9B03D0439264F1188F39F8522f0) |
| Reputation | [`0x8010e567b6f68dcfD19312644F1c3E6249b43ef7`](https://atlantic.pharosscan.xyz/address/0x8010e567b6f68dcfD19312644F1c3E6249b43ef7) |
| Reputation8004Adapter (ERC-8004 read surface) | [`0x6B99B00BD52Bc134D5658745E64DF1938592e468`](https://atlantic.pharosscan.xyz/address/0x6B99B00BD52Bc134D5658745E64DF1938592e468) |
| IdentityRegistry8004 (ERC-8004 Identity) | [`0xa048D4F17282488B60D96E6FB01FbdA106F38B8A`](https://atlantic.pharosscan.xyz/address/0xa048D4F17282488B60D96E6FB01FbdA106F38B8A) |
| MockUSDC3009 (EIP-3009 settlement token) | [`0xBd80E06F0325C4758e06d8a9522588363C4c75a4`](https://atlantic.pharosscan.xyz/address/0xBd80E06F0325C4758e06d8a9522588363C4c75a4) |
| AgentEscrow (hire/escrow; full lifecycle on-chain) | [`0x5919e995b29Bf81B322171769C9e63c5964258A7`](https://atlantic.pharosscan.xyz/address/0x5919e995b29Bf81B322171769C9e63c5964258A7) |
| ValidationRegistry8004 (ERC-8004 Validation v2; real validation on-chain) | [`0xd3F1DEf0c294405Cbd02b8b84D1De861A8C058DC`](https://atlantic.pharosscan.xyz/address/0xd3F1DEf0c294405Cbd02b8b84D1De861A8C058DC) |
| ReputationGate (ERC-8183 hook v2; gated payment on-chain) | [`0x425d3F086D8e98B7462cc987ED9B1aF9F396608d`](https://atlantic.pharosscan.xyz/address/0x425d3F086D8e98B7462cc987ED9B1aF9F396608d) |
| IntentMandate (AP2-style signed spend envelope) | [`0x4Ca9b16E6a107717A7c68F615ca4D5EFE4F2Ee4a`](https://atlantic.pharosscan.xyz/address/0x4Ca9b16E6a107717A7c68F615ca4D5EFE4F2Ee4a) |
| AgentBond (staked sybil resistance) | [`0xC59113F22BE46624D8ceFC4A030bCC098a8953Af`](https://atlantic.pharosscan.xyz/address/0xC59113F22BE46624D8ceFC4A030bCC098a8953Af) |

Proven on-chain (tx hashes in `DEPLOYMENTS.md`): a treasury **successful policy-allowed spend** *and* a
**blocked** out-of-policy spend (with on-chain cap/budget accounting); the **full agent-commerce loop** —
discover → **gasless x402 pay + settle** (EIP-3009 `transferWithAuthorization`) → record (payer EIP-712
signature) → rate (non-payer rejected) → on-chain reputation; an **ERC-8004 Identity** agent registered
and reputation readable via the standard `getSummary`; and a live Chainlink oracle read driving a strategy decision.

### What's real vs. fixture vs. pending (full transparency)

- **Real & live on Atlantic:** all 11 contracts above, the full x402→reputation loop, the full escrow
  lifecycle, a real ERC-8004 validation, a reputation-gated payment, a signed Intent Mandate spend, a
  staked bond, every read path.
  236 tests pass locally **and in CI** on a clean runner.
- **Test/demo fixtures (clearly labeled):** `MockERC20`, `MockUSDC3009` (an EIP-3009 token), `DrainRouter`
  exist only to exercise/demonstrate the real contracts — Atlantic has **no faucet** for a real EIP-3009
  USDC, so the live settle uses a deployed mock. Canonical Pharos token addresses are in every
  `assets/networks.json`. No skill ships stubbed or fake logic.
- **Documented-pending:** the `stylus-compute` **WASM artifact is not deployed** (an upstream
  `ruint`-vs-rustc toolchain deadlock — see `05-stylus-compute/SKILL.md`); the Rust source is complete and
  the algorithm is proven by the bit-identical, tested JS reference. The one piece not yet on-chain — disclosed, not faked.

Each skill is a standalone Node package: `npm install && npm test`. No skill hardcodes a key or a
network — keys come from env vars, networks from `assets/networks.json`. See `DEPLOY.md` for putting
contracts on-chain and `DEMO.md` for the demo-video script.

### How they compose (the differentiator)

```
agent-strategy ──pre-flight──► agent-shield ──gate──► agent-treasury ──executeCall──► DEX / x402 / peer
                                                  ▲                         │
stylus-compute ──risk score gates a spend─────────┘        a2a-mesh ───routes payment through treasury

pharos-bazaar: discover ──► agent-escrow: hire (lock) ──► deliver ──► release ──► a2a-mesh: rate
                                  (jobId === mesh reputation ref — a settled escrow mints reputation)
```

`agent-treasury spend` literally shells out to `agent-shield verify-address` + simulates before
broadcasting; `agent-strategy plan` emits `treasury.executeCall` calldata; `stylus-compute` gates a
spend on an on-chain risk score; `a2a-mesh` routes x402 settlement through the treasury policy;
`agent-escrow` uses its `jobId` as the `a2a-mesh` reputation `ref`, so a settled hire mints
payment-gated reputation; `agent-validation` validates that same `jobId`, so the hired work also gets an
independent ERC-8004 score; `reputation-gate` then makes that trust *economic* — `gatedPay` forwards
funds only to a counterparty whose reputation (and optionally validation) clears a threshold, the
ERC-8183 ReputationGateHook pattern. The composition is wired in code, not just described.

## Why this wins (strategy)

The hackathon's judging criteria reward **reusability, composability, security, and ecosystem
alignment**. Most participants will build *revenue* skills (paid APIs, swaps, transfers). The gap —
and the highest-leverage position — is the **trust and infrastructure layer** that those revenue
skills depend on:

- **Security is the rubric itself.** CertiK Skill Scanner is an official judging criterion and GoPlus
  (a security company) is a Builder Season sponsor. Skills #1 and #2 play directly on that field.
- **Composability is maximized.** Treasury, Shield, and the Mesh are *middleware* — every other
  team's skill becomes safer/more useful when routed through them. That is composability in its
  strongest form, not a checkbox.
- **Cascade into Phase 2.** Phase 1 skills become the raw material for Agents in the Agent Arena
  (25,000 PROS) plus the Agent/Caller Invocation Races. Skills that *other agents call* earn ongoing
  rewards — and a trust layer is a natural invocation hub.

If you submit only one: **agent-treasury** (it scores high on every criterion at once). If you submit
two as a "Trust Suite": **agent-treasury + agent-shield** (detection + enforcement).

### What sets this apart from the field

The most crowded category this round is agent "safety". Almost every such entry **returns advice** — a
score or an ALLOW/WARN/BLOCK verdict the agent is free to ignore. A jailbroken agent ignores advice.
This suite is different on six defensible axes:

| | Typical entry | This suite |
|---|---|---|
| **Safety mechanism** | advice / verdict (ignorable) | **on-chain enforcement** — `AgentTreasury` *reverts* an out-of-policy spend; proven by a live blocked tx |
| **Reputation** | self-reported or absent | **payment-gated, anti-sybil** — only the `(payer,ref)` who paid (EIP-712) can rate; non-payer reverts `NotPayer` |
| **The full discover→pay→settle→rate loop** | claimed or partial | **proven live, tx-by-tx** on Atlantic |
| **Scope** | one deep skill *or* many shallow ones | **8 composable skills, all tested** (breadth × depth) |
| **Tests / CI** | often none | **236 passing · green CI** on a clean runner |
| **Standards** | rarely | **ERC-8004 + x402 native**; score readable via `getSummary()` on-chain |

The one-liner for the submission: **the only entry that proves the entire agent-commerce loop on-chain,
with un-fakeable reputation, behind a trust layer that *enforces* rather than *advises* — thirteen
composable skills, 236 tests, eleven live contracts, and the only complete ERC-8004 + ERC-8183 + AP2 + x402 stack.**

## Repository layout

```
.
├── README.md                  ← this file
├── STRATEGY.md                ← judging-criteria deep dive + submission checklist
├── shared/
│   └── networks.json          ← canonical Pharos network + token + contract registry
├── 01-agent-treasury/
│   ├── SKILL.md               ← agent-facing skill (official format)
│   ├── SPEC.md                ← architecture, contracts, demo, build plan
│   ├── package.json           ← `npm test` runs the policy suite
│   ├── assets/networks.json
│   ├── contracts/             ← Solidity (AgentTreasury policy module)
│   ├── scripts/               ← compile.mjs + ethers CLI (treasury.mjs)
│   ├── artifacts/             ← compiled ABI + bytecode (committed)
│   ├── tests/                 ← in-memory EVM policy tests
│   └── references/            ← progressive-disclosure docs
├── 02-agent-shield/           ← zero-dependency security CLI + tests
├── 03-agent-strategy/         ← rule DSL + oracle + swap builder + tests
├── 04-a2a-mesh/               ← ServiceRegistry + Reputation contracts + CLI + tests
├── 05-stylus-compute/         ← Rust/WASM risk classifier + JS reference + CLI + tests
├── 06-x402-facilitator/       ← self-hostable x402 facilitator (verify + gasless settle) + tests
├── 07-agent-utils/            ← read-only utilities (price/gas/token/balance/address-safety) + tests
├── 08-pharos-bazaar/          ← discover→pay→rate marketplace hub (composes mesh + x402) + tests
├── 09-agent-escrow/           ← hire/escrow primitive (release/refund/arbiter) + live contract + tests
├── 10-agent-validation/       ← ERC-8004 Validation Registry (0–100 verdicts) + live contract + tests
├── 11-reputation-gate/        ← ERC-8183 ReputationGateHook: reputation-gated payments + live contract + tests
├── 12-intent-mandate/         ← AP2-style EIP-712 Intent Mandate (signed spend envelope) + live contract + tests
├── 13-agent-bond/             ← staked sybil resistance (registration bond + cooldown) + live contract + tests
├── DEPLOY.md                  ← faucet → deploy → record addresses
├── DEMO.md                    ← demo-video script
├── SUBMISSION.md              ← DoraHacks + Anvita submission guide
└── QA.md                      ← 3-round adversarial QA audit trail
```

> **Research-driven (Phase 2 positioning).** Skills 7–8 target the **Invocation Race** (rewards
> frequently-called skills): read-only utilities are the cheapest to adopt and most-called, and a
> reputation-ranked **Bazaar** is the hub every agent routes through — mirroring Coinbase's x402 Bazaar
> (100M+ agentic payments) on Pharos. The mesh reputation is aligned with **ERC-8004** (Trustless
> Agents), which standardizes agent identity/reputation and defers payment to x402 — exactly this
> suite's shape. See `04-a2a-mesh/references/erc-8004.md`.

## Quick start (any skill)

```bash
cd 02-agent-shield && npm install && npm test     # 20 tests, no network
cd ../01-agent-treasury && npm install && npm run build && npm test
cd ../03-agent-strategy && npm install && npm test
cd ../04-a2a-mesh && npm install && npm run build && npm test
cd ../05-stylus-compute && npm install && npm test
cd ../06-x402-facilitator && npm install && npm test
cd ../07-agent-utils && npm install && npm test
cd ../08-pharos-bazaar && npm install && npm test
cd ../09-agent-escrow && npm install && npm run build && npm test
cd ../10-agent-validation && npm install && npm run build && npm test
cd ../11-reputation-gate && npm install && npm run build && npm test
cd ../12-intent-mandate && npm install && npm run build && npm test
cd ../13-agent-bond && npm install && npm run build && npm test
```

## Canonical Pharos data used throughout

| | Atlantic Testnet | Pacific Mainnet |
|---|---|---|
| Chain ID | 688689 | 1672 |
| RPC | https://atlantic.dplabs-internal.com | https://rpc.pharos.xyz |
| Explorer | https://atlantic.pharosscan.xyz | https://www.pharosscan.xyz |
| Native token | PHRS | PROS |
| CAIP-2 | eip155:688689 | eip155:1672 |

Key contracts (testnet): EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`,
Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`,
Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`.

Tokens (testnet): USDC(6) `0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B`,
USDT(6) `0xE7E84B8B4f39C507499c40B4ac199B050e2882d5`,
WPHRS(18) `0x838800b758277CC111B2d48Ab01e5E164f8E9471`.

> **Gas quirk (applies to all skills):** Pharos charges by `gas_limit` at inclusion and refunds do
> not reduce the charge. Always set gas limit 10–20% above estimate or transactions can revert OOG.

See `STRATEGY.md` for the full judging-criteria mapping and submission checklist.
