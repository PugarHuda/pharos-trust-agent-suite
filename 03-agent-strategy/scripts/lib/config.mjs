// Shared config: networks, oracle feeds, signer, helpers.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Wallet, JsonRpcProvider } from 'ethers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadNetworks() {
  return JSON.parse(readFileSync(join(ROOT, 'assets', 'networks.json'), 'utf8'));
}
export function loadOracles() {
  return JSON.parse(readFileSync(join(ROOT, 'assets', 'oracles.json'), 'utf8'));
}

export function pickNetwork(networks, name) {
  const net = networks[name];
  if (!net) throw new Error(`unknown network "${name}"`);
  return net;
}

export function getProvider(net) {
  return new JsonRpcProvider(net.rpcUrl, net.chainId, { staticNetwork: true });
}

export function getSigner(envVar, provider) {
  const pk = process.env[envVar];
  if (!pk) throw new Error(`missing ${envVar} — set it in the environment (never hardcode keys).`);
  return new Wallet(pk.startsWith('0x') ? pk : '0x' + pk, provider);
}

export function tokenAddress(net, symbol) {
  const t = (net.tokens || {})[symbol.toUpperCase()];
  if (!t) throw new Error(`token ${symbol} not in networks.json for this network`);
  return t;
}
