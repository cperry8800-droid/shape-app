// main.mjs — Nora's engine as a service: polls Shape for her next set and plays it into the
// station's live input. The logic is in engine.mjs; this file wires the real world to it:
// fetch for the Shape API, ffmpeg for decoding the songs and for the live stream.
//
// Environment (README.md says where each comes from):
//   SHAPE_URL           https://www.theshapecommunity.com
//   NORA_ENGINE_TOKEN   the same secret as the Shape app's NORA_ENGINE_TOKEN
//   NORA_STREAM_URL     the station's live input, icecast://user:password@host:port/mount
//                       (or a file path to record a set instead, for a test)
//   NORA_BITRATE        optional, default 192k
//   NORA_LEGACY_ICECAST optional, 1 for a server that takes only the old SOURCE method
//   FFMPEG              optional, default ffmpeg
//   NORA_POLL_SEC       optional, default 20

import { spawn } from 'node:child_process';
import { pollOnce, SAMPLE_RATE } from './engine.mjs';

const env = (k, d) => (process.env[k] && process.env[k].trim()) || d;
const SHAPE_URL = env('SHAPE_URL', '').replace(/\/+$/, '');
const TOKEN = env('NORA_ENGINE_TOKEN', '');
const STREAM_URL = env('NORA_STREAM_URL', '');
const BITRATE = env('NORA_BITRATE', '192k');
const FFMPEG = env('FFMPEG', 'ffmpeg');
const POLL_MS = Number(env('NORA_POLL_SEC', '20')) * 1000;
const LEGACY = env('NORA_LEGACY_ICECAST', '') === '1';

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);
// Never print the stream URL: it carries the station's password.
const redact = (s) => String(s).replace(/\/\/[^@/]*@/, '//***@');

async function api(method, body) {
  const res = await fetch(`${SHAPE_URL}/api/radio/nora/engine`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Shape answered ${res.status}`);
  return res.json();
}

/** Decode a song (a signed URL) to 44.1 kHz stereo 16-bit, split into channels. */
export function decode(url, { ffmpeg = FFMPEG, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-v', 'error', '-i', url, '-f', 's16le', '-ac', '2', '-ar', String(SAMPLE_RATE), '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('decode timed out')); }, timeoutMs);
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${redact(err).slice(0, 200)}`));
      const buf = Buffer.concat(chunks);
      const all = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2));
      const n = Math.floor(all.length / 2);
      const left = new Int16Array(n), right = new Int16Array(n);
      for (let i = 0; i < n; i++) { left[i] = all[2 * i]; right[i] = all[2 * i + 1]; }
      resolve({ sampleRate: SAMPLE_RATE, left, right });
    });
  });
}

/** The live output: ffmpeg encoding MP3 into the station's Icecast input (or into a file). */
export function openOutput({ ffmpeg = FFMPEG, target = STREAM_URL, bitrate = BITRATE, legacy = LEGACY } = {}) {
  const live = /^icecast:\/\//.test(target);
  const args = ['-hide_banner', '-v', 'error', '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '2', '-i', '-',
    '-c:a', 'libmp3lame', '-b:a', bitrate, '-f', 'mp3'];
  if (live) args.push('-content_type', 'audio/mpeg', '-ice_name', 'Shape Radio', '-ice_description', 'Nora · DJ set', ...(legacy ? ['-legacy_icecast', '1'] : []));
  else args.push('-y');
  args.push(target);
  const p = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let alive = true, err = '';
  p.stderr.on('data', (c) => { err += c; });
  p.on('close', (code) => { alive = false; if (code) log(`stream ended with ${code}: ${redact(err).slice(0, 300)}`); });
  p.stdin.on('error', () => { alive = false; });
  return {
    // ⚠ A WRITE SETTLES WHEN FFMPEG EXITS, not only on 'drain'. A station that refuses the source
    // or drops the line kills ffmpeg while the pipe is full; waiting on 'drain' alone hung the
    // engine for good (measured against a stand-in Icecast input) instead of handing back to the
    // AutoDJ.
    write(pcm) {
      if (!alive) return Promise.resolve(false);
      const buf = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      return new Promise((resolve) => {
        const settle = (v) => { p.off('close', onClose); p.stdin.off('drain', onDrain); resolve(v); };
        const onClose = () => settle(false);
        const onDrain = () => settle(alive);
        if (p.stdin.write(buf)) return resolve(alive);
        p.once('close', onClose);
        p.stdin.once('drain', onDrain);
      });
    },
    close({ timeoutMs = 15000 } = {}) {
      return new Promise((resolve) => {
        if (!alive) return resolve();
        const timer = setTimeout(() => { p.kill('SIGKILL'); resolve(); }, timeoutMs);
        p.once('close', () => { clearTimeout(timer); resolve(); });
        p.stdin.end();
      });
    },
  };
}

export const realDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  fetchJob: () => api('GET'),
  report: (event) => api('POST', event).catch((e) => log(`report failed: ${e.message}`)),
  decode: (url) => decode(url),
  openOutput: () => openOutput(),
  log,
};

async function main() {
  if (!SHAPE_URL || !TOKEN || !STREAM_URL) {
    console.error('Set SHAPE_URL, NORA_ENGINE_TOKEN and NORA_STREAM_URL (see README.md).');
    process.exit(2);
  }
  log(`Nora's engine: polling ${SHAPE_URL} every ${POLL_MS / 1000} s; streaming to ${redact(STREAM_URL)}`);
  const state = { running: null, done: new Set() };
  for (;;) {
    const step = await pollOnce(state, realDeps);
    if (step.action === 'started') {
      log(`set ${step.setId}: on the air`);
      step.result.then((r) => log(`set ${step.setId}: ${r.ok ? 'finished' : `stopped (${r.reason})`}, ${r.played.length} songs`));
    } else if (step.action === 'error') log(`could not reach Shape: ${step.error}`);
    await realDeps.sleep(POLL_MS);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
