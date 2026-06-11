#!/usr/bin/env node
// agent-shield — pre-flight security gate for Pharos agents.
// 100% read-only: no key handling, no signing, no state changes.
//
//   shield check-tx        --from 0x.. --to 0x.. [--data 0x..] [--value wei] [--rpc-url URL] [--network NAME]
//   shield verify-address  --address 0x.. [--network NAME]
//   shield check-approval  --spender 0x.. --amount <n|max> [--token 0x..] [--network NAME]
//   shield scan-skill      <path> [--allow-host host]...
//
// Global flags: --json (machine output), --registry <path>
// Exit codes: 0 = pass, 1 = warn, 2 = fail, 3 = usage/runtime error.

import { loadRegistry, classifyAddress } from './lib/registry.mjs';
import { createRpcClient } from './lib/rpc.mjs';
import { aggregate, render, exitCode, makeFinding } from './lib/report.mjs';
import { checkApproval, checkApprovalFromDecoded } from './lib/detectors/approval.mjs';
import { checkAddresses } from './lib/detectors/addresses.mjs';
import { simulateTx } from './lib/detectors/simulate.mjs';
import { scanSkill } from './lib/detectors/skillscan.mjs';
import { decodeCalldata, extractAddresses, isAddress } from './lib/calldata.mjs';

function parseArgs(argv) {
  const args = { _: [], allowHosts: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--allow-host') args.allowHosts.push(argv[++i]);
    else if (a.startsWith('--')) args[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else args._.push(a);
  }
  return args;
}

function usage() {
  console.error(`agent-shield — read-only pre-flight security for Pharos
usage:
  shield check-tx       --from 0x.. --to 0x.. [--data 0x..] [--value <wei>] [--rpc-url URL] [--network atlantic-testnet] [--check-sell-token 0x..]
  shield verify-address --address 0x.. [--network atlantic-testnet]
  shield check-approval --spender 0x.. --amount <n|max> [--token 0x..] [--network atlantic-testnet]
  shield scan-skill     <path-to-skill-dir-or-SKILL.md> [--allow-host host]
flags: --json --registry <path>`);
  process.exit(3);
}

function requireAddress(value, name) {
  if (!value || !isAddress(value)) {
    console.error(`error: --${name} must be a 0x-prefixed 20-byte address (got: ${value})`);
    process.exit(3);
  }
  return value;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const registry = loadRegistry(args.registry);
  const network = args.network || 'atlantic-testnet';
  if (!registry[network]) {
    console.error(`error: network "${network}" not in registry`);
    process.exit(3);
  }
  const rpcUrl = args.rpcUrl || registry[network].rpcUrl;

  let findings = [];

  switch (cmd) {
    case 'check-tx': {
      const from = requireAddress(args.from, 'from');
      const to = requireAddress(args.to, 'to');
      const data = args.data || '0x';
      const value = BigInt(args.value || 0);
      const rpc = createRpcClient(rpcUrl);

      // sanity: are we on the chain the registry says we are?
      try {
        const chainId = await rpc.chainId();
        if (chainId !== registry[network].chainId) {
          findings.push(makeFinding('high', 'RPC chainId mismatch',
            `RPC reports chainId ${chainId}, registry expects ${registry[network].chainId} for ${network}.`));
        }
      } catch (err) {
        findings.push(makeFinding('medium', 'RPC unreachable', `${rpcUrl}: ${err.message} — simulation skipped.`));
      }

      if (!findings.some((f) => f.severity === 'high' || f.title === 'RPC unreachable')) {
        findings.push(...await simulateTx({ from, to, data, value }, rpc, {
          tokenForSellCheck: args.checkSellToken,
        }));
      }

      // registry/poisoning pass over every address the tx touches
      const touched = [{ address: to, role: 'to' }];
      const decoded = decodeCalldata(data);
      if (decoded) {
        const roleNames = { approve: ['spender'], transfer: ['recipient'], transferFrom: ['sender', 'recipient'], setApprovalForAll: ['operator'] };
        decoded.params.forEach((p, i) => {
          if (typeof p === 'string' && isAddress(p)) {
            touched.push({ address: p, role: roleNames[decoded.name]?.[i] || `param${i}` });
          }
        });
        // Run the approval guard on approval-shaped calls (this is the whole point of
        // check-tx for an approve/permit/setApprovalForAll — without it the headline
        // "unlimited approval" detector never fires on a real transaction).
        findings.push(...checkApprovalFromDecoded(decoded, to, registry, network));
      }
      for (const addr of extractAddresses(data)) {
        if (!touched.some((t) => t.address.toLowerCase() === addr)) {
          touched.push({ address: addr, role: 'calldata' });
        }
      }
      findings.push(...checkAddresses(touched, registry, network));
      break;
    }

    case 'verify-address': {
      const address = requireAddress(args.address, 'address');
      const cls = classifyAddress(address, registry, network);
      if (cls.status === 'official' || cls.status === 'known-good') {
        findings.push(makeFinding('info', 'Address verified', `${address} = ${cls.label} (${cls.status}) on ${network}.`));
      } else if (cls.status === 'poisoning-suspect') {
        findings.push(makeFinding('high', 'Address poisoning suspect',
          `${address} looks like ${cls.lookalike.label} (${cls.lookalike.address}) — shares ${cls.lookalike.prefix}-char prefix / ${cls.lookalike.suffix}-char suffix but is a DIFFERENT address.`));
      } else {
        findings.push(makeFinding('medium', 'Address unknown',
          `${address} is not in the official/known-good registry for ${network}. Not necessarily malicious — verify independently.`));
      }
      break;
    }

    case 'check-approval': {
      const spender = requireAddress(args.spender, 'spender');
      if (args.token) requireAddress(args.token, 'token');
      if (args.amount === undefined) usage();
      findings = checkApproval({ token: args.token, spender, amount: args.amount, kind: args.kind || 'approve' }, registry, network);
      break;
    }

    case 'scan-skill': {
      const target = args._[0];
      if (!target) usage();
      findings = scanSkill(target, { allowedHosts: args.allowHosts });
      break;
    }

    default:
      usage();
  }

  const report = aggregate(findings, registry.rules?.severityWeights);
  console.log(render(report, { json: args.json }));
  process.exit(exitCode(report));
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(3);
});
