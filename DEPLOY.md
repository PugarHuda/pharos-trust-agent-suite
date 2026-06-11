# Deploy Guide — putting the suite on Atlantic testnet

Everything below targets **Pharos Atlantic Testnet** (chainId `688689`, RPC
`https://atlantic.dplabs-internal.com`, explorer `https://atlantic.pharosscan.xyz`). Nothing here needs
Foundry — contracts compile with the `solc` npm package and deploy via `ethers`.

> **Gas quirk:** Pharos charges by `gas_limit` at inclusion and refunds do **not** reduce the charge.
> Every CLI already adds a +15% buffer over the estimate. Don't over-provision wildly — you pay for it.

## 0. Prerequisites

- Node ≥ 18 (`node --version`).
- A testnet key with a little PHRS for gas. **Never commit it.** Put it in each skill's `.env`
  (gitignored); see each `.env.example`.

### Get testnet PHRS (faucets — third-party, amounts are small)

The official docs do not document a faucet. Community faucets (verify before use):

- `https://testnet.pharosnetwork.xyz` — official testnet portal (~0.01 PHRS / 12h)
- `https://gas.zip/faucet/pharos`
- `https://zan.top/faucet/pharos`
- `https://stakely.io/faucet/pharos-atlantic-testnet-phrs`

Fund the **owner** address you'll deploy from. For the treasury demo you also need a little testnet
**USDC** (`0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B`); if no faucet mints it, use any ERC-20 you can
obtain and point the policy at it.

Check your balance:
```bash
node -e "const {JsonRpcProvider,formatEther}=require('ethers');new JsonRpcProvider('https://atlantic.dplabs-internal.com').getBalance(process.argv[1]).then(b=>console.log(formatEther(b),'PHRS'))" 0xYOURADDRESS
```

## 1. agent-treasury

```bash
cd 01-agent-treasury
npm install && npm run build          # -> artifacts/AgentTreasury.json
cp .env.example .env                   # set OWNER_PRIVATE_KEY (+ SESSION_PRIVATE_KEY for the agent)

node scripts/treasury.mjs deploy                                   # prints 0xTREASURY
node scripts/treasury.mjs set-policy     --treasury 0xTREASURY --token USDC --daily-cap 10
node scripts/treasury.mjs allow-contract --treasury 0xTREASURY --target 0xALLOWED_DEST
node scripts/treasury.mjs grant-session  --treasury 0xTREASURY --key 0xSESSION --token USDC --budget 5 --expires 7d
# fund the treasury with USDC (send to 0xTREASURY from any wallet), then:
node scripts/treasury.mjs spend          --treasury 0xTREASURY --token USDC --to 0xALLOWED_DEST --amount 1
node scripts/treasury.mjs status         --treasury 0xTREASURY --token USDC --key 0xSESSION
```

The **money-shot** for the demo: try a spend that violates policy (unlisted destination or over the
cap) — the shield pre-flight + `staticCall` blocks it *before* broadcasting, and even if forced with
`--yes` the contract reverts on-chain. Capture both the allowed tx and the reverted attempt on Pharosscan.

## 2. agent-shield

No deployment — it's read-only. Point it at live state:
```bash
cd 02-agent-shield
node scripts/shield.mjs verify-address --address 0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B
node scripts/shield.mjs check-tx --from 0xYOU --to 0xTOKEN --data 0x... --rpc-url https://atlantic.dplabs-internal.com
```

## 3. a2a-mesh

```bash
cd 04-a2a-mesh
npm install && npm run build
cp .env.example .env                   # RECORDER_PRIVATE_KEY (+ PAYER_PRIVATE_KEY)

node scripts/mesh.mjs deploy                                       # prints 0xREG + 0xREP
node scripts/mesh.mjs register --registry 0xREG --tag price-feed --endpoint https://a.example/x402 --price 1000
node scripts/mesh.mjs discover --registry 0xREG --reputation 0xREP --tag price-feed
# after an x402 payment settles (settlement tx = 0xSETTLE):
node scripts/mesh.mjs record-payment --reputation 0xREP --ref 0xSETTLE --payer 0xC --provider 0xA --amount 1000
node scripts/mesh.mjs rate           --reputation 0xREP --ref 0xSETTLE --score 5
node scripts/mesh.mjs score          --reputation 0xREP --provider 0xA
```

Demo proof: an outsider who didn't pay calls `rate` on the same ref → **reverts** (`NotPayer`). Show it.

## 4. agent-strategy

No own contract — it reads an oracle and emits `treasury.executeCall` calldata.
```bash
cd 03-agent-strategy && npm install
node scripts/strategy.mjs price --feed BTC/USD          # live Chainlink read on Atlantic
node scripts/strategy.mjs eval  --rule "sell WBTC when price > 60000" --feed BTC/USD
node scripts/strategy.mjs plan  --rule "sell WETH if it drops 10%" --price 80 --ref 100 \
  --router 0xROUTER --treasury 0xTREASURY --amount-in 1000000000000000000 --quote-out 2000000
```
For a live swap you need a DEX router on Atlantic; feed its address as `--router` and a real
`getAmountsOut` quote as `--quote-out`, then submit the two calldatas through the treasury session key.

## 5. stylus-compute

Requires the Pharos Stylus toolchain **and a host C/C++ linker** (MSVC Build Tools on Windows / build-
essential on Linux), plus a funded key.
```bash
cargo install --git https://github.com/PharosNetwork/pharos-cargo-stylus
cd 05-stylus-compute/contracts-rust
cargo stylus check  --endpoint https://atlantic.dplabs-internal.com
cargo stylus deploy --endpoint https://atlantic.dplabs-internal.com --private-key $PRIVATE_KEY   # -> 0xSTYLUS
```
Record `0xSTYLUS` into `assets/model.json` (`deployed.atlantic-testnet.address`), then prove the WASM
result matches the JS reference:
```bash
cd .. && npm install
node scripts/compute.mjs verify --address 0xSTYLUS --features 0.2,1,0.1,0   # -> MATCH ✓
```

## After deploying — record the addresses

Collect the deployed addresses + tx hashes into the README table and the demo. Clickable Pharosscan
links (`https://atlantic.pharosscan.xyz/tx/<hash>` and `/address/<addr>`) are the on-chain proof judges
look for.
