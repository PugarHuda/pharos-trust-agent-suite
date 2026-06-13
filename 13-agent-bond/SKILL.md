---
name: agent-bond
description: >-
  Sybil resistance through skin-in-the-game. ERC-8004's security guidance recommends "registration
  bonds" / "require a minimum stake" so agent identities are not free to mint. agent-bond is that
  friction as a reusable primitive: an agent locks a native bond, and any consumer (reputation-gate,
  bazaar, mesh) can require a minimum active bond before trusting it. An unbonding cooldown means capital
  can't be instantly recycled across fake identities. Use to add an economic cost to creating a trusted
  agent identity.
  Triggers on "stake bond agent pharos", "sybil resistance agent reputation", "minimum stake to
  participate", "registration bond agent", "skin in the game agent identity".
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
  network: pharos-atlantic-testnet
  chainId: 688689
  contract: "0xC59113F22BE46624D8ceFC4A030bCC098a8953Af"
---

# Agent Bond

Public reputation signals are only as good as their resistance to fake identities. ERC-8004's own
security notes are explicit: reduce manipulation by requiring reviewers/agents to "hold a minimum stake"
or post "registration bonds." **agent-bond** is that friction, packaged as a composable primitive — and
it's deliberately **admin-free**: there is no slashing authority (which would require a trusted admin).
The deterrent is the *locked capital plus an unbonding cooldown*, so to operate N trusted identities you
must lock N bonds simultaneously and wait out the cooldown to recycle capital. Sybils stop being free.

## How it works

```
agent ── bondUp() ───────────────────►  locks native PHRS as active stake
consumer ── requireBond(agent, min) ──►  reverts unless the agent's active bond ≥ min
agent ── requestUnbond(amount) ───────►  active bond drops IMMEDIATELY; funds start a cooldown
agent ── claimUnbond() ───────────────►  after the cooldown, pull the funds back
```

The instant an agent requests an exit, its **active bond drops** — so a consumer checking `bondOf`
never sees stake that's already on its way out.

## Commands

```bash
bond deploy  --cooldown 3600
bond up      --bond 0x.. --amount 0.01
bond status  --bond 0x.. --agent 0x..
bond check   --bond 0x.. --agent 0x.. --min 0.005     # TRUSTED / BLOCK verdict
bond unbond  --bond 0x.. --amount 0.01                # start exit (active bond drops now)
bond claim   --bond 0x..                              # after the cooldown
```

Key from a gitignored `.env`: `$AGENT_PRIVATE_KEY`. Global: `--network atlantic-testnet`.

## How it composes

- **`reputation-gate` + `agent-bond`:** require *both* a reputation score and a minimum bond — a paid
  track record *and* capital at risk — before funding a counterparty.
- **`a2a-mesh` / `pharos-bazaar`:** filter discovery to bonded providers, so an agent only hires peers
  with skin in the game.
- **`agent-validation`:** require validators to be bonded, raising the cost of a colluding validator.

## Security posture

- **Admin-free, no slashing** (no trusted operator); pull-payment `claimUnbond` with a reentrancy guard;
  effects before the single external call.
- Active bond is reduced *before* funds are queued for exit, so trust checks can't be gamed mid-exit.
- 10 tests on an in-memory EVM (bonding, trust checks, cooldown, double-claim, reentrancy, independence).

## Live on Atlantic (chainId 688689)

`AgentBond` → [`0xC59113F22BE46624D8ceFC4A030bCC098a8953Af`](https://atlantic.pharosscan.xyz/address/0xC59113F22BE46624D8ceFC4A030bCC098a8953Af)
(cooldown 3600s). Proven on-chain: an agent bonded 0.002 PHRS (`check` → TRUSTED at min 0.001, BLOCK at
min 0.01), then requested an unbond of 0.001 — active bond dropped to 0.001 immediately. Tx in `DEPLOYMENTS.md`.
