// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Reputation
/// @notice Payment-gated reputation for the a2a-mesh skill. A rating is only accepted from the address
///         that actually paid for the interaction, making reputation expensive to fake.
/// @dev    `recordPayment` is called by the trusted recorder (the mesh settlement flow) when an x402
///         payment settles; `rate` can then be called once by that payer. Pharos testnet (688689).
contract Reputation {
    struct Payment {
        address payer;
        address provider;
        uint256 amount;
        bool    rated;
    }

    address public recorder; // address allowed to record settled payments (mesh settlement relayer / facilitator)

    // interactionRef (e.g. settlement tx hash) => payment
    mapping(bytes32 => Payment) public payments;

    // provider => aggregate reputation inputs
    mapping(address => uint256) public ratingCount;
    mapping(address => uint256) public ratingSum;     // sum of scores (1..5)
    mapping(address => uint256) public volume;        // total paid volume to provider
    mapping(address => uint256) public lastRatedAt;   // recency

    // per-counterparty cap to limit collusion: payer => provider => times counted
    mapping(address => mapping(address => uint256)) public pairCount;
    uint256 public constant PAIR_CAP = 10;

    event PaymentRecorded(bytes32 indexed ref, address indexed payer, address indexed provider, uint256 amount);
    event Rated(bytes32 indexed ref, address indexed provider, uint8 score);

    error NotRecorder();
    error UnknownInteraction();
    error NotPayer();
    error AlreadyRated();
    error AlreadyRecorded();
    error SelfDeal();
    error PairCapReached();
    error ZeroAddress();
    error BadScore();

    constructor(address _recorder) {
        recorder = _recorder;
    }

    modifier onlyRecorder() {
        if (msg.sender != recorder) revert NotRecorder();
        _;
    }

    /// @notice Record a settled payment so its payer may later rate it.
    /// @dev    Guards make reputation expensive to fake: a ref can be recorded only once (no
    ///         re-record to reset the once-only rating), payer and provider must be distinct
    ///         (no self-dealing), and neither may be the zero address (which is the "unset"
    ///         sentinel and would make a payment permanently unrateable).
    function recordPayment(bytes32 ref, address payer, address provider, uint256 amount) external onlyRecorder {
        if (payer == address(0) || provider == address(0)) revert ZeroAddress();
        if (payer == provider) revert SelfDeal();
        if (payments[ref].payer != address(0)) revert AlreadyRecorded();
        payments[ref] = Payment({payer: payer, provider: provider, amount: amount, rated: false});
        volume[provider] += amount;
        emit PaymentRecorded(ref, payer, provider, amount);
    }

    /// @notice Rate a paid interaction. Only the payer can call, once per interaction.
    /// @dev    Reverts once a payer→provider pair reaches PAIR_CAP counted ratings, so a single
    ///         counterparty can't dominate a score and every emitted Rated event is one that
    ///         actually counted (no silent no-ops, no indexer over-count).
    function rate(bytes32 ref, uint8 score) external {
        if (score < 1 || score > 5) revert BadScore();
        Payment storage p = payments[ref];
        if (p.payer == address(0)) revert UnknownInteraction();
        if (msg.sender != p.payer) revert NotPayer();
        if (p.rated) revert AlreadyRated();
        if (pairCount[p.payer][p.provider] >= PAIR_CAP) revert PairCapReached();
        p.rated = true;

        pairCount[p.payer][p.provider] += 1;
        ratingCount[p.provider] += 1;
        ratingSum[p.provider] += score;
        lastRatedAt[p.provider] = block.timestamp;
        emit Rated(ref, p.provider, score);
    }

    /// @notice A simple 0-100 reputation: average score scaled, weighted by interaction count (capped).
    function scoreOf(address provider) external view returns (uint256) {
        uint256 c = ratingCount[provider];
        if (c == 0) return 0;
        uint256 avg = (ratingSum[provider] * 20) / c;          // 1..5 -> 20..100
        uint256 confidence = c >= 20 ? 100 : (c * 100) / 20;   // ramps with sample size
        return (avg * confidence) / 100;
    }
}
