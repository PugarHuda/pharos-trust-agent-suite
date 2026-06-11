// Swap builder: quote out-amount, apply slippage, and encode router calldata
// wrapped as a treasury.executeCall so the trade inherits the spending policy.

import { Interface } from 'ethers';

const ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
];
const ERC20_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];
const TREASURY_ABI = ['function executeCall(address token, address target, uint256 spendAmount, bytes data) returns (bytes)'];

export const routerIface = new Interface(ROUTER_ABI);
export const erc20Iface = new Interface(ERC20_ABI);
export const treasuryIface = new Interface(TREASURY_ABI);

// minAmountOut = quote * (10000 - slippageBps) / 10000, all in token base units.
export function applySlippage(quoteOut, slippageBps) {
  const q = BigInt(quoteOut);
  return (q * BigInt(10000 - slippageBps)) / 10000n;
}

// Build the router swap calldata (v2-style).
export function buildSwapCalldata({ amountIn, minAmountOut, path, to, deadline }) {
  return routerIface.encodeFunctionData('swapExactTokensForTokens', [
    BigInt(amountIn), BigInt(minAmountOut), path, to, BigInt(deadline),
  ]);
}

// Wrap any router call as treasury.executeCall(tokenIn, router, amountIn, swapData).
export function wrapAsTreasuryCall({ tokenIn, router, amountIn, swapData }) {
  return treasuryIface.encodeFunctionData('executeCall', [tokenIn, router, BigInt(amountIn), swapData]);
}

// Exact-amount approval calldata (never unlimited) — also routed via executeCall.
export function buildApproveCalldata(router, amount) {
  return erc20Iface.encodeFunctionData('approve', [router, BigInt(amount)]);
}

// Full plan from a decision: returns the two calldatas an agent would submit
// through the treasury (approve once, then swap).
export function buildSwapPlan({ tokenIn, tokenOut, router, amountIn, quoteOut, slippageBps, recipient, deadline }) {
  const minAmountOut = applySlippage(quoteOut, slippageBps);
  const swapData = buildSwapCalldata({ amountIn, minAmountOut, path: [tokenIn, tokenOut], to: recipient, deadline });
  return {
    minAmountOut,
    approve: {
      via: 'treasury.executeCall',
      token: tokenIn, target: tokenIn, spendAmount: 0n,
      data: wrapAsTreasuryCall({ tokenIn, router: tokenIn, amountIn: 0n, swapData: buildApproveCalldata(router, amountIn) }),
    },
    swap: {
      via: 'treasury.executeCall',
      token: tokenIn, target: router, spendAmount: amountIn,
      data: wrapAsTreasuryCall({ tokenIn, router, amountIn, swapData }),
    },
    router, path: [tokenIn, tokenOut],
  };
}
