//! On-chain risk classifier for agent spend actions, in Rust → WASM (Stylus).
//!
//! The whole point: this is heavy-ish, verifiable compute that runs cheaply in
//! Pharos's WASM VM and is callable from EVM context. A Solidity agent can gate a
//! treasury spend on `gate(features, threshold)` and trust the result because the
//! computation is on-chain and reproducible.
//!
//! Everything is integer fixed-point (SCALE = 1e6); no floats. The algorithm is
//! bit-identical to the JS reference in scripts/lib/score.mjs, so off-chain code
//! can independently verify any on-chain score.
//!
//! Build (WASM):  cargo build --release --target wasm32-unknown-unknown
//! Deploy:        cargo stylus deploy --endpoint <RPC> --private-key $PRIVATE_KEY
//!                (uses the Pharos fork: pharos-cargo-stylus)

#![cfg_attr(not(feature = "export-abi"), no_main)]
extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::prelude::*;

/// Fixed-point scale: every value is multiplied by 1e6.
const SCALE: i128 = 1_000_000;

/// Model weights and bias, pre-scaled by SCALE. Mirrors assets/model.json.
const WEIGHTS: [i128; 4] = [1_500_000, 2_000_000, 1_200_000, 800_000];
const BIAS: i128 = -2_000_000;

sol_storage! {
    #[entrypoint]
    pub struct RiskOracle {}
}

#[public]
impl RiskOracle {
    /// Risk score for a 4-feature action, returned in [0, SCALE] (i.e. 0.0..1.0).
    /// Features are i64 fixed-point (scaled by 1e6). View call: no signature, no gas.
    pub fn score(&self, features: Vec<i64>) -> i64 {
        compute_score(&features) as i64
    }

    /// Convenience gate: allow (true) when risk score <= threshold.
    pub fn gate(&self, features: Vec<i64>, threshold: i64) -> bool {
        compute_score(&features) <= threshold as i128
    }

    /// Expose the model fingerprint so callers can confirm which weights are live.
    pub fn model_bias(&self) -> i64 {
        BIAS as i64
    }
}

/// Deterministic fast-sigmoid: 0.5 + 0.5 * z / (1 + |z|), all fixed-point.
fn fast_sigmoid(z: i128) -> i128 {
    let az = if z < 0 { -z } else { z };
    let denom = SCALE + az;
    let frac = (z * SCALE) / denom;
    SCALE / 2 + frac / 2
}

/// dot(weights, features)/SCALE + bias, then sigmoid. Bounded loop (<= 4 here,
/// generalised to the provided length, capped at WEIGHTS.len()).
fn compute_score(features: &[i64]) -> i128 {
    let n = core::cmp::min(features.len(), WEIGHTS.len());
    let mut dot: i128 = 0;
    let mut i = 0;
    while i < n {
        dot += (WEIGHTS[i] * (features[i] as i128)) / SCALE;
        i += 1;
    }
    let zed = dot + BIAS;
    fast_sigmoid(zed)
}

// Unit tests for the pure math (run on the host with `cargo test`, no WASM needed).
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn baseline_low_risk() {
        // all-zero features -> z = BIAS = -2.0 -> sigmoid ~ 0.1667
        let s = compute_score(&[0, 0, 0, 0]);
        assert_eq!(s, SCALE / 2 + ((-2_000_000 * SCALE) / (SCALE + 2_000_000)) / 2);
    }

    #[test]
    fn high_risk_exceeds_baseline() {
        let low = compute_score(&[0, 0, 0, 0]);
        let high = compute_score(&[1_000_000, 1_000_000, 1_000_000, 1_000_000]);
        assert!(high > low);
    }

    #[test]
    fn gate_blocks_high_risk() {
        let high = compute_score(&[1_000_000, 1_000_000, 1_000_000, 1_000_000]);
        assert!(high > 500_000); // above default threshold -> gate would block
    }
}
