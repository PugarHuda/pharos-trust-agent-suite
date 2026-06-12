#!/usr/bin/env node
// Deploy a MockERC20 ("demo token") and mint to an address, so the full treasury
// success path (a policy-allowed spend that actually moves tokens) can be shown
// on-chain without needing a faucet for canonical USDC. Demo/testing only.
//
//   node scripts/deploy-demo-token.mjs --to 0xTREASURY --mint 100
//
// Reads OWNER_PRIVATE_KEY from .env. Prints the deployed token address.

import solc from 'solc';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ContractFactory, Contract, parseUnits } from 'ethers';
import { loadNetworks, pickNetwork, getProvider, getSigner, withGasBuffer } from './lib/config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[++i];
  return a;
}

function compileMock() {
  const src = readFileSync(join(ROOT, 'tests', 'fixtures', 'MockERC20.sol'), 'utf8');
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { 'MockERC20.sol': { content: src } },
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  })));
  const errs = (out.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) { console.error(errs.map((e) => e.formattedMessage).join('\n')); process.exit(1); }
  const c = out.contracts['MockERC20.sol'].MockERC20;
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const to = args.to;
  if (!to) { console.error('--to 0x.. (mint recipient) required'); process.exit(2); }
  const networks = loadNetworks();
  const netName = Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
  const net = pickNetwork(networks, netName);
  const provider = getProvider(net);
  const signer = getSigner('OWNER_PRIVATE_KEY', provider);

  const art = compileMock();
  console.log(`Deploying MockERC20 (demo token) to ${net.name}...`);
  const factory = new ContractFactory(art.abi, art.bytecode, signer);
  const gas = await provider.estimateGas(await factory.getDeployTransaction());
  const token = await factory.deploy({ gasLimit: withGasBuffer(gas) });
  await token.waitForDeployment();
  const addr = await token.getAddress();
  console.log(`  demo token: ${addr}  ${net.explorer}/address/${addr}`);

  // Mint in 18-dec base units so amounts line up with the CLI's default decimals
  // for an unregistered token (MockERC20.decimals() is cosmetic; transfer math is unitless).
  const mintAmount = parseUnits(args.mint || '100', 18);
  const c = new Contract(addr, art.abi, signer);
  const tx = await c.mint(to, mintAmount, { gasLimit: withGasBuffer(await c.mint.estimateGas(to, mintAmount)) });
  console.log(`  mint ${args.mint || '100'} to ${to}: ${tx.hash}`);
  await tx.wait();
  console.log(`  done. ${net.explorer}/tx/${tx.hash}`);
  console.log(JSON.stringify({ token: addr, mintedTo: to, mint: args.mint || '100', decimals: 18 }));
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(2); });
