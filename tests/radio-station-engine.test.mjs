// Nora's engine on Shape's own station (services/nora-engine, NORA_MODE=station): runStation keeps
// one stream open and plays what Shape hands it back to back, asks ahead for what follows and
// loads it in time, bridges a short gap with silence and hands a long one (or any failure) to the
// station's standby loop, cuts a rotation block where one of Nora's sets now starts, stops when
// the licences are withdrawn, and never turns a fault into a storm of asks. Plus main.mjs's line to
// Shape: the station's ask, the report queue, and the title update that waits for the stream.
// All against a fake clock and a fake Shape; tests/radio-station-e2e.test.mjs runs the real thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runStation, runSet, PREFETCH_SEC, PAD_MAX_SEC, CHECK_EVERY_SEC, RETRY_SEC, POLL_SEC, SAMPLE_RATE as SR } from '../services/nora-engine/engine.mjs';
import { announce, createReporter, stationAsk } from '../services/nora-engine/main.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = { timeout: 60000 };
const iso = (ms) => new Date(ms).toISOString();
const uuid = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const B1 = uuid(1), B2 = uuid(2), S1 = uuid(3);
const TA = uuid(11), TB = uuid(12), TC = uuid(13), TD = uuid(14);

function tone(hz, sec) {
  const x = new Float32Array(Math.round(sec * SR));
  for (let i = 0; i < x.length; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * hz * (i / SR));
  return { sampleRate: SR, left: x, right: x };
}
const PCM = { [TA]: tone(440, 30), [TB]: tone(550, 30), [TC]: tone(660, 30), [TD]: tone(770, 30) };

/** A segment of songs (30 s each, 2 s blends), as Shape hands it. */
function segment(kind, id, startMs, tracks) {
  const items = [];
  let t = 0;
  tracks.forEach((trackId, i) => {
    const start = i ? t - 2 : 0;
    items.push({ trackId, title: trackId.slice(0, 2), artist: 'X', startSec: start, cueInSec: 0, cueOutSec: 30, endSec: start + 30, rate: 1, gainDb: 0, bpm: null, mixIn: i ? { type: 'blend', lengthSec: 2 } : { type: 'open', lengthSec: 0 } });
    t = start + 30;
  });
  return { [kind]: { id, startsAt: iso(startMs) }, programme: { startsAt: iso(startMs), durationSec: t, endsSec: t, items }, sources: Object.fromEntries(tracks.map((x) => [x, `u:${x}`])) };
}
const endOf = (job) => Date.parse((job.block || job.set).startsAt) + job.programme.endsSec * 1000;

/**
 * The station against a fake clock. `shape(ask, clock)` answers each ask; `check(ask, clock)` each
 * check. The loop stops once `stopAt` (ms on the clock) has passed.
 */
function station({ shape, check = () => ({ ok: true }), decodeFails = [], stopAt }) {
  let clock = 1_000_000;
  const outputs = [], asks = [], checks = [], reports = [], decodes = [], titles = [];
  const deps = {
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    decode: async (url) => {
      decodes.push({ url, at: clock });
      if (decodeFails.includes(url)) throw new Error('404');
      return PCM[url.slice(2)];
    },
    openOutput: () => {
      const o = { openedAt: clock, frames: 0, samples: [], closed: false, write: async (pcm) => { o.frames += pcm.length / 2; o.samples.push(pcm); return !o.closed; }, close: async () => { o.closed = true; o.closedAt = clock; } };
      outputs.push(o);
      return o;
    },
    report: async (e) => { reports.push({ ...e, at: clock }); },
    announce: async (item) => { titles.push(item.title); },
    fetchStationJob: async (ask) => { asks.push({ ...ask, at: clock }); return { nowMs: clock, ...shape(ask, clock) }; },
    checkSegment: async (ask) => { checks.push({ ...ask, at: clock }); return check(ask, clock); },
  };
  const t0 = clock;
  const done = runStation(deps, { running: () => clock < t0 + stopAt });
  return { done, deps, outputs, asks, checks, reports, decodes, titles, get clock() { return clock; }, t0 };
}

test('two rotation blocks play back to back on one stream: asked for, and loaded, before the first ends', LIMIT, async () => {
  let first, second;
  const h = station({
    stopAt: 200000,
    shape: (ask, now) => {
      if (!first) return (first = segment('block', B1, now + 10000, [TA, TB]));
      if (!second && ask.after) return (second = segment('block', B2, Date.parse(ask.after), [TC, TD]));
      return { set: null, block: null, reason: 'empty_library' };
    },
  });
  await h.done;
  assert.equal(h.outputs.length, 1, 'one stream for both blocks');
  const out = h.outputs[0];
  // The whole of both, and nothing between them: the frames sent are the two blocks' lengths.
  const want = first.programme.endsSec + second.programme.endsSec;
  assert.ok(Math.abs(out.frames / SR - want) < 0.3, `sent ${out.frames / SR} s of ${want} s`);
  assert.deepEqual(h.reports.filter((r) => r.event !== 'song').map((r) => [r.event, r.blockId]), [['started', B1], ['ended', B1], ['started', B2], ['ended', B2]]);
  assert.equal(h.reports.find((r) => r.event === 'started' && r.blockId === B2).atSec, 0, 'the second starts at its own beginning');
  // Asked for the second ahead of time, at the first's end, and its first song loaded before it.
  const ahead = h.asks.find((a) => a.after);
  assert.equal(ahead.after, iso(endOf(first)));
  assert.ok(endOf(first) - ahead.at >= (Math.min(PREFETCH_SEC, first.programme.endsSec) - 2) * 1000, 'asked two minutes ahead (here, the block being shorter, as it began)');
  assert.ok(h.decodes.find((d) => d.url === `u:${TC}`).at < endOf(first), 'its first song was loaded before the first block ended');
  assert.deepEqual([TA, TB, TC, TD].map((x) => h.decodes.filter((d) => d.url === `u:${x}`).length), [1, 1, 1, 1], 'and each song decoded once: the one loaded ahead is the one played');
  // Then nothing to play: the stream is handed to the standby loop.
  assert.equal(out.closed, true);
  assert.ok(out.closedAt >= endOf(second) - 3000, 'hung up only after the music');
  assert.ok(h.asks.some((a) => a.skip.includes(B1) && a.skip.includes(B2)), 'it names the blocks it has finished');
});

test('a short gap is bridged with silence on the open stream; a long one goes to the standby loop', LIMIT, async () => {
  // A 10 s gap (Shape's nextAt): silence, the same stream.
  let first, setJob, said = false;
  const short = station({
    stopAt: 150000,
    shape: (ask, now) => {
      if (!first) return (first = segment('block', B1, now + 10000, [TA]));
      const gapEnd = endOf(first) + 10000;
      if (!said) { said = true; return { set: null, block: null, nextAt: iso(gapEnd) }; }
      if (!setJob && ask.after === iso(gapEnd)) return (setJob = segment('set', S1, gapEnd, [TB]));
      return { set: null, block: null, reason: 'empty_library' };
    },
  });
  await short.done;
  assert.equal(short.outputs.length, 1, 'one stream across the gap');
  const all = new Float32Array(short.outputs[0].frames * 2);
  let k = 0;
  for (const s of short.outputs[0].samples) { all.set(s, k); k += s.length; }
  const peak = (a, b) => { let m = 0; for (let f = Math.round(a * SR); f < Math.round(b * SR); f++) m = Math.max(m, Math.abs(all[2 * f])); return m; };
  assert.equal(peak(31, 39), 0, 'silence in the gap');
  assert.ok(peak(10, 20) > 0.2 && peak(42, 50) > 0.2, 'music either side');
  assert.ok(Math.abs(all.length / 2 / SR - 70) < 0.3, `30 s, 10 s of silence, 30 s (${all.length / 2 / SR} s)`);
  assert.deepEqual(short.reports.filter((r) => r.event === 'started').map((r) => r.setId || r.blockId), [B1, S1]);

  // A minute's gap: the stream is put down after the first and opened again for the second.
  let one, two;
  const long = station({
    stopAt: 200000,
    shape: (ask, now) => {
      if (!one) return (one = segment('block', B1, now + 10000, [TA]));
      if (!two && ask.after) return (two = segment('set', S1, endOf(one) + (PAD_MAX_SEC + 35) * 1000, [TB]));
      if (two && !ask.skip.includes(S1) && now >= endOf(one) + 30000) return two;
      return { set: null, block: null, reason: 'empty_library' };
    },
  });
  await long.done;
  assert.equal(long.outputs.length, 2, 'a new stream for the set');
  assert.ok(long.outputs[0].closedAt <= endOf(one) + 1000, 'the first was put down at once');
  const setStart = Date.parse(two.set.startsAt);
  assert.ok(long.outputs[1].openedAt >= setStart - 3000 && long.outputs[1].openedAt <= setStart, 'and the second opened as the set began (a moment ahead, as a stream starts)');
});

test('⚠ a block is cut where one of Nora\'s sets now starts, fading out, and her set follows from her start', LIMIT, async () => {
  let blk, set;
  const h = station({
    stopAt: 300000,
    shape: (ask, now) => {
      if (!blk) return (blk = segment('block', B1, now + 10000, [TA, TB, TC, TD]));   // songs at 0, 28, 56, 84 s
      if (set && ask.after === set.set.startsAt) return set;
      return { set: null, block: null, reason: 'empty_library' };
    },
    check: (ask, now) => {
      if (ask.kind !== 'block') return { ok: true };
      // Her set was scheduled after the block was planned: 80 s into it.
      const cutAt = Date.parse(blk.block.startsAt) + 80000;
      set ||= segment('set', S1, cutAt, [TA]);
      return { ok: true, cutAt: iso(cutAt) };
    },
  });
  await h.done;
  assert.ok(h.checks.length >= 1 && h.checks[0].at - Date.parse(blk.block.startsAt) >= (CHECK_EVERY_SEC - 12) * 1000, 'checked about once a minute');
  const ended = h.reports.find((r) => r.event === 'ended' && r.blockId === B1);
  assert.ok(Math.abs(ended.atSec - 80) < 0.3, `the block ended at the cut (${ended.atSec} s)`);
  assert.ok(!h.reports.some((r) => r.event === 'song' && r.blockId === B1 && r.trackId === TD), 'its last song, after the cut, never started');
  assert.equal(h.outputs.length, 1, 'her set follows on the same stream');
  const started = h.reports.find((r) => r.event === 'started' && r.setId === S1);
  assert.equal(started.atSec, 0, 'from her start');
  // The fade: the block's last quarter second before the cut is near silence.
  const o = h.outputs[0];
  const all = new Float32Array(o.frames * 2);
  let k = 0;
  for (const s of o.samples) { all.set(s, k); k += s.length; }
  const around = (sec) => { let m = 0; for (let f = Math.round((sec - 0.25) * SR); f < Math.round(sec * SR); f++) m = Math.max(m, Math.abs(all[2 * f])); return m; };
  assert.ok(around(80) < 0.02, `faded out to the cut (${around(80)})`);
  assert.ok(around(75) > 0.1, 'still playing five seconds before it');
  assert.ok(around(82) > 0.1, 'and her set plays straight after');
});

test('⚠ the licences withdrawn mid-block: it stops within a minute and hands the stream to the standby loop', LIMIT, async () => {
  let blk, withdrawn = false;
  const h = station({
    stopAt: 200000,
    shape: (ask, now) => {
      if (!blk) return (blk = segment('block', B1, now + 10000, [TA, TB, TC]));
      return withdrawn ? { set: null, block: null, reason: 'unlicensed' } : { set: null, block: null, reason: 'empty_library' };
    },
    check: () => { withdrawn = true; return { stop: true, reason: 'unlicensed' }; },
  });
  await h.done;
  const ended = h.reports.find((r) => r.event === 'ended');
  assert.ok(ended.atSec < CHECK_EVERY_SEC + 5, `stopped at ${ended.atSec} s, not at the block's end`);
  assert.equal(h.outputs[0].closed, true);
  assert.ok(h.outputs[0].closedAt < Date.parse(blk.block.startsAt) + (CHECK_EVERY_SEC + 8) * 1000);
  assert.equal(h.outputs.length, 1, 'nothing more is played');
});

test('⚠ a failure goes to the standby loop and waits longer each time; twice running, the segment is not asked for again', LIMIT, async () => {
  let blk;
  const h = station({
    stopAt: 120000,
    decodeFails: [`u:${TA}`],
    shape: (ask, now) => {
      if (!ask.skip.includes(B1)) return (blk = blk && now < endOf(blk) ? { ...blk } : segment('block', B1, now + 10000, [TA, TB]));
      return { set: null, block: null, reason: 'empty_library' };
    },
  });
  await h.done;
  assert.equal(h.outputs.length, 0, 'no frame of a block that cannot load is sent');
  assert.deepEqual(h.reports.filter((r) => r.event === 'failed').map((r) => r.blockId), [B1, B1]);
  const third = h.asks[2];
  assert.ok(third.skip.includes(B1), 'the third ask names it, so Shape plans something else');
  // The waits after the failures: RETRY_SEC[0], then RETRY_SEC[1].
  const fails = h.reports.filter((r) => r.event === 'failed').map((r) => r.at);
  assert.ok(h.asks[1].at - fails[0] >= RETRY_SEC[0] * 1000 && h.asks[2].at - fails[1] >= RETRY_SEC[1] * 1000);
  // A segment Shape cannot hand out (its body names it) is not asked for again either.
  const bad = station({ stopAt: 30000, shape: (ask) => (ask.skip.includes(B2) ? { set: null, block: null, reason: 'empty_library' } : { error: 'song_missing', blockId: B2 }) });
  await bad.done;
  assert.ok(bad.asks[1].skip.includes(B2));
});

test('nothing to play (no licence, an empty library, Shape out of reach): no stream, and a poll every so often', LIMIT, async () => {
  const h = station({ stopAt: 100000, shape: () => ({ set: null, block: null, reason: 'unlicensed' }) });
  await h.done;
  assert.equal(h.outputs.length, 0);
  assert.ok(h.asks.length >= 4 && h.asks.length <= 6, `${h.asks.length} asks in 100 s`);
  assert.equal(h.asks[1].at - h.asks[0].at, POLL_SEC * 1000);
  // Out of reach: the same.
  const off = station({ stopAt: 60000, shape: () => { throw new Error('offline'); } });
  off.deps.fetchStationJob = async () => { throw new Error('offline'); };
  await off.done;
  assert.equal(off.outputs.length, 0);
});

test('a segment that has just ended is not played twice, and costs no wait', LIMIT, async () => {
  let clock = 5_000_000;
  const job = segment('block', B1, clock - 61000, [TA, TB]);   // over 3 s ago
  const r = await runSet({ ...job, serverNowMs: clock, localAtFetchMs: clock }, {
    now: () => clock, sleep: async (ms) => { clock += ms; }, decode: async (u) => PCM[u.slice(2)],
    openOutput: () => { throw new Error('never opened'); }, report: async () => {},
  }, { line: { out: null, writtenTo: null } });
  assert.deepEqual([r.ok, r.reason], [false, 'already_over']);
});

test('⚠ handed segments that are already over, again and again, it pauses rather than spins', LIMIT, async () => {
  let n = 0;
  const h = station({ stopAt: 30000, shape: (ask, now) => segment('block', uuid(100 + n++), now - 61000, [TA, TB]) });
  await h.done;
  assert.ok(h.asks.length <= 12, `${h.asks.length} asks in 30 s`);
  assert.equal(h.outputs.length, 0);
});

test('the radio.co mode is unchanged: a set opens its own output and hangs up at the end', LIMIT, async () => {
  let clock = 2_000_000, opened = 0, closed = 0;
  const job = segment('set', S1, clock + 5000, [TA]);
  const r = await runSet({ ...job, serverNowMs: clock, localAtFetchMs: clock }, {
    now: () => clock, sleep: async (ms) => { clock += ms; }, decode: async (u) => PCM[u.slice(2)],
    openOutput: () => { opened++; return { write: async () => true, close: async () => { closed++; } }; }, report: async () => {},
  });
  assert.deepEqual([r.ok, opened, closed], [true, 1, 1]);
});

// ── main.mjs: the line to Shape ────────────────────────────────────────────────────────────
test('the station\'s ask: mode=station, after and skip; an error\'s body comes back, a bad token throws', LIMIT, async () => {
  const seen = [];
  const fetchFn = async (url, init) => { seen.push([url, init.headers.authorization]); return { status: 409, json: async () => ({ error: 'song_missing', blockId: B1 }) }; };
  const r = await stationAsk({ after: '2026-11-03T10:00:00.000Z', skip: [B1, B2] }, { fetchFn, shapeUrl: 'https://s', token: 'tok' });
  assert.deepEqual(r, { error: 'song_missing', blockId: B1, httpStatus: 409 });
  const u = new URL(seen[0][0]);
  assert.deepEqual([u.pathname, u.searchParams.get('mode'), u.searchParams.get('after'), u.searchParams.get('skip'), seen[0][1]], ['/api/radio/nora/engine', 'station', '2026-11-03T10:00:00.000Z', `${B1},${B2}`, 'Bearer tok']);
  await stationAsk({ check: `block:${B1}`, skip: [] }, { fetchFn, shapeUrl: 'https://s', token: 'tok' });
  assert.equal(new URL(seen[1][0]).searchParams.get('check'), `block:${B1}`);
  assert.equal(new URL(seen[1][0]).searchParams.has('skip'), false);
  await assert.rejects(stationAsk({}, { fetchFn: async () => ({ status: 401, json: async () => ({ error: 'Unauthorized' }) }), shapeUrl: 'https://s', token: 'x' }), /401/);
  await assert.rejects(stationAsk({}, { fetchFn: async () => ({ status: 502, json: async () => { throw new Error('html'); } }), shapeUrl: 'https://s', token: 'x' }), /502/);
});

test('⚠ the reports go behind the music, in order, and one Shape does not take is tried again, then logged whole', LIMIT, async () => {
  const sent = [], logs = [];
  let failNext = 2;
  const rep = createReporter({
    send: async (e) => { if (failNext-- > 0) throw new Error('503'); sent.push(e.n); },
    log: (m) => logs.push(m), sleep: async () => {},
  });
  let resolved = 0;
  for (let n = 1; n <= 3; n++) rep.report({ n }).then(() => resolved++);
  await new Promise((r) => setImmediate(r));
  assert.equal(resolved, 3, 'a report never waits for Shape');
  for (let i = 0; i < 20 && sent.length < 3; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent, [1, 2, 3], 'in order, the first after two failures');
  const lost = createReporter({ send: async () => { throw new Error('down'); }, log: (m) => logs.push(m), sleep: async () => {}, tries: 3 });
  lost.report({ event: 'song', trackId: TA });
  for (let i = 0; i < 20 && lost.pending; i++) await new Promise((r) => setImmediate(r));
  assert.match(logs.at(-1), /not taken after 3 tries.*"trackId":"/);
});

test('⚠ the first title waits for the stream: a 400 is tried again, a newer title wins, a refusal is not retried', LIMIT, async () => {
  const target = 'icecast://source:pw@h:8000/live';
  let calls = 0;
  await announce({ artist: 'X', title: 'A' }, { target, waitMs: 1, fetchFn: async () => ({ ok: ++calls >= 3, status: 400 }) });
  assert.equal(calls, 3, 'tried until the server knew the stream');
  calls = 0;
  await assert.rejects(announce({ title: 'A' }, { target, waitMs: 1, fetchFn: async () => { calls++; return { ok: false, status: 401 }; } }), /401/);
  assert.equal(calls, 1);
  // An older title still being retried gives way to a newer one.
  const order = [];
  const older = announce({ title: 'old' }, { target, waitMs: 20, fetchFn: async (url) => { order.push(new URL(url).searchParams.get('song')); return { ok: false, status: 400 }; } });
  await new Promise((r) => setTimeout(r, 5));
  await announce({ title: 'new' }, { target, waitMs: 1, fetchFn: async (url) => { order.push(new URL(url).searchParams.get('song')); return { ok: true }; } });
  await assert.rejects(older);
  assert.deepEqual(order, ['old', 'new'], 'the old title was not sent again after the new one');
});

test('⚠ every call to Shape has a time limit: a request that never answers must not stop the music', LIMIT, () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../services/nora-engine/main.mjs'), 'utf8');
  const fn = (name) => src.slice(src.indexOf(name), src.indexOf('\n}\n', src.indexOf(name)));
  assert.match(fn('async function api('), /signal: AbortSignal\.timeout\(API_TIMEOUT_MS\)/);
  assert.match(fn('export async function stationAsk('), /signal: AbortSignal\.timeout\(API_TIMEOUT_MS\)/);
  assert.match(fn('export async function announce('), /signal: AbortSignal\.timeout\(5000\)/);
  assert.match(src, /const API_TIMEOUT_MS = 20000;/);
  assert.match(src, /report: \(event\) => reporter\.report\(event\),/, 'reports go through the queue, behind the music');
});
