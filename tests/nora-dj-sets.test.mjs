// Nora as the DJ at the times the owner sets (owner, 2026-10-10): her set planner
// (src/lib/radio/noraPlanner.mjs), the owner's slots and the schedule they produce
// (noraSlots.mjs), the database side (noraSetStore.mjs), the hourly cron, the dashboard's
// controls, and the migration that keeps what she planned away from listeners.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BEATMATCH_MAX, COMPLEMENT, arcQuantile, artistsOf, checkProgramme, complementViolations, keyScore, matchRate,
  planSet, planTransition,
} from '../src/lib/radio/noraPlanner.mjs';
import { checkSlot, describeSlot, reconcileSets, slotOccurrences, SET_TITLE, SET_DJ } from '../src/lib/radio/noraSlots.mjs';
import { ensureProgramme, planDueSets, readHistory, syncNoraSets } from '../src/lib/radio/noraSetStore.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const HOUR = 3600000;

// ── A library ──────────────────────────────────────────────────────────────────────────────
function song(i, { bpm = 124, camelot = '8A', intensity = 0.5, artist = `Artist ${i}`, album = `Album ${i}`, dur = 240, loud = -12 } = {}) {
  const beat = bpm ? 60 / bpm : null;
  const L = bpm ? Math.floor((dur - 1) / (4 * beat)) : null;
  return {
    id: `t${i}`, title: `Song ${i}`, artist, album, label: null, isrc: null,
    analysis: {
      durationSec: dur, soundStartSec: 0.2, soundEndSec: dur - 0.5, fadeOutSec: dur - 8, loudnessDb: loud, intensity,
      bpm, downbeatSec: bpm ? 0.3 : null, lengthBars: L, firstKickBar: bpm ? 8 : null, outroBar: bpm ? L - 8 : null,
      mixOutBar: bpm ? L - 24 : null, mixInFromBar: bpm ? 8 : null, camelot,
    },
  };
}
function library(n = 40, seed = 9) {
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return Array.from({ length: n }, (_, i) => song(i, {
    bpm: r() < 0.2 ? null : Math.round(118 + r() * 12), camelot: `${1 + Math.floor(r() * 12)}${r() < 0.5 ? 'A' : 'B'}`,
    intensity: Math.round(r() * 1000) / 1000, artist: `Artist ${i % 9}`, album: `Album ${i % 13}`, dur: 180 + Math.round(r() * 180), loud: -12 - r() * 6,
  }));
}
const SET = { id: 'set-1', startsAt: '2026-10-12T23:00:00.000Z', durationMin: 60 };

// ── The rules ──────────────────────────────────────────────────────────────────────────────
test('every artist a credit names counts', () => {
  assert.deepEqual(artistsOf('Calvin Harris feat. Dua Lipa & Young Thug'), ['calvin harris', 'dua lipa', 'young thug']);
  assert.deepEqual(artistsOf('Disclosure, Sam Smith'), ['disclosure', 'sam smith']);
  assert.deepEqual(artistsOf('Fred again.. x Skrillex'), ['fred again..', 'skrillex']);
  assert.deepEqual(artistsOf('Kaytranada ft Syd'), ['kaytranada', 'syd']);
  assert.deepEqual(artistsOf(''), []);
});

test('the complement: 4 by an artist in 3 hours, 3 in a row; 3 from an album, 2 in a row; no repeat', () => {
  const p = (artist, album, at, trackId = `${artist}-${at}`) => ({ trackId, artist, album, at });
  assert.deepEqual(complementViolations([p('A', null, 0), p('A', null, 300), p('A', null, 600)]), []);
  assert.equal(complementViolations([p('A', null, 0), p('A', null, 300), p('A', null, 600), p('A', null, 900)])[0].rule, 'artist-run');
  const four = [p('A', null, 0), p('B', null, 300), p('A', null, 600), p('A', null, 900), p('B', null, 1200), p('A', null, 1500)];
  assert.deepEqual(complementViolations(four), [], 'four in three hours, never three in a row');
  assert.equal(complementViolations([...four, p('C', null, 1800), p('A', null, 2100)])[0].rule, 'artist-max');
  // Three hours later the window has moved on.
  assert.deepEqual(complementViolations([...four, p('A', null, 1500 + 3 * 3600)]), []);
  // A featured artist counts too.
  assert.equal(complementViolations([p('A', null, 0), p('B feat. A', null, 300), p('C & A', null, 600), p('A x D', null, 900)])[0].rule, 'artist-run');
  assert.equal(complementViolations([p('A', 'X', 0), p('B', 'X', 300), p('C', 'X', 600)])[0].rule, 'album-run');
  assert.equal(complementViolations([p('A', 'X', 0), p('B', 'X', 300), p('C', 'Y', 600), p('D', 'X', 900), p('E', 'Z', 1200), p('F', 'X', 1500)])[0].rule, 'album-max');
  assert.deepEqual(complementViolations([p('A', null, 0), p('B', null, 300), p('C', null, 600)]), [], 'an unknown album collides with nothing');
  assert.equal(complementViolations([p('A', null, 0, 't1'), p('B', null, 300), p('C', null, 3000, 't1')])[0].rule, 'repeat');
  // Only new plays are judged; the history is what it is.
  assert.deepEqual(complementViolations([p('A', null, -900), p('A', null, -600), p('A', null, -300), p('A', null, -200), p('B', null, 0)], { fromIndex: 4 }), []);
});

test('keys mix on the Camelot wheel; tempo locks within ±4 %', () => {
  assert.equal(keyScore('8A', '8A'), 1);
  assert.equal(keyScore('8A', '8B'), 0.9);
  assert.equal(keyScore('8A', '9A'), 0.85);
  assert.equal(keyScore('12A', '1A'), 0.85, 'the wheel wraps');
  assert.equal(keyScore('8A', '10A'), 0.45);
  assert.equal(keyScore('8A', '3B'), 0.1);
  assert.equal(keyScore(null, '8A'), 0.5);
  assert.equal(matchRate(124, 124), 1);
  assert.ok(Math.abs(matchRate(124, 128) - 124 / 128) < 1e-12);
  assert.equal(matchRate(124, 130), null, '4.8 % is too far to beat-match');
  assert.equal(matchRate(124, null), null);
  assert.equal(BEATMATCH_MAX, 0.04);
});

test('the energy arc warms up, builds, peaks and eases off', () => {
  assert.ok(arcQuantile(0) < arcQuantile(0.15));
  assert.ok(arcQuantile(0.15) < arcQuantile(0.5) && arcQuantile(0.5) < arcQuantile(0.7));
  assert.equal(arcQuantile(0.8), 0.9);
  assert.ok(arcQuantile(1) < arcQuantile(0.85));
});

test('a beat-matched transition locks the tempo, enters on the kick, on the mix-out phrase', () => {
  const a = song(1, { bpm: 124 }), b = song(2, { bpm: 126 });
  const tr = planTransition(a, b, { prevStart: 0, prevCueIn: 0, prevRate: 1 });
  assert.equal(tr.type, 'beatmatch');
  assert.equal(tr.bars, 16);
  assert.ok(Math.abs(tr.nextRate - 124 / 126) < 1e-12);
  const beat = 60 / 124;
  assert.ok(Math.abs(tr.startSec - (0.3 + a.analysis.mixOutBar * 4 * beat)) < 1e-9, 'on the outgoing song’s mix-out bar');
  assert.ok(Math.abs(tr.lengthSec - 16 * 4 * beat) < 1e-9);
  assert.ok(Math.abs(tr.nextCueIn - (0.3 + 8 * 4 * (60 / 126))) < 1e-9, 'the incoming song enters on its first kick');
  // At a rate, the outgoing song's set clock runs faster or slower.
  const fast = planTransition(a, b, { prevStart: 100, prevCueIn: 10, prevRate: 1.02 });
  assert.ok(Math.abs(fast.startSec - (100 + (0.3 + a.analysis.mixOutBar * 4 * beat - 10) / 1.02)) < 1e-9);
  assert.equal(fast.type, 'beatmatch');
  // Too far apart: a blend over the fade, at the song's own speed.
  const far = planTransition(a, song(3, { bpm: 132 }), { prevStart: 0, prevCueIn: 0, prevRate: 1 });
  assert.deepEqual([far.type, far.nextRate], ['blend', 1]);
  assert.equal(planTransition(song(1, { bpm: null }), b, { prevStart: 0, prevCueIn: 0, prevRate: 1 }).type, 'blend');
  // Clashing keys: a short fade.
  const clash = planTransition(song(1, { bpm: null, camelot: '8A' }), song(2, { bpm: null, camelot: '2B' }), { prevStart: 0, prevCueIn: 0, prevRate: 1 });
  assert.deepEqual([clash.type, clash.lengthSec], ['fade', 3]);
});

test('a set: fills the hour, keeps every rule, levels the songs, and is the same for the same set', () => {
  const tracks = library();
  const p = planSet({ tracks, set: SET });
  assert.equal(p.short, null);
  assert.ok(p.items.length >= 12, `${p.items.length} songs`);
  assert.ok(p.endsSec > 3600 - 90 && p.endsSec <= 3600 + 60, `ends at ${p.endsSec}`);
  assert.deepEqual(checkProgramme(p), []);
  assert.equal(p.items[0].mixIn.type, 'open');
  assert.equal(p.items[0].startSec, 0);
  assert.ok(p.items.filter((it) => it.mixIn.type === 'beatmatch').length >= p.items.length / 2, 'most of this library beat-matches');
  for (const it of p.items) assert.ok(it.gainDb >= -9 && it.gainDb <= 6);
  assert.deepEqual(planSet({ tracks, set: SET }), p, 'deterministic');
  assert.notDeepEqual(planSet({ tracks, set: { ...SET, id: 'set-2' } }).items.map((i) => i.trackId), p.items.map((i) => i.trackId), 'another set, another order');
  // The set's ids are the library's own.
  const ids = new Set(tracks.map((t) => t.id));
  assert.ok(p.items.every((it) => ids.has(it.trackId)));
  assert.equal(new Set(p.items.map((it) => it.trackId)).size, p.items.length, 'no song twice');
});

test('the history counts: what the station played before the set limits the set', () => {
  const tracks = library();
  const before = (mins, t) => ({ trackId: t.id, artist: t.artist, album: t.album, playedAt: new Date(Date.parse(SET.startsAt) - mins * 60000).toISOString() });
  // Artist 0 played four times in the last two hours: the set cannot play them until those age out.
  const zeros = tracks.filter((t) => t.artist === 'Artist 0').slice(0, 4);
  const history = zeros.map((t, i) => before(110 - i * 25, t));
  const p = planSet({ tracks, set: SET, history });
  assert.deepEqual(checkProgramme(p, history), []);
  // The oldest of the four leaves the 3-hour window 70 minutes in, after this 60-minute set ends.
  assert.equal(p.items.find((it) => it.artist === 'Artist 0'), undefined, 'a fifth play inside 3 hours is never planned');
  // Without the history the same set does play them (so the line above is not vacuous).
  assert.ok(planSet({ tracks, set: SET }).items.some((it) => it.artist === 'Artist 0'));
  assert.ok(!p.items.some((it) => zeros.some((z) => z.id === it.trackId)), 'a song heard in the last 3 hours is not repeated');
});

test('a library too small to fill the set ends it early and says so', () => {
  const tiny = [song(1, { artist: 'Solo', album: null }), song(2, { artist: 'Solo', album: null }), song(3, { artist: 'Solo', album: null }), song(4, { artist: 'Solo', album: null })];
  const p = planSet({ tracks: tiny, set: SET });
  assert.equal(p.items.length, 3, 'three in a row is the limit');
  assert.equal(p.short, 'rules-or-library');
  assert.deepEqual(checkProgramme(p), []);
  assert.equal(planSet({ tracks: [], set: SET }).short, 'empty-library');
  assert.throws(() => planSet({ tracks: tiny, set: { id: 'x', startsAt: 'never', durationMin: 60 } }));
});

test('a long set never plays a song twice, even once 3 hours have passed', () => {
  // 50 songs of 4 minutes fill about 3 h 20 min of a 5-hour set; past 3 hours the no-repeat rule
  // alone would let the first songs back in, so the set itself must refuse them.
  const tracks = Array.from({ length: 50 }, (_, i) => song(i, { bpm: null, artist: `A${i}`, album: null, camelot: '8A' }));
  const p = planSet({ tracks, set: { ...SET, durationMin: 300 } });
  assert.equal(new Set(p.items.map((it) => it.trackId)).size, p.items.length);
  assert.equal(p.items.length, 50);
  assert.equal(p.short, 'rules-or-library');
  assert.ok(p.endsSec > 3 * 3600, 'the set did run past 3 hours');
});

test('every song is levelled to the set’s median loudness, within −9…+6 dB', () => {
  const tracks = [song(1, { bpm: null, artist: 'A', loud: -10 }), song(2, { bpm: null, artist: 'B', loud: -14 }), song(3, { bpm: null, artist: 'C', loud: -20 }), song(4, { bpm: null, artist: 'D', loud: -30 })];
  const p = planSet({ tracks, set: { ...SET, durationMin: 30 } });
  const gain = Object.fromEntries(p.items.map((it) => [it.trackId, it.gainDb]));
  // The median of the four (sorted −30, −20, −14, −10) is the third, −14.
  assert.deepEqual(gain, { t1: -4, t2: 0, t3: 6, t4: 6 }, 'a quiet song is raised at most 6 dB');
  const loud = planSet({ tracks: [song(1, { bpm: null, artist: 'A', loud: -2 }), song(2, { bpm: null, artist: 'B', loud: -14 }), song(3, { bpm: null, artist: 'C', loud: -14 })], set: { ...SET, durationMin: 30 } });
  assert.equal(loud.items.find((it) => it.trackId === 't1').gainDb, -9, 'a loud one is lowered at most 9 dB');
});

test('a last song running more than a minute past the end fades out at the end', () => {
  const long = [song(1, { dur: 1700, bpm: null, artist: 'A' }), song(2, { dur: 1700, bpm: null, artist: 'B' }), song(3, { dur: 1700, bpm: null, artist: 'C' })];
  const p = planSet({ tracks: long, set: { ...SET, durationMin: 45 } });
  const last = p.items[p.items.length - 1];
  assert.equal(last.endSec, 45 * 60);
  assert.equal(last.fadeOutSec, 8);
  assert.equal(p.endsSec, 45 * 60);
});

test('checkProgramme catches a hand-edited plan', () => {
  const p = planSet({ tracks: library(), set: SET });
  const bad = structuredClone(p);
  bad.items[2].rate = 1.2;
  bad.items[3].startSec = bad.items[2].endSec + 30;
  const rules = checkProgramme(bad).map((x) => x.rule);
  assert.ok(rules.includes('rate') && rules.includes('gap'));
  const dup = structuredClone(p);
  dup.items[5] = { ...dup.items[5], trackId: dup.items[1].trackId };
  assert.ok(checkProgramme(dup).some((x) => x.rule === 'repeat'));
});

// ── Slots ──────────────────────────────────────────────────────────────────────────────────
test('a slot: days, a start time, 30 minutes to 6 hours, a real zone', () => {
  assert.deepEqual(checkSlot({ days: ['1', '2', '3', '4', '5'], startTime: '18:00', durationMin: 60, zone: 'America/New_York' }),
    { ok: true, value: { days: [1, 2, 3, 4, 5], start_minute: 1080, duration_min: 60, zone: 'America/New_York' } });
  assert.equal(checkSlot({ days: [], startTime: '18:00', durationMin: 60, zone: 'UTC' }).error, 'days');
  assert.equal(checkSlot({ days: [7], startTime: '18:00', durationMin: 60, zone: 'UTC' }).error, 'days');
  assert.equal(checkSlot({ days: [1], startTime: '24:00', durationMin: 60, zone: 'UTC' }).error, 'start_time');
  assert.equal(checkSlot({ days: [1], startTime: '18:00', durationMin: 20, zone: 'UTC' }).error, 'duration');
  assert.equal(checkSlot({ days: [1], startTime: '18:00', durationMin: 361, zone: 'UTC' }).error, 'duration');
  assert.equal(checkSlot({ days: [1], startTime: '18:00', durationMin: 60, zone: 'Mars/Olympus' }).error, 'zone');
  assert.equal(describeSlot({ days: [1, 2, 3, 4, 5], start_minute: 1080, duration_min: 60, zone: 'America/New_York' }), 'Mon–Fri · 6:00 pm · 60 min · America/New_York');
  assert.equal(describeSlot({ days: [0, 6], start_minute: 30, duration_min: 90, zone: 'UTC' }), 'Sun, Sat · 12:30 am · 90 min · UTC');
});

test('slot times are wall clock in the slot’s zone, across a clock change', () => {
  const slot = { id: 's1', days: [0, 1, 2, 3, 4, 5, 6], start_minute: 18 * 60, duration_min: 60, zone: 'America/New_York' };
  // 2026-11-01 is the fall-back Sunday in New York: 6 pm is 22:00Z the day before and 23:00Z after.
  const occ = slotOccurrences(slot, Date.parse('2026-10-30T12:00:00Z'), Date.parse('2026-11-03T12:00:00Z'));
  assert.deepEqual(occ.map((o) => o.startsAt), ['2026-10-30T22:00:00.000Z', '2026-10-31T22:00:00.000Z', '2026-11-01T23:00:00.000Z', '2026-11-02T23:00:00.000Z']);
  const weekdays = slotOccurrences({ ...slot, days: [1, 2, 3, 4, 5] }, Date.parse('2026-10-10T00:00:00Z'), Date.parse('2026-10-17T00:00:00Z'));
  assert.deepEqual(weekdays.map((o) => new Date(o.startsAt).getUTCDay()), [1, 2, 3, 4, 5], 'Mon–Fri, never the weekend');
  assert.deepEqual(slotOccurrences({ ...slot, zone: 'Nope/Nope' }, 0, 1e12), []);
});

test('the schedule: slots become sets; nothing planned is removed; nothing unlicensed is public', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const slot = { id: 's1', days: [1, 3], start_minute: 18 * 60, duration_min: 60, zone: 'UTC', enabled: true };
  const fresh = reconcileSets({ slots: [slot], sets: [], licensed: false, now });
  assert.deepEqual(fresh.insert.map((r) => r.starts_at), ['2026-10-12T18:00:00.000Z', '2026-10-14T18:00:00.000Z']);
  assert.ok(fresh.insert.every((r) => r.host_kind === 'nora' && r.published === false && r.title === SET_TITLE && r.dj === SET_DJ && r.slot_id === 's1'));
  assert.ok(fresh.insert.every((r) => !/song|track/i.test(r.title) && r.blurb === null), 'the show is named, never the music');
  const licensed = reconcileSets({ slots: [slot], sets: [], licensed: true, now });
  assert.ok(licensed.insert.every((r) => r.published === true));
  const row = (id, startsAt, extra = {}) => ({ id, starts_at: startsAt, duration_min: 60, host_kind: 'nora', slot_id: 's1', published: false, ...extra });
  const existing = [row('a', '2026-10-12T18:00:00.000Z'), row('b', '2026-10-13T18:00:00.000Z'), row('c', '2026-10-13T20:00:00.000Z', { planned: true }), row('d', '2026-10-10T11:00:00.000Z')];
  const r = reconcileSets({ slots: [slot], sets: existing, licensed: true, now });
  assert.deepEqual(r.insert.map((x) => x.starts_at), ['2026-10-14T18:00:00.000Z'], 'the Monday set exists already');
  assert.deepEqual(r.remove, ['b'], 'Tuesday is no longer a slot day; the planned set stays; a started set is left alone');
  assert.deepEqual(r.publish.sort(), ['a', 'c']);
  const off = reconcileSets({ slots: [], sets: [row('a', '2026-10-12T18:00:00.000Z', { published: true }), row('c', '2026-10-13T20:00:00.000Z', { planned: true, published: true })], licensed: false, now });
  assert.deepEqual([off.remove, off.unpublish], [['a'], ['c']], 'withdrawn licences unpublish even a planned set');
  // A guest set in the way keeps its time.
  const guest = { id: 'g', starts_at: '2026-10-12T18:30:00.000Z', duration_min: 60, host_kind: 'guest', slot_id: null, published: true };
  const clash = reconcileSets({ slots: [slot], sets: [guest], licensed: true, now });
  assert.deepEqual([clash.insert.length, clash.clashes.length, clash.clashes[0].with], [1, 1, 'g']);
  // Two overlapping slots: the earlier claim wins.
  const twin = reconcileSets({ slots: [slot, { ...slot, id: 's2', start_minute: 18 * 60 + 30 }], sets: [], licensed: true, now });
  assert.equal(twin.insert.length, 2);
  assert.equal(twin.clashes.length, 2);
});

// ── The database side ──────────────────────────────────────────────────────────────────────
function fakeDb(tables = {}, { fail = [] } = {}) {
  const calls = [];
  const db = {
    _t: tables, _calls: calls,
    from(table) {
      const st = { op: 'select', filters: [], payload: null, single: false };
      const rows = () => (tables[table] = tables[table] || []);
      const run = () => {
        calls.push({ table, op: st.op });
        if (fail.includes(`${st.op}:${table}`)) return { data: null, error: { message: 'fail' } };
        if (st.op === 'insert') {
          if (table === 'nora_set_programmes' && rows().some((r) => r.set_id === st.payload.set_id)) return { data: null, error: { code: '23505' } };
          if (table === 'nora_sets' && rows().some((r) => r.slot_id && r.slot_id === st.payload.slot_id && r.starts_at === st.payload.starts_at)) return { data: null, error: { code: '23505' } };
          rows().push({ id: `${table}-${rows().length + 1}`, ...st.payload });
          return { data: null, error: null };
        }
        const hit = rows().filter((r) => st.filters.every((f) => f(r)));
        if (st.op === 'update') for (const r of hit) Object.assign(r, st.payload);
        if (st.op === 'delete') tables[table] = rows().filter((r) => !hit.includes(r));
        return { data: st.single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null };
      };
      const chain = {
        select() { return chain; },
        insert(p) { st.op = 'insert'; st.payload = p; return chain; },
        update(p) { st.op = 'update'; st.payload = p; return chain; },
        delete() { st.op = 'delete'; return chain; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return chain; },
        in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return chain; },
        gte(c, v) { st.filters.push((r) => String(r[c]) >= String(v)); return chain; },
        gt(c, v) { st.filters.push((r) => String(r[c]) > String(v)); return chain; },
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

const readyTracks = () => library().map((t) => ({ ...t, status: 'ready', enabled: true }));

test('sync puts the slots on the schedule, private until licensed, and a failed read changes nothing', async () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const tables = { nora_slots: [{ id: 's1', days: [1], start_minute: 1080, duration_min: 60, zone: 'UTC', enabled: true }], nora_sets: [], nora_set_programmes: [], nora_dj_settings: [{ id: 1, licences_confirmed_at: null }] };
  const db = fakeDb(tables);
  const r = await syncNoraSets(db, { now });
  assert.deepEqual([r.ok, r.done.inserted], [true, 1]);
  assert.equal(tables.nora_sets[0].published, false);
  tables.nora_dj_settings[0].licences_confirmed_at = '2026-10-10T12:00:00Z';
  assert.equal((await syncNoraSets(db, { now })).done.published, 1);
  assert.equal(tables.nora_sets[0].published, true);
  assert.equal(tables.nora_sets.length, 1, 'a second run inserts nothing');
  const broken = fakeDb({ ...structuredClone(tables) }, { fail: ['select:nora_set_programmes'] });
  broken._t.nora_slots = [];
  const b = await syncNoraSets(broken, { now });
  assert.deepEqual([b.ok, b.error], [false, 'read_failed']);
  assert.equal(broken._t.nora_sets.length, 1, '⚠ a failed read never deletes a set');
});

test('a set is planned once, from the library and the plays before it; the first plan stored wins', async () => {
  const set = { id: 'n1', starts_at: '2026-10-12T18:00:00.000Z', duration_min: 60, host_kind: 'nora', slot_id: 's1' };
  const earlier = { id: 'n0', starts_at: '2026-10-12T16:30:00.000Z', duration_min: 60, host_kind: 'nora', slot_id: 's1' };
  const tracks = readyTracks();
  const prior = planSet({ tracks, set: { id: 'n0', startsAt: earlier.starts_at, durationMin: 60 } });
  const tables = { nora_sets: [earlier, set], nora_set_programmes: [{ set_id: 'n0', programme: prior }], radio_tracks: tracks };
  const db = fakeDb(tables);
  const { history } = await readHistory(db, set.starts_at);
  assert.equal(history.length, prior.items.length);
  const r = await ensureProgramme(db, 'n1');
  assert.deepEqual([r.stored, r.planned], [true, true]);
  assert.deepEqual(checkProgramme(r.programme, history), [], 'the earlier set’s plays count against this one');
  assert.ok(!r.programme.items.some((it) => prior.items.some((p) => p.trackId === it.trackId)), 'nothing from 90 minutes ago repeats');
  const again = await ensureProgramme(db, 'n1');
  assert.deepEqual([again.stored, again.planned, again.programme], [true, undefined, r.programme]);
  // ⚠ The stored plan is what plays, even once the library has changed under it (every song
  // turned off here): the engine asking at the start must get it, not a fresh plan or an error.
  tables.radio_tracks = [];
  const kept = await ensureProgramme(db, 'n1');
  assert.deepEqual([kept.error, kept.programme], [undefined, r.programme]);
  assert.equal(tables.nora_set_programmes.length, 2);
  assert.equal((await ensureProgramme(fakeDb({ nora_sets: [{ ...set, host_kind: 'guest' }], nora_set_programmes: [] }), 'n1')).error, 'not_a_nora_set');
  assert.equal((await ensureProgramme(fakeDb({ nora_sets: [set], nora_set_programmes: [], radio_tracks: [] }), 'n1')).error, 'empty_library');
  assert.equal((await ensureProgramme(fakeDb({ nora_sets: [set], nora_set_programmes: [], radio_tracks: tracks }, { fail: ['select:radio_tracks'] }), 'n1')).error, 'read_failed');
  // The cron plans only what starts within 70 minutes.
  const due = fakeDb({ nora_sets: [set, { ...set, id: 'n2', starts_at: '2026-10-12T21:00:00.000Z' }], nora_set_programmes: [], radio_tracks: tracks });
  const planned = await planDueSets(due, { now: Date.parse('2026-10-12T17:00:00Z') });
  assert.deepEqual(planned.results.map((x) => x.setId), ['n1']);
});

// ── The migration, the cron, the dashboard ─────────────────────────────────────────────────
test('what Nora planned names songs ahead of air, so no listener can read it', () => {
  const sql = read('supabase-migrations/2026-10-11-nora-dj-sets.sql').replace(/--.*$/gm, '');
  for (const t of ['nora_slots', 'nora_set_programmes', 'nora_dj_settings']) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${t} from public, anon, authenticated`));
  }
  assert.ok(!/create policy/i.test(sql), 'no policy opens any of them');
  assert.ok(!/grant [^;]* to (anon|authenticated)/i.test(sql));
  assert.ok(!/create (or replace )?function/i.test(sql));
  assert.match(sql, /host_kind text not null default 'guest'\s+check \(host_kind in \('guest', 'nora'\)\)/);
  assert.match(sql, /create unique index if not exists nora_sets_slot_start_uniq on public\.nora_sets \(slot_id, starts_at\) where slot_id is not null/);
  // The public schedule readers never ask for the plan.
  for (const f of ['public/newdesign/radio.jsx', 'mobile-app/src/services/shapeBackend.js']) assert.ok(!/nora_set_programmes/.test(read(f)), f);
});

test('the cron is authenticated and scheduled; the dashboard is admin-only', () => {
  const cron = read('src/app/api/cron/nora-sets/route.ts');
  const gate = cron.indexOf("if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });");
  assert.ok(gate > 0 && gate < cron.indexOf('createAdminClient()'), 'the secret is checked before anything runs');
  assert.match(cron, /safeEqual\(auth, `Bearer \$\{secret\}`\)/);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/nora-sets' && c.schedule === '5 * * * *'));
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/cron\/nora-sets', 'GET,POST'\]/);
  const actions = read('src/app/dashboard/radio/actions.ts');
  for (const fn of ['addSlot', 'setSlotEnabled', 'deleteSlot', 'confirmLicences', 'withdrawLicences', 'syncNow']) {
    const body = actions.slice(actions.indexOf(`export async function ${fn}`));
    const gate = body.indexOf('requireAdminUser()');
    assert.ok(gate > 0 && gate < body.indexOf('createAdminClient()'), `${fn}: the admin check comes first`);
  }
  assert.match(actions, /if \(formData\.get\('confirm'\) !== 'yes'\) failed\('licences_unticked'\);/);
});
