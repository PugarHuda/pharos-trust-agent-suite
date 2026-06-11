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
