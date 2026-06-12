// Shared config for the mesh CLI: networks, artifacts, signer, helpers.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Wallet, JsonRpcProvider, id } from 'ethers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Minimal zero-dependency .env loader (keys stay in a gitignored file).
function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const val = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnv();

export function loadNetworks() {
  return JSON.parse(readFileSync(join(ROOT, 'assets', 'networks.json'), 'utf8'));
}

export function loadArtifact(name) {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'artifacts', `${name}.json`), 'utf8'));
  } catch {
    throw new Error(`artifact ${name}.json not found — run "npm run build" first.`);
  }
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

// A capability tag is keccak256 of a human label, e.g. tag("price-feed").
export function tag(label) {
  return /^0x[0-9a-fA-F]{64}$/.test(label) ? label : id(label);
}

export const GAS_BUFFER_BPS = 1500n;
export function withGasBuffer(estimate) {
  return (estimate * (10000n + GAS_BUFFER_BPS)) / 10000n;
}

export function explorerTx(net, hash) { return `${net.explorer}/tx/${hash}`; }
