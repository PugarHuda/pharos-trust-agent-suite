# On-Chain Deployments (Atlantic Testnet · chainId 688689)

Live artifacts with clickable Pharosscan links. Filled in as contracts are deployed.

> Explorer: https://atlantic.pharosscan.xyz

Owner / deployer: `0x39D2bae5EAedA9283535dDC98F1991c81eD5Cd7E`

## agent-treasury

| Item | Address / tx | Link |
|------|--------------|------|
| **AgentTreasury** (hardened build) | `0x0cdF46EE713Cfd910938E1B56BaEC6eACD18EF1c` | [addr](https://atlantic.pharosscan.xyz/address/0x0cdF46EE713Cfd910938E1B56BaEC6eACD18EF1c) |
| Deploy tx | `0x350eda4984036f5693c05002db2b7035c03425bcc0fe5aff3501d7701966d07b` | [tx](https://atlantic.pharosscan.xyz/tx/0x350eda4984036f5693c05002db2b7035c03425bcc0fe5aff3501d7701966d07b) |
| set-policy (USDC, 10/day) | `0x260f6352495457a887cb47e4c2eb612d74148ed4f1b931ea2071b010b5e46292` | [tx](https://atlantic.pharosscan.xyz/tx/0x260f6352495457a887cb47e4c2eb612d74148ed4f1b931ea2071b010b5e46292) |
| allow-contract (WPHRS) | `0xe3e4c67bc0244c88fa71d850cc18e0118a9c1c3ca8f6a3b9db3b6063fce46748` | [tx](https://atlantic.pharosscan.xyz/tx/0xe3e4c67bc0244c88fa71d850cc18e0118a9c1c3ca8f6a3b9db3b6063fce46748) |
| grant-session (5 USDC, 7d) | `0x0f46fa5c82e04352bf6d016a4f727efffffe659481db65f66e174454fa2a8004` | [tx](https://atlantic.pharosscan.xyz/tx/0x0f46fa5c82e04352bf6d016a4f727efffffe659481db65f66e174454fa2a8004) |
| Blocked spend (the money shot) | Pre-flight caught `ContractNotAllowed` and refused to broadcast a spend to a non-allowlisted address — the guardrail works *before* a tx is even sent. | — |

> A first treasury was deployed at `0xDea6Da93265871d828B20cace2BADd5F5e70209d`; it was redeployed
> after the QA round-2 cross-token fix so the live bytecode matches the audited source above.

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
