// A paid x402 RESOURCE: a risk-scoring API. This monetizes the trust layer — the
// #1 x402 use case is "risk-scoring API access". A request with no payment gets HTTP
// 402 + PaymentRequired; a request carrying a valid x402 payment gets the score.
//
// The scorer is the same fixed-point logistic as stylus-compute (bit-identical),
// inlined so this resource server is self-contained.

import { verifyPayment } from './scheme.mjs';

const SCALE = 1_000_000n;
const WEIGHTS = [1_500_000n, 2_000_000n, 1_200_000n, 800_000n];
const BIAS = -2_000_000n;

function fastSigmoid(z) {
  const az = z < 0n ? -z : z;
  const frac = (z * SCALE) / (SCALE + az);
  return SCALE / 2n + frac / 2n;
}

// features: 4 human numbers in ~[0,1] -> risk in [0,1].
export function riskScore(features) {
  if (!Array.isArray(features) || features.length !== WEIGHTS.length) {
    throw new Error(`expected ${WEIGHTS.length} features`);
  }
  const fx = features.map((h) => {
    const m = String(h).trim().match(/^(-?)(\d*)(?:\.(\d+))?$/);
    if (!m || (m[2] === '' && (m[3] ?? '') === '')) throw new Error(`bad feature: ${h}`);
    const frac = (m[3] ?? '').padEnd(6, '0').slice(0, 6);
    const v = BigInt((m[2] || '0') + frac);
    return m[1] === '-' ? -v : v;
  });
  let dot = 0n;
  for (let i = 0; i < fx.length; i++) dot += (WEIGHTS[i] * fx[i]) / SCALE;
  const raw = fastSigmoid(dot + BIAS);
  return { risk: Number(raw) / 1e6, raw };
}

// The x402 PaymentRequirements this resource advertises.
export function riskRequirements({ chainId, asset, payTo, price = '1000' }) {
  return {
    scheme: 'exact-evm',
    network: `eip155:${chainId}`,
    maxAmountRequired: String(price), // 0.001 USDC (6 decimals)
    asset,
    payTo,
    resource: '/risk',
    description: 'Agent-action risk score (0..1) from an on-chain-verifiable model',
  };
}

// Pure request handler (no socket) so it's fully unit-testable.
//   req: { headers: {'x-payment'?: base64}, features: string[] }
//   ctx: { requirements, domain, now? }
// returns { status, headers?, body }
export function handleRiskRequest(req, ctx) {
  const { requirements, domain, now } = ctx;
  const xpayment = req.headers?.['x-payment'];
  if (!xpayment) {
    // 402: tell the client how to pay (base64 PaymentRequired, per x402).
    return {
      status: 402,
      headers: { 'x-payment-required': Buffer.from(JSON.stringify({ x402Version: 1, accepts: [requirements] })).toString('base64') },
      body: { error: 'payment required', accepts: [requirements] },
    };
  }
  let payment;
  try { payment = JSON.parse(Buffer.from(xpayment, 'base64').toString('utf8')); }
  catch { return { status: 400, body: { error: 'malformed X-PAYMENT header' } }; }

  const v = verifyPayment(payment, requirements, domain, { now });
  if (!v.isValid) return { status: 402, body: { error: `invalid payment: ${v.reason}` } };

  // Paid + valid -> deliver the resource. (A production facilitator would also settle on-chain;
  // here verify gates access and settlement is done by the /settle endpoint.)
  let scored;
  try { scored = riskScore(req.features); }
  catch (e) { return { status: 400, body: { error: e.message } }; }
  return {
    status: 200,
    headers: { 'payment-response': Buffer.from(JSON.stringify({ payer: v.payer })).toString('base64') },
    body: { risk: scored.risk, raw: scored.raw.toString(), payer: v.payer },
  };
}
