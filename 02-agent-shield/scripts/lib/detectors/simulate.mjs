// Detector 1: simulate & diff via eth_call (read-only).
//
// What it checks:
//  - the call succeeds against current state (captures revert reason if not)
//  - calldata sent to an address with no code (wrong network / EOA) -> fail
//  - decoded intent summary (transfer/approve/...) as an info finding
//  - honeypot heuristic: after a token interaction, simulate the *reverse*
//    transfer (can `from` move 1 unit of the token out?) — a token you can
//    receive but never send is the canonical honeypot.

import { decodeCalldata, formatUnits, isHexString } from '../calldata.mjs';
import { decodeRevertReason, RpcError } from '../rpc.mjs';
import { makeFinding } from '../report.mjs';

const TRANSFER_SELECTOR = '0xa9059cbb';

function encodeTransfer(to, amount) {
  return TRANSFER_SELECTOR
    + to.slice(2).toLowerCase().padStart(64, '0')
    + amount.toString(16).padStart(64, '0');
}

export async function simulateTx({ from, to, data = '0x', value = 0n }, rpc, { tokenForSellCheck } = {}) {
  const findings = [];
  const valueHex = '0x' + BigInt(value).toString(16);

  // 1. Calldata to a codeless address is almost always a mistake or a trap.
  if (isHexString(data) && data.length > 2) {
    let code;
    try {
      code = await rpc.getCode(to);
    } catch (err) {
      // A transient RPC failure on getCode should degrade gracefully, not crash the command.
      findings.push(makeFinding('medium', 'Could not fetch contract code',
        `${to}: ${err.message} — code/simulation checks skipped.`));
      return findings;
    }
    if (!code || code === '0x') {
      findings.push(makeFinding('high', 'Calldata sent to an address with no code',
        `${to} has no contract code on this network — the call would silently succeed and do nothing (or you are on the wrong network).`));
      return findings; // nothing meaningful to simulate
    }
  }

  // 2. Decode intent for the human-readable summary.
  const decoded = decodeCalldata(data);
  if (decoded) {
    const summary = `${decoded.name}(${decoded.params.map(String).join(', ')})`;
    findings.push(makeFinding('info', 'Decoded intent', summary));
  }

  // 3. Simulate.
  try {
    await rpc.call({ from, to, data, value: valueHex });
    findings.push(makeFinding('info', 'Simulation succeeded', 'eth_call against latest state did not revert.'));
  } catch (err) {
    const reason = err instanceof RpcError ? decodeRevertReason(err.data) || err.message : err.message;
    findings.push(makeFinding('high', 'Transaction reverts in simulation', reason));
    return findings;
  }

  // 4. Honeypot heuristic: simulate selling/moving the token back out.
  // Only auto-derive the token for a plain `transfer` (where `to` is the token the
  // caller is interacting with). For `transferFrom` the reverse check would falsely
  // fire (the caller may hold none of that token), so require an explicit
  // --check-sell-token there. See FP notes in SPEC.
  const token = tokenForSellCheck
    || (decoded && decoded.name === 'transfer' ? to : null);
  if (token && from) {
    try {
      await rpc.call({ from, to: token, data: encodeTransfer(from, 1n) });
      findings.push(makeFinding('info', 'Reverse-transfer check passed',
        `${from} can move this token out — no transfer-lock honeypot detected.`));
    } catch (err) {
      const reason = err instanceof RpcError ? decodeRevertReason(err.data) || err.message : err.message;
      findings.push(makeFinding('medium', 'Cannot simulate moving this token out (honeypot heuristic)',
        `transfer() from ${from} reverts: ${reason}. A token you can receive but not send is the classic honeypot shape. (Note: also triggers if the balance is simply 0.)`));
    }
  }

  // 5. Native value outflow summary.
  if (BigInt(value) > 0n) {
    findings.push(makeFinding('info', 'Native outflow',
      `-${formatUnits(BigInt(value), 18)} PHRS to ${to}.`));
  }

  return findings;
}
