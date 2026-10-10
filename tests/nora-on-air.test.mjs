// Shape Radio on radio.co, and the website and app while Nora is the DJ: what listeners are told
// is playing (src/lib/radio/noraOnAir.mjs: only what has been heard, with its album; only while
// her engine is on the air), connecting the station (src/lib/radio/station.mjs), and the booth
// treating her own set as hers rather than a guest's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEARD_LAG_SEC, heardNow, noraOnAir } from '../src/lib/radio/noraOnAir.mjs';
import { checkStation, radioCoStatusUrl, stationIdOf } from '../src/lib/radio/station.mjs';
import { boothLabel } from '../public/newdesign/booth/noraBoothState.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SET = '11111111-2222-4333-8444-555555555555';
const START = Date.parse('2026-10-12T18:00:00.000Z');

// Two songs: the second beat-matched in at 200 s over 32 s (half way at 216 s).
const PROGRAMME = {
  endsSec: 420,
  items: [
    { trackId: 't1', title: 'First', artist: 'A', album: 'LP One', startSec: 0, endSec: 232, rate: 1, bpm: 124, mixIn: { type: 'open', lengthSec: 0 } },
    { trackId: 't2', title: 'Second', artist: 'B', album: null, startSec: 200, endSec: 420, rate: 0.98413, bpm: 126, mixIn: { type: 'beatmatch', lengthSec: 32, bars: 16 } },
  ],
};
const at = (heardSec) => START + (heardSec + HEARD_LAG_SEC) * 1000;

test('only what has been heard: the lag, the blend, the end', () => {
  assert.equal(heardNow(PROGRAMME, START, START), null, 'the first seconds are still on their way to listeners');
  assert.equal(heardNow(PROGRAMME, START, at(0)).item.title, 'First');
  const before = heardNow(PROGRAMME, START, at(199.9));
  assert.deepEqual([before.item.title, before.mixing], ['First', false], '⚠ the next song is not named before it is heard');
  const early = heardNow(PROGRAMME, START, at(210));
  assert.deepEqual([early.item.title, early.mixing], ['First', true], 'through the first half of the blend, the outgoing song');
  const late = heardNow(PROGRAMME, START, at(216));
  assert.deepEqual([late.item.title, late.mixing], ['Second', true], 'from the bass swap, the incoming one');
  assert.equal(heardNow(PROGRAMME, START, at(240)).mixing, false);
  assert.equal(heardNow(PROGRAMME, START, at(420)), null, 'the set is over');
  // The tempo the booth follows is the tempo heard: the song's own, at its rate.
  assert.equal(heardNow(PROGRAMME, START, at(300)).playedBpm, 124);
  assert.equal(heardNow({ ...PROGRAMME, items: [{ ...PROGRAMME.items[0], bpm: null }] }, START, at(5)).playedBpm, null);
  // A lag is a parameter, not a constant somewhere else.
  assert.equal(heardNow(PROGRAMME, START, START + 199.9 * 1000, { lagSec: 0 }).item.title, 'First');
});

function fakeDb(tables) {
  return {
    from(table) {
      const st = { filters: [], single: false, order: null, limit: null };
      const run = () => {
        let rows = (tables[table] || []).filter((r) => st.filters.every((f) => f(r)));
        if (st.order) rows = [...rows].sort((a, b) => (String(a[st.order.c]) < String(b[st.order.c]) ? -1 : 1) * (st.order.asc ? 1 : -1));
        if (st.limit != null) rows = rows.slice(0, st.limit);
        return { data: st.single ? rows[0] || null : rows, error: null };
      };
      const chain = {
        select() { return chain; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return chain; },
        lte(c, v) { st.filters.push((r) => String(r[c]) <= String(v)); return chain; },
        gt(c, v) { st.filters.push((r) => String(r[c]) > String(v)); return chain; },
        order(c, o) { st.order = { c, asc: !(o && o.ascending === false) }; return chain; },
        limit(n) { st.limit = n; return chain; },
        maybeSingle() { st.single = true; return chain; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return chain;
    },
  };
}
const tables = (log, over = {}) => ({
  nora_sets: [{ id: SET, starts_at: '2026-10-12T18:00:00.000Z', duration_min: 30, host_kind: 'nora', published: true }],
  nora_engine_log: log.map((event, i) => ({ set_id: SET, event, logged_at: `2026-10-12T18:00:0${i}.000Z` })),
  nora_set_programmes: [{ set_id: SET, programme: PROGRAMME }],
  ...over,
});

test('while her engine is on the air, the song, artist and album come from her set', async () => {
  const np = await noraOnAir(fakeDb(tables(['started', 'song'])), { now: at(30) });
  assert.deepEqual(np, { title: 'First', artist: 'A', album: 'LP One', isNora: true, simulated: false, nora: { setId: SET, bpm: 124, mixing: false } });
  // ⚠ Not on the air: never started, or stopped (the AutoDJ took over), or finished.
  assert.equal(await noraOnAir(fakeDb(tables([])), { now: at(30) }), null);
  assert.equal(await noraOnAir(fakeDb(tables(['started', 'song', 'failed'])), { now: at(30) }), null);
  assert.equal(await noraOnAir(fakeDb(tables(['started', 'ended'])), { now: at(30) }), null);
  // A guest set, or an unpublished one, is not hers.
  assert.equal(await noraOnAir(fakeDb(tables(['started'], { nora_sets: [{ ...tables([]).nora_sets[0], host_kind: 'guest' }] })), { now: at(30) }), null);
  assert.equal(await noraOnAir(fakeDb(tables(['started'], { nora_sets: [{ ...tables([]).nora_sets[0], published: false }] })), { now: at(30) }), null);
});

test('the route asks for her set first, and any fault there falls through to the station', () => {
  const route = read('src/app/api/radio/now-playing/route.ts');
  const nora = route.indexOf('await noraOnAir(createAdminClient(), { now: Date.now() })');
  assert.ok(nora > 0 && nora < route.indexOf('getProvider(cfg)'));
  assert.match(route, /try \{\s+const nora = await noraOnAir[\s\S]*?\} catch \{/);
  // The surfaces show what she sends, album included, and nothing names a next song.
  assert.ok(!/next|upcoming/i.test(read('src/lib/radio/noraOnAir.mjs').split('export async function noraOnAir')[1].replace(/\/\/.*$/gm, '')));
});

test('connecting radio.co: https, a radio.co stream, a station id; its public status is the now-playing source', () => {
  const ok = checkStation({ streamUrl: ' https://s5.radio.co/s0a1b2c3d4/listen ', stationId: 's0a1b2c3d4' });
  assert.deepEqual(ok, { ok: true, value: { provider: 'http', stream_url: 'https://s5.radio.co/s0a1b2c3d4/listen', now_playing_url: 'https://public.radio.co/stations/s0a1b2c3d4/status' } });
  assert.equal(checkStation({ streamUrl: 'http://s5.radio.co/x/listen', stationId: 's0a1b2c3d4' }).error, 'stream_https');
  assert.equal(checkStation({ streamUrl: 'https://evil.example/listen', stationId: 's0a1b2c3d4' }).error, 'stream_not_radio_co');
  assert.equal(checkStation({ streamUrl: 'https://notradio.co.evil.example/x', stationId: 's0a1b2c3d4' }).error, 'stream_not_radio_co');
  assert.equal(checkStation({ streamUrl: 'https://u:p@s5.radio.co/x', stationId: 's0a1b2c3d4' }).error, 'stream_url');
  assert.equal(checkStation({ streamUrl: 'https://s5.radio.co/x', stationId: '../x' }).error, 'station_id');
  assert.equal(stationIdOf(radioCoStatusUrl('s0a1b2c3d4')), 's0a1b2c3d4');
  assert.equal(stationIdOf('https://elsewhere/x'), null);
  const actions = read('src/app/dashboard/radio/actions.ts');
  for (const fn of ['connectStation', 'disconnectStation']) {
    const body = actions.slice(actions.indexOf(`export async function ${fn}`));
    const gate = body.indexOf('requireAdminUser()');
    assert.ok(gate > 0 && gate < body.indexOf('createAdminClient()'), `${fn}: the admin check first`);
  }
});

test('⚠ her own set is hers, not a guest’s, and "Nora’s mix" only while her engine is on the air', () => {
  for (const f of ['public/newdesign/radio.jsx', 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx']) {
    const src = read(f);
    assert.match(src, /host_kind === ["']nora["']/, `${f}: a Nora set is recognised`);
    assert.match(src, /\.dj && !noraSet \? String\(/, `${f}: …and never read as a guest`);
    assert.match(src, /nowPlaying\.isNora === true && [\w.]*nowPlaying\.nora \?/, `${f}: hers only on the server's word`);
    assert.match(src, /cueSheet: !!noraNow/, `${f}: the label follows it`);
  }
  // The label: on the air with her set's tempo, "Nora's mix"; the same set with the engine
  // stopped (no noraNow) is the station's, and with no measured beat says so.
  assert.equal(boothLabel({ station: { playing: true, bpm: 124, guest: null, cueSheet: true } }).key, 'norasMix');
  assert.equal(boothLabel({ station: { playing: true, bpm: null, guest: null, cueSheet: false } }).key, 'noBeat');
  assert.equal(boothLabel({ station: { playing: true, bpm: 124, guest: 'Nora', cueSheet: true } }).key, 'guest', 'which is why her set must not be read as a guest');
});

test('the album is shown beside the artist while a song plays', () => {
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx');
  assert.match(app, /byline: has\(np && np\.artist\) \? \(has\(np && np\.album\) \? `\$\{np\.artist\} · \$\{np\.album\}` : np\.artist\) : '—',/);
  assert.equal((app.match(/\{np\.byline\}/g) || []).length, 3, 'on the Home card, the mini player and the Radio screen');
  assert.match(read('public/newdesign/radioInstrument.jsx'), /\{artist \? \(album \? `\$\{artist\} · \$\{album\}` : artist\)/);
});
