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
  const tokenHex = bytesToHex(token.bytes);

  // Fund the treasury with 20 USDC.
  await chain.send(M, token, OWNER, 'mint', [bytesToHex(treasury.bytes), 20_000_000n]);
  // Policy: allow token w/ 10 USDC daily cap, allow DEST as a destination.
  await chain.send(T, treasury, OWNER, 'setPolicy', [tokenHex, CAP]);
  await chain.send(T, treasury, OWNER, 'setAllowedContract', [DEST, true]);
  if (grant) {
    await chain.send(T, treasury, OWNER, 'grantSession',
      [AGENT, tokenHex, BUDGET, BigInt(chain.now + DAY)]);
  }
  return { chain, token, treasury, T, M, tokenHex };
}

let baseline;
before(async () => { baseline = await setup(); }); // smoke that setup works

test('spend within cap & budget succeeds and moves balances', async () => {
  const { chain, token, treasury, T, M, tokenHex } = await setup();
  await chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 3_000_000n]);

  const destBal = await chain.call(M, token, 'balanceOf', [DEST]);
  assert.equal(destBal[0], 3_000_000n);
  const remaining = await chain.call(T, treasury, 'remainingToday', [tokenHex]);
  assert.equal(remaining[0], CAP - 3_000_000n);
  const session = await chain.call(T, treasury, 'sessions', [AGENT]);
  assert.equal(session.budgetRemaining, BUDGET - 3_000_000n);
});

test('spend exceeding daily cap reverts DailyCapExceeded', async () => {
  const { chain, treasury, T, tokenHex } = await setup();
  // session budget is 5; cap is 10. Bump budget high so the CAP is the binding limit.
  await chain.send(T, treasury, OWNER, 'grantSession', [AGENT, tokenHex, 100_000_000n, BigInt(chain.now + DAY)]);
  await chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 8_000_000n]);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 5_000_000n]),
    /DailyCapExceeded/,
  );
});

test('spend to non-allowlisted contract reverts ContractNotAllowed', async () => {
  const { chain, treasury, T, tokenHex } = await setup();
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, ATTACKER, 1_000_000n]),
    /ContractNotAllowed/,
  );
});

test('spend of non-session token reverts SessionTokenMismatch', async () => {
  // The session is bound to `token`; a second allow-listed token must still be rejected.
  const { chain, treasury, T } = await setup();
  const token2 = await chain.deploy(ARTIFACTS.MockERC20, OWNER);
  const token2Hex = bytesToHex(token2.bytes);
  await chain.send(ARTIFACTS.MockERC20, token2, OWNER, 'mint', [bytesToHex(treasury.bytes), 20_000_000n]);
  await chain.send(T, treasury, OWNER, 'setPolicy', [token2Hex, CAP]);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [token2Hex, DEST, 1_000_000n]),
    /SessionTokenMismatch/,
  );
});

test('spend of a token with no policy reverts TokenNotAllowed', async () => {
  // Bind the session to an un-capped token, so the token check (not the session) is the gate.
  const { chain, treasury, T } = await setup();
  const token2 = await chain.deploy(ARTIFACTS.MockERC20, OWNER);
  const token2Hex = bytesToHex(token2.bytes);
  await chain.send(T, treasury, OWNER, 'grantSession', [AGENT, token2Hex, BUDGET, BigInt(chain.now + DAY)]);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [token2Hex, DEST, 1_000_000n]),
    /TokenNotAllowed/,
  );
});

test('spend exceeding session budget reverts SessionBudgetExceeded', async () => {
  const { chain, treasury, T, tokenHex } = await setup();
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 6_000_000n]),
    /SessionBudgetExceeded/,
  );
});

test('spend after session expiry reverts SessionExpired', async () => {
  const { chain, treasury, T, tokenHex } = await setup();
  chain.advanceDays(8); // session expires after 7 days
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 1_000_000n]),
    /SessionExpired/,
  );
});

test('grantSession with a past/zero expiry reverts BadExpiry', async () => {
  const { chain, treasury, T, tokenHex } = await setup();
  await assert.rejects(
    chain.send(T, treasury, OWNER, 'grantSession', [AGENT, tokenHex, BUDGET, 0n]),
    /BadExpiry/,
  );
  await assert.rejects(
    chain.send(T, treasury, OWNER, 'grantSession', [AGENT, tokenHex, BUDGET, BigInt(chain.now)]),
    /BadExpiry/,
  );
});

test('zero-address guards: setPolicy/grantSession/transferOwnership reject address(0)', async () => {
  const { chain, treasury, T, tokenHex } = await setup();
  const ZERO = '0x' + '00'.repeat(20);
  await assert.rejects(chain.send(T, treasury, OWNER, 'setPolicy', [ZERO, CAP]), /ZeroAddress/);
  await assert.rejects(chain.send(T, treasury, OWNER, 'grantSession', [ZERO, tokenHex, BUDGET, BigInt(chain.now + DAY)]), /ZeroAddress/);
  await assert.rejects(chain.send(T, treasury, OWNER, 'transferOwnership', [ZERO]), /ZeroAddress/);
});

test('spend by a non-session caller reverts NotSession', async () => {
  const { chain, treasury, T, tokenHex } = await setup();
  await assert.rejects(
    chain.send(T, treasury, STRANGER, 'spendToken', [tokenHex, DEST, 1_000_000n]),
    /NotSession/,
  );
});

test('kill-switch halts spends; un-kill restores', async () => {
  const { chain, token, treasury, T, tokenHex } = await setup();
  await chain.send(T, treasury, OWNER, 'setKilled', [true]);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 1_000_000n]),
    /Killed_/,
  );
  await chain.send(T, treasury, OWNER, 'setKilled', [false]);
  await chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 1_000_000n]);
  const destBal = await chain.call(ARTIFACTS.MockERC20, token, 'balanceOf', [DEST]);
  assert.equal(destBal[0], 1_000_000n);
});

test('revoked session cannot spend', async () => {
  const { chain, treasury, T, tokenHex } = await setup();
  await chain.send(T, treasury, OWNER, 'revokeSession', [AGENT]);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 1_000_000n]),
    /NotSession/,
  );
});

test('daily cap rolls over the next day', async () => {
  const { chain, treasury, T, tokenHex } = await setup();
  await chain.send(T, treasury, OWNER, 'grantSession', [AGENT, tokenHex, 100_000_000n, BigInt(chain.now + 30 * 24 * 3600)]);
  await chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 9_000_000n]);
  // 1 USDC left today
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 2_000_000n]),
    /DailyCapExceeded/,
  );
  chain.advanceDays(1);
  const remaining = await chain.call(T, treasury, 'remainingToday', [tokenHex]);
  assert.equal(remaining[0], CAP); // reset
  await chain.send(T, treasury, AGENT, 'spendToken', [tokenHex, DEST, 9_000_000n]);
});

test('owner-only guard: stranger cannot set policy or kill', async () => {
  const { chain, treasury, T, tokenHex } = await setup();
  await assert.rejects(
    chain.send(T, treasury, STRANGER, 'setKilled', [true]),
    /NotOwner/,
  );
  await assert.rejects(
    chain.send(T, treasury, STRANGER, 'grantSession', [ATTACKER, tokenHex, 1_000_000n, BigInt(chain.now + DAY)]),
    /NotOwner/,
  );
});

test('executeCall runs allow-listed calldata and accounts the spend', async () => {
  const { chain, token, treasury, T, M, tokenHex } = await setup();
  // Make the token itself an allow-listed destination so executeCall can run a real
  // transfer that is accounted against budget+cap.
  await chain.send(T, treasury, OWNER, 'setAllowedContract', [tokenHex, true]);
  const transferData = new Interface(M.abi).encodeFunctionData('transfer', [DEST, 2_000_000n]);
  await chain.send(T, treasury, AGENT, 'executeCall',
    [tokenHex, tokenHex, 2_000_000n, transferData]);
  const destBal = await chain.call(M, token, 'balanceOf', [DEST]);
  assert.equal(destBal[0], 2_000_000n);
  const session = await chain.call(T, treasury, 'sessions', [AGENT]);
  assert.equal(session.budgetRemaining, BUDGET - 2_000_000n);
});

test('executeCall reverts SpendExceedsAccounted when the call moves more than spendAmount', async () => {
  // The headline security fix: budget is a REAL bound on executeCall, not advisory.
  const { chain, treasury, T, M, tokenHex } = await setup();
  await chain.send(T, treasury, OWNER, 'setAllowedContract', [tokenHex, true]);
  // Account only 1 USDC but craft calldata that moves 2 USDC out.
  const drainData = new Interface(M.abi).encodeFunctionData('transfer', [ATTACKER, 2_000_000n]);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'executeCall', [tokenHex, tokenHex, 1_000_000n, drainData]),
    /SpendExceedsAccounted/,
  );
});

test('executeCall CANNOT drain a different policy token (cross-token guard)', async () => {
  // Session bound to token A; a second policy token B is also allow-listed as a target.
  // A jailbroken agent must not be able to move B out via executeCall(A, B, 0, B.transfer(..)).
  const { chain, treasury, T, M, tokenHex } = await setup();
  const tokenB = await chain.deploy(ARTIFACTS.MockERC20, OWNER);
  const tokenBHex = bytesToHex(tokenB.bytes);
  await chain.send(M, tokenB, OWNER, 'mint', [bytesToHex(treasury.bytes), 20_000_000n]); // treasury holds B
  await chain.send(T, treasury, OWNER, 'setPolicy', [tokenBHex, CAP]);                    // B is a policy token
  await chain.send(T, treasury, OWNER, 'setAllowedContract', [tokenBHex, true]);          // B allow-listed as target
  const drainB = new Interface(M.abi).encodeFunctionData('transfer', [ATTACKER, 5_000_000n]);
  // session is bound to A (tokenHex); target B != A -> blocked outright
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'executeCall', [tokenHex, tokenBHex, 0n, drainB]),
    /CrossTokenCall/,
  );
  // B balance untouched
  const bBal = await chain.call(M, tokenB, 'balanceOf', [ATTACKER]);
  assert.equal(bBal[0], 0n);
});

test('executeCall sweep blocks an INDIRECT drain of another policy token (transferFrom via a router)', async () => {
  // The guard only blocks targeting a different policy token directly; this exercises the
  // balance-delta SWEEP: a non-policy router pulls token B out of the treasury via an
  // allowance, and the post-call sweep must revert because B (not the bound token) dropped.
  const { chain, treasury, T, M, tokenHex } = await setup(); // session bound to token A (tokenHex)
  const tokenB = await chain.deploy(ARTIFACTS.MockERC20, OWNER);
  const tokenBHex = bytesToHex(tokenB.bytes);
  await chain.send(M, tokenB, OWNER, 'mint', [bytesToHex(treasury.bytes), 20_000_000n]);
  await chain.send(T, treasury, OWNER, 'setPolicy', [tokenBHex, CAP]); // B is a policy token (swept)
  const router = await chain.deploy(ARTIFACTS.DrainRouter, OWNER);
  const routerHex = bytesToHex(router.bytes);
  await chain.send(T, treasury, OWNER, 'setAllowedContract', [routerHex, true]);   // router allow-listed (non-policy)
  await chain.send(T, treasury, OWNER, 'setAllowedContract', [tokenBHex, true]);   // allow approving B

  // Treasury approves the router to spend its token B (session bound to B for this step).
  await chain.send(T, treasury, OWNER, 'grantSession', [AGENT, tokenBHex, BUDGET, BigInt(chain.now + DAY)]);
  const approveData = new Interface(M.abi).encodeFunctionData('approve', [routerHex, 10_000_000n]);
  await chain.send(T, treasury, AGENT, 'executeCall', [tokenBHex, tokenBHex, 0n, approveData]);

  // Re-bind the session to token A, then try to drain B through the router.
  await chain.send(T, treasury, OWNER, 'grantSession', [AGENT, tokenHex, BUDGET, BigInt(chain.now + DAY)]);
  const pullData = new Interface(ARTIFACTS.DrainRouter.abi).encodeFunctionData('pull',
    [tokenBHex, bytesToHex(treasury.bytes), ATTACKER, 5_000_000n]);
  await assert.rejects(
    chain.send(T, treasury, AGENT, 'executeCall', [tokenHex, routerHex, 0n, pullData]),
    /SpendExceedsAccounted/,
  );
  const stolen = await chain.call(M, tokenB, 'balanceOf', [ATTACKER]);
  assert.equal(stolen[0], 0n); // sweep reverted the whole tx, nothing moved
});

test('setPolicy enforces MAX_POLICY_TOKENS', async () => {
  const { chain, treasury, T } = await setup(); // already has 1 policy token (the demo token)
  // add up to the cap, then expect the next to revert
  let added = 1;
  for (let i = 0; added < 32; i++) {
    const t = '0x' + (i + 0x100).toString(16).padStart(40, '0');
    await chain.send(T, treasury, OWNER, 'setPolicy', [t, CAP]);
    added++;
  }
  await assert.rejects(
    chain.send(T, treasury, OWNER, 'setPolicy', ['0x' + 'fe'.repeat(20), CAP]),
    /TooManyPolicyTokens/,
  );
});

test('executeCall allows an approval (moves 0 tokens, within any budget)', async () => {
  // Approvals move no balance, so delta 0 <= spendAmount always — the strategy skill relies on this.
  const { chain, token, treasury, T, M, tokenHex } = await setup();
  await chain.send(T, treasury, OWNER, 'setAllowedContract', [tokenHex, true]);
  const approveData = new Interface(M.abi).encodeFunctionData('approve', [DEST, 1_000_000n]);
  // spendAmount 0; the call must succeed (no revert) and set the allowance.
  await chain.send(T, treasury, AGENT, 'executeCall', [tokenHex, tokenHex, 0n, approveData]);
  const allowance = await chain.call(M, token, 'allowance', [bytesToHex(treasury.bytes), DEST]);
  assert.equal(allowance[0], 1_000_000n);
});

test('ownerWithdrawNative succeeds for owner and reverts for stranger', async () => {
  const { chain, treasury, T } = await setup();
  await chain.fund(treasury); // give the treasury native balance
  await chain.send(T, treasury, OWNER, 'ownerWithdrawNative', [OWNER, 1_000n]);
  await assert.rejects(
    chain.send(T, treasury, STRANGER, 'ownerWithdrawNative', [STRANGER, 1_000n]),
    /NotOwner/,
  );
});
