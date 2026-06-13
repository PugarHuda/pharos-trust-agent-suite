// Tiny in-memory EVM harness (same approach as the other skills) to unit-test the
// MockUSDC3009 EIP-3009 token without a network. @ethereumjs/evm + ethers + solc.

import { EVM } from '@ethereumjs/evm';
import { Common, Chain as ChainId, Hardfork } from '@ethereumjs/common';
import { Address, Account, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { Interface } from 'ethers';
import solc from 'solc';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function compile(file, name) {
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { [name]: { content: readFileSync(join(ROOT, 'contracts', file), 'utf8') } },
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  })));
  const errs = (out.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) throw new Error(errs.map((e) => e.formattedMessage).join('\n'));
  const c = Object.values(out.contracts[name])[0];
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

export const USDC = compile('MockUSDC3009.sol', 'MockUSDC3009.sol');
export const addr = (h) => new Address(hexToBytes(h));
// The harness EVM runs on Mainnet/chainId 1, so EIP-712 domains must use chainId 1.
export const CHAIN_ID = 1;

export class Chain {
  constructor(evm) { this.evm = evm; this.now = 1_750_000_000; }
  static async create() {
    const common = new Common({ chain: ChainId.Mainnet, hardfork: Hardfork.Cancun });
    return new Chain(await EVM.create({ common }));
  }
  ctx() { return { block: { header: { timestamp: BigInt(this.now), number: 1n, gasLimit: 30_000_000n } } }; }
  async fund(a) { const A = typeof a === 'string' ? addr(a) : a; const acct = (await this.evm.stateManager.getAccount(A)) ?? new Account(); acct.balance = 10n ** 20n; await this.evm.stateManager.putAccount(A, acct); }
  async deploy(art, sender, args = []) {
    const iface = new Interface(art.abi);
    let data = art.bytecode; if (args.length) data += iface.encodeDeploy(args).slice(2);
    const res = await this.evm.runCall({ caller: addr(sender), to: undefined, data: hexToBytes(data), gasLimit: 10_000_000n, ...this.ctx() });
    if (res.execResult.exceptionError) throw new Error('deploy reverted: ' + res.execResult.exceptionError.error);
    return res.createdAddress;
  }
  async send(art, to, sender, method, args = []) {
    const iface = new Interface(art.abi);
    const res = await this.evm.runCall({ caller: addr(sender), to, data: hexToBytes(iface.encodeFunctionData(method, args)), gasLimit: 10_000_000n, ...this.ctx() });
    const ex = res.execResult;
    if (ex.exceptionError) { const r = decodeErr(iface, ex.returnValue); const e = new Error(r || ex.exceptionError.error); e.reverted = true; throw e; }
    const fn = iface.getFunction(method);
    return fn.outputs.length && ex.returnValue.length ? iface.decodeFunctionResult(method, bytesToHex(ex.returnValue)) : null;
  }
  call(art, to, method, args = []) { return this.send(art, to, '0x' + '00'.repeat(20), method, args); }
  advance(seconds) { this.now += seconds; }
}

function decodeErr(iface, ret) {
  if (!ret || ret.length === 0) return null;
  const hex = bytesToHex(ret);
  if (hex.startsWith('0x08c379a0')) { try { const len = parseInt(hex.slice(74, 138), 16); return Buffer.from(hex.slice(138, 138 + len * 2), 'hex').toString('utf8'); } catch { return 'Error'; } }
  return hex.slice(0, 10);
}
