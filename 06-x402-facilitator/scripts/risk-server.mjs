#!/usr/bin/env node
// A paid x402 resource server: GET /risk?features=a,b,c,d returns an agent-action
// risk score (0..1) ONLY after an x402 payment. Demonstrates monetizing the trust
// layer per-call (x402's #1 use case: risk-scoring API). Point an agent's x402
// client at this; with no payment it gets 402 + how-to-pay, then pays and retries.
//
// Env: PAY_TO (merchant address), TOKEN (settlement token). Flags: --port 4030 --network atlantic-testnet

import { createServer } from 'node:http';
import { JsonRpcProvider } from 'ethers';
import { handleRiskRequest, riskRequirements } from './lib/risk.mjs';
import { resolveTokenDomain } from './lib/facilitator.mjs';
import { loadNetworks } from './lib/config.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];

const networks = loadNetworks();
const netName = args.network || Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
const net = networks[netName];
const provider = new JsonRpcProvider(args.rpcUrl || net.rpcUrl, net.chainId, { staticNetwork: true });
const PORT = Number(args.port || 4030);
const TOKEN = process.env.TOKEN || net.tokens?.USDC_x402?.address || net.tokens?.USDC?.address;
const PAY_TO = process.env.PAY_TO;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method !== 'GET' || url.pathname !== '/risk') { res.writeHead(404); return res.end('{"error":"not found"}'); }
  if (!PAY_TO) { res.writeHead(500); return res.end('{"error":"set PAY_TO"}'); }
  const features = (url.searchParams.get('features') || '').split(',').map((s) => s.trim());
  const requirements = riskRequirements({ chainId: net.chainId, asset: TOKEN, payTo: PAY_TO, price: args.price || '1000' });
  const domain = await resolveTokenDomain(TOKEN, net.chainId, { provider, registryEntry: Object.values(net.tokens || {}).find((t) => t.address.toLowerCase() === TOKEN.toLowerCase()) });
  const out = handleRiskRequest({ headers: { 'x-payment': req.headers['x-payment'] }, features }, { requirements, domain });
  res.writeHead(out.status, { 'content-type': 'application/json', ...(out.headers || {}) });
  res.end(JSON.stringify(out.body));
});

server.listen(PORT, () => {
  console.log(`x402 risk-scoring API on http://localhost:${PORT}/risk (token ${TOKEN}, payTo ${PAY_TO || 'UNSET'})`);
  console.log('  GET /risk?features=0.2,1,0.1,0  — 402 until paid, then returns the risk score');
});
