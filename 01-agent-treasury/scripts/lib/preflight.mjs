// Shield pre-flight hook. Before a session key spends, we (a) verify the token
// and destination against agent-shield's registry, and (b) static-call the
// treasury transaction so a policy violation is caught BEFORE broadcasting
// (saving gas — Pharos charges by gas_limit even on revert).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SHIELD = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '02-agent-shield', 'scripts', 'shield.mjs',
);

// Run `shield verify-address` for a single address. Returns { available, ok, output }.
function shieldVerify(address, network) {
  if (!existsSync(SHIELD)) return { available: false };
  const res = spawnSync(process.execPath, [SHIELD, 'verify-address', '--address', address, '--network', network],
    { encoding: 'utf8' });
  return { available: true, ok: res.status === 0, code: res.status, output: (res.stdout || '').trim() };
}

export async function preflight({ contract, method, args, destination, token, network, provider }) {
  const lines = [];
  let blocked = false;

  // 1. Registry checks via shield (advisory: poisoning => block).
  for (const [label, addr] of [['token', token], ['destination', destination]]) {
    if (!addr) continue;
    const v = shieldVerify(addr, network);
    if (!v.available) { lines.push(`  shield: not found (skipped ${label} check)`); continue; }
    const verdictLine = (v.output.split('\n')[0] || '').replace('verdict: ', '');
    lines.push(`  shield ${label} ${addr}: ${verdictLine}`);
    if (v.code === 2) { blocked = true; lines.push(`    -> FAIL on ${label} (${v.output.split('\n').find((l) => l.includes('title')) || ''})`); }
  }

  // 2. Static-call the actual treasury tx; a policy revert shows up here.
  try {
    await contract[method].staticCall(...args);
    lines.push('  simulation: OK (policy allows this call)');
  } catch (err) {
    blocked = true;
    const reason = err.revert?.name || err.shortMessage || err.message;
    lines.push(`  simulation: REVERT -> ${reason}`);
  }

  return { blocked, report: lines.join('\n') };
}
