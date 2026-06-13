#!/usr/bin/env node
// Combine the narrated walkthrough (pharos-demo.mp4, with voice-over) and the real-terminal recording
// (pharos-terminal.mp4, silent) into one video: Part 1 (VO overview) → short divider → Part 2 (live
// terminal). Normalizes both to 1280x720/30fps with stereo AAC (silent audio synthesized for the
// terminal part) so the concat is clean. Requires ffmpeg + ffprobe.
//
//   node combine.mjs            # → out/pharos-combined.mp4
//   VO=path TERM=path node combine.mjs

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const VO = process.env.VO || join(OUT, 'pharos-demo.mp4');
const TERM = process.env.TERM || join(OUT, 'pharos-terminal.mp4');
const COMBINED = join(OUT, 'pharos-combined.mp4');
const W = 1280, H = 720, FPS = 30, BG = '0x070b12';
const NORM = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1,fps=${FPS}`;

const run = (args, label) => {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`ffmpeg failed: ${label}`); process.exit(1); }
};
function dur(f) {
  const r = spawnSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1', f], { encoding: 'utf8' });
  return parseFloat((r.stdout || '0').trim()) || 0;
}

for (const f of [VO, TERM]) if (!existsSync(f)) { console.error(`missing input: ${f}`); process.exit(2); }

const segVo = join(OUT, 'seg_vo.mp4'), div = join(OUT, 'seg_div.mp4'), segTerm = join(OUT, 'seg_term.mp4');

// Part 1: narrated walkthrough (keep its voice-over)
run(['-i', VO, '-vf', NORM, '-r', String(FPS), '-af', 'aresample=44100', '-ar', '44100', '-ac', '2',
     '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', segVo], 'normalize VO');

// 1.5s divider (black, silent)
run(['-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=${FPS}`, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
     '-t', '1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', div], 'divider');

// Part 2: real terminal (silent → synthesize matching silent audio)
const td = dur(TERM) || 60;
run(['-i', TERM, '-f', 'lavfi', '-t', td.toFixed(3), '-i', 'anullsrc=r=44100:cl=stereo',
     '-vf', NORM, '-r', String(FPS), '-map', '0:v:0', '-map', '1:a:0',
     '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', segTerm], 'normalize terminal');

// concat (re-encode for a clean join)
const list = join(OUT, 'concat.txt');
await writeFile(list, [segVo, div, segTerm].map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
run(['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
     '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', COMBINED], 'concat');

console.log(`✓ combined: ${COMBINED}  (Part 1 narrated walkthrough → Part 2 live terminal)`);
