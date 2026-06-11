// Detector 2: registry verification + address poisoning, applied to every
// address a transaction touches (to, decoded params, raw calldata words).

import { classifyAddress } from '../registry.mjs';
import { makeFinding } from '../report.mjs';

export function checkAddresses(addresses, registry, network) {
  const findings = [];
  const seen = new Set();
  for (const { address, role } of addresses) {
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const cls = classifyAddress(address, registry, network);
    if (cls.status === 'poisoning-suspect') {
      findings.push(makeFinding('high', `Address poisoning suspect (${role})`,
        `${address} shares ${cls.lookalike.prefix}-char prefix and ${cls.lookalike.suffix}-char suffix with ${cls.lookalike.label} (${cls.lookalike.address}) but is NOT that address.`));
    } else if (cls.status === 'official' || cls.status === 'known-good') {
      findings.push(makeFinding('info', `${role} recognized`,
        `${address} = ${cls.label} (${cls.status}).`));
    } else if (role === 'to' || role === 'token' || role === 'spender') {
      findings.push(makeFinding('medium', `Unverified ${role} address`,
        `${address} is not in the official/known-good registry for ${network}.`));
    }
    // unknown addresses in minor roles (e.g. transfer recipient) stay silent —
    // sending to a fresh EOA is normal; only look-alikes are dangerous.
  }
  return findings;
}
