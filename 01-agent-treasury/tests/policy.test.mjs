import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex } from '@ethereumjs/util';
import { Interface } from 'ethers';
import { Chain, ARTIFACTS } from './evm.mjs';

const OWNER = '0x' + '11'.repeat(20);
const AGENT = '0x' + '22'.repeat(20);
const STRANGER = '0x' + '33'.repeat(20);
const DEST = '0x' + 'de'.repeat(20); // an allow-listed destination contract
const ATTACKER = '0x' + 'ba'.repeat(20);

const DAY = 7 * 24 * 3600;
const CAP = 10_000_000n;     // 10 USDC daily cap (6 decimals)
const BUDGET = 5_000_000n;   // 5 USDC session budget

// Build a fresh, fully-configured treasury for each test.
async function setup({ grant = true } = {}) {
  const chain = await Chain.create();
  for (const a of [OWNER, AGENT, STRANGER]) await chain.fund(a);

  const token = await chain.deploy(ARTIFACTS.MockERC20, OWNER);
  const treasury = await chain.deploy(ARTIFACTS.AgentTreasury, OWNER, [OWNER]);
  const T = ARTIFACTS.AgentTreasury;
  const M = ARTIFACTS.MockERC20;

  // Fund the treasury with 20 USDC.
  await chain.send(M, token, OWNER, 'mint', [bytesToHex(treasury.bytes), 20_000_000n]);
  // Policy: allow token w/ 10 USDC daily cap, allow DEST as a destination.
  await chain.send(T, treasury, OWNER, 'setPolicy', [bytesToHex(token.bytes), CAP]);
  await chain.send(T, treasury, OWNER, 'setAllowedContract', [DEST, true]);
  if (grant) {
    await chain.send(T, treasury, OWNER, 'grantSession',
      [AGENT, BUDGET, BigInt(chain.now + DAY)]);
  }
  return { chain, token, treasury, T, M };
}

let baseline;
before(async () => { baseline = await setup(); }); // smoke that setup works

test('spend within cap & budget succeeds and moves balances', async () => {
  const { chain, token, treasury, T, M } = await setup();
  await chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 3_000_000n]);

  const destBal = await chain.call(M, token, 'balanceOf', [DEST]);
  assert.equal(destBal[0], 3_000_000n);
  const remaining = await chain.call(T, treasury, 'remainingToday', [bytesToHex(token.bytes)]);
  assert.equal(remaining[0], CAP - 3_000_000n);
  const session = await chain.call(T, treasury, 'sessions', [AGENT]);
  assert.equal(session[0], BUDGET - 3_000_000n); // budgetRemaining
});

test('spend exceeding daily cap reverts DailyCapExceeded', async () => {
  const { chain, token, treasury, T } = await setup();
  // session budget is 5; cap is 10. Bump budget high so the CAP is the binding limit.
  await chain.send(T, treasury, OWNER, 'grantSession', [AGENT, 100_000_000n, BigInt(chain.now + DAY)]);
  await chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 8_000_000n]);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 5_000_000n]),
    /DailyCapExceeded/,
  );
});

test('spend to non-allowlisted contract reverts ContractNotAllowed', async () => {
  const { chain, token, treasury, T } = await setup();
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), ATTACKER, 1_000_000n]),
    /ContractNotAllowed/,
  );
});

test('spend of non-allowlisted token reverts TokenNotAllowed', async () => {
  const { chain, treasury, T } = await setup();
  const otherToken = '0x' + 'cc'.repeat(20);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [otherToken, DEST, 1_000_000n]),
    /TokenNotAllowed/,
  );
});

test('spend exceeding session budget reverts SessionBudgetExceeded', async () => {
  const { chain, token, treasury, T } = await setup();
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 6_000_000n]),
    /SessionBudgetExceeded/,
  );
});

test('spend after session expiry reverts SessionExpired', async () => {
  const { chain, token, treasury, T } = await setup();
  chain.advanceDays(8); // session expires after 7 days
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 1_000_000n]),
    /SessionExpired/,
  );
});

test('spend by a non-session caller reverts NotSession', async () => {
  const { chain, token, treasury, T } = await setup();
  await assert.rejects(
    chain.send(T, treasury, STRANGER, 'spendToken', [bytesToHex(token.bytes), DEST, 1_000_000n]),
    /NotSession/,
  );
});

test('kill-switch halts spends; un-kill restores', async () => {
  const { chain, token, treasury, T } = await setup();
  await chain.send(T, treasury, OWNER, 'setKilled', [true]);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 1_000_000n]),
    /Killed_/,
  );
  await chain.send(T, treasury, OWNER, 'setKilled', [false]);
  await chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 1_000_000n]);
  const destBal = await chain.call(ARTIFACTS.MockERC20, token, 'balanceOf', [DEST]);
  assert.equal(destBal[0], 1_000_000n);
});

test('revoked session cannot spend', async () => {
  const { chain, token, treasury, T } = await setup();
  await chain.send(T, treasury, OWNER, 'revokeSession', [AGENT]);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 1_000_000n]),
    /NotSession/,
  );
});

test('daily cap rolls over the next day', async () => {
  const { chain, token, treasury, T } = await setup();
  await chain.send(T, treasury, OWNER, 'grantSession', [AGENT, 100_000_000n, BigInt(chain.now + 30 * 24 * 3600)]);
  await chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 9_000_000n]);
  // 1 USDC left today
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 2_000_000n]),
    /DailyCapExceeded/,
  );
  chain.advanceDays(1);
  const remaining = await chain.call(T, treasury, 'remainingToday', [bytesToHex(token.bytes)]);
  assert.equal(remaining[0], CAP); // reset
  await chain.send(T, treasury, AGENT, 'spendToken', [bytesToHex(token.bytes), DEST, 9_000_000n]);
});

test('owner-only guard: stranger cannot set policy or kill', async () => {
  const { chain, treasury, T } = await setup();
  await assert.rejects(
    chain.send(T, treasury, STRANGER, 'setKilled', [true]),
    /NotOwner/,
  );
  await assert.rejects(
    chain.send(T, treasury, STRANGER, 'grantSession', [ATTACKER, 1_000_000n, BigInt(chain.now + DAY)]),
    /NotOwner/,
  );
});

test('executeCall runs allow-listed calldata and accounts the spend', async () => {
  const { chain, token, treasury, T, M } = await setup();
  // Use executeCall to approve a spender via the token contract path is not allowed
  // (token != DEST). Instead call an allow-listed DEST. Make DEST the token so the
  // call is a real transfer accounted against budget+cap.
  await chain.send(T, treasury, OWNER, 'setAllowedContract', [bytesToHex(token.bytes), true]);
  const transferData = new Interface(M.abi).encodeFunctionData('transfer', [DEST, 2_000_000n]);
  await chain.send(T, treasury, AGENT, 'executeCall',
    [bytesToHex(token.bytes), bytesToHex(token.bytes), 2_000_000n, transferData]);
  const destBal = await chain.call(M, token, 'balanceOf', [DEST]);
  assert.equal(destBal[0], 2_000_000n);
  const session = await chain.call(T, treasury, 'sessions', [AGENT]);
  assert.equal(session[0], BUDGET - 2_000_000n);
});
