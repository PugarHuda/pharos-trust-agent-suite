import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JsonRpcProvider } from 'ethers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadModel() {
  return JSON.parse(readFileSync(join(ROOT, 'assets', 'model.json'), 'utf8'));
}
export function loadNetworks() {
  return JSON.parse(readFileSync(join(ROOT, 'assets', 'networks.json'), 'utf8'));
}
export function getProvider(net) {
  return new JsonRpcProvider(net.rpcUrl, net.chainId, { staticNetwork: true });
}
