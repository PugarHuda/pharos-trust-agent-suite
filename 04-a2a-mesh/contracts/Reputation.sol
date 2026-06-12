// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Reputation
/// @notice Payment-gated reputation for the a2a-mesh skill. A rating is only accepted from the address
///         that actually paid for the interaction, making reputation expensive to fake.
/// @dev    Two ways to record a settled payment:
///         - `recordPaymentSigned` (trustless, preferred): the PAYER signs an EIP-712 authorization
///           off-chain; anyone may relay it. The contract recovers the signer and uses it as the payer,
///           so a relayer/recorder CANNOT fabricate payments between addresses it doesn't control.
///         - `recordPayment` (onlyRecorder): a convenience path for a trusted settlement relayer.
///         `rate` can then be called once by that payer. Pharos testnet (688689).
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

    // --- EIP-712 (payer-signed payment authorization) -----------------------
    bytes32 private immutable _DOMAIN_SEPARATOR;
    bytes32 private constant PAYMENT_AUTH_TYPEHASH =
        keccak256("PaymentAuth(bytes32 ref,address provider,uint256 amount)");

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
    error BadSignature();

    constructor(address _recorder) {
        recorder = _recorder;
        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("AnvitaMeshReputation")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _DOMAIN_SEPARATOR;
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

    /// @notice Record a settled payment authorized by the PAYER's EIP-712 signature. Callable by
    ///         anyone (a relayer/facilitator), because the signature — not the caller — is the
    ///         authorization. This is the trustless path: a relayer cannot fabricate a payment for a
    ///         payer whose key it does not hold.
    /// @dev    `ref` is the anti-replay key (one record per ref) and the EIP-712 domain binds this
    ///         contract + chainId, so a signature can't be replayed on another deployment/chain.
    ///         A third party could front-run a known `ref` to block it (AlreadyRecorded) — a liveness
    ///         grief, not a forgery (they still can't rate as someone else). Use the settlement tx
    ///         hash as `ref` and relay promptly.
    function recordPaymentSigned(bytes32 ref, address provider, uint256 amount, bytes calldata signature) external {
        if (provider == address(0)) revert ZeroAddress();
        if (payments[ref].payer != address(0)) revert AlreadyRecorded();

        bytes32 structHash = keccak256(abi.encode(PAYMENT_AUTH_TYPEHASH, ref, provider, amount));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _DOMAIN_SEPARATOR, structHash));
        address payer = _recover(digest, signature);
        if (payer == address(0)) revert BadSignature();
        if (payer == provider) revert SelfDeal();

        payments[ref] = Payment({payer: payer, provider: provider, amount: amount, rated: false});
        volume[provider] += amount;
        emit PaymentRecorded(ref, payer, provider, amount);
    }

    /// @dev Recover the signer of a 65-byte ECDSA signature, rejecting malleable high-s values.
    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        // EIP-2: reject the upper half of the curve order (signature malleability).
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
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
