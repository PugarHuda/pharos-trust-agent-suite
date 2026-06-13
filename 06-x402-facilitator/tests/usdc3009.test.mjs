import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, hexlify, getBytes, Signature, id } from 'ethers';
import { bytesToHex } from '@ethereumjs/util';
import { Chain, USDC, CHAIN_ID } from './evm.mjs';

const PAYER = new Wallet('0x' + '44'.repeat(32));
const MERCHANT = '0x' + 'bb'.repeat(20);
const RELAYER = '0x' + 'ee'.repeat(20);
const NONCE = hexlify(Uint8Array.from({ length: 32 }, (_, i) => i + 1));

const TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
  ],
};

async function setup() {
  const chain = await Chain.create();
  await chain.fund(RELAYER);
  const token = await chain.deploy(USDC, RELAYER);
  await chain.send(USDC, token, RELAYER, 'mint', [PAYER.address, 1_000_000n]);
  return { chain, token };
}

async function sign(token, chain, over = {}) {
  const auth = { from: PAYER.address, to: MERCHANT, value: 1000n, validAfter: 0n, validBefore: BigInt(chain.now + 600), nonce: NONCE, ...over };
  const domain = { name: 'USD Coin', version: '2', chainId: CHAIN_ID, verifyingContract: bytesToHex(token.bytes) };
  const sig = Signature.from(await PAYER.signTypedData(domain, TYPES, auth));
  return { auth, v: sig.v, r: sig.r, s: sig.s };
}
const argsOf = (a, v, r, s) => [a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, v, r, s];

test('a valid EIP-3009 authorization settles (gasless for payer): balances move', async () => {
  const { chain, token } = await setup();
  const { auth, v, r, s } = await sign(token, chain);
  await chain.send(USDC, token, RELAYER, 'transferWithAuthorization', argsOf(auth, v, r, s)); // relayer pays gas
  assert.equal((await chain.call(USDC, token, 'balanceOf', [MERCHANT]))[0], 1000n);
  assert.equal((await chain.call(USDC, token, 'balanceOf', [PAYER.address]))[0], 999_000n);
  assert.equal((await chain.call(USDC, token, 'authorizationState', [PAYER.address, NONCE]))[0], true);
});

test('replay of the same authorization reverts', async () => {
  const { chain, token } = await setup();
  const { auth, v, r, s } = await sign(token, chain);
  await chain.send(USDC, token, RELAYER, 'transferWithAuthorization', argsOf(auth, v, r, s));
  await assert.rejects(
    chain.send(USDC, token, RELAYER, 'transferWithAuthorization', argsOf(auth, v, r, s)),
    /authorization used/,
  );
});

test('expired / not-yet-valid authorizations revert', async () => {
  const { chain, token } = await setup();
  const expired = await sign(token, chain, { validBefore: BigInt(chain.now - 1), nonce: id('n2') });
  await assert.rejects(chain.send(USDC, token, RELAYER, 'transferWithAuthorization', argsOf(expired.auth, expired.v, expired.r, expired.s)), /expired/);
  const future = await sign(token, chain, { validAfter: BigInt(chain.now + 100), nonce: id('n3') });
  await assert.rejects(chain.send(USDC, token, RELAYER, 'transferWithAuthorization', argsOf(future.auth, future.v, future.r, future.s)), /not yet valid/);
});

test('a signature for the WRONG chainId does not verify (replay binding)', async () => {
  const { chain, token } = await setup();
  const auth = { from: PAYER.address, to: MERCHANT, value: 1000n, validAfter: 0n, validBefore: BigInt(chain.now + 600), nonce: id('n4') };
  const wrongDomain = { name: 'USD Coin', version: '2', chainId: 999, verifyingContract: bytesToHex(token.bytes) };
  const sig = Signature.from(await PAYER.signTypedData(wrongDomain, TYPES, auth));
  await assert.rejects(chain.send(USDC, token, RELAYER, 'transferWithAuthorization', argsOf(auth, sig.v, sig.r, sig.s)), /bad signature/);
});

test('a malleable high-s signature is rejected (EIP-2 guard)', async () => {
  const { chain, token } = await setup();
  const { auth, v, r, s } = await sign(token, chain, { nonce: id('n5') });
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const s2 = '0x' + (N - BigInt(s)).toString(16).padStart(64, '0');
  const v2 = v === 27 ? 28 : 27;
  await assert.rejects(chain.send(USDC, token, RELAYER, 'transferWithAuthorization', argsOf(auth, v2, r, s2)), /bad s/);
});
