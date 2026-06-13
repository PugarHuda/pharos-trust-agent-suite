import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankServices, pickBest, trustLabel, toBazaarListing, toBazaarCatalog } from '../scripts/lib/rank.mjs';

const services = [
  { id: 1, price: '1000', reputation: 60, ratings: 3 },
  { id: 2, price: '500', reputation: 60, ratings: 25 },
  { id: 3, price: '500', reputation: 90, ratings: 30 },
  { id: 4, price: '100', reputation: null, ratings: 0 },
];

test('rankServices: reputation desc, then price asc, then id', () => {
  const r = rankServices(services).map((s) => s.id);
  assert.deepEqual(r, [3, 2, 1, 4]); // 90 first; then 60s by price (500 before 1000); null last
});

test('pickBest honors min reputation and max price', () => {
  assert.equal(pickBest(services).id, 3); // highest rep
  assert.equal(pickBest(services, { minReputation: 95 }), null); // none qualify
  assert.equal(pickBest(services, { maxPrice: '400' }).id, 4); // only the 100-price one fits
  assert.equal(pickBest(services, { minReputation: 60, maxPrice: '600' }).id, 3);
});

test('trustLabel reflects confidence by sample size', () => {
  assert.match(trustLabel(90, 30), /high/);
  assert.match(trustLabel(70, 10), /medium/);
  assert.match(trustLabel(50, 2), /low/);
  assert.equal(trustLabel(null, 0), 'no reputation yet');
});

test('rankServices does not mutate the input', () => {
  const copy = [...services];
  rankServices(services);
  assert.deepEqual(services, copy);
});

test('toBazaarListing emits an x402-compatible discovery item with our reputation attached', () => {
  const l = toBazaarListing(
    { id: 3, owner: '0xabc', endpoint: 'https://svc/x402', price: '500', reputation: 90, ratings: 30 },
    { caip2: 'eip155:688689', asset: '0xUSDC', tag: 'price-feed' });
  assert.equal(l.x402Version, 1);
  assert.equal(l.accepts[0].scheme, 'exact');
  assert.equal(l.accepts[0].network, 'eip155:688689');
  assert.equal(l.accepts[0].maxAmountRequired, '500');
  assert.equal(l.accepts[0].payTo, '0xabc');
  assert.equal(l.accepts[0].asset, '0xUSDC');
  assert.equal(l.metadata.reputation, 90);     // the signal vanilla x402 Bazaar lacks
  assert.match(l.metadata.trust, /high/);
});

test('toBazaarCatalog ranks items best-first and carries the network', () => {
  const cat = toBazaarCatalog(services, { caip2: 'eip155:688689', tag: 'price-feed' });
  assert.equal(cat.x402Version, 1);
  assert.equal(cat.network, 'eip155:688689');
  assert.deepEqual(cat.items.map((i) => i.metadata.registryId), [3, 2, 1, 4]); // ranked
});
