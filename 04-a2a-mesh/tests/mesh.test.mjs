import { test } from 'node:test';
import assert from 'node:assert/strict';
import { id } from 'ethers';
import { Chain, ARTIFACTS } from './evm.mjs';

const PROVIDER_A = '0x' + 'a1'.repeat(20);
const PROVIDER_B = '0x' + 'b2'.repeat(20);
const CONSUMER = '0x' + 'cc'.repeat(20);
const OUTSIDER = '0x' + 'dd'.repeat(20);
const RECORDER = '0x' + 'ee'.repeat(20); // mesh settlement relayer

const TAG_PRICE = id('price-feed');
const TAG_COMPUTE = id('compute');
const REF1 = id('settlement-tx-1');
const REF2 = id('settlement-tx-2');

async function setup() {
  const chain = await Chain.create();
  for (const a of [PROVIDER_A, PROVIDER_B, CONSUMER, OUTSIDER, RECORDER]) await chain.fund(a);
  const registry = await chain.deploy(ARTIFACTS.ServiceRegistry, PROVIDER_A);
  const reputation = await chain.deploy(ARTIFACTS.Reputation, RECORDER, [RECORDER]);
  return { chain, registry, reputation, R: ARTIFACTS.ServiceRegistry, REP: ARTIFACTS.Reputation };
}

// ---- ServiceRegistry: discovery ----

test('register + discover by tag returns the service', async () => {
  const { chain, registry, R } = await setup();
  await chain.send(R, registry, PROVIDER_A, 'register', [TAG_PRICE, 'https://a.example/x402', 1000n]);
  const ids = await chain.call(R, registry, 'getByTag', [TAG_PRICE]);
  assert.equal(ids[0].length, 1);
  assert.equal(ids[0][0], 1n);
  const svc = await chain.call(R, registry, 'services', [1n]);
  assert.equal(svc.owner.toLowerCase(), PROVIDER_A);
  assert.equal(svc.endpoint, 'https://a.example/x402');
  assert.equal(svc.price, 1000n);
});

test('getActiveByTag filters out deactivated services', async () => {
  const { chain, registry, R } = await setup();
  await chain.send(R, registry, PROVIDER_A, 'register', [TAG_PRICE, 'https://a.example', 1000n]);
  await chain.send(R, registry, PROVIDER_B, 'register', [TAG_PRICE, 'https://b.example', 900n]);
  await chain.send(R, registry, PROVIDER_B, 'setActive', [2n, false]);
  const active = await chain.call(R, registry, 'getActiveByTag', [TAG_PRICE]);
  assert.deepEqual(active[0].map(Number), [1]);
});

test('only the service owner can update or deactivate', async () => {
  const { chain, registry, R } = await setup();
  await chain.send(R, registry, PROVIDER_A, 'register', [TAG_PRICE, 'https://a.example', 1000n]);
  await assert.rejects(
    chain.send(R, registry, OUTSIDER, 'update', [1n, 'https://evil.example', 1n]),
    /NotServiceOwner/,
  );
  await assert.rejects(
    chain.send(R, registry, OUTSIDER, 'setActive', [1n, false]),
    /NotServiceOwner/,
  );
});

// ---- Reputation: the anti-sybil core ----

test('payer can rate a recorded interaction; score updates on-chain', async () => {
  const { chain, reputation, REP } = await setup();
  await chain.send(REP, reputation, RECORDER, 'recordPayment', [REF1, CONSUMER, PROVIDER_A, 1000n]);
  await chain.send(REP, reputation, CONSUMER, 'rate', [REF1, 5]);
  const count = await chain.call(REP, reputation, 'ratingCount', [PROVIDER_A]);
  const sum = await chain.call(REP, reputation, 'ratingSum', [PROVIDER_A]);
  const score = await chain.call(REP, reputation, 'scoreOf', [PROVIDER_A]);
  assert.equal(count[0], 1n);
  assert.equal(sum[0], 5n);
  // avg = 5*20=100; confidence = 1*100/20 = 5; score = 100*5/100 = 5
  assert.equal(score[0], 5n);
});

test('non-payer CANNOT rate (the differentiator)', async () => {
  const { chain, reputation, REP } = await setup();
  await chain.send(REP, reputation, RECORDER, 'recordPayment', [REF1, CONSUMER, PROVIDER_A, 1000n]);
  await assert.rejects(
    chain.send(REP, reputation, OUTSIDER, 'rate', [REF1, 5]),
    /NotPayer/,
  );
});

test('rating an unknown (unpaid) interaction reverts', async () => {
  const { chain, reputation, REP } = await setup();
  await assert.rejects(
    chain.send(REP, reputation, CONSUMER, 'rate', [id('never-paid'), 5]),
    /UnknownInteraction/,
  );
});

test('double-rating the same interaction reverts', async () => {
  const { chain, reputation, REP } = await setup();
  await chain.send(REP, reputation, RECORDER, 'recordPayment', [REF1, CONSUMER, PROVIDER_A, 1000n]);
  await chain.send(REP, reputation, CONSUMER, 'rate', [REF1, 5]);
  await assert.rejects(
    chain.send(REP, reputation, CONSUMER, 'rate', [REF1, 1]),
    /AlreadyRated/,
  );
});

test('only the recorder can record payments', async () => {
  const { chain, reputation, REP } = await setup();
  await assert.rejects(
    chain.send(REP, reputation, OUTSIDER, 'recordPayment', [REF1, CONSUMER, PROVIDER_A, 1000n]),
    /NotRecorder/,
  );
});

test('score is bad-score guarded (1..5 only)', async () => {
  const { chain, reputation, REP } = await setup();
  await chain.send(REP, reputation, RECORDER, 'recordPayment', [REF1, CONSUMER, PROVIDER_A, 1000n]);
  await assert.rejects(chain.send(REP, reputation, CONSUMER, 'rate', [REF1, 0]), /BadScore/);
  await chain.send(REP, reputation, RECORDER, 'recordPayment', [REF2, CONSUMER, PROVIDER_A, 1000n]);
  await assert.rejects(chain.send(REP, reputation, CONSUMER, 'rate', [REF2, 6]), /BadScore/);
});

test('confidence ramps with sample size (20 ratings = full weight)', async () => {
  const { chain, reputation, REP } = await setup();
  // 20 distinct payers each rate once with score 4 -> avg 80, confidence 100, score 80
  for (let i = 0; i < 20; i++) {
    const payer = '0x' + (i + 1).toString(16).padStart(2, '0').repeat(20);
    await chain.fund(payer);
    const ref = id('ref-' + i);
    await chain.send(REP, reputation, RECORDER, 'recordPayment', [ref, payer, PROVIDER_B, 1000n]);
    await chain.send(REP, reputation, payer, 'rate', [ref, 4]);
  }
  const score = await chain.call(REP, reputation, 'scoreOf', [PROVIDER_B]);
  assert.equal(score[0], 80n);
});

test('per-counterparty cap limits collusion (PAIR_CAP=10)', async () => {
  const { chain, reputation, REP } = await setup();
  // same payer rates the same provider 12 times; only first 10 count
  for (let i = 0; i < 12; i++) {
    const ref = id('collude-' + i);
    await chain.send(REP, reputation, RECORDER, 'recordPayment', [ref, CONSUMER, PROVIDER_A, 1000n]);
    await chain.send(REP, reputation, CONSUMER, 'rate', [ref, 5]);
  }
  const count = await chain.call(REP, reputation, 'ratingCount', [PROVIDER_A]);
  assert.equal(count[0], 10n); // capped
});
