import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, hexlify } from 'ethers';
import { riskScore, riskRequirements, handleRiskRequest } from '../scripts/lib/risk.mjs';
import { tokenDomain, buildAuthorization, signPayment } from '../scripts/lib/scheme.mjs';

const CHAIN_ID = 688689;
const TOKEN = '0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8';
const PAYER = new Wallet('0x' + '33'.repeat(32));
const MERCHANT = '0x' + 'bb'.repeat(20);
const domain = tokenDomain({ name: 'USD Coin', version: '2', chainId: CHAIN_ID, token: TOKEN });
const requirements = riskRequirements({ chainId: CHAIN_ID, asset: TOKEN, payTo: MERCHANT, price: '1000' });
const NOW = 1_750_000_000;

async function payment(amount = 1000n) {
  const auth = buildAuthorization({ from: PAYER.address, to: MERCHANT, value: amount, validAfter: 0, validBefore: NOW + 600, nonce: hexlify(Uint8Array.from({ length: 32 }, (_, i) => i + 9)) });
  return signPayment(PAYER.privateKey, domain, auth);
}
const xpaymentHeader = (p) => Buffer.from(JSON.stringify(p)).toString('base64');

test('riskScore matches the stylus model (low vs high)', () => {
  assert.ok(riskScore([0, 0, 0, 0]).risk < 0.2);   // baseline low
  assert.ok(riskScore([1, 1, 1, 1]).risk > 0.8);   // all features hot
  assert.throws(() => riskScore([1, 2, 3]), /expected 4/);
});

test('no payment -> HTTP 402 with PaymentRequired', () => {
  const res = handleRiskRequest({ headers: {}, features: ['0.2', '1', '0.1', '0'] }, { requirements, domain });
  assert.equal(res.status, 402);
  assert.ok(res.headers['x-payment-required']);
  assert.deepEqual(res.body.accepts[0].resource, '/risk');
});

test('valid payment -> 200 with the risk score and payer', async () => {
  const res = handleRiskRequest(
    { headers: { 'x-payment': xpaymentHeader(await payment()) }, features: ['0.2', '1', '0.1', '0'] },
    { requirements, domain, now: NOW },
  );
  assert.equal(res.status, 200);
  assert.ok(res.body.risk > 0 && res.body.risk < 1);
  assert.equal(res.body.payer.toLowerCase(), PAYER.address.toLowerCase());
});

test('underpayment -> 402 invalid', async () => {
  const res = handleRiskRequest(
    { headers: { 'x-payment': xpaymentHeader(await payment(500n)) }, features: ['0.2', '1', '0.1', '0'] },
    { requirements, domain, now: NOW },
  );
  assert.equal(res.status, 402);
  assert.match(res.body.error, /below required/);
});

test('replay guard: the same payment cannot fetch a second score', async () => {
  const seen = new Set();
  const hdr = { 'x-payment': xpaymentHeader(await payment()) };
  const first = handleRiskRequest({ headers: hdr, features: ['0.2', '1', '0.1', '0'] }, { requirements, domain, now: NOW, seen });
  assert.equal(first.status, 200);
  const second = handleRiskRequest({ headers: hdr, features: ['0.2', '1', '0.1', '0'] }, { requirements, domain, now: NOW, seen });
  assert.equal(second.status, 402);
  assert.match(second.body.error, /replay/);
});

test('feature with >6 decimals is rejected (matches stylus toFixed)', async () => {
  const res = handleRiskRequest(
    { headers: { 'x-payment': xpaymentHeader(await payment()) }, features: ['0.1234567', '1', '0.1', '0'] },
    { requirements, domain, now: NOW },
  );
  assert.equal(res.status, 400);
});

test('malformed X-PAYMENT -> 400', () => {
  const res = handleRiskRequest({ headers: { 'x-payment': '!!notbase64json' }, features: ['0', '0', '0', '0'] }, { requirements, domain, now: NOW });
  assert.equal(res.status, 400);
});

test('paid but bad features -> 400', async () => {
  const res = handleRiskRequest(
    { headers: { 'x-payment': xpaymentHeader(await payment()) }, features: ['0.2', '1'] },
    { requirements, domain, now: NOW },
  );
  assert.equal(res.status, 400);
});
