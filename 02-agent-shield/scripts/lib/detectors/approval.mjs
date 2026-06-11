// Detector 3: approval guard. Pure local decode — no RPC needed.
// Handles ERC-20 approve / increaseAllowance / EIP-2612 permit, Permit2 approve,
// and ERC-721/1155 setApprovalForAll.

import { MAX_UINT256, APPROVAL_AMOUNT_BITS } from '../calldata.mjs';
import { classifyAddress } from '../registry.mjs';
import { makeFinding } from '../report.mjs';

// "Effectively unlimited" relative to the param's own bit width: half of its max.
function isEffectivelyUnlimited(amount, bits = 256) {
  const max = (1n << BigInt(bits)) - 1n;
  return amount >= max / 2n;
}

function classifySpender(spender, registry, network, findings) {
  const cls = classifyAddress(spender, registry, network);
  if (cls.status === 'unknown') {
    findings.push(makeFinding('high', 'Approval to unverified spender',
      `spender ${spender} is not in the official/known-good registry for ${network}.`));
  } else if (cls.status === 'poisoning-suspect') {
    findings.push(makeFinding('high', 'Spender is a look-alike of a trusted address',
      `${spender} matches ${cls.lookalike.label} (${cls.lookalike.address}) on prefix/suffix but differs in the middle — classic address poisoning.`));
  } else {
    findings.push(makeFinding('info', 'Spender recognized',
      `${spender} = ${cls.label} (${cls.status}).`));
  }
  return cls;
}

// Programmatic check used by `check-approval` and (via checkApprovalFromDecoded)
// by `check-tx` when it decodes an approval-shaped call.
export function checkApproval({ token, spender, amount, kind = 'approve' }, registry, network) {
  const findings = [];
  const amt = typeof amount === 'bigint' ? amount
    : /^max$/i.test(String(amount)) ? MAX_UINT256
    : BigInt(amount);

  const spenderClass = classifySpender(spender, registry, network, findings);
  const bits = APPROVAL_AMOUNT_BITS[kind] ?? 256;

  if (isEffectivelyUnlimited(amt, bits)) {
    const sev = spenderClass.status === 'official' || spenderClass.status === 'known-good'
      ? 'medium' : 'high';
    findings.push(makeFinding(sev, 'Unlimited approval',
      `${kind} grants an effectively unlimited allowance (>= 2^${bits - 1}) — a compromised or malicious spender can drain the full balance at any time. Use an exact-amount approval instead.`));
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

// setApprovalForAll(operator, approved) — operator-level NFT approval.
export function checkSetApprovalForAll({ token, operator, approved }, registry, network) {
  const findings = [];
  if (!approved) {
    findings.push(makeFinding('info', 'Operator approval revoked', `setApprovalForAll(${operator}, false).`));
    return findings;
  }
  const cls = classifySpender(operator, registry, network, findings);
  const sev = cls.status === 'official' || cls.status === 'known-good' ? 'medium' : 'high';
  findings.push(makeFinding(sev, 'Blanket operator approval (setApprovalForAll)',
    `setApprovalForAll(${operator}, true) grants control over ALL of this collection's tokens${token ? ` at ${token}` : ''} — a top NFT-drain vector. Approve per-token where possible.`));
  return findings;
}

// Bridge from a decoded calldata object (check-tx path) to the right guard.
// `to` is the contract the tx targets (the token / Permit2 contract).
export function checkApprovalFromDecoded(decoded, to, registry, network) {
  switch (decoded.name) {
    case 'approve':
      return checkApproval({ token: to, spender: decoded.params[0], amount: decoded.params[1], kind: 'approve' }, registry, network);
    case 'increaseAllowance':
      return checkApproval({ token: to, spender: decoded.params[0], amount: decoded.params[1], kind: 'increaseAllowance' }, registry, network);
    case 'permit':
      // permit(owner, spender, value, deadline, v, r, s)
      return checkApproval({ token: to, spender: decoded.params[1], amount: decoded.params[2], kind: 'permit' }, registry, network);
    case 'permit2.approve':
      // permit2.approve(token, spender, amount, expiration)
      return checkApproval({ token: decoded.params[0], spender: decoded.params[1], amount: decoded.params[2], kind: 'permit2.approve' }, registry, network);
    case 'setApprovalForAll':
      return checkSetApprovalForAll({ token: to, operator: decoded.params[0], approved: decoded.params[1] }, registry, network);
    default:
      return [];
  }
}
