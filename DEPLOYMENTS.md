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
