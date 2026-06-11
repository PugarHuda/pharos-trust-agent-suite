// Calldata decoding for the small ABI set Shield cares about.
// Selectors are fixed constants, so no keccak implementation is needed.

export const MAX_UINT256 = (1n << 256n) - 1n;

export const SELECTORS = {
  '0xa9059cbb': { name: 'transfer', args: ['address', 'uint256'] },
  '0x095ea7b3': { name: 'approve', args: ['address', 'uint256'] },
  '0x23b872dd': { name: 'transferFrom', args: ['address', 'address', 'uint256'] },
  '0x39509351': { name: 'increaseAllowance', args: ['address', 'uint256'] },
  '0xd505accf': { name: 'permit', args: ['address', 'address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'] },
  // Permit2 approve(address token, address spender, uint160 amount, uint48 expiration)
  '0x87517c45': { name: 'permit2.approve', args: ['address', 'address', 'uint160', 'uint48'] },
  // ERC-721/1155 operator approval — a common NFT-drain vector
  '0xa22cb465': { name: 'setApprovalForAll', args: ['address', 'bool'] },
};

// Bit-width of an approval amount param, used to judge "effectively unlimited"
// against the right ceiling (uint256 max vs Permit2's uint160 max).
export const APPROVAL_AMOUNT_BITS = {
  approve: 256,
  increaseAllowance: 256,
  permit: 256,
  'permit2.approve': 160,
};

export function isHexString(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value);
}

export function isAddress(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function normalizeAddress(value) {
  if (!isAddress(value)) throw new Error(`not an address: ${value}`);
  return value.toLowerCase();
}

function decodeWord(word, type) {
  if (type === 'address') return '0x' + word.slice(24);
  if (type === 'bool') return BigInt('0x' + word) !== 0n;
  if (type.startsWith('uint')) return BigInt('0x' + word);
  return '0x' + word; // bytes32 and anything else: raw
}

// Decode calldata against the known selector set. Returns
// { selector, name, params: [...] } or null when the selector is unknown.
export function decodeCalldata(data) {
  if (!isHexString(data) || data.length < 10) return null;
  const selector = data.slice(0, 10).toLowerCase();
  const abi = SELECTORS[selector];
  if (!abi) return null;
  const body = data.slice(10);
  const params = abi.args.map((type, i) => {
    const word = body.slice(i * 64, (i + 1) * 64).padEnd(64, '0');
    return decodeWord(word, type);
  });
  return { selector, name: abi.name, params };
}

// Scan all 32-byte words of calldata for things shaped like addresses
// (12 zero bytes followed by 20 non-zero bytes). Used to feed the
// registry/poisoning detector with every address a tx touches.
//
// A small uint (e.g. a transfer amount like 1_000_000) ABI-encodes to mostly
// zero bytes and would match the address shape, producing a bogus address with
// a long zero run. We skip words whose 20-byte tail has > 30 leading zero
// nibbles, which are far more likely to be small integers than real addresses.
export function extractAddresses(data) {
  const found = new Set();
  if (!isHexString(data) || data.length <= 10) return [];
  const body = data.slice(10);
  for (let i = 0; i + 64 <= body.length; i += 64) {
    const word = body.slice(i, i + 64);
    if (/^0{24}[0-9a-fA-F]{40}$/.test(word) && !/^0+$/.test(word)) {
      const tail = word.slice(24); // 40 hex chars = the candidate address
      const leadingZeros = tail.length - tail.replace(/^0+/, '').length;
      if (leadingZeros > 30) continue; // looks like a small integer, not an address
      found.add('0x' + tail.toLowerCase());
    }
  }
  return [...found];
}

export function formatUnits(amount, decimals) {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}
