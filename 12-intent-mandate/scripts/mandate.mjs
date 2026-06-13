#!/usr/bin/env node
// intent-mandate CLI — a cryptographic leash for agents (AP2-style Intent Mandate). A user funds the
// contract and signs (EIP-712, gasless) an envelope; the authorized agent can then spend the user's
// funds ONLY within that envelope (cap, recipient, expiry). Even a jailbroken agent can't exceed it.
//
//   mandate deploy                                                          ($USER_PRIVATE_KEY)
//   mandate fund   --mandate 0x.. --amount 0.01                             ($USER_PRIVATE_KEY)
//   mandate sign   --mandate 0x.. --agent 0x.. --recipient 0x.. --max 0.01 \
//                  [--expiry 1h] [--nonce 1] [--out mandate.json]           ($USER_PRIVATE_KEY)
//   mandate spend  --file mandate.json --to 0x.. --amount 0.005             ($AGENT_PRIVATE_KEY)
//   mandate remaining --file mandate.json
//   mandate revoke    --file mandate.json                                   ($USER_PRIVATE_KEY)
//   mandate withdraw  --mandate 0x.. --amount 0.005                         ($USER_PRIVATE_KEY)
//
// Keys from a gitignored .env: $USER_PRIVATE_KEY (funds/signs/revokes/withdraws), $AGENT_PRIVATE_KEY
// (executes). Global: --network atlantic-testnet.

import { writeFileSync, readFileSync } from 'node:fs';
import { Contract, parseEther, formatEther } from 'ethers';
import {
  loadNetworks, loadArtifact, pickNetwork, getProvider, getSigner, withGasBuffer, explorerTx,
} from './lib/config.mjs';

const TYPES = {
  IntentMandate: [
    { name: 'user', type: 'address' }, { name: 'agent', type: 'address' },
    { name: 'recipient', type: 'address' }, { name: 'maxAmount', type: 'uint256' },
    { name: 'expiry', type: 'uint64' }, { name: 'nonce', type: 'uint256' },
  ],
};

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else a._.push(k);
  }
  return a;
}
const die = (m) => { console.error(`error: ${m}`); process.exit(2); };
function parseExpiry(s) {
  if (!s) return BigInt(Math.floor(Date.now() / 1000) + 3600);
  if (s.startsWith('@')) return BigInt(s.slice(1));
  const m = String(s).match(/^(\d+)([smhd])?$/); if (!m) die(`bad --expiry ${s}`);
  const mult = { s: 1n, m: 60n, h: 3600n, d: 86400n }[m[2] || 's'];
  return BigInt(Math.floor(Date.now() / 1000)) + BigInt(m[1]) * mult;
}
const toMandateArray = (m) => [m.user, m.agent, m.recipient, m.maxAmount, m.expiry, m.nonce];

async function send(c, method, args, net, label, overrides = {}) {
  let gas;
  try { gas = await c[method].estimateGas(...args, overrides); }
  catch (e) { die(`${label} would revert: ${e.revert?.name || e.shortMessage || e.message}`); }
  const tx = await c[method](...args, { ...overrides, gasLimit: withGasBuffer(gas) });
  console.log(`  ${label} sent: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`  confirmed in block ${rc.blockNumber} — ${explorerTx(net, tx.hash)}`);
  return rc;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const networks = loadNetworks();
  const netName = args.network || Object.keys(networks).find((k) => networks[k].default) || 'atlantic-testnet';
  const net = pickNetwork(networks, netName);
  const provider = getProvider(net);
  const ART = loadArtifact('IntentMandate');
  const loadFile = () => JSON.parse(readFileSync(args.file || die('--file required'), 'utf8'));

  switch (cmd) {
    case 'deploy': {
      const signer = getSigner('USER_PRIVATE_KEY', provider);
      const { ContractFactory } = await import('ethers');
      const c = await new ContractFactory(ART.abi, ART.bytecode, signer).deploy();
      console.log(`deploying IntentMandate… ${c.deploymentTransaction().hash}`);
      await c.waitForDeployment();
      const addr = await c.getAddress();
      console.log(`IntentMandate deployed: ${addr}`);
      console.log(`  ${net.explorer}/address/${addr}`);
      break;
    }

    case 'fund': {
      const signer = getSigner('USER_PRIVATE_KEY', provider);
      const c = new Contract(args.mandate || die('--mandate required'), ART.abi, signer);
      await send(c, 'fund', [], net, 'fund', { value: parseEther(args.amount || die('--amount required')) });
      break;
    }

    case 'sign': {
      const signer = getSigner('USER_PRIVATE_KEY', provider);
      const contract = args.mandate || die('--mandate 0x.. required');
      const m = {
        user: signer.address,
        agent: args.agent || die('--agent 0x.. required'),
        recipient: args.recipient || '0x0000000000000000000000000000000000000000',
        maxAmount: parseEther(args.max || die('--max required')).toString(),
        expiry: parseExpiry(args.expiry).toString(),
        nonce: (args.nonce || '1').toString(),
      };
      const domain = { name: 'IntentMandate', version: '1', chainId: net.chainId, verifyingContract: contract };
      const signature = await signer.signTypedData(domain, TYPES, m);
      const out = { contract, mandate: m, signature };
      writeFileSync(args.out || 'mandate.json', JSON.stringify(out, null, 2));
      console.log(`signed mandate → ${args.out || 'mandate.json'}`);
      console.log(`  user ${m.user} authorizes agent ${m.agent} to spend ≤ ${formatEther(m.maxAmount)} ${net.nativeToken}`);
      console.log(`  recipient ${m.recipient === '0x0000000000000000000000000000000000000000' ? '(any)' : m.recipient}, expiry ${m.expiry}, nonce ${m.nonce}`);
      break;
    }

    case 'spend': {
      const { contract, mandate, signature } = loadFile();
      const signer = getSigner('AGENT_PRIVATE_KEY', provider);
      const c = new Contract(contract, ART.abi, signer);
      const to = args.to || mandate.recipient;
      const amount = parseEther(args.amount || die('--amount required'));
      await send(c, 'spendUnderMandate', [toMandateArray(mandate), signature, to, amount], net, 'spendUnderMandate');
      console.log(`  ${formatEther(amount)} ${net.nativeToken} sent to ${to} under the user's signed mandate.`);
      break;
    }

    case 'remaining': {
      const { contract, mandate } = loadFile();
      const c = new Contract(contract, ART.abi, provider);
      const r = await c.remaining(toMandateArray(mandate));
      console.log(`remaining on mandate: ${formatEther(r)} ${net.nativeToken}`);
      break;
    }

    case 'revoke': {
      const { contract, mandate } = loadFile();
      const signer = getSigner('USER_PRIVATE_KEY', provider);
      const c = new Contract(contract, ART.abi, signer);
      await send(c, 'revoke', [toMandateArray(mandate)], net, 'revoke');
      break;
    }

    case 'withdraw': {
      const signer = getSigner('USER_PRIVATE_KEY', provider);
      const c = new Contract(args.mandate || die('--mandate required'), ART.abi, signer);
      await send(c, 'withdraw', [parseEther(args.amount || die('--amount required'))], net, 'withdraw');
      break;
    }

    default:
      console.error('commands: deploy fund sign spend remaining revoke withdraw');
      process.exit(2);
  }
}

main().catch((e) => die(e.message));
