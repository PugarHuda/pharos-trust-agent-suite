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
node scripts/compute.mjs score --features 0.2,1,0.1,0      # -> local score 0.49...
node scripts/compute.mjs gate  --features 1,1,1,1          # -> BLOCK (exit 1)

# After deploying the Stylus contract, call it on-chain (read-only eth_call, no key/gas)
node scripts/compute.mjs score  --onchain --address 0xSTYLUS --features 0.2,1,0.1,0

# Prove the on-chain WASM result matches the JS reference exactly
node scripts/compute.mjs verify --address 0xSTYLUS --features 0.2,1,0.1,0   # -> MATCH ✓

npm test   # 9 tests: bounds, monotonicity, gate, determinism, exact known-vector
```

### Building & deploying the Stylus contract

```bash
cargo install --git https://github.com/PharosNetwork/pharos-cargo-stylus
cd contracts-rust
cargo stylus check  --endpoint https://atlantic.dplabs-internal.com
cargo stylus deploy --endpoint https://atlantic.dplabs-internal.com --private-key $PRIVATE_KEY
# then set assets/model.json deployed.atlantic-testnet.address
```

> **Build status (honest):** the Rust source is complete and its pure-math `#[cfg(test)]` unit tests are
> written, but the WASM build/deploy needs the Pharos `cargo-stylus` toolchain **and a host C/C++ linker**
> (MSVC Build Tools on Windows); deploy also needs a funded testnet key. On the dev machine used here the
> MSVC linker was absent, so the on-chain address is left `null` pending a build host. The JS reference is
> fully built and tested, so the algorithm and the EVM-side integration are verifiable today; only the
> WASM artifact's on-chain address is outstanding. Pharos docs note Stylus access as "Devnet/Testnet" —
> confirm Atlantic support before relying on a mainnet path.

## Composability

- **agent-treasury / agent-strategy** can gate an action on a Stylus verification result
  ("only spend if this ZK proof of solvency verifies").
- **a2a-mesh** can sell Stylus compute as a paid service (verification-as-a-service via x402).

## Safety notes

- Compute calls are mostly read-only and keyless. Deployments use `$PRIVATE_KEY` via env, never code.
- Validate inputs to the Stylus contract; treat any externally-supplied proof/model input as untrusted.

See `SPEC.md` for the EVM↔WASM call pattern, example workloads, and the demo.
