// AgentBond: staked sybil-resistance. Tests bonding, the consumer trust checks, the unbonding
// cooldown, and reentrancy on claim — on an in-memory EVM with native balances.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACTS, Chain } from './evm.mjs';

const AB = ARTIFACTS.AgentBond;
const RE = ARTIFACTS.Reenterer;

const AGENT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const ONE = 10n ** 18n;
const COOLDOWN = 1000;

async function fresh(cooldown = COOLDOWN) {
  const chain = await Chain.create();
  await chain.fund(AGENT);
  await chain.fund(OTHER);
  const bond = await chain.deploy(AB, AGENT, [BigInt(cooldown)]);
  return { chain, bond };
}

test('bondUp accumulates active stake', async () => {
  const { chain, bond } = await fresh();
  await chain.send(AB, bond, AGENT, 'bondUp', [], ONE);
  await chain.send(AB, bond, AGENT, 'bondUp', [], ONE);
  assert.equal((await chain.call(AB, bond, 'bondOf', [AGENT]))[0], ONE * 2n);
  assert.equal(await chain.balance(bond), ONE * 2n);
});

test('meetsBond / requireBond reflect the active stake', async () => {
  const { chain, bond } = await fresh();
  await chain.send(AB, bond, AGENT, 'bondUp', [], ONE);
  assert.equal((await chain.call(AB, bond, 'meetsBond', [AGENT, ONE]))[0], true);
  assert.equal((await chain.call(AB, bond, 'meetsBond', [AGENT, ONE + 1n]))[0], false);
  await chain.call(AB, bond, 'requireBond', [AGENT, ONE]); // passes
  await assert.rejects(chain.call(AB, bond, 'requireBond', [OTHER, ONE]), /BelowMinimumBond/);
});

test('requestUnbond drops active bond immediately (lose the skin on exit)', async () => {
  const { chain, bond } = await fresh();
  await chain.send(AB, bond, AGENT, 'bondUp', [], ONE * 2n);
  await chain.send(AB, bond, AGENT, 'requestUnbond', [ONE]);
  assert.equal((await chain.call(AB, bond, 'bondOf', [AGENT]))[0], ONE, 'active bond reduced now');
  assert.equal((await chain.call(AB, bond, 'pendingUnbond', [AGENT]))[0], ONE);
});

test('cannot unbond more than the active bond', async () => {
  const { chain, bond } = await fresh();
  await chain.send(AB, bond, AGENT, 'bondUp', [], ONE);
  await assert.rejects(chain.send(AB, bond, AGENT, 'requestUnbond', [ONE * 2n]), /InsufficientBond/);
});

test('claim before the cooldown elapses reverts', async () => {
  const { chain, bond } = await fresh();
  await chain.send(AB, bond, AGENT, 'bondUp', [], ONE);
  await chain.send(AB, bond, AGENT, 'requestUnbond', [ONE]);
  await assert.rejects(chain.send(AB, bond, AGENT, 'claimUnbond', []), /CooldownNotElapsed/);
});

test('claim after the cooldown returns the funds', async () => {
  const { chain, bond } = await fresh();
  await chain.send(AB, bond, AGENT, 'bondUp', [], ONE);
  await chain.send(AB, bond, AGENT, 'requestUnbond', [ONE]);
  chain.warp(COOLDOWN + 1);
  const before = await chain.balance(AGENT);
  await chain.send(AB, bond, AGENT, 'claimUnbond', []);
  assert.equal(await chain.balance(AGENT), before + ONE);
  assert.equal(await chain.balance(bond), 0n);
});

test('cannot claim twice', async () => {
  const { chain, bond } = await fresh();
  await chain.send(AB, bond, AGENT, 'bondUp', [], ONE);
  await chain.send(AB, bond, AGENT, 'requestUnbond', [ONE]);
  chain.warp(COOLDOWN + 1);
  await chain.send(AB, bond, AGENT, 'claimUnbond', []);
  await assert.rejects(chain.send(AB, bond, AGENT, 'claimUnbond', []), /NothingPending/);
});

test('bondUp rejects zero', async () => {
  const { chain, bond } = await fresh();
  await assert.rejects(chain.send(AB, bond, AGENT, 'bondUp', [], 0n), /ZeroValue/);
});

test('reentrancy on claim is blocked; funds preserved', async () => {
  const { chain, bond } = await fresh(0); // cooldown 0 so claim is immediately available
  const attacker = await chain.deploy(RE, AGENT, [bond.toString()]);
  await chain.send(RE, attacker, AGENT, 'load', [], ONE);
  await chain.send(RE, attacker, AGENT, 'startExit', [ONE]);
  await assert.rejects(chain.send(RE, attacker, AGENT, 'pull', []));
  assert.equal(await chain.balance(bond), ONE, 'funds untouched after blocked reentrancy');
});

test('two agents bond independently', async () => {
  const { chain, bond } = await fresh();
  await chain.send(AB, bond, AGENT, 'bondUp', [], ONE);
  await chain.send(AB, bond, OTHER, 'bondUp', [], ONE * 3n);
  assert.equal((await chain.call(AB, bond, 'bondOf', [AGENT]))[0], ONE);
  assert.equal((await chain.call(AB, bond, 'bondOf', [OTHER]))[0], ONE * 3n);
});
