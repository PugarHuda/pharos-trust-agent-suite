# Pharos Trust-First Agent Suite — Skill Hackathon (Phase 1)

Five composable Skills for the **Pharos Skill-to-Agent Dual Cascade Hackathon**, built in the
official Pharos Skill format (`SKILL.md` + `references/` + `assets/`). The suite is designed as a
**trust layer for the Pharos agent economy**: the things every other agent needs but few will build.

> Hackathon: Skill-to-Agent Dual Cascade (Phase 1) · Prize pool 50,000 PROS (Phase 1: 20,000 PROS / 40 winners)
> Network: Pharos Atlantic Testnet (chainId **688689**) · Submission deadline **2026-06-15**

## Status: all five skills implemented · 110 passing tests

| # | Skill | One-liner | Status | Tests |
|---|-------|-----------|--------|-------|
| 1 | **agent-treasury** | Smart-account wallet with on-chain spending policy, session keys, kill-switch | Contract compiles; CLI on ethers; policy proven on in-memory EVM | 25 |
| 2 | **agent-shield** | Pre-flight security: simulate, balance-diff, registry/poisoning verify, approval & skill scanning | Zero-dependency CLI; live-tested vs Atlantic RPC | 30 |
| 3 | **agent-strategy** | Autonomous DeFi: oracle read → rule DSL → policy-bounded swap, one NL instruction | Live Chainlink read on Atlantic; full evaluator | 25 |
| 4 | **a2a-mesh** | Agent-to-agent discovery + x402 payment + payment-gated on-chain reputation | Two contracts compile; anti-sybil core tested | 15 |
| 5 | **stylus-compute** | Rust/WASM risk classifier gating a treasury spend, with a bit-identical verifiable JS reference | Source + JS reference + CLI done (WASM deploy pending a build host) | 15 |

A multi-agent adversarial QA pass hardened every skill against real findings — see [`QA.md`](QA.md).

### Live on Atlantic testnet (full details + tx hashes in [`DEPLOYMENTS.md`](DEPLOYMENTS.md))

| Contract | Address |
|----------|---------|
| AgentTreasury | [`0xDea6Da93265871d828B20cace2BADd5F5e70209d`](https://atlantic.pharosscan.xyz/address/0xDea6Da93265871d828B20cace2BADd5F5e70209d) |
| ServiceRegistry | [`0xE92254E3722D190ffC77C0aCa6856610708b9246`](https://atlantic.pharosscan.xyz/address/0xE92254E3722D190ffC77C0aCa6856610708b9246) |
| Reputation | [`0xE9DC8a36e8f14c85E687eEe26978692dA98cbeab`](https://atlantic.pharosscan.xyz/address/0xE9DC8a36e8f14c85E687eEe26978692dA98cbeab) |

Proven on-chain: treasury policy config + a **blocked** out-of-policy spend; a full A2A
discover → pay → rate flow where a **non-payer's rating was rejected**; and a live Chainlink
oracle read driving a strategy decision.

Each skill is a standalone Node package: `npm install && npm test`. No skill hardcodes a key or a
network — keys come from env vars, networks from `assets/networks.json`. See `DEPLOY.md` for putting
contracts on-chain and `DEMO.md` for the demo-video script.

### How they compose (the differentiator)

```
agent-strategy ──pre-flight──► agent-shield ──gate──► agent-treasury ──executeCall──► DEX / x402 / peer
                                                  ▲                         │
stylus-compute ──risk score gates a spend─────────┘        a2a-mesh ───routes payment through treasury
```

`agent-treasury spend` literally shells out to `agent-shield verify-address` + simulates before
broadcasting; `agent-strategy plan` emits `treasury.executeCall` calldata; `stylus-compute` gates a
spend on an on-chain risk score; `a2a-mesh` routes x402 settlement through the treasury policy. The
composition is wired in code, not just described.

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
├── DEPLOY.md                  ← faucet → deploy → record addresses
└── DEMO.md                    ← demo-video script
```

## Quick start (any skill)

```bash
cd 02-agent-shield && npm install && npm test     # 20 tests, no network
cd ../01-agent-treasury && npm install && npm run build && npm test
cd ../03-agent-strategy && npm install && npm test
cd ../04-a2a-mesh && npm install && npm run build && npm test
cd ../05-stylus-compute && npm install && npm test
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
