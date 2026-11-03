// Shape Radio's own station, end to end against a REAL Icecast (services/station): the station's
// config as entrypoint.sh writes it, the standby loop, and Nora's engine (NORA_MODE=station, real
// ffmpeg) playing a block a stand-in Shape hands it, heard by one listener who stays connected the
// whole time: the loop before the music, the music, the loop after it, and no silence between.
//
// It needs icecast2 and ffmpeg, so it skips where they are missing (CI's runners); run it where they
// are (`apt-get install icecast2 ffmpeg`). As root it runs Icecast as `nobody`: Icecast refuses root.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chownSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeStream } from '../src/lib/radio/station.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HAS = spawnSync('icecast2', ['-v']).status === 0 && spawnSync('ffmpeg', ['-version']).status === 0;
// Stand-in passwords, plainly not real ones (the secret scan reads tests too).
const SOURCE_PW = 's'.repeat(24);
const ADMIN_PW = 'a'.repeat(24);
const TOKEN = 't'.repeat(40);
const BLOCK_ID = 'cccccccc-1111-4111-8111-111111111111';
const TA = 'aaaaaaaa-1111-4111-8111-111111111111';
const TB = 'bbbbbbbb-2222-4222-8222-222222222222';
const SR = 44100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toneWav(hz, sec) {
  const n = SR * sec, pcm = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const q = Math.round(0.3 * Math.sin(2 * Math.PI * hz * (i / SR)) * 32767);
    pcm.writeInt16LE(q, i * 4); pcm.writeInt16LE(q, i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Energy at `hz` in a window of 8 kHz mono samples (Goertzel). */
function tone(x, hz) {
  const w = (2 * Math.PI * hz) / 8000, c = 2 * Math.cos(w);
  let a = 0, b = 0;
  for (const v of x) { const y = v / 32768 + c * a - b; b = a; a = y; }
  return Math.sqrt(Math.max(0, a * a + b * b - c * a * b)) / x.length;
}

const freePort = () => new Promise((resolve) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

test('the station end to end: the standby loop, the engine\'s music, the loop again, one listener throughout, never silence', { skip: HAS ? false : 'needs icecast2 and ffmpeg', timeout: 240000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'shape-station-'));
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const nobody = asRoot ? Number(spawnSync('id', ['-u', 'nobody']).stdout.toString().trim()) : null;
  if (asRoot) chownSync(dir, nobody, -1);
  const port = await freePort();
  const procs = [];
  const run = (cmd, args, env) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (c) => { err += c; });
    p.stdout.on('data', () => {});
    procs.push(p);
    return { p, get err() { return err; } };
  };
  const status = async () => {
    try { return (await (await fetch(`http://127.0.0.1:${port}/status-json.xsl`)).json()).icestats; } catch { return null; }
  };
  // The stand-in Shape: one block, starting a few seconds after the engine first asks; then nothing.
  const songs = { [TA]: toneWav(1000, 20), [TB]: toneWav(2000, 20) };
  let block = null;
  const reports = [], asks = [];
  const shape = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (u.pathname.startsWith('/song/')) { res.writeHead(200, { 'content-type': 'audio/wav' }); res.end(songs[u.pathname.slice(6)]); return; }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { error: 'Unauthorized' });
    if (req.method === 'POST') { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { reports.push(JSON.parse(b)); json(200, { ok: true }); }); return; }
    const now = Date.now();
    if (u.searchParams.get('check')) return json(200, { ok: true });
    asks.push({ after: u.searchParams.get('after'), skip: u.searchParams.get('skip') });
    if (!block) {
      const startsAt = new Date(now + 6000).toISOString();
      block = {
        nowMs: now,
        block: { id: BLOCK_ID, startsAt, durationSec: 38 },
        programme: {
          startsAt, durationSec: 38, endsSec: 38, items: [
            { trackId: TA, title: 'A', artist: 'X', startSec: 0, cueInSec: 0, cueOutSec: 20, endSec: 20, rate: 1, gainDb: 0, bpm: null, mixIn: { type: 'open', lengthSec: 0 } },
            { trackId: TB, title: 'B', artist: 'Y', startSec: 18, cueInSec: 0, cueOutSec: 20, endSec: 38, rate: 1, gainDb: 0, bpm: null, mixIn: { type: 'blend', lengthSec: 2 } },
          ],
        },
        sources: { [TA]: `http://127.0.0.1:${shapePort}/song/${TA}`, [TB]: `http://127.0.0.1:${shapePort}/song/${TB}` },
      };
      return json(200, block);
    }
    const end = Date.parse(block.block.startsAt) + 38000;
    if (now < end - 1000 && !(u.searchParams.get('skip') || '').includes(BLOCK_ID) && !u.searchParams.get('after')) return json(200, { ...block, nowMs: now });
    return json(200, { nowMs: now, set: null, block: null, reason: 'empty_library' });
  });
  const shapePort = await new Promise((r) => shape.listen(0, '127.0.0.1', () => r(shape.address().port)));

  try {
    // 1. The server, as the container starts it.
    const iceEnv = { ICECAST_SOURCE_PASSWORD: SOURCE_PW, ICECAST_ADMIN_PASSWORD: ADMIN_PW, STATION_HOST: 'localhost', ICECAST_PORT: String(port), ICECAST_CONFIG: join(dir, 'icecast.xml'), ICECAST_LOG_DIR: dir };
    const entry = join(ROOT, 'services/station/icecast/entrypoint.sh');
    const ice = asRoot
      ? run('runuser', ['-u', 'nobody', '--', 'env', ...Object.entries(iceEnv).map(([k, v]) => `${k}=${v}`), 'sh', entry], {})
      : run('sh', [entry], iceEnv);
    for (let i = 0; i < 50 && !(await status()); i++) await sleep(200);
    assert.ok(await status(), `Icecast answers (${ice.err.slice(0, 300)})`);

    // 2. The standby loop. A listener on /live with no music is served the loop.
    run('sh', [join(ROOT, 'services/station/standby/standby.sh')], { ICECAST_SOURCE_PASSWORD: SOURCE_PW, ICECAST_HOST: `127.0.0.1:${port}`, TMPDIR: dir });
    await sleep(5000);

    // ⚠ THE PLAYERS LOAD THE STREAM WITH crossOrigin="anonymous" (their analysers need it), so a
    // response without exactly one Access-Control-Allow-Origin is no stream at all to a browser:
    // missing, it is refused; doubled ("*, *"), it is refused too. Measured: Icecast's top-level
    // <http-headers> never reached a listener; each mount carries its own.
    const corsOf = async () => {
      const res = await fetch(`http://127.0.0.1:${port}/live`, { headers: { Origin: 'https://www.theshapecommunity.com' }, signal: AbortSignal.timeout(4000) });
      const out = [res.status, res.headers.get('content-type'), res.headers.get('access-control-allow-origin')];
      try { await res.body.cancel(); } catch { /* headers only */ }
      return out;
    };
    assert.deepEqual(await corsOf(), [200, 'audio/mpeg', '*'], 'the standby loop, as a browser asks for it');
    // And the dashboard's own check of the stream passes it, on this real server.
    assert.deepEqual(await probeStream(`http://127.0.0.1:${port}/live`), { ok: true }, 'the dashboard\'s check');

    // 3. One listener, from before the music to after it.
    const listener = run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', `http://127.0.0.1:${port}/live`, '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], {});
    const chunks = [];
    let listenerEnded = false;
    listener.p.stdout.on('data', (c) => chunks.push(c));
    listener.p.on('close', () => { listenerEnded = true; });
    await sleep(4000);

    // 4. The engine, on the station.
    const engine = run('node', [join(ROOT, 'services/nora-engine/main.mjs')], {
      SHAPE_URL: `http://127.0.0.1:${shapePort}`, NORA_ENGINE_TOKEN: TOKEN, NORA_MODE: 'station',
      NORA_STREAM_URL: `icecast://source:${SOURCE_PW}@127.0.0.1:${port}/live`,
    });
    const titles = [];
    let corsLive = null;
    const until = Date.now() + 6000 + 38000 + 14000;
    while (Date.now() < until) {
      if (!corsLive && titles.length) corsLive = await corsOf();
      const st = await status();
      const srcs = st && st.source ? [].concat(st.source) : [];
      const live = srcs.find((s) => /\/live$/.test(s.listenurl || ''));
      if (live && live.title && titles.at(-1) !== live.title) titles.push(live.title);
      await sleep(500);
    }
    assert.equal(listenerEnded, false, `the listener was never dropped (${listener.err.slice(0, 300)})`);
    assert.deepEqual(corsLive, [200, 'audio/mpeg', '*'], 'the music, as a browser asks for it');

    // What the listener heard, second by second.
    const buf = Buffer.concat(chunks);
    const x = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2));
    const heard = [];
    for (let i = 0; i + 8000 <= x.length; i += 8000) {
      const w = x.subarray(i, i + 8000);
      let s = 0; for (const v of w) s += v * v;
      const rms = Math.sqrt(s / w.length) / 32768;
      const k = tone(w, 1000), m = tone(w, 2000), pad = tone(w, 110) + tone(w, 220);
      heard.push(rms < 0.005 ? 'silence' : k > 0.05 && k > m ? 'A' : m > 0.05 ? 'B' : pad > 0.01 ? 'standby' : 'other');
    }
    const runs = heard.reduce((acc, h) => { if (acc.at(-1)?.h === h) acc.at(-1).n++; else acc.push({ h, n: 1 }); return acc; }, []);
    t.diagnostic(`heard, a second at a time: ${runs.map((r) => `${r.h}×${r.n}`).join(' ')}`);
    const story = runs.filter((r) => r.n >= 2 || r.h === 'silence').map((r) => r.h);
    assert.deepEqual(story.filter((h) => h !== 'other'), ['standby', 'A', 'B', 'standby'], `heard: ${runs.map((r) => `${r.h}×${r.n}`).join(' ')}`);
    assert.ok(heard.filter((h) => h === 'silence').length <= 1, `never silence (heard: ${runs.map((r) => `${r.h}×${r.n}`).join(' ')})`);
    assert.ok(runs.find((r) => r.h === 'A').n >= 15 && runs.find((r) => r.h === 'B').n >= 15, `each song played through (${runs.map((r) => `${r.h}×${r.n}`).join(' ')})`);

    // The station's title followed the songs, and the engine reported the block to Shape.
    t.diagnostic(`the station's titles: ${titles.join(' | ')}`);
    assert.deepEqual(titles, ['X - A', 'Y - B'], `titles: ${titles.join(' | ')}; engine: ${engine.err.slice(0, 300)}`);
    for (let i = 0; i < 20 && !reports.some((r) => r.event === 'ended'); i++) await sleep(250);
    assert.deepEqual(reports.map((r) => [r.event, r.blockId, r.trackId || null]), [
      ['started', BLOCK_ID, null], ['song', BLOCK_ID, TA], ['song', BLOCK_ID, TB], ['ended', BLOCK_ID, null],
    ]);
    // It asked for what came next before the block ended, and named the block it had finished.
    assert.ok(asks.some((a) => a.after && Math.abs(Date.parse(a.after) - (Date.parse(block.block.startsAt) + 38000)) < 1500), JSON.stringify(asks));
    assert.ok(asks.some((a) => (a.skip || '').includes(BLOCK_ID)), JSON.stringify(asks));
  } finally {
    for (const p of procs.reverse()) { try { p.kill('SIGTERM'); } catch { /* gone */ } }
    // runuser's child (Icecast) and the standby loop's ffmpeg outlive their parents' SIGTERM.
    spawnSync('pkill', ['-f', `127.0.0.1:${port}/`]);
    spawnSync('pkill', ['-f', `icecast2 -c ${join(dir, 'icecast.xml')}`]);
    shape.close();
    await sleep(500);
    rmSync(dir, { recursive: true, force: true });
  }
});
