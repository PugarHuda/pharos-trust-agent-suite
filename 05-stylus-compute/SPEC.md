# stylus-compute — Technical Specification

## Problem

Some computations agents need are **verifiable but heavy**: ZK proof verification, ML scoring,
signature batches, simulation. In Solidity these are either impossible or cost so much gas that they're
useless to an autonomous agent. Most chains force you off-chain (losing verifiability) or to a separate
coprocessor. Pharos's dual-VM (EVM + WASM/Stylus) lets the heavy part run in Rust/WASM and be called
from EVM context — verifiable *and* affordable.

## Solution

A skill that scaffolds, deploys, and invokes **Stylus (Rust → WASM) contracts** for heavy compute, and
exposes a clean EVM-callable interface so other skills can consume the results. The headline framing:
*"the compute an agent couldn't afford anywhere else, on-chain and verifiable, only on Pharos."*

## Why it scores

- **Maximum originality** — a genuinely Pharos-exclusive capability; near-zero competing entries.
- **Technical depth** — using a chain's unique feature is exactly what ecosystem judges reward; it
  doubles as validation of Pharos itself.
- **Vision alignment** — Pharos docs explicitly cite heterogeneous computation (ZKML, AI models) as a
  core thesis; this realizes it.

Tradeoff to acknowledge: narrower agent use case and Rust required. Mitigate by shipping one concrete,
compelling workload end to end rather than a generic framework.

## Architecture (EVM ↔ WASM)

```
   EVM skill / agent                Stylus (Rust/WASM) contract
        │  eth_call(verify, proof)          │
        ▼                                    ▼
  ┌──────────────┐   cross-VM call    ┌────────────────────────┐
  │ EVM context  │ ─────────────────► │ heavy compute in WASM  │
  │ (Solidity/   │ ◄───────────────── │ (verifier / ML / math) │
  │  cast/viem)  │     result          └────────────────────────┘
  └──────────────┘
```

Use the official Pharos interop pattern (the docs have an "EVM-WASM: call EVM from WASM" example;
the reverse direction — EVM calling the Stylus contract — is a standard external call to the deployed
Stylus address with a matching ABI). Tooling: `pharos-cargo-stylus`, `pharos-stylus-sdk-rs`,
`stylus-hello-world` starter.

## Candidate workload (pick ONE and finish it)

| Workload | Why compelling | Difficulty |
|----------|----------------|-----------|
| **Groth16 verifier** | classic "too expensive in Solidity", clearly verifiable | medium-high |
| **Small ML classifier** (e.g. logistic regression / tiny decision tree scoring an agent action) | ties AI + on-chain narrative perfectly | medium |
| **Batch ECDSA/BLS verify** | useful primitive for agent attestations | medium |
| **Monte-Carlo / pricing sim** | shows raw compute headroom | low-medium |

Recommended for the agent narrative: the **ML classifier** — "the agent's decision is computed and
verifiable on-chain" — or the **Groth16 verifier** if you want the strongest "impossible in Solidity"
contrast.

## Build plan

1. `cargo stylus new` from the Pharos Stylus SDK; implement the chosen workload in Rust.
2. `cargo stylus deploy` to Atlantic testnet; record the address.
3. Write a tiny EVM-side ABI + `cast`/viem wrapper to call it (`compute verify ...`).
4. Demonstrate consumption from another skill (gate a treasury spend on the result).
5. Optional: list it on a2a-mesh as verification-as-a-service.

## Demo

1. Show the same workload attempted in Solidity → out-of-gas / absurd cost (or just explain the gas
   math) versus the Stylus contract running it cheaply. Show the Stylus deploy + call tx on Pharosscan.
2. Wire it to a real agent decision: "the agent will only release funds if this ZK proof of reserves
   verifies" → run `compute verify` → on success, treasury releases (policy-bounded). 

A verifiable, heavy, on-chain computation gating a real on-chain action — something the judges can't
see on any other EVM chain.

## Notes for the scanner

Deployments use `$PRIVATE_KEY` via env only. Compute calls are read-only where possible. Treat
externally supplied proofs/model inputs as untrusted and validate lengths/shapes before passing to the
Stylus contract. No keys in code, no opaque network calls.
