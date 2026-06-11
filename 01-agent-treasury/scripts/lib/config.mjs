// Shared config: networks, artifact ABI, key + amount helpers.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Wallet, JsonRpcProvider } from 'ethers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadNetworks() {
  return JSON.parse(readFileSync(join(ROOT, 'assets', 'networks.json'), 'utf8'));
}

export function loadArtifact(name = 'AgentTreasury') {
  const path = join(ROOT, 'artifacts', `${name}.json`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
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
  // staticNetwork avoids an extra eth_chainId round-trip per call.
  return new JsonRpcProvider(net.rpcUrl, net.chainId, { staticNetwork: true });
}

// Resolve a signer from an env var. Never logs or returns the key itself.
export function getSigner(envVar, provider) {
  const pk = process.env[envVar];
  if (!pk) throw new Error(`missing ${envVar} — set it in the environment (never hardcode keys).`);
  const normalized = pk.startsWith('0x') ? pk : '0x' + pk;
  return new Wallet(normalized, provider);
}

// Resolve a token symbol or address to { address, decimals }.
export function resolveToken(net, tokenArg) {
  if (/^0x[0-9a-fA-F]{40}$/.test(tokenArg)) {
    const found = Object.values(net.tokens || {}).find(
      (t) => t.address.toLowerCase() === tokenArg.toLowerCase(),
    );
    return found || { address: tokenArg, decimals: 18 };
  }
  const t = (net.tokens || {})[tokenArg.toUpperCase()];
  if (!t) throw new Error(`token "${tokenArg}" not in registry; pass a 0x address instead.`);
  return t;
}

// "10" + 6 decimals -> 10000000n. Also accepts "10usdc" with a known token.
// Rejects more fractional precision than the token supports (rather than silently
// truncating dust or rounding a tiny amount down to 0).
export function parseAmount(amountArg, decimals) {
  const m = String(amountArg).match(/^([0-9]*\.?[0-9]+)\s*([a-zA-Z]*)$/);
  if (!m) throw new Error(`bad amount: ${amountArg}`);
  const [, num] = m;
  const [whole, frac = ''] = num.split('.');
  if (frac.length > decimals) {
    throw new Error(`amount ${num} has ${frac.length} decimal places but the token supports only ${decimals} — refusing to truncate`);
  }
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole + fracPadded);
}

// Parse a DURATION ("7d", "24h", "30m", "3600s", or a bare number = seconds) into an
// absolute unix expiry. Use the "@<ts>" form for an explicit absolute timestamp. This
// avoids the old footgun where a bare number near 1e9 was ambiguously a duration or a date.
export function parseExpiry(arg, now = Math.floor(Date.now() / 1000)) {
  const s = String(arg).trim();
  if (s.startsWith('@')) {
    const ts = Number(s.slice(1));
    if (!Number.isFinite(ts) || ts <= 0) throw new Error(`bad absolute expiry: ${arg}`);
    if (ts <= now) throw new Error(`absolute expiry ${new Date(ts * 1000).toISOString()} is not in the future`);
    return ts;
  }
  const m = s.match(/^(\d+)([dhms]?)$/);
  if (!m) throw new Error(`bad expiry: ${arg} (use 7d / 24h / 30m / 3600s, or @<unix-ts> for absolute)`);
  const n = Number(m[1]);
  const secs = { d: 86400, h: 3600, m: 60, s: 1, '': 1 }[m[2]];
  return now + n * secs;
}

export const GAS_BUFFER_BPS = 1500n; // +15% — Pharos charges by gas_limit

export function withGasBuffer(estimate) {
  return (estimate * (10000n + GAS_BUFFER_BPS)) / 10000n;
}

export function explorerTx(net, hash) {
  return `${net.explorer}/tx/${hash}`;
}
