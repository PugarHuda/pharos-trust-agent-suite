#!/usr/bin/env node
// agent-validation CLI — the ERC-8004 Validation Registry: a validator agent posts an
// independent 0-100 verification score for another agent's work, referenced by a dataHash.
// Completes the ERC-8004 trio (Identity + Reputation + Validation) for the suite.
//
//   validate deploy        --identity 0x..                                  ($SERVER_PRIVATE_KEY)
//   validate register      --identity 0x.. --uri https://card.json          (mints an agentId)
//   validate request       --validation 0x.. --validator <id> --server <id> --data <hash|label>
//                                                                            ($SERVER_PRIVATE_KEY)
//   validate respond       --validation 0x.. --data <hash> --response 95     ($VALIDATOR_PRIVATE_KEY)
//   validate get           --validation 0x.. --data <hash>                   (read-only)
//
// The `dataHash` is any 32-byte ref — reuse an escrow jobId or x402 settlement hash to validate that
// exact piece of work. Keys come from a gitignored .env: $SERVER_PRIVATE_KEY (default, requester),
// $VALIDATOR_PRIVATE_KEY (responder). Global: --network atlantic-testnet.

import { Contract } from 'ethers';
import {
  loadNetworks, loadArtifact, pickNetwork, getProvider, getSigner,
  toRef, withGasBuffer, explorerTx,
} from './lib/config.mjs';

const IDENTITY_ABI = [
  'function register(string agentURI) returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function nextAgentId() view returns (uint256)',
];

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else a._.push(k);
  }
  return a;
}
function die(m) { console.error(`error: ${m}`); process.exit(2); }

async function sendTx(contract, method, args, net, label) {
  let gas;
  try { gas = await contract[method].estimateGas(...args); }
  catch (e) { throw new Error(`${label} would revert: ${e.revert?.name || e.shortMessage || e.message}`); }
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
  const provider = getProvider(net);
  const VR = loadArtifact('ValidationRegistry8004');
  const identityAddr = args.identity || net.deployed?.identityRegistry;

  switch (cmd) {
    case 'deploy': {
      if (!identityAddr) die('--identity 0x.. required (the ERC-8004 Identity Registry)');
      const signer = getSigner('SERVER_PRIVATE_KEY', provider);
      const { ContractFactory } = await import('ethers');
      const f = new ContractFactory(VR.abi, VR.bytecode, signer);
      const c = await f.deploy(identityAddr);
      console.log(`deploying ValidationRegistry8004 (identity=${identityAddr})… ${c.deploymentTransaction().hash}`);
      await c.waitForDeployment();
      const addr = await c.getAddress();
      console.log(`ValidationRegistry8004 deployed: ${addr}`);
      console.log(`  ${net.explorer}/address/${addr}`);
      break;
    }

    case 'register': {
      if (!identityAddr) die('--identity 0x.. required');
      const role = args.as === 'validator' ? 'VALIDATOR_PRIVATE_KEY' : 'SERVER_PRIVATE_KEY';
      const signer = getSigner(role, provider);
      const c = new Contract(identityAddr, IDENTITY_ABI, signer);
      const next = await c.nextAgentId();
      await sendTx(c, 'register', [args.uri || `https://agent.example/${args.as || 'server'}.json`], net, 'register');
      console.log(`  registered agentId ${next} → owner ${signer.address}`);
      break;
    }

    case 'request': {
      const signer = getSigner('SERVER_PRIVATE_KEY', provider);
      const c = new Contract(args.validation || die('--validation 0x.. required'), VR.abi, signer);
      const data = toRef(args.data || die('--data <hash|label> required'));
      await sendTx(c, 'validationRequest',
        [args.validator || die('--validator <id> required'), args.server || die('--server <id> required'), data],
        net, 'validationRequest');
      console.log(`  validator #${args.validator} asked to verify server #${args.server} for ${data}`);
      break;
    }

    case 'respond': {
      const signer = getSigner('VALIDATOR_PRIVATE_KEY', provider);
      const c = new Contract(args.validation || die('--validation 0x.. required'), VR.abi, signer);
      const data = toRef(args.data || die('--data required'));
      const response = Number(args.response ?? die('--response 0..100 required'));
      await sendTx(c, 'validationResponse', [data, response], net, 'validationResponse');
      console.log(`  validator posted score ${response}/100 for ${data}`);
      break;
    }

    case 'get': {
      const c = new Contract(args.validation || die('--validation 0x.. required'), VR.abi, provider);
      const data = toRef(args.data || die('--data required'));
      const v = await c.getValidation(data);
      console.log(`Validation ${data}`);
      console.log(`  validatorAgentId: ${v[0]}`);
      console.log(`  serverAgentId:    ${v[1]}`);
      console.log(`  response:         ${v[4] ? `${v[2]}/100` : '(pending)'}`);
      console.log(`  requested:        ${v[3]}`);
      console.log(`  responded:        ${v[4]}`);
      break;
    }

    default:
      console.error('commands: deploy register request respond get');
      process.exit(2);
  }
}

main().catch((e) => die(e.message));
