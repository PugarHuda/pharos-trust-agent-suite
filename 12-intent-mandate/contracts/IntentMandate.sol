// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IntentMandate
/// @notice A cryptographic leash for autonomous agents, inspired by Google's AP2 "Intent Mandate". A
///         user funds the contract and signs (off-chain, gasless, EIP-712) an envelope authorizing a
///         specific agent to spend up to `maxAmount` to an allowed recipient before an expiry. The agent
///         can then move the user's funds — but ONLY inside that signed envelope. A jailbroken or
///         hallucinating agent cannot overspend, pay a disallowed recipient, act after expiry, or act
///         after the user revokes: the limits are verified in the contract, not trusted to the prompt.
/// @dev    Complements `agent-treasury` (standing policy) with a per-task, user-signed authorization —
///         the on-chain analogue of AP2's signed Intent Mandate. Pull-payments + reentrancy guard; the
///         user's deposit is custodial only to themselves (withdrawable anytime) and the signer.
contract IntentMandate {
    struct Mandate {
        address user;       // funds owner + signer
        address agent;      // the only address allowed to execute this mandate
        address recipient;  // allowed payee (address(0) = any recipient)
        uint256 maxAmount;  // cumulative spend cap across calls
        uint64  expiry;     // unix seconds
        uint256 nonce;      // user-chosen uniqueness
    }

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant MANDATE_TYPEHASH =
        keccak256("IntentMandate(address user,address agent,address recipient,uint256 maxAmount,uint64 expiry,uint256 nonce)");

    mapping(address => uint256) public balanceOf;   // user => deposited, unspent native
    mapping(bytes32 => uint256) public spent;        // mandate digest => cumulative spent
    mapping(bytes32 => bool)    public revoked;      // mandate digest => revoked by user

    uint256 private _lock;

    event Funded(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event MandateSpent(bytes32 indexed digest, address indexed user, address indexed recipient, uint256 amount, uint256 totalSpent);
    event MandateRevoked(bytes32 indexed digest, address indexed user);

    error Reentrancy();
    error ZeroValue();
    error InsufficientBalance();
    error NotAuthorizedAgent();
    error MandateExpired();
    error MandateIsRevoked();
    error RecipientNotAllowed();
    error ExceedsMandate();
    error BadSignature();
    error NotMandateUser();
    error TransferFailed();

    modifier nonReentrant() {
        if (_lock == 1) revert Reentrancy();
        _lock = 1;
        _;
        _lock = 0;
    }

    constructor() {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes("IntentMandate")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    /// @notice Deposit native funds the caller's mandates can later spend.
    function fund() external payable {
        if (msg.value == 0) revert ZeroValue();
        balanceOf[msg.sender] += msg.value;
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Withdraw your own unspent balance at any time (pull-payment).
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroValue();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        (bool ok, ) = payable(msg.sender).call{ value: amount }("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice The EIP-712 digest of a mandate (what the user signs).
    function digestOf(Mandate calldata m) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            MANDATE_TYPEHASH, m.user, m.agent, m.recipient, m.maxAmount, m.expiry, m.nonce
        ));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    /// @notice The authorized agent spends `amount` of the user's funds to `recipient`, within the
    ///         envelope the user signed. Reverts unless every constraint holds.
    function spendUnderMandate(Mandate calldata m, bytes calldata signature, address recipient, uint256 amount)
        external
        nonReentrant
    {
        if (amount == 0) revert ZeroValue();
        if (msg.sender != m.agent) revert NotAuthorizedAgent();
        if (block.timestamp > m.expiry) revert MandateExpired();
        if (recipient != m.recipient && m.recipient != address(0)) revert RecipientNotAllowed();

        bytes32 digest = digestOf(m);
        if (revoked[digest]) revert MandateIsRevoked();
        if (_recover(digest, signature) != m.user) revert BadSignature();

        uint256 newSpent = spent[digest] + amount;
        if (newSpent > m.maxAmount) revert ExceedsMandate();
        if (balanceOf[m.user] < amount) revert InsufficientBalance();

        // effects before interaction
        spent[digest] = newSpent;
        balanceOf[m.user] -= amount;

        (bool ok, ) = payable(recipient).call{ value: amount }("");
        if (!ok) revert TransferFailed();
        emit MandateSpent(digest, m.user, recipient, amount, newSpent);
    }

    /// @notice The user cancels a mandate (e.g. the task changed). Only the user can revoke their own.
    function revoke(Mandate calldata m) external {
        if (msg.sender != m.user) revert NotMandateUser();
        bytes32 digest = digestOf(m);
        revoked[digest] = true;
        emit MandateRevoked(digest, msg.sender);
    }

    /// @notice Remaining spendable amount on a mandate (ignoring the user's balance).
    function remaining(Mandate calldata m) external view returns (uint256) {
        bytes32 digest = digestOf(m);
        if (revoked[digest] || block.timestamp > m.expiry) return 0;
        uint256 s = spent[digest];
        return s >= m.maxAmount ? 0 : m.maxAmount - s;
    }

    // EIP-2 / EIP-712 signature recovery with malleability guards.
    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
        if (v != 27 && v != 28) revert BadSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }
}
