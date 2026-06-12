import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, hexlify } from 'ethers';
import { tokenDomain, buildAuthorization, signPayment, verifyPayment } from '../scripts/lib/scheme.mjs';
import { splitSignature } from '../scripts/lib/facilitator.mjs';

const CHAIN_ID = 688689;
const TOKEN = '0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8'; // x402 demo USDC
const PAYER = new Wallet('0x' + '22'.repeat(32));
const MERCHANT = '0x' + 'bb'.repeat(20);
const NONCE = hexlify(Uint8Array.from({ length: 32 }, (_, i) => i + 1));

const domain = tokenDomain({ name: 'USD Coin', version: '1', chainId: CHAIN_ID, token: TOKEN });
const NOW = 1_750_000_000;

function requirements(over = {}) {
  return {
    scheme: 'exact-evm', network: `eip155:${CHAIN_ID}`,
    maxAmountRequired: '1000000', asset: TOKEN, payTo: MERCHANT, ...over,
  };
}

async function makePayment(over = {}) {
  const auth = buildAuthorization({
    from: PAYER.address, to: MERCHANT, value: 1_000_000n,
    validAfter: 0, validBefore: NOW + 600, nonce: NONCE, ...over,
  });
  return signPayment(PAYER.privateKey, domain, auth);
}

test('a correctly signed payment verifies, recovering the payer', async () => {
  const p = await makePayment();
  const res = verifyPayment(p, requirements(), domain, { now: NOW });
  assert.equal(res.isValid, true);
  assert.equal(res.payer.toLowerCase(), PAYER.address.toLowerCase());
});

test('overpayment (value > required) is accepted', async () => {
  const p = await makePayment({ value: 2_000_000n });
  assert.equal(verifyPayment(p, requirements(), domain, { now: NOW }).isValid, true);
});

test('underpayment is rejected', async () => {
  const p = await makePayment({ value: 500_000n });
  const res = verifyPayment(p, requirements(), domain, { now: NOW });
  assert.equal(res.isValid, false);
  assert.match(res.reason, /below required/);
});

test('wrong recipient is rejected', async () => {
  const p = await makePayment({ to: '0x' + 'cc'.repeat(20) });
  const res = verifyPayment(p, requirements(), domain, { now: NOW });
  assert.equal(res.isValid, false);
  assert.match(res.reason, /recipient/);
});

test('wrong asset (domain token != required asset) is rejected', async () => {
  const p = await makePayment();
  const res = verifyPayment(p, requirements({ asset: '0x' + 'dd'.repeat(20) }), domain, { now: NOW });
  assert.equal(res.isValid, false);
  assert.match(res.reason, /asset/);
});

test('expired authorization is rejected', async () => {
  const p = await makePayment({ validBefore: NOW - 1 });
  const res = verifyPayment(p, requirements(), domain, { now: NOW });
  assert.equal(res.isValid, false);
  assert.match(res.reason, /expired/);
});

test('not-yet-valid authorization is rejected', async () => {
  const p = await makePayment({ validAfter: NOW + 100 });
  const res = verifyPayment(p, requirements(), domain, { now: NOW });
  assert.equal(res.isValid, false);
  assert.match(res.reason, /not yet valid/);
});

test('a tampered signature (forged payer) is rejected', async () => {
  const p = await makePayment();
  // flip the authorization `from` to someone else: signature no longer recovers to `from`
  p.payload.authorization.from = '0x' + 'ee'.repeat(20);
  const res = verifyPayment(p, requirements(), domain, { now: NOW });
  assert.equal(res.isValid, false);
  assert.match(res.reason, /signature does not recover/);
});

test('a payment signed for a DIFFERENT token domain does not verify here', async () => {
  const otherDomain = tokenDomain({ name: 'USD Coin', version: '1', chainId: CHAIN_ID, token: '0x' + 'ab'.repeat(20) });
  const auth = buildAuthorization({ from: PAYER.address, to: MERCHANT, value: 1_000_000n, validBefore: NOW + 600, nonce: NONCE });
  const p = await signPayment(PAYER.privateKey, otherDomain, auth);
  // verifying against our TOKEN domain + asset must fail (asset mismatch caught first)
  const res = verifyPayment(p, requirements(), domain, { now: NOW });
  assert.equal(res.isValid, false);
});

test('scheme / network mismatch is rejected', async () => {
  const p = await makePayment();
  assert.equal(verifyPayment(p, requirements({ scheme: 'exact-svm' }), domain, { now: NOW }).isValid, false);
  assert.equal(verifyPayment(p, requirements({ network: 'eip155:1' }), domain, { now: NOW }).isValid, false);
});

test('splitSignature round-trips a 65-byte signature', async () => {
  const p = await makePayment();
  const { v, r, s } = splitSignature(p.payload.signature);
  assert.ok(v === 27 || v === 28);
  assert.match(r, /^0x[0-9a-f]{64}$/i);
  assert.match(s, /^0x[0-9a-f]{64}$/i);
  assert.throws(() => splitSignature('0x1234'), /65 bytes/);
});

test('splitSignature rejects malleable (high-s) and bad-v signatures', () => {
  const r = 'a'.repeat(64);
  // s just above N/2 (high-s) -> malleable, must reject
  const highS = 'fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe';
  assert.throws(() => splitSignature('0x' + r + highS + '1b'), /malleable/);
  // a low-s with a bad v
  const lowS = '1'.padStart(64, '0');
  assert.throws(() => splitSignature('0x' + r + lowS + '05'), /invalid signature v/);
  // v=0/1 (EIP-2098 yParity) is normalized, not rejected
  assert.doesNotThrow(() => splitSignature('0x' + r + lowS + '00'));
});

test('validAfter boundary matches on-chain strict > (now == validAfter is NOT yet valid)', async () => {
  const p = await makePayment({ validAfter: NOW });
  const res = verifyPayment(p, requirements(), domain, { now: NOW });
  assert.equal(res.isValid, false);
  assert.match(res.reason, /not yet valid/);
  // one second later it is valid
  assert.equal(verifyPayment(await makePayment({ validAfter: NOW }), requirements(), domain, { now: NOW + 1 }).isValid, true);
});
