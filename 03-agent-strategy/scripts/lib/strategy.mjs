// Pure strategy evaluator: given a validated rule and a market snapshot, decide
// whether to trade and exactly what swap to make. No I/O, fully deterministic,
// so every branch is unit-testable.

// snapshot = { price, refPrice?, now, lastRunAt? }
// returns { action: 'noop'|'swap', reason, swap?: { sell, buy, side } }
export function evaluate(rule, snapshot) {
  switch (rule.kind) {
    case 'stop-loss': {
      const ref = rule.referencePrice ?? snapshot.refPrice;
      if (!(ref > 0)) return noop('stop-loss not armed: no reference price set');
      const trigger = ref * (1 - rule.dropPct / 100);
      if (snapshot.price <= trigger) {
        return swap(rule.asset, rule.quote, 'sell',
          `price ${snapshot.price} <= stop ${trigger.toFixed(6)} (ref ${ref}, -${rule.dropPct}%)`);
      }
      return noop(`holding: price ${snapshot.price} above stop ${trigger.toFixed(6)}`);
    }

    case 'threshold': {
      const hit = rule.comparator === 'lt' ? snapshot.price < rule.price : snapshot.price > rule.price;
      if (!hit) return noop(`no trigger: price ${snapshot.price} not ${rule.comparator === 'lt' ? '<' : '>'} ${rule.price}`);
      return rule.side === 'buy'
        ? swap(rule.quote, rule.asset, 'buy', `price ${snapshot.price} ${rule.comparator === 'lt' ? '<' : '>'} ${rule.price} -> buy ${rule.asset}`)
        : swap(rule.asset, rule.quote, 'sell', `price ${snapshot.price} ${rule.comparator === 'lt' ? '<' : '>'} ${rule.price} -> sell ${rule.asset}`);
    }

    case 'dca': {
      const last = rule.lastRunAt ?? snapshot.lastRunAt;
      if (last != null && snapshot.now - last < rule.intervalSeconds) {
        const wait = rule.intervalSeconds - (snapshot.now - last);
        return noop(`DCA interval not elapsed: ${wait}s remaining`);
      }
      return swap(rule.tokenIn, rule.tokenOut, 'buy', `DCA ${rule.amountIn} ${rule.tokenIn} -> ${rule.tokenOut}`);
    }

    case 'rebalance': {
      // snapshot must carry weights for rebalance: { weightA } in percent (0..100)
      if (snapshot.weightA == null) return noop('rebalance needs current weightA in snapshot');
      const drift = snapshot.weightA - rule.targetA;
      if (Math.abs(drift) <= rule.bandPct) return noop(`within band: weightA ${snapshot.weightA}% vs target ${rule.targetA}% (drift ${drift.toFixed(2)}%)`);
      return drift > 0
        ? swap(rule.tokenA, rule.tokenB, 'sell', `overweight ${rule.tokenA} by ${drift.toFixed(2)}% -> sell into ${rule.tokenB}`)
        : swap(rule.tokenB, rule.tokenA, 'buy', `underweight ${rule.tokenA} by ${(-drift).toFixed(2)}% -> buy ${rule.tokenA}`);
    }

    default:
      return noop(`unknown kind ${rule.kind}`);
  }
}

function noop(reason) { return { action: 'noop', reason }; }
function swap(sell, buy, side, reason) { return { action: 'swap', reason, swap: { sell, buy, side } }; }
