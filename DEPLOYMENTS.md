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

| **Reputation8004Adapter** (ERC-8004 read surface → live Reputation) | `0x6B99B00BD52Bc134D5658745E64DF1938592e468` | [addr](https://atlantic.pharosscan.xyz/address/0x6B99B00BD52Bc134D5658745E64DF1938592e468) |
| **IdentityRegistry8004** (ERC-8004 Identity; agentId 1 registered) | `0xa048D4F17282488B60D96E6FB01FbdA106F38B8A` | [addr](https://atlantic.pharosscan.xyz/address/0xa048D4F17282488B60D96E6FB01FbdA106F38B8A) · [register](https://atlantic.pharosscan.xyz/tx/0x9241017e01b15b7531029a52f8c55ead229dfde78dac4de030b2967d8d404a14) |
| Bazaar seeded services | extra `price-feed` (acme, 800), `compute` (5000), `data-api` (200) registered so `bazaar discover` shows a populated, reputation-ranked marketplace | [register](https://atlantic.pharosscan.xyz/tx/0x50c9f01c12a9ba9e2ede28f41ecda2e61fda6cfd240bf60b8208767a51a51e2b) |

> Mesh was redeployed across QA rounds to keep live bytecode == audited source: trusted-recorder →
> EIP-712 `recordPaymentSigned` → (payer,ref)-keyed griefing-proof (current). The ERC-8004 adapter
> (deployed 2026-06-13) exposes the live Reputation through the standard `getSummary` interface —
> verified live: `getSummary(agentId(0x6d42…)) → count 1, value 5, decimals 0`.

## agent-escrow

| Item | Address / tx | Link |
|------|--------------|------|
| **AgentEscrow** (native-PHRS escrow; pull-payments, reentrancy-guarded, no admin) | `0x5919e995b29Bf81B322171769C9e63c5964258A7` | [addr](https://atlantic.pharosscan.xyz/address/0x5919e995b29Bf81B322171769C9e63c5964258A7) |
| Deploy tx | `0xe3ae71e39ed33dc610081365bdc6016e0f014182a01d8ce77ebf3ad861cdad4d` | [tx](https://atlantic.pharosscan.xyz/tx/0xe3ae71e39ed33dc610081365bdc6016e0f014182a01d8ce77ebf3ad861cdad4d) |
| **Release path** — createJob (0.002 locked) | `0x6df5039da132eae7b671b75a3e662a7d1e55516654c0517b5092911a2d0debca` | [tx](https://atlantic.pharosscan.xyz/tx/0x6df5039da132eae7b671b75a3e662a7d1e55516654c0517b5092911a2d0debca) |
| ↳ release (provider credited) | `0x2a31bf3f82105c2c02b1ace1d96a848dac16001c95fddf2f9ecbea0ab381c10e` | [tx](https://atlantic.pharosscan.xyz/tx/0x2a31bf3f82105c2c02b1ace1d96a848dac16001c95fddf2f9ecbea0ab381c10e) |
| **Dispute path** — createJob (0.001 locked, arbiter set) | `0x4b4a96a3d542b7e15229bb854a9d6bf4dfecca556381138fdeceafed79c60c01` | [tx](https://atlantic.pharosscan.xyz/tx/0x4b4a96a3d542b7e15229bb854a9d6bf4dfecca556381138fdeceafed79c60c01) |
| ↳ dispute (by client) | `0x5badcc4adaab806a5c093d196c539d85c6728e4a991dffab86f9c0b4d83bf4dd` | [tx](https://atlantic.pharosscan.xyz/tx/0x5badcc4adaab806a5c093d196c539d85c6728e4a991dffab86f9c0b4d83bf4dd) |
| ↳ resolve (arbiter, 100% → client) | `0xedfe433bda960c0ab07a8d709adea07ca1cd6728a45d5a7781abfcdc3d337966` | [tx](https://atlantic.pharosscan.xyz/tx/0xedfe433bda960c0ab07a8d709adea07ca1cd6728a45d5a7781abfcdc3d337966) |
| ↳ **withdraw** (real PHRS pulled back to client) | `0x26ff7a7ab6a66553d7819c497ee847ef536f0da9a7bdae0963bdf1436f19f470` | [tx](https://atlantic.pharosscan.xyz/tx/0x26ff7a7ab6a66553d7819c497ee847ef536f0da9a7bdae0963bdf1436f19f470) |

> Full lifecycle on-chain with one funded key (client = arbiter; provider = passive dummy): the
> **release** path proves create + release (provider credited), and the **dispute** path proves
> dispute → arbiter resolve → pull `withdraw()` (funds returned to a real wallet). The `jobId` doubles
> as the a2a-mesh reputation `ref`. Refund-on-timeout is covered by the 23-test suite.

## agent-validation (ERC-8004 Validation Registry)

| Item | Address / tx | Link |
|------|--------------|------|
| **ValidationRegistry8004** (wired to live Identity Registry) | `0xc9142C347b51Bd2f89f943BcEae5D302A14f5B88` | [addr](https://atlantic.pharosscan.xyz/address/0xc9142C347b51Bd2f89f943BcEae5D302A14f5B88) |
| Deploy tx | `0xbfa67170fc64c4efda135c98a95e838fda0c9f1a4a3d6aeae197a86fae2f0196` | [tx](https://atlantic.pharosscan.xyz/tx/0xbfa67170fc64c4efda135c98a95e838fda0c9f1a4a3d6aeae197a86fae2f0196) |
| register server agent (#2) | `0x93e2812da066afa7091197ad72b0f5d5fa9809e31fb90dd55fba1011156a036e` | [tx](https://atlantic.pharosscan.xyz/tx/0x93e2812da066afa7091197ad72b0f5d5fa9809e31fb90dd55fba1011156a036e) |
| register validator agent (#3) | `0x30a7cd0039a452b92a0630aba3999943468e90d90db45df4602b0626206bd9bf` | [tx](https://atlantic.pharosscan.xyz/tx/0x30a7cd0039a452b92a0630aba3999943468e90d90db45df4602b0626206bd9bf) |
| **validationRequest** (server #2 → validator #3, dataHash = escrow jobId) | `0x6e258ec47734ad10611726d660f9c038fcd99d5fdc47e8b819038686b9b2f817` | [tx](https://atlantic.pharosscan.xyz/tx/0x6e258ec47734ad10611726d660f9c038fcd99d5fdc47e8b819038686b9b2f817) |
| **validationResponse** (validator posts 95/100) | `0x2c4e6fec3872f2bca7900bbc8b82265b2f66b2ee4da36c253ff341a8b0cc1761` | [tx](https://atlantic.pharosscan.xyz/tx/0x2c4e6fec3872f2bca7900bbc8b82265b2f66b2ee4da36c253ff341a8b0cc1761) |

> Completes the **ERC-8004 trio** live: Identity (`0xa048D4F1…`) + Reputation (`0x8010e567…` /
> adapter `0x6B99B00B…`) + **Validation** (`0xc9142C34…`). The validated `dataHash`
> `0x31d03e57…` is the live `agent-escrow` released jobId — i.e. the hired work was independently
> scored 95/100 by a registered validator. Only the designated validator could respond; only the
> server agent could request (anti-griefing).

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

## x402-facilitator + pharos-bazaar — full agent-commerce loop (LIVE)

The complete **discover → pay (gasless) → settle → record → rate** loop, proven on Atlantic.

| Item | Address / tx | Link |
|------|--------------|------|
| MockUSDC3009 (EIP-3009 settlement token) | `0xBd80E06F0325C4758e06d8a9522588363C4c75a4` | [addr](https://atlantic.pharosscan.xyz/address/0xBd80E06F0325C4758e06d8a9522588363C4c75a4) |
| **x402 settle** (`transferWithAuthorization`, gasless for payer) | `0x873f98cf344dcffb8268fba0673933091be9805d4944c693616c433306a5225b` | [tx](https://atlantic.pharosscan.xyz/tx/0x873f98cf344dcffb8268fba0673933091be9805d4944c693616c433306a5225b) |
| record the settlement in the mesh (payer-signed) | `0xbc8940027763de6d9a2d645d3188713609e1736bdcd8f15d600b4a75fcf49c0b` | [tx](https://atlantic.pharosscan.xyz/tx/0xbc8940027763de6d9a2d645d3188713609e1736bdcd8f15d600b4a75fcf49c0b) |
| payer rates the provider | `0xc97221b6c1797be3b61986976b183d8522481f2ad1b86e92c73cd1c6689d5fb0` | [tx](https://atlantic.pharosscan.xyz/tx/0xc97221b6c1797be3b61986976b183d8522481f2ad1b86e92c73cd1c6689d5fb0) |
| Result | payer signed once (no gas); relayer moved **0.001 USDC** to the merchant; the settlement hash became the rateable `ref`; provider reputation rose to **10/100**. The whole loop is on-chain. | — |
