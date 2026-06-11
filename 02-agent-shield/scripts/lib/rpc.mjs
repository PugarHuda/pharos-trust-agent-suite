// Minimal JSON-RPC client over global fetch. Read-only by construction:
// only whitelisted eth_* read methods can be sent, so this module is
// physically incapable of broadcasting a transaction.

const READ_METHODS = new Set([
  'eth_chainId',
  'eth_call',
  'eth_getBalance',
  'eth_getCode',
  'eth_getTransactionCount',
  'eth_estimateGas',
  'eth_blockNumber',
]);

export class RpcError extends Error {
  constructor(message, { code, data } = {}) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

export function createRpcClient(rpcUrl, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  let nextId = 1;

  async function request(method, params = []) {
    if (!READ_METHODS.has(method)) {
      throw new RpcError(`method ${method} is not in the read-only allowlist`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
        signal: controller.signal,
      });
      if (!res.ok) throw new RpcError(`RPC HTTP ${res.status}`);
      let body;
      try {
        body = await res.json();
      } catch {
        // An HTML error page / proxy response with HTTP 200 must NOT be reported as a
        // transaction revert — surface it as a distinct transport error.
        throw new RpcError('non-JSON response from RPC (transport/proxy error, not a revert)');
      }
      if (body.error) {
        throw new RpcError(body.error.message || 'RPC error', {
          code: body.error.code,
          data: body.error.data,
        });
      }
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    request,
    chainId: async () => Number(await request('eth_chainId')),
    getCode: (address) => request('eth_getCode', [address, 'latest']),
    getBalance: (address) => request('eth_getBalance', [address, 'latest']),
    call: (tx) => request('eth_call', [tx, 'latest']),
  };
}

// Common Solidity Panic(uint256) codes (0x4e487b71).
const PANIC_CODES = {
  '0x01': 'assert(false)',
  '0x11': 'arithmetic overflow/underflow',
  '0x12': 'division or modulo by zero',
  '0x21': 'invalid enum value',
  '0x31': 'pop on empty array',
  '0x32': 'array index out of bounds',
  '0x41': 'out of memory',
  '0x51': 'call to an invalid/uninitialized function',
};

// Decode a Solidity revert payload — Error(string) or Panic(uint256) — into readable text.
export function decodeRevertReason(data) {
  if (typeof data !== 'string') return null;
  if (data.startsWith('0x08c379a0')) {
    try {
      const hex = data.slice(10); // strip selector
      const len = parseInt(hex.slice(64, 128), 16);
      const strHex = hex.slice(128, 128 + len * 2);
      return Buffer.from(strHex, 'hex').toString('utf8');
    } catch {
      return null;
    }
  }
  if (data.startsWith('0x4e487b71')) {
    const code = '0x' + parseInt(data.slice(10), 16).toString(16).padStart(2, '0');
    return `Panic(${code}): ${PANIC_CODES[code] || 'unknown panic'}`;
  }
  return null;
}
