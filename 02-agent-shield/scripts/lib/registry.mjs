// Registry classification + address-poisoning detection against
// assets/registry.json (official Pharos addresses).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeAddress } from './calldata.mjs';

const DEFAULT_REGISTRY_PATH = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'registry.json',
);

export function loadRegistry(path = DEFAULT_REGISTRY_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function knownAddresses(registry, network) {
  const net = registry[network];
  if (!net) throw new Error(`unknown network "${network}" in registry`);
  const entries = [];
  for (const [tier, map] of [['official', net.official], ['knownGood', net.knownGood]]) {
    for (const [addr, label] of Object.entries(map || {})) {
      if (addr.startsWith('_')) continue;
      entries.push({ address: normalizeAddress(addr), label, tier });
    }
  }
  return entries;
}

function matchLengths(a, b) {
  // a, b: 40-char hex bodies (no 0x). Returns shared prefix/suffix lengths.
  let prefix = 0;
  while (prefix < 40 && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < 40 - prefix && a[39 - suffix] === b[39 - suffix]) suffix++;
  return { prefix, suffix };
}

// Classify one address:
//   { status: 'official'|'known-good'|'poisoning-suspect'|'unknown', label?, lookalike? }
export function classifyAddress(address, registry, network = 'atlantic-testnet') {
  const addr = normalizeAddress(address);
  const known = knownAddresses(registry, network);

  const exact = known.find((k) => k.address === addr);
  if (exact) {
    return { status: exact.tier === 'official' ? 'official' : 'known-good', label: exact.label };
  }

  const minMatch = registry.rules?.poisoningMinPrefixSuffixMatch ?? 6;
  const body = addr.slice(2);
  for (const k of known) {
    const { prefix, suffix } = matchLengths(body, k.address.slice(2));
    // Leading-zero runs carry NO anti-poisoning signal: canonical addresses like
    // Permit2 (0x000000000022..) and EntryPoint (0x0000000071..) start with many
    // zeros, so any zero-padded vanity/CREATE2 address would share a long zero
    // prefix by coincidence. Require the shared prefix to contain real (non-zero)
    // hex so the match reflects a deliberate look-alike, not zero padding.
    const sharedPrefix = body.slice(0, prefix);
    const nonZeroPrefix = sharedPrefix.replace(/0/g, '').length;
    if (prefix >= minMatch && suffix >= minMatch && nonZeroPrefix >= 3) {
      return {
        status: 'poisoning-suspect',
        lookalike: { address: k.address, label: k.label, prefix, suffix },
      };
    }
  }
  return { status: 'unknown' };
}
