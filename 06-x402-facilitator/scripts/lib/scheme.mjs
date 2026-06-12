// x402 "exact-evm" scheme over EIP-3009 transferWithAuthorization.
//
// The payer signs an EIP-712 TransferWithAuthorization for the settlement token
// (USDC-style, EIP-3009). The facilitator later submits it on-chain, so the payer
// spends no gas. This module builds, signs, and verifies that authorization — the
// security-critical core, all pure (no network), so it is fully unit-tested.

import { Wallet, verifyTypedData, getAddress, isAddress } from 'ethers';

export const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

// EIP-712 domain for the settlement token (name/version are the token's, per EIP-3009).
export function tokenDomain({ name, version = '1', chainId, token }) {
  return { name, version, chainId, verifyingContract: getAddress(token) };
}

// Build the authorization object an agent wants signed.
export function buildAuthorization({ from, to, value, validAfter = 0, validBefore, nonce }) {
  if (!isAddress(from) || !isAddress(to)) throw new Error('from/to must be addresses');
  return {
    from: getAddress(from),
    to: getAddress(to),
    value: BigInt(value),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce,
  };
}

// Payer signs the authorization -> a full x402 payment payload.
export async function signPayment(privateKey, domain, authorization) {
  const wallet = new Wallet(privateKey.startsWith('0x') ? privateKey : '0x' + privateKey);
  const signature = await wallet.signTypedData(domain, EIP3009_TYPES, authorization);
  return {
    x402Version: 1,
    scheme: 'exact-evm',
    network: `eip155:${domain.chainId}`,
    payload: { signature, authorization: serializeAuth(authorization) },
  };
}

function serializeAuth(a) {
  return {
    from: a.from, to: a.to, value: a.value.toString(),
    validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), nonce: a.nonce,
  };
}

function parseAuth(a) {
  return {
    from: getAddress(a.from), to: getAddress(a.to), value: BigInt(a.value),
    validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce,
  };
}

// Verify a payment payload against the resource's requirements WITHOUT touching chain.
// requirements: { scheme, network, maxAmountRequired, asset, payTo }
// Returns { isValid: bool, reason?: string, payer?: address }.
export function verifyPayment(payment, requirements, domain, { now = Math.floor(Date.now() / 1000) } = {}) {
  try {
    if (payment.scheme !== requirements.scheme) return fail(`scheme mismatch: ${payment.scheme} != ${requirements.scheme}`);
    if (payment.network !== requirements.network) return fail(`network mismatch: ${payment.network} != ${requirements.network}`);

    const auth = parseAuth(payment.payload.authorization);

    if (auth.to.toLowerCase() !== getAddress(requirements.payTo).toLowerCase()) {
      return fail('recipient (to) does not match payTo');
    }
    if (auth.value < BigInt(requirements.maxAmountRequired)) {
      return fail(`value ${auth.value} below required ${requirements.maxAmountRequired}`);
    }
    if (getAddress(domain.verifyingContract).toLowerCase() !== getAddress(requirements.asset).toLowerCase()) {
      return fail('asset (token) does not match the signing domain');
    }
    if (now < auth.validAfter) return fail('authorization not yet valid (validAfter in the future)');
    if (now >= auth.validBefore) return fail('authorization expired (validBefore passed)');

    const recovered = verifyTypedData(domain, EIP3009_TYPES, auth, payment.payload.signature);
    if (recovered.toLowerCase() !== auth.from.toLowerCase()) {
      return fail('signature does not recover to the authorization `from` (payer)');
    }
    return { isValid: true, payer: recovered };
  } catch (err) {
    return fail(`malformed payment: ${err.message}`);
  }
}

function fail(reason) { return { isValid: false, reason }; }

export { parseAuth };
