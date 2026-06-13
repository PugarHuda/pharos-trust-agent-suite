#!/usr/bin/env node
// Record web/demo.html to a video file with Playwright — deterministic, headless, CI-friendly.
// Serves ../web on a local port, drives the walkthrough via ?autoplay=1&mute=1, waits for the page's
// WALKTHROUGH_DONE hook, then flushes the recording. Produces out/pharos-demo.webm (and .mp4 if ffmpeg
// is on PATH). No audio — Playwright video is silent; the on-screen captions carry the narration.
//
//   cd video && npm install && npx playwright install chromium && npm run record
//
// Env: SPEED=1|1.5|2 (default 2 for a snappier artifact), WIDTH/HEIGHT (default 1280x720).

import http from 'node:http';
import { readFile, mkdir, rename, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', 'web');
const OUT = join(HERE, 'out');
const SPEED = process.env.SPEED || '2';
const WIDTH = parseInt(process.env.WIDTH || '1280', 10);
const HEIGHT = parseInt(process.env.HEIGHT || '720', 10);

const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css',
  '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/' ) p = '/index.html';
        const file = join(root, p);
        if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
        await access(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res);
      } catch { res.writeHead(404).end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const has = (cmd) => { try { return spawnSync(cmd, ['-version'], { stdio: 'ignore' }).status === 0; } catch { return false; } };

(async () => {
  await mkdir(OUT, { recursive: true });
  const server = await serve(WEB);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/demo.html?autoplay=1&mute=1&speed=${SPEED}`;
  console.log(`serving ${WEB} → ${url}`);

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });

  console.log('recording… waiting for the walkthrough to finish');
  await page.waitForFunction(() => window.WALKTHROUGH_DONE === true, null, { timeout: 360000 });
  await page.waitForTimeout(1500); // let the closing scene linger

  const video = page.video();
  await context.close();           // flushes the .webm
  await browser.close();
  server.close();

  const raw = await video.path();
  const webm = join(OUT, 'pharos-demo.webm');
  await rename(raw, webm).catch(() => {});
  console.log(`✓ video: ${webm}`);

  if (has('ffmpeg')) {
    const mp4 = join(OUT, 'pharos-demo.mp4');
    const r = spawnSync('ffmpeg', ['-y', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
      { stdio: 'inherit' });
    if (r.status === 0) console.log(`✓ mp4:   ${mp4}`);
  } else {
    console.log('(ffmpeg not found — keeping .webm; install ffmpeg to also get .mp4)');
  }
})().catch((e) => { console.error(e); process.exit(1); });
