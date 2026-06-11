import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, gate, SCALE, toFixed, fromFixed, ModelError } from '../scripts/lib/score.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const model = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'model.json'), 'utf8',
));

// Recompute the expected baseline directly from the fixed-point formula so the
// test is an independent derivation, not a copy of the implementation's output.
function expectedSigmoid(z) {
  const az = z < 0n ? -z : z;
  const denom = SCALE + az;
  const frac = (z * SCALE) / denom;
  return SCALE / 2n + frac / 2n;
}

test('baseline (all-zero features) equals sigmoid(bias)', () => {
  const s = score([0, 0, 0, 0], model);
  assert.equal(s, expectedSigmoid(BigInt(model.bias)));
});

test('score is bounded in [0, SCALE]', () => {
  for (const f of [[0, 0, 0, 0], [1e6, 1e6, 1e6, 1e6], [-5e6, -5e6, -5e6, -5e6], [10e6, 10e6, 10e6, 10e6]]) {
    const s = score(f.map(BigInt), model);
    assert.ok(s >= 0n && s <= SCALE, `out of range: ${s}`);
  }
});

test('risk increases monotonically with each weighted feature', () => {
  const base = score([0, 0, 0, 0], model);
  const more = score([toFixed(0.5), 0, 0, 0], model);
  const most = score([toFixed(1), toFixed(1), 0, 0], model);
  assert.ok(more > base);
  assert.ok(most > more);
});

test('the highest-weight feature (destination_unknown) moves risk most', () => {
  // weights = [1.5, 2.0, 1.2, 0.8] -> feature index 1 has the largest weight
  const f1 = score([toFixed(1), 0, 0, 0], model);
  const f2 = score([0, toFixed(1), 0, 0], model);
  assert.ok(f2 > f1);
});

test('gate ALLOWs low risk and BLOCKs high risk at default threshold', () => {
  const low = gate([0, 0, 0, 0], model, model.defaultThreshold);
  const high = gate([toFixed(1), toFixed(1), toFixed(1), toFixed(1)], model, model.defaultThreshold);
  assert.equal(low.allow, true);
  assert.equal(high.allow, false);
});

test('wrong feature count throws ModelError', () => {
  assert.throws(() => score([0, 0, 0], model), ModelError);
});

test('determinism: same inputs always give the same integer score', () => {
  const f = [toFixed(0.3), toFixed(1), toFixed(0.1), toFixed(0.7)];
  assert.equal(score(f, model), score(f, model));
});

test('toFixed/fromFixed round-trip', () => {
  assert.equal(toFixed(0.5), 500000n);
  assert.equal(fromFixed(500000n), 0.5);
  assert.equal(toFixed(1), 1000000n);
});

// Known exact vector — guards against accidental algorithm changes (drift detector).
test('known vector produces a stable exact score', () => {
  const f = [toFixed(0.2), toFixed(1), toFixed(0.1), 0n];
  // dot = 1.5*0.2 + 2.0*1 + 1.2*0.1 + 0.8*0 = 0.3 + 2.0 + 0.12 = 2.42 ; z = 2.42 - 2.0 = 0.42
  // sigmoid_fast(0.42) = 0.5 + 0.5 * 0.42/(1+0.42) = 0.5 + 0.5*0.295774...
  const z = 420000n;
  assert.equal(score(f, model), expectedSigmoid(z));
});

test('the documented example vector scores 0.647887', () => {
  // matches the SKILL.md quickstart output
  assert.equal(score([toFixed(0.2), toFixed(1), toFixed(0.1), 0n], model), 647887n);
});

// ---- parity-critical: negative-z and negative-product truncation ----
// Both Rust (i128 /) and JS (BigInt /) truncate toward zero. These vectors exercise
// negative z and negative per-term products, the cases most likely to diverge if the
// integer math is ever "fixed" to floor-divide.

test('negative features (negative z) match the hand-derived fixed-point formula', () => {
  // Independent reimplementation of the contract math (per-term truncating divide).
  const ref = (features) => {
    let dot = 0n;
    for (let i = 0; i < 4; i++) dot += (BigInt(model.weights[i]) * BigInt(features[i])) / SCALE;
    return expectedSigmoid(dot + BigInt(model.bias));
  };
  for (const f of [
    [-333333n, 0n, 0n, 0n],
    [-700000n, -700000n, -700000n, -700000n],
    [toFixed(-0.5), toFixed(-1), 0n, toFixed(-0.3)],
    [0n, 0n, 0n, 0n], // z = bias = -2e6
  ]) {
    assert.equal(score(f, model), ref(f), `mismatch for ${f}`);
  }
});

test('parity fuzz: score() matches an independent integer reimplementation (1000 vectors)', () => {
  // Deterministic LCG (no Math.random) so the test is reproducible.
  let seed = 123456789n;
  const next = () => { seed = (seed * 1103515245n + 12345n) % (1n << 31n); return seed; };
  const randFeat = () => (next() % 20_000_001n) - 10_000_000n; // [-10, 10] * SCALE, the CLI bound
  const ref = (features) => {
    let dot = 0n;
    for (let i = 0; i < 4; i++) dot += (BigInt(model.weights[i]) * features[i]) / SCALE;
    return expectedSigmoid(dot + BigInt(model.bias));
  };
  for (let n = 0; n < 1000; n++) {
    const f = [randFeat(), randFeat(), randFeat(), randFeat()];
    const s = score(f, model);
    assert.equal(s, ref(f));
    assert.ok(s >= 0n && s <= SCALE);
  }
});

test('gate boundary: score == threshold is ALLOW (<=)', () => {
  // craft a threshold exactly equal to a known score
  const f = [toFixed(0.2), toFixed(1), toFixed(0.1), 0n];
  const s = score(f, model); // 647887n
  assert.equal(gate(f, model, s).allow, true);          // == threshold allows
  assert.equal(gate(f, model, s - 1n).allow, false);     // just below blocks
});

test('Rust(min) vs JS(throw) length handling is documented: JS rejects non-4 vectors', () => {
  // The Rust contract now also reverts on != 4 (assert in compute_score), matching this.
  assert.throws(() => score([0n, 0n, 0n], model), ModelError);
  assert.throws(() => score([0n, 0n, 0n, 0n, 0n], model), ModelError);
});

test('toFixed parses decimal strings without float rounding', () => {
  assert.equal(toFixed('0.000001'), 1n);
  assert.equal(toFixed('-0.5'), -500000n);
  assert.throws(() => toFixed('0.1234567'), /decimal places/); // > 6 dp rejected
});
