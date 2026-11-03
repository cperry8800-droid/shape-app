// rotation.mjs — Shape Radio on Shape's own station (owner, 2026-11-03: "build your own
// internet/app radio streaming platform where i can upload songs to stream instead of using
// radio.co"). Nora's engine (services/nora-engine, NORA_MODE=station) keeps the station's stream
// on around the clock and asks this module, through its token-gated route, what to play next:
//
//   stationJob(db, { now, after, skip })    the segment that plays from `after` (or now): a Nora
//                                           set, or a block of the rotation, planned here when
//                                           none is stored, with a signed link to each song
//   stationCheck(db, { now, setId | blockId, skip })   asked while a segment plays: stop it (the
//                                           licences were withdrawn), or cut a block where a Nora
//                                           set now starts
//
// THE ROTATION is the library, planned the way Nora plans her sets (src/lib/radio/noraPlanner.mjs),
// an hour at a time, each block starting where the last one ends. A block that would run into a
// Nora set is planned to end on her start (`hardEnd`), and the set takes over from there.
//
// ⚠ THE SAME RULES AS HER SETS, ACROSS BOTH. Every block is planned against the plays planned
// before it AND after it (her next set, a block already stored), sets and blocks alike, and a plan
// that breaks a rule is never stored or handed out. Whichever of two neighbours is planned second
// sees the first.
// ⚠ NOTHING GOES ON THE AIR WITHOUT THE LICENCES. No licence confirmation, no set and no block: the
// engine leaves the stream to the station's standby loop. The check while a segment plays makes a
// withdrawal take effect within a minute, not at the end of the hour.
// ⚠ A STORED BLOCK IS NEVER REPLANNED UNDER ITS OWN START. The table's key is the start, so an
// engine that asks twice (a retry, a restart) is handed the block it was first given, and joins
// it where it is by then.

import { randomUUID } from 'node:crypto';
import { planSet, checkProgramme, PLANNER_VERSION } from './noraPlanner.mjs';
import { readLicensed, readPlayable, readHistory, readFuture } from './noraSetStore.mjs';
import { setJob, signSources } from './noraEngineApi.mjs';
import { isUuid } from './library.mjs';

export const BLOCK_SEC = 3600;                 // a block is at most an hour
export const MIN_BLOCK_SEC = 20;               // a shorter gap is not worth a block: the engine pads it
export const JOIN_LEAD_SEC = 10;               // a block planned from "now" starts this far ahead
export const AFTER_BEHIND_MS = 10 * 60000;     // `after` may lie this far in the past (a late engine)...
export const AFTER_AHEAD_MS = 15 * 60000;      // ...or this far ahead (asking early for what comes next)
export const MAX_SKIP = 20;
const SET_LOOKBACK_MS = 7 * 3600000;           // a Nora set lasts at most 6 h (nora_slots' check)
const SET_OVERRUN_MS = 10 * 60000;             // as noraEngineApi: a set is handed out this long past its end
const BLOCK_LOOKBACK_MS = 2 * 3600000 + 60000; // a block lasts at most 2 h (radio_rotation_blocks' check)
const LINK_TTL_MIN_SEC = 3600;
// Segments meet end to start, but an end need not fall on a whole millisecond (a programme stores
// seconds as a number) while the time the engine asks about is an ISO time, cut to one: two that
// meet can seem to overlap by under a millisecond. Overlaps shorter than this are meetings.
const TOUCH_MS = 1000;

const iso = (ms) => new Date(ms).toISOString();
const missingTable = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205');
const NOT_SET_UP = { status: 503, body: { error: 'not_set_up' } };
const READ_FAILED = { status: 503, body: { error: 'read_failed' } };

/**
 * The engine's question, checked: where the next segment begins, and what it will not be handed.
 * @param {{ now: number, after?: string | null, skip?: string[] }} ask
 */
export function readAsk({ now, after = null, skip = [] }) {
  let at = now, given = false;
  if (after != null && after !== '') {
    const a = Date.parse(String(after));
    if (!Number.isFinite(a) || a < now - AFTER_BEHIND_MS || a > now + AFTER_AHEAD_MS) return { error: 'after' };
    // A late engine joins whatever is on now; an early one asks about the moment it names.
    at = Math.max(a, now);
    given = a >= now;
  }
  const list = Array.isArray(skip) ? skip : [];
  if (list.length > MAX_SKIP || !list.every(isUuid)) return { error: 'skip' };
  // A block planned for the moment asked about starts there; one planned for "now" starts a few
  // seconds out, so the engine can load its first song before it plays.
  return { at, startMs: given ? at : now + JOIN_LEAD_SEC * 1000, skip: new Set(list) };
}

/**
 * Nora's published sets around [from, to), with when each really ends (its programme's end, once
 * planned): `all` of them, and `sets`, those not in `skip`.
 */
async function readSets(db, from, to, skip) {
  const { data, error } = await db.from('nora_sets').select('id,starts_at,duration_min,published,host_kind')
    .eq('host_kind', 'nora').eq('published', true)
    .gt('starts_at', iso(from - SET_LOOKBACK_MS)).lt('starts_at', iso(to))
    .order('starts_at', { ascending: true }).limit(100);
  if (error) return { error };
  const sets = data || [];
  if (!sets.length) return { sets, all: sets };
  const { data: progs, error: pErr } = await db.from('nora_set_programmes').select('set_id,programme').in('set_id', sets.map((s) => s.id));
  if (pErr) return { error: pErr };
  const endsSec = new Map((progs || []).map((p) => [p.set_id, Number(p.programme && p.programme.endsSec)]));
  for (const s of sets) {
    s.startMs = Date.parse(s.starts_at);
    const planned = endsSec.get(s.id);
    s.planned = Number.isFinite(planned);
    s.endMs = s.startMs + (s.planned ? planned : Number(s.duration_min) * 60) * 1000;
  }
  const all = sets.sort((a, b) => a.startMs - b.startMs);
  return { all, sets: all.filter((x) => !skip.has(x.id)) };
}

/** Stored rotation blocks starting in [from − 2 h, to), with when each ends. */
async function readBlocks(db, from, to, skip) {
  const { data, error } = await db.from('radio_rotation_blocks').select('id,starts_at,duration_sec,programme')
    .gt('starts_at', iso(from - BLOCK_LOOKBACK_MS)).lt('starts_at', iso(to))
    .order('starts_at', { ascending: true }).limit(100);
  if (error) return { error };
  const blocks = (data || []).filter((b) => !skip.has(b.id)).map((b) => {
    const startMs = Date.parse(b.starts_at);
    return { ...b, startMs, endMs: startMs + Number(b.programme && b.programme.endsSec) * 1000 };
  });
  return { blocks: blocks.sort((a, b) => a.startMs - b.startMs) };
}

/**
 * A block the station no longer plays: one of Nora's sets (scheduled after it was planned)
 * overlaps it. ⚠ Any published set, even one the engine skipped or that cannot be played: the
 * block was planned without knowing what that set played before it stopped, so the rest of the
 * block could repeat it. A new block is planned instead, against the set's plays.
 */
const overlapsASet = (b, sets) => sets.some((s) => s.startMs < b.endMs - TOUCH_MS && b.startMs < s.endMs - TOUCH_MS);

/** The engine's job for one stored block: its programme and a signed link to each song. */
async function blockJob(db, b, { now }) {
  const ttl = Math.max(LINK_TTL_MIN_SEC, Math.ceil((b.endMs - now) / 1000) + LINK_TTL_MIN_SEC);
  const signed = await signSources(db, b.programme, ttl);
  if (!signed.sources) return { status: signed.status, body: { ...signed.body, blockId: b.id } };
  return {
    status: 200,
    body: { nowMs: now, block: { id: b.id, startsAt: iso(b.startMs), durationSec: Number(b.duration_sec) }, programme: b.programme, sources: signed.sources },
  };
}

/**
 * @param {any} db  the service-role client
 * @param {{ now: number, after?: string | null, skip?: string[] }} ask
 */
export async function stationJob(db, { now, after = null, skip = [] }) {
  const ask = readAsk({ now, after, skip });
  if (ask.error) return { status: 400, body: { error: ask.error } };
  const lic = await readLicensed(db);
  if (lic.error) return READ_FAILED;
  if (!lic.licensed) return { status: 200, body: { nowMs: now, set: null, block: null, reason: 'unlicensed' } };

  const { at, startMs } = ask;
  const horizon = Math.max(at, startMs) + (BLOCK_SEC + MIN_BLOCK_SEC) * 1000;
  const [s, b] = await Promise.all([readSets(db, at, horizon, ask.skip), readBlocks(db, at, horizon, ask.skip)]);
  if (s.error) return READ_FAILED;
  if (b.error) return missingTable(b.error) ? NOT_SET_UP : READ_FAILED;
  const sets = s.sets;
  const unplayable = new Set();

  // 1. Nora's set, when one is on at `at` or starts within a moment of it. Her sets come first.
  for (const set of sets) {
    if (set.startMs > at + MIN_BLOCK_SEC * 1000) break;
    if (set.endMs + (set.planned ? 0 : SET_OVERRUN_MS) - TOUCH_MS <= at) continue;
    const job = await setJob(db, set, { now });
    if (job.status === 200) {
      if (set.startMs + Number(job.body.programme.endsSec) * 1000 - TOUCH_MS > at) return job;
      set.endMs = set.startMs + Number(job.body.programme.endsSec) * 1000;   // planned just now: over already
      continue;
    }
    // A set that cannot be played (a song since deleted, a plan the rules refuse) gives its time to
    // the rotation rather than to silence; one that could not be READ is a fault, not a gap.
    if (job.body && job.body.error === 'read_failed') return job;
    unplayable.add(set.id);
  }
  const live = sets.filter((x) => !unplayable.has(x.id));

  // 2. The stored block that is on at `at` (or starts within a moment), unless a set has since
  //    been scheduled over it.
  const blocks = b.blocks.filter((x) => !overlapsASet(x, s.all));
  for (const blk of blocks) {
    if (blk.startMs > at + MIN_BLOCK_SEC * 1000) break;
    if (blk.endMs - TOUCH_MS > at) return blockJob(db, blk, { now });
  }

  // 3. A new block, from `startMs` to the next set or stored block, or for an hour.
  let endMs = startMs + BLOCK_SEC * 1000;
  for (const x of [...live, ...blocks]) if (x.startMs > startMs && x.startMs < endMs) endMs = x.startMs;
  const durationSec = Math.floor((endMs - startMs) / 1000);
  if (durationSec < MIN_BLOCK_SEC) return { status: 200, body: { nowMs: now, set: null, block: null, nextAt: iso(endMs) } };
  const hardEnd = durationSec < BLOCK_SEC;
  const startIso = iso(startMs);
  const [lib, hist, fut] = await Promise.all([
    readPlayable(db),
    readHistory(db, startIso),
    readFuture(db, iso(startMs + durationSec * 1000)),
  ]);
  if (lib.error || hist.error || fut.error) return READ_FAILED;
  const programme = planSet({
    tracks: lib.tracks,
    set: { id: null, startsAt: startIso, durationMin: durationSec / 60 },
    history: hist.history, future: fut.future, seed: `rotation:${startIso}`, hardEnd,
  });
  if (!programme.items.length) return { status: 200, body: { nowMs: now, set: null, block: null, reason: 'empty_library' } };
  // ⚠ A plan that breaks a rule is never stored, and never played.
  const problems = checkProgramme(programme, hist.history, { future: fut.future });
  if (problems.length) return { status: 409, body: { error: 'plan_breaks_rules', problems: problems.slice(0, 10) } };

  const row = { id: randomUUID(), starts_at: startIso, duration_sec: durationSec, programme, planner_version: PLANNER_VERSION };
  const ins = await db.from('radio_rotation_blocks').insert(row);
  let stored = row;
  if (ins.error) {
    if (missingTable(ins.error)) return NOT_SET_UP;
    if (ins.error.code !== '23505') return { status: 503, body: { error: 'write_failed' } };
    // Another ask stored the block starting here first: that one is the block.
    const again = await db.from('radio_rotation_blocks').select('id,starts_at,duration_sec,programme').eq('starts_at', startIso).maybeSingle();
    if (again.error || !again.data) return READ_FAILED;
    stored = again.data;
  }
  const startStored = Date.parse(stored.starts_at);
  return blockJob(db, { ...stored, startMs: startStored, endMs: startStored + Number(stored.programme.endsSec) * 1000 }, { now });
}

/**
 * Asked every minute or so while a segment plays. { ok: true } carries on; { stop: true } ends it
 * now (the licences were withdrawn, or the set was taken off the schedule); { cutAt } ends a block
 * where one of Nora's sets now starts.
 * @param {any} db  the service-role client
 * @param {{ now: number, setId?: string | null, blockId?: string | null, skip?: string[] }} ask
 */
export async function stationCheck(db, { now, setId = null, blockId = null, skip = [] }) {
  if ((setId == null) === (blockId == null)) return { status: 400, body: { error: 'segment' } };
  if (!isUuid(setId ?? blockId)) return { status: 400, body: { error: setId != null ? 'set_id' : 'block_id' } };
  const ask = readAsk({ now, skip });
  if (ask.error) return { status: 400, body: { error: ask.error } };
  const lic = await readLicensed(db);
  if (lic.error) return READ_FAILED;
  if (!lic.licensed) return { status: 200, body: { stop: true, reason: 'unlicensed' } };

  if (setId != null) {
    const { data: set, error } = await db.from('nora_sets').select('id,published,host_kind').eq('id', setId).maybeSingle();
    if (error) return READ_FAILED;
    if (!set || set.host_kind !== 'nora' || !set.published) return { status: 200, body: { stop: true, reason: 'unpublished' } };
    return { status: 200, body: { ok: true } };
  }
  const { data: blk, error } = await db.from('radio_rotation_blocks').select('id,starts_at,programme').eq('id', blockId).maybeSingle();
  if (error) return missingTable(error) ? NOT_SET_UP : READ_FAILED;
  if (!blk) return { status: 200, body: { stop: true, reason: 'gone' } };
  const startMs = Date.parse(blk.starts_at);
  const endMs = startMs + Number(blk.programme && blk.programme.endsSec) * 1000;
  const s = await readSets(db, now, endMs, ask.skip);
  if (s.error) return READ_FAILED;
  const over = s.sets.filter((x) => x.startMs < endMs - TOUCH_MS && x.endMs - TOUCH_MS > Math.max(now, startMs));
  if (!over.length) return { status: 200, body: { ok: true } };
  return { status: 200, body: { ok: true, cutAt: iso(Math.max(over[0].startMs, now)) } };
}
