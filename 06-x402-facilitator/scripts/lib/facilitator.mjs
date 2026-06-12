// Facilitator: the /verify and /settle logic. verify() is pure (delegates to the
// scheme). settle() submits the EIP-3009 transferWithAuthorization on-chain using
// the facilitator's own key as the gas payer, so the PAYER spends no gas — the core
// of the x402 "agents pay each other" UX.

import { Contract } from 'ethers';
import { verifyPayment, parseAuth } from './scheme.mjs';

const EIP3009_ABI = [
  'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
  'function name() view returns (string)',
];

export function verify(payment, requirements, domain, opts) {
  return verifyPayment(payment, requirements, domain, opts);
}

// Split a 65-byte 0x signature into { v, r, s } for the on-chain call.
export function splitSignature(sig) {
  const hex = sig.startsWith('0x') ? sig.slice(2) : sig;
  if (hex.length !== 130) throw new Error('signature must be 65 bytes');
  const r = '0x' + hex.slice(0, 64);
  const s = '0x' + hex.slice(64, 128);
  let v = parseInt(hex.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}

// Settle: submit the authorization on-chain. `signer` is the facilitator's funded
// wallet (gas payer). Returns { success, txHash } or { success:false, reason }.
export async function settle(payment, domain, signer, { gasBufferBps = 1500n } = {}) {
  const auth = parseAuth(payment.payload.authorization);
  const { v, r, s } = splitSignature(payment.payload.signature);
  const token = new Contract(domain.verifyingContract, EIP3009_ABI, signer);

  // Don't waste gas if the nonce is already used (idempotency / replay guard).
  try {
    const used = await token.authorizationState(auth.from, auth.nonce);
    if (used) return { success: false, reason: 'authorization nonce already used (replay)' };
  } catch { /* token may not expose authorizationState; proceed */ }

  const args = [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, v, r, s];
  let gas;
  try {
    gas = await token.transferWithAuthorization.estimateGas(...args);
  } catch (err) {
    return { success: false, reason: `settle would revert: ${err.shortMessage || err.message}` };
  }
  const tx = await token.transferWithAuthorization(...args, { gasLimit: (gas * (10000n + gasBufferBps)) / 10000n });
  const rc = await tx.wait();
  return { success: true, txHash: tx.hash, block: rc.blockNumber };
}
