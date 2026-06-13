// ValidationRegistry8004 (ERC-8004 Validation Registry) behavior + guards on an in-memory EVM,
// wired to a MockIdentity that mirrors the suite's IdentityRegistry8004.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACTS, Chain } from './evm.mjs';

const VR = ARTIFACTS.ValidationRegistry8004;
const ID = ARTIFACTS.MockIdentity;

const SERVER    = '0x1111111111111111111111111111111111111111';
const VALIDATOR = '0x2222222222222222222222222222222222222222';
const OUTSIDER  = '0x4444444444444444444444444444444444444444';
const VWALLET   = '0x5555555555555555555555555555555555555555';

const DATA  = '0x' + 'aa'.repeat(32);
const DATA2 = '0x' + 'bb'.repeat(32);

// Build a fresh registry with a registered server (#1) and validator (#2).
async function setup() {
  const chain = await Chain.create();
  for (const a of [SERVER, VALIDATOR, OUTSIDER, VWALLET]) await chain.fund(a);
  const identity = await chain.deploy(ID, SERVER);
  await chain.send(ID, identity, SERVER, 'register', [SERVER]);    // agentId 1 (server)
  await chain.send(ID, identity, SERVER, 'register', [VALIDATOR]); // agentId 2 (validator)
  const vr = await chain.deploy(VR, SERVER, [identity.toString()]);
  return { chain, identity, vr };
}

// ---------- happy path ----------

test('server requests, designated validator responds; score is recorded', async () => {
  const { chain, vr } = await setup();
  await chain.send(VR, vr, SERVER, 'validationRequest', [2, 1, DATA]);
  let v = await chain.call(VR, vr, 'getValidation', [DATA]);
  assert.equal(Number(v[0]), 2, 'validatorAgentId');
  assert.equal(Number(v[1]), 1, 'serverAgentId');
  assert.equal(v[3], true, 'requested');
  assert.equal(v[4], false, 'not yet responded');

  await chain.send(VR, vr, VALIDATOR, 'validationResponse', [DATA, 95]);
  v = await chain.call(VR, vr, 'getValidation', [DATA]);
  assert.equal(Number(v[2]), 95, 'response score');
  assert.equal(v[4], true, 'responded');
});

test('a score of 100 (boundary) is accepted', async () => {
  const { chain, vr } = await setup();
  await chain.send(VR, vr, SERVER, 'validationRequest', [2, 1, DATA]);
  await chain.send(VR, vr, VALIDATOR, 'validationResponse', [DATA, 100]);
  const v = await chain.call(VR, vr, 'getValidation', [DATA]);
  assert.equal(Number(v[2]), 100);
});

// ---------- request guards ----------

test('request reverts for an unknown validator agent', async () => {
  const { chain, vr } = await setup();
  await assert.rejects(chain.send(VR, vr, SERVER, 'validationRequest', [99, 1, DATA]), /UnknownValidator/);
});

test('request reverts for an unknown server agent', async () => {
  const { chain, vr } = await setup();
  await assert.rejects(chain.send(VR, vr, SERVER, 'validationRequest', [2, 99, DATA]), /UnknownServer/);
});

test('request reverts on self-validation (validator == server)', async () => {
  const { chain, vr } = await setup();
  await assert.rejects(chain.send(VR, vr, SERVER, 'validationRequest', [1, 1, DATA]), /SelfValidation/);
});

test('only the server agent may request validation of its work (anti-griefing)', async () => {
  const { chain, vr } = await setup();
  await assert.rejects(chain.send(VR, vr, OUTSIDER, 'validationRequest', [2, 1, DATA]), /NotServerAgent/);
});

test('a dataHash cannot be requested twice', async () => {
  const { chain, vr } = await setup();
  await chain.send(VR, vr, SERVER, 'validationRequest', [2, 1, DATA]);
  await assert.rejects(chain.send(VR, vr, SERVER, 'validationRequest', [2, 1, DATA]), /AlreadyRequested/);
});

// ---------- response guards ----------

test('response reverts for an unknown validation', async () => {
  const { chain, vr } = await setup();
  await assert.rejects(chain.send(VR, vr, VALIDATOR, 'validationResponse', [DATA2, 50]), /UnknownValidation/);
});

test('only the designated validator can respond', async () => {
  const { chain, vr } = await setup();
  await chain.send(VR, vr, SERVER, 'validationRequest', [2, 1, DATA]);
  await assert.rejects(chain.send(VR, vr, OUTSIDER, 'validationResponse', [DATA, 50]), /NotValidator/);
  // even the server can't post its own validation
  await assert.rejects(chain.send(VR, vr, SERVER, 'validationResponse', [DATA, 50]), /NotValidator/);
});

test('a response above 100 is rejected', async () => {
  const { chain, vr } = await setup();
  await chain.send(VR, vr, SERVER, 'validationRequest', [2, 1, DATA]);
  await assert.rejects(chain.send(VR, vr, VALIDATOR, 'validationResponse', [DATA, 101]), /BadResponse/);
});

test('a validation cannot be answered twice', async () => {
  const { chain, vr } = await setup();
  await chain.send(VR, vr, SERVER, 'validationRequest', [2, 1, DATA]);
  await chain.send(VR, vr, VALIDATOR, 'validationResponse', [DATA, 80]);
  await assert.rejects(chain.send(VR, vr, VALIDATOR, 'validationResponse', [DATA, 90]), /AlreadyResponded/);
});

// ---------- agentWallet resolution ----------

test('the validator can respond from its operating wallet, not just the owner', async () => {
  const { chain, identity, vr } = await setup();
  await chain.send(ID, identity, SERVER, 'setAgentWallet', [2, VWALLET]); // validator #2 operates from VWALLET
  await chain.send(VR, vr, SERVER, 'validationRequest', [2, 1, DATA]);
  await chain.send(VR, vr, VWALLET, 'validationResponse', [DATA, 70]); // wallet responds
  const v = await chain.call(VR, vr, 'getValidation', [DATA]);
  assert.equal(Number(v[2]), 70);
  assert.equal(v[4], true);
});

// ---------- independence ----------

test('two validations are independent', async () => {
  const { chain, vr } = await setup();
  await chain.send(VR, vr, SERVER, 'validationRequest', [2, 1, DATA]);
  await chain.send(VR, vr, SERVER, 'validationRequest', [2, 1, DATA2]);
  await chain.send(VR, vr, VALIDATOR, 'validationResponse', [DATA, 10]);
  const a = await chain.call(VR, vr, 'getValidation', [DATA]);
  const b = await chain.call(VR, vr, 'getValidation', [DATA2]);
  assert.equal(Number(a[2]), 10);
  assert.equal(a[4], true);
  assert.equal(b[4], false, 'second still pending');
});
