// Detector 3: approval guard. Pure local decode — no RPC needed.

import { MAX_UINT256 } from '../calldata.mjs';
import { classifyAddress } from '../registry.mjs';
import { makeFinding } from '../report.mjs';

const NEAR_UNLIMITED = MAX_UINT256 / 2n; // anything this large is "effectively unlimited"

export function checkApproval({ token, spender, amount }, registry, network) {
  const findings = [];

  const amt = typeof amount === 'bigint' ? amount
    : /^max$/i.test(String(amount)) ? MAX_UINT256
    : BigInt(amount);

  const spenderClass = classifyAddress(spender, registry, network);

  if (amt >= NEAR_UNLIMITED) {
    const sev = spenderClass.status === 'official' || spenderClass.status === 'known-good'
      ? 'medium' : 'high';
    findings.push(makeFinding(sev, 'Unlimited approval',
      `approve(${spender}, type(uint256).max) — a compromised or malicious spender can drain the full balance at any time. Use an exact-amount approval instead.`));
  }

  if (spenderClass.status === 'unknown') {
    findings.push(makeFinding('high', 'Approval to unverified spender',
      `spender ${spender} is not in the official/known-good registry for ${network}.`));
  } else if (spenderClass.status === 'poisoning-suspect') {
    findings.push(makeFinding('high', 'Spender is a look-alike of a trusted address',
      `${spender} matches ${spenderClass.lookalike.label} (${spenderClass.lookalike.address}) on prefix/suffix but differs in the middle — classic address poisoning.`));
  } else {
    findings.push(makeFinding('info', 'Spender recognized',
      `${spender} = ${spenderClass.label} (${spenderClass.status}).`));
  }

  if (token) {
    const tokenClass = classifyAddress(token, registry, network);
    if (tokenClass.status === 'poisoning-suspect') {
      findings.push(makeFinding('high', 'Token is a look-alike of a trusted address',
        `${token} resembles ${tokenClass.lookalike.label} (${tokenClass.lookalike.address}).`));
    } else if (tokenClass.status === 'unknown') {
      findings.push(makeFinding('low', 'Token not in registry',
        `${token} is not a registered Pharos token — verify it is the asset you intend to approve.`));
    }
  }

  return findings;
}
