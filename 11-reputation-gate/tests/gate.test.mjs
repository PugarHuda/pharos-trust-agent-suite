// ReputationGate behavior on an in-memory EVM: reputation checks, composite reputation+validation
// trust, and the gatedPay hook (forwards only to trusted providers; surfaces failed transfers).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACTS, Chain } from './evm.mjs';

const GATE = ARTIFACTS.ReputationGate;
const REP = ARTIFACTS.MockReputation;
const VAL = ARTIFACTS.MockValidation;
const REJECT = ARTIFACTS.RejectingProvider;

const DEPLOYER = '0x1111111111111111111111111111111111111111';
const GOOD     = '0x2222222222222222222222222222222222222222'; // reputable provider
const BAD      = '0x3333333333333333333333333333333333333333'; // low reputation
const PAYER    = '0x4444444444444444444444444444444444444444';

const DATA = '0x' + 'aa'.repeat(32);
const ONE = 10n ** 18n;

async function setup() {
  const chain = await Chain.create();
  for (const a of [DEPLOYER, PAYER]) await chain.fund(a);
  const rep = await chain.deploy(REP, DEPLOYER);
  const val = await chain.deploy(VAL, DEPLOYER);
  await chain.send(REP, rep, DEPLOYER, 'set', [GOOD, 10]); // mirrors live: provider #1 = 10/100
  await chain.send(REP, rep, DEPLOYER, 'set', [BAD, 0]);
  const gate = await chain.deploy(GATE, DEPLOYER, [rep.toString(), val.toString()]);
  return { chain, rep, val, gate };
}

// ---------- reputation checks ----------

test('meetsReputation reflects the on-chain score', async () => {
  const { chain, gate } = await setup();
  assert.equal((await chain.call(GATE, gate, 'meetsReputation', [GOOD, 10]))[0], true);
  assert.equal((await chain.call(GATE, gate, 'meetsReputation', [GOOD, 11]))[0], false);
  assert.equal((await chain.call(GATE, gate, 'meetsReputation', [BAD, 1]))[0], false);
});

test('requireReputation reverts below the bar with the actual numbers', async () => {
  const { chain, gate } = await setup();
  await chain.call(GATE, gate, 'requireReputation', [GOOD, 10]); // passes (no revert)
  await assert.rejects(chain.call(GATE, gate, 'requireReputation', [BAD, 10]), /BelowReputationThreshold/);
});

// ---------- composite trust (reputation + validation) ----------

test('requireTrusted passes when reputation AND validation clear the bars', async () => {
  const { chain, val, gate } = await setup();
  await chain.send(VAL, val, DEPLOYER, 'set', [DATA, 95, true]); // validated 95/100
  await chain.call(GATE, gate, 'requireTrusted', [GOOD, 10, DATA, 90]); // passes
});

test('requireTrusted reverts if the work was never validated', async () => {
  const { chain, gate } = await setup();
  await assert.rejects(chain.call(GATE, gate, 'requireTrusted', [GOOD, 10, DATA, 90]), /WorkNotValidated/);
});

test('requireTrusted reverts if the validation score is too low', async () => {
  const { chain, val, gate } = await setup();
  await chain.send(VAL, val, DEPLOYER, 'set', [DATA, 50, true]);
  await assert.rejects(chain.call(GATE, gate, 'requireTrusted', [GOOD, 10, DATA, 90]), /BelowValidationThreshold/);
});

test('requireTrusted reverts on reputation before even checking validation', async () => {
  const { chain, val, gate } = await setup();
  await chain.send(VAL, val, DEPLOYER, 'set', [DATA, 100, true]);
  await assert.rejects(chain.call(GATE, gate, 'requireTrusted', [BAD, 10, DATA, 90]), /BelowReputationThreshold/);
});

test('isTrusted returns the verdict and the underlying signals without reverting', async () => {
  const { chain, val, gate } = await setup();
  await chain.send(VAL, val, DEPLOYER, 'set', [DATA, 95, true]);
  const r = await chain.call(GATE, gate, 'isTrusted', [GOOD, 10, DATA, 90]);
  assert.equal(r[0], true);          // trusted
  assert.equal(Number(r[1]), 10);    // reputation
  assert.equal(Number(r[2]), 95);    // validation score
  assert.equal(r[3], true);          // validated
  const r2 = await chain.call(GATE, gate, 'isTrusted', [BAD, 10, DATA, 90]);
  assert.equal(r2[0], false);
});

// ---------- the gatedPay hook ----------

test('gatedPay forwards funds to a trusted provider', async () => {
  const { chain, gate } = await setup();
  const before = await chain.balance(GOOD);
  await chain.send(GATE, gate, PAYER, 'gatedPay', [GOOD, 10], ONE);
  assert.equal(await chain.balance(GOOD), before + ONE, 'provider received the payment');
  assert.equal(await chain.balance(gate), 0n, 'gate holds no custody');
});

test('gatedPay reverts for an untrusted provider; funds are not moved', async () => {
  const { chain, gate } = await setup();
  const before = await chain.balance(BAD);
  await assert.rejects(chain.send(GATE, gate, PAYER, 'gatedPay', [BAD, 10], ONE), /BelowReputationThreshold/);
  assert.equal(await chain.balance(BAD), before, 'no funds moved to the untrusted provider');
});

test('gatedPay surfaces a failed transfer (reverts, no funds stuck)', async () => {
  const { chain, rep, gate } = await setup();
  const rejecter = await chain.deploy(REJECT, DEPLOYER);
  await chain.send(REP, rep, DEPLOYER, 'set', [rejecter.toString(), 50]); // trusted, but rejects payment
  await assert.rejects(chain.send(GATE, gate, PAYER, 'gatedPay', [rejecter.toString(), 10], ONE), /TransferFailed/);
  assert.equal(await chain.balance(gate), 0n, 'gate retains nothing after the revert');
});
