# On-Chain Deployments (Atlantic Testnet · chainId 688689)

Live artifacts with clickable Pharosscan links. Filled in as contracts are deployed.

> Explorer: https://atlantic.pharosscan.xyz

Owner / deployer: `0x39D2bae5EAedA9283535dDC98F1991c81eD5Cd7E`

## agent-treasury

| Item | Address / tx | Link |
|------|--------------|------|
| **AgentTreasury** (round-3 hardened build) | `0x0954E50cBC85836C9E3FC6868d24b6118d974E9d` | [addr](https://atlantic.pharosscan.xyz/address/0x0954E50cBC85836C9E3FC6868d24b6118d974E9d) |
| Deploy tx | `0x16adbefd6c4d7e656d428963760d6d003f3de5d38a77939117d0990d724254e9` | [tx](https://atlantic.pharosscan.xyz/tx/0x16adbefd6c4d7e656d428963760d6d003f3de5d38a77939117d0990d724254e9) |
| Demo token (MockERC20) + mint 100 → treasury | `0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0` / `0x72bd5d95…` | [token](https://atlantic.pharosscan.xyz/address/0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0) · [mint](https://atlantic.pharosscan.xyz/tx/0x72bd5d95cb4c8739eea28b7bcdc926def0b9e44f5878de4998df8f2022d4bc30) |
| set-policy + allow + grant-session | `0x7351f728…`, `0xbdf823ca…`, `0xcdb5e43a…` | [policy](https://atlantic.pharosscan.xyz/tx/0x7351f728601ac35e489f6d6dcf7268d25007cefef09b11e5cd5b904c9b3448f6) · [allow](https://atlantic.pharosscan.xyz/tx/0xbdf823cad10829a14ee68b418c7f7a8cfa4c32add4b1d29da96f93f89d5c398b) · [session](https://atlantic.pharosscan.xyz/tx/0xcdb5e43a081ea0a96c1cc00c3cc2775ec726b869386cd03743ce536522349947) |
| **✅ Successful policy-allowed spend** (1 token → allow-listed service) | `0x1fcd2c629d0a805bed93d99edfc150d3afcf375f44157b7ee331329c49d50634` | [tx](https://atlantic.pharosscan.xyz/tx/0x1fcd2c629d0a805bed93d99edfc150d3afcf375f44157b7ee331329c49d50634) |
| **❌ Blocked spend** (same token, non-allowlisted dest) | pre-flight caught `ContractNotAllowed` and refused to broadcast — the guardrail fires *before* a tx is sent | — |

> Redeployed across QA rounds so the live bytecode matches the audited source: first treasury
> `0xDea6Da93…` → round-2 cross-token fix `0x0cdF46EE…` → round-3 `MAX_POLICY_TOKENS` cap (current).

## a2a-mesh

| Item | Address / tx | Link |
|------|--------------|------|
| **ServiceRegistry** | `0xa4d6d9932B19f9B03D0439264F1188F39F8522f0` | [addr](https://atlantic.pharosscan.xyz/address/0xa4d6d9932B19f9B03D0439264F1188F39F8522f0) |
| **Reputation** (EIP-712 trustless + (payer,ref)-keyed) | `0x8010e567b6f68dcfD19312644F1c3E6249b43ef7` | [addr](https://atlantic.pharosscan.xyz/address/0x8010e567b6f68dcfD19312644F1c3E6249b43ef7) |
| register (price-feed service, by provider) | `0x71728550038e5445b0499ac17c5df0f14167cccebe4d2aee988c89eaca281a0e` | [tx](https://atlantic.pharosscan.xyz/tx/0x71728550038e5445b0499ac17c5df0f14167cccebe4d2aee988c89eaca281a0e) |
| **recordPaymentSigned** (payer-signed, relayer-submitted) | `0x972295c47b832da56cebf7c4212510299074caac6703b0819c241a84a3abc565` | [tx](https://atlantic.pharosscan.xyz/tx/0x972295c47b832da56cebf7c4212510299074caac6703b0819c241a84a3abc565) |
| rate (payer-only, score 5) | `0xcef892b3ae1604ffaa17369ed03d1ae4c7608c35ceec522329a74ab9fa530de9` | [tx](https://atlantic.pharosscan.xyz/tx/0xcef892b3ae1604ffaa17369ed03d1ae4c7608c35ceec522329a74ab9fa530de9) |
| Anti-sybil proof | Payment recorded from the **payer's EIP-712 signature** (a relayer cannot fabricate it, and payments are keyed by (payer,ref) so a ref can't be griefed); a non-payer's `rate` reverts `NotPayer`; only the verified payer's rating moved the score. `discover` ranks the service by on-chain reputation (5/100). | — |

> Mesh was redeployed across QA rounds to keep live bytecode == audited source: trusted-recorder →
> EIP-712 `recordPaymentSigned` → (payer,ref)-keyed griefing-proof (current).

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
