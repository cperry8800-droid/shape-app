// Shape Radio on Shape's own station, part 2: the website and the app play it. The owner points
// the station at Shape's own stream (src/lib/radio/station.mjs: checkOwnStation, and probeStream
// before anything is saved); now-playing names the rotation's song from Shape's own plan, on the
// same rules as Nora's sets and one more (src/lib/radio/noraOnAir.mjs: rotationOnAir); the route
// asks her set first, then the rotation, only on Shape's own; and the dashboard's station panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkOwnStation, checkStation, probeStream, engineQuiet, ENGINE_QUIET_MS, OWN_PROVIDER, OWN_MOUNT } from '../src/lib/radio/station.mjs';
import { MAX_TRACK_SEC } from '../src/lib/radio/library.mjs';
import { rotationOnAir, HEARD_LAG_SEC } from '../src/lib/radio/noraOnAir.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const iso = (ms) => new Date(ms).toISOString();

// ── Pointing the station at Shape's own stream ─────────────────────────────────────────────
test('⚠ Shape\'s own stream: https, its own name, the /live mount, nothing else', () => {
  assert.deepEqual(checkOwnStation({ streamUrl: ' https://Radio.TheShapeCommunity.com/live ' }), {
    ok: true, value: { provider: OWN_PROVIDER, stream_url: 'https://radio.theshapecommunity.com/live', now_playing_url: null },
  });
  assert.equal(OWN_PROVIDER, 'shape');
  assert.equal(OWN_MOUNT, '/live');
  const refused = {
    'http://radio.theshapecommunity.com/live': 'stream_https',
    'https://u:p@radio.theshapecommunity.com/live': 'stream_url',
    'https://radio.theshapecommunity.com/live?x=1': 'stream_url',
    'https://radio.theshapecommunity.com/live#a': 'stream_url',
    'https://radio.theshapecommunity.com:8000/live': 'stream_url',
    'https://radio.theshapecommunity.com/standby': 'stream_not_live',
    'https://radio.theshapecommunity.com/live/': 'stream_not_live',
    'https://radio.theshapecommunity.com/': 'stream_not_live',
    'https://s5.radio.co/live': 'stream_is_radio_co',
    'https://radio.co/live': 'stream_is_radio_co',
    'https://203.0.113.9/live': 'stream_host',
    'https://[::1]/live': 'stream_host',
    'https://localhost/live': 'stream_host',
    'https://station.local/live': 'stream_host',
    'https://radio/live': 'stream_host',
    'not a url': 'stream_url',
    '': 'stream_url',
  };
  for (const [url, error] of Object.entries(refused)) assert.deepEqual(checkOwnStation({ streamUrl: url }), { ok: false, error }, url);
  // radio.co's own path is unchanged.
  assert.equal(checkStation({ streamUrl: 'https://s5.radio.co/s0a1b2c3d4/listen', stationId: 's0a1b2c3d4' }).value.provider, 'http');
});

test('⚠ the stream is asked before it is saved: only an answer with audio passes, headers only', async () => {
  const calls = [];
  const res = (status, type) => {
    const r = { ok: status >= 200 && status < 300, status, headers: new Headers(type ? { 'content-type': type } : {}), cancelled: false };
    r.body = { cancel: async () => { r.cancelled = true; } };
    return r;
  };
  let last;
  const fetchFn = (status, type) => async (url, init) => { calls.push({ url, init }); last = res(status, type); return last; };
  assert.deepEqual(await probeStream('https://radio.example.com/live', { fetchFn: fetchFn(200, 'audio/mpeg') }), { ok: true });
  assert.equal(last.cancelled, true, 'the stream is not read, only its headers');
  assert.equal(calls[0].init.redirect, 'error', 'a redirect elsewhere is not followed');
  assert.ok(calls[0].init.signal, 'it is given a time limit');
  assert.deepEqual(await probeStream('u', { fetchFn: fetchFn(200, 'audio/mpeg; charset=binary') }), { ok: true });
  assert.deepEqual(await probeStream('u', { fetchFn: fetchFn(404, 'text/html') }), { ok: false, error: 'station_unreachable' });
  assert.deepEqual(await probeStream('u', { fetchFn: fetchFn(200, 'text/html') }), { ok: false, error: 'station_not_audio' });
  assert.deepEqual(await probeStream('u', { fetchFn: fetchFn(200, null) }), { ok: false, error: 'station_not_audio' });
  assert.deepEqual(await probeStream('u', { fetchFn: async () => { throw new Error('ENOTFOUND'); } }), { ok: false, error: 'station_unreachable' });
});

test('the provider: Shape\'s own is a measured station, never the mock, and names nothing by itself', () => {
  const sel = read('src/lib/radio/index.ts');
  assert.match(sel, /if \(config\.provider === 'shape'\) return shapeProvider;/);
  assert.match(sel, /return getProvider\(config\) === mockProvider;/, 'isSimulated still asks which provider was chosen');
  const shape = read('src/lib/radio/shape.ts');
  assert.match(shape, /return \{ title: null, artist: null, isNora: false \};/);
});

// ── Now-playing from the rotation ──────────────────────────────────────────────────────────
function fakeDb(tables, { fail = [] } = {}) {
  return {
    from(table) {
      const st = { filters: [], order: null, limit: null, single: false };
      const run = () => {
        if (fail.includes(table)) return { data: null, error: { message: 'x' } };
        let rows = (tables[table] || []).filter((r) => st.filters.every((f) => f(r)));
        if (st.order) rows = [...rows].sort((a, b) => (String(a[st.order.c]) < String(b[st.order.c]) ? -1 : 1) * (st.order.asc ? 1 : -1));
        if (st.limit) rows = rows.slice(0, st.limit);
        return { data: st.single ? rows[0] || null : rows, error: null };
      };
      const chain = {
        select() { return chain; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return chain; },
        lte(c, v) { st.filters.push((r) => String(r[c]) <= String(v)); return chain; },
        gt(c, v) { st.filters.push((r) => String(r[c]) > String(v)); return chain; },
        order(c, { ascending }) { st.order = { c, asc: ascending }; return chain; },
        limit(n) { st.limit = n; return chain; },
        maybeSingle() { st.single = true; return chain; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return chain;
    },
  };
}
const NOW = Date.parse('2026-11-03T21:00:00.000Z');
const B1 = 'b1b1b1b1-0000-4000-8000-000000000001', B0 = 'b0b0b0b0-0000-4000-8000-000000000000';
const TA = 'aaaaaaaa-0000-4000-8000-00000000000a', TB = 'bbbbbbbb-0000-4000-8000-00000000000b';
const programme = {
  endsSec: 400,
  items: [
    { trackId: TA, title: 'A', artist: 'X', album: 'LP', startSec: 0, endSec: 210, rate: 1, mixIn: { type: 'open', lengthSec: 0 } },
    { trackId: TB, title: 'B', artist: 'Y', album: null, startSec: 190, endSec: 400, rate: 1, mixIn: { type: 'blend', lengthSec: 10 } },
  ],
};
const at = (startMs, sec) => startMs + (sec + HEARD_LAG_SEC) * 1000;   // when listeners hear set time `sec`
const block = (id, startMs) => ({ id, starts_at: iso(startMs), programme });
const logRow = (blockId, event, trackId, n, extra = {}) => ({ block_id: blockId, event, track_id: trackId || null, logged_at: iso(NOW - 100000 + n * 1000), ...extra });

test('⚠ the rotation\'s song is the one listeners hear, from Shape\'s own plan, with its album', async () => {
  const start = NOW - 100000;
  const db = fakeDb({ radio_rotation_blocks: [block(B1, start)], nora_engine_log: [logRow(B1, 'started', null, 0), logRow(B1, 'song', TA, 1)] });
  assert.deepEqual(await rotationOnAir(db, { now: at(start, 60) }), { title: 'A', artist: 'X', album: 'LP', isNora: false, simulated: false });
  // Not before listeners hear it: the first seconds, inside the lag, name nothing.
  assert.equal(await rotationOnAir(db, { now: start + (HEARD_LAG_SEC - 2) * 1000 }), null);
});

test('⚠ only a song the engine says it played: one the plan reaches but the engine never reported is not named', async () => {
  const start = NOW - 300000;
  // The plan has B on by now, but the engine reported only A (it died; the standby loop plays).
  const db = fakeDb({ radio_rotation_blocks: [block(B1, start)], nora_engine_log: [logRow(B1, 'started', null, 0), logRow(B1, 'song', TA, 1)] });
  assert.equal(await rotationOnAir(db, { now: at(start, 250) }), null);
  // Reported: named, once the blend is half done (the bass swap), not as it begins.
  const both = fakeDb({ radio_rotation_blocks: [block(B1, start)], nora_engine_log: [logRow(B1, 'started', null, 0), logRow(B1, 'song', TA, 1), logRow(B1, 'song', TB, 2)] });
  assert.equal((await rotationOnAir(both, { now: at(start, 192) })).title, 'A', 'the outgoing song through the first half of the blend');
  assert.equal((await rotationOnAir(both, { now: at(start, 196) })).title, 'B');
});

test('⚠ only while the engine is on the air for that block: ended, stopped or silent names nothing', async () => {
  const start = NOW - 100000;
  for (const last of ['ended', 'failed']) {
    const db = fakeDb({ radio_rotation_blocks: [block(B1, start)], nora_engine_log: [logRow(B1, 'started', null, 0), logRow(B1, 'song', TA, 1), logRow(B1, last, null, 2)] });
    assert.equal(await rotationOnAir(db, { now: at(start, 60) }), null, last);
  }
  assert.equal(await rotationOnAir(fakeDb({ radio_rotation_blocks: [block(B1, start)], nora_engine_log: [] }), { now: at(start, 60) }), null, 'never reported');
  // Another block's reports do not count for this one.
  const other = fakeDb({ radio_rotation_blocks: [block(B1, start)], nora_engine_log: [logRow(B0, 'song', TA, 1)] });
  assert.equal(await rotationOnAir(other, { now: at(start, 60) }), null);
  // A failed read names nothing.
  assert.equal(await rotationOnAir(fakeDb({}, { fail: ['radio_rotation_blocks'] }), { now: NOW }), null);
  assert.equal(await rotationOnAir(fakeDb({ radio_rotation_blocks: [block(B1, start)] }, { fail: ['nora_engine_log'] }), { now: at(start, 60) }), null);
});

test('⚠ a block\'s end is heard HEARD_LAG_SEC after the engine reports it, and the song sounding till then is named (Codex, #2574)', async () => {
  const start = NOW - 100000;
  // The engine stopped sending at 60 s into the block (its end, a cut for her set, or a fault).
  for (const last of ['ended', 'failed']) {
    const db = fakeDb({ radio_rotation_blocks: [block(B1, start)], nora_engine_log: [logRow(B1, 'started', null, 0), logRow(B1, 'song', TA, 1), logRow(B1, last, null, 2, { played_at: iso(start + 60000) })] });
    assert.equal((await rotationOnAir(db, { now: start + 60000 + (HEARD_LAG_SEC - 1) * 1000 })).title, 'A', `${last}: listeners still hear A`);
    assert.equal(await rotationOnAir(db, { now: start + 60000 + (HEARD_LAG_SEC + 1) * 1000 }), null, `${last}: and then nothing`);
  }
  // A terminal report with no time on it names nothing.
  const blind = fakeDb({ radio_rotation_blocks: [block(B1, start)], nora_engine_log: [logRow(B1, 'song', TA, 1), logRow(B1, 'ended', null, 2)] });
  assert.equal(await rotationOnAir(blind, { now: at(start, 60) }), null);
});

test('⚠ a song deleted from the library while it plays is named on, by the title and artist its report copied (Codex, #2574)', async () => {
  const start = NOW - 100000;
  const gone = fakeDb({ radio_rotation_blocks: [block(B1, start)], nora_engine_log: [logRow(B1, 'started', null, 0), logRow(B1, 'song', null, 1, { title: 'A', artist: 'X' })] });
  assert.equal((await rotationOnAir(gone, { now: at(start, 60) })).title, 'A');
  // Another song's copied names do not stand in for it.
  const other = fakeDb({ radio_rotation_blocks: [block(B1, start)], nora_engine_log: [logRow(B1, 'started', null, 0), logRow(B1, 'song', null, 1, { title: 'A', artist: 'Someone else' })] });
  assert.equal(await rotationOnAir(other, { now: at(start, 60) }), null);
});

test('⚠ the dashboard calls the engine quiet only past the longest song the library takes (Codex, #2574)', () => {
  const now = Date.parse('2026-11-03T22:00:00Z');
  const ago = (min) => new Date(now - min * 60000).toISOString();
  assert.equal(MAX_TRACK_SEC, 1800, 'the library\'s longest song, 30 min');
  assert.equal(ENGINE_QUIET_MS, (MAX_TRACK_SEC + 120) * 1000);
  assert.equal(engineQuiet(ago(1), now), false);
  assert.equal(engineQuiet(ago(25), now), false, 'a healthy engine in a 25-minute song');
  assert.equal(engineQuiet(ago(31), now), false, 'a 30-minute song and its blend');
  assert.equal(engineQuiet(ago(33), now), true);
  assert.equal(engineQuiet(null, now), true, 'never reported');
  assert.equal(engineQuiet('not a time', now), true);
  const panel = read('src/app/dashboard/radio/StationPanel.tsx');
  assert.match(panel, /const quiet = own && engineQuiet\(lastAt, now\);/);
});

test('the newest block on the air wins; one that has not started, or is long over, is not read', async () => {
  // Two blocks on the air at once (one a set has since been scheduled over, its engine still on it
  // a moment): the newer one is what plays.
  const older = NOW - 160000, newer = NOW - 100000;
  const TO = 'cccccccc-0000-4000-8000-00000000000c';
  const oldProg = { endsSec: 400, items: [{ trackId: TO, title: 'Old', artist: 'Z', album: null, startSec: 0, endSec: 400, rate: 1, mixIn: { type: 'open', lengthSec: 0 } }] };
  const tables = {
    radio_rotation_blocks: [{ id: B0, starts_at: iso(older), programme: oldProg }, block(B1, newer)],
    nora_engine_log: [logRow(B0, 'started', null, 0), logRow(B0, 'song', TO, 1), logRow(B1, 'started', null, 2), logRow(B1, 'song', TA, 3)],
  };
  assert.equal((await rotationOnAir(fakeDb(tables), { now: at(newer, 60) })).title, 'A');
  assert.equal(await rotationOnAir(fakeDb({ radio_rotation_blocks: [block(B1, NOW + 60000)], nora_engine_log: tables.nora_engine_log }), { now: NOW }), null);
  // Blocks stored ahead (the engine asks for the next one early) never crowd out the one on the air.
  const ahead = [1, 2, 3].map((k) => ({ ...block(`a${k}a${k}a${k}a${k}-0000-4000-8000-00000000000${k}`, NOW + k * 600000) }));
  const crowded = fakeDb({ radio_rotation_blocks: [block(B1, newer), ...ahead], nora_engine_log: tables.nora_engine_log });
  assert.equal((await rotationOnAir(crowded, { now: at(newer, 60) })).title, 'A');
  assert.equal(await rotationOnAir(fakeDb({ radio_rotation_blocks: [block(B1, NOW - 3 * 3600000)], nora_engine_log: tables.nora_engine_log }), { now: NOW }), null);
});

// ── The route and the dashboard ────────────────────────────────────────────────────────────
test('⚠ the route: her set first, then, on Shape\'s own station only, the rotation; never the next song', () => {
  const route = read('src/app/api/radio/now-playing/route.ts');
  const nora = route.indexOf('const nora = await noraOnAir(');
  const rotation = route.indexOf('const rotation = await rotationOnAir(');
  const provider = route.indexOf('getProvider(cfg).getNowPlaying()');
  assert.ok(nora > 0 && nora < rotation && rotation < provider, 'Nora, then the rotation, then the provider');
  assert.match(route, /if \(cfg\.provider === OWN_PROVIDER\) \{\n\s+try \{\n\s+const rotation = await rotationOnAir\(createAdminClient\(\), \{ now: Date\.now\(\) \}\);\n\s+if \(rotation\) return NextResponse\.json\(\{ \.\.\.rotation, simulated: false \}/);
  assert.match(route, /import \{ noraOnAir, rotationOnAir \} from '@\/lib\/radio\/noraOnAir\.mjs';/);
  // rotationOnAir shares heardNow (the lag, the bass swap) with her sets.
  const air = read('src/lib/radio/noraOnAir.mjs');
  const fn = air.slice(air.indexOf('export async function rotationOnAir'));
  assert.match(fn, /const heard = heardNow\(block\.programme, Date\.parse\(block\.starts_at\), now\);/);
});

test('⚠ the dashboard saves Shape\'s own station only after checking it and hearing it answer; admin only', () => {
  const actions = read('src/app/dashboard/radio/actions.ts');
  const fn = actions.slice(actions.indexOf('export async function connectOwnStation'), actions.indexOf('export async function disconnectStation'));
  const order = ['await requireAdminUser();', 'checkOwnStation(', 'if (!checked.ok) failed(', 'await probeStream(checked.value.stream_url)', 'if (!probed.ok) failed(probed.error);', ".from('radio_station')"].map((s) => fn.indexOf(s));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `in order: ${order.join(', ')}`);
  const panel = read('src/app/dashboard/radio/StationPanel.tsx');
  assert.match(panel, /<form action=\{connectOwnStation\}/);
  assert.match(panel, /<form action=\{connectStation\}/);
  assert.match(panel, /rotationOnAir\(db, \{ now \}\)/);
  const page = read('src/app/dashboard/radio/NoraSets.tsx');
  assert.match(page, /<StationPanel station=\{station\.data \?\? null\} \/>/);
  for (const k of ['station_unreachable', 'station_not_audio', 'station_stream_not_live', 'station_stream_is_radio_co', 'station_stream_host']) assert.match(page, new RegExp(`${k}: '`), k);
  assert.match(page, /own_station_connected: '/);
});
