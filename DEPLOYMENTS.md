# On-Chain Deployments (Atlantic Testnet · chainId 688689)

Live artifacts with clickable Pharosscan links. Filled in as contracts are deployed.

> Explorer: https://atlantic.pharosscan.xyz

Owner / deployer: `0x39D2bae5EAedA9283535dDC98F1991c81eD5Cd7E`

## agent-treasury

| Item | Address / tx | Link |
|------|--------------|------|
| **AgentTreasury** | `0xDea6Da93265871d828B20cace2BADd5F5e70209d` | [addr](https://atlantic.pharosscan.xyz/address/0xDea6Da93265871d828B20cace2BADd5F5e70209d) |
| Deploy tx | `0x1c0e8b72096da36a12ac6755521b7439d07c4564e698106dc93e78ea5d02c4ba` | [tx](https://atlantic.pharosscan.xyz/tx/0x1c0e8b72096da36a12ac6755521b7439d07c4564e698106dc93e78ea5d02c4ba) |
| set-policy (USDC, 10/day) | `0xac9eec31710fc22694f1ce2276326a27a14af2d2b6b26dd54ca97006801fa783` | [tx](https://atlantic.pharosscan.xyz/tx/0xac9eec31710fc22694f1ce2276326a27a14af2d2b6b26dd54ca97006801fa783) |
| allow-contract (WPHRS) | `0xf1b3acd0cb7f33330d537f2d66c4d4c38de327fdd661aaa63ecbaa92b4d27095` | [tx](https://atlantic.pharosscan.xyz/tx/0xf1b3acd0cb7f33330d537f2d66c4d4c38de327fdd661aaa63ecbaa92b4d27095) |
| grant-session (5 USDC, 7d) | `0x4cb4eefde9aa11a085d8957f03d78b80cf8f67ab14db1c967ffd96dbc10dcd0c` | [tx](https://atlantic.pharosscan.xyz/tx/0x4cb4eefde9aa11a085d8957f03d78b80cf8f67ab14db1c967ffd96dbc10dcd0c) |
| Blocked spend (the money shot) | Pre-flight caught `ContractNotAllowed` and refused to broadcast a spend to a non-allowlisted address — the guardrail works *before* a tx is even sent. | — |

## a2a-mesh

| Item | Address / tx | Link |
|------|--------------|------|
| **ServiceRegistry** | `0xE92254E3722D190ffC77C0aCa6856610708b9246` | [addr](https://atlantic.pharosscan.xyz/address/0xE92254E3722D190ffC77C0aCa6856610708b9246) |
| **Reputation** | `0xE9DC8a36e8f14c85E687eEe26978692dA98cbeab` | [addr](https://atlantic.pharosscan.xyz/address/0xE9DC8a36e8f14c85E687eEe26978692dA98cbeab) |
| register (price-feed service) | `0x611c381e9e346cfa4e100b6f18e6747abaa04400a67ffd7f85eaece2c39d2c65` | [tx](https://atlantic.pharosscan.xyz/tx/0x611c381e9e346cfa4e100b6f18e6747abaa04400a67ffd7f85eaece2c39d2c65) |
| recordPayment (payer→provider) | `0x1591ad7efa6a3f2ee29afe2dee30708758ca4b05d28164d24695b0e9e9b14053` | [tx](https://atlantic.pharosscan.xyz/tx/0x1591ad7efa6a3f2ee29afe2dee30708758ca4b05d28164d24695b0e9e9b14053) |
| rate (payer-only, score 5) | `0xdf83a341501db428b2b2114b916d61cebc1a21d16873d112f526cf34d0ac4f06` | [tx](https://atlantic.pharosscan.xyz/tx/0xdf83a341501db428b2b2114b916d61cebc1a21d16873d112f526cf34d0ac4f06) |
| Anti-sybil proof | A **non-payer's** `rate` was rejected (`NotPayer`) before broadcast; only the verified payer's rating moved the score. `discover` then ranks the service by its on-chain reputation (5/100). | — |

## stylus-compute

| Item | Address / tx | Link |
|------|--------------|------|
| RiskOracle (Stylus/WASM) | _pending — needs a build host with the MSVC/cargo-stylus toolchain_ | |

## agent-strategy

No own contract — composes agent-treasury. The oracle read is **live-verified** against Atlantic:
`strategy price --feed BTC/USD` returns a fresh BTC/USD price from the Chainlink Push Engine
SelfManagedFeedsCacheProxy (`0x82d0e03ea6d94120B92EA4Ea236DcFA273D42994`) and drives an eval/plan
decision. A full executeCall swap needs a DEX router + token liquidity on Atlantic; record that tx here
when run.

| Item | tx | Link |
|------|----|------|
| Live oracle read (BTC/USD) | read-only `eth_call` — no tx | [feed](https://atlantic.pharosscan.xyz/address/0x82d0e03ea6d94120B92EA4Ea236DcFA273D42994) |
| Example oracle-driven swap | _pending (needs a router on Atlantic)_ | |
