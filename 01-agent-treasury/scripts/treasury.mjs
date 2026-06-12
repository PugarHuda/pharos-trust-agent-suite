#!/usr/bin/env node
// agent-treasury CLI — deploy and operate an on-chain spending-policy treasury
// on Pharos. Owner ops sign with $OWNER_PRIVATE_KEY; agent ops sign with
// $SESSION_PRIVATE_KEY. Keys are read from the environment only, never logged.
//
//   treasury deploy            [--owner 0x..]
//   treasury set-policy        --treasury 0x.. --token USDC --daily-cap 10
//   treasury allow-contract    --treasury 0x.. --target 0x.. [--off]
//   treasury grant-session     --treasury 0x.. --key 0x.. --budget 5 --token USDC --expires 7d
//   treasury revoke            --treasury 0x.. --key 0x..
//   treasury kill / unkill     --treasury 0x..
//   treasury spend             --treasury 0x.. --token USDC --to 0x.. --amount 1 [--yes]
//   treasury status            --treasury 0x.. [--token USDC] [--key 0x..]
//
// Global: --network atlantic-testnet --json
// Exit: 0 ok, 1 pre-flight blocked (use --yes to override), 2 error.

import { Contract, formatUnits } from 'ethers';
import {
  loadNetworks, loadArtifact, pickNetwork, getProvider, getSigner,
  resolveToken, parseAmount, parseExpiry, withGasBuffer, explorerTx,
} from './lib/config.mjs';
import { preflight } from './lib/preflight.mjs';

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--yes' || k === '--off' || k === '--json') a[k.slice(2)] = true;
    else if (k.startsWith('--')) a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else a._.push(k);
  }
  return a;
}

function die(msg) { console.error(`error: ${msg}`); process.exit(2); }

async function sendTx(contract, method, args, net, label) {
  let gas;
  try {
    gas = await contract[method].estimateGas(...args);
  } catch (err) {
    throw new Error(`${label} would revert: ${err.revert?.name || err.shortMessage || err.message}`);
  }
  const tx = await contract[method](...args, { gasLimit: withGasBuffer(gas) });
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
  if (netName !== 'atlantic-testnet') {
    console.error(`!! Operating on ${net.name} (chainId ${net.chainId}) — NOT the default testnet.`);
  }
  const artifact = loadArtifact('AgentTreasury');
  const provider = getProvider(net);

  const ownerContract = () => {
    if (!args.treasury) die('--treasury 0x.. required');
    return new Contract(args.treasury, artifact.abi, getSigner('OWNER_PRIVATE_KEY', provider));
  };
  const sessionContract = () => {
    if (!args.treasury) die('--treasury 0x.. required');
    return new Contract(args.treasury, artifact.abi, getSigner('SESSION_PRIVATE_KEY', provider));
  };
  const readContract = () => new Contract(args.treasury, artifact.abi, provider);

  switch (cmd) {
    case 'address': {
      // Show the address + native balance for a key WITHOUT ever printing the key.
      const which = args.session ? 'SESSION_PRIVATE_KEY' : 'OWNER_PRIVATE_KEY';
      const signer = getSigner(which, provider);
      const addr = await signer.getAddress();
      const bal = await provider.getBalance(addr);
      console.log(`${which.replace('_PRIVATE_KEY', '')} address: ${addr}`);
      console.log(`  balance: ${formatUnits(bal, 18)} ${net.nativeToken} on ${net.name}`);
      console.log(`  ${net.explorer}/address/${addr}`);
      if (bal === 0n) console.error('  !! zero balance — fund this address from a faucet before deploying.');
      break;
    }

    case 'deploy': {
      const signer = getSigner('OWNER_PRIVATE_KEY', provider);
      const owner = args.owner || (await signer.getAddress());
      console.log(`Deploying AgentTreasury (owner ${owner}) to ${net.name}...`);
      const factory = new (await import('ethers')).ContractFactory(artifact.abi, artifact.bytecode, signer);
      const gas = await provider.estimateGas(await factory.getDeployTransaction(owner));
      const c = await factory.deploy(owner, { gasLimit: withGasBuffer(gas) });
      console.log(`  deploy tx: ${c.deploymentTransaction().hash}`);
      await c.waitForDeployment();
      const addr = await c.getAddress();
      console.log(`  treasury deployed at: ${addr}`);
      console.log(`  ${net.explorer}/address/${addr}`);
      if (args.json) console.log(JSON.stringify({ treasury: addr, owner }));
      break;
    }

    case 'set-policy': {
      const token = resolveToken(net, args.token || die('--token required'));
      const cap = parseAmount(args.dailyCap ?? die('--daily-cap required'), token.decimals);
      console.log(`Set policy: token ${token.address} daily cap ${args.dailyCap} (${cap} units)`);
      await sendTx(ownerContract(), 'setPolicy', [token.address, cap], net, 'setPolicy');
      break;
    }

    case 'allow-contract': {
      const target = args.target || die('--target required');
      const allowed = !args.off;
      console.log(`${allowed ? 'Allow' : 'Disallow'} destination contract ${target}`);
      await sendTx(ownerContract(), 'setAllowedContract', [target, allowed], net, 'setAllowedContract');
      break;
    }

    case 'grant-session': {
      const key = args.key || die('--key 0x.. required');
      const token = resolveToken(net, args.token || die('--token required (budget denomination)'));
      const budget = parseAmount(args.budget ?? die('--budget required'), token.decimals);
      const expiry = parseExpiry(args.expires ?? die('--expires required (e.g. 7d)'));
      if (expiry <= Math.floor(Date.now() / 1000)) die(`--expires resolves to ${new Date(expiry * 1000).toISOString()}, which is not in the future`);
      console.log(`Grant session ${key}: token ${token.address}, budget ${args.budget} (${budget} units), expires ${new Date(expiry * 1000).toISOString()}`);
      await sendTx(ownerContract(), 'grantSession', [key, token.address, budget, expiry], net, 'grantSession');
      break;
    }

    case 'revoke':
      await sendTx(ownerContract(), 'revokeSession', [args.key || die('--key required')], net, 'revokeSession');
      break;

    case 'kill':
      console.log('!! Engaging kill-switch — all spends halt until unkill.');
      await sendTx(ownerContract(), 'setKilled', [true], net, 'setKilled');
      break;

    case 'unkill':
      await sendTx(ownerContract(), 'setKilled', [false], net, 'setKilled');
      break;

    case 'spend': {
      const token = resolveToken(net, args.token || die('--token required'));
      const to = args.to || die('--to 0x.. required');
      const amount = parseAmount(args.amount ?? die('--amount required'), token.decimals);
      const contract = sessionContract();

      console.log(`Pre-flight for spend ${args.amount} ${args.token} -> ${to}:`);
      const pf = await preflight({
        contract, method: 'spendToken', args: [token.address, to, amount],
        destination: to, token: token.address, network: netName, provider,
      });
      console.log(pf.report);
      if (pf.blocked && !args.yes) {
        console.error('\nBLOCKED by pre-flight. Re-run with --yes to override (not recommended).');
        process.exit(1);
      }
      await sendTx(contract, 'spendToken', [token.address, to, amount], net, 'spendToken');
      break;
    }

    case 'status': {
      const c = readContract();
      const owner = await c.owner();
      const killed = await c.killed();
      console.log(`Treasury ${args.treasury} on ${net.name}`);
      console.log(`  owner: ${owner}`);
      console.log(`  killed: ${killed}`);
      if (args.token) {
        const token = resolveToken(net, args.token);
        const cap = await c.dailyCap(token.address);
        const remaining = await c.remainingToday(token.address);
        console.log(`  token ${args.token} (${token.address}):`);
        console.log(`    daily cap: ${formatUnits(cap, token.decimals)}`);
        console.log(`    remaining today: ${formatUnits(remaining, token.decimals)}`);
      }
      if (args.key) {
        const s = await c.sessions(args.key);
        const tokenLabel = Object.entries(net.tokens || {}).find(([, t]) => t.address.toLowerCase() === s.token.toLowerCase())?.[0];
        const decimals = tokenLabel ? net.tokens[tokenLabel].decimals : 18;
        console.log(`  session ${args.key}:`);
        console.log(`    token: ${s.token}${tokenLabel ? ` (${tokenLabel})` : ''}`);
        console.log(`    budgetRemaining: ${formatUnits(s.budgetRemaining, decimals)}`);
        console.log(`    expiry: ${s.expiry} (${new Date(Number(s.expiry) * 1000).toISOString()})  active: ${s.active}`);
      }
      break;
    }

    default:
      console.error(`unknown command "${cmd}". Run with no args for usage.`);
      console.error('commands: address deploy set-policy allow-contract grant-session revoke kill unkill spend status');
      process.exit(2);
  }
}

main().catch((err) => die(err.message));
