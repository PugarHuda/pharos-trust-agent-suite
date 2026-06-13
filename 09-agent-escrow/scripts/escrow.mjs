#!/usr/bin/env node
// agent-escrow CLI — the "hire" primitive for agent-to-agent commerce on Pharos.
// A client locks native PHRS for a job; settlement is by code: release on approval,
// refund on timeout, or an arbiter split on dispute. All exits are pull-payments.
//
//   escrow deploy                                                        ($CLIENT_PRIVATE_KEY)
//   escrow create   --escrow 0x.. --job <ref|label> --provider 0x.. --amount 0.01 \
//                   [--arbiter 0x..] [--deadline 7d|@unix] [--terms <hash|text>]  ($CLIENT_PRIVATE_KEY)
//   escrow deliver  --escrow 0x.. --job <ref> [--deliverable <hash|text>]         ($PROVIDER_PRIVATE_KEY)
//   escrow release  --escrow 0x.. --job <ref>                                     ($CLIENT_PRIVATE_KEY)
//   escrow refund   --escrow 0x.. --job <ref>                                     ($CLIENT_PRIVATE_KEY)
//   escrow dispute  --escrow 0x.. --job <ref> [--as provider]                     (client/provider key)
//   escrow resolve  --escrow 0x.. --job <ref> --to-provider 0.01                  ($ARBITER_PRIVATE_KEY)
//   escrow withdraw --escrow 0x..                                                 (any party's key)
//   escrow status   --escrow 0x.. --job <ref>
//   escrow ref      --label "job-42"            (derive a jobId from a label)
//   escrow address  [--role provider|arbiter]   (print the signer address)
//
// jobId doubles as the a2a-mesh `ref` — a released escrow can mint payment-gated reputation.
// Keys come from env (.env auto-loaded, gitignored): $CLIENT_PRIVATE_KEY (default),
// $PROVIDER_PRIVATE_KEY, $ARBITER_PRIVATE_KEY. Global: --network atlantic-testnet.

import { Contract, parseEther, formatEther } from 'ethers';
import {
  loadNetworks, loadArtifact, pickNetwork, getProvider, getSigner,
  toRef, withGasBuffer, explorerTx,
} from './lib/config.mjs';

const STATE = ['None', 'Funded', 'Delivered', 'Released', 'Refunded', 'Disputed', 'Resolved'];

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

// "7d" / "12h" / "30m" / "@1750000000" / plain seconds-from-now.
function parseDeadline(s) {
  if (!s) return BigInt(Math.floor(Date.now() / 1000) + 7 * 86400); // default 7 days
  if (s.startsWith('@')) return BigInt(s.slice(1));
  const m = String(s).match(/^(\d+)([smhd])?$/);
  if (!m) die(`bad --deadline "${s}" (use 7d, 12h, 30m, @unix, or seconds)`);
  const n = BigInt(m[1]);
  const mult = { s: 1n, m: 60n, h: 3600n, d: 86400n }[m[2] || 's'];
  return BigInt(Math.floor(Date.now() / 1000)) + n * mult;
}

async function sendTx(contract, method, args, net, label, overrides = {}) {
  let gas;
  try { gas = await contract[method].estimateGas(...args, overrides); }
  catch (e) { throw new Error(`${label} would revert: ${e.revert?.name || e.shortMessage || e.message}`); }
  const tx = await contract[method](...args, { ...overrides, gasLimit: withGasBuffer(gas) });
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
  const ESC = loadArtifact('AgentEscrow');

  const roleEnv = (role) =>
    role === 'provider' ? 'PROVIDER_PRIVATE_KEY' : role === 'arbiter' ? 'ARBITER_PRIVATE_KEY' : 'CLIENT_PRIVATE_KEY';

  switch (cmd) {
    case 'address': {
      const s = getSigner(roleEnv(args.role), provider);
      console.log(s.address);
      break;
    }

    case 'ref': {
      console.log(toRef(args.label || die('--label required')));
      break;
    }

    case 'deploy': {
      const signer = getSigner('CLIENT_PRIVATE_KEY', provider);
      const { ContractFactory } = await import('ethers');
      const f = new ContractFactory(ESC.abi, ESC.bytecode, signer);
      const est = await provider.estimateGas({ from: signer.address, data: ESC.bytecode });
      const c = await f.deploy({ gasLimit: withGasBuffer(est) });
      console.log(`deploying AgentEscrow… ${c.deploymentTransaction().hash}`);
      await c.waitForDeployment();
      const addr = await c.getAddress();
      console.log(`AgentEscrow deployed: ${addr}`);
      console.log(`  ${net.explorer}/address/${addr}`);
      break;
    }

    case 'create': {
      const signer = getSigner('CLIENT_PRIVATE_KEY', provider);
      const c = new Contract(args.escrow || die('--escrow required'), ESC.abi, signer);
      const job = toRef(args.job || die('--job <ref|label> required'));
      const amount = parseEther(args.amount || die('--amount required (e.g. 0.01)'));
      const arbiter = args.arbiter || '0x0000000000000000000000000000000000000000';
      const deadline = parseDeadline(args.deadline);
      const terms = args.terms ? toRef(args.terms) : '0x' + '00'.repeat(32);
      console.log(`Creating job ${job}`);
      console.log(`  provider ${args.provider}, amount ${formatEther(amount)} ${net.nativeToken}, deadline ${deadline}`);
      await sendTx(c, 'createJob', [job, args.provider || die('--provider required'), arbiter, deadline, terms],
        net, 'createJob', { value: amount });
      console.log(`  → use this jobId as the mesh ref to record/rate later: ${job}`);
      break;
    }

    case 'deliver': {
      const signer = getSigner('PROVIDER_PRIVATE_KEY', provider);
      const c = new Contract(args.escrow || die('--escrow required'), ESC.abi, signer);
      const job = toRef(args.job || die('--job required'));
      const deliverable = args.deliverable ? toRef(args.deliverable) : '0x' + '00'.repeat(32);
      await sendTx(c, 'markDelivered', [job, deliverable], net, 'markDelivered');
      break;
    }

    case 'release': {
      const signer = getSigner('CLIENT_PRIVATE_KEY', provider);
      const c = new Contract(args.escrow || die('--escrow required'), ESC.abi, signer);
      await sendTx(c, 'release', [toRef(args.job || die('--job required'))], net, 'release');
      console.log('  funds credited to the provider (pull): provider runs `escrow withdraw`.');
      break;
    }

    case 'refund': {
      const signer = getSigner('CLIENT_PRIVATE_KEY', provider);
      const c = new Contract(args.escrow || die('--escrow required'), ESC.abi, signer);
      await sendTx(c, 'refundTimeout', [toRef(args.job || die('--job required'))], net, 'refundTimeout');
      break;
    }

    case 'dispute': {
      const signer = getSigner(roleEnv(args.as), provider);
      const c = new Contract(args.escrow || die('--escrow required'), ESC.abi, signer);
      await sendTx(c, 'dispute', [toRef(args.job || die('--job required'))], net, 'dispute');
      break;
    }

    case 'resolve': {
      const signer = getSigner('ARBITER_PRIVATE_KEY', provider);
      const c = new Contract(args.escrow || die('--escrow required'), ESC.abi, signer);
      const toProvider = parseEther(args.toProvider ?? die('--to-provider required (e.g. 0.01)'));
      await sendTx(c, 'resolve', [toRef(args.job || die('--job required')), toProvider], net, 'resolve');
      break;
    }

    case 'withdraw': {
      const signer = getSigner(roleEnv(args.role), provider);
      const c = new Contract(args.escrow || die('--escrow required'), ESC.abi, signer);
      const bal = await c.withdrawable(signer.address);
      console.log(`withdrawable for ${signer.address}: ${formatEther(bal)} ${net.nativeToken}`);
      if (bal === 0n) { console.log('  nothing to withdraw'); break; }
      await sendTx(c, 'withdraw', [], net, 'withdraw');
      break;
    }

    case 'status': {
      const c = new Contract(args.escrow || die('--escrow required'), ESC.abi, provider);
      const job = toRef(args.job || die('--job required'));
      const j = await c.getJob(job);
      console.log(`Job ${job}`);
      console.log(`  state:     ${STATE[Number(j[7])]}`);
      console.log(`  client:    ${j[0]}`);
      console.log(`  provider:  ${j[1]}`);
      console.log(`  arbiter:   ${j[2] === '0x0000000000000000000000000000000000000000' ? '(none)' : j[2]}`);
      console.log(`  amount:    ${formatEther(j[3])} ${net.nativeToken}`);
      console.log(`  deadline:  ${j[4]} (${new Date(Number(j[4]) * 1000).toISOString()})`);
      console.log(`  terms:     ${j[5]}`);
      console.log(`  delivered: ${j[6] === '0x' + '00'.repeat(32) ? '(not yet)' : j[6]}`);
      break;
    }

    default:
      console.error('commands: deploy create deliver release refund dispute resolve withdraw status ref address');
      process.exit(2);
  }
}

main().catch((e) => die(e.message));
