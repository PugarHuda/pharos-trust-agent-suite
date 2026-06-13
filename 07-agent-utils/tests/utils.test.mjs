import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestGasLimit, totalFee, scalePrice, formatUnits, classifyAddress, isAddress } from '../scripts/lib/util.mjs';

const USDC = '0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B';
const POISONED = (USDC.toLowerCase().slice(2, 8) + 'deadbeefdeadbeefdeadbeefdead' + USDC.toLowerCase().slice(-6));

test('suggestGasLimit adds the buffer; rejects non-positive', () => {
  assert.equal(suggestGasLimit(100000n), 115000n);
  assert.equal(suggestGasLimit(100000n, 2000n), 120000n);
  assert.throws(() => suggestGasLimit(0n), /> 0/);
});

test('totalFee = limit * price (Pharos charges by limit)', () => {
  assert.equal(totalFee(115000n, 1_000_000_000n), 115_000_000_000_000n);
});

test('scalePrice keeps precision for 18-dec feeds', () => {
  const { price, micro } = scalePrice(62_409_971_330_000_000_000_000n, 18);
  assert.equal(micro, 62_409_971_330n);
  assert.ok(Math.abs(price - 62_409.97133) < 0.001);
  assert.throws(() => scalePrice(0n, 18), /non-positive/);
});

test('formatUnits', () => {
  assert.equal(formatUnits(1_500_000n, 6), '1.5');
  assert.equal(formatUnits(1_000_000_000_000_000_000n, 18), '1');
  assert.equal(formatUnits(0n, 6), '0');
});

test('classifyAddress: known, poisoning-suspect, unknown', () => {
  const reg = { [USDC]: 'USDC' };
  assert.equal(classifyAddress(USDC, reg).status, 'known');
  assert.equal(classifyAddress('0x' + POISONED, reg).status, 'poisoning-suspect');
  assert.equal(classifyAddress('0x' + 'ab'.repeat(20), reg).status, 'unknown');
});

test('classifyAddress ignores zero-padded prefixes (no false poisoning of Permit2-like addrs)', () => {
  const reg = { '0x000000000022D473030F116dDEE9F6B43aC78BA3': 'Permit2' };
  // a different zero-padded address must NOT be flagged just for shared leading zeros
  assert.notEqual(classifyAddress('0x0000000000000000000000000000000000001234', reg).status, 'poisoning-suspect');
});

test('isAddress', () => {
  assert.ok(isAddress(USDC));
  assert.ok(!isAddress('0x123'));
  assert.ok(!isAddress('hello'));
});
