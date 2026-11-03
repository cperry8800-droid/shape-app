// noraSetStore.mjs — the database side of Nora's sets, against the SERVICE-ROLE client: putting
// the owner's slots on the schedule (the hourly cron and the dashboard's "Update now"), and
// planning a set once (the cron an hour ahead; the engine at the start if the cron missed it).
// Each function takes the client, so tests drive it with a fake. Results are plain objects.
//
// ⚠ A READ THAT FAILS IS NOT AN EMPTY ANSWER. The slots, the sets and the plays before a set
// decide what is put on the schedule and what Nora may play; reading any of them as "none" would
// delete planned sets or break the licence's per-artist limits. A failed read stops the run.

import { reconcileSets } from './noraSlots.mjs';
import { planSet, checkProgramme, PLANNER_VERSION, COMPLEMENT } from './noraPlanner.mjs';

const HOUR = 3600000;
export const PLAN_AHEAD_MS = 70 * 60000;    // the cron plans a set this far ahead of its start
const HISTORY_MS = 24 * HOUR;               // plays read before a set (the complement needs 3 h; freshness 24 h)
export const TRACK_COLUMNS = 'id,title,artist,album,label,isrc,analysis';

export async function readLicensed(db) {
  const { data, error } = await db.from('nora_dj_settings').select('licences_confirmed_at').eq('id', 1).maybeSingle();
  if (error) return { error };
  return { licensed: !!(data && data.licences_confirmed_at) };
}

/** Put the slots on the schedule for the next week, and publish only what is licensed. */
export async function syncNoraSets(db, { now }) {
  const [slots, sets, lic] = await Promise.all([
    db.from('nora_slots').select('id,days,start_minute,duration_min,zone,enabled').eq('enabled', true),
    db.from('nora_sets').select('id,starts_at,duration_min,host_kind,slot_id,published').gte('starts_at', new Date(now - 6 * HOUR).toISOString()),
    readLicensed(db),
  ]);
  if (slots.error || sets.error || lic.error) return { ok: false, error: 'read_failed' };
  const noraIds = (sets.data || []).filter((r) => r.host_kind === 'nora').map((r) => r.id);
  let planned = new Set();
  if (noraIds.length) {
    const p = await db.from('nora_set_programmes').select('set_id').in('set_id', noraIds);
    if (p.error) return { ok: false, error: 'read_failed' };
    planned = new Set((p.data || []).map((r) => r.set_id));
  }
  const plan = reconcileSets({
    slots: slots.data || [],
    sets: (sets.data || []).map((r) => ({ ...r, planned: planned.has(r.id) })),
    licensed: lic.licensed,
    now,
  });
  const done = { inserted: 0, removed: 0, published: 0, unpublished: 0, clashes: plan.clashes.length };
  if (plan.insert.length) {
    // A concurrent run inserting the same slot start loses to the unique index, harmlessly.
    for (const row of plan.insert) {
      const { error } = await db.from('nora_sets').insert(row);
      if (!error) done.inserted++;
      else if (error.code !== '23505') return { ok: false, error: 'write_failed', done };
    }
  }
  if (plan.remove.length) {
    const { error } = await db.from('nora_sets').delete().in('id', plan.remove).eq('host_kind', 'nora');
    if (error) return { ok: false, error: 'write_failed', done };
    done.removed = plan.remove.length;
  }
  for (const [ids, published, field] of [[plan.publish, true, 'published'], [plan.unpublish, false, 'unpublished']]) {
    if (!ids.length) continue;
    const { error } = await db.from('nora_sets').update({ published }).in('id', ids).eq('host_kind', 'nora');
    if (error) return { ok: false, error: 'write_failed', done };
    done[field] = ids.length;
  }
  return { ok: true, done, clashes: plan.clashes };
}

// Before 2026-11-03-radio-rotation.sql runs there is no rotation table: no block was ever planned,
// so "none" is the truthful answer there, and only there.
const missingTable = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205');

/**
 * Every play planned in Nora's sets and the station's rotation blocks (src/lib/radio/rotation.mjs)
 * that START in [fromMs, toMs), from programmes starting in [fromMs − 7 h, toMs). Planned, not
 * logged: a set or block that did not air still counts, which only makes the rules stricter.
 */
export async function readPlannedPlays(db, fromMs, toMs, { excludeSetId, excludeBlockId } = {}) {
  const lo = new Date(fromMs - 7 * HOUR).toISOString(), hi = new Date(toMs).toISOString();
  const [setsRes, blocksRes] = await Promise.all([
    db.from('nora_sets').select('id,starts_at').eq('host_kind', 'nora').gte('starts_at', lo).lt('starts_at', hi),
    db.from('radio_rotation_blocks').select('id,starts_at,programme').gte('starts_at', lo).lt('starts_at', hi),
  ]);
  if (setsRes.error) return { error: setsRes.error };
  if (blocksRes.error && !missingTable(blocksRes.error)) return { error: blocksRes.error };
  const segments = [];
  const sets = (setsRes.data || []).filter((s) => s.id !== excludeSetId);
  if (sets.length) {
    const { data: progs, error: pErr } = await db.from('nora_set_programmes').select('set_id,programme').in('set_id', sets.map((s) => s.id));
    if (pErr) return { error: pErr };
    const startOf = new Map(sets.map((s) => [s.id, Date.parse(s.starts_at)]));
    for (const p of progs || []) segments.push({ base: startOf.get(p.set_id), programme: p.programme });
  }
  for (const b of (blocksRes.error ? [] : blocksRes.data || [])) {
    if (b.id !== excludeBlockId) segments.push({ base: Date.parse(b.starts_at), programme: b.programme });
  }
  const plays = [];
  for (const { base, programme } of segments) {
    for (const it of (programme && programme.items) || []) {
      const at = base + Number(it.startSec) * 1000;
      if (Number.isFinite(at) && at >= fromMs && at < toMs) plays.push({ trackId: it.trackId, artist: it.artist, album: it.album, playedAt: new Date(at).toISOString() });
    }
  }
  plays.sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt));
  return { plays };
}

/** The plays before `startsAt` (Nora's sets and the rotation), as the planner's history. */
export async function readHistory(db, startsAt, { excludeSetId, excludeBlockId } = {}) {
  const start = Date.parse(startsAt);
  const r = await readPlannedPlays(db, start - HISTORY_MS + 1, start, { excludeSetId, excludeBlockId });
  return r.error ? { error: r.error } : { history: r.plays };
}

/** The plays already planned from `endsAt` on, within the rules' window: the planner's `future`. */
export async function readFuture(db, endsAt, { excludeSetId, excludeBlockId } = {}) {
  const end = Date.parse(endsAt);
  const r = await readPlannedPlays(db, end, end + COMPLEMENT.windowSec * 1000 + 2 * 60000, { excludeSetId, excludeBlockId });
  return r.error ? { error: r.error } : { future: r.plays };
}

/** Every ready, enabled song, with what the planner reads. */
export async function readPlayable(db) {
  const { data, error } = await db.from('radio_tracks').select(TRACK_COLUMNS).eq('status', 'ready').eq('enabled', true).limit(5000);
  if (error) return { error };
  return { tracks: data || [] };
}

/**
 * Plan a set from the library, the plays before it and any already planned after it (Shape's own
 * rotation, src/lib/radio/rotation.mjs). `externalHistory` is the station's other plays (radio.co's
 * own rotation) in the same shape, when the caller has them.
 * Returns { programme, problems } without storing anything.
 */
export async function draftProgramme(db, set, { externalHistory = [] } = {}) {
  const endsAt = new Date(Date.parse(set.starts_at) + Number(set.duration_min) * 60000).toISOString();
  const [lib, hist, fut] = await Promise.all([
    readPlayable(db),
    readHistory(db, set.starts_at, { excludeSetId: set.id }),
    readFuture(db, endsAt, { excludeSetId: set.id }),
  ]);
  if (lib.error || hist.error || fut.error) return { error: 'read_failed' };
  const history = [...hist.history, ...(Array.isArray(externalHistory) ? externalHistory : [])];
  const future = fut.future;
  const programme = planSet({ tracks: lib.tracks, set: { id: set.id, startsAt: set.starts_at, durationMin: set.duration_min }, history, future });
  return { programme, problems: checkProgramme(programme, history, { future }), libraryCount: lib.tracks.length };
}

/**
 * The set's programme: the stored one, or a new one planned and stored now. The first plan
 * stored wins (the table's key is the set), so the cron and the engine can both ask.
 * ⚠ A plan that breaks a rule is never stored.
 */
export async function ensureProgramme(db, setId, opts = {}) {
  const got = await db.from('nora_set_programmes').select('programme').eq('set_id', setId).maybeSingle();
  if (got.error) return { error: 'read_failed' };
  if (got.data) return { programme: got.data.programme, stored: true };
  const { data: set, error } = await db.from('nora_sets').select('id,starts_at,duration_min,host_kind').eq('id', setId).maybeSingle();
  if (error) return { error: 'read_failed' };
  if (!set || set.host_kind !== 'nora') return { error: 'not_a_nora_set' };
  const draft = await draftProgramme(db, set, opts);
  if (draft.error) return draft;
  if (draft.problems.length) return { error: 'plan_breaks_rules', problems: draft.problems };
  if (!draft.programme.items.length) return { error: 'empty_library' };
  const { error: insErr } = await db.from('nora_set_programmes').insert({ set_id: setId, programme: draft.programme, planner_version: PLANNER_VERSION });
  if (insErr && insErr.code !== '23505') return { error: 'write_failed' };
  if (insErr) {
    const again = await db.from('nora_set_programmes').select('programme').eq('set_id', setId).maybeSingle();
    if (again.error || !again.data) return { error: 'read_failed' };
    return { programme: again.data.programme, stored: true };
  }
  return { programme: draft.programme, stored: true, planned: true };
}

/** The cron's second job: plan every Nora set starting within the next 70 minutes. */
export async function planDueSets(db, { now }) {
  const { data, error } = await db.from('nora_sets').select('id,starts_at')
    .eq('host_kind', 'nora').gt('starts_at', new Date(now).toISOString()).lte('starts_at', new Date(now + PLAN_AHEAD_MS).toISOString());
  if (error) return { ok: false, error: 'read_failed' };
  const results = [];
  for (const s of data || []) {
    const r = await ensureProgramme(db, s.id);
    results.push({ setId: s.id, ok: !r.error, error: r.error || null, planned: !!r.planned });
  }
  return { ok: results.every((r) => r.ok), results };
}

export const _rules = COMPLEMENT;
