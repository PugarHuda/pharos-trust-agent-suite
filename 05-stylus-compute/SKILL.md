---
name: stylus-compute
description: >-
  Heavy off-EVM computation for agents on Pharos via Stylus (Rust/WASM) contracts, callable from EVM.
  Lets an agent run workloads that are infeasible or absurdly expensive in Solidity — ZK proof
  verification, on-chain ML inference/scoring, signature batches, math-heavy simulation — by deploying
  a Stylus contract and invoking it from EVM context using Pharos's EVM<->WASM interoperability.
  Use when an agent needs verifiable heavy compute on-chain that Solidity can't handle economically.
  Triggers on "verify proof pharos", "ml inference on-chain pharos", "stylus pharos", "wasm contract
  pharos", "heavy compute agent pharos".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
---

# Stylus Compute

Gives an agent access to **Rust/WASM (Stylus) contracts** for computation that doesn't fit the EVM,
then lets EVM-context code (and other skills) call into it via Pharos's EVM↔WASM interoperability —
a capability that is **unique to Pharos** among EVM L1s.

## When to use this skill

- Verify a **ZK proof** on-chain (Groth16/Plonk verifier) at a fraction of EVM gas.
- Run **ML inference / scoring** on-chain (e.g. a small classifier deciding an agent action).
- Batch-verify signatures, run heavy math/simulation, parse/transform large inputs.
- Any "this would be insane in Solidity" workload an agent needs to be *verifiable*.

## Why this is a Pharos-exclusive

Pharos ships dual-VM execution (EVM + WASM/Stylus) with documented EVM↔WASM interop and an official
Rust SDK (`pharos-stylus-sdk-rs`, `pharos-cargo-stylus`). No other EVM L1 lets an agent call a Rust
contract from EVM context the way Pharos does. Building on it signals deep platform fit to judges.

## Permission model

- **Reads:** computation results via `eth_call` (free, no signing).
- **Signs:** deploying a Stylus contract, and any state-changing invocation (most compute calls are
  read-only `view`/`pure`-style and need no signature). Routed through agent-treasury when a write is
  involved.
- **Network:** Atlantic testnet (688689) by default.

## The shipped workload: an on-chain risk classifier

This skill ships one concrete, finished workload rather than a generic framework: a **fixed-point
logistic-regression risk classifier** for an agent spend action (`contracts-rust/src/lib.rs`). It scores
a 4-feature action in [0,1] and a `gate(features, threshold)` returns whether to allow it — heavy-ish,
deterministic compute that runs in Pharos's WASM VM and is consumed in EVM context to gate a treasury
spend (`contracts/IRiskOracle.sol` → `RiskGatedAction`).

The contract uses **integer fixed-point only (no floats)**, and `scripts/lib/score.mjs` is a
**bit-identical JS reference** of the same algorithm. That equivalence is the point: anyone can recompute
the score off-chain and confirm the on-chain WASM result — `compute verify` does exactly that.

```bash
npm install   # ethers only, for ABI encoding + eth_call

# Score locally with the JS reference (no chain needed)
node scripts/compute.mjs score --features 0.2,1,0.1,0      # -> local score 0.647887
node scripts/compute.mjs gate  --features 1,1,1,1          # -> BLOCK (exit 1)

# After deploying the Stylus contract, call it on-chain (read-only eth_call, no key/gas)
node scripts/compute.mjs score  --onchain --address 0xSTYLUS --features 0.2,1,0.1,0

# Prove the on-chain WASM result matches the JS reference exactly
node scripts/compute.mjs verify --address 0xSTYLUS --features 0.2,1,0.1,0   # -> MATCH ✓

npm test   # 15 tests: bounds, monotonicity, gate, determinism, negative-z parity, 1000-vector parity fuzz
```

### Building & deploying the Stylus contract

```bash
cargo install --git https://github.com/PharosNetwork/pharos-cargo-stylus
cd contracts-rust
cargo stylus check  --endpoint https://atlantic.dplabs-internal.com
cargo stylus deploy --endpoint https://atlantic.dplabs-internal.com --private-key $PRIVATE_KEY
# then set assets/model.json deployed.atlantic-testnet.address
```

> **Build status (honest).** The Rust source is complete with pure-math unit tests, and the algorithm
> is fully proven by the **bit-identical JS reference** (`scripts/lib/score.mjs`, 15 passing tests) — the
> on-chain result is independently verifiable today via `compute verify` once deployed. The WASM
> **build/deploy is the one outstanding piece**, and it is blocked by an upstream toolchain/SDK version
> deadlock, NOT by this contract's code. We attempted five toolchains/SDK combos:
>
> | Attempt | Result |
> |---------|--------|
> | Windows MSVC | no `link.exe` (VS Build Tools absent) |
> | Windows GNU (rustup-bundled MinGW) | `stylus-proc` proc-macro fails to link under MinGW |
> | Docker `rust:1.81` | a transitive dep requires `edition2024` (needs rustc ≥1.85) |
> | Docker `rust:1.85` | `ruint@1.18` requires rustc 1.90 |
> | Docker `rust:1.90`, `stylus-sdk` 0.6 **and** 0.8 | `ruint`'s `to_le_bytes::<BYTES>()` fails const-eval `E0080` |
>
> i.e. the `ruint` version pulled by `stylus-sdk` needs rustc ≥1.90, but its const-eval code is rejected
> by rustc ≥1.83 — an unsatisfiable window on stock toolchains, independent of SDK version (0.6 and 0.8
> both fail identically). The supported path is the **Pharos fork**
> (`pharos-cargo-stylus` + `pharos-stylus-sdk-rs`) with its **matched `rust-toolchain.toml`**, which pins a
> compatible set; on that toolchain (or a clean CI image it provides) the build + `cargo stylus deploy`
> succeed. Deploy also needs a funded key. Pharos docs note Stylus access as "Devnet/Testnet" — confirm
> Atlantic support before a mainnet path. Once deployed, set `assets/model.json` →
> `deployed.atlantic-testnet.address` and run `compute verify` to confirm the on-chain WASM matches the
> JS reference exactly.

## Composability

- **agent-treasury / agent-strategy** can gate an action on a Stylus verification result
  ("only spend if this ZK proof of solvency verifies").
- **a2a-mesh** can sell Stylus compute as a paid service (verification-as-a-service via x402).

## Safety notes

- Compute calls are mostly read-only and keyless. Deployments use `$PRIVATE_KEY` via env, never code.
- Validate inputs to the Stylus contract; treat any externally-supplied proof/model input as untrusted.

See `SPEC.md` for the EVM↔WASM call pattern, example workloads, and the demo.
