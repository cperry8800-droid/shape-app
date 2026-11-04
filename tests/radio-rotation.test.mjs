// Shape Radio's own rotation (src/lib/radio/rotation.mjs): what the station plays between Nora's
// sets, planned by Shape an hour at a time under the same rules as her sets, and handed to her
// engine with her sets first. The planner's two new inputs (the plays planned AFTER a set, and a
// hard end), the station's job and its in-play check, the play log and report taking a block, and
// the migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSet, checkProgramme, complementViolations, HARD_END_SLACK_SEC } from '../src/lib/radio/noraPlanner.mjs';
import { stationJob, stationCheck, BLOCK_SEC, MIN_BLOCK_SEC, JOIN_LEAD_SEC } from '../src/lib/radio/rotation.mjs';
import { readHistory, draftProgramme } from '../src/lib/radio/noraSetStore.mjs';
import { recordEngineEvent, playsCsv } from '../src/lib/radio/noraEngineApi.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const LIMIT = { timeout: 120000 };
const iso = (ms) => new Date(ms).toISOString();
const uuid = (a, n) => `${a.repeat(8)}-${String(n).padStart(4, '0')}-4000-8000-${String(n).padStart(12, '0')}`;
const SET = uuid('5', 1), SET2 = uuid('5', 2), BLK = uuid('b', 1), BLK2 = uuid('b', 2);

// ── A library ──────────────────────────────────────────────────────────────────────────────
function track(n, artist, album) {
  const dur = 200 + ((n * 37) % 80);
  return {
    id: uuid('a', n), title: `Song ${n}`, artist, album, label: 'Lbl', isrc: null, storage_path: `tracks/${uuid('a', n)}.mp3`, status: 'ready', enabled: true,
    analysis: { durationSec: dur, soundStartSec: 0.4, soundEndSec: dur - 1, fadeOutSec: dur - 9, bpm: 118 + (n % 10), camelot: `${1 + (n % 12)}${n % 2 ? 'A' : 'B'}`, intensity: (n % 10) / 10, loudnessDb: -9 - (n % 4) },
  };
}
/** 16 artists with 3 songs each, 24 albums of 2. */
const LIBRARY = Array.from({ length: 48 }, (_, i) => track(i + 1, `Artist ${i % 16}`, `Album ${i % 24}`));

// ── A fake service-role client ─────────────────────────────────────────────────────────────
function fakeDb(tables, { fail = [], missing = [], noBlockColumn = false, race = null } = {}) {
  const db = {
    _t: tables, signed: [],
    storage: { from: () => ({ createSignedUrl: async (path, ttl) => { db.signed.push({ path, ttl }); return { data: { signedUrl: `https://store/${path}?ttl=${ttl}` }, error: null }; } }) },
    from(table) {
      const st = { op: 'select', cols: '', filters: [], payload: null, single: false };
      const rows = () => (tables[table] = tables[table] || []);
      const run = () => {
        if (missing.includes(table)) return { data: null, error: { code: 'PGRST205', message: 'no table' } };
        if (fail.includes(`${st.op}:${table}`)) return { data: null, error: { message: 'x' } };
        if (st.op === 'select' && noBlockColumn && table === 'nora_engine_log' && st.cols.includes('block_id')) return { data: null, error: { code: '42703' } };
        if (st.op === 'insert') {
          if (race && table === 'radio_rotation_blocks') { rows().push(race(st.payload)); race = null; }
          if (table === 'radio_rotation_blocks' && rows().some((r) => r.starts_at === st.payload.starts_at)) return { data: null, error: { code: '23505' } };
          rows().push({ ...st.payload });
          return { data: null, error: null };
        }
        let hit = rows().filter((r) => st.filters.every((f) => f(r)));
        if (st.range) hit = hit.slice(st.range[0], st.range[1] + 1);
        return { data: st.single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null };
      };
      const chain = {
        select(c) { st.cols = c || ''; return chain; },
        insert(p) { st.op = 'insert'; st.payload = p; return chain; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return chain; },
        in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return chain; },
        gt(c, v) { st.filters.push((r) => String(r[c]) > String(v)); return chain; },
        gte(c, v) { st.filters.push((r) => String(r[c]) >= String(v)); return chain; },
        lt(c, v) { st.filters.push((r) => String(r[c]) < String(v)); return chain; },
        lte(c, v) { st.filters.push((r) => String(r[c]) <= String(v)); return chain; },
        neq(c, v) { st.filters.push((r) => r[c] !== v); return chain; },
        is(c, v) { st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return chain; },
        or() { return chain; },
        order() { return chain; },
        range(a, b) { st.range = [a, b]; return chain; },
        limit() { return chain; },
        maybeSingle() { st.single = true; return chain; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return chain;
    },
  };
  return db;
}
const NOW = Date.parse('2026-11-03T12:00:00.000Z');
const tables = (over = {}) => ({
  nora_dj_settings: [{ id: 1, licences_confirmed_at: '2026-10-01T00:00:00Z' }],
  nora_sets: [], nora_set_programmes: [], radio_rotation_blocks: [], nora_engine_log: [],
  radio_tracks: LIBRARY.map((t) => ({ ...t })),
  ...over,
});
const noraSet = (id, startMs, min = 60, extra = {}) => ({ id, starts_at: iso(startMs), duration_min: min, published: true, host_kind: 'nora', ...extra });
const endOf = (body) => Date.parse((body.block || body.set).startsAt) + body.programme.endsSec * 1000;
const playsOf = (startMs, programme) => programme.items.map((it) => ({ trackId: it.trackId, artist: it.artist, album: it.album, playedAt: iso(startMs + it.startSec * 1000) }));

// ── The planner's new inputs ───────────────────────────────────────────────────────────────
test('⚠ a set is planned against what is already planned AFTER it: no song breaks a rule with those plays', LIMIT, () => {
  // Six songs by Z, and the next block (starting at this set's end) plays Z four times.
  const z = Array.from({ length: 6 }, (_, i) => ({ ...track(100 + i, 'Z', `Z${i}`), analysis: { ...track(100 + i, 'Z', `Z${i}`).analysis, intensity: 0.5 } }));
  const tracks = [...z, ...LIBRARY.slice(0, 10)];
  const set = { id: 'x', startsAt: iso(NOW), durationMin: 60 };
  const future = [0, 1, 2, 3].map((k) => ({ trackId: z[k].id, artist: 'Z', album: `Z${k}`, playedAt: iso(NOW + 3600000 + k * 240000) }));
  const without = planSet({ tracks, set, seed: 's' });
  assert.ok(without.items.some((it) => it.artist === 'Z'), 'without the future, Z is played (the test bites)');
  const withFuture = planSet({ tracks, set, future, seed: 's' });
  assert.ok(!withFuture.items.some((it) => it.artist === 'Z'), 'with it, no Z: a fifth Z within 3 hours would break the per-artist limit');
  assert.deepEqual(checkProgramme(withFuture, [], { future }), []);
  // And checkProgramme finds the break a stored plan would make with what follows.
  const bad = checkProgramme(without, [], { future });
  assert.ok(bad.some((p) => p.rule === 'artist-max' && Number.isInteger(p.ahead)), JSON.stringify(bad));
  // A break the plan ahead already had on its own is not this set's doing.
  const crowded = [...future, { trackId: z[4].id, artist: 'Z', album: 'Z4', playedAt: iso(NOW + 3600000 + 5 * 240000) }];
  assert.ok(complementViolations(crowded.map((p) => ({ ...p, at: Date.parse(p.playedAt) / 1000 }))).length > 0);
  assert.deepEqual(checkProgramme(withFuture, [], { future: crowded }), []);
});

test('⚠ hardEnd: a block fills to its end and fades out on it, so the next set starts on time', LIMIT, () => {
  for (const min of [20, 29.5, 47]) {
    const p = planSet({ tracks: LIBRARY, set: { id: null, startsAt: iso(NOW), durationMin: min }, seed: `h${min}`, hardEnd: true });
    const d = Math.round(min * 60);
    const last = p.items.at(-1);
    assert.ok(p.endsSec <= d + 1e-6, `${min} min: never past the end (${p.endsSec} of ${d})`);
    assert.ok(p.endsSec >= d - HARD_END_SLACK_SEC, `${min} min: filled to within ${HARD_END_SLACK_SEC} s (${p.endsSec} of ${d})`);
    if (last.endSec === d) assert.ok(last.fadeOutSec > 0, 'a song cut by the end fades out on it');
  }
  // A block shorter than one song: that song, faded out at the end.
  const tiny = planSet({ tracks: LIBRARY, set: { id: null, startsAt: iso(NOW), durationMin: MIN_BLOCK_SEC / 60 }, seed: 't', hardEnd: true });
  assert.deepEqual([tiny.items.length, tiny.endsSec, tiny.items[0].endSec], [1, MIN_BLOCK_SEC, MIN_BLOCK_SEC]);
  assert.ok(tiny.items[0].fadeOutSec > 0);
  // Without hardEnd, a set may end up to 90 s early or a minute late, as before.
  const free = planSet({ tracks: LIBRARY, set: { id: 'f', startsAt: iso(NOW), durationMin: 20 }, seed: 'h20' });
  assert.ok(free.endsSec >= 1200 - 90 && free.endsSec <= 1200 + 60);
});

// ── The station's job ──────────────────────────────────────────────────────────────────────
test('⚠ nothing goes on the air without the licences, and nothing is planned', LIMIT, async () => {
  const db = fakeDb(tables({ nora_dj_settings: [{ id: 1, licences_confirmed_at: null }] }));
  const r = await stationJob(db, { now: NOW });
  assert.deepEqual(r, { status: 200, body: { nowMs: NOW, set: null, block: null, reason: 'unlicensed' } });
  assert.equal(db._t.radio_rotation_blocks.length, 0);
  const check = await stationCheck(fakeDb(tables({ nora_dj_settings: [{ id: 1, licences_confirmed_at: null }] })), { now: NOW, blockId: BLK });
  assert.deepEqual(check.body, { stop: true, reason: 'unlicensed' });
});

test('an empty schedule: an hour of the library, from a few seconds out, stored, with a link to each song', LIMIT, async () => {
  const db = fakeDb(tables());
  const r = await stationJob(db, { now: NOW });
  assert.equal(r.status, 200);
  const { block, programme, sources } = r.body;
  assert.equal(block.startsAt, iso(NOW + JOIN_LEAD_SEC * 1000), 'a few seconds out, so the engine can load the first song');
  assert.equal(block.durationSec, BLOCK_SEC);
  assert.ok(programme.endsSec >= BLOCK_SEC - 90 && programme.endsSec <= BLOCK_SEC + 60);
  assert.deepEqual(checkProgramme(programme, []), []);
  assert.deepEqual(Object.keys(sources).sort(), [...new Set(programme.items.map((it) => it.trackId))].sort());
  assert.ok(db.signed.every((s) => s.ttl >= programme.endsSec + JOIN_LEAD_SEC + 3600), 'the links outlive the block by an hour');
  const row = db._t.radio_rotation_blocks[0];
  assert.deepEqual([db._t.radio_rotation_blocks.length, row.id, row.starts_at, row.duration_sec, row.planner_version], [1, block.id, block.startsAt, BLOCK_SEC, 1]);
  // Asked again (a retry, a restart): the same block, joined where it is; nothing new is planned.
  const again = await stationJob(db, { now: NOW + 600000 });
  assert.deepEqual([again.body.block.id, db._t.radio_rotation_blocks.length], [block.id, 1]);
});

test('⚠ a block that runs into one of Nora\'s sets ends on her start, and her set follows', LIMIT, async () => {
  const setStart = NOW + 30 * 60000;
  const db = fakeDb(tables({ nora_sets: [noraSet(SET, setStart)] }));
  const r = await stationJob(db, { now: NOW });
  const startMs = NOW + JOIN_LEAD_SEC * 1000;
  assert.equal(r.body.block.durationSec, (setStart - startMs) / 1000);
  assert.ok(endOf(r.body) <= setStart, 'never past her start');
  assert.ok(endOf(r.body) >= setStart - HARD_END_SLACK_SEC * 1000, 'and filled to it');
  // The engine asks, ahead of time, for what follows the block: her set (planned now if need be).
  const next = await stationJob(db, { now: endOf(r.body) - 120000, after: iso(endOf(r.body)) });
  assert.equal(next.body.set.id, SET);
  assert.ok(db._t.nora_set_programmes.length === 1, 'her set was planned on the spot');
  // ⚠ Her plan saw the block before it: no song of the block is repeated in her set.
  const blockSongs = new Set(r.body.programme.items.map((it) => it.trackId));
  assert.ok(!next.body.programme.items.some((it) => blockSongs.has(it.trackId)));
  assert.deepEqual(checkProgramme(next.body.programme, playsOf(startMs, r.body.programme)), []);
  // And after her set, the rotation picks up where it ends.
  const setEnd = endOf(next.body);
  const after = await stationJob(db, { now: setEnd - 120000, after: iso(setEnd) });
  assert.equal(after.body.block.startsAt, iso(setEnd));
});

test('⚠ her set comes first: on now, it is handed out even over a stored block, which is not played again', LIMIT, async () => {
  const blockStart = NOW - 20 * 60000;
  const programme = planSet({ tracks: LIBRARY, set: { id: null, startsAt: iso(blockStart), durationMin: 60 }, seed: 'b' });
  const db = fakeDb(tables({
    radio_rotation_blocks: [{ id: BLK, starts_at: iso(blockStart), duration_sec: 3600, programme, planner_version: 1 }],
    nora_sets: [noraSet(SET, NOW - 5 * 60000)],   // scheduled after the block was planned
  }));
  const r = await stationJob(db, { now: NOW });
  assert.equal(r.body.set.id, SET);
  // Its set skipped by the engine (it failed twice): the block it overlaps is still not handed out;
  // a new one is planned from now.
  const r2 = await stationJob(db, { now: NOW, skip: [SET] });
  assert.ok(r2.body.block && r2.body.block.id !== BLK);
  // A set scheduled to start INSIDE a stored block: the block is not handed out, and the new
  // block ends on her start.
  const db3 = fakeDb(tables({
    radio_rotation_blocks: [{ id: BLK, starts_at: iso(blockStart), duration_sec: 3600, programme, planner_version: 1 }],
    nora_sets: [noraSet(SET, NOW + 10 * 60000)],
  }));
  const r3 = await stationJob(db3, { now: NOW });
  assert.notEqual(r3.body.block.id, BLK);
  assert.ok(endOf(r3.body) <= NOW + 10 * 60000);
});

test('the rotation follows itself: each block starts where the last ends, and the rules hold across them', LIMIT, async () => {
  const db = fakeDb(tables());
  let r = await stationJob(db, { now: NOW });
  const all = [];
  for (let k = 0; k < 4; k++) {
    const startMs = Date.parse(r.body.block.startsAt);
    all.push(...playsOf(startMs, r.body.programme));
    const end = endOf(r.body);
    const next = await stationJob(db, { now: end - 120000, after: iso(end) });
    assert.equal(next.body.block.startsAt, iso(end), `block ${k + 2} starts where block ${k + 1} ends`);
    r = next;
  }
  const plays = all.map((p) => ({ ...p, at: Date.parse(p.playedAt) / 1000 }));
  assert.deepEqual(complementViolations(plays), [], 'four hours of rotation break no rule');
});

test('skip, a short gap, a late or early ask, and a block another ask stored first', LIMIT, async () => {
  // A stored block the engine skips (it failed twice): a new one from now, ending where the next
  // stored block starts.
  const p1 = planSet({ tracks: LIBRARY, set: { id: null, startsAt: iso(NOW - 600000), durationMin: 60 }, seed: '1' });
  const laterStart = NOW + 20 * 60000;
  const p2 = planSet({ tracks: LIBRARY, set: { id: null, startsAt: iso(laterStart), durationMin: 60 }, seed: '2' });
  const db = fakeDb(tables({ radio_rotation_blocks: [
    { id: BLK, starts_at: iso(NOW - 600000), duration_sec: 3600, programme: p1, planner_version: 1 },
    { id: BLK2, starts_at: iso(laterStart), duration_sec: 3600, programme: p2, planner_version: 1 },
  ] }));
  const r = await stationJob(db, { now: NOW, skip: [BLK] });
  assert.ok(![BLK, BLK2].includes(r.body.block.id));
  assert.ok(endOf(r.body) <= laterStart);
  // Her set starts within MIN_BLOCK_SEC of the moment asked about: it is handed out (the engine
  // bridges the moment); a little further and Shape says when the next segment starts.
  const s = NOW + 15 * 60000;
  const near = fakeDb(tables({ nora_sets: [noraSet(SET, s)] }));
  assert.equal((await stationJob(near, { now: NOW, after: iso(s - (MIN_BLOCK_SEC - 5) * 1000) })).body.set.id, SET);
  const blk = await stationJob(near, { now: s - 60000, after: iso(s - (MIN_BLOCK_SEC + 5) * 1000) });
  assert.ok(blk.body.block, 'a gap a little longer than MIN_BLOCK_SEC gets a short block');
  // Two of her sets 15 s apart: the second is handed out at the first's end (the engine bridges it).
  const two = fakeDb(tables({ nora_sets: [noraSet(SET, s), noraSet(SET2, s + 3600000 + 30000)], nora_set_programmes: [{ set_id: SET, programme: { endsSec: 3600 + 15, items: [] } }] }));
  assert.equal((await stationJob(two, { now: s + 3500000, after: iso(s + 3615000) })).body.set.id, SET2);
  // Starting cold 25 s before her set: too short for a block, so Shape says when she starts.
  const cold = await stationJob(fakeDb(tables({ nora_sets: [noraSet(SET, s)] })), { now: s - 25000 });
  assert.deepEqual([cold.body.set, cold.body.block, cold.body.nextAt], [null, null, iso(s)]);
  // An ask too far either side is refused; so is a malformed skip.
  assert.equal((await stationJob(fakeDb(tables()), { now: NOW, after: iso(NOW + 16 * 60000) })).status, 400);
  assert.equal((await stationJob(fakeDb(tables()), { now: NOW, after: iso(NOW - 11 * 60000) })).status, 400);
  assert.equal((await stationJob(fakeDb(tables()), { now: NOW, after: 'soon' })).status, 400);
  assert.equal((await stationJob(fakeDb(tables()), { now: NOW, skip: ['x'] })).status, 400);
  // A late ask (its moment already past) joins what is on now.
  const late = fakeDb(tables());
  const lr = await stationJob(late, { now: NOW, after: iso(NOW - 5000) });
  assert.equal(lr.body.block.startsAt, iso(NOW + JOIN_LEAD_SEC * 1000));
  // Two asks for the same moment at once: the second to store finds the first's block, and plays it.
  const rival = { id: uuid('c', 9) };
  const raced = fakeDb(tables(), { race: (row) => ({ ...row, id: rival.id }) });
  const rr = await stationJob(raced, { now: NOW });
  assert.equal(rr.body.block.id, rival.id);
  assert.equal(raced._t.radio_rotation_blocks.length, 1);
});

test('⚠ a plan that breaks a rule is never stored or played (a song whose analysis is broken)', LIMIT, async () => {
  // A song measured as ending where it starts: the plan holds an item of no length.
  const broken = { ...track(200, 'B', 'Bx'), analysis: { ...track(200, 'B', 'Bx').analysis, soundStartSec: 5, soundEndSec: 5 } };
  const db = fakeDb(tables({ radio_tracks: [broken] }));
  const r = await stationJob(db, { now: NOW });
  assert.deepEqual([r.status, r.body.error], [409, 'plan_breaks_rules']);
  assert.ok(r.body.problems.some((p) => p.rule === 'empty'));
  assert.equal(db._t.radio_rotation_blocks.length, 0, 'nothing stored');
});

test('⚠ her set is planned against a rotation block already stored after it', LIMIT, async () => {
  // Z dominates the library; the block stored after her set plays Z four times.
  const z = Array.from({ length: 6 }, (_, i) => ({ ...track(300 + i, 'Z', `Z${i}`), analysis: { ...track(300 + i, 'Z', `Z${i}`).analysis, intensity: 0.5 } }));
  const lib = [...z, ...LIBRARY.slice(0, 8)].map((t) => ({ ...t }));
  const setStart = NOW, setEnd = NOW + 3600000;
  const after = { startsAt: iso(setEnd), durationSec: 3600, endsSec: 1000, items: [0, 1, 2, 3].map((k) => ({ trackId: z[k].id, artist: 'Z', album: `Z${k}`, startSec: k * 240, endSec: k * 240 + 240 })) };
  const db = fakeDb(tables({ radio_tracks: lib, radio_rotation_blocks: [{ id: BLK, starts_at: iso(setEnd), duration_sec: 3600, programme: after, planner_version: 1 }] }));
  const draft = await draftProgramme(db, { id: SET, starts_at: iso(setStart), duration_min: 60 });
  assert.deepEqual(draft.problems, []);
  assert.ok(!draft.programme.items.some((it) => it.artist === 'Z'), 'no fifth Z within 3 hours of the block\'s four');
  // Without the block, she plays Z (the test bites).
  const free = await draftProgramme(fakeDb(tables({ radio_tracks: lib })), { id: SET, starts_at: iso(setStart), duration_min: 60 });
  assert.ok(free.programme.items.some((it) => it.artist === 'Z'));
});

test('a set that cannot be played gives its time to the rotation; an empty library, a missing table or a failed read gives nothing', LIMIT, async () => {
  // Her set's programme names a song since deleted.
  const programme = { startsAt: iso(NOW - 600000), durationSec: 3600, endsSec: 3600, items: [{ trackId: uuid('d', 1), artist: 'Gone', startSec: 0, endSec: 3600 }] };
  const db = fakeDb(tables({ nora_sets: [noraSet(SET, NOW - 600000)], nora_set_programmes: [{ set_id: SET, programme }] }));
  const r = await stationJob(db, { now: NOW });
  assert.ok(r.body.block, 'the rotation plays instead of silence');
  assert.deepEqual((await stationJob(fakeDb(tables({ radio_tracks: [] })), { now: NOW })).body, { nowMs: NOW, set: null, block: null, reason: 'empty_library' });
  assert.deepEqual(await stationJob(fakeDb(tables(), { missing: ['radio_rotation_blocks'] }), { now: NOW }), { status: 503, body: { error: 'not_set_up' } });
  for (const t of ['nora_dj_settings', 'nora_sets', 'radio_tracks', 'nora_set_programmes']) {
    const f = await stationJob(fakeDb(tables({ nora_sets: [noraSet(SET, NOW + 1800000)], nora_set_programmes: [] }), { fail: [`select:${t}`] }), { now: NOW });
    assert.equal(f.status, 503, `a failed read of ${t} is a fault, not an empty answer`);
  }
  const w = await stationJob(fakeDb(tables(), { fail: ['insert:radio_rotation_blocks'] }), { now: NOW });
  assert.deepEqual([w.status, w.body.error], [503, 'write_failed']);
});

test('⚠ the in-play check: a set now scheduled inside a block cuts it at her start; a withdrawn set stops', LIMIT, async () => {
  const blockStart = NOW - 10 * 60000;
  const programme = planSet({ tracks: LIBRARY, set: { id: null, startsAt: iso(blockStart), durationMin: 60 }, seed: 'c' });
  const base = { radio_rotation_blocks: [{ id: BLK, starts_at: iso(blockStart), duration_sec: 3600, programme, planner_version: 1 }] };
  assert.deepEqual((await stationCheck(fakeDb(tables(base)), { now: NOW, blockId: BLK })).body, { ok: true });
  const inside = await stationCheck(fakeDb(tables({ ...base, nora_sets: [noraSet(SET, NOW + 15 * 60000)] })), { now: NOW, blockId: BLK });
  assert.deepEqual(inside.body, { ok: true, cutAt: iso(NOW + 15 * 60000) });
  const already = await stationCheck(fakeDb(tables({ ...base, nora_sets: [noraSet(SET, NOW - 60000)] })), { now: NOW, blockId: BLK });
  assert.equal(already.body.cutAt, iso(NOW), 'one that has already begun: now');
  // The set the block was planned to end on does not cut it, nor does the one it follows.
  const end = blockStart + programme.endsSec * 1000;
  const meets = await stationCheck(fakeDb(tables({ ...base, nora_sets: [noraSet(SET, end), noraSet(SET2, blockStart - 3600000)], nora_set_programmes: [{ set_id: SET2, programme: { endsSec: 3600, items: [] } }] })), { now: NOW, blockId: BLK });
  assert.deepEqual(meets.body, { ok: true });
  // ⚠ Segments meet end to start, and an end need not be a whole millisecond (a stored programme
  // can hold one; an ISO time cannot): a block whose end and her start meet within a millisecond
  // is not cut, nor superseded.
  const frac = { startsAt: iso(blockStart), durationSec: 1800, endsSec: 1799.8735, items: programme.items.filter((it) => it.startSec < 1700).map((it) => ({ ...it })) };
  const fracEnd = blockStart + frac.endsSec * 1000;
  assert.notEqual(fracEnd, Math.floor(fracEnd), 'the end is not a whole millisecond (the case under test)');
  const fracDb = () => fakeDb(tables({ radio_rotation_blocks: [{ id: BLK, starts_at: iso(blockStart), duration_sec: 1800, programme: frac, planner_version: 1 }], nora_sets: [noraSet(SET, Math.floor(fracEnd))] }));
  assert.deepEqual((await stationCheck(fracDb(), { now: NOW, blockId: BLK })).body, { ok: true });
  assert.equal((await stationJob(fracDb(), { now: NOW })).body.block.id, BLK, 'and it is still handed out');
  // A skipped set does not cut.
  assert.deepEqual((await stationCheck(fakeDb(tables({ ...base, nora_sets: [noraSet(SET, NOW + 60000)] })), { now: NOW, blockId: BLK, skip: [SET] })).body, { ok: true });
  // Her set itself: on while published.
  assert.deepEqual((await stationCheck(fakeDb(tables({ nora_sets: [noraSet(SET, NOW)] })), { now: NOW, setId: SET })).body, { ok: true });
  assert.deepEqual((await stationCheck(fakeDb(tables({ nora_sets: [noraSet(SET, NOW, 60, { published: false })] })), { now: NOW, setId: SET })).body, { stop: true, reason: 'unpublished' });
  assert.deepEqual((await stationCheck(fakeDb(tables()), { now: NOW, blockId: BLK })).body, { stop: true, reason: 'gone' });
  assert.equal((await stationCheck(fakeDb(tables()), { now: NOW })).status, 400);
  assert.equal((await stationCheck(fakeDb(tables()), { now: NOW, setId: SET, blockId: BLK })).status, 400);
  assert.equal((await stationCheck(fakeDb(tables()), { now: NOW, blockId: 'x' })).status, 400);
});

// ── History, the log and the report ────────────────────────────────────────────────────────
test('⚠ the history Nora\'s sets are planned against includes the rotation; before the migration, there is none', LIMIT, async () => {
  const blockStart = NOW - 3600000;
  const programme = planSet({ tracks: LIBRARY, set: { id: null, startsAt: iso(blockStart), durationMin: 60 }, seed: 'h' });
  const db = fakeDb(tables({ radio_rotation_blocks: [{ id: BLK, starts_at: iso(blockStart), duration_sec: 3600, programme, planner_version: 1 }] }));
  const h = await readHistory(db, iso(NOW));
  assert.equal(h.history.length, programme.items.filter((it) => blockStart + it.startSec * 1000 < NOW).length);
  const draft = await draftProgramme(db, { id: SET, starts_at: iso(NOW), duration_min: 60 });
  const used = new Set(programme.items.map((it) => it.trackId));
  assert.ok(!draft.programme.items.some((it) => used.has(it.trackId)), 'no song the rotation played in the last 3 hours');
  // Before 2026-11-03-radio-rotation.sql: no table, no rotation history, and her sets still plan.
  assert.deepEqual(await readHistory(fakeDb(tables(), { missing: ['radio_rotation_blocks'] }), iso(NOW)), { history: [] });
  // Any other failure is a failure.
  assert.ok((await readHistory(fakeDb(tables({ nora_sets: [noraSet(SET2, NOW - 7200000)] }), { fail: ['select:radio_rotation_blocks'] }), iso(NOW))).error);
});

test('⚠ the play log takes a block: only songs it planned, copied as they were; never a set and a block at once', LIMIT, async () => {
  const blockStart = NOW - 600000;
  const programme = planSet({ tracks: LIBRARY, set: { id: null, startsAt: iso(blockStart), durationMin: 60 }, seed: 'l' });
  const db = fakeDb(tables({ radio_rotation_blocks: [{ id: BLK, starts_at: iso(blockStart), duration_sec: 3600, programme, planner_version: 1 }] }));
  const it = programme.items[1];
  assert.equal((await recordEngineEvent(db, { event: 'song', blockId: BLK, trackId: it.trackId, atSec: it.startSec }, { now: NOW })).status, 200);
  const row = db._t.nora_engine_log[0];
  const t = LIBRARY.find((x) => x.id === it.trackId);
  assert.deepEqual([row.block_id, row.set_id, row.track_id, row.title, row.artist, row.album, row.played_at], [BLK, undefined, t.id, t.title, t.artist, t.album, iso(blockStart + it.startSec * 1000)]);
  const notPlanned = LIBRARY.find((x) => !programme.items.some((p) => p.trackId === x.id));
  assert.equal((await recordEngineEvent(db, { event: 'song', blockId: BLK, trackId: notPlanned.id, atSec: 5 }, { now: NOW })).status, 409);
  assert.equal((await recordEngineEvent(db, { event: 'started', blockId: BLK, setId: SET }, { now: NOW })).status, 400);
  assert.equal((await recordEngineEvent(db, { event: 'started', blockId: 'x' }, { now: NOW })).status, 400);
  assert.equal((await recordEngineEvent(db, { event: 'started', blockId: BLK2 }, { now: NOW })).status, 404);
  assert.equal((await recordEngineEvent(fakeDb(tables(), { fail: ['select:radio_rotation_blocks'] }), { event: 'started', blockId: BLK }, { now: NOW })).status, 503);
  assert.equal((await recordEngineEvent(db, { event: 'ended', blockId: BLK, atSec: 3500 }, { now: NOW })).status, 200);
  assert.equal(db._t.nora_engine_log.at(-1).block_id, BLK);
});

test('the play report lists the rotation\'s plays beside her sets\', and still reads before the migrations (blank)', LIMIT, async () => {
  const log = [
    { event: 'song', played_at: '2026-11-03T10:00:00.000Z', artist: 'A', title: 'a', isrc: null, album: null, label: null, set_id: SET, block_id: null },
    { event: 'song', played_at: '2026-11-03T11:00:00.000Z', artist: 'B', title: 'b', isrc: null, album: null, label: null, set_id: null, block_id: BLK },
  ];
  const r = await playsCsv(fakeDb({ nora_engine_log: log }), '2026-11');
  const lines = r.body.trim().split('\r\n');
  assert.equal(lines[0], 'Played at (UTC),Featured artist,Sound recording title,ISRC,Album title,Marketing label,Actual total performances,Nora set,Rotation block');
  // No session yet: every play is Shape's own station's, and nobody heard either (0).
  assert.equal(lines[1], `2026-11-03T10:00:00.000Z,A,a,,,,0,${SET},`);
  assert.equal(lines[2], `2026-11-03T11:00:00.000Z,B,b,,,,0,,${BLK}`);
  const before = await playsCsv(fakeDb({ nora_engine_log: [log[0]] }, { noBlockColumn: true, missing: ['radio_listens'] }), '2026-11');
  assert.equal(before.status, 200);
  assert.equal(before.body.trim().split('\r\n')[1], `2026-11-03T10:00:00.000Z,A,a,,,,,${SET},`);
});

test('the admin\'s engine panel shows her sets\' reports, never the rotation\'s as hers (Codex, #2570)', LIMIT, () => {
  const panel = read('src/app/dashboard/radio/NoraSets.tsx');
  assert.match(panel, /from\('nora_engine_log'\)\.select\('event,played_at,title,artist,detail'\)\.not\('set_id', 'is', null\)\.order\('logged_at'/);
});

// ── The route and the migration ────────────────────────────────────────────────────────────
test('the route: the engine\'s token before anything, only ?mode=station (to the rotation), and a malformed check refused', LIMIT, () => {
  const route = read('src/app/api/radio/nora/engine/route.ts');
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
  assert.ok(get.indexOf('if (refused) return refused;') < get.indexOf('createAdminClient()'));
  // radio.co's engine (no ?mode=station) is refused: radio.co was taken out (2026-11-04).
  const refuse = get.indexOf("if (q.get('mode') !== 'station') return NextResponse.json({ error: 'mode' }, { status: 400, headers: NO_STORE });");
  assert.ok(refuse > get.indexOf('if (refused) return refused;') && refuse < get.indexOf('createAdminClient()'));
  assert.match(get, /stationCheck\(db, \{ now, skip, \.\.\.\(check\[1\] === 'set' \? \{ setId: check\[2\] \} : \{ blockId: check\[2\] \}\) \}\)/);
  assert.match(get, /else if \(q\.has\('check'\)\) r = \{ status: 400, body: \{ error: 'check' \} \};/);
  assert.match(get, /else r = await stationJob\(db, \{ now, after: q\.get\('after'\), skip \}\);/);
  assert.ok(!/engineJob/.test(route));
});

test('the migration: idempotent, service role only, one block per start, a log row a set\'s or a block\'s', LIMIT, () => {
  const sql = read('supabase-migrations/2026-11-03-radio-rotation.sql').replace(/--.*$/gm, '');
  assert.match(sql, /create table if not exists public\.radio_rotation_blocks/);
  assert.match(sql, /starts_at\s+timestamptz not null unique/);
  assert.match(sql, /duration_sec\s+int not null check \(duration_sec between 10 and 7200\)/);
  assert.match(sql, /revoke all on table public\.radio_rotation_blocks from public, anon, authenticated/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /add column if not exists block_id uuid\s+references public\.radio_rotation_blocks\(id\) on delete set null/);
  assert.match(sql, /drop constraint if exists nora_engine_log_one_segment;[\s\S]*add constraint nora_engine_log_one_segment\s+check \(set_id is null or block_id is null\)/);
  assert.ok(!/create policy|grant [^;]* to (anon|authenticated)|create (or replace )?function/i.test(sql));
  // The longest block the code plans fits the table's check, and its look-back covers it.
  assert.ok(BLOCK_SEC <= 7200);
  assert.match(read('src/lib/radio/rotation.mjs'), /const BLOCK_LOOKBACK_MS = 2 \* 3600000 \+ 60000;/);
});
