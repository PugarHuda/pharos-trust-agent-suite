# Reference: Shield Detectors

Each detector returns `Finding[]`; the aggregator turns findings into a score (start 100, subtract by
severity from `registry.json.rules.severityWeights`) and a verdict (`fail` if any high, else `warn` if
any medium, else `pass`).

## 1. Simulate & balance-diff

```bash
# Dry-run; if it reverts, surface the revert reason and stop.
cast call $TO $SIG $ARGS --from $FROM --rpc-url $RPC

# Full trace for balance deltas (parse Transfer events for $FROM)
cast run $TXHASH --rpc-url $RPC          # for an already-broadcast tx
# or build the call and inspect state diff with a local fork (anvil --fork-url $RPC)
```

Honeypot heuristic: after simulating a *buy*, simulate the corresponding *sell* path. If the sell
reverts or returns zero out, flag **high: possible honeypot (cannot exit position)**.

## 2. Registry verification & address poisoning

- Normalize to checksummed lowercase. Classify each address as official / knownGood / unknown.
- Poisoning: for each unknown address, compare against every official address. If the first N and last
  N hex chars match (`poisoningMinPrefixSuffixMatch`) but the full address differs, flag **high:
  address poisoning — looks like <name> but is not**.

## 3. Approval guard

```ts
import { decodeFunctionData, parseAbi } from "viem";
const abi = parseAbi(["function approve(address spender, uint256 amount)"]);
const { functionName, args } = decodeFunctionData({ abi, data });
if (functionName === "approve") {
  const [spender, amount] = args;
  if (amount === 2n ** 256n - 1n) finding("high", "Unlimited approval");
  if (!isKnown(spender)) finding("high", "Approval to unverified spender");
}
```

Also detect Permit2 `approve`/`permit` with infinite allowance and `setApprovalForAll(operator, true)`
on NFTs.

## 4. Skill scan

Regex ruleset (extend with tree-sitter for accuracy):

| Pattern | Severity | Meaning |
|---------|----------|---------|
| `\$(OWNER_)?PRIVATE_KEY` near `curl`/`fetch`/`http` | high | key exfiltration |
| `curl[^\n]*\|\s*(ba)?sh` | high | remote code execution |
| `eval\(.*base64` / `atob\(` + `eval` | high | obfuscated payload |
| `fetch\(["']https?://(?!localhost)` not declared in frontmatter | medium | undisclosed network call |
| frontmatter `readOnly: true` but file contains `cast send`/`privateKey` | medium | permission mismatch |

Output mirrors CertiK grading; always state in the report that Shield is a runtime complement to the
submission-time CertiK Skill Scanner, not a replacement.
