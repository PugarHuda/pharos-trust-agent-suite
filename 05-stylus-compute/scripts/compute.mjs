#!/usr/bin/env node
// stylus-compute CLI — run the risk classifier locally (JS reference), on-chain
// (the deployed Stylus/WASM contract via eth_call), or verify the two agree.
//
//   compute score   --features 0.2,1,0.1,0
//   compute gate    --features 0.2,1,0.1,0 [--threshold 0.5]
//   compute score   --onchain --address 0xSTYLUS --features 0.2,1,0.1,0
//   compute verify  --address 0xSTYLUS --features 0.2,1,0.1,0   (local == on-chain?)
//   compute encode  --features 0.2,1,0.1,0                       (prints score(int64[]) calldata)
//
// All on-chain calls are read-only eth_call (no key, no gas). Global: --network, --json.

import { Contract, Interface } from 'ethers';
import { score, gate, toFixed, fromFixed, SCALE, ModelError } from './lib/score.mjs';
import { loadModel, loadNetworks, getProvider } from './lib/config.mjs';

const ORACLE_ABI = [
  'function score(int64[] features) view returns (int64)',
  'function gate(int64[] features, int64 threshold) view returns (bool)',
  'function model_bias() view returns (int64)',
];

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json' || k === '--onchain') a[k.slice(2)] = true;
    else if (k.startsWith('--')) a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else a._.push(k);
  }
  return a;
}
function die(m) { console.error(`error: ${m}`); process.exit(2); }

function parseFeatures(arg, model) {
  if (!arg) die('--features required, e.g. --features 0.2,1,0.1,0');
  const humans = arg.split(',').map((s) => s.trim());
  if (humans.length !== model.weights.length) {
    die(`expected ${model.weights.length} features, got ${humans.length}`);
  }
  // Validate shape: numeric, bounded. Untrusted input must not reach the contract raw.
  return humans.map((h) => {
    if (!/^-?\d+(\.\d+)?$/.test(h)) die(`feature "${h}" is not a number`);
    const fx = toFixed(h);
    if (fx < -10n * SCALE || fx > 10n * SCALE) die(`feature ${h} out of bounds [-10,10]`);
    return fx;
  });
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const model = loadModel();
  const networks = loadNetworks();
  const netName = args.network || Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
  const net = networks[netName] || die(`unknown network ${netName}`);
  const threshold = args.threshold != null ? toFixed(args.threshold) : BigInt(model.defaultThreshold);

  async function onchainScore(address, featuresFixed) {
    const c = new Contract(address, ORACLE_ABI, getProvider(net));
    const raw = await c.score(featuresFixed.map((f) => f.toString()));
    return BigInt(raw);
  }

  switch (cmd) {
    case 'score': {
      const features = parseFeatures(args.features, model);
      if (args.onchain) {
        const addr = args.address || model.deployed?.[netName]?.address || die('--address 0x.. (or set deployed in model.json)');
        const s = await onchainScore(addr, features);
        console.log(`on-chain score: ${fromFixed(s)} (raw ${s}) from Stylus ${addr}`);
        if (args.json) console.log(JSON.stringify({ source: 'onchain', address: addr, score: s.toString() }));
      } else {
        const s = score(features, model);
        console.log(`local score: ${fromFixed(s)} (raw ${s})`);
        if (args.json) console.log(JSON.stringify({ source: 'local', score: s.toString() }));
      }
      break;
    }

    case 'gate': {
      const features = parseFeatures(args.features, model);
      const g = gate(features, model, threshold);
      console.log(`gate: ${g.allow ? 'ALLOW' : 'BLOCK'} — risk ${fromFixed(g.score)} vs threshold ${fromFixed(g.threshold)}`);
      process.exit(g.allow ? 0 : 1);
      break;
    }

    case 'verify': {
      const addr = args.address || model.deployed?.[netName]?.address || die('--address 0x.. required');
      const features = parseFeatures(args.features, model);
      const local = score(features, model);
      const remote = await onchainScore(addr, features);
      const match = local === remote;
      console.log(`local:    ${fromFixed(local)} (raw ${local})`);
      console.log(`on-chain: ${fromFixed(remote)} (raw ${remote}) [Stylus ${addr}]`);
      console.log(match ? 'MATCH ✓ — on-chain WASM result is independently verified.' : 'MISMATCH ✗ — investigate model/contract drift.');
      process.exit(match ? 0 : 1);
      break;
    }

    case 'encode': {
      const features = parseFeatures(args.features, model);
      const iface = new Interface(ORACLE_ABI);
      console.log(iface.encodeFunctionData('score', [features.map((f) => f.toString())]));
      break;
    }

    default:
      console.error('commands: score gate verify encode');
      console.error('example: node scripts/compute.mjs score --features 0.2,1,0.1,0');
      process.exit(2);
  }
}

main().catch((e) => { if (e instanceof ModelError) die(e.message); die(e.message); });
