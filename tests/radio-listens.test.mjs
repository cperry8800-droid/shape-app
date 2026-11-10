// Shape Radio on Shape's own station, part 4: a performance count for every play (owner,
// 2026-11-03: "Compliance requires a per-performance count for every play - build that"). The
// station tells Shape as each listener joins and leaves (src/app/api/radio/pass/route.ts), Shape
// keeps each session (src/lib/radio/listens.mjs, radio_listens), and the SoundExchange report counts,
// for every play, the sessions that heard any part of it, with the month's listening hours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  stationCaller, parseBoot, recordListen, playWindows, sessionSpans, countPerformances, tuningHours,
  performanceReport, listeningNow, BLEND_TAIL_SEC, MIN_GRID_BPM, STATION_USER, LONG_OPEN_MS,
} from '../src/lib/radio/listens.mjs';
import { playsCsv, playsSummaryCsv, monthRange } from '../src/lib/radio/noraEngineApi.mjs';
import { HEARD_LAG_SEC } from '../src/lib/radio/noraOnAir.mjs';
import { BLEND_BARS, BEATMATCH_MAX } from '../src/lib/radio/noraPlanner.mjs';
import { MAX_TRACK_SEC } from '../src/lib/radio/library.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const iso = (ms) => new Date(ms).toISOString();
const NOW = Date.parse('2026-11-20T12:00:00.000Z');
const NOV = Date.parse('2026-11-01T00:00:00.000Z');
const TOKEN = 't'.repeat(40);
const BOOT1 = '1793318400.0123456789abcdef', BOOT2 = '1793750400.fedcba9876543210';
const SET = '11111111-1111-4111-8111-111111111111';
const BLK = '22222222-2222-4222-8222-222222222222';
const BLK2 = '33333333-3333-4333-8333-333333333333';
const LAG = HEARD_LAG_SEC * 1000;
const TAIL = BLEND_TAIL_SEC * 1000;

// A database as the API is: filters, ordering, ranges, and at most 1,000 rows a select, with no error.
function fakeDb(tables, { fail = [], missing = [] } = {}) {
  const calls = [];
  const cmp = (orders) => (a, b) => {
    for (const [c, asc] of orders) {
      const x = a[c], y = b[c];
      if (x === y) continue;
      return (x < y ? -1 : 1) * (asc ? 1 : -1);
    }
    return 0;
  };
  const orClause = (s) => {
    const parts = s.split(',').map((p) => {
      const [c, op, ...rest] = p.split('.');
      const v = rest.join('.').replace(/^"|"$/g, '');
      if (op === 'is' && v === 'null') return (r) => r[c] == null;
      if (op === 'gt') return (r) => r[c] != null && String(r[c]) > v;
      throw new Error(`or: ${p}`);
    });
    return (r) => parts.some((f) => f(r));
  };
  const db = {
    _t: tables, calls,
    from(table) {
      const st = { op: 'select', filters: [], orders: [], from: 0, to: Infinity, limit: Infinity, single: false, payload: null, opts: {} };
      const rows = () => (tables[table] = tables[table] || []);
      const run = () => {
        calls.push({ table, op: st.op, from: st.from });
        if (missing.includes(table)) return { data: null, error: { code: '42P01', message: 'no table' } };
        if (fail.includes(`${st.op}:${table}`)) return { data: null, error: { message: 'x' } };
        if (st.op === 'upsert') {
          const keys = st.opts.onConflict.split(',');
          const had = rows().find((r) => keys.every((k) => r[k] === st.payload[k]));
          if (!had) rows().push({ id: rows().length + 1, ended_at: null, duration_sec: null, ...st.payload });
          else if (!st.opts.ignoreDuplicates) Object.assign(had, st.payload);
          return { data: null, error: null };
        }
        let hit = rows().filter((r) => st.filters.every((f) => f(r)));
        if (st.op === 'update') { for (const r of hit) Object.assign(r, st.payload); return { data: null, error: null }; }
        hit = [...hit].sort(cmp(st.orders)).slice(st.from, st.to + 1).slice(0, st.limit).slice(0, 1000);
        if (st.head) return { data: null, count: hit.length, error: null };
        if (st.single) return { data: hit[0] ? { ...hit[0] } : null, error: null };
        return { data: hit.map((r) => ({ ...r })), error: null };
      };
      const chain = {
        select(c, o) { st.head = !!(o && o.head); return chain; },
        upsert(p, o) { st.op = 'upsert'; st.payload = p; st.opts = o || {}; return chain; },
        update(p) { st.op = 'update'; st.payload = p; return chain; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return chain; },
        neq(c, v) { st.filters.push((r) => r[c] !== v); return chain; },
        is(c, v) { st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return chain; },
        gt(c, v) { st.filters.push((r) => String(r[c]) > String(v)); return chain; },
        gte(c, v) { st.filters.push((r) => String(r[c]) >= String(v)); return chain; },
        lt(c, v) { st.filters.push((r) => String(r[c]) < String(v)); return chain; },
        or(s) { st.filters.push(orClause(s)); return chain; },
        order(c, o) { st.orders.push([c, !o || o.ascending !== false]); return chain; },
        range(a, b) { st.from = a; st.to = b; return chain; },
        limit(n) { st.limit = n; return chain; },
        maybeSingle() { st.single = true; return chain; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return chain;
    },
  };
  return db;
}

let nextId = 1;
const ev = (event, atMs, seg, extra = {}) => ({ id: nextId++, event, played_at: iso(atMs), set_id: seg === 'set' ? SET : null, block_id: seg === 'set' ? null : seg, artist: 'A', title: 'T', isrc: null, album: null, label: null, ...extra });
const listen = (id, boot, bootAtMs, client, startMs, endMs) => ({ id, boot, boot_at: iso(bootAtMs), client, started_at: iso(startMs), ended_at: endMs == null ? null : iso(endMs), duration_sec: endMs == null ? null : Math.round((endMs - startMs) / 1000) });

test('⚠ only the station server is heard: it signs in with the engine\'s own token', () => {
  const good = `Basic ${Buffer.from(`${STATION_USER}:${TOKEN}`).toString('base64')}`;
  assert.equal(STATION_USER, 'station');
  assert.equal(stationCaller(good, { NORA_ENGINE_TOKEN: TOKEN }), true);
  assert.equal(stationCaller(`Basic ${Buffer.from(`station:${'x'.repeat(40)}`).toString('base64')}`, { NORA_ENGINE_TOKEN: TOKEN }), false, 'another token');
  assert.equal(stationCaller(`Basic ${Buffer.from(`listener:${TOKEN}`).toString('base64')}`, { NORA_ENGINE_TOKEN: TOKEN }), false, 'another name');
  assert.equal(stationCaller(`Bearer ${TOKEN}`, { NORA_ENGINE_TOKEN: TOKEN }), false);
  assert.equal(stationCaller(null, { NORA_ENGINE_TOKEN: TOKEN }), false);
  const short = 's'.repeat(20);
  assert.equal(stationCaller(`Basic ${Buffer.from(`station:${short}`).toString('base64')}`, { NORA_ENGINE_TOKEN: short }), false, 'no real token, no station');
  assert.equal(stationCaller(good, {}), false);
});

test('⚠ each start of the station is named, with its time', () => {
  assert.deepEqual(parseBoot(BOOT1), { boot: BOOT1, bootAt: iso(1793318400 * 1000) });
  for (const bad of ['', null, '1793318400', '1793318400.0123456789ABCDEF', '1793318400.0123', 'x.0123456789abcdef', `${BOOT1}x`, '17933184001234.0123456789abcdef']) {
    assert.equal(parseBoot(bad), null, String(bad));
  }
});

test('⚠ a session: opened as the listener joins, ended as they leave; a lost join kept whole from its length', async () => {
  const db = fakeDb({ radio_listens: [] });
  const b = parseBoot(BOOT1);
  const t0 = NOV + 3600000;
  assert.deepEqual(await recordListen(db, { action: 'join', ...b, client: 7, now: t0 }), { ok: true });
  assert.deepEqual(await recordListen(db, { action: 'join', ...b, client: 7, now: t0 + 5000 }), { ok: true }, 'a second word on a join');
  assert.equal(db._t.radio_listens.length, 1);
  assert.deepEqual(await recordListen(db, { action: 'leave', ...b, client: 7, durationSec: 600, now: t0 + 600000 }), { ok: true });
  assert.deepEqual([db._t.radio_listens[0].started_at, db._t.radio_listens[0].ended_at, db._t.radio_listens[0].duration_sec], [iso(t0), iso(t0 + 600000), 600]);
  assert.deepEqual(await recordListen(db, { action: 'leave', ...b, client: 7, durationSec: 999, now: t0 + 999000 }), { ok: true });
  assert.equal(db._t.radio_listens[0].ended_at, iso(t0 + 600000), 'a second word on leaving changes nothing');
  // Shape never heard this one join: the whole session, from the length Icecast measured.
  await recordListen(db, { action: 'leave', ...b, client: 8, durationSec: 120, now: t0 + 700000 });
  assert.deepEqual([db._t.radio_listens[1].started_at, db._t.radio_listens[1].ended_at, db._t.radio_listens[1].boot_at], [iso(t0 + 580000), iso(t0 + 700000), b.bootAt]);
  // The same number on the next start of the station is another listener.
  await recordListen(db, { action: 'join', ...parseBoot(BOOT2), client: 7, now: t0 + 800000 });
  assert.equal(db._t.radio_listens.length, 3);
  // Two servers' clocks a moment apart: never ended before it began.
  await recordListen(db, { action: 'leave', ...parseBoot(BOOT2), client: 7, durationSec: 0, now: t0 + 799000 });
  assert.equal(db._t.radio_listens[2].ended_at, iso(t0 + 800000));
  // Faults are said, never thrown.
  assert.deepEqual(await recordListen(fakeDb({}, { fail: ['upsert:radio_listens'] }), { action: 'join', ...b, client: 1, now: t0 }), { ok: false, error: 'write_failed' });
  assert.deepEqual(await recordListen(fakeDb({}, { fail: ['select:radio_listens'] }), { action: 'leave', ...b, client: 1, durationSec: 1, now: t0 }), { ok: false, error: 'read_failed' });
  assert.deepEqual(await recordListen(db, { action: 'dance', ...b, client: 1, now: t0 }), { ok: false, error: 'action' });
});

test('⚠ a song is heard from its start to the end of the blend into the next, or to its stop, and the listener\'s lag', () => {
  // The planner's longest blend: BLEND_BARS (and a bar) at the slowest tempo it grids, played as slow as it beatmatches.
  assert.equal(MIN_GRID_BPM, 60);
  assert.match(read('src/lib/radio/library.mjs'), /if \(!inRange\(a\.bpm, 60, 200\)\) return null;/, 'the library grids 60 BPM and up');
  assert.ok(BLEND_TAIL_SEC >= ((BLEND_BARS + 1) * 4 * (60 / 60)) / (1 - BEATMATCH_MAX));
  assert.match(read('src/lib/radio/noraPlanner.mjs'), /const overlap = clash \? 3 : clamp\(tail, 4, 10\);/, 'every other blend is ten seconds at most');
  assert.ok(BLEND_TAIL_SEC < 120, 'and no longer than it needs');
  const t = NOV + 86400000;
  const log = [
    ev('started', t, BLK), ev('song', t, BLK), ev('song', t + 200000, BLK), ev('song', t + 400000, BLK), ev('ended', t + 500000, BLK),
    ev('started', t + 100000, 'set'), ev('song', t + 100000, 'set'), // her set alongside: its own songs, no next word
  ];
  const w = playWindows(log);
  const [a, b, c, s] = [log[1], log[2], log[3], log[6]].map((r) => w.get(r));
  assert.deepEqual(a, { start: t, end: t + 200000 + TAIL + LAG }, 'through the blend into the next');
  assert.deepEqual(b, { start: t + 200000, end: t + 400000 + TAIL + LAG });
  assert.deepEqual(c, { start: t + 400000, end: t + 500000 + LAG }, 'the engine stopped: no blend after it');
  assert.deepEqual(s, { start: t + 100000, end: t + 100000 + (MAX_TRACK_SEC + HEARD_LAG_SEC) * 1000 }, 'no next word: as long as any song may run');
  assert.equal(w.size, 4, 'songs only');
});

test('⚠ a session with no reported end lasted until its station started again, or, on the latest start, until now', () => {
  const t = NOV + 86400000;
  const rows = [
    listen(1, BOOT1, t - 1000, 1, t, t + 60000),
    listen(2, BOOT1, t - 1000, 2, t + 1000, null),
    listen(3, BOOT2, t + 500000, 1, t + 600000, null),
  ];
  const spans = sessionSpans(rows, new Map([[BOOT1, t + 500000]]), { now: t + 900000 });
  assert.deepEqual(spans.map((s) => [s.start, s.end, s.open]), [[t, t + 60000, false], [t + 1000, t + 500000, true], [t + 600000, t + 900000, true]]);
  // A next start before the session began (clocks): never shorter than nothing.
  assert.deepEqual(sessionSpans([listen(4, BOOT1, t, 9, t + 5000, null)], new Map([[BOOT1, t + 1000]]), { now: t + 9000 }).map((s) => [s.start, s.end]), [[t + 5000, t + 5000]]);
});

test('⚠ a performance: one session that heard any part of the song; the counting matches a session-by-session count', () => {
  const w = { start: 1000, end: 2000 };
  const cases = [
    [{ start: 0, end: 999 }, 0], [{ start: 0, end: 1000 }, 0], [{ start: 0, end: 1001 }, 1],
    [{ start: 1999, end: 5000 }, 1], [{ start: 2000, end: 5000 }, 0], [{ start: 0, end: 9000 }, 1], [{ start: 1500, end: 1500 }, 1],
  ];
  for (const [span, n] of cases) assert.deepEqual(countPerformances([w], [span]), [n], JSON.stringify(span));
  // Against the plain count, on scattered windows and sessions.
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const spans = Array.from({ length: 400 }, () => { const s = Math.floor(rnd() * 1e6); return { start: s, end: s + Math.floor(rnd() * 2e5) }; });
  const windows = Array.from({ length: 300 }, () => { const s = Math.floor(rnd() * 2e6); return { start: s, end: s + Math.floor(rnd() * 3e5) }; });
  const plain = windows.map((x) => spans.filter((s) => s.start < x.end && s.end > x.start).length);
  assert.deepEqual(countPerformances(windows, spans), plain);
  assert.ok(plain.some((n) => n > 5) && plain.some((n) => n === 0), 'the sample bites both ways');
});

test('the hours listened, within the range', () => {
  const h = 3600000;
  assert.equal(tuningHours([{ start: 0, end: 2 * h }, { start: h, end: 4 * h }], [0, 3 * h]), 4);
  assert.equal(tuningHours([{ start: -h, end: h }], [0, 10 * h]), 1, 'only the part inside');
  assert.equal(tuningHours([], [0, h]), 0);
});

// A month of the rotation: a song every three minutes for 125 hours (2,500 songs: past any one
// select), blocks an hour long, listeners coming and going, and the station restarted once.
function month() {
  nextId = 1;
  const log = [];
  for (let i = 0; i < 2500; i++) {
    const at = NOV + i * 180000;
    const blk = Math.floor(i / 20) % 2 ? BLK2 : BLK;
    if (i % 20 === 0) log.push(ev('started', at, blk));
    log.push(ev('song', at, blk, { title: `S${i}` }));
    if (i % 20 === 19) log.push(ev('ended', at + 180000, blk));
  }
  const boot2At = NOV + 50 * 3600000;
  const listens = [];
  let id = 1;
  for (let k = 0; k < 1500; k++) {
    const start = NOV + ((k * 7919) % (125 * 3600)) * 1000;
    const len = ((k * 104729) % 7200) * 1000;
    const boot = start < boot2At ? BOOT1 : BOOT2;
    const bootAt = boot === BOOT1 ? NOV - 1000 : boot2At;
    const open = k % 97 === 0;
    listens.push(listen(id++, boot, bootAt, k, start, open ? null : Math.min(start + len, boot === BOOT1 ? boot2At : NOW)));
  }
  return { log, listens, boot2At };
}

test('⚠ every play of the month, a page at a time, each with its performances; sessions left open closed at the next start', async () => {
  const { log, listens, boot2At } = month();
  const db = fakeDb({ nora_engine_log: log.map((r) => ({ ...r })), radio_listens: listens.map((r) => ({ ...r })) });
  const r = await performanceReport(db, monthRange('2026-11'), { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.plays.length, 2500, 'every play, past the 1,000 rows one select returns');
  assert.ok(db.calls.some((c) => c.table === 'nora_engine_log' && c.from === 2000), 'read a page at a time');
  assert.ok(db.calls.some((c) => c.table === 'radio_listens' && c.from === 1000));
  // The plain count, session by session, song by song.
  const spans = listens.map((l) => {
    const s = Date.parse(l.started_at);
    const e = l.ended_at ? Date.parse(l.ended_at) : (l.boot === BOOT1 ? boot2At : NOW);
    return { start: s, end: Math.max(s, e) };
  });
  const songs = log.filter((x) => x.event === 'song');
  const plain = songs.map((x, i) => {
    const start = Date.parse(x.played_at);
    const next = log[log.indexOf(x) + 1];
    const end = next && next.event === 'song' && next.block_id === x.block_id ? Date.parse(next.played_at) + TAIL + LAG
      : next && next.block_id === x.block_id ? Date.parse(next.played_at) + LAG
        : (i % 20 === 19 ? Date.parse(next.played_at) + LAG : start + (MAX_TRACK_SEC + HEARD_LAG_SEC) * 1000);
    return spans.filter((s) => s.start < end && s.end > start).length;
  });
  assert.deepEqual(r.plays.map((p) => p.performances), plain);
  assert.ok(plain.filter((n) => n > 0).length > 1000, 'listeners heard most of it');
  assert.equal(r.totals.performances, plain.reduce((a, b) => a + b, 0));
  assert.equal(r.totals.plays, 2500);
  assert.equal(r.totals.measuredPlays, 2500, 'a rotation block is always Shape\'s own');
  assert.equal(r.totals.sessions, 1500);
  assert.equal(r.totals.openSessions, listens.filter((l) => !l.ended_at).length);
  const hours = spans.reduce((n, s) => n + (s.end - s.start), 0) / 3600000;
  assert.ok(Math.abs(r.totals.tuningHours - hours) < 1e-6, `${r.totals.tuningHours} vs ${hours}`);
});

test('⚠ a play is measured from the station\'s first recorded start (zero is a count); before it, or before the migration, blank (Codex, #2586)', async () => {
  nextId = 1;
  const t = NOV + 86400000;
  const log = [ev('song', t, 'set'), ev('ended', t + 200000, 'set'), ev('song', t + 9000000, 'set'), ev('ended', t + 9200000, 'set'), ev('song', t + 9500000, BLK), ev('ended', t + 9700000, BLK)];
  const firstBoot = t + 5000000;
  const db = fakeDb({ nora_engine_log: log, radio_listens: [listen(1, BOOT1, firstBoot, 1, t + 9100000, t + 9150000)] });
  const r = await performanceReport(db, monthRange('2026-11'), { now: NOW });
  // Before the first start that kept a session, Shape can't tell nobody from not recording: blank,
  // never a 0 that would under-report. From that start on, nobody listening is 0.
  assert.deepEqual(r.plays.map((p) => p.performances), [null, 1, 0], 'a set before the station recorded anything, a set heard once, a block nobody heard');
  assert.equal(r.totals.measuredPlays, 2);
  // A play inside that first start, before its first listener, was recorded and nobody heard it: 0.
  const early = fakeDb({ nora_engine_log: [ev('song', firstBoot + 1000, BLK), ev('ended', firstBoot + 200000, BLK)], radio_listens: [listen(1, BOOT1, firstBoot, 1, t + 9100000, t + 9150000)] });
  assert.deepEqual((await performanceReport(early, monthRange('2026-11'), { now: NOW })).plays.map((p) => p.performances), [0]);
  const before = await performanceReport(fakeDb({ nora_engine_log: log }, { missing: ['radio_listens'] }), monthRange('2026-11'), { now: NOW });
  assert.equal(before.ok, true);
  assert.deepEqual(before.plays.map((p) => p.performances), [null, null, null]);
  assert.deepEqual([before.totals.tuningHours, before.totals.sessions, before.totals.measuredPlays], [null, null, 0], 'nothing measured before the migration');
  // Any other fault is no report, never a report of nothing.
  assert.deepEqual(await performanceReport(fakeDb({ nora_engine_log: log }, { fail: ['select:radio_listens'] }), monthRange('2026-11'), { now: NOW }), { ok: false, error: 'read_failed' });
  assert.deepEqual(await performanceReport(fakeDb({}, { fail: ['select:nora_engine_log'] }), monthRange('2026-11'), { now: NOW }), { ok: false, error: 'read_failed' });
});

test('⚠ the month\'s last song: its blend into next month\'s first, and who heard that, are read too', async () => {
  nextId = 1;
  const DEC = Date.parse('2026-12-01T00:00:00.000Z');
  const log = [ev('song', DEC - 60000, BLK, { title: 'last' }), ev('song', DEC, BLK, { title: 'first of December' }), ev('ended', DEC + 200000, BLK)];
  const listens = [
    listen(1, BOOT1, NOV, 1, DEC + 30000, DEC + 40000),     // in its blend, after midnight: heard it
    listen(2, BOOT1, NOV, 2, DEC + 600000, DEC + 660000),   // ten minutes into December: did not
  ];
  const r = await performanceReport(fakeDb({ nora_engine_log: log, radio_listens: listens }), monthRange('2026-11'), { now: NOW + 30 * 86400000 });
  assert.deepEqual(r.plays.map((p) => [p.title, p.performances]), [['last', 1]]);
});

test('the report: a performances column on every play, and the month\'s totals in one row', async () => {
  nextId = 1;
  const t = NOV + 86400000;
  const log = [ev('song', t, BLK, { artist: 'X, the Band', title: '=HYPERLINK("x")', isrc: 'USRC17607839' }), ev('ended', t + 200000, BLK)];
  const db = fakeDb({ nora_engine_log: log, radio_listens: [listen(1, BOOT1, t - 1000, 1, t - 1000, t + 3600000), listen(2, BOOT1, t - 1000, 2, t + 100000, t + 120000)] });
  const csv = await playsCsv(db, '2026-11', { now: NOW });
  const lines = csv.body.trim().split('\r\n');
  assert.equal(lines[0], 'Played at (UTC),Featured artist,Sound recording title,ISRC,Album title,Marketing label,Actual total performances,Nora set,Rotation block');
  assert.equal(lines[1], `${iso(t)},"X, the Band","'=HYPERLINK(""x"")",USRC17607839,,,2,,${BLK}`);
  const sum = await playsSummaryCsv(db, '2026-11', { now: NOW });
  const s = sum.body.trim().split('\r\n');
  assert.equal(s[0], 'Month (UTC),Plays,Plays measured,Actual total performances,Aggregate tuning hours,Listening sessions,Sessions with no reported end');
  assert.equal(s[1], '2026-11,1,1,2,1.01,2,0');
  assert.equal((await playsSummaryCsv(db, 'nov')).status, 400);
  assert.equal((await playsCsv(fakeDb({}, { fail: ['select:nora_engine_log'] }), '2026-11')).status, 503);
});

test('⚠ the door: the station\'s sign-in and its start first; a join kept after it is let in, never instead; a leave kept', () => {
  const route = read('src/app/api/radio/pass/route.ts');
  const at = (s) => { const i = route.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = [
    at("const boot = parseBoot(new URL(request.url).searchParams.get('boot'));"),
    at("if (!stationCaller(request.headers.get('authorization')) || !boot) {"),
    at("if (form.get('action') === 'listener_remove') {"),
    at('const left = leavingListener(form, { key: passKey() });'),
    at("await recordListen(createAdminClient(), { action: 'leave', ...boot, client, durationSec, now });"),
    at('const verdict = checkListener(form, { now, key: passKey() });'),
    // The stream's account on record before the listener is let in (owner, 2026-11-10).
    at('const r = await admitConnection(createAdminClient(), { streamId, ...boot, client, now });'),
    at("headers['icecast-auth-user'] = '1';"),
    at("await recordListen(createAdminClient(), { action: 'join', ...boot, client, now });"),
  ];
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in that order');
  assert.equal((route.match(/headers\['icecast-auth-user'\] = '1'/g) || []).length, 1, 'admitted in one place');
  // A failed session write, or a leave's connection not cleared, is logged, never a refusal and
  // never a fault; a connection that cannot be recorded is logged AND refused (fail closed).
  assert.equal((route.match(/\} catch \(e\) \{\n\s+console\.error\('\[radio\/pass\]/g) || []).length, 4);
  assert.match(route, /console\.error\('\[radio\/pass\] a listener could not be recorded, so was refused:', \(e as Error\)\.message\);\n\s+headers\['icecast-auth-message'\] = 'write_failed';/);
  assert.match(read('src/lib/radio/listens.mjs'), /export function stationCaller\(authorization, env = process\.env\)/);
});

test('the migration: one row a connection, no account and no address, the service role only', () => {
  const sql = read('supabase-migrations/2026-11-03-radio-listens.sql');
  const table = sql.slice(sql.indexOf('create table if not exists public.radio_listens'), sql.indexOf(');', sql.indexOf('create table')));
  for (const c of ['boot ', 'boot_at ', 'client ', 'started_at ', 'ended_at ', 'duration_sec ']) assert.ok(table.includes(c), c);
  assert.ok(!/user_id|member|account|ip\b|agent/i.test(table), 'nothing ties a row to a person');
  assert.match(table, /constraint radio_listens_one_per_connection unique \(boot, client\)/);
  assert.match(table, /boot\s+text not null check \(boot ~ '\^\[0-9\]\{9,11\}\\\.\[0-9a-f\]\{16\}\$'\)/, 'the same names parseBoot takes');
  assert.match(sql, /alter table public\.radio_listens enable row level security;/);
  assert.match(sql, /revoke all on table public\.radio_listens from public, anon, authenticated;/);
  assert.ok(!/create (or replace )?function/i.test(sql));
  assert.ok(/create table if not exists/.test(sql) && !/drop table/i.test(sql), 'idempotent');
});

test('the dashboard: who listens on the station\'s latest start, and the sessions open over 12 hours', async () => {
  const t = NOW - 3600000;
  const rows = [
    listen(1, BOOT1, NOV, 1, NOV + 1000, null),               // an earlier start's, left open: not now
    listen(2, BOOT2, NOV + 86400000, 1, t, null),
    listen(3, BOOT2, NOV + 86400000, 2, NOW - LONG_OPEN_MS - 60000, null),
    listen(4, BOOT2, NOV + 86400000, 3, t, t + 60000),
  ];
  assert.equal(LONG_OPEN_MS, 12 * 3600000);
  assert.deepEqual(await listeningNow(fakeDb({ radio_listens: rows }), { now: NOW }), { listening: 2, openLong: 1 });
  assert.deepEqual(await listeningNow(fakeDb({ radio_listens: [] }), { now: NOW }), { listening: 0, openLong: 0 });
  assert.equal(await listeningNow(fakeDb({}, { missing: ['radio_listens'] }), { now: NOW }), null);
  const panel = read('src/app/dashboard/radio/StationPanel.tsx');
  assert.match(panel, /try \{ listening = own \? await listeningNow\(db, \{ now \}\) : null; \} catch \{ listening = null; \}/);
  assert.match(panel, /listening\.openLong > 0 \? 'text-amber-200'/);
  const sets = read('src/app/dashboard/radio/NoraSets.tsx');
  assert.match(sets, /href=\{`\/api\/admin\/radio\/plays\?month=\$\{thisMonth\}&summary=1`\}/);
  const route = read('src/app/api/admin/radio/plays/route.ts');
  assert.ok(route.indexOf('await requireAdminUser();') < route.indexOf('(summary ? playsSummaryCsv : playsCsv)'), 'admin first');
});
