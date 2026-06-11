// Reference implementation of the on-chain risk classifier, bit-identical to the
// Rust/Stylus contract in contracts-rust/src/lib.rs. Both use integer fixed-point
// math only (no floats), so the JS reference and the WASM contract return exactly
// the same value for the same inputs — that equivalence is what makes the on-chain
// result independently verifiable.
//
// Fixed-point: every value is scaled by SCALE (1e6). A "score" is a risk
// probability in [0, SCALE], i.e. 0.0 .. 1.0.

export const SCALE = 1_000_000n;

export class ModelError extends Error {
  constructor(message) { super(message); this.name = 'ModelError'; }
}

// Deterministic fast-sigmoid in fixed point:
//   sigmoid(z) ≈ 0.5 + 0.5 * z / (1 + |z|)
// Integer-only; truncating division behaves identically in Rust i128 and JS BigInt.
function fastSigmoid(z) {
  const az = z < 0n ? -z : z;
  const denom = SCALE + az;            // (1 + |z|) in fixed point
  const frac = (z * SCALE) / denom;    // z / (1 + |z|), scaled
  return SCALE / 2n + frac / 2n;       // shifted into [0, SCALE]
}

// Compute the risk score for a feature vector against a model.
//   features, weights, bias: all integers pre-scaled by SCALE.
// Returns a BigInt risk score in [0, SCALE].
export function score(features, model) {
  const weights = model.weights.map(BigInt);
  const bias = BigInt(model.bias);
  const x = features.map(BigInt);
  if (x.length !== weights.length) {
    throw new ModelError(`feature length ${x.length} != model weights ${weights.length}`);
  }
  let dot = 0n;
  for (let i = 0; i < x.length; i++) {
    dot += (weights[i] * x[i]) / SCALE; // bring product back to SCALE units
  }
  const z = dot + bias;
  return fastSigmoid(z);
}

// Gate decision: allow when risk score <= threshold (both in SCALE units).
export function gate(features, model, threshold) {
  const s = score(features, model);
  return { allow: s <= BigInt(threshold), score: s, threshold: BigInt(threshold) };
}

// Helpers to convert between human decimals and fixed-point integers (CLI use only;
// the contract never sees floats). Parsing is done on the decimal STRING — no float
// arithmetic — so there is no rounding ambiguity at the 6-dp boundary, keeping the
// "no floats anywhere near the contract" promise literal.
export function toFixed(human, decimals = 6) {
  const m = String(human).trim().match(/^(-?)(\d*)(?:\.(\d+))?$/);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) throw new ModelError(`bad number: ${human}`);
  const [, sign, whole = '', frac = ''] = m;
  if (frac.length > decimals) {
    throw new ModelError(`${human} has more than ${decimals} decimal places`);
  }
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const v = BigInt((whole || '0') + fracPadded);
  return sign === '-' ? -v : v;
}
export function fromFixed(fixed) {
  return Number(BigInt(fixed)) / 1e6;
}
