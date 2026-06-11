#!/usr/bin/env node
// agent-strategy CLI — compile a natural-language mandate, read an oracle, decide,
// and (optionally) execute a slippage-bounded swap through agent-treasury.
//
//   strategy compile --rule "sell WETH if it drops 10%, 0.5% slippage"
//   strategy price   --feed BTC/USD
//   strategy eval    --rule "buy WPHRS when price < 0.20" --feed BTC/USD [--ref 100] [--weight-a 60]
//   strategy plan    --rule "DCA 1 USDC -> WETH daily" --router 0x.. --quote-out 1990000 --treasury 0x..
//
// Read-only by default. `plan` prints the treasury.executeCall calldata an agent
// would submit (via agent-treasury) — it does NOT broadcast. Execution is the
// treasury skill's job, so this skill never needs a key for the demo path.
//
// Global: --network atlantic-testnet --max-staleness <sec> --json

import { compileRule, validateRule } from './lib/rules.mjs';
import { evaluate } from './lib/strategy.mjs';
import { readPrice, OracleError } from './lib/oracle.mjs';
import { buildSwapPlan } from './lib/swap.mjs';
import { loadNetworks, loadOracles, pickNetwork, getProvider, tokenAddress } from './lib/config.mjs';

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json') a.json = true;
    else if (k.startsWith('--')) a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else a._.push(k);
  }
  return a;
}
function die(m) { console.error(`error: ${m}`); process.exit(2); }
function out(obj, json) { console.log(json ? JSON.stringify(obj, null, 2) : obj); }

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const networks = loadNetworks();
  const oracles = loadOracles();
  const netName = args.network || Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
  const net = pickNetwork(networks, netName);
  const oracleNet = oracles[netName] || {};
  const maxStaleness = Number(args.maxStaleness || oracleNet.heartbeatSeconds || 3600);

  const resolveFeed = (name) => {
    if (!name) return null;
    if (/^0x[0-9a-fA-F]{40}$/.test(name)) return name;
    const f = (oracleNet.feeds || {})[name.toUpperCase()];
    if (!f) die(`feed "${name}" not in oracles.json (have: ${Object.keys(oracleNet.feeds || {}).join(', ') || 'none'})`);
    return f.address;
  };

  switch (cmd) {
    case 'compile': {
      const rule = compileRule(args.rule || die('--rule "..." required'));
      console.log('Parsed and validated strategy struct (only this executes):');
      out(rule, true);
      break;
    }

    case 'price': {
      const feed = resolveFeed(args.feed || die('--feed BTC/USD or 0x.. required'));
      const provider = getProvider(net);
      try {
        const p = await readPrice(provider, feed, { maxStalenessSeconds: maxStaleness });
        console.log(`price: ${p.price}`);
        console.log(`  source: ${p.source}  decimals: ${p.decimals}  age: ${p.ageSeconds}s (max ${maxStaleness}s)`);
        if (args.json) out(p, true);
      } catch (err) {
        if (err instanceof OracleError) die(`oracle rejected: ${err.message}`);
        throw err;
      }
      break;
    }

    case 'eval': {
      const rule = compileRule(args.rule || die('--rule "..." required'));
      const snapshot = { now: Math.floor(Date.now() / 1000) };
      if (args.ref) snapshot.refPrice = Number(args.ref);
      if (args.weightA) snapshot.weightA = Number(args.weightA);
      if (args.lastRunAt) snapshot.lastRunAt = Number(args.lastRunAt);

      // Read oracle if a feed is given and the rule is price-driven.
      let priceInfo = null;
      if (args.feed && rule.kind !== 'dca') {
        const provider = getProvider(net);
        try {
          priceInfo = await readPrice(provider, resolveFeed(args.feed), { maxStalenessSeconds: maxStaleness });
          snapshot.price = priceInfo.price;
        } catch (err) {
          if (err instanceof OracleError) {
            console.log(`decision: NOOP (oracle unusable: ${err.message})`);
            process.exit(0);
          }
          throw err;
        }
      } else if (args.price) {
        snapshot.price = Number(args.price);
      }

      const decision = evaluate(rule, snapshot);
      console.log(`rule: ${rule.kind}`);
      if (priceInfo) console.log(`price: ${priceInfo.price} (age ${priceInfo.ageSeconds}s, ${priceInfo.source})`);
      console.log(`decision: ${decision.action.toUpperCase()} — ${decision.reason}`);
      if (decision.action === 'swap') console.log(`  swap: ${decision.swap.side} ${decision.swap.sell} -> ${decision.swap.buy}`);
      if (args.json) out({ rule, snapshot, decision }, true);
      break;
    }

    case 'plan': {
      const rule = compileRule(args.rule || die('--rule "..." required'));
      const router = args.router || die('--router 0x.. required');
      const treasury = args.treasury || die('--treasury 0x.. required (swap is routed through it)');
      const quoteOut = BigInt(args.quoteOut ?? die('--quote-out <baseUnits> required (from getAmountsOut)'));
      const snapshot = { now: Math.floor(Date.now() / 1000), price: args.price ? Number(args.price) : undefined, refPrice: args.ref ? Number(args.ref) : undefined, weightA: args.weightA ? Number(args.weightA) : undefined };
      const decision = evaluate(rule, snapshot);
      if (decision.action !== 'swap') { console.log(`decision: NOOP — ${decision.reason}`); break; }

      const tokenIn = tokenAddress(net, decision.swap.sell).address;
      const tokenOut = tokenAddress(net, decision.swap.buy).address;
      const amountIn = BigInt(args.amountIn ?? die('--amount-in <baseUnits> required'));
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const plan = buildSwapPlan({ tokenIn, tokenOut, router, amountIn, quoteOut, slippageBps: rule.slippageBps, recipient: treasury, deadline });

      console.log(`decision: SWAP — ${decision.reason}`);
      console.log(`  slippage: ${rule.slippageBps} bps -> minAmountOut ${plan.minAmountOut}`);
      console.log('  step 1 (approve, exact amount) treasury.executeCall data:');
      console.log(`    ${plan.approve.data}`);
      console.log('  step 2 (swap) treasury.executeCall data:');
      console.log(`    ${plan.swap.data}`);
      console.log('Next: pre-flight with `shield check-tx`, then submit each via the treasury session key.');
      if (args.json) out({ rule, decision, plan: { ...plan, minAmountOut: plan.minAmountOut.toString() } }, true);
      break;
    }

    default:
      console.error('commands: compile price eval plan');
      console.error('example: node scripts/strategy.mjs price --feed BTC/USD');
      process.exit(2);
  }
}

main().catch((e) => die(e.message));
