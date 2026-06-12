// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentTreasury
/// @notice A minimal smart-account-style treasury that enforces spending policy ON-CHAIN.
///         An owner configures a policy (daily cap per token, token/contract allowlist, session keys
///         bound to a single token with a budget + expiry, kill-switch). A session key (the agent)
///         may execute calls only within that policy. The owner retains a kill-switch and full control.
///
/// @dev    Designed for Pharos Atlantic Testnet (chainId 688689). This is the policy core; it can be
///         used standalone (owner/session ECDSA auth) or adapted behind an ERC-4337 account by moving
///         auth into validateUserOp. Kept dependency-light for clarity and CertiK-scanner friendliness.
contract AgentTreasury {
    // --- Types ---------------------------------------------------------------

    struct Session {
        address token;           // the single token this session may spend (0 = no session)
        uint96  budgetRemaining; // total budget left for this session, in `token` units
        uint48  expiry;          // unix seconds; spends allowed while block.timestamp <= expiry
        bool    active;
    }

    struct DaySpend {
        uint32 day;     // block.timestamp / 1 days
        uint224 spent;  // amount spent today for a given token
    }

    // --- Storage -------------------------------------------------------------

    address public owner;
    bool    public killed;

    // token => daily cap (0 = token not allowed)
    mapping(address => uint256) public dailyCap;
    // token => rolling day accounting
    mapping(address => DaySpend) private _day;
    // destination contract => allowed
    mapping(address => bool) public allowedContract;
    // session key (agent address) => session
    mapping(address => Session) public sessions;

    // Enumerable set of tokens that have ever had a policy, so executeCall can sweep
    // every treasury asset's balance delta — not just the session's bound token.
    address[] public policyTokens;
    mapping(address => bool) private _isPolicyToken;

    // --- Events --------------------------------------------------------------

    event PolicySet(address indexed token, uint256 dailyCap);
    event ContractAllowed(address indexed target, bool allowed);
    event SessionGranted(address indexed key, address indexed token, uint256 budget, uint48 expiry);
    event SessionRevoked(address indexed key);
    event Spent(address indexed key, address indexed token, address indexed to, uint256 amount);
    event OwnerWithdrew(address indexed token, address indexed to, uint256 amount);
    event NativeWithdrew(address indexed to, uint256 amount);
    event Killed(bool killed);
    event OwnerTransferred(address indexed newOwner);

    // --- Errors --------------------------------------------------------------

    error NotOwner();
    error NotSession();
    error Killed_();
    error TokenNotAllowed();
    error ContractNotAllowed();
    error DailyCapExceeded();
    error SessionExpired();
    error SessionBudgetExceeded();
    error SessionTokenMismatch();
    error SpendExceedsAccounted();
    error CrossTokenCall();
    error CallFailed();
    error ZeroAddress();
    error BadExpiry();

    // --- Modifiers -----------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier notKilled() {
        if (killed) revert Killed_();
        _;
    }

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
    }

    // --- Owner: policy management --------------------------------------------

    /// @notice Allow a token and set its per-day spend cap. Cap of 0 disables the token.
    function setPolicy(address token, uint256 cap) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        dailyCap[token] = cap;
        if (cap > 0 && !_isPolicyToken[token]) {
            _isPolicyToken[token] = true;
            policyTokens.push(token);
        }
        emit PolicySet(token, cap);
    }

    /// @notice Allow or disallow a destination contract the agent may call.
    function setAllowedContract(address target, bool allowed) external onlyOwner {
        if (target == address(0)) revert ZeroAddress();
        allowedContract[target] = allowed;
        emit ContractAllowed(target, allowed);
    }

    /// @notice Grant a session key (the agent) a budget in a single token, with an expiry.
    /// @dev    Binding the session to one token means a 5-USDC budget cannot be spent as 5 of some
    ///         other allow-listed token.
    function grantSession(address key, address token, uint96 budget, uint48 expiry) external onlyOwner {
        if (key == address(0) || token == address(0)) revert ZeroAddress();
        if (expiry <= block.timestamp) revert BadExpiry();
        sessions[key] = Session({token: token, budgetRemaining: budget, expiry: expiry, active: true});
        emit SessionGranted(key, token, budget, expiry);
    }

    /// @notice Revoke a session key immediately.
    function revokeSession(address key) external onlyOwner {
        sessions[key].active = false;
        sessions[key].budgetRemaining = 0;
        emit SessionRevoked(key);
    }

    /// @notice Emergency stop. Halts all spends until un-killed.
    function setKilled(bool _killed) external onlyOwner {
        killed = _killed;
        emit Killed(_killed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerTransferred(newOwner);
    }

    // --- Agent: policy-bounded execution -------------------------------------

    /// @notice Execute an ERC-20 token transfer within policy, called by an active session key.
    /// @dev    `token` must match the session's bound token and be allow-listed (dailyCap > 0), `to`
    ///         (the destination contract) must be allow-listed, the amount must fit today's remaining
    ///         cap and the session budget.
    function spendToken(address token, address to, uint256 amount)
        external
        notKilled
    {
        Session storage s = _checkSession(token, amount);
        uint256 cap = dailyCap[token];
        if (cap == 0) revert TokenNotAllowed();
        if (!allowedContract[to]) revert ContractNotAllowed();

        _accrueDaily(token, amount, cap);
        s.budgetRemaining -= uint96(amount);

        // Effects done; now interact. ERC-20 transfer from this treasury to the destination.
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer(address,uint256)
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert CallFailed();

        emit Spent(msg.sender, token, to, amount);
    }

    /// @notice Execute an arbitrary call to an allow-listed contract, with a token-denominated spend
    ///         accounted against policy (e.g. an approve+swap or an x402 settlement).
    /// @dev    Two guards make the budget a REAL cross-asset bound, not just for the bound token:
    ///         (1) the call may not target a DIFFERENT policy token (so it can't `transfer` another
    ///         treasury asset directly); (2) after the call, EVERY policy token's balance delta is
    ///         checked — the bound `token` may drop by at most `spendAmount`, and no other policy
    ///         token may drop at all. Approvals move 0 balance and pass; only allow-list routers you
    ///         trust, since an approval still lets an allow-listed spender pull later.
    function executeCall(
        address token,
        address target,
        uint256 spendAmount,
        bytes calldata data
    ) external notKilled returns (bytes memory) {
        Session storage s = _checkSession(token, spendAmount);
        uint256 cap = dailyCap[token];
        if (cap == 0) revert TokenNotAllowed();
        if (!allowedContract[target]) revert ContractNotAllowed();
        // (1) can't act directly on a different policy token (cross-token drain via its transfer()).
        if (_isPolicyToken[target] && target != token) revert CrossTokenCall();

        _accrueDaily(token, spendAmount, cap);
        s.budgetRemaining -= uint96(spendAmount);

        // (2) snapshot every policy token, run the call, then bound each delta.
        uint256 n = policyTokens.length;
        uint256[] memory balBefore = new uint256[](n);
        for (uint256 i; i < n; ++i) balBefore[i] = _balanceOf(policyTokens[i]);

        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) revert CallFailed();

        for (uint256 i; i < n; ++i) {
            uint256 balAfter = _balanceOf(policyTokens[i]);
            if (balBefore[i] > balAfter) {
                uint256 decrease = balBefore[i] - balAfter;
                uint256 allowed = policyTokens[i] == token ? spendAmount : 0;
                if (decrease > allowed) revert SpendExceedsAccounted();
            }
        }

        emit Spent(msg.sender, token, target, spendAmount);
        return ret;
    }

    // --- Views ---------------------------------------------------------------

    /// @notice Remaining spend allowed for `token` today.
    function remainingToday(address token) external view returns (uint256) {
        uint256 cap = dailyCap[token];
        DaySpend memory d = _day[token];
        uint32 today = uint32(block.timestamp / 1 days);
        if (d.day != today) return cap;
        return cap > d.spent ? cap - d.spent : 0;
    }

    // --- Internal ------------------------------------------------------------

    /// @dev Shared session validation for spendToken/executeCall.
    function _checkSession(address token, uint256 amount) internal view returns (Session storage s) {
        s = sessions[msg.sender];
        if (!s.active) revert NotSession();
        if (block.timestamp > s.expiry) revert SessionExpired();
        if (token != s.token) revert SessionTokenMismatch();
        if (amount > s.budgetRemaining) revert SessionBudgetExceeded();
    }

    function _accrueDaily(address token, uint256 amount, uint256 cap) internal {
        uint32 today = uint32(block.timestamp / 1 days);
        DaySpend storage d = _day[token];
        if (d.day != today) {
            d.day = today;
            d.spent = 0;
        }
        uint256 newSpent = uint256(d.spent) + amount;
        if (newSpent > cap) revert DailyCapExceeded();
        d.spent = uint224(newSpent);
    }

    function _balanceOf(address token) internal view returns (uint256) {
        (bool ok, bytes memory ret) =
            token.staticcall(abi.encodeWithSelector(0x70a08231, address(this))); // balanceOf(address)
        if (!ok || ret.length < 32) revert CallFailed();
        return abi.decode(ret, (uint256));
    }

    /// @notice Owner can withdraw any ERC-20 from the treasury at will.
    function ownerWithdraw(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert CallFailed();
        emit OwnerWithdrew(token, to, amount);
    }

    /// @notice Owner can withdraw native PHRS (e.g. gas top-ups sent to the treasury).
    function ownerWithdrawNative(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert CallFailed();
        emit NativeWithdrew(to, amount);
    }

    receive() external payable {}
}
