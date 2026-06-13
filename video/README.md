# Demo-video recorder (Playwright)

Generates a real video file of the interactive walkthrough (`web/demo.html`) — deterministic and
headless, so it produces the same video locally or in CI. Useful when the submission wants an uploaded
video file rather than a live URL.

> **Voice-over:** `record-vo.mjs` builds a **synced voice-over** track. It prefers **Piper** (neural,
> natural-sounding) when `PIPER_BIN` + `PIPER_MODEL` are set, and falls back to **espeak-ng** otherwise.
> The GitHub Action downloads Piper + a voice model automatically (default `en_US-lessac-medium`). The
> plain silent recorder is `record.mjs`.

## Run locally

```bash
cd video
npm install
npx playwright install chromium      # one-time browser download
npm run record                       # silent → out/pharos-demo.webm (+ .mp4 if ffmpeg)
npm run record:vo                    # WITH voice-over → out/pharos-demo.mp4 (needs ffmpeg + a TTS engine)
```

Options (env): `SPEED=1|1.5|2` (default `2`, silent recorder), `WIDTH`/`HEIGHT` (default `1280x720`).
For natural voice locally, point Piper at a model: `PIPER_BIN=/path/piper PIPER_MODEL=/path/voice.onnx npm run record:vo`
(otherwise it uses espeak-ng if installed). The silent recorder takes `SPEED=1` for a real-time 1× video.

## Run in GitHub Actions (no local setup)

The workflow **`.github/workflows/demo-video.yml`** runs this on demand and uploads the `.mp4` as a
downloadable artifact:

1. GitHub → **Actions** → **demo-video** → **Run workflow**.
2. When it finishes, open the run and download the **pharos-demo** artifact (contains `pharos-demo.mp4`).

The runner has ffmpeg preinstalled, so you always get an `.mp4`. This means anyone — including judges —
can reproduce the exact video from the public repo.

## How it works

`record.mjs` serves `../web` on a local port, opens `demo.html?autoplay=1&mute=1&speed=$SPEED`, waits for
the page's `window.WALKTHROUGH_DONE` hook, then closes the Playwright context to flush the recording.
Every value shown is real (the page reads the live Chainlink price and embeds real on-chain tx hashes).
