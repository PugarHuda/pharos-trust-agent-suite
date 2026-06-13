#!/usr/bin/env node
// agent-bond CLI — sybil resistance via skin-in-the-game. An agent locks a native bond; consumers
// (reputation-gate, bazaar, mesh) require a minimum active bond before trusting it. Unbonding has a
// cooldown, so capital can't be instantly recycled across fake identities.
//
//   bond deploy   --cooldown 3600                                  ($AGENT_PRIVATE_KEY)
//   bond up       --bond 0x.. --amount 0.01                        (lock bond)
//   bond status   --bond 0x.. --agent 0x..                         (read-only)
//   bond check    --bond 0x.. --agent 0x.. --min 0.005             (read-only verdict)
//   bond unbond   --bond 0x.. --amount 0.01                        (start exit; active bond drops now)
//   bond claim    --bond 0x..                                      (after cooldown)
//
// Key from a gitignored .env: $AGENT_PRIVATE_KEY. Global: --network atlantic-testnet.

import { Contract, parseEther, formatEther } from 'ethers';
import {
  loadNetworks, loadArtifact, pickNetwork, getProvider, getSigner, withGasBuffer, explorerTx,
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
const die = (m) => { console.error(`error: ${m}`); process.exit(2); };

async function send(c, method, args, net, label, overrides = {}) {
  let gas;
  try { gas = await c[method].estimateGas(...args, overrides); }
  catch (e) { die(`${label} would revert: ${e.revert?.name || e.shortMessage || e.message}`); }
  const tx = await c[method](...args, { ...overrides, gasLimit: withGasBuffer(gas) });
  console.log(`  ${label} sent: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`  confirmed in block ${rc.blockNumber} — ${explorerTx(net, tx.hash)}`);
  return rc;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const networks = loadNetworks();
  const netName = args.network || Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
  const net = pickNetwork(networks, netName);
  const provider = getProvider(net);
  const ART = loadArtifact('AgentBond');

  switch (cmd) {
    case 'deploy': {
      const signer = getSigner('AGENT_PRIVATE_KEY', provider);
      const { ContractFactory } = await import('ethers');
      const c = await new ContractFactory(ART.abi, ART.bytecode, signer).deploy(BigInt(args.cooldown ?? 3600));
      console.log(`deploying AgentBond (cooldown ${args.cooldown ?? 3600}s)… ${c.deploymentTransaction().hash}`);
      await c.waitForDeployment();
      const addr = await c.getAddress();
      console.log(`AgentBond deployed: ${addr}`);
      console.log(`  ${net.explorer}/address/${addr}`);
      break;
    }

    case 'up': {
      const signer = getSigner('AGENT_PRIVATE_KEY', provider);
      const c = new Contract(args.bond || die('--bond required'), ART.abi, signer);
      await send(c, 'bondUp', [], net, 'bondUp', { value: parseEther(args.amount || die('--amount required')) });
      console.log(`  active bond now: ${formatEther(await c.bondOf(signer.address))} ${net.nativeToken}`);
      break;
    }

    case 'status': {
      const c = new Contract(args.bond || die('--bond required'), ART.abi, provider);
      const agent = args.agent || die('--agent required');
      console.log(`agent ${agent}`);
      console.log(`  active bond:     ${formatEther(await c.bonded(agent))} ${net.nativeToken}`);
      console.log(`  pending unbond:  ${formatEther(await c.pendingUnbond(agent))} ${net.nativeToken}`);
      console.log(`  unbond ready at: ${await c.unbondReadyAt(agent)}`);
      break;
    }

    case 'check': {
      const c = new Contract(args.bond || die('--bond required'), ART.abi, provider);
      const agent = args.agent || die('--agent required');
      const min = parseEther(args.min || die('--min required'));
      const ok = await c.meetsBond(agent, min);
      console.log(`bond for ${agent}: ${formatEther(await c.bonded(agent))} (need ≥ ${formatEther(min)}) → ${ok ? 'TRUSTED ✓' : 'BLOCK ✗'}`);
      process.exit(ok ? 0 : 1);
    }

    case 'unbond': {
      const signer = getSigner('AGENT_PRIVATE_KEY', provider);
      const c = new Contract(args.bond || die('--bond required'), ART.abi, signer);
      await send(c, 'requestUnbond', [parseEther(args.amount || die('--amount required'))], net, 'requestUnbond');
      console.log(`  active bond now: ${formatEther(await c.bonded(signer.address))} ${net.nativeToken} (exit matures after cooldown)`);
      break;
    }

    case 'claim': {
      const signer = getSigner('AGENT_PRIVATE_KEY', provider);
      const c = new Contract(args.bond || die('--bond required'), ART.abi, signer);
      await send(c, 'claimUnbond', [], net, 'claimUnbond');
      break;
    }

    default:
      console.error('commands: deploy up status check unbond claim');
      process.exit(2);
  }
}

main().catch((e) => die(e.message));
