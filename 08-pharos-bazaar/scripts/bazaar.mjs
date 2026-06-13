#!/usr/bin/env node
// pharos-bazaar — the discover → pay → rate hub for agent-to-agent commerce on
// Pharos. Composes a2a-mesh (discovery + payment-gated reputation) and
// x402-facilitator (gasless payment) into one loop, mirroring Coinbase's x402
// Bazaar but with an on-chain trust layer. This is the natural invocation hub:
// every agent that needs a service calls `discover`/`best`, pays, and rates.
//
//   bazaar discover --registry 0x.. --reputation 0x.. --tag price-feed
//   bazaar best     --registry 0x.. --reputation 0x.. --tag price-feed [--min-reputation 50] [--max-price 1000]
//   bazaar hire     --registry 0x.. --reputation 0x.. --service <id> --token 0x.. --facilitator-url URL
//   bazaar rate     --reputation 0x.. --ref 0x.. --score 5
//
// discover/best are read-only. hire orchestrates an x402 payment + records it in
// the mesh so the payer can rate. Global: --network atlantic-testnet --json.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JsonRpcProvider, Contract } from 'ethers';
import { rankServices, pickBest, trustLabel, toBazaarCatalog } from './lib/rank.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const networks = JSON.parse(readFileSync(join(ROOT, 'assets', 'networks.json'), 'utf8'));

const REG_ABI = [
  'function getActiveByTag(bytes32 tag) view returns (uint256[])',
  'function services(uint256) view returns (address owner, bytes32 tag, string endpoint, uint256 price, bool active)',
];
const REP_ABI = [
  'function scoreOf(address) view returns (uint256)',
  'function ratingCount(address) view returns (uint256)',
];

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json') a.json = true;
    else if (k.startsWith('--')) a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else a._.push(k);
  }
  return a;
}
const die = (m) => { console.error(`error: ${m}`); process.exit(2); };
const { id } = await import('ethers');
const tag = (label) => /^0x[0-9a-fA-F]{64}$/.test(label) ? label : id(label);

async function discover(net, provider, registryAddr, reputationAddr, tagLabel) {
  const reg = new Contract(registryAddr, REG_ABI, provider);
  const rep = reputationAddr ? new Contract(reputationAddr, REP_ABI, provider) : null;
  const ids = await reg.getActiveByTag(tag(tagLabel));
  const out = [];
  for (const sid of ids) {
    const s = await reg.services(sid);
    const reputation = rep ? Number(await rep.scoreOf(s.owner)) : null;
    const ratings = rep ? Number(await rep.ratingCount(s.owner)) : 0;
    out.push({ id: Number(sid), owner: s.owner, endpoint: s.endpoint, price: s.price.toString(), reputation, ratings });
  }
  return out;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const netName = args.network || Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
  const net = networks[netName] || die(`unknown network ${netName}`);
  const provider = new JsonRpcProvider(args.rpcUrl || net.rpcUrl, net.chainId, { staticNetwork: true });

  switch (cmd) {
    case 'discover': {
      const rows = rankServices(await discover(net, provider,
        args.registry || die('--registry required'), args.reputation, args.tag || die('--tag required')));
      console.log(`Bazaar — ${rows.length} service(s) for "${args.tag}" (best first):`);
      for (const r of rows) {
        console.log(`  #${r.id} ${r.owner} | ${trustLabel(r.reputation, r.ratings)} | price ${r.price} | ${r.endpoint}`);
      }
      if (args.json) console.log(JSON.stringify(rows));
      break;
    }

    case 'best': {
      const rows = await discover(net, provider,
        args.registry || die('--registry required'), args.reputation, args.tag || die('--tag required'));
      const best = pickBest(rows, {
        minReputation: Number(args.minReputation || 0),
        maxPrice: args.maxPrice !== undefined ? args.maxPrice : undefined,
      });
      if (!best) { console.log('no service meets the constraints'); process.exit(1); }
      console.log(`Best for "${args.tag}": #${best.id} ${best.owner}`);
      console.log(`  ${trustLabel(best.reputation, best.ratings)} | price ${best.price} | ${best.endpoint}`);
      if (args.json) console.log(JSON.stringify(best));
      break;
    }

    case 'export': {
      // Emit an x402-Bazaar / Coinbase Agent.market-compatible discovery catalog for a tag, so an
      // external x402 agent can find+pay these Pharos services — with on-chain reputation attached.
      const rows = await discover(net, provider,
        args.registry || die('--registry required'), args.reputation, args.tag || die('--tag required'));
      const caip2 = `eip155:${net.chainId}`;
      const catalog = toBazaarCatalog(rows, { caip2, asset: args.asset, tag: args.tag });
      console.log(JSON.stringify(catalog, null, 2));
      break;
    }

    case 'hire': {
      // Orchestrate: resolve the service, then emit the exact x402 + mesh steps to
      // pay it and make the interaction rateable. (Pay/settle run via the x402 skill;
      // record-signed/rate via the mesh skill — the bazaar ties them together.)
      const rows = await discover(net, provider,
        args.registry || die('--registry required'), args.reputation, args.tag || 'price-feed');
      const svc = rows.find((r) => r.id === Number(args.service)) || die(`service #${args.service} not found`);
      const token = args.token || die('--token 0x.. required (x402 settlement token)');
      console.log(`Hiring service #${svc.id} (${svc.owner}) — ${svc.endpoint}, price ${svc.price}`);
      console.log('1) Pay (x402, gasless for you):');
      console.log(`   x402 pay   --token ${token} --to ${svc.owner} --amount ${svc.price}   # -> X-PAYMENT`);
      console.log(`   x402 settle --token ${token} --payment @payment.json                  # -> settlement tx hash = REF`);
      console.log('2) Record the paid interaction in the mesh (payer-signed):');
      console.log(`   mesh record-signed --reputation ${args.reputation} --ref <REF> --provider ${svc.owner} --amount ${svc.price}`);
      console.log('3) After delivery, rate it (only you, the payer, can):');
      console.log(`   bazaar rate --reputation ${args.reputation} --ref <REF> --score 5`);
      if (args.json) console.log(JSON.stringify({ service: svc, token }));
      break;
    }

    case 'rate': {
      // Thin pass-through to the mesh rate (payer-only). Requires PAYER_PRIVATE_KEY.
      const pk = process.env.PAYER_PRIVATE_KEY || die('set PAYER_PRIVATE_KEY (the payer rates)');
      const { Wallet } = await import('ethers');
      const c = new Contract(args.reputation || die('--reputation required'),
        ['function rate(bytes32 ref, uint8 score)'], new Wallet(pk.startsWith('0x') ? pk : '0x' + pk, provider));
      const tx = await c.rate(args.ref || die('--ref required'), Number(args.score ?? die('--score 1..5 required')),
        { gasLimit: (await c.rate.estimateGas(args.ref, Number(args.score)) * 115n) / 100n });
      console.log(`rated: ${tx.hash}  ${net.explorer}/tx/${tx.hash}`);
      await tx.wait();
      console.log('confirmed');
      break;
    }

    default:
      console.error('commands: discover best hire rate');
      process.exit(2);
  }
}

main().catch((e) => die(e.message));
