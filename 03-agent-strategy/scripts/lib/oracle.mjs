// Oracle adapter for Pharos Chainlink Push Engine feeds.
//
// Pharos quirk: Atlantic proxies are SelfManagedFeedsCacheProxy contracts that
// expose latestAnswer()/latestTimestamp()/decimals() but REVERT on the standard
// latestRoundData(). We try the standard interface first (so the same code works
// on real Chainlink), then fall back to the legacy getters Pharos supports.

import { Contract } from 'ethers';

const ABI = [
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
  'function latestAnswer() view returns (int256)',
  'function latestTimestamp() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
];

export class OracleError extends Error {
  constructor(message, { stale = false } = {}) { super(message); this.name = 'OracleError'; this.stale = stale; }
}

// Read a price with freshness + sanity guards. Returns:
//   { price: number, raw: bigint, decimals: number, updatedAt: number, ageSeconds: number, source }
export async function readPrice(provider, feedAddress, {
  maxStalenessSeconds = 3600, now = Math.floor(Date.now() / 1000),
} = {}) {
  const feed = new Contract(feedAddress, ABI, provider);
  const decimals = Number(await feed.decimals());

  let answer; let updatedAt; let source;
  try {
    const [roundId, ans, , upd, answeredInRound] = await feed.latestRoundData();
    if (answeredInRound < roundId) throw new OracleError('stale round (answeredInRound < roundId)', { stale: true });
    answer = ans; updatedAt = Number(upd); source = 'latestRoundData';
  } catch (err) {
    if (err instanceof OracleError) throw err;
    // Fallback to Pharos SelfManagedFeedsCacheProxy legacy getters.
    answer = await feed.latestAnswer();
    updatedAt = Number(await feed.latestTimestamp());
    source = 'latestAnswer';
  }

  if (answer <= 0n) throw new OracleError(`non-positive oracle answer (${answer})`);
  const ageSeconds = now - updatedAt;
  if (ageSeconds > maxStalenessSeconds) {
    throw new OracleError(`oracle stale: ${ageSeconds}s old > ${maxStalenessSeconds}s max`, { stale: true });
  }

  const price = Number(answer) / 10 ** decimals;
  return { price, raw: answer, decimals, updatedAt, ageSeconds, source };
}

// Cross-check two prices; returns true if they agree within toleranceBps.
export function agrees(priceA, priceB, toleranceBps = 200) {
  if (!(priceA > 0) || !(priceB > 0)) return false;
  const diffBps = Math.abs(priceA - priceB) / ((priceA + priceB) / 2) * 10000;
  return diffBps <= toleranceBps;
}
