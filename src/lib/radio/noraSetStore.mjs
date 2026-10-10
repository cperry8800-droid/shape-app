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

/** The plays before `startsAt` from Nora's own planned sets, as the planner's history. */
export async function readHistory(db, startsAt, { excludeSetId } = {}) {
  const start = Date.parse(startsAt);
  const { data: sets, error } = await db.from('nora_sets').select('id,starts_at')
    .eq('host_kind', 'nora').gte('starts_at', new Date(start - HISTORY_MS - 6 * HOUR).toISOString()).lt('starts_at', new Date(start).toISOString());
  if (error) return { error };
  const ids = (sets || []).map((s) => s.id).filter((id) => id !== excludeSetId);
  if (!ids.length) return { history: [] };
  const { data: progs, error: pErr } = await db.from('nora_set_programmes').select('set_id,programme').in('set_id', ids);
  if (pErr) return { error: pErr };
  const startOf = new Map((sets || []).map((s) => [s.id, Date.parse(s.starts_at)]));
  const history = [];
  for (const p of progs || []) {
    const base = startOf.get(p.set_id);
    for (const it of (p.programme && p.programme.items) || []) {
      const at = base + Number(it.startSec) * 1000;
      if (Number.isFinite(at) && at < start && at > start - HISTORY_MS) history.push({ trackId: it.trackId, artist: it.artist, album: it.album, playedAt: new Date(at).toISOString() });
    }
  }
  return { history };
}

/** Every ready, enabled song, with what the planner reads. */
export async function readPlayable(db) {
  const { data, error } = await db.from('radio_tracks').select(TRACK_COLUMNS).eq('status', 'ready').eq('enabled', true).limit(5000);
  if (error) return { error };
  return { tracks: data || [] };
}

/**
 * Plan a set from the library and the plays before it. `externalHistory` is the station's other
 * plays (radio.co's own rotation) in the same shape, when the caller has them.
 * Returns { programme, problems } without storing anything.
 */
export async function draftProgramme(db, set, { externalHistory = [] } = {}) {
  const [lib, hist] = await Promise.all([readPlayable(db), readHistory(db, set.starts_at, { excludeSetId: set.id })]);
  if (lib.error || hist.error) return { error: 'read_failed' };
  const history = [...hist.history, ...(Array.isArray(externalHistory) ? externalHistory : [])];
  const programme = planSet({ tracks: lib.tracks, set: { id: set.id, startsAt: set.starts_at, durationMin: set.duration_min }, history });
  return { programme, problems: checkProgramme(programme, history), libraryCount: lib.tracks.length };
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
