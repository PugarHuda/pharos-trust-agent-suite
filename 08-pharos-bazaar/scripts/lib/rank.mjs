// Pure selection/ranking logic for the Bazaar — unit-testable, no I/O.
// Given discovered services (id, owner, endpoint, price, reputation), pick the best
// for an agent: this is the "self-improving index" decision that makes a hub valuable.

// Rank services: higher reputation first, then lower price, then lower id (stable).
export function rankServices(services) {
  const fin = (r) => (Number.isFinite(r) ? r : -1); // guard against null/NaN poisoning the comparator
  return [...services].sort((a, b) => {
    const ra = fin(a.reputation), rb = fin(b.reputation);
    if (rb !== ra) return rb - ra;
    const pa = BigInt(a.price ?? 0), pb = BigInt(b.price ?? 0);
    if (pa !== pb) return pa < pb ? -1 : 1;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

// Pick the best service that satisfies constraints: min reputation, max price.
export function pickBest(services, { minReputation = 0, maxPrice } = {}) {
  const eligible = rankServices(services).filter((s) => {
    if ((s.reputation ?? 0) < minReputation) return false;
    if (maxPrice !== undefined && BigInt(s.price ?? 0) > BigInt(maxPrice)) return false;
    return true;
  });
  return eligible[0] ?? null;
}

// A trust score for display: blends reputation (0-100) with a confidence note.
export function trustLabel(reputation, ratings) {
  if (reputation == null) return 'no reputation yet';
  const conf = ratings >= 20 ? 'high' : ratings >= 5 ? 'medium' : 'low';
  return `${reputation}/100 (confidence: ${conf})`;
}

// Export a discovered service as an x402-Bazaar / Coinbase Agent.market-compatible discovery item:
// an x402 PaymentRequirements ("accepts") block plus machine-readable metadata, so an external x402
// agent can find and pay this Pharos service the same way it finds Base/Solana ones — but with our
// on-chain reputation attached. Mirrors the x402 resource-discovery shape (scheme "exact").
export function toBazaarListing(service, { caip2 = 'eip155:688689', asset, tag } = {}) {
  return {
    x402Version: 1,
    resource: service.endpoint,
    type: 'http',
    accepts: [{
      scheme: 'exact',
      network: caip2,
      maxAmountRequired: String(service.price ?? '0'),
      resource: service.endpoint,
      payTo: service.owner,
      asset: asset ?? null,                       // settlement token (null = native)
      description: `Pharos agent service${tag ? ` (${tag})` : ''}`,
      mimeType: 'application/json',
    }],
    metadata: {
      provider: service.owner,
      registryId: service.id ?? null,
      reputation: service.reputation ?? null,     // the trust signal x402 Bazaar lacks
      ratings: service.ratings ?? 0,
      trust: trustLabel(service.reputation ?? null, service.ratings ?? 0),
    },
  };
}

// A full discovery catalog (ranked best-first), ready to publish to an x402 Bazaar index.
export function toBazaarCatalog(services, opts = {}) {
  return {
    x402Version: 1,
    network: opts.caip2 ?? 'eip155:688689',
    generatedFor: opts.tag ?? null,
    items: rankServices(services).map((s) => toBazaarListing(s, opts)),
  };
}
