# Reference: Stylus Build / Deploy / Call

Pharos dual-VM lets Rust/WASM (Stylus) contracts run heavy compute and be called from EVM context.

## Toolchain

```bash
# Install the Pharos Stylus toolchain (Rust required)
cargo install --git https://github.com/PharosNetwork/pharos-cargo-stylus
# or use the official starter
git clone https://github.com/PharosNetwork/stylus-hello-world
```

## Implement (example shape)

```rust
// lib.rs — a read-only compute entrypoint
use stylus_sdk::prelude::*;

#[storage]
#[entrypoint]
pub struct Compute;

#[public]
impl Compute {
    // Heavy, verifiable computation. Pure/view where possible -> callable via eth_call, no signature.
    pub fn verify(&self, proof: Vec<u8>, public_inputs: Vec<u8>) -> bool {
        // groth16 / ml-scoring / batch-verify logic here
        true
    }
}
```

## Deploy to Atlantic testnet

```bash
cargo stylus check --endpoint https://atlantic.dplabs-internal.com
cargo stylus deploy \
  --endpoint https://atlantic.dplabs-internal.com \
  --private-key $PRIVATE_KEY
# record the deployed address into assets/networks.json
```

## Call from EVM context

Read-only (no signature, free):

```bash
cast call $STYLUS "verify(bytes,bytes)(bool)" $PROOF $PUBLIC_INPUTS \
  --rpc-url https://atlantic.dplabs-internal.com
```

From Solidity (another contract / skill gating an action on the result):

```solidity
interface ICompute { function verify(bytes calldata p, bytes calldata x) external view returns (bool); }
require(ICompute(stylus).verify(proof, inputs), "proof invalid");
// ... then proceed (e.g. treasury release)
```

## Gas note

Set gas limit 10-20% above estimate for any state-changing call (Pharos charges by gas_limit). Most
compute calls are read-only `eth_call` and incur no gas/signature.

## Validation

Treat externally supplied `proof` / model inputs as untrusted: check expected byte lengths and shapes
on the EVM side before forwarding, and bound any loops inside the Stylus contract.
