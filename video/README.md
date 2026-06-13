# Demo-video recorder (Playwright)

Generates a real video file of the interactive walkthrough (`web/demo.html`) — deterministic and
headless, so it produces the same video locally or in CI. Useful when the submission wants an uploaded
video file rather than a live URL.

> **Audio note:** Playwright's recorder captures video only (no audio) — the on-screen **captions** carry
> the narration. For a voice-over track, either play `web/demo.html` locally and screen-record with system
> audio, or mux a TTS track onto the `.webm`/`.mp4` with ffmpeg.

## Run locally

```bash
cd video
npm install
npx playwright install chromium      # one-time browser download
npm run record                       # → out/pharos-demo.webm (+ .mp4 if ffmpeg is installed)
```

Options (env): `SPEED=1|1.5|2` (default `2`), `WIDTH`/`HEIGHT` (default `1280x720`).
For a real-time 1× recording: `SPEED=1 npm run record`.

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
