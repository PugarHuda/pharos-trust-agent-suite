#!/usr/bin/env node
// Minimal self-hostable x402 facilitator HTTP server (zero deps beyond ethers +
// node:http). Pharos has no public facilitator, so a resource server points its
// FACILITATOR_URL at this. Endpoints mirror the x402 facilitator spec:
//
//   GET  /supported  -> { kinds: [{ scheme, network, x402Version }] }
//   POST /verify     -> { isValid, payer? | reason }      (no chain write)
//   POST /settle     -> { success, txHash? | reason }     (submits on-chain, gasless for payer)
//
// Body for /verify and /settle: { payment, requirements, token, tokenName?, version? }
// Env: FACILITATOR_PRIVATE_KEY (gas payer for settle). Flags: --port 4021 --network atlantic-testnet

import { createServer } from 'node:http';
import { JsonRpcProvider, Wallet, getAddress } from 'ethers';
import { verifyPayment } from './lib/scheme.mjs';
import { settle, resolveTokenDomain } from './lib/facilitator.mjs';
import { loadNetworks } from './lib/config.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];

const networks = loadNetworks();
const netName = args.network || Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
const net = networks[netName];
const provider = new JsonRpcProvider(args.rpcUrl || net.rpcUrl, net.chainId, { staticNetwork: true });
const PORT = Number(args.port || 4021);

// The facilitator owns the signing domain (registry + on-chain name), NOT the client.
function registryEntryFor(token) {
  return Object.values(net.tokens || {}).find((t) => getAddress(t.address) === getAddress(token));
}
async function domainFor(token) {
  return resolveTokenDomain(token, net.chainId, { provider, registryEntry: registryEntryFor(token) });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) { req.destroy(); reject(new Error('request body too large')); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

// Serialize on-chain settlements so concurrent /settle requests can't collide on
// the facilitator EOA's nonce (each waits for the previous to broadcast).
let settleQueue = Promise.resolve();
function enqueueSettle(fn) {
  const run = settleQueue.then(fn, fn);
  settleQueue = run.catch(() => {}); // keep the chain alive even if one settle throws
  return run;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/supported') {
      return send(res, 200, { kinds: [{ scheme: 'exact-evm', network: `eip155:${net.chainId}`, x402Version: 1 }] });
    }
    if (req.method === 'POST' && (req.url === '/verify' || req.url === '/settle')) {
      const body = await readBody(req);
      const { payment, requirements, token } = body;
      if (!payment || !token) return send(res, 400, { error: 'payment and token are required' });
      // Domain is resolved server-side (registry + on-chain name) — client-supplied
      // name/version are intentionally ignored so a client can't forge the domain.
      const domain = await domainFor(token);

      if (req.url === '/verify') {
        if (!requirements) return send(res, 400, { error: 'requirements required' });
        return send(res, 200, verifyPayment(payment, requirements, domain));
      }
      // /settle — verify first if requirements were supplied, then submit on-chain
      if (requirements) {
        const v = verifyPayment(payment, requirements, domain);
        if (!v.isValid) return send(res, 400, { success: false, reason: v.reason });
      }
      const pk = process.env.FACILITATOR_PRIVATE_KEY;
      if (!pk) return send(res, 500, { success: false, reason: 'facilitator has no FACILITATOR_PRIVATE_KEY configured' });
      const signer = new Wallet(pk.startsWith('0x') ? pk : '0x' + pk, provider);
      return send(res, 200, await enqueueSettle(() => settle(payment, domain, signer)));
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 400, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`x402 facilitator on http://localhost:${PORT} (network ${netName}, chainId ${net.chainId})`);
  console.log('  GET /supported · POST /verify · POST /settle');
});
