// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test fixtures mirroring the suite's live registries the gate reads.
contract MockReputation {
    mapping(address => uint256) public scoreOf;
    function set(address a, uint256 s) external { scoreOf[a] = s; }
}

contract MockValidation {
    struct V { uint256 validator; uint256 server; uint8 response; bool requested; bool responded; }
    mapping(bytes32 => V) private _v;
    function set(bytes32 h, uint8 response, bool responded) external {
        _v[h] = V(1, 2, response, true, responded);
    }
    function getValidation(bytes32 h) external view returns (uint256, uint256, uint8, bool, bool) {
        V storage v = _v[h];
        return (v.validator, v.server, v.response, v.requested, v.responded);
    }
}

/// @notice A provider that reverts on receive — to prove gatedPay surfaces a failed transfer.
contract RejectingProvider {
    receive() external payable { revert("no"); }
}
