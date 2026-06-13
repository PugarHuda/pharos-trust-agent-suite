#!/usr/bin/env node
// Record web/demo.html to a video file WITH a synced voice-over track.
//
// Pipeline: (1) read the page's plain-text captions, (2) synthesize each with espeak-ng → wav and
// measure its duration, (3) inject those durations back into the page so every scene is on screen for
// exactly its narration length, (4) record the (silent) walkthrough with Playwright, (5) pad each VO
// clip to its scene duration, concatenate with a lead silence, and (6) mux audio + video → mp4.
//
//   cd video && npm install && npx playwright install chromium && node record-vo.mjs
//   (requires: espeak-ng, ffmpeg, ffprobe on PATH — CI installs them)
//
// Env: RATE (espeak words/min, default 168), LEAD (lead silence sec, default 1.2), PAD (per-scene tail
// pad sec, default 0.7), WIDTH/HEIGHT (default 1280x720).

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', 'web');
const OUT = join(HERE, 'out');
const AUD = join(OUT, 'audio');
const RATE = process.env.RATE || '168';
const LEAD = parseFloat(process.env.LEAD || '1.2');
const PAD = parseFloat(process.env.PAD || '0.7');
const WIDTH = parseInt(process.env.WIDTH || '1280', 10);
const HEIGHT = parseInt(process.env.HEIGHT || '720', 10);

const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };
const sh = (cmd, args, opts={}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const need = (cmd) => { const r = sh(cmd, ['-version'] ); if (r.status !== 0 && r.error) { console.error(`missing required tool: ${cmd}`); process.exit(2); } };

// Synthesize `text` → `wav`. Prefers Piper (neural, natural) when PIPER_BIN + PIPER_MODEL exist;
// otherwise falls back to espeak-ng. Returns the engine used, or null on total failure.
const PIPER_BIN = process.env.PIPER_BIN, PIPER_MODEL = process.env.PIPER_MODEL;
function synth(text, wav) {
  if (PIPER_BIN && PIPER_MODEL && existsSync(PIPER_BIN) && existsSync(PIPER_MODEL)) {
    const env = { ...process.env, LD_LIBRARY_PATH: `${dirname(PIPER_BIN)}:${process.env.LD_LIBRARY_PATH || ''}` };
    const r = sh(PIPER_BIN, ['--model', PIPER_MODEL, '--output_file', wav], { input: text, env });
    if (r.status === 0 && existsSync(wav)) return 'piper';
    console.error('piper failed → espeak fallback:', (r.stderr || '').slice(0, 160));
  }
  const r2 = sh('espeak-ng', ['-s', process.env.RATE || '168', '-v', 'en-us+m3', '-z', '-w', wav, text]);
  return (r2.status === 0 && existsSync(wav)) ? 'espeak' : null;
}

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
        const file = join(root, p); if (!file.startsWith(root)) return res.writeHead(403).end();
        await access(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res);
      } catch { res.writeHead(404).end('nf'); }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
function probeDur(file) {
  const r = sh('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1', file]);
  return parseFloat((r.stdout || '0').trim()) || 0;
}

(async () => {
  need('ffmpeg'); need('ffprobe'); // a TTS engine (piper or espeak-ng) is checked per-call in synth()
  await rm(OUT, { recursive: true, force: true });
  await mkdir(AUD, { recursive: true });

  const server = await serve(WEB);
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  // 1) read captions
  const probe = await browser.newPage();
  await probe.goto(`http://127.0.0.1:${port}/demo.html`, { waitUntil: 'load' });
  const captions = await probe.evaluate(() => window.__captions || []);
  await probe.close();
  if (!captions.length) { console.error('no captions found on page'); process.exit(1); }
  console.log(`captions: ${captions.length}`);

  // 2) synthesize + measure; 3) compute per-scene durations (ms)
  const durations = [];
  const segPaths = [];
  let engineUsed = null;
  for (let i = 0; i < captions.length; i++) {
    const wav = join(AUD, `c${i}.wav`);
    const eng = synth(captions[i], wav);
    if (!eng) { console.error('TTS failed (no piper and no espeak-ng available)'); process.exit(1); }
    engineUsed = eng;
    const d = probeDur(wav);
    const sceneSec = Math.max(3.4, d + PAD);
    durations.push(Math.round(sceneSec * 1000));
    // pad the clip to the full scene length (silence tail), normalize format for clean concat
    const seg = join(AUD, `seg${i}.wav`);
    sh('ffmpeg', ['-y','-i', wav, '-af','apad','-t', sceneSec.toFixed(3), '-ar','24000','-ac','1','-c:a','pcm_s16le', seg]);
    segPaths.push(seg);
    console.log(`  scene ${i} [${eng}]: VO ${d.toFixed(1)}s → scene ${sceneSec.toFixed(1)}s`);
  }
  console.log(`voice engine: ${engineUsed}`);

  // build the voice-over track: lead silence + segments
  const lead = join(AUD, 'lead.wav');
  sh('ffmpeg', ['-y','-f','lavfi','-i',`anullsrc=r=24000:cl=mono`,'-t', LEAD.toFixed(3),'-c:a','pcm_s16le', lead]);
  const list = join(AUD, 'list.txt');
  await writeFile(list, [lead, ...segPaths].map(p => `file '${p.replace(/\\/g,'/')}'`).join('\n'));
  const vo = join(OUT, 'vo.wav');
  const cc = sh('ffmpeg', ['-y','-f','concat','-safe','0','-i', list,'-ar','24000','-ac','1','-c:a','pcm_s16le', vo]);
  if (cc.status !== 0) { console.error('concat failed:', cc.stderr); process.exit(1); }

  // 4) record the walkthrough with the exact per-scene durations injected
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
  });
  await context.addInitScript((d) => { window.__durations = d; }, durations);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/demo.html?autoplay=1&mute=1&speed=1`, { waitUntil: 'load' });
  console.log('recording with VO timing…');
  await page.waitForFunction(() => window.WALKTHROUGH_DONE === true, null, { timeout: 480000 });
  await page.waitForTimeout(800);
  const video = page.video();
  await context.close();
  await browser.close();
  server.close();

  const raw = await video.path();
  const webm = join(OUT, 'pharos-demo.webm');
  await rename(raw, webm).catch(() => {});

  // 6) mux audio + video → mp4
  const mp4 = join(OUT, 'pharos-demo.mp4');
  const mux = sh('ffmpeg', ['-y','-i', webm,'-i', vo,
    '-map','0:v:0','-map','1:a:0','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k',
    '-movflags','+faststart','-shortest', mp4]);
  if (mux.status !== 0) { console.error('mux failed:', mux.stderr); process.exit(1); }
  console.log(`✓ done: ${mp4}  (with synced voice-over)`);
})().catch((e) => { console.error(e); process.exit(1); });
