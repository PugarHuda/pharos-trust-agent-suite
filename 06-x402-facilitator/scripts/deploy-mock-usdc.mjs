#!/usr/bin/env node
// Compile + deploy MockUSDC3009 (EIP-3009 demo token) and mint, so the x402 settle
// path (transferWithAuthorization) can be exercised live. Reads FACILITATOR_PRIVATE_KEY
// (deployer/minter). Usage: node scripts/deploy-mock-usdc.mjs --to 0x.. --mint 100
import solc from 'solc';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ContractFactory, Contract, Wallet, JsonRpcProvider, parseUnits } from 'ethers';
import { loadNetworks } from './lib/config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = {}; for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];

const src = readFileSync(join(ROOT, 'contracts', 'MockUSDC3009.sol'), 'utf8');
const out = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources: { 'MockUSDC3009.sol': { content: src } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
})));
const errs = (out.errors || []).filter((e) => e.severity === 'error');
if (errs.length) { console.error(errs.map((e) => e.formattedMessage).join('\n')); process.exit(1); }
const art = out.contracts['MockUSDC3009.sol'].MockUSDC3009;

const net = loadNetworks()['atlantic-testnet'];
const provider = new JsonRpcProvider(net.rpcUrl, net.chainId, { staticNetwork: true });
const pk = process.env.FACILITATOR_PRIVATE_KEY || process.env.OWNER_PRIVATE_KEY;
if (!pk) { console.error('set FACILITATOR_PRIVATE_KEY'); process.exit(2); }
const signer = new Wallet(pk.startsWith('0x') ? pk : '0x' + pk, provider);

const factory = new ContractFactory(art.abi, '0x' + art.evm.bytecode.object, signer);
const gas = await provider.estimateGas(await factory.getDeployTransaction());
const token = await factory.deploy({ gasLimit: (gas * 115n) / 100n });
console.log('deploy tx', token.deploymentTransaction().hash);
await token.waitForDeployment();
const addr = await token.getAddress();
console.log('MockUSDC3009:', addr, `${net.explorer}/address/${addr}`);

if (args.to) {
  const c = new Contract(addr, art.abi, signer);
  const amt = parseUnits(args.mint || '100', 6);
  const tx = await c.mint(args.to, amt, { gasLimit: (await c.mint.estimateGas(args.to, amt) * 115n) / 100n });
  await tx.wait();
  console.log(`minted ${args.mint || '100'} to ${args.to}: ${tx.hash}`);
}
console.log(JSON.stringify({ token: addr }));
