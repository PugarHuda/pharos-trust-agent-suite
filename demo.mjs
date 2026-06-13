#!/usr/bin/env node
// One-command live demo driver for the recording. Runs the suite's REAL, read-only
// commands against the deployed Atlantic contracts (no writes, no keys, safe on camera),
// then points at the on-chain tx hashes for the full agent-commerce loop.
//
//   node demo.mjs
//
// Narrate each section; open the printed Pharosscan links live.

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REG = '0xa4d6d9932B19f9B03D0439264F1188F39F8522f0';
const REP = '0x8010e567b6f68dcfD19312644F1c3E6249b43ef7';
const TREASURY = '0x0954E50cBC85836C9E3FC6868d24b6118d974E9d';
const DEMO_TOKEN = '0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0';

function step(title, dir, cmd) {
  console.log(`\n\x1b[1;36m=== ${title} ===\x1b[0m`);
  console.log(`\x1b[2m$ ${cmd}\x1b[0m`);
  try { console.log(execSync(cmd, { cwd: join(ROOT, dir), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()); }
  catch (e) { console.log((e.stdout || '').trim() || `(exited ${e.status})`); } // non-zero exit (e.g. shield fail / gate block) is expected
}

console.log('\x1b[1m Pharos Trust-First Agent Suite — live demo (10 skills, 198 tests, CI green)\x1b[0m');

step('1. agent-utils — live BTC/USD price (oracle, read-only)', '07-agent-utils',
  'node scripts/utils.mjs price --feed BTC/USD');

step('2. agent-shield — block a malicious approval (unlimited to unknown spender)', '02-agent-shield',
  'node scripts/shield.mjs check-approval --token 0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B --spender 0x9999999999999999999999999999999999999999 --amount max');

step('3. agent-strategy — live oracle drives a trade decision', '03-agent-strategy',
  'node scripts/strategy.mjs eval --rule "sell WBTC when price > 60000" --feed BTC/USD');

step('4. agent-treasury — live policy state (on-chain cap + session)', '01-agent-treasury',
  `node scripts/treasury.mjs status --treasury ${TREASURY} --token ${DEMO_TOKEN}`);

step('5. stylus-compute — risk model gates an action (BLOCK)', '05-stylus-compute',
  'node scripts/compute.mjs gate --features 1,1,1,1');

step('6. pharos-bazaar — discover services ranked by on-chain reputation', '08-pharos-bazaar',
  `node scripts/bazaar.mjs discover --registry ${REG} --reputation ${REP} --tag price-feed`);

const ESCROW = '0x5919e995b29Bf81B322171769C9e63c5964258A7';
step('6d. agent-escrow — a hire settled on-chain (read the released job)', '09-agent-escrow',
  `node scripts/escrow.mjs status --escrow ${ESCROW} --job live-release-1`);

const VALREG = '0xc9142C347b51Bd2f89f943BcEae5D302A14f5B88';
const ESCROW_JOB = '0x31d03e57eacd074b8ec94b27d8c8440cc245600d6d87c93314f4ac2624d35177';
step('6e. agent-validation — ERC-8004 validator scored that hired work (read)', '10-agent-validation',
  `node scripts/validate.mjs get --validation ${VALREG} --data ${ESCROW_JOB}`);

// Opt-in live WRITE segment (broadcasts real txs; needs 01-agent-treasury/.env).
// Default demo is read-only/safe; pass --write to include this on camera.
if (process.argv.includes('--write')) {
  const SVC = '0x000000000000000000000000000000000000C0DE';      // allow-listed service
  const ATTACKER = '0x000000000000000000000000000000000000dEaD';  // NOT allow-listed
  step('6b. agent-treasury — a policy-allowed spend EXECUTES (live write tx)', '01-agent-treasury',
    `node scripts/treasury.mjs spend --treasury ${TREASURY} --token ${DEMO_TOKEN} --to ${SVC} --amount 1`);
  step('6c. agent-treasury — an out-of-policy spend is BLOCKED before broadcast', '01-agent-treasury',
    `node scripts/treasury.mjs spend --treasury ${TREASURY} --token ${DEMO_TOKEN} --to ${ATTACKER} --amount 1`);
}

console.log(`\n\x1b[1;36m=== 7. The full agent-commerce loop (already on-chain — open on Pharosscan) ===\x1b[0m`);
for (const [label, tx] of [
  ['gasless x402 settle (EIP-3009)', '0x873f98cf344dcffb8268fba0673933091be9805d4944c693616c433306a5225b'],
  ['record settlement in the mesh', '0xbc8940027763de6d9a2d645d3188713609e1736bdcd8f15d600b4a75fcf49c0b'],
  ['payer rates -> reputation 10/100', '0xc97221b6c1797be3b61986976b183d8522481f2ad1b86e92c73cd1c6689d5fb0'],
]) console.log(`  ${label}:\n    https://atlantic.pharosscan.xyz/tx/${tx}`);

console.log('\n\x1b[1mdiscover -> pay (gasless) -> settle -> record -> rate -> reputation. The trust layer for the Pharos agent economy.\x1b[0m');
