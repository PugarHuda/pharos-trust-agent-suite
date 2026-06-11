// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ServiceRegistry
/// @notice On-chain directory of agent services for the a2a-mesh skill. Providers register an x402
///         endpoint under a capability tag with a price; consumers discover by tag.
/// @dev    Pharos Atlantic Testnet (chainId 688689). Discovery is event-indexed (use a subgraph /
///         Goldsky) plus an on-chain id list per tag for trustless reads.
contract ServiceRegistry {
    struct Service {
        address owner;
        bytes32 tag;       // capability tag, e.g. keccak("price-feed")
        string  endpoint;  // x402 URL
        uint256 price;     // price per call (in the settlement token's smallest unit)
        bool    active;
    }

    uint256 public nextId = 1;
    mapping(uint256 => Service) public services;
    mapping(bytes32 => uint256[]) private _byTag;

    event Registered(uint256 indexed id, address indexed owner, bytes32 indexed tag, string endpoint, uint256 price);
    event Updated(uint256 indexed id, string endpoint, uint256 price);
    event ActiveSet(uint256 indexed id, bool active);

    error NotServiceOwner();

    function register(bytes32 tag, string calldata endpoint, uint256 price) external returns (uint256 id) {
        id = nextId++;
        services[id] = Service({owner: msg.sender, tag: tag, endpoint: endpoint, price: price, active: true});
        _byTag[tag].push(id);
        emit Registered(id, msg.sender, tag, endpoint, price);
    }

    function update(uint256 id, string calldata endpoint, uint256 price) external {
        Service storage s = services[id];
        if (s.owner != msg.sender) revert NotServiceOwner();
        s.endpoint = endpoint;
        s.price = price;
        emit Updated(id, endpoint, price);
    }

    function setActive(uint256 id, bool active) external {
        Service storage s = services[id];
        if (s.owner != msg.sender) revert NotServiceOwner();
        s.active = active;
        emit ActiveSet(id, active);
    }

    /// @notice All service ids registered under a tag (filter active off-chain or via getActiveByTag).
    function getByTag(bytes32 tag) external view returns (uint256[] memory) {
        return _byTag[tag];
    }

    function getActiveByTag(bytes32 tag) external view returns (uint256[] memory active) {
        uint256[] memory all = _byTag[tag];
        uint256 n;
        for (uint256 i; i < all.length; ++i) if (services[all[i]].active) ++n;
        active = new uint256[](n);
        uint256 j;
        for (uint256 i; i < all.length; ++i) if (services[all[i]].active) active[j++] = all[i];
    }

    /// @notice Number of ids registered under a tag (for pagination).
    function tagCount(bytes32 tag) external view returns (uint256) {
        return _byTag[tag].length;
    }

    /// @notice Paginated id slice for a tag. As a popular tag grows, the unbounded
    ///         getActiveByTag view can exceed an eth_call gas cap; consumers should page
    ///         through with this (or index the Registered/ActiveSet events off-chain).
    function getByTagPaged(bytes32 tag, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids)
    {
        uint256[] memory all = _byTag[tag];
        if (offset >= all.length) return new uint256[](0);
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        ids = new uint256[](end - offset);
        for (uint256 i = offset; i < end; ++i) ids[i - offset] = all[i];
    }
}
