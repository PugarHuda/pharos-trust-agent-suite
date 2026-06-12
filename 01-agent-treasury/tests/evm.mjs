// Tiny in-memory EVM harness for testing the policy on-chain logic without a
// network or a funded key. Uses @ethereumjs/evm for execution and ethers'
// Interface/AbiCoder for ABI encoding. solc compiles the contracts on the fly.

import { EVM } from '@ethereumjs/evm';
import { Common, Chain as ChainId, Hardfork } from '@ethereumjs/common';
import { Address, Account, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { Interface } from 'ethers';
import solc from 'solc';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function compile(files) {
  const sources = {};
  for (const f of files) sources[f.name] = { content: readFileSync(f.path, 'utf8') };
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
  { name: 'AgentTreasury.sol', path: join(ROOT, 'contracts', 'AgentTreasury.sol') },
  { name: 'MockERC20.sol', path: join(ROOT, 'tests', 'fixtures', 'MockERC20.sol') },
  { name: 'DrainRouter.sol', path: join(ROOT, 'tests', 'fixtures', 'DrainRouter.sol') },
]);

export function addr(hex) {
  return new Address(hexToBytes(hex));
}

// A thin wrapper around an EVM instance that knows how to deploy artifacts and
// call methods by ABI, returning decoded results or throwing on revert.
export class Chain {
  constructor(evm) {
    this.evm = evm;
    this.now = 1_750_000_000; // fixed timestamp; advanced explicitly by tests
  }

  static async create() {
    // Match the contracts' compile target (cancun) so PUSH0/MCOPY are valid.
    const common = new Common({ chain: ChainId.Mainnet, hardfork: Hardfork.Cancun });
    const evm = await EVM.create({ common });
    return new Chain(evm);
  }

  blockCtx() {
    return { block: { header: { timestamp: BigInt(this.now), number: 1n, gasLimit: 30_000_000n } } };
  }

  async fund(address, wei = 10n ** 20n) {
    const a = typeof address === 'string' ? addr(address) : address;
    const acct = (await this.evm.stateManager.getAccount(a)) ?? new Account();
    acct.balance = wei;
    await this.evm.stateManager.putAccount(a, acct);
  }

  async deploy(artifact, sender, constructorArgs = [], abiSig = null) {
    const iface = new Interface(artifact.abi);
    let data = artifact.bytecode;
    if (constructorArgs.length) {
      const frag = iface.deploy;
      data += iface.encodeDeploy(constructorArgs).slice(2);
    }
    const res = await this.evm.runCall({
      caller: addr(sender),
      to: undefined,
      data: hexToBytes(data),
      gasLimit: 10_000_000n,
      ...this.blockCtx(),
    });
    if (res.execResult.exceptionError) {
      throw new Error('deploy reverted: ' + res.execResult.exceptionError.error);
    }
    return res.createdAddress;
  }

  async send(artifactOrAbi, to, sender, method, args = []) {
    const abi = Array.isArray(artifactOrAbi) ? artifactOrAbi : artifactOrAbi.abi;
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData(method, args);
    const res = await this.evm.runCall({
      caller: addr(sender),
      to,
      data: hexToBytes(data),
      gasLimit: 10_000_000n,
      ...this.blockCtx(),
    });
    const exec = res.execResult;
    if (exec.exceptionError) {
      // try to decode a custom error or Error(string) from returnValue
      const reason = decodeError(iface, exec.returnValue);
      const err = new Error(reason || exec.exceptionError.error);
      err.reverted = true;
      err.reason = reason;
      throw err;
    }
    const fn = iface.getFunction(method);
    if (fn.outputs.length && exec.returnValue.length) {
      return iface.decodeFunctionResult(method, bytesToHex(exec.returnValue));
    }
    return null;
  }

  async call(artifactOrAbi, to, method, args = []) {
    return this.send(artifactOrAbi, to, '0x' + '00'.repeat(20), method, args);
  }

  advanceDays(n) {
    this.now += n * 86400;
  }
}

function decodeError(iface, returnValue) {
  if (!returnValue || returnValue.length === 0) return null;
  const hex = bytesToHex(returnValue);
  // Try a known custom error first (the contract uses these).
  try {
    const parsed = iface.parseError(hex);
    if (parsed) return parsed.name + (parsed.args.length ? `(${parsed.args.join(',')})` : '');
  } catch { /* not a known custom error */ }
  // Fall back to a standard Error(string) (selector 0x08c379a0).
  if (hex.startsWith('0x08c379a0')) {
    try {
      const len = parseInt(hex.slice(10 + 64, 10 + 128), 16);
      const strHex = hex.slice(10 + 128, 10 + 128 + len * 2);
      return Buffer.from(strHex, 'hex').toString('utf8');
    } catch { return 'Error'; }
  }
  return hex.slice(0, 10);
}
