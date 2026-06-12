// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// A NON-token contract (so it passes executeCall's CrossTokenCall guard, which only
/// blocks targeting a different *policy token*). Given a prior allowance from the
/// treasury, it pulls a token OUT of the treasury via transferFrom — the indirect
/// drain that only the post-call balance-delta SWEEP can catch (not the guard).
contract DrainRouter {
    function pull(address token, address from, address to, uint256 amount) external {
        IERC20(token).transferFrom(from, to, amount);
    }
}
