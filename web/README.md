# Live dashboard + walkthrough — Pharos Trust-First Agent Suite

Two pages:
- **`demo.html`** — a self-playing, **narrated**, pointer-driven walkthrough of all 13 skills (~3½ min):
  synced captions, an animated pointer that highlights each result, browser voice-over (Web Speech API),
  a live block-height badge, and real on-chain values + Pharosscan links. Press play, or **screen-record
  it** to produce a demo-video file. Controls: ⏯ play/pause, ◀ ▶ scenes, speed, voice toggle, **F** fullscreen.
- **`index.html`** — the live dashboard (below).


A **single-file, zero-backend, read-only** dashboard that proves the suite is live. It calls the
deployed Atlantic contracts directly from the browser via JSON-RPC — no server, no keys, no build step.

What a judge sees in 60 seconds:
- a **live** chainId/block-height pulse (real RPC connection);
- the **Bazaar** discovering services ranked by *on-chain* reputation — the trusted provider beats the
  cheaper one, live;
- the full **discover → pay → settle → rate** loop with clickable Pharosscan tx links;
- an **interactive** Stylus risk gate running the *bit-identical* fixed-point model in the browser;
- the six live contract addresses, with a one-click "verify reputation live" read.

Everything shown is real on Atlantic (chainId 688689). The page never holds a key and only performs
`eth_call` — the same safety posture as the skills.

## Run locally

```bash
# any static server works; or just open the file
npx serve web        # → http://localhost:3000
# or
python -m http.server -d web 3000
```

(Opening `index.html` directly via `file://` also works — it only needs network access to the RPC.)

## Deploy (pick one, all free)

**Vercel**
```bash
npm i -g vercel
cd web && vercel --prod        # framework: "Other", output dir: .
```

**Netlify**
```bash
npm i -g netlify-cli
cd web && netlify deploy --prod --dir .
```

**GitHub Pages** — push the repo, then in *Settings → Pages* set source = `main` / `/web` (or copy
`index.html` to a `gh-pages` branch root). The page is self-contained, so no asset paths break.

## How it works (no dependencies)

All keccak selectors and tag hashes are **precomputed at build time** and hardcoded, so the browser
needs no crypto/ABI library — it only pads/slices hex for `eth_call`:

| call | selector |
|------|----------|
| `getActiveByTag(bytes32)` | `0x4060ff2d` |
| `services(uint256)` | `0xc22c4f43` |
| `scoreOf(address)` | `0x133af456` |
| `ratingCount(address)` | `0x2404165e` |

The risk gate replicates `05-stylus-compute/scripts/lib/score.mjs` exactly (BigInt fixed-point,
SCALE 1e6, weights `[1.5,2.0,1.2,0.8]`, bias `-2.0`, threshold `0.5`) — verified bit-identical to the
CLI (`compute gate`) and the Rust/Stylus source.
