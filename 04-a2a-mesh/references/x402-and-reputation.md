# Reference: x402 Payment & Reputation Binding

## x402 settlement (official Pharos stack)

Client side (consumer agent), based on the official `x402-pharos` skill:

```ts
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.SESSION_PRIVATE_KEY);
const client = new x402Client();
client.register("eip155:688689", new ExactEvmScheme(signer));
const pay = wrapFetchWithPayment(fetch, client);

const res = await pay(providerEndpoint, { method: "POST", body: JSON.stringify(input) });
const settlement = decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE"));
// settlement.txHash is the interactionRef used below
```

Server side (provider agent) uses `@x402/express` `paymentMiddleware` with
`network: "eip155:688689"`, `price`, and `payTo`. See the official x402-pharos SKILL.md.

> Route the payment through agent-treasury (`executeCall` to the facilitator) so it respects the
> spending policy. Use the x402 USDC at `0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8` for the demo.

## Binding payment → rating (anti-sybil)

After settlement, the mesh recorder calls:

```bash
cast send $REPUTATION "recordPayment(bytes32,address,address,uint256)" \
  $INTERACTION_REF $PAYER $PROVIDER $AMOUNT \
  --rpc-url $RPC --private-key $RECORDER_KEY --gas-limit 120000
```

Then, and only then, the payer can rate once:

```bash
cast send $REPUTATION "rate(bytes32,uint8)" $INTERACTION_REF 5 \
  --rpc-url $RPC --private-key $SESSION_PRIVATE_KEY --gas-limit 120000
```

`rate` reverts with `NotPayer` for anyone who didn't pay, and `AlreadyRated` on a second attempt. This
is what makes the reputation expensive to fake — the differentiator over plain discovery+payment.

## Discovery

```bash
TAG=$(cast keccak "price-feed")
cast call $REGISTRY "getActiveByTag(bytes32)(uint256[])" $TAG --rpc-url $RPC
# fetch each service, read scoreOf(owner), sort descending
cast call $REPUTATION "scoreOf(address)(uint256)" $PROVIDER --rpc-url $RPC
```

For fast discovery at scale, index `Registered`/`Rated` events with a Goldsky subgraph instead of
on-chain enumeration.
