#!/usr/bin/env node
// x402-facilitator CLI.
//
//   x402 pay      --token 0x.. --to 0x.. --amount <baseUnits> [--name USDC] [--ttl 600]   (payer signs; prints X-PAYMENT)
//   x402 verify   --payment <json|@file> --to 0x.. --amount <baseUnits> --token 0x..        (no chain; pass/fail)
//   x402 settle   --payment <json|@file> --token 0x.. [--name USDC]                          (submit on-chain, gasless for payer)
//   x402 supported                                                                            (list scheme/network)
//
// Keys: $PAYER_PRIVATE_KEY (pay), $FACILITATOR_PRIVATE_KEY (settle gas payer).
// Global: --network atlantic-testnet --rpc-url URL --json

import { readFileSync } from 'node:fs';
import { JsonRpcProvider, Wallet, getAddress, hexlify, randomBytes } from 'ethers';
import { buildAuthorization, signPayment, verifyPayment } from './lib/scheme.mjs';
import { settle, resolveTokenDomain } from './lib/facilitator.mjs';
import { loadNetworks } from './lib/config.mjs';

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
function die(m) { console.error(`error: ${m}`); process.exit(2); }
function loadPayment(arg) {
  if (!arg) die('--payment <json|@file> required');
  const raw = arg.startsWith('@') ? readFileSync(arg.slice(1), 'utf8') : arg;
  try { return JSON.parse(raw); } catch { die('--payment is not valid JSON'); }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const networks = loadNetworks();
  const netName = args.network || Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
  const net = networks[netName] || die(`unknown network ${netName}`);
  const rpcUrl = args.rpcUrl || net.rpcUrl;
  const provider = new JsonRpcProvider(rpcUrl, net.chainId, { staticNetwork: true });
  const regEntry = (t) => Object.values(net.tokens || {}).find((x) => getAddress(x.address) === getAddress(t));
  const domainFor = (t) => resolveTokenDomain(t, net.chainId, { provider, registryEntry: regEntry(t), version: args.version, name: args.name });

  switch (cmd) {
    case 'supported':
      console.log(JSON.stringify({ kinds: [{ scheme: 'exact-evm', network: `eip155:${net.chainId}`, x402Version: 1 }] }, null, 2));
      break;

    case 'pay': {
      const token = args.token || die('--token 0x.. required');
      const to = args.to || die('--to 0x.. required');
      const amount = BigInt(args.amount ?? die('--amount <baseUnits> required'));
      const pk = process.env.PAYER_PRIVATE_KEY || die('set PAYER_PRIVATE_KEY');
      const domain = await domainFor(token);
      const now = Math.floor(Date.now() / 1000);
      const auth = buildAuthorization({
        from: new Wallet(pk.startsWith('0x') ? pk : '0x' + pk).address,
        to, value: amount, validAfter: 0, validBefore: now + Number(args.ttl || 600),
        nonce: hexlify(randomBytes(32)),
      });
      const payment = await signPayment(pk, domain, auth);
      console.log('X-PAYMENT (base64):', Buffer.from(JSON.stringify(payment)).toString('base64'));
      console.log(JSON.stringify(payment, null, 2));
      break;
    }

    case 'verify': {
      const payment = loadPayment(args.payment);
      const token = args.token || die('--token required');
      const domain = await domainFor(token);
      const requirements = {
        scheme: 'exact-evm', network: `eip155:${net.chainId}`,
        maxAmountRequired: BigInt(args.amount ?? die('--amount required')).toString(),
        asset: token, payTo: args.to || die('--to required'),
      };
      const res = verifyPayment(payment, requirements, domain);
      console.log(res.isValid ? `VALID — payer ${res.payer}` : `INVALID — ${res.reason}`);
      process.exit(res.isValid ? 0 : 1);
      break;
    }

    case 'settle': {
      const payment = loadPayment(args.payment);
      const token = args.token || die('--token required');
      const pk = process.env.FACILITATOR_PRIVATE_KEY || die('set FACILITATOR_PRIVATE_KEY (gas payer)');
      const domain = await domainFor(token);
      const signer = new Wallet(pk.startsWith('0x') ? pk : '0x' + pk, provider);
      const res = await settle(payment, domain, signer);
      if (res.success) console.log(`SETTLED — ${res.txHash}  ${net.explorer}/tx/${res.txHash}`);
      else { console.error(`SETTLE FAILED — ${res.reason}`); process.exit(1); }
      break;
    }

    default:
      console.error('commands: pay verify settle supported');
      process.exit(2);
  }
}

main().catch((e) => die(e.message));
