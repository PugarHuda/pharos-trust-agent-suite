// In-memory EVM harness (same approach as a2a-mesh / agent-treasury): @ethereumjs/evm
// for execution, ethers Interface for ABI coding, solc compiling on the fly. Supports
// payable calls and native balances so escrow value-flow can be tested exactly.

import { EVM } from '@ethereumjs/evm';
import { Common, Chain as ChainId, Hardfork } from '@ethereumjs/common';
import { Address, Account, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { Interface } from 'ethers';
import solc from 'solc';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function compile(files) {
  const sources = {};
  for (const f of files) sources[f.name] = { content: readFileSync(f.path, 'utf8') };
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  })));
  const errs = (out.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) throw new Error(errs.map((e) => e.formattedMessage).join('\n'));
  const result = {};
  for (const contracts of Object.values(out.contracts)) {
    for (const [name, c] of Object.entries(contracts)) {
      result[name] = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
    }
  }
  return result;
}

export const ARTIFACTS = compile([
  { name: 'AgentBond.sol', path: join(ROOT, 'contracts', 'AgentBond.sol') },
  { name: 'Reenterer.sol', path: join(ROOT, 'tests', 'fixtures', 'Reenterer.sol') },
]);

export function addr(hex) { return new Address(hexToBytes(hex)); }

export class Chain {
  constructor(evm) { this.evm = evm; this.now = 1_750_000_000; }

  static async create() {
    const common = new Common({ chain: ChainId.Mainnet, hardfork: Hardfork.Cancun });
    return new Chain(await EVM.create({ common }));
  }

  ctx() { return { block: { header: { timestamp: BigInt(this.now), number: 1n, gasLimit: 30_000_000n } } }; }

  async fund(a, wei = 10n ** 20n) {
    const address = typeof a === 'string' ? addr(a) : a;
    const acct = (await this.evm.stateManager.getAccount(address)) ?? new Account();
    acct.balance = wei;
    await this.evm.stateManager.putAccount(address, acct);
  }

  async balance(a) {
    const address = typeof a === 'string' ? addr(a) : a;
    const acct = await this.evm.stateManager.getAccount(address);
    return acct ? acct.balance : 0n;
  }

  async deploy(artifact, sender, ctorArgs = []) {
    const iface = new Interface(artifact.abi);
    let data = artifact.bytecode;
    if (ctorArgs.length) data += iface.encodeDeploy(ctorArgs).slice(2);
    const res = await this.evm.runCall({ caller: addr(sender), to: undefined, data: hexToBytes(data), gasLimit: 10_000_000n, ...this.ctx() });
    if (res.execResult.exceptionError) throw new Error('deploy reverted: ' + res.execResult.exceptionError.error);
    return res.createdAddress;
  }

  async send(abiOrArtifact, to, sender, method, args = [], value = 0n) {
    const abi = Array.isArray(abiOrArtifact) ? abiOrArtifact : abiOrArtifact.abi;
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData(method, args);
    const res = await this.evm.runCall({ caller: addr(sender), to, value, data: hexToBytes(data), gasLimit: 10_000_000n, ...this.ctx() });
    const exec = res.execResult;
    if (exec.exceptionError) {
      const reason = decodeError(iface, exec.returnValue);
      const err = new Error(reason || exec.exceptionError.error);
      err.reverted = true; err.reason = reason;
      throw err;
    }
    const fn = iface.getFunction(method);
    if (fn.outputs.length && exec.returnValue.length) return iface.decodeFunctionResult(method, bytesToHex(exec.returnValue));
    return null;
  }

  async call(abiOrArtifact, to, method, args = []) {
    return this.send(abiOrArtifact, to, '0x' + '00'.repeat(20), method, args);
  }

  warp(seconds) { this.now += seconds; }
}

function decodeError(iface, returnValue) {
  if (!returnValue || returnValue.length === 0) return null;
  const hex = bytesToHex(returnValue);
  try { const p = iface.parseError(hex); if (p) return p.name; } catch { /* not custom */ }
  if (hex.startsWith('0x08c379a0')) {
    try {
      const len = parseInt(hex.slice(74, 138), 16);
      return Buffer.from(hex.slice(138, 138 + len * 2), 'hex').toString('utf8');
    } catch { return 'Error'; }
  }
  return hex.slice(0, 10);
}
