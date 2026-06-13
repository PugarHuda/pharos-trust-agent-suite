# Voice-over script — synced to `node demo.mjs`

Read this while screen-recording `node demo.mjs --write` (terminal + a Pharosscan tab).
Target ~2:45. Each block lines up with one section the driver prints. Pause ~1s between sections.

---

**[0:00–0:15 · intro — title line on screen]**
> "This is the Pharos Trust-First Agent Suite — eight composable skills that form a trust layer for the
> Pharos agent economy. Everything you're about to see is live on the Atlantic testnet, with a hundred
> and sixty-two passing tests and green CI. Let me run it."

*(type `node demo.mjs --write` and hit enter)*

**[0:15–0:35 · Section 1 — agent-utils price]**
> "First, the cheap, high-frequency primitives every agent calls. Here's a live Bitcoin price pulled
> straight from the Chainlink oracle on Pharos — sixty-three thousand dollars, with a freshness check.
> No API key, no gas — just a read."

**[0:35–0:55 · Section 2 — shield blocks an approval]**
> "Now security. An agent is about to approve an unlimited allowance to an unknown spender — the classic
> drain setup. Agent-shield catches it: verdict fail, do-not-sign. It's read-only and zero-dependency,
> so it scores clean on the CertiK scanner the hackathon uses."

**[0:55–1:15 · Section 3 — strategy uses the oracle]**
> "Strategy ties it together: a natural-language rule — 'sell WBTC when price is over sixty thousand' —
> reads that same live oracle and produces an actual swap decision, which it would route through the
> treasury's policy. Oracle, logic, and policy-bounded execution, composed."

**[1:15–1:45 · Section 4 + 6b/6c — treasury, the guardrail (LIVE writes)]**
> "Here's the heart of it — an on-chain spending policy. The treasury has a daily cap and an allow-list.
> Watch a real transaction: a policy-allowed spend executes and confirms on Pharosscan."

*(click the `spendToken` tx link)*

> "Now the money shot — the agent tries to send funds to an address that is NOT on the allow-list.
> The guardrail reverts it before it's even broadcast. A jailbroken prompt cannot get past this,
> because the limit lives in the contract, not the instructions."

**[1:45–2:00 · Section 5 — stylus risk gate]**
> "Risk scoring: a fixed-point model — the same one we wrote as a Rust WASM contract — gates an action.
> High-risk features, the gate blocks. And because the JavaScript reference is bit-identical, the
> on-chain result is independently verifiable."

**[2:00–2:20 · Section 6 — bazaar discovery]**
> "And the hub: the Pharos Bazaar. Discover services for a tag, ranked by real on-chain reputation —
> the higher-reputation provider wins even though it's pricier. This is the marketplace every agent
> calls — Pharos's answer to Coinbase's x402 Bazaar, with trust built in."

**[2:20–2:45 · Section 7 — the full loop on Pharosscan]**
> "Finally, the whole agent-economy loop, already on-chain. Open these: a gasless x402 payment settled
> with one signature — the payer spent no gas. That settlement was recorded as a rateable interaction,
> and the payer's rating moved the provider's reputation — reputation you cannot fake, because it costs
> a real payment."

*(click the three tx links)*

**[closing]**
> "Discover, hire, pay, settle, rate, validate, gate, and leash — thirteen skills, wired together, live
> on Pharos. The only complete ERC-8004 + ERC-8183 + AP2 + x402 stack, where reputation is economic and
> agents are bound by signed intent. Aligned with
> ERC-8004, the trust layer the agent economy is standardizing on. That's the suite."

---

### Tips
- Run `node demo.mjs --write` once before recording to warm up (the first oracle call can be slow).
- If you'd rather not broadcast writes, drop `--write` — sections 6b/6c become the already-confirmed
  spend tx in `DEPLOYMENTS.md` (open it instead and narrate the same line).
- Keep the Pharosscan tab pre-opened to the explorer home so tx links load instantly.
- Numbers to say out loud: **13 skills, 236 tests, green CI, 11 live contracts, ERC-8004 + ERC-8183 + AP2 + x402**.
