#!/usr/bin/env node
// agent-utils — read-only utilities an agent calls constantly. No keys, no writes.
//
//   utils price        --feed BTC/USD [--max-staleness 3600]
//   utils gas          [--to 0x.. --data 0x.. --from 0x..]   (suggest a tight gas limit + fee)
//   utils token        --token 0x..|SYMBOL                    (name/symbol/decimals/supply)
//   utils balance      --address 0x.. [--token 0x..|SYMBOL]   (native or ERC-20)
//   utils safe-address --address 0x..                          (registry + poisoning check)
//
// Global: --network atlantic-testnet --rpc-url URL --json. Exit 0 ok, 1 warn/unsafe, 2 error.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JsonRpcProvider, Contract } from 'ethers';
import { suggestGasLimit, totalFee, scalePrice, formatUnits, classifyAddress, isAddress } from './lib/util.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const networks = JSON.parse(readFileSync(join(ROOT, 'assets', 'networks.json'), 'utf8'));

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
const die = (m) => { console.error(`error: ${m}`); process.exit(2); };
const ERC20 = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)'];
const FEED = ['function latestAnswer() view returns (int256)', 'function latestTimestamp() view returns (uint256)', 'function decimals() view returns (uint8)'];

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const netName = args.network || Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
  const net = networks[netName] || die(`unknown network ${netName}`);
  const provider = new JsonRpcProvider(args.rpcUrl || net.rpcUrl, net.chainId, { staticNetwork: true });
  const resolveToken = (t) => isAddress(t) ? { address: t, decimals: null } : (net.tokens?.[t?.toUpperCase()] || die(`token ${t} not in registry; pass a 0x address`));

  switch (cmd) {
    case 'price': {
      const name = args.feed || die('--feed BTC/USD required');
      const f = net.oracleFeeds?.[name.toUpperCase()] || (isAddress(name) ? { address: name } : die(`feed ${name} unknown`));
      const c = new Contract(f.address, FEED, provider);
      const decimals = f.decimals ?? Number(await c.decimals());
      const answer = await c.latestAnswer();
      const updated = Number(await c.latestTimestamp());
      const age = Math.floor(Date.now() / 1000) - updated;
      const max = Number(args.maxStaleness || 3600);
      if (answer <= 0n) die('non-positive oracle answer');
      const stale = age > max;
      const { price } = scalePrice(answer, decimals);
      console.log(`${name}: ${price}${stale ? '  (STALE)' : ''}  age=${age}s`);
      if (args.json) console.log(JSON.stringify({ feed: name, price, raw: answer.toString(), decimals, ageSeconds: age, stale }));
      process.exit(stale ? 1 : 0);
      break;
    }

    case 'gas': {
      const gasPrice = (await provider.getFeeData()).gasPrice ?? 0n;
      let estimate = args.estimate ? BigInt(args.estimate) : null;
      if (!estimate && args.to) {
        estimate = await provider.estimateGas({ to: args.to, data: args.data || '0x', from: args.from, value: BigInt(args.value || 0) });
      }
      if (!estimate) estimate = 21000n; // bare transfer default
      const limit = suggestGasLimit(estimate, BigInt(args.bufferBps || 1500));
      const fee = totalFee(limit, gasPrice);
      console.log(`estimate: ${estimate}  suggested gas limit (+15%): ${limit}`);
      console.log(`gas price: ${gasPrice} wei  max fee (limit*price): ${formatUnits(fee, 18)} ${net.nativeToken}`);
      console.log('note: Pharos charges by gas_limit at inclusion — refunds do not reduce the charge.');
      if (args.json) console.log(JSON.stringify({ estimate: estimate.toString(), suggestedGasLimit: limit.toString(), gasPrice: gasPrice.toString(), maxFeeWei: fee.toString() }));
      break;
    }

    case 'token': {
      const { address } = resolveToken(args.token || die('--token 0x..|SYMBOL required'));
      const c = new Contract(address, ERC20, provider);
      const [name, symbol, decimals, supply] = await Promise.all([
        c.name().catch(() => '?'), c.symbol().catch(() => '?'), c.decimals().catch(() => 18), c.totalSupply().catch(() => 0n),
      ]);
      console.log(`${address}`);
      console.log(`  ${name} (${symbol}), decimals ${decimals}, totalSupply ${formatUnits(supply, decimals)}`);
      if (args.json) console.log(JSON.stringify({ address, name, symbol, decimals: Number(decimals), totalSupply: supply.toString() }));
      break;
    }

    case 'balance': {
      const who = args.address || die('--address 0x.. required');
      if (!isAddress(who)) die(`bad --address ${who}`);
      if (args.token) {
        const { address, decimals } = resolveToken(args.token);
        const c = new Contract(address, ERC20, provider);
        const [bal, dec] = await Promise.all([c.balanceOf(who), decimals ?? c.decimals()]);
        console.log(`${who}: ${formatUnits(bal, dec)} (token ${address})`);
        if (args.json) console.log(JSON.stringify({ address: who, token: address, balance: bal.toString(), decimals: Number(dec) }));
      } else {
        const bal = await provider.getBalance(who);
        console.log(`${who}: ${formatUnits(bal, 18)} ${net.nativeToken}`);
        if (args.json) console.log(JSON.stringify({ address: who, balance: bal.toString(), nativeToken: net.nativeToken }));
      }
      break;
    }

    case 'safe-address': {
      const address = args.address || die('--address 0x.. required');
      if (!isAddress(address)) die(`bad --address ${address}`);
      const registry = { ...(net.knownContracts || {}) };
      for (const [, t] of Object.entries(net.tokens || {})) registry[t.address] = 'registered token';
      const cls = classifyAddress(address, registry);
      if (cls.status === 'known') { console.log(`SAFE — ${address} = ${cls.label}`); process.exit(0); }
      if (cls.status === 'poisoning-suspect') {
        console.log(`UNSAFE — ${address} looks like ${cls.lookalike.label} (${cls.lookalike.address}) but differs in the middle (address poisoning).`);
        process.exit(1);
      }
      console.log(`UNKNOWN — ${address} is not in the registry. Not necessarily malicious; verify independently.`);
      process.exit(1);
      break;
    }

    default:
      console.error('commands: price gas token balance safe-address');
      process.exit(2);
  }
}

main().catch((e) => die(e.message));
