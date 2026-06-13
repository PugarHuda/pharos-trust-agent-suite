#!/usr/bin/env node
// One-command setup for judges/anyone: install every skill's dependencies so `node demo.mjs` and the
// per-skill `npm test` work. Zero-dependency; just Node 18+. Usage:  node setup.mjs
import { spawnSync } from 'node:child_process';

const SKILLS = [
  '01-agent-treasury', '02-agent-shield', '03-agent-strategy', '04-a2a-mesh',
  '05-stylus-compute', '06-x402-facilitator', '07-agent-utils', '08-pharos-bazaar',
  '09-agent-escrow', '10-agent-validation', '11-reputation-gate', '12-intent-mandate', '13-agent-bond',
];

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
console.log(`Installing dependencies for ${SKILLS.length} skills (Node ${process.version})…\n`);
let failed = 0;
for (const dir of SKILLS) {
  process.stdout.write(`• ${dir} … `);
  const r = spawnSync(NPM, ['install', '--no-audit', '--no-fund', '--silent'],
    { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status === 0) console.log('ok');
  else { console.log('FAILED'); console.error((r.stderr || '').toString().slice(0, 300)); failed++; }
}

if (failed) { console.error(`\n${failed} skill(s) failed to install.`); process.exit(1); }
console.log(`\n✓ All ${SKILLS.length} skills installed. Now run the live demo (read-only, no keys):\n`);
console.log('    node demo.mjs\n');
console.log('  …or test any skill offline, e.g.:  cd 02-agent-shield && npm test');
