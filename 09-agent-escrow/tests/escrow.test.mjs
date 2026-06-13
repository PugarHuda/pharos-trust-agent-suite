// AgentEscrow behavior + security tests on an in-memory EVM (payable, native balances).
// Covers the full lifecycle, every guard, value conservation, and a reentrancy attack.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACTS, Chain } from './evm.mjs';

const ESC = ARTIFACTS.AgentEscrow;
const RE = ARTIFACTS.Reenterer;

const CLIENT   = '0x1111111111111111111111111111111111111111';
const PROVIDER = '0x2222222222222222222222222222222222222222';
const ARBITER  = '0x3333333333333333333333333333333333333333';
const OUTSIDER = '0x4444444444444444444444444444444444444444';
const ZERO     = '0x0000000000000000000000000000000000000000';

const JOB  = '0x' + '11'.repeat(32);
const JOB2 = '0x' + '22'.repeat(32);
const TERMS = '0x' + 'ab'.repeat(32);
const DELIV = '0x' + 'cd'.repeat(32);
const NULL32 = '0x' + '00'.repeat(32);

const ONE = 10n ** 18n;

async function fresh() {
  const chain = await Chain.create();
  await chain.fund(CLIENT);
  await chain.fund(PROVIDER);
  await chain.fund(ARBITER);
  await chain.fund(OUTSIDER);
  const escrow = await chain.deploy(ESC, CLIENT);
  return { chain, escrow };
}
const deadline = (chain) => BigInt(chain.now + 1000);
async function state(chain, escrow, job) {
  const j = await chain.call(ESC, escrow, 'getJob', [job]);
  return Number(j[7]);
}

// ---------- happy path ----------

test('create locks funds; release credits provider; withdraw pays out (value conserved)', async () => {
  const { chain, escrow } = await fresh();
  const clientBefore = await chain.balance(CLIENT);

  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  assert.equal(await chain.balance(escrow), ONE, 'escrow holds the locked value');
  assert.equal(await chain.balance(CLIENT), clientBefore - ONE, 'client debited');
  assert.equal(await state(chain, escrow, JOB), 1, 'Funded');

  await chain.send(ESC, escrow, PROVIDER, 'markDelivered', [JOB, DELIV]);
  assert.equal(await state(chain, escrow, JOB), 2, 'Delivered');

  await chain.send(ESC, escrow, CLIENT, 'release', [JOB]);
  assert.equal(await state(chain, escrow, JOB), 3, 'Released');
  const credit = await chain.call(ESC, escrow, 'withdrawable', [PROVIDER]);
  assert.equal(credit[0], ONE, 'provider fully credited');

  const provBefore = await chain.balance(PROVIDER);
  await chain.send(ESC, escrow, PROVIDER, 'withdraw', []);
  assert.equal(await chain.balance(PROVIDER), provBefore + ONE, 'provider received funds');
  assert.equal(await chain.balance(escrow), 0n, 'escrow drained — value conserved');
});

test('release works without an explicit delivery', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ZERO, deadline(chain), NULL32], ONE);
  await chain.send(ESC, escrow, CLIENT, 'release', [JOB]);
  assert.equal(await state(chain, escrow, JOB), 3);
});

// ---------- create guards ----------

test('createJob rejects zero amount', async () => {
  const { chain, escrow } = await fresh();
  await assert.rejects(
    chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], 0n),
    /ZeroAmount/);
});

test('createJob rejects zero provider', async () => {
  const { chain, escrow } = await fresh();
  await assert.rejects(
    chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, ZERO, ARBITER, deadline(chain), TERMS], ONE),
    /ZeroProvider/);
});

test('createJob rejects self-deal (provider == client)', async () => {
  const { chain, escrow } = await fresh();
  await assert.rejects(
    chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, CLIENT, ARBITER, deadline(chain), TERMS], ONE),
    /SelfDeal/);
});

test('createJob rejects a deadline in the past', async () => {
  const { chain, escrow } = await fresh();
  await assert.rejects(
    chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, BigInt(chain.now - 1), TERMS], ONE),
    /BadDeadline/);
});

test('createJob rejects a duplicate jobId', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await assert.rejects(
    chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE),
    /JobExists/);
});

// ---------- authorization ----------

test('only the provider can mark delivered', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await assert.rejects(chain.send(ESC, escrow, OUTSIDER, 'markDelivered', [JOB, DELIV]), /NotProvider/);
});

test('only the client can release', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await assert.rejects(chain.send(ESC, escrow, PROVIDER, 'release', [JOB]), /NotClient/);
});

test('operations on an unknown job revert JobUnknown', async () => {
  const { chain, escrow } = await fresh();
  await assert.rejects(chain.send(ESC, escrow, CLIENT, 'release', [JOB2]), /JobUnknown/);
});

test('cannot release twice (BadState)', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await chain.send(ESC, escrow, CLIENT, 'release', [JOB]);
  await assert.rejects(chain.send(ESC, escrow, CLIENT, 'release', [JOB]), /BadState/);
});

// ---------- timeout refund (anti-rug) ----------

test('client can refund after the deadline if undelivered', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  chain.warp(2000); // past deadline
  await chain.send(ESC, escrow, CLIENT, 'refundTimeout', [JOB]);
  assert.equal(await state(chain, escrow, JOB), 4, 'Refunded');
  const credit = await chain.call(ESC, escrow, 'withdrawable', [CLIENT]);
  assert.equal(credit[0], ONE, 'client credited back');
});

test('cannot refund before the deadline (NotYetExpired)', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await assert.rejects(chain.send(ESC, escrow, CLIENT, 'refundTimeout', [JOB]), /NotYetExpired/);
});

test('anti-rug: delivered work cannot be timeout-refunded', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await chain.send(ESC, escrow, PROVIDER, 'markDelivered', [JOB, DELIV]);
  chain.warp(2000);
  await assert.rejects(chain.send(ESC, escrow, CLIENT, 'refundTimeout', [JOB]), /BadState/);
});

// ---------- disputes ----------

test('dispute reverts when no arbiter is set', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ZERO, deadline(chain), TERMS], ONE);
  await assert.rejects(chain.send(ESC, escrow, CLIENT, 'dispute', [JOB]), /NoArbiter/);
});

test('an outsider cannot dispute', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await assert.rejects(chain.send(ESC, escrow, OUTSIDER, 'dispute', [JOB]), /NotClient/);
});

test('arbiter resolves a dispute with a split; both parties can withdraw their share', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await chain.send(ESC, escrow, PROVIDER, 'markDelivered', [JOB, DELIV]);
  await chain.send(ESC, escrow, PROVIDER, 'dispute', [JOB]);
  assert.equal(await state(chain, escrow, JOB), 5, 'Disputed');

  const toProvider = ONE * 6n / 10n; // 60/40 split
  await chain.send(ESC, escrow, ARBITER, 'resolve', [JOB, toProvider]);
  assert.equal(await state(chain, escrow, JOB), 6, 'Resolved');

  const pc = await chain.call(ESC, escrow, 'withdrawable', [PROVIDER]);
  const cc = await chain.call(ESC, escrow, 'withdrawable', [CLIENT]);
  assert.equal(pc[0], toProvider);
  assert.equal(cc[0], ONE - toProvider);

  const pBefore = await chain.balance(PROVIDER);
  const cBefore = await chain.balance(CLIENT);
  await chain.send(ESC, escrow, PROVIDER, 'withdraw', []);
  await chain.send(ESC, escrow, CLIENT, 'withdraw', []);
  assert.equal(await chain.balance(PROVIDER), pBefore + toProvider);
  assert.equal(await chain.balance(CLIENT), cBefore + (ONE - toProvider));
  assert.equal(await chain.balance(escrow), 0n, 'fully settled — value conserved');
});

test('only the arbiter can resolve', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await chain.send(ESC, escrow, CLIENT, 'dispute', [JOB]);
  await assert.rejects(chain.send(ESC, escrow, CLIENT, 'resolve', [JOB, ONE]), /NotArbiter/);
});

test('resolve rejects a split larger than the locked amount', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await chain.send(ESC, escrow, CLIENT, 'dispute', [JOB]);
  await assert.rejects(chain.send(ESC, escrow, ARBITER, 'resolve', [JOB, ONE + 1n]), /SplitTooLarge/);
});

test('cannot resolve a job that is not disputed', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ARBITER, deadline(chain), TERMS], ONE);
  await assert.rejects(chain.send(ESC, escrow, ARBITER, 'resolve', [JOB, ONE]), /BadState/);
});

// ---------- withdraw / reentrancy ----------

test('withdraw with no balance reverts NothingToWithdraw', async () => {
  const { chain, escrow } = await fresh();
  await assert.rejects(chain.send(ESC, escrow, OUTSIDER, 'withdraw', []), /NothingToWithdraw/);
});

test('reentrancy on withdraw is blocked; no double payment, balance preserved', async () => {
  const chain = await Chain.create();
  await chain.fund(CLIENT);
  const escrow = await chain.deploy(ESC, CLIENT);
  const attacker = await chain.deploy(RE, CLIENT, [escrow.toString()]); // provider = malicious contract

  // Fund a job to the attacker contract and release so it has a withdrawable balance.
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, attacker.toString(), ZERO, BigInt(chain.now + 1000), NULL32], ONE);
  await chain.send(ESC, escrow, CLIENT, 'release', [JOB]);

  // Attacker tries to re-enter via receive(): the whole withdraw must revert.
  await assert.rejects(chain.send(RE, attacker, CLIENT, 'pull', []));

  // Funds neither drained nor lost: escrow still holds them, credit intact.
  assert.equal(await chain.balance(escrow), ONE, 'escrow funds untouched');
  const credit = await chain.call(ESC, escrow, 'withdrawable', [attacker.toString()]);
  assert.equal(credit[0], ONE, 'credit restored after revert');
});

// ---------- independence of jobs ----------

test('two jobs settle independently', async () => {
  const { chain, escrow } = await fresh();
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB, PROVIDER, ZERO, deadline(chain), NULL32], ONE);
  await chain.send(ESC, escrow, CLIENT, 'createJob', [JOB2, OUTSIDER, ZERO, deadline(chain), NULL32], ONE * 2n);
  assert.equal(await chain.balance(escrow), ONE * 3n);
  await chain.send(ESC, escrow, CLIENT, 'release', [JOB]);
  chain.warp(2000);
  await chain.send(ESC, escrow, CLIENT, 'refundTimeout', [JOB2]);
  const p = await chain.call(ESC, escrow, 'withdrawable', [PROVIDER]);
  const c = await chain.call(ESC, escrow, 'withdrawable', [CLIENT]);
  assert.equal(p[0], ONE, 'job1 → provider');
  assert.equal(c[0], ONE * 2n, 'job2 → client refund');
});
