// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentEscrow
/// @notice The "hire" primitive of the Pharos agent economy: a client agent locks native PHRS for a
///         job, the provider delivers, and settlement happens by code — release on approval, refund on
///         timeout, or an arbiter's split on dispute. No owner, no admin keys, no upgradability.
/// @dev    Composes with the rest of the suite: the `jobId` is designed to be reused as the `ref` in
///         a2a-mesh `recordPaymentSigned`/`rate`, so a completed escrow mints payment-gated reputation.
///         Security: checks-effects-interactions throughout; all exits are PULL payments (settled
///         balances accrue to `withdrawable` and each party calls `withdraw()`), so there is exactly one
///         external call site, guarded against reentrancy. Anti-rug: delivered work cannot be silently
///         outwaited (only a still-undelivered job can be timeout-refunded).
contract AgentEscrow {
    enum State { None, Funded, Delivered, Released, Refunded, Disputed, Resolved }

    struct Job {
        address client;        // who locked the funds
        address provider;      // who is hired
        address arbiter;       // neutral resolver (0 = disputes disabled)
        uint256 amount;        // locked native PHRS
        uint64  deadline;      // unix seconds; after this an undelivered job can be refunded
        bytes32 termsHash;     // off-chain terms commitment
        bytes32 deliverableHash; // set on markDelivered
        State   state;
    }

    mapping(bytes32 => Job) private _jobs;        // jobId => Job
    mapping(address => uint256) public withdrawable; // pull-payment balances

    uint256 private _lock; // reentrancy guard (1 = entered)

    event JobCreated(bytes32 indexed jobId, address indexed client, address indexed provider, uint256 amount, uint64 deadline, address arbiter, bytes32 termsHash);
    event Delivered(bytes32 indexed jobId, bytes32 deliverableHash);
    event Released(bytes32 indexed jobId, address indexed provider, uint256 amount);
    event Refunded(bytes32 indexed jobId, address indexed client, uint256 amount);
    event Disputed(bytes32 indexed jobId, address indexed by);
    event Resolved(bytes32 indexed jobId, uint256 toProvider, uint256 toClient);
    event Withdrawn(address indexed who, uint256 amount);

    error JobExists();
    error JobUnknown();
    error BadState();
    error NotClient();
    error NotProvider();
    error NotArbiter();
    error NoArbiter();
    error ZeroAmount();
    error ZeroProvider();
    error SelfDeal();
    error BadDeadline();
    error NotYetExpired();
    error SplitTooLarge();
    error NothingToWithdraw();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock == 1) revert Reentrancy();
        _lock = 1;
        _;
        _lock = 0;
    }

    /// @notice Lock `msg.value` for a job. `jobId` is chosen by the client and must be unique; reuse the
    ///         same value as the mesh `ref` to tie reputation to this escrow.
    function createJob(bytes32 jobId, address provider, address arbiter, uint64 deadline, bytes32 termsHash)
        external
        payable
    {
        if (_jobs[jobId].state != State.None) revert JobExists();
        if (msg.value == 0) revert ZeroAmount();
        if (provider == address(0)) revert ZeroProvider();
        if (provider == msg.sender) revert SelfDeal();
        if (deadline <= block.timestamp) revert BadDeadline();

        _jobs[jobId] = Job({
            client: msg.sender,
            provider: provider,
            arbiter: arbiter,
            amount: msg.value,
            deadline: deadline,
            termsHash: termsHash,
            deliverableHash: bytes32(0),
            state: State.Funded
        });
        emit JobCreated(jobId, msg.sender, provider, msg.value, deadline, arbiter, termsHash);
    }

    /// @notice Provider marks the work delivered. After this, the job can no longer be timeout-refunded
    ///         (anti-rug) — the client must release, or either party may dispute.
    function markDelivered(bytes32 jobId, bytes32 deliverableHash) external {
        Job storage j = _load(jobId);
        if (msg.sender != j.provider) revert NotProvider();
        if (j.state != State.Funded) revert BadState();
        j.deliverableHash = deliverableHash;
        j.state = State.Delivered;
        emit Delivered(jobId, deliverableHash);
    }

    /// @notice Client approves payment to the provider (works whether or not delivery was marked).
    function release(bytes32 jobId) external {
        Job storage j = _load(jobId);
        if (msg.sender != j.client) revert NotClient();
        if (j.state != State.Funded && j.state != State.Delivered) revert BadState();
        j.state = State.Released;
        withdrawable[j.provider] += j.amount;
        emit Released(jobId, j.provider, j.amount);
    }

    /// @notice Client reclaims funds if the deadline passed and the provider never delivered.
    function refundTimeout(bytes32 jobId) external {
        Job storage j = _load(jobId);
        if (msg.sender != j.client) revert NotClient();
        if (j.state != State.Funded) revert BadState();          // Delivered work can't be outwaited
        if (block.timestamp < j.deadline) revert NotYetExpired();
        j.state = State.Refunded;
        withdrawable[j.client] += j.amount;
        emit Refunded(jobId, j.client, j.amount);
    }

    /// @notice Either party escalates to the arbiter.
    function dispute(bytes32 jobId) external {
        Job storage j = _load(jobId);
        if (msg.sender != j.client && msg.sender != j.provider) revert NotClient();
        if (j.arbiter == address(0)) revert NoArbiter();
        if (j.state != State.Funded && j.state != State.Delivered) revert BadState();
        j.state = State.Disputed;
        emit Disputed(jobId, msg.sender);
    }

    /// @notice Arbiter splits a disputed job: `toProvider` to the provider, the remainder to the client.
    function resolve(bytes32 jobId, uint256 toProvider) external {
        Job storage j = _load(jobId);
        if (msg.sender != j.arbiter) revert NotArbiter();
        if (j.state != State.Disputed) revert BadState();
        if (toProvider > j.amount) revert SplitTooLarge();
        uint256 toClient = j.amount - toProvider;
        j.state = State.Resolved;
        if (toProvider > 0) withdrawable[j.provider] += toProvider;
        if (toClient > 0) withdrawable[j.client] += toClient;
        emit Resolved(jobId, toProvider, toClient);
    }

    /// @notice Pull settled funds. The only external call in the contract; reentrancy-guarded.
    function withdraw() external nonReentrant {
        uint256 amt = withdrawable[msg.sender];
        if (amt == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;                  // effects before interaction
        (bool ok, ) = payable(msg.sender).call{ value: amt }("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amt);
    }

    function getJob(bytes32 jobId)
        external
        view
        returns (address client, address provider, address arbiter, uint256 amount, uint64 deadline, bytes32 termsHash, bytes32 deliverableHash, State state)
    {
        Job storage j = _jobs[jobId];
        return (j.client, j.provider, j.arbiter, j.amount, j.deadline, j.termsHash, j.deliverableHash, j.state);
    }

    function _load(bytes32 jobId) private view returns (Job storage j) {
        j = _jobs[jobId];
        if (j.state == State.None) revert JobUnknown();
    }
}
