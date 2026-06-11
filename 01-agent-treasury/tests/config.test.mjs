import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseExpiry, withGasBuffer } from '../scripts/lib/config.mjs';

test('parseAmount scales by decimals', () => {
  assert.equal(parseAmount('10', 6), 10_000_000n);
  assert.equal(parseAmount('1.5', 18), 1_500_000_000_000_000_000n);
  assert.equal(parseAmount('10usdc', 6), 10_000_000n); // trailing symbol ignored
  assert.equal(parseAmount('0.000001', 6), 1n);
});

test('parseAmount rejects over-precision instead of silently truncating', () => {
  // 7 decimals on a 6-decimal token would silently drop a digit / round to 0 before the fix.
  assert.throws(() => parseAmount('10.1234567', 6), /decimal places|truncate/i);
  assert.throws(() => parseAmount('0.0000001', 6), /decimal places|truncate/i);
});

test('parseAmount rejects garbage', () => {
  assert.throws(() => parseAmount('abc', 6));
  assert.throws(() => parseAmount('-5', 6));
});

test('parseExpiry handles duration units', () => {
  assert.equal(parseExpiry('7d', 1000), 1000 + 7 * 86400);
  assert.equal(parseExpiry('24h', 1000), 1000 + 24 * 3600);
  assert.equal(parseExpiry('30m', 1000), 1000 + 30 * 60);
  assert.equal(parseExpiry('3600s', 1000), 1000 + 3600);
  assert.equal(parseExpiry('60', 1000), 1060); // bare number = seconds
});

test('parseExpiry supports explicit absolute timestamps via @', () => {
  assert.equal(parseExpiry('@2000000000', 1000), 2_000_000_000);
  assert.throws(() => parseExpiry('@500', 1000), /not in the future/);
});

test('parseExpiry rejects ambiguous/invalid input', () => {
  assert.throws(() => parseExpiry('7w', 1000));   // unknown unit
  assert.throws(() => parseExpiry('soon', 1000));
});

test('withGasBuffer adds 15%', () => {
  assert.equal(withGasBuffer(100_000n), 115_000n);
  assert.equal(withGasBuffer(1_000_000n), 1_150_000n);
});
