// IntentMandate: an AP2-style user-signed envelope an agent cannot exceed. Tests the EIP-712
// verification + every enforcement guard on an in-memory EVM, with real ethers-signed mandates.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { ARTIFACTS, Chain } from './evm.mjs';

const IM = ARTIFACTS.IntentMandate;
const RE = ARTIFACTS.Reenterer;

const USER = new Wallet('0x' + '11'.repeat(32));   // deterministic signer
const WRONG = new Wallet('0x' + '22'.repeat(32));
const AGENT = '0x3333333333333333333333333333333333333333';
const RECIP = '0x4444444444444444444444444444444444444444';
const OTHER = '0x5555555555555555555555555555555555555555';
const ZERO  = '0x0000000000000000000000000000000000000000';
const ONE = 10n ** 18n;

const TYPES = {
  IntentMandate: [
    { name: 'user', type: 'address' },
    { name: 'agent', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'maxAmount', type: 'uint256' },
    { name: 'expiry', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
  ],
};

async function setup() {
  const chain = await Chain.create();
  await chain.fund(USER.address);
  await chain.fund(AGENT);
  const im = await chain.deploy(IM, AGENT);
  const domain = { name: 'IntentMandate', version: '1', chainId: 1, verifyingContract: im.toString() };
  return { chain, im, domain };
}

function mandate({ maxAmount = ONE, recipient = RECIP, expiry = 2_000_000_000n, nonce = 1n }) {
  return { user: USER.address, agent: AGENT, recipient, maxAmount, expiry, nonce };
}
const sign = (domain, m, signer = USER) => signer.signTypedData(domain, TYPES, m);

// ---------- happy path ----------

test('user funds + signs; agent spends within the envelope; partial spends accrue', async () => {
  const { chain, im, domain } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE);
  const m = mandate({ maxAmount: ONE });
  const sig = await sign(domain, m);

  const before = await chain.balance(RECIP);
  await chain.send(IM, im, AGENT, 'spendUnderMandate', [m, sig, RECIP, ONE * 6n / 10n]);
  assert.equal(await chain.balance(RECIP), before + ONE * 6n / 10n, 'recipient paid 0.6');
  assert.equal((await chain.call(IM, im, 'remaining', [m]))[0], ONE * 4n / 10n, '0.4 remaining');

  await chain.send(IM, im, AGENT, 'spendUnderMandate', [m, sig, RECIP, ONE * 4n / 10n]);
  assert.equal((await chain.call(IM, im, 'remaining', [m]))[0], 0n, 'fully spent');
  assert.equal((await chain.call(IM, im, 'balanceOf', [USER.address]))[0], 0n);
});

test('recipient address(0) lets the agent pay any recipient', async () => {
  const { chain, im, domain } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE);
  const m = mandate({ recipient: ZERO });
  const sig = await sign(domain, m);
  await chain.send(IM, im, AGENT, 'spendUnderMandate', [m, sig, OTHER, ONE / 2n]); // any recipient ok
  assert.equal(await chain.balance(OTHER), ONE / 2n);
});

// ---------- enforcement guards (the leash) ----------

test('agent cannot exceed maxAmount', async () => {
  const { chain, im, domain } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE);
  const m = mandate({ maxAmount: ONE / 2n });
  const sig = await sign(domain, m);
  await assert.rejects(chain.send(IM, im, AGENT, 'spendUnderMandate', [m, sig, RECIP, ONE]), /ExceedsMandate/);
});

test('only the authorized agent can execute the mandate', async () => {
  const { chain, im, domain } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE);
  const m = mandate({});
  const sig = await sign(domain, m);
  await assert.rejects(chain.send(IM, im, OTHER, 'spendUnderMandate', [m, sig, RECIP, ONE / 2n]), /NotAuthorizedAgent/);
});

test('an expired mandate is rejected', async () => {
  const { chain, im, domain } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE);
  const m = mandate({ expiry: BigInt(chain.now - 1) });
  const sig = await sign(domain, m);
  await assert.rejects(chain.send(IM, im, AGENT, 'spendUnderMandate', [m, sig, RECIP, ONE / 2n]), /MandateExpired/);
});

test('a disallowed recipient is rejected', async () => {
  const { chain, im, domain } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE);
  const m = mandate({ recipient: RECIP });
  const sig = await sign(domain, m);
  await assert.rejects(chain.send(IM, im, AGENT, 'spendUnderMandate', [m, sig, OTHER, ONE / 2n]), /RecipientNotAllowed/);
});

test('a signature from the wrong key is rejected', async () => {
  const { chain, im, domain } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE);
  const m = mandate({});
  const badSig = await sign(domain, m, WRONG); // signed by someone who is not m.user
  await assert.rejects(chain.send(IM, im, AGENT, 'spendUnderMandate', [m, badSig, RECIP, ONE / 2n]), /BadSignature/);
});

test('a tampered amount/field invalidates the signature', async () => {
  const { chain, im, domain } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE);
  const m = mandate({ maxAmount: ONE / 2n });
  const sig = await sign(domain, m);
  const tampered = { ...m, maxAmount: ONE }; // agent tries to inflate the cap
  await assert.rejects(chain.send(IM, im, AGENT, 'spendUnderMandate', [tampered, sig, RECIP, ONE]), /BadSignature/);
});

test('insufficient deposited balance is rejected even within the cap', async () => {
  const { chain, im, domain } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE / 2n); // funded less than the cap
  const m = mandate({ maxAmount: ONE });
  const sig = await sign(domain, m);
  await assert.rejects(chain.send(IM, im, AGENT, 'spendUnderMandate', [m, sig, RECIP, ONE]), /InsufficientBalance/);
});

// ---------- revoke ----------

test('the user can revoke a mandate; spends afterward fail', async () => {
  const { chain, im, domain } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE);
  const m = mandate({});
  const sig = await sign(domain, m);
  await chain.send(IM, im, USER.address, 'revoke', [m]);
  assert.equal((await chain.call(IM, im, 'remaining', [m]))[0], 0n);
  await assert.rejects(chain.send(IM, im, AGENT, 'spendUnderMandate', [m, sig, RECIP, ONE / 2n]), /MandateIsRevoked/);
});

test('only the user can revoke their own mandate', async () => {
  const { chain, im } = await setup();
  const m = mandate({});
  await assert.rejects(chain.send(IM, im, OTHER, 'revoke', [m]), /NotMandateUser/);
});

// ---------- funds custody ----------

test('the user can withdraw unspent funds at any time', async () => {
  const { chain, im } = await setup();
  await chain.send(IM, im, USER.address, 'fund', [], ONE);
  const before = await chain.balance(USER.address);
  await chain.send(IM, im, USER.address, 'withdraw', [ONE]);
  assert.equal(await chain.balance(USER.address), before + ONE);
  assert.equal(await chain.balance(im), 0n);
});

test('reentrancy on withdraw is blocked; balance preserved', async () => {
  const { chain, im } = await setup();
  const attacker = await chain.deploy(RE, AGENT, [im.toString()]);
  await chain.send(RE, attacker, AGENT, 'load', [], ONE); // attacker funds its own balance
  await assert.rejects(chain.send(RE, attacker, AGENT, 'pull', [ONE]));
  assert.equal(await chain.balance(im), ONE, 'funds untouched after blocked reentrancy');
});

test('fund and withdraw reject zero amounts', async () => {
  const { chain, im } = await setup();
  await assert.rejects(chain.send(IM, im, USER.address, 'fund', [], 0n), /ZeroValue/);
  await assert.rejects(chain.send(IM, im, USER.address, 'withdraw', [0n]), /ZeroValue/);
});
