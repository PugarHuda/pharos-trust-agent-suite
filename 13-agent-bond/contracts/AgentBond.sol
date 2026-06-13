// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentBond
/// @notice Sybil resistance through skin-in-the-game. ERC-8004's security guidance is explicit that
///         reputation/validation systems should add friction — "require reviewers to hold a minimum
///         stake" / "registration bonds" — so identities are not free to mint. AgentBond is that
///         friction as a reusable primitive: an agent locks native PHRS as a bond, and any consumer
///         (reputation-gate, the bazaar, a mesh) can require `bondOf(agent) >= minBond` before trusting
///         it. To run N reputable identities you must lock N bonds at once, and a withdrawal cooldown
///         means capital can't be instantly recycled across identities — capital + time are the cost.
/// @dev    Admin-free by design: no slashing authority (which would need a trusted admin). The economic
///         deterrent is the locked capital and the unbonding cooldown, not punishment. Active bond drops
///         the moment an unbond is requested, so an exiting agent immediately loses its "skin".
contract AgentBond {
    uint64 public immutable cooldown; // seconds an unbond must wait before it can be claimed

    mapping(address => uint256) public bonded;        // active stake (counts toward bondOf)
    mapping(address => uint256) public pendingUnbond; // requested to exit, maturing
    mapping(address => uint64)  public unbondReadyAt; // when pendingUnbond can be claimed

    uint256 private _lock;

    event Bonded(address indexed agent, uint256 amount, uint256 total);
    event UnbondRequested(address indexed agent, uint256 amount, uint64 readyAt);
    event UnbondClaimed(address indexed agent, uint256 amount);

    error Reentrancy();
    error ZeroValue();
    error InsufficientBond();
    error NothingPending();
    error CooldownNotElapsed();
    error TransferFailed();
    error BelowMinimumBond(uint256 have, uint256 need);

    modifier nonReentrant() {
        if (_lock == 1) revert Reentrancy();
        _lock = 1; _; _lock = 0;
    }

    constructor(uint64 cooldownSeconds) { cooldown = cooldownSeconds; }

    /// @notice Lock additional bond for the caller.
    function bondUp() external payable {
        if (msg.value == 0) revert ZeroValue();
        bonded[msg.sender] += msg.value;
        emit Bonded(msg.sender, msg.value, bonded[msg.sender]);
    }

    /// @notice Begin exiting `amount` of bond. Active bond drops immediately; funds mature after cooldown.
    function requestUnbond(uint256 amount) external {
        if (amount == 0) revert ZeroValue();
        if (bonded[msg.sender] < amount) revert InsufficientBond();
        bonded[msg.sender] -= amount;
        pendingUnbond[msg.sender] += amount;
        unbondReadyAt[msg.sender] = uint64(block.timestamp) + cooldown;
        emit UnbondRequested(msg.sender, amount, unbondReadyAt[msg.sender]);
    }

    /// @notice Claim matured unbonded funds (pull-payment).
    function claimUnbond() external nonReentrant {
        uint256 amount = pendingUnbond[msg.sender];
        if (amount == 0) revert NothingPending();
        if (block.timestamp < unbondReadyAt[msg.sender]) revert CooldownNotElapsed();
        pendingUnbond[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{ value: amount }("");
        if (!ok) revert TransferFailed();
        emit UnbondClaimed(msg.sender, amount);
    }

    // ----- consumer-facing trust checks -----

    function bondOf(address agent) external view returns (uint256) { return bonded[agent]; }

    function meetsBond(address agent, uint256 minBond) external view returns (bool) {
        return bonded[agent] >= minBond;
    }

    /// @notice Revert unless `agent` holds at least `minBond` active stake (composable guard).
    function requireBond(address agent, uint256 minBond) external view {
        uint256 b = bonded[agent];
        if (b < minBond) revert BelowMinimumBond(b, minBond);
    }
}
