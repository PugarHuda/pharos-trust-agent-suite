#!/usr/bin/env node
// a2a-mesh CLI — discover agent services, pay via x402, and post payment-gated
// reputation on Pharos. Reputation is the defensible core: only the verified
// payer of an interaction can rate it, so scores can't be faked for free.
//
//   mesh deploy            [--recorder 0x..]            (deploys ServiceRegistry + Reputation)
//   mesh register          --registry 0x.. --tag price-feed --endpoint https://.. --price 1000
//   mesh discover          --registry 0x.. --reputation 0x.. --tag price-feed
//   mesh record-payment    --reputation 0x.. --ref 0x.. --payer 0x.. --provider 0x.. --amount 1000   (recorder key)
//   mesh rate              --reputation 0x.. --ref 0x.. --score 5                                     (payer key)
//   mesh score             --reputation 0x.. --provider 0x..
//
// x402 settlement: pay a provider's endpoint with the x402 stack (see references/),
// then use the settlement tx hash as --ref. `mesh ref --tx 0x..` derives the ref.
//
// Keys: $RECORDER_PRIVATE_KEY (record-payment), $PAYER_PRIVATE_KEY (register/rate).
// Global: --network atlantic-testnet. Exit: 0 ok, 2 error.

import { Contract, formatUnits, keccak256, toUtf8Bytes, isAddress } from 'ethers';
import {
  loadNetworks, loadArtifact, pickNetwork, getProvider, getSigner,
  tag, withGasBuffer, explorerTx,
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

async function sendTx(contract, method, args, net, label, signerEnv, provider) {
  let gas;
  try { gas = await contract[method].estimateGas(...args); }
  catch (e) { throw new Error(`${label} would revert: ${e.revert?.name || e.shortMessage || e.message}`); }
  const tx = await contract[method](...args, { gasLimit: withGasBuffer(gas) });
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

  const REG = loadArtifact('ServiceRegistry');
  const REP = loadArtifact('Reputation');

  switch (cmd) {
    case 'deploy': {
      const { ContractFactory } = await import('ethers');
      const signer = getSigner('RECORDER_PRIVATE_KEY', provider);
      const recorder = args.recorder || (await signer.getAddress());
      console.log(`Deploying ServiceRegistry + Reputation to ${net.name} (recorder ${recorder})...`);

      const regF = new ContractFactory(REG.abi, REG.bytecode, signer);
      const reg = await regF.deploy({ gasLimit: withGasBuffer(await provider.estimateGas(await regF.getDeployTransaction())) });
      await reg.waitForDeployment();
      const regAddr = await reg.getAddress();
      console.log(`  ServiceRegistry: ${regAddr}`);

      const repF = new ContractFactory(REP.abi, REP.bytecode, signer);
      const rep = await repF.deploy(recorder, { gasLimit: withGasBuffer(await provider.estimateGas(await repF.getDeployTransaction(recorder))) });
      await rep.waitForDeployment();
      const repAddr = await rep.getAddress();
      console.log(`  Reputation:      ${repAddr}`);
      console.log(JSON.stringify({ registry: regAddr, reputation: repAddr, recorder }));
      break;
    }

    case 'register': {
      const c = new Contract(args.registry || die('--registry required'), REG.abi, getSigner('PAYER_PRIVATE_KEY', provider));
      const t = tag(args.tag || die('--tag required'));
      const endpoint = args.endpoint || die('--endpoint required');
      const price = BigInt(args.price ?? die('--price required'));
      console.log(`Register service: tag ${args.tag} (${t}) endpoint ${endpoint} price ${price}`);
      await sendTx(c, 'register', [t, endpoint, price], net, 'register');
      break;
    }

    case 'discover': {
      const reg = new Contract(args.registry || die('--registry required'), REG.abi, provider);
      const rep = args.reputation ? new Contract(args.reputation, REP.abi, provider) : null;
      const t = tag(args.tag || die('--tag required'));
      const ids = await reg.getActiveByTag(t);
      const rows = [];
      for (const idv of ids) {
        const s = await reg.services(idv);
        const score = rep ? Number(await rep.scoreOf(s.owner)) : null;
        rows.push({ id: Number(idv), owner: s.owner, endpoint: s.endpoint, price: s.price.toString(), reputation: score });
      }
      rows.sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0)); // best reputation first
      console.log(`Discovered ${rows.length} active service(s) for tag "${args.tag}"` + (rep ? ', sorted by reputation:' : ':'));
      for (const r of rows) {
        console.log(`  #${r.id} ${r.owner} | rep ${r.reputation ?? 'n/a'} | price ${r.price} | ${r.endpoint}`);
      }
      console.log(JSON.stringify(rows));
      break;
    }

    case 'record-payment': {
      const c = new Contract(args.reputation || die('--reputation required'), REP.abi, getSigner('RECORDER_PRIVATE_KEY', provider));
      const ref = args.ref || die('--ref 0x.. required (settlement tx hash or unique id)');
      const payer = args.payer || die('--payer 0x.. required');
      const providerAddr = args.provider || die('--provider 0x.. required');
      if (!isAddress(payer)) die(`--payer is not a valid address: ${payer}`);
      if (!isAddress(providerAddr)) die(`--provider is not a valid address: ${providerAddr}`);
      if (payer.toLowerCase() === providerAddr.toLowerCase()) die('--payer and --provider must differ (self-dealing is rejected on-chain)');
      console.log(`Record payment ref ${ref}: payer ${payer} -> provider ${providerAddr}, amount ${args.amount}`);
      await sendTx(c, 'recordPayment', [ref, payer, providerAddr, BigInt(args.amount ?? die('--amount'))], net, 'recordPayment');
      break;
    }

    case 'rate': {
      const c = new Contract(args.reputation || die('--reputation required'), REP.abi, getSigner('PAYER_PRIVATE_KEY', provider));
      const ref = args.ref || die('--ref 0x.. required');
      const score = Number(args.score ?? die('--score 1..5 required'));
      console.log(`Rate interaction ${ref} with score ${score} (only the payer may do this)`);
      await sendTx(c, 'rate', [ref, score], net, 'rate');
      break;
    }

    case 'score': {
      const c = new Contract(args.reputation || die('--reputation required'), REP.abi, provider);
      const provider_ = args.provider || die('--provider 0x.. required');
      const [score, count, sum, vol] = await Promise.all([
        c.scoreOf(provider_), c.ratingCount(provider_), c.ratingSum(provider_), c.volume(provider_),
      ]);
      console.log(`Provider ${provider_}:`);
      console.log(`  reputation: ${score}/100  (ratings: ${count}, sum: ${sum}, volume: ${formatUnits(vol, 6)} USDC)`);
      break;
    }

    case 'ref': {
      // Derive a deterministic interactionRef from a settlement tx hash (or any string).
      const src = args.tx || args._[0] || die('--tx 0x.. or a string');
      console.log(/^0x[0-9a-fA-F]{64}$/.test(src) ? src : keccak256(toUtf8Bytes(src)));
      break;
    }

    case 'tag':
      console.log(tag(args._[0] || die('a label, e.g. "price-feed"')));
      break;

    default:
      console.error('commands: deploy register discover record-payment rate score ref tag');
      process.exit(2);
  }
}

main().catch((e) => die(e.message));
