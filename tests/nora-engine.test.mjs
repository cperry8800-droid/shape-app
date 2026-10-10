// Nora's engine (services/nora-engine): the mixer that plays her planned set exactly as planned,
// the engine that runs a set against Shape's clock and fails to the station's AutoDJ (never to
// silence), its real ffmpeg wiring into an Icecast input, and Shape's side of it
// (src/lib/radio/noraEngineApi.mjs, the token-gated route, the play report).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer as createNetServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMixer, envelopeAt, softClip } from '../services/nora-engine/mixer.mjs';
import { pollOnce, runSet, SAMPLE_RATE } from '../services/nora-engine/engine.mjs';
import { decode, openOutput } from '../services/nora-engine/main.mjs';
import { analyzeTrack } from '../public/newdesign/booth/trackAnalysis.mjs';
import { profileTrack } from '../src/lib/radio/trackProfile.mjs';
import { planSet } from '../src/lib/radio/noraPlanner.mjs';
import { engineJob, monthRange, playsCsv, recordEngineEvent } from '../src/lib/radio/noraEngineApi.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SR = 44100;
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
const SET_ID = '11111111-2222-4333-8444-555555555555';
const T1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const T2 = 'bbbbbbbb-2222-4222-8222-222222222222';

// ── Synthetic songs ────────────────────────────────────────────────────────────────────────
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
function houseSong(bpm, dur, { kickFrom = 8 } = {}) {
  const n = SR * dur, x = new Float32Array(n), beat = 60 / bpm;
  const prog = [[57, 60, 64], [53, 57, 60], [52, 56, 59], [57, 60, 64]];
  for (let i = 0; i < n; i++) {
    const t = i / SR, b = Math.floor(t / beat), tb = t - b * beat;
    let s = 0;
    if (t > kickFrom && t < dur - 12) s += 0.8 * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-tb * 30)) * tb) * Math.exp(-tb * 8);
    for (const m of prog[Math.floor(b / 4) % 4]) s += 0.06 * Math.sin(2 * Math.PI * midiHz(m) * t);
    x[i] = s * 0.6 * (t > dur - 10 ? (dur - t) / 10 : 1);
  }
  return x;
}

// Two songs, measured the way the library measures them, planned the way Nora plans them.
const A = houseSong(124, 150), B = houseSong(126, 150);
const TRACKS = [
  { id: T1, title: 'A', artist: 'X', album: null, analysis: profileTrack([A], SR) },
  { id: T2, title: 'B', artist: 'Y', album: null, analysis: profileTrack([B], SR) },
];
let PROGRAMME;
for (let k = 0; k < 60 && !PROGRAMME; k++) {
  const p = planSet({ tracks: TRACKS, set: { id: `s${k}`, startsAt: '2026-10-12T18:00:00.000Z', durationMin: 30 } });
  if (p.items[0].trackId === T1 && p.items.length === 2) PROGRAMME = p;
}
const pcmOf = (id) => ({ sampleRate: SR, left: id === T1 ? A : B, right: id === T1 ? A : B });
const SOURCES = PROGRAMME.items.map((it) => pcmOf(it.trackId));

function renderAll(programme, sources, block = 4096) {
  const mix = createMixer(programme, { sampleRate: SR });
  const total = Math.ceil(programme.endsSec * SR);
  const out = new Float32Array(total * 2);
  for (let f = 0; f < total; f += block) out.set(mix.render(f / SR, Math.min(block, total - f), sources), f * 2);
  return out;
}
const leftOf = (inter) => { const l = new Float32Array(inter.length / 2); for (let i = 0; i < l.length; i++) l[i] = inter[2 * i]; return l; };

// ── The mixer ──────────────────────────────────────────────────────────────────────────────
test('the planned transition is a beat-matched blend', () => {
  const [a, b] = PROGRAMME.items;
  assert.equal(b.mixIn.type, 'beatmatch');
  assert.ok(Math.abs(b.rate - 124 / 126) < 1e-4, `B is played at the locking rate (${b.rate})`);
  assert.ok(b.startSec < a.endSec, 'they overlap');
});

test('⚠ the beat holds steady through the mix: one grid across the outgoing song, the blend and the incoming one', () => {
  const L = leftOf(renderAll(PROGRAMME, SOURCES));
  const b = PROGRAMME.items[1];
  const seg = L.slice(Math.floor((b.startSec - 40) * SR), Math.floor((b.startSec + b.mixIn.lengthSec + 40) * SR));
  const m = analyzeTrack([seg], SR);
  assert.equal(m.bpm, 124, 'the incoming song plays at the outgoing tempo');
  assert.ok(m.confidence > 0.9, `one confident grid (${m.confidence})`);
  assert.ok(m.residualMs < 3, `beats within ${m.residualMs} ms of the grid`);
  // The same segment with the incoming song at its own speed has no single grid.
  const wrong = structuredClone(PROGRAMME);
  wrong.items[1].rate = 1;
  const W = leftOf(renderAll(wrong, SOURCES)).slice(Math.floor((b.startSec - 40) * SR), Math.floor((b.startSec + b.mixIn.lengthSec + 40) * SR));
  const w = analyzeTrack([W], SR);
  assert.ok(w.bpm == null || w.residualMs > m.residualMs * 3 || w.confidence < m.confidence - 0.2, 'unmatched, the grid breaks (so the check above is not vacuous)');
});

test('the bass swaps: the low end of the blend is one song’s, not two', () => {
  const b = PROGRAMME.items[1];
  const L = leftOf(renderAll(PROGRAMME, SOURCES));
  const lowRms = (t0, t1) => {
    let y = 0, s = 0, c = 0;
    const al = 1 - Math.exp((-2 * Math.PI * 100) / SR);
    for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) { y += al * (L[i] - y); s += y * y; c++; }
    return Math.sqrt(s / c);
  };
  const before = lowRms(b.startSec - 20, b.startSec - 2);
  const quarter = b.mixIn.lengthSec / 4;
  const during = Math.max(lowRms(b.startSec + 0.5, b.startSec + 2 * quarter - 0.5), lowRms(b.startSec + 2 * quarter + 0.5, b.startSec + 4 * quarter - 0.5));
  assert.ok(during < before * 1.3, `low end ${during.toFixed(3)} against ${before.toFixed(3)} before`);
  const env = (t) => [envelopeAt(PROGRAMME.items, 0, t), envelopeAt(PROGRAMME.items, 1, t)];
  const [oA, iA] = env(b.startSec + quarter);
  assert.deepEqual([oA.low, iA.low], [1, 0], 'first half: the outgoing bass only');
  const [oB, iB] = env(b.startSec + 3 * quarter);
  assert.deepEqual([oB.low, iB.low], [0, 1], 'second half: the incoming bass only');
});

test('blocks join seamlessly, the sum never clips, and a missing song is silence (never used on air)', () => {
  const span = { ...PROGRAMME, endsSec: PROGRAMME.items[1].startSec + 20 };
  const one = renderAll(span, SOURCES, Math.ceil(span.endsSec * SR));
  const many = renderAll(span, SOURCES, 1000);
  let worst = 0;
  for (let i = 0; i < one.length; i++) worst = Math.max(worst, Math.abs(one[i] - many[i]));
  assert.ok(worst < 1e-6, `block size changes nothing (${worst})`);
  const loud = structuredClone(PROGRAMME);
  for (const it of loud.items) it.gainDb = 18;
  let peak = 0;
  for (const v of renderAll(loud, SOURCES)) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 1, `peak ${peak}`);
  assert.equal(softClip(0.5), 0.5);
  assert.ok(softClip(5) <= 1 && softClip(5) > 0.99);
  assert.ok(softClip(0.95) < 0.95 && softClip(0.95) > 0.9, 'the knee bends above 0.9');
  const silent = renderAll({ ...PROGRAMME, endsSec: 5 }, [null, null]);
  assert.ok(silent.every((v) => v === 0));
});

test('a last song with fadeOutSec fades to nothing at the end', () => {
  const p = structuredClone(PROGRAMME);
  const last = p.items[1];
  last.endSec = last.startSec + 60; last.fadeOutSec = 8; p.endsSec = last.endSec;
  assert.equal(envelopeAt(p.items, 1, last.endSec - 0.001).vol < 0.001, true);
  assert.ok(Math.abs(envelopeAt(p.items, 1, last.endSec - 4).vol - 0.5) < 1e-9);
  assert.equal(envelopeAt(p.items, 1, last.endSec).vol, 0);
});

// ── The engine, against a fake clock ───────────────────────────────────────────────────────
function harness({ startInSec = 5, decodeFails = [], writeFailsAt = null, decodeDelayMs = 0 } = {}) {
  let clock = 1_000_000;
  const events = [], loads = [];
  let written = 0, closed = 0;
  const startsAt = new Date(clock + startInSec * 1000).toISOString();
  const job = { set: { id: SET_ID, startsAt }, programme: PROGRAMME, sources: { [T1]: 'u1', [T2]: 'u2' }, serverNowMs: clock, localAtFetchMs: clock };
  const deps = {
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    decode: async (url) => {
      loads.push({ url, at: clock });
      if (decodeDelayMs) clock += decodeDelayMs;
      if (decodeFails.includes(url)) throw new Error('404');
      return pcmOf(url === 'u1' ? T1 : T2);
    },
    openOutput: () => ({
      write: async (pcm) => { written += pcm.length / 2; return writeFailsAt == null || written / SR < writeFailsAt; },
      close: async () => { closed++; },
    }),
    report: async (e) => { events.push(e); },
  };
  return { job, deps, events, loads, get written() { return written; }, get closed() { return closed; }, get clock() { return clock; } };
}

test('a set plays start to finish on Shape’s clock, and every song is reported as it starts', async () => {
  const h = harness();
  const r = await runSet(h.job, h.deps);
  assert.deepEqual([r.ok, r.played], [true, [T1, T2]]);
  assert.ok(Math.abs(h.written / SR - PROGRAMME.endsSec) < 0.3, `the whole set went out (${h.written / SR} s)`);
  assert.deepEqual(h.events.map((e) => e.event), ['started', 'song', 'song', 'ended']);
  assert.equal(h.events[2].trackId, T2);
  assert.ok(Math.abs(h.events[2].atSec - PROGRAMME.items[1].startSec) < 0.3);
  assert.equal(h.closed, 1, 'it hangs up at the end so the AutoDJ resumes');
  assert.ok(h.loads[1].at - (Date.parse(h.job.set.startsAt)) < (PROGRAMME.items[1].startSec - 60) * 1000, 'the next song is loaded well ahead');
});

test('an engine that comes up late joins the set where it is', async () => {
  // Joined after the first song has finished: only the second is sounding. (Joined inside the
  // blend, the first is still on the air, and is reported, correctly.)
  const h = harness({ startInSec: -(PROGRAMME.items[0].endSec + 5) });
  const r = await runSet(h.job, h.deps);
  assert.equal(r.ok, true);
  assert.deepEqual(r.played, [T2], 'it joins in the second song');
  assert.ok(h.events[0].atSec >= PROGRAMME.items[0].endSec);
  assert.ok(h.written / SR < PROGRAMME.endsSec - PROGRAMME.items[0].endSec);
  const inBlend = harness({ startInSec: -(PROGRAMME.items[1].startSec + 5) });
  assert.deepEqual((await runSet(inBlend.job, inBlend.deps)).played, [T1, T2], 'inside the blend, both are on the air');
});

test('⚠ it fails to the AutoDJ, never to silence', async () => {
  // The first song cannot be loaded: nothing goes out at all.
  const first = harness({ decodeFails: ['u1'] });
  const r1 = await runSet(first.job, first.deps);
  assert.deepEqual([r1.ok, r1.reason, first.written], [false, 'load_failed', 0]);
  assert.equal(first.events.at(-1).event, 'failed');
  // The second song cannot be loaded: the set stops before its start, and the line is closed.
  const second = harness({ decodeFails: ['u2'] });
  const r2 = await runSet(second.job, second.deps);
  assert.deepEqual([r2.ok, r2.played], [false, [T1]]);
  assert.match(r2.reason, /song 2 was not loaded in time/);
  assert.ok(second.written / SR <= PROGRAMME.items[1].startSec + 0.3, 'no frame of the hole was sent');
  assert.equal(second.closed, 1);
  // The connection drops.
  const drop = harness({ writeFailsAt: 30 });
  const r3 = await runSet(drop.job, drop.deps);
  assert.deepEqual([r3.ok, r3.reason], [false, 'output_failed']);
  assert.equal(drop.events.at(-1).event, 'failed');
  // A set with no source for one of its songs is refused before anything starts.
  const bad = harness();
  bad.job.sources = { [T1]: 'u1' };
  assert.deepEqual(await runSet(bad.job, bad.deps), { ok: false, reason: 'missing_source', played: [] });
});

test('the service loop: waits, starts once, and retries only a dropped connection', async () => {
  const h = harness({ startInSec: 600 });
  const state = { running: null, done: new Set() };
  const reply = (startsInSec) => ({ nowMs: h.clock, set: { id: SET_ID, startsAt: new Date(h.clock + startsInSec * 1000).toISOString() }, programme: PROGRAMME, sources: { [T1]: 'u1', [T2]: 'u2' } });
  let next = reply(600);
  const deps = { ...h.deps, fetchJob: async () => next };
  assert.equal((await pollOnce(state, deps)).action, 'waiting');
  next = reply(60);
  const started = await pollOnce(state, deps);
  assert.equal(started.action, 'started');
  assert.equal((await pollOnce(state, deps)).action, 'busy');
  assert.equal((await started.result).ok, true);
  next = reply(-30);
  assert.equal((await pollOnce(state, deps)).action, 'done', 'a finished set is not played twice');
  // A dropped connection is picked up again.
  const s2 = { running: null, done: new Set() };
  let writes = 0;
  const dropping = { ...deps, fetchJob: async () => reply(-5), openOutput: () => ({ write: async () => ++writes < 3, close: async () => {} }) };
  const first = await pollOnce(s2, dropping);
  assert.equal((await first.result).reason, 'output_failed');
  assert.equal((await pollOnce(s2, { ...dropping, openOutput: h.deps.openOutput })).action, 'started');
  assert.equal((await pollOnce({ running: null }, { ...deps, fetchJob: async () => { throw new Error('offline'); } })).action, 'error');
  assert.equal((await pollOnce({ running: null }, { ...deps, fetchJob: async () => ({ nowMs: 0, set: null }) })).action, 'idle');
});

// ── The real ffmpeg wiring ─────────────────────────────────────────────────────────────────
function wav(samples) {
  const pcm = Buffer.alloc(samples.length * 4);
  for (let i = 0; i < samples.length; i++) { const q = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767); pcm.writeInt16LE(q, i * 4); pcm.writeInt16LE(q, i * 4 + 2); }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

test('ffmpeg decodes a song and streams the mix into an Icecast input', { skip: HAS_FFMPEG ? false : 'no ffmpeg on this runner' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nora-engine-'));
  const file = join(dir, 'a.wav');
  writeFileSync(file, wav(A.subarray(0, SR * 6)));
  const pcm = await decode(file);
  assert.equal(pcm.left.length, SR * 6);
  assert.ok(Math.abs(pcm.left[SR * 5] / 32768 - A[SR * 5]) < 2e-4, 'the samples come back');
  // A stand-in for the station's live input, speaking Icecast's source protocol over raw TCP: an
  // HTTP PUT whose body is the stream itself, unframed until the source hangs up (Node's HTTP
  // server reads such a body as empty, which is why this is a socket).
  const got = { method: null, url: null, auth: null, type: null, bytes: 0 };
  const ice = (accept) => createNetServer((sock) => {
    let head = Buffer.alloc(0), open = false;
    sock.on('data', (c) => {
      if (open) { got.bytes += c.length; return; }
      head = Buffer.concat([head, c]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) return;
      const lines = head.subarray(0, end).toString('latin1').split('\r\n');
      const [method, url] = lines[0].split(' ');
      const h = Object.fromEntries(lines.slice(1).map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
      Object.assign(got, { method, url, auth: h.authorization, type: h['content-type'] });
      if (!accept) { sock.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
      sock.write('HTTP/1.1 100 Continue\r\n\r\n');
      open = true;
      got.bytes += head.length - end - 4;
    });
    sock.on('error', () => {});
  });
  const server = ice(true);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const out = openOutput({ target: `icecast://source:hackme@127.0.0.1:${port}/live` });
  const mix = createMixer(PROGRAMME, { sampleRate: SR });
  for (let t = 0; t < 4; t += 0.25) assert.equal(await out.write(mix.render(t, SR / 4, SOURCES)), true);
  await out.close();
  await new Promise((r) => server.close(r));
  assert.deepEqual([got.method, got.url, got.type], ['PUT', '/live', 'audio/mpeg']);
  assert.equal(got.auth, `Basic ${Buffer.from('source:hackme').toString('base64')}`);
  assert.ok(got.bytes > 192000 / 8 * 3, `about 4 s of 192 kbps MP3 arrived (${got.bytes} bytes)`);
  // ⚠ A station that refuses the source: every write settles false within seconds, never hangs.
  const refusing = ice(false);
  await new Promise((r) => refusing.listen(0, '127.0.0.1', r));
  const bad = openOutput({ target: `icecast://source:wrong@127.0.0.1:${refusing.address().port}/live` });
  const t0 = Date.now();
  let wrote = true;
  for (let i = 0; i < 400 && wrote; i++) wrote = await bad.write(mix.render(0, SR / 4, SOURCES));
  assert.equal(wrote, false, 'the refusal reaches the engine as a failed write');
  assert.ok(Date.now() - t0 < 15000, `within ${Date.now() - t0} ms`);
  await bad.close();
  await new Promise((r) => refusing.close(r));
  // To a file instead (the engine's test mode).
  const rec = openOutput({ target: join(dir, 'set.mp3') });
  await rec.write(mix.render(0, SR, SOURCES));
  await rec.close();
  assert.ok(statSync(join(dir, 'set.mp3')).size > 10000);
  // The password never reaches a log line.
  assert.match(read('services/nora-engine/main.mjs'), /const redact = \(s\) => String\(s\)\.replace\(\/\\\/\\\/\[\^@\/\]\*@\/, '\/\/\*\*\*@'\);/);
});

// ── Shape's side ───────────────────────────────────────────────────────────────────────────
function fakeDb(tables = {}, { fail = [] } = {}) {
  const db = {
    _t: tables,
    storage: { from: () => ({ createSignedUrl: async (path, ttl) => (fail.includes('sign') ? { data: null, error: {} } : { data: { signedUrl: `https://store/${path}?ttl=${ttl}` }, error: null }) }) },
    from(table) {
      const st = { op: 'select', filters: [], payload: null, single: false };
      const rows = () => (tables[table] = tables[table] || []);
      const run = () => {
        if (fail.includes(`${st.op}:${table}`)) return { data: null, error: { message: 'x' } };
        if (st.op === 'insert') { rows().push({ ...st.payload }); return { data: null, error: null }; }
        const hit = rows().filter((r) => st.filters.every((f) => f(r)));
        return { data: st.single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null };
      };
      const chain = {
        select() { return chain; },
        insert(p) { st.op = 'insert'; st.payload = p; return chain; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return chain; },
        in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return chain; },
        gt(c, v) { st.filters.push((r) => String(r[c]) > String(v)); return chain; },
        gte(c, v) { st.filters.push((r) => String(r[c]) >= String(v)); return chain; },
        lt(c, v) { st.filters.push((r) => String(r[c]) < String(v)); return chain; },
        lte(c, v) { st.filters.push((r) => String(r[c]) <= String(v)); return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() { st.single = true; return chain; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return chain;
    },
  };
  return db;
}
const NOW = Date.parse('2026-10-12T17:55:00Z');
const shapeTables = (over = {}) => ({
  nora_dj_settings: [{ id: 1, licences_confirmed_at: '2026-10-01T00:00:00Z' }],
  nora_sets: [{ id: SET_ID, starts_at: '2026-10-12T18:00:00.000Z', duration_min: 30, published: true, host_kind: 'nora' }],
  nora_set_programmes: [{ set_id: SET_ID, programme: PROGRAMME }],
  radio_tracks: [{ id: T1, storage_path: `tracks/${T1}.mp3`, title: 'A', artist: 'X', album: 'LP', label: 'Lbl', isrc: 'USRC17607839', status: 'ready', enabled: true }, { id: T2, storage_path: `tracks/${T2}.mp3`, title: 'B', artist: 'Y', status: 'ready', enabled: true }],
  nora_engine_log: [],
  ...over,
});

test('the engine is handed the set due next, with a link to each song that outlives the set', async () => {
  const r = await engineJob(fakeDb(shapeTables()), { now: NOW });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.set.id, r.body.nowMs, r.body.programme], [SET_ID, NOW, PROGRAMME]);
  assert.deepEqual(Object.keys(r.body.sources).sort(), [T1, T2].sort());
  const ttl = Number(/ttl=(\d+)/.exec(r.body.sources[T1])[1]);
  assert.ok(ttl >= 5 * 60 + PROGRAMME.endsSec + 3600, `the link lasts the set plus an hour (${ttl} s)`);
  // ⚠ Without the licences, nothing; an unpublished set, nothing; too early, nothing.
  assert.deepEqual((await engineJob(fakeDb(shapeTables({ nora_dj_settings: [{ id: 1, licences_confirmed_at: null }] })), { now: NOW })).body, { nowMs: NOW, set: null, reason: 'unlicensed' });
  assert.equal((await engineJob(fakeDb(shapeTables({ nora_sets: [{ ...shapeTables().nora_sets[0], published: false }] })), { now: NOW })).body.set, null);
  assert.equal((await engineJob(fakeDb(shapeTables()), { now: Date.parse('2026-10-12T17:30:00Z') })).body.set, null);
  // A set that is over is not handed out again.
  assert.equal((await engineJob(fakeDb(shapeTables()), { now: Date.parse('2026-10-12T19:30:00Z') })).body.set, null);
  // A song deleted since the plan: refused, so the AutoDJ plays rather than a set with a hole.
  const gone = await engineJob(fakeDb(shapeTables({ radio_tracks: [shapeTables().radio_tracks[0]] })), { now: NOW });
  assert.deepEqual([gone.status, gone.body.error, gone.body.trackId], [409, 'song_missing', T2]);
  assert.equal((await engineJob(fakeDb(shapeTables(), { fail: ['select:nora_dj_settings'] }), { now: NOW })).status, 503);
});

test('the play log keeps what was played, as it was, and only songs the set planned', async () => {
  const db = fakeDb(shapeTables());
  assert.equal((await recordEngineEvent(db, { event: 'song', setId: SET_ID, trackId: T1, atSec: 0 }, { now: NOW })).status, 200);
  const row = db._t.nora_engine_log[0];
  assert.deepEqual([row.event, row.title, row.artist, row.album, row.label, row.isrc, row.played_at], ['song', 'A', 'X', 'LP', 'Lbl', 'USRC17607839', '2026-10-12T18:00:00.000Z']);
  assert.equal((await recordEngineEvent(db, { event: 'song', setId: SET_ID, trackId: '99999999-9999-4999-8999-999999999999', atSec: 10 }, { now: NOW })).status, 409);
  assert.equal((await recordEngineEvent(db, { event: 'dance', setId: SET_ID }, { now: NOW })).status, 400);
  assert.equal((await recordEngineEvent(db, { event: 'song', setId: SET_ID, atSec: 1 }, { now: NOW })).status, 400);
  assert.equal((await recordEngineEvent(db, { event: 'ended', setId: SET_ID, atSec: -5 }, { now: NOW })).status, 400);
  assert.equal((await recordEngineEvent(db, { event: 'failed', setId: SET_ID, detail: 'x'.repeat(500) }, { now: NOW })).status, 200);
  assert.equal(db._t.nora_engine_log.at(-1).detail.length, 300);
  // A song removed from the library since still reports from the plan.
  const db2 = fakeDb(shapeTables({ radio_tracks: [] }));
  await recordEngineEvent(db2, { event: 'song', setId: SET_ID, trackId: T2, atSec: PROGRAMME.items[1].startSec }, { now: NOW });
  assert.deepEqual([db2._t.nora_engine_log[0].title, db2._t.nora_engine_log[0].artist, db2._t.nora_engine_log[0].track_id], ['B', 'Y', null]);
});

test('the play report: one month, CSV, formulas defused', async () => {
  assert.deepEqual(monthRange('2026-10'), ['2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z']);
  assert.equal(monthRange('2026-13'), null);
  const db = fakeDb({ nora_engine_log: [
    { event: 'song', played_at: '2026-10-12T18:00:00.000Z', artist: 'X, the Band', title: '=HYPERLINK("x")', isrc: 'USRC17607839', album: 'Say "hi"', label: null, set_id: SET_ID },
    { event: 'song', played_at: '2026-11-01T00:00:00.000Z', artist: 'Next month', title: 'n', set_id: SET_ID },
    { event: 'started', played_at: '2026-10-12T18:00:00.000Z', set_id: SET_ID },
  ] });
  const r = await playsCsv(db, '2026-10');
  assert.equal(r.count, 1);
  const lines = r.body.trim().split('\r\n');
  assert.equal(lines[0], 'Played at (UTC),Featured artist,Sound recording title,ISRC,Album title,Marketing label,Nora set');
  assert.equal(lines[1], `2026-10-12T18:00:00.000Z,"X, the Band","'=HYPERLINK(""x"")",USRC17607839,"Say ""hi""",,${SET_ID}`);
  assert.equal((await playsCsv(db, 'oct')).status, 400);
});

test('the routes: the engine’s token is checked before anything, and the report is admin-only', () => {
  const engine = read('src/app/api/radio/nora/engine/route.ts');
  assert.match(engine, /if \(secret\.length < 32\) return NextResponse\.json\(\{ error: 'engine_not_configured' \}, \{ status: 503/);
  assert.match(engine, /timingSafeEqual\(given, want\)/);
  for (const m of ['GET', 'POST']) {
    const body = engine.slice(engine.indexOf(`export async function ${m}`));
    const gate = body.indexOf('if (refused) return refused;');
    assert.ok(gate > 0 && gate < body.indexOf('createAdminClient()'), `${m}: the token first`);
  }
  const plays = read('src/app/api/admin/radio/plays/route.ts');
  assert.ok(plays.indexOf('requireAdminUser()') > 0 && plays.indexOf('requireAdminUser()') < plays.indexOf('createAdminClient()'));
  const war = read('src/lib/warroom.ts');
  assert.match(war, /\['\/api\/radio\/nora\/engine', 'GET,POST'\]/);
  assert.match(war, /\['\/api\/admin\/radio\/plays', 'GET'\]/);
  const sql = read('supabase-migrations/2026-10-11-nora-engine-log.sql').replace(/--.*$/gm, '');
  assert.match(sql, /revoke all on table public\.nora_engine_log from public, anon, authenticated/);
  assert.ok(!/create policy|grant [^;]* to (anon|authenticated)|create (or replace )?function/i.test(sql));
  // The engine needs nothing from npm, and its image carries ffmpeg.
  assert.deepEqual(Object.keys(JSON.parse(read('services/nora-engine/package.json'))).filter((k) => /dependencies/i.test(k)), []);
  assert.match(read('services/nora-engine/Dockerfile'), /apt-get install -y --no-install-recommends ffmpeg/);
});
