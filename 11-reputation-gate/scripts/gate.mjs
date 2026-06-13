#!/usr/bin/env node
// reputation-gate CLI — make reputation economic. A gate (the ERC-8183 ReputationGateHook pattern)
// that only lets value through if the counterparty's ERC-8004 reputation (and optionally an
// independent validation of the work) clears a threshold.
//
//   gate deploy     --reputation 0x.. [--validation 0x..]                    ($PAYER_PRIVATE_KEY)
//   gate check      --gate 0x.. --provider 0x.. --min-reputation 10          (read-only verdict)
//                   [--data <hash> --min-validation 90]                      (composite trust)
//   gate pay        --gate 0x.. --provider 0x.. --min-reputation 10 --amount 0.001   (gated payment)
//
// On-chain reads need no key. `pay` forwards native PHRS only if the provider is trusted. Defaults to
// the suite's live Reputation + Validation registries (assets/networks.json). Global: --network.

import { Contract, parseEther, formatEther } from 'ethers';
import {
  loadNetworks, loadArtifact, pickNetwork, getProvider, getSigner,
  toRef, withGasBuffer, explorerTx,
} from './lib/config.mjs';

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else a._.push(k);
  }
  return a;
}
function die(m) { console.error(`error: ${m}`); process.exit(2); }

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const networks = loadNetworks();
  const netName = args.network || Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
  const net = pickNetwork(networks, netName);
  const provider = getProvider(net);
  const GATE = loadArtifact('ReputationGate');

  switch (cmd) {
    case 'deploy': {
      const signer = getSigner('PAYER_PRIVATE_KEY', provider);
      const rep = args.reputation || net.deployed?.reputation || die('--reputation 0x.. required');
      const val = args.validation || net.deployed?.validationRegistry || '0x0000000000000000000000000000000000000000';
      const { ContractFactory } = await import('ethers');
      const f = new ContractFactory(GATE.abi, GATE.bytecode, signer);
      const c = await f.deploy(rep, val);
      console.log(`deploying ReputationGate (reputation=${rep}, validation=${val})… ${c.deploymentTransaction().hash}`);
      await c.waitForDeployment();
      const addr = await c.getAddress();
      console.log(`ReputationGate deployed: ${addr}`);
      console.log(`  ${net.explorer}/address/${addr}`);
      break;
    }

    case 'check': {
      const c = new Contract(args.gate || die('--gate 0x.. required'), GATE.abi, provider);
      const prov = args.provider || die('--provider 0x.. required');
      const minRep = BigInt(args.minReputation ?? 0);
      if (args.data !== undefined) {
        const data = toRef(args.data);
        const minVal = Number(args.minValidation ?? 0);
        const [trusted, rep, vScore, validated] = await c.isTrusted(prov, minRep, data, minVal);
        console.log(`composite trust for ${prov}:`);
        console.log(`  reputation: ${rep}/100  (need ≥ ${minRep})`);
        console.log(`  validation: ${validated ? `${vScore}/100` : '(not validated)'}  (need ≥ ${minVal})`);
        console.log(`  → ${trusted ? 'TRUSTED ✓ — funding allowed' : 'NOT TRUSTED ✗ — funding blocked'}`);
        process.exit(trusted ? 0 : 1);
      } else {
        const ok = await c.meetsReputation(prov, minRep);
        const score = await new Contract(net.deployed.reputation, ['function scoreOf(address) view returns (uint256)'], provider).scoreOf(prov);
        console.log(`reputation for ${prov}: ${score}/100 (need ≥ ${minRep}) → ${ok ? 'ALLOW ✓' : 'BLOCK ✗'}`);
        process.exit(ok ? 0 : 1);
      }
    }

    case 'pay': {
      const signer = getSigner('PAYER_PRIVATE_KEY', provider);
      const c = new Contract(args.gate || die('--gate 0x.. required'), GATE.abi, signer);
      const prov = args.provider || die('--provider 0x.. required');
      const minRep = BigInt(args.minReputation ?? die('--min-reputation required'));
      const amount = parseEther(args.amount || die('--amount required (e.g. 0.001)'));
      let gas;
      try { gas = await c.gatedPay.estimateGas(prov, minRep, { value: amount }); }
      catch (e) { die(`gatedPay would revert: ${e.revert?.name || e.shortMessage || e.message} (provider below the reputation bar?)`); }
      const tx = await c.gatedPay(prov, minRep, { value: amount, gasLimit: withGasBuffer(gas) });
      console.log(`gatedPay sent: ${tx.hash}`);
      const rc = await tx.wait();
      console.log(`  confirmed in block ${rc.blockNumber} — ${explorerTx(net, tx.hash)}`);
      console.log(`  ${formatEther(amount)} ${net.nativeToken} forwarded to ${prov} (it cleared reputation ≥ ${minRep}).`);
      break;
    }

    default:
      console.error('commands: deploy check pay');
      process.exit(2);
  }
}

main().catch((e) => die(e.message));
