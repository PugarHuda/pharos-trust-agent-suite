// Pure selection/ranking logic for the Bazaar — unit-testable, no I/O.
// Given discovered services (id, owner, endpoint, price, reputation), pick the best
// for an agent: this is the "self-improving index" decision that makes a hub valuable.

// Rank services: higher reputation first, then lower price, then lower id (stable).
export function rankServices(services) {
  return [...services].sort((a, b) => {
    const ra = a.reputation ?? -1, rb = b.reputation ?? -1;
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
