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

### Full success + blocked path (with a deployed demo ERC-20, since canonical testnet USDC has no faucet)

| Item | Address / tx | Link |
|------|--------------|------|
| Demo token (MockERC20) | `0xF97C6Bd1fA133341175cfE362D67160D43e0342A` | [addr](https://atlantic.pharosscan.xyz/address/0xF97C6Bd1fA133341175cfE362D67160D43e0342A) |
| Mint 100 → treasury | `0x006c08e7ff8e72644c1d0dc1d6be1ff7b5c0bc927a297164997e384658932797` | [tx](https://atlantic.pharosscan.xyz/tx/0x006c08e7ff8e72644c1d0dc1d6be1ff7b5c0bc927a297164997e384658932797) |
| set-policy + allow + session | `0x85c71607…`, `0x4c31ec2e…`, `0xd72ed33a…` | [policy](https://atlantic.pharosscan.xyz/tx/0x85c716079ac4a325259c055d655524373a716ec29550ea544265e15d73f413b3) · [allow](https://atlantic.pharosscan.xyz/tx/0x4c31ec2e5948dcf490e0d9b7f6b677ec2cf1f4d9034b6ff5264c8c77c27a6047) · [session](https://atlantic.pharosscan.xyz/tx/0xd72ed33a6580ddda3dd9e0384a403fa1c81e29d4c97198eabcbcd95572ecaae9) |
| **✅ Successful policy-allowed spend** (1 token → allow-listed service) | `0x0ac87e9600dc869c7b05324d70065db11ac85bdc6821b7c177d20b940d2876ca` | [tx](https://atlantic.pharosscan.xyz/tx/0x0ac87e9600dc869c7b05324d70065db11ac85bdc6821b7c177d20b940d2876ca) |
| On-chain accounting after the spend | service balance `1.0`, treasury `99.0`, daily cap `10 → 9`, session budget `5 → 4` | — |
| ❌ Blocked spend (same token, non-allowlisted dest) | reverts `ContractNotAllowed` at pre-flight | — |

> A first treasury was deployed at `0xDea6Da93265871d828B20cace2BADd5F5e70209d`; it was redeployed
> after the QA round-2 cross-token fix so the live bytecode matches the audited source above.

## a2a-mesh

| Item | Address / tx | Link |
|------|--------------|------|
| **ServiceRegistry** | `0x851C251411Fe4F4bab586F775c7450f86A348EAD` | [addr](https://atlantic.pharosscan.xyz/address/0x851C251411Fe4F4bab586F775c7450f86A348EAD) |
| **Reputation** (EIP-712 trustless recording) | `0x05465b9887D7952fAC76DF42D193aae55EbA5891` | [addr](https://atlantic.pharosscan.xyz/address/0x05465b9887D7952fAC76DF42D193aae55EbA5891) |
| register (price-feed service, by provider) | `0x162b97149592b61d4b9d4af931e007e0d11449417432c1a2240b1cad418da77c` | [tx](https://atlantic.pharosscan.xyz/tx/0x162b97149592b61d4b9d4af931e007e0d11449417432c1a2240b1cad418da77c) |
| **recordPaymentSigned** (payer-signed, relayer-submitted) | `0xb9d46f54871e076a547fc3f9705d3b95464f760b21e8abcbdf78762f6c666770` | [tx](https://atlantic.pharosscan.xyz/tx/0xb9d46f54871e076a547fc3f9705d3b95464f760b21e8abcbdf78762f6c666770) |
| rate (payer-only, score 5) | `0xf5aa99350c9dfa60cb0dcc272e5dc65a2341100db7c4b38b14b296a3f7619e76` | [tx](https://atlantic.pharosscan.xyz/tx/0xf5aa99350c9dfa60cb0dcc272e5dc65a2341100db7c4b38b14b296a3f7619e76) |
| Anti-sybil proof | The payment was recorded from the **payer's EIP-712 signature** (a relayer cannot fabricate it); a non-payer's `rate` reverts `NotPayer`; only the verified payer's rating moved the score. `discover` ranks the service by its on-chain reputation (5/100). | — |

> First mesh deploy (`ServiceRegistry 0xE92254…`, `Reputation 0xE9DC8a…`) used the trusted-recorder
> `recordPayment`; redeployed after adding the trustless EIP-712 `recordPaymentSigned` path.

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
