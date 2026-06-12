import { test } from 'node:test';
import assert from 'node:assert/strict';
import { id, Wallet } from 'ethers';
import { bytesToHex } from '@ethereumjs/util';
import { Chain, ARTIFACTS } from './evm.mjs';

// A deterministic payer wallet for EIP-712 signing tests. It never sends a tx
// (a relayer does), so it needs no on-chain balance — only its signature matters.
const PAYER_WALLET = new Wallet('0x' + '11'.repeat(32));
async function signAuth(repHex, ref, provider, amount) {
  const domain = { name: 'AnvitaMeshReputation', version: '1', chainId: 1, verifyingContract: repHex };
  const types = { PaymentAuth: [{ name: 'ref', type: 'bytes32' }, { name: 'provider', type: 'address' }, { name: 'amount', type: 'uint256' }] };
  return PAYER_WALLET.signTypedData(domain, types, { ref, provider, amount });
}

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

test('rating an unknown (unpaid) interaction reverts (no payment under caller+ref key)', async () => {
  const { chain, reputation, REP } = await setup();
  await assert.rejects(
    chain.send(REP, reputation, CONSUMER, 'rate', [id('never-paid'), 5]),
    /NotPayer/,
  );
});

test('ref griefing is impossible: a squatter recording the same ref does not block the real payer', async () => {
  const { chain, reputation, REP } = await setup();
  // OUTSIDER front-runs REF1 (records their own payment for the same ref)...
  await chain.send(REP, reputation, RECORDER, 'recordPayment', [REF1, OUTSIDER, PROVIDER_B, 1n]);
  // ...the legitimate CONSUMER can still record + rate REF1 (different (payer,ref) key).
  await chain.send(REP, reputation, RECORDER, 'recordPayment', [REF1, CONSUMER, PROVIDER_A, 1000n]);
  await chain.send(REP, reputation, CONSUMER, 'rate', [REF1, 5]);
  const score = await chain.call(REP, reputation, 'scoreOf', [PROVIDER_A]);
  assert.equal(score[0], 5n);
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

test('per-counterparty cap limits collusion: 11th rating reverts PairCapReached', async () => {
  const { chain, reputation, REP } = await setup();
  // 10 distinct paid refs from the same payer→provider all count...
  for (let i = 0; i < 10; i++) {
    const ref = id('collude-' + i);
    await chain.send(REP, reputation, RECORDER, 'recordPayment', [ref, CONSUMER, PROVIDER_A, 1000n]);
    await chain.send(REP, reputation, CONSUMER, 'rate', [ref, 5]);
  }
  // ...the 11th reverts rather than silently no-op'ing (so every Rated event counted).
  const ref11 = id('collude-10');
  await chain.send(REP, reputation, RECORDER, 'recordPayment', [ref11, CONSUMER, PROVIDER_A, 1000n]);
  await assert.rejects(chain.send(REP, reputation, CONSUMER, 'rate', [ref11, 5]), /PairCapReached/);
  const count = await chain.call(REP, reputation, 'ratingCount', [PROVIDER_A]);
  assert.equal(count[0], 10n);
});

test('recordPayment rejects re-recording a ref (no resetting the once-only rating)', async () => {
  const { chain, reputation, REP } = await setup();
  await chain.send(REP, reputation, RECORDER, 'recordPayment', [REF1, CONSUMER, PROVIDER_A, 1000n]);
  await chain.send(REP, reputation, CONSUMER, 'rate', [REF1, 5]);
  // attacker can't re-record REF1 to clear `rated` and rate again
  await assert.rejects(
    chain.send(REP, reputation, RECORDER, 'recordPayment', [REF1, CONSUMER, PROVIDER_A, 1000n]),
    /AlreadyRecorded/,
  );
});

test('recordPayment rejects self-dealing (payer == provider)', async () => {
  const { chain, reputation, REP } = await setup();
  await assert.rejects(
    chain.send(REP, reputation, RECORDER, 'recordPayment', [REF1, PROVIDER_A, PROVIDER_A, 1000n]),
    /SelfDeal/,
  );
});

test('recordPayment rejects zero-address payer/provider', async () => {
  const { chain, reputation, REP } = await setup();
  const ZERO = '0x' + '00'.repeat(20);
  await assert.rejects(
    chain.send(REP, reputation, RECORDER, 'recordPayment', [REF1, ZERO, PROVIDER_A, 1000n]),
    /ZeroAddress/,
  );
});

// ---- EIP-712 signed (trustless) payment recording ----

test('recordPaymentSigned: a relayer can record a payer-signed payment, then the payer rates', async () => {
  const { chain, reputation, REP } = await setup();
  const repHex = bytesToHex(reputation.bytes);
  const sig = await signAuth(repHex, REF1, PROVIDER_A, 1000n);
  // The RELAYER (RECORDER) submits — not the payer. The contract derives the payer from the sig.
  await chain.send(REP, reputation, RECORDER, 'recordPaymentSigned', [REF1, PROVIDER_A, 1000n, sig]);
  const p = (await chain.call(REP, reputation, 'getPayment', [PAYER_WALLET.address, REF1]))[0];
  assert.equal(p.payer.toLowerCase(), PAYER_WALLET.address.toLowerCase());
  // and only that payer (the signer) can rate it
  await chain.fund(PAYER_WALLET.address);
  await chain.send(REP, reputation, PAYER_WALLET.address, 'rate', [REF1, 5]);
  const score = await chain.call(REP, reputation, 'scoreOf', [PROVIDER_A]);
  assert.equal(score[0], 5n);
});

test('recordPaymentSigned: a relayer CANNOT fabricate a payment without the payer signature', async () => {
  const { chain, reputation, REP } = await setup();
  // 65 bytes of zeros is not a valid signature -> BadSignature (recorder cannot mint reputation).
  const bogus = '0x' + '00'.repeat(65);
  await assert.rejects(
    chain.send(REP, reputation, RECORDER, 'recordPaymentSigned', [REF1, PROVIDER_A, 1000n, bogus]),
    /BadSignature/,
  );
});

test('recordPaymentSigned: tampering the amount changes the recovered payer (cannot impersonate)', async () => {
  const { chain, reputation, REP } = await setup();
  const repHex = bytesToHex(reputation.bytes);
  const sig = await signAuth(repHex, REF1, PROVIDER_A, 1000n); // signed for 1000
  // Relayer submits a DIFFERENT amount with the same sig: ecrecover yields some other address,
  // so the payer recorded is NOT the real signer — the real payer's identity can't be hijacked.
  await chain.send(REP, reputation, RECORDER, 'recordPaymentSigned', [REF1, PROVIDER_A, 9_999_999n, sig]);
  const p = (await chain.call(REP, reputation, 'getPayment', [PAYER_WALLET.address, REF1]))[0];
  assert.notEqual(p.payer.toLowerCase(), PAYER_WALLET.address.toLowerCase());
});

test('recordPaymentSigned: self-deal (signer == provider) is rejected', async () => {
  const { chain, reputation, REP } = await setup();
  const repHex = bytesToHex(reputation.bytes);
  const sig = await signAuth(repHex, REF1, PAYER_WALLET.address, 1000n); // provider == signer
  await assert.rejects(
    chain.send(REP, reputation, RECORDER, 'recordPaymentSigned', [REF1, PAYER_WALLET.address, 1000n, sig]),
    /SelfDeal/,
  );
});

test('recordPaymentSigned: a signature for a DIFFERENT chainId does not credit the real payer (replay binding)', async () => {
  const { chain, reputation, REP } = await setup();
  const repHex = bytesToHex(reputation.bytes);
  // sign with the wrong chainId (999) — the on-chain domain uses chainId 1, so the
  // recovered signer differs from the real payer, who therefore can't rate it.
  const wrongDomain = { name: 'AnvitaMeshReputation', version: '1', chainId: 999, verifyingContract: repHex };
  const types = { PaymentAuth: [{ name: 'ref', type: 'bytes32' }, { name: 'provider', type: 'address' }, { name: 'amount', type: 'uint256' }] };
  const sig = await PAYER_WALLET.signTypedData(wrongDomain, types, { ref: REF1, provider: PROVIDER_A, amount: 1000n });
  await chain.send(REP, reputation, RECORDER, 'recordPaymentSigned', [REF1, PROVIDER_A, 1000n, sig]);
  const p = (await chain.call(REP, reputation, 'getPayment', [PAYER_WALLET.address, REF1]))[0];
  assert.notEqual(p.payer.toLowerCase(), PAYER_WALLET.address.toLowerCase()); // real payer NOT credited
});

test('recordPaymentSigned: a malleable (high-s) signature is rejected', async () => {
  const { chain, reputation, REP } = await setup();
  const repHex = bytesToHex(reputation.bytes);
  const sig = await signAuth(repHex, REF1, PROVIDER_A, 1000n);
  // Flip s to its high-s equivalent (N - s) and toggle v — the canonical malleability transform.
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const r = sig.slice(2, 66);
  const s = BigInt('0x' + sig.slice(66, 130));
  const vByte = parseInt(sig.slice(130, 132), 16);
  const s2 = (N - s).toString(16).padStart(64, '0');
  const v2 = (vByte === 27 ? 28 : 27).toString(16).padStart(2, '0');
  const malleable = '0x' + r + s2 + v2;
  await assert.rejects(
    chain.send(REP, reputation, RECORDER, 'recordPaymentSigned', [REF1, PROVIDER_A, 1000n, malleable]),
    /BadSignature/,
  );
});

test('getByTagPaged returns a bounded slice', async () => {
  const { chain, registry, R } = await setup();
  for (let i = 0; i < 5; i++) {
    await chain.send(R, registry, PROVIDER_A, 'register', [TAG_COMPUTE, `https://svc${i}.example`, 100n]);
  }
  const page = await chain.call(R, registry, 'getByTagPaged', [TAG_COMPUTE, 1n, 2n]);
  assert.equal(page[0].length, 2);
  const count = await chain.call(R, registry, 'tagCount', [TAG_COMPUTE]);
  assert.equal(count[0], 5n);
});
