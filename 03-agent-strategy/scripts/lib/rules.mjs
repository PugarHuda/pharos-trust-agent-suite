// Rule DSL: compile a natural-language mandate into a validated struct.
// Only the validated struct ever reaches execution — free text never does.

export const KINDS = ['stop-loss', 'dca', 'threshold', 'rebalance'];
export const DEFAULT_SLIPPAGE_BPS = 50;

// Tokens this skill will trade. Anything else is rejected at compile time.
const KNOWN_TOKENS = new Set(['USDC', 'USDT', 'WPHRS', 'WETH', 'WBTC', 'PROS', 'WPROS']);

export class RuleError extends Error {
  constructor(message) { super(message); this.name = 'RuleError'; }
}

// Remove the slippage clause so its percentage isn't mistaken for a drop/band/price.
function stripSlippageClause(text) {
  return text.replace(/,?\s*(?:\d+(?:\.\d+)?\s*%?\s*slippage|slippage\s*(?:of\s*)?\d+(?:\.\d+)?\s*%?|\d+(?:\.\d+)?\s*bps\s*slippage)/ig, '');
}

// First percentage/number-with-percent in the (slippage-stripped) text. Accepts %, "percent", "pct".
function pct(str) {
  const m = String(str).match(/(-?\d+(?:\.\d+)?)\s*(?:%|percent|pct)/i);
  return m ? Number(m[1]) : null;
}

// Parse a number that may use comma grouping (e.g. "4,000.50").
function parseNum(s) {
  return Number(String(s).replace(/,/g, ''));
}

function slippageBpsFrom(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%?\s*slippage/i)
    || text.match(/slippage\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%?/i)
    || text.match(/(\d+(?:\.\d+)?)\s*bps\s*slippage/i);
  if (!m) return DEFAULT_SLIPPAGE_BPS;
  // a "bps slippage" value is already in bps; a "% slippage" value is percent.
  return /bps/i.test(m[0]) ? Math.round(Number(m[1])) : Math.round(Number(m[1]) * 100);
}

// Resolve a DCA interval to seconds. Matches full unit words so "months" is never
// mistaken for "minutes". Returns null for an unrecognized/unsupported interval.
function parseInterval(text) {
  const named = { daily: 86400, hourly: 3600, weekly: 604800, monthly: 2592000 };
  for (const [k, v] of Object.entries(named)) {
    if (new RegExp(`\\b${k}\\b`, 'i').test(text)) return v;
  }
  // longer unit words listed before their prefixes so "minute" wins over "min", etc.
  const m = text.match(/every\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\b/i);
  if (!m) return null;
  const unit = m[2].toLowerCase();
  const base = /^sec/.test(unit) ? 1
    : /^min/.test(unit) ? 60
    : /^h/.test(unit) ? 3600
    : /^day/.test(unit) ? 86400
    : /^week/.test(unit) ? 604800
    : /^month/.test(unit) ? 2592000
    : null;
  return base === null ? null : Number(m[1]) * base;
}

function findToken(text, exclude = []) {
  const up = text.toUpperCase();
  for (const t of KNOWN_TOKENS) {
    if (exclude.includes(t)) continue;
    if (new RegExp(`\\b${t}\\b`).test(up)) return t;
  }
  return null;
}

// Compile a natural-language mandate into a strategy struct. Throws RuleError
// on anything ambiguous or unsafe (unknown token, no slippage path, etc.).
export function compileRule(text) {
  if (!text || typeof text !== 'string') throw new RuleError('empty rule');
  const t = text.trim();
  const lower = t.toLowerCase();
  const slippageBps = slippageBpsFrom(t);

  const stripped = stripSlippageClause(t);

  // stop-loss: "sell WETH if it drops 10%" / "stop-loss WETH -10%" / "drops by 10 percent"
  if (/stop[-\s]?loss|drops?\s+(?:by\s+|of\s+)?-?\d|falls?\s+(?:by\s+)?-?\d/.test(lower)) {
    const asset = findToken(t, ['USDC', 'USDT']) || findToken(t);
    const drop = Math.abs(pct(stripped) ?? NaN); // strip slippage so its % isn't read as the drop
    if (!asset) throw new RuleError('stop-loss: could not identify the asset token');
    if (!Number.isFinite(drop)) throw new RuleError('stop-loss: missing drop percentage');
    return validateRule({ kind: 'stop-loss', asset, quote: 'USDC', dropPct: drop, referencePrice: null, slippageBps });
  }

  // dca: "DCA 1 USDC -> WETH daily" / "dca 5 usdc into weth every 2 weeks"
  if (/\bdca\b|dollar.cost/.test(lower)) {
    const amt = (t.match(/(\d+(?:\.\d+)?)\s*(USDC|USDT)/i) || [])[1];
    const tokenIn = (t.match(/(USDC|USDT)/i) || [])[1]?.toUpperCase();
    const tokenOut = findToken(t, [tokenIn]);
    const interval = parseInterval(t);
    if (!amt || !tokenIn) throw new RuleError('dca: missing amount or input stablecoin');
    if (!tokenOut) throw new RuleError('dca: missing output token');
    if (interval === null) throw new RuleError('dca: unrecognized interval — use daily/hourly/weekly/monthly or "every N seconds/minutes/hours/days/weeks/months"');
    return validateRule({ kind: 'dca', tokenIn, tokenOut, amountIn: Number(amt), intervalSeconds: interval, lastRunAt: null, slippageBps });
  }

  // threshold: "buy WPHRS when PHRS/USD < 0.20" / "sell WETH when ETH/USD > 4,000"
  if (/\bwhen\b|\bif\b.*[<>]|\bbelow\b|\babove\b|[<>]\s*\$?\d/.test(lower)) {
    const side = /\bsell\b/.test(lower) ? 'sell' : 'buy';
    const comparator = /<|below|drops? below|under/.test(lower) ? 'lt' : 'gt';
    const priceM = stripped.match(/\$?\s*([\d,]+(?:\.\d+)?)/); // strip slippage, allow comma grouping
    const asset = findToken(t, ['USDC', 'USDT']) || findToken(t);
    if (!asset) throw new RuleError('threshold: could not identify the asset token');
    if (!priceM) throw new RuleError('threshold: missing trigger price');
    return validateRule({ kind: 'threshold', side, asset, quote: 'USDC', comparator, price: parseNum(priceM[1]), slippageBps });
  }

  // rebalance: "keep PROS/USDC 50/50, rebalance at 5% drift"
  if (/rebalance|50\/50|keep.*\d+\/\d+/.test(lower)) {
    const m = t.match(/(\d+)\s*\/\s*(\d+)/);
    const tokens = (t.toUpperCase().match(/\b(USDC|USDT|WPHRS|WETH|WBTC|PROS|WPROS)\b/g) || []);
    // strip both the ratio (50/50) and the slippage clause before reading the band %
    const band = pct(stripSlippageClause(t).replace(/(\d+)\s*\/\s*(\d+)/, '')) ?? 5;
    if (tokens.length < 2) throw new RuleError('rebalance: need two tokens (e.g. PROS/USDC)');
    return validateRule({
      kind: 'rebalance', tokenA: tokens[0], tokenB: tokens[1],
      targetA: m ? Number(m[1]) : 50, targetB: m ? Number(m[2]) : 50,
      bandPct: Math.abs(band), slippageBps,
    });
  }

  throw new RuleError(`could not classify mandate into a known strategy kind (${KINDS.join(', ')})`);
}

// Validate a struct (whether hand-written or compiled). Returns it on success.
export function validateRule(rule) {
  if (!rule || !KINDS.includes(rule.kind)) throw new RuleError(`unknown kind: ${rule?.kind}`);
  if (!Number.isFinite(rule.slippageBps) || rule.slippageBps <= 0 || rule.slippageBps > 5000) {
    throw new RuleError('slippageBps must be a positive number <= 5000 (50%) — never trade without slippage protection');
  }
  const checkToken = (sym, field) => {
    if (!KNOWN_TOKENS.has(sym)) throw new RuleError(`${field}: unknown token "${sym}"`);
  };
  switch (rule.kind) {
    case 'stop-loss':
      checkToken(rule.asset, 'asset');
      if (!(rule.dropPct > 0 && rule.dropPct < 100)) throw new RuleError('stop-loss: dropPct must be in (0,100)');
      break;
    case 'dca':
      checkToken(rule.tokenIn, 'tokenIn'); checkToken(rule.tokenOut, 'tokenOut');
      if (!(rule.amountIn > 0)) throw new RuleError('dca: amountIn must be > 0');
      if (!(rule.intervalSeconds > 0)) throw new RuleError('dca: intervalSeconds must be > 0');
      break;
    case 'threshold':
      checkToken(rule.asset, 'asset');
      if (!['lt', 'gt'].includes(rule.comparator)) throw new RuleError('threshold: comparator must be lt|gt');
      if (!(rule.price > 0)) throw new RuleError('threshold: price must be > 0');
      break;
    case 'rebalance':
      checkToken(rule.tokenA, 'tokenA'); checkToken(rule.tokenB, 'tokenB');
      // tolerant compare so float targets like 33.33/66.67 aren't rejected by FP error
      if (Math.abs(rule.targetA + rule.targetB - 100) > 0.01) throw new RuleError('rebalance: targets must sum to 100');
      if (!(rule.bandPct > 0)) throw new RuleError('rebalance: bandPct must be > 0');
      break;
  }
  return rule;
}
