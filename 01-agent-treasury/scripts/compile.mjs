#!/usr/bin/env node
// Compile contracts/*.sol with the solc npm package and write artifacts to
// artifacts/<Name>.json ({ abi, bytecode }). No Foundry/solc binary needed.

import solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS_DIR = join(ROOT, 'contracts');
const OUT_DIR = join(ROOT, 'artifacts');

const sources = {};
for (const file of readdirSync(CONTRACTS_DIR)) {
  if (file.endsWith('.sol')) {
    sources[file] = { content: readFileSync(join(CONTRACTS_DIR, file), 'utf8') };
  }
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'cancun', // Pharos opcodes align with Ethereum
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (out.errors || []).filter((e) => e.severity === 'error');
const warnings = (out.errors || []).filter((e) => e.severity === 'warning');
for (const w of warnings) console.warn('warning:', w.formattedMessage.trim());
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage.trim());
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
let count = 0;
for (const [file, contracts] of Object.entries(out.contracts || {})) {
  for (const [name, c] of Object.entries(contracts)) {
    const artifact = {
      contractName: name,
      sourceFile: file,
      compiler: solc.version(),
      abi: c.abi,
      bytecode: '0x' + c.evm.bytecode.object,
    };
    writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(artifact, null, 2));
    console.log(`compiled ${name} (${(c.evm.bytecode.object.length / 2)} bytes) -> artifacts/${name}.json`);
    count++;
  }
}
console.log(`done: ${count} contract(s).`);
