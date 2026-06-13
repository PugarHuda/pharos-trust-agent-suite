// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IdentityRegistry8004
/// @notice A minimal ERC-8004 Identity Registry for Pharos: each agent is an ERC-721 `agentId` whose
///         `agentURI` (tokenURI) resolves to an agent card (name, endpoints, payment address). Pairs
///         with `Reputation`/`Reputation8004Adapter` (the Reputation Registry) and `stylus-compute`
///         (a Validation Registry validator) to form the ERC-8004 trio. See references/erc-8004.md.
/// @dev    Implements the core registration + metadata + agentWallet surface and a minimal ERC-721
///         read surface (ownerOf/balanceOf/tokenURI). Full transferability and signature-gated
///         setAgentWallet are the production spec; kept lean and dependency-free here.
contract IdentityRegistry8004 {
    string public constant name = "Pharos Trustless Agents";
    string public constant symbol = "AGENT";

    uint256 public nextAgentId = 1;
    mapping(uint256 => address) public ownerOf;          // agentId => owner
    mapping(address => uint256) public balanceOf;        // owner => count
    mapping(uint256 => string) private _agentURI;        // agentId => agent card URI
    mapping(uint256 => address) private _agentWallet;     // agentId => payment address (x402 settles here)
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    error NotAgentOwner();
    error UnknownAgent();
    error ZeroAddress();

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId); // ERC-721 mint
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(uint256 indexed agentId, string indexed indexedKey, string key, bytes value);
    event AgentWalletSet(uint256 indexed agentId, address indexed wallet);

    modifier onlyAgentOwner(uint256 agentId) {
        if (ownerOf[agentId] != msg.sender) revert NotAgentOwner();
        _;
    }

    /// @notice Register a new agent; mints `agentId` to the caller and sets its card URI.
    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        ownerOf[agentId] = msg.sender;
        balanceOf[msg.sender] += 1;
        _agentURI[agentId] = agentURI;
        emit Transfer(address(0), msg.sender, agentId);
        emit Registered(agentId, agentURI, msg.sender);
    }

    function tokenURI(uint256 agentId) external view returns (string memory) {
        if (ownerOf[agentId] == address(0)) revert UnknownAgent();
        return _agentURI[agentId];
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external onlyAgentOwner(agentId) {
        _agentURI[agentId] = newURI;
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external onlyAgentOwner(agentId) {
        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, key, value);
    }
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory) {
        return _metadata[agentId][key];
    }

    /// @notice Set the agent's payment address (where x402 settles). Owner-only.
    function setAgentWallet(uint256 agentId, address wallet) external onlyAgentOwner(agentId) {
        if (wallet == address(0)) revert ZeroAddress();
        _agentWallet[agentId] = wallet;
        emit AgentWalletSet(agentId, wallet);
    }
    function getAgentWallet(uint256 agentId) external view returns (address) {
        address w = _agentWallet[agentId];
        return w == address(0) ? ownerOf[agentId] : w; // default to the owner
    }
}
