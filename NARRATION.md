# Voice-over script — synced to `node demo.mjs`

Read this while screen-recording `node demo.mjs --write` (terminal + a Pharosscan tab).
Target ~3:30. Each block lines up with one section the driver prints, in order. Pause ~1s between
sections. All 13 skills, 236 tests, 11 live contracts on Atlantic.

---

**[0:00–0:15 · intro — title line on screen]**
> "This is the Pharos Trust-First Agent Suite — thirteen composable skills that form a trust layer for
> the Pharos agent economy. Everything you're about to see is live on the Atlantic testnet: two hundred
> thirty-six passing tests, green CI, eleven contracts on-chain. Let me run it."

*(type `node demo.mjs --write` and hit enter)*

**[0:15–0:32 · Section 1 — agent-utils price]**
> "First, the cheap, high-frequency primitives every agent calls. Here's a live Bitcoin price pulled
> straight from the Chainlink oracle on Pharos — with a freshness check. No API key, no gas, just a read."

**[0:32–0:50 · Section 2 — shield blocks an approval]**
> "Now security. An agent is about to approve an unlimited allowance to an unknown spender — the classic
> drain setup. Agent-shield catches it: verdict fail, do-not-sign. Read-only and zero-dependency, so it
> scores clean on the CertiK scanner the hackathon uses."

**[0:50–1:05 · Section 3 — strategy uses the oracle]**
> "Strategy ties them together: a natural-language rule — 'sell WBTC when price is over sixty thousand' —
> reads that same live oracle and produces an actual swap decision it would route through the treasury."

**[1:05–1:20 · Section 4 — treasury policy]**
> "Here's the heart of safety — an on-chain spending policy: a daily cap, an allow-list, session keys, a
> kill-switch. The limits live in the contract, not the prompt."

**[1:20–1:32 · Section 5 — stylus risk gate]**
> "A fixed-point risk model — the same one written as a Rust WASM contract — gates an action. High-risk
> features: the gate blocks. The JavaScript reference is bit-identical, so the on-chain result is
> independently verifiable."

**[1:32–1:50 · Section 6 — bazaar discovery]**
> "The marketplace hub: discover services for a tag, ranked by real on-chain reputation. The
> higher-reputation provider wins even though it's pricier — Pharos's answer to Coinbase's x402 Bazaar,
> with trust built in."

**[1:50–2:05 · Section 6d — escrow]**
> "Now the agent-commerce loop. A client hired a provider through escrow — funds locked for the job. Here's
> that job, already released on-chain. Release on approval, refund on timeout, arbiter split on dispute."

**[2:05–2:20 · Section 6e — validation (ERC-8004)]**
> "That exact hired work was then independently validated. A registered validator agent scored it
> ninety-five out of a hundred through the ERC-8004 Validation Registry — completing the full ERC-8004
> trio: identity, reputation, and validation."

**[2:20–2:38 · Section 6f — reputation gate (ERC-8183)]**
> "And here's where reputation becomes *money*. This gate — the ERC-8183 pattern the Ethereum Foundation
> and Virtuals just shipped on Base — only releases funds to a counterparty whose reputation *and*
> validation clear a bar. Composite trust: ten reputation plus ninety-five validation — trusted, funding
> allowed."

**[2:38–2:52 · Section 6g — agent bond]**
> "Sybil resistance through skin-in-the-game: an agent locks a bond, and consumers require a minimum
> stake before trusting it. To run many fake identities you'd have to lock many bonds at once."

**[2:52–3:05 · Section 6h — x402 Bazaar export]**
> "And to plug into the wider machine economy, the bazaar exports an x402-Bazaar — Coinbase
> Agent.market — compatible catalog, but with our on-chain reputation attached: the trust signal vanilla
> x402 discovery lacks."

**[3:05–3:20 · Sections 6b/6c — treasury LIVE writes]**
> "Watch real transactions. A policy-allowed spend executes and confirms on Pharosscan."

*(click the `spendToken` tx link)*

> "Then the agent tries to send funds to an address that is NOT on the allow-list — and the guardrail
> reverts it before it's even broadcast. A jailbroken prompt cannot get past this."

**[3:20–3:40 · Section 7 — the full loop on Pharosscan]**
> "Finally, the whole loop, already on-chain. A gasless x402 payment settled with one signature — the
> payer spent no gas. That settlement was recorded as a rateable interaction, and the payer's rating moved
> the provider's reputation — reputation you cannot fake, because it costs a real payment."

*(click the three tx links)*

**[closing]**
> "Discover, hire, pay, settle, rate, validate, gate, and leash — thirteen skills, wired together, live on
> Pharos. The only complete ERC-8004 plus ERC-8183 plus AP2 plus x402 stack, where reputation is economic
> and agents are bound by signed intent. That's the suite."

---

### Tips
- Run `node demo.mjs --write` once before recording to warm up (the first oracle call can be slow).
- If you'd rather not broadcast writes, drop `--write` — skip the 6b/6c narration; the already-confirmed
  spend tx is in `DEPLOYMENTS.md` (open it and narrate the same line).
- Keep a Pharosscan tab pre-opened so tx links load instantly.
- Numbers to say out loud: **13 skills, 236 tests, green CI, 11 live contracts, ERC-8004 + ERC-8183 + AP2 + x402**.
- Optional B-roll: open `web/` (the live dashboard) and click "Discover" + the risk-gate sliders.
