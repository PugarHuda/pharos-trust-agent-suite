// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentTreasury
/// @notice A minimal smart-account-style treasury that enforces spending policy ON-CHAIN.
///         An owner configures a policy (daily cap per token, token allowlist, destination-contract
///         allowlist, session keys with budgets + expiry). A session key (the agent) may execute
///         calls only within that policy. The owner retains a kill-switch and full control.
///
/// @dev    Designed for Pharos Atlantic Testnet (chainId 688689). This is the policy core; it can be
///         used standalone (owner/session ECDSA auth) or adapted behind an ERC-4337 account by moving
///         auth into validateUserOp. Kept dependency-light for clarity and CertiK-scanner friendliness.
contract AgentTreasury {
    // --- Types ---------------------------------------------------------------

    struct Session {
        uint96  budgetRemaining; // total budget left for this session (in token units, single token model below)
        uint48  expiry;          // unix seconds; 0 = revoked/none
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

    // --- Events --------------------------------------------------------------

    event PolicySet(address indexed token, uint256 dailyCap);
    event ContractAllowed(address indexed target, bool allowed);
    event SessionGranted(address indexed key, uint256 budget, uint48 expiry);
    event SessionRevoked(address indexed key);
    event Spent(address indexed key, address indexed token, address indexed to, uint256 amount);
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
    error CallFailed();

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
        owner = _owner;
    }

    // --- Owner: policy management --------------------------------------------

    /// @notice Allow a token and set its per-day spend cap. Cap of 0 disables the token.
    function setPolicy(address token, uint256 cap) external onlyOwner {
        dailyCap[token] = cap;
        emit PolicySet(token, cap);
    }

    /// @notice Allow or disallow a destination contract the agent may call.
    function setAllowedContract(address target, bool allowed) external onlyOwner {
        allowedContract[target] = allowed;
        emit ContractAllowed(target, allowed);
    }

    /// @notice Grant a session key (the agent) a total budget and an expiry.
    function grantSession(address key, uint96 budget, uint48 expiry) external onlyOwner {
        sessions[key] = Session({budgetRemaining: budget, expiry: expiry, active: true});
        emit SessionGranted(key, budget, expiry);
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
        owner = newOwner;
        emit OwnerTransferred(newOwner);
    }

    // --- Agent: policy-bounded execution -------------------------------------

    /// @notice Execute an ERC-20 token transfer within policy, called by an active session key.
    /// @dev    `token` must be allow-listed (dailyCap > 0), `to` (the destination contract) must be
    ///         allow-listed, the amount must fit today's remaining cap and the session budget.
    function spendToken(address token, address to, uint256 amount)
        external
        notKilled
    {
        Session storage s = sessions[msg.sender];
        if (!s.active) revert NotSession();
        if (block.timestamp > s.expiry) revert SessionExpired();
        if (amount > s.budgetRemaining) revert SessionBudgetExceeded();

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

    /// @notice Execute an arbitrary call to an allow-listed contract, with a token-denominated
    ///         spend accounted against policy (e.g. an approve+swap or an x402 settlement).
    function executeCall(
        address token,
        address target,
        uint256 spendAmount,
        bytes calldata data
    ) external notKilled returns (bytes memory) {
        Session storage s = sessions[msg.sender];
        if (!s.active) revert NotSession();
        if (block.timestamp > s.expiry) revert SessionExpired();
        if (spendAmount > s.budgetRemaining) revert SessionBudgetExceeded();

        uint256 cap = dailyCap[token];
        if (cap == 0) revert TokenNotAllowed();
        if (!allowedContract[target]) revert ContractNotAllowed();

        _accrueDaily(token, spendAmount, cap);
        s.budgetRemaining -= uint96(spendAmount);

        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) revert CallFailed();

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

    /// @notice Owner can withdraw any token from the treasury at will.
    function ownerWithdraw(address token, address to, uint256 amount) external onlyOwner {
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert CallFailed();
    }

    receive() external payable {}
}
