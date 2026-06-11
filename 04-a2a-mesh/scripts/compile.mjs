#!/usr/bin/env node
// Compile contracts/*.sol with the solc npm package -> artifacts/<Name>.json.

import solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS_DIR = join(ROOT, 'contracts');
const OUT_DIR = join(ROOT, 'artifacts');

const sources = {};
for (const file of readdirSync(CONTRACTS_DIR)) {
  if (file.endsWith('.sol')) sources[file] = { content: readFileSync(join(CONTRACTS_DIR, file), 'utf8') };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === 'error');
for (const w of (out.errors || []).filter((e) => e.severity === 'warning')) console.warn('warning:', w.formattedMessage.trim());
if (errors.length) { for (const e of errors) console.error(e.formattedMessage.trim()); process.exit(1); }

mkdirSync(OUT_DIR, { recursive: true });
let count = 0;
for (const contracts of Object.values(out.contracts || {})) {
  for (const [name, c] of Object.entries(contracts)) {
    writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify({
      contractName: name, compiler: solc.version(), abi: c.abi, bytecode: '0x' + c.evm.bytecode.object,
    }, null, 2));
    console.log(`compiled ${name} (${c.evm.bytecode.object.length / 2} bytes) -> artifacts/${name}.json`);
    count++;
  }
}
console.log(`done: ${count} contract(s).`);
