// Pure, read-only helper logic for the high-frequency utility skills every agent
// calls (price, gas, token, address-safety). No network, no keys — unit-testable.

// --- gas ---------------------------------------------------------------------
// Pharos charges by gas_limit at inclusion (refunds don't reduce the charge), so
// the right move is a tight buffer over the estimate — not a huge over-provision.
export function suggestGasLimit(estimate, bufferBps = 1500n) {
  const e = BigInt(estimate);
  if (e <= 0n) throw new Error('estimate must be > 0');
  return (e * (10000n + BigInt(bufferBps))) / 10000n;
}

// Total fee (wei) = gasLimit * gasPrice, since Pharos charges by limit.
export function totalFee(gasLimit, gasPriceWei) {
  return BigInt(gasLimit) * BigInt(gasPriceWei);
}

// --- price (BigInt scaling, no float corruption for 18-dec feeds) ------------
export function scalePrice(answer, decimals, microDecimals = 6) {
  const a = BigInt(answer);
  if (a <= 0n) throw new Error('non-positive price');
  const micro = (a * 10n ** BigInt(microDecimals)) / 10n ** BigInt(decimals);
  return { price: Number(micro) / 10 ** microDecimals, micro };
}

// --- units -------------------------------------------------------------------
export function formatUnits(amount, decimals) {
  const neg = BigInt(amount) < 0n;
  const v = neg ? -BigInt(amount) : BigInt(amount);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(Number(decimals), '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

// --- address safety: poisoning / registry classification ---------------------
export function isAddress(v) { return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v); }
export function normalize(v) { if (!isAddress(v)) throw new Error(`not an address: ${v}`); return v.toLowerCase(); }

function matchEnds(a, b) {
  let prefix = 0; while (prefix < 40 && a[prefix] === b[prefix]) prefix++;
  let suffix = 0; while (suffix < 40 - prefix && a[39 - suffix] === b[39 - suffix]) suffix++;
  return { prefix, suffix };
}

// Classify an address against a {address: label} registry, flagging poisoning
// look-alikes (shared visible ends, different middle, with real non-zero prefix).
export function classifyAddress(address, registry, { minMatch = 6, minNonZeroPrefix = 3 } = {}) {
  const addr = normalize(address);
  const known = Object.entries(registry).filter(([a]) => isAddress(a)).map(([a, label]) => ({ a: a.toLowerCase(), label }));
  const exact = known.find((k) => k.a === addr);
  if (exact) return { status: 'known', label: exact.label };
  const body = addr.slice(2);
  for (const k of known) {
    const { prefix, suffix } = matchEnds(body, k.a.slice(2));
    const nonZero = body.slice(0, prefix).replace(/0/g, '').length;
    // (a) classic: both visible ends match with real (non-zero) prefix chars; OR
    // (b) a very long prefix or suffix match alone (an attacker who reproduced most of
    //     the address but differs early/late) — catches look-alikes the prefix+nonZero
    //     rule would miss when divergence is at one end.
    const classic = prefix >= minMatch && suffix >= minMatch && nonZero >= minNonZeroPrefix;
    const longEnd = (suffix >= 30 || prefix >= 30) && (prefix + suffix) >= 32;
    if (classic || longEnd) {
      return { status: 'poisoning-suspect', lookalike: { address: '0x' + k.a.slice(2), label: k.label, prefix, suffix } };
    }
  }
  return { status: 'unknown' };
}
