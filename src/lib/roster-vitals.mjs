// The coach roster's check-in vitals buckets (spec §3A) — the SERVER half of
// the window the client mapper already enforces.
//
// WHY THIS EXISTS AS ITS OWN MODULE. /api/coach/roster-sleep reads a 14-day
// window because the SLEEP leg needs it, and its per-metric buckets used to
// average `vals.slice(-7)` — the last 7 LOGGED values, not the last 7 calendar
// days. So a client whose only three energy/hunger readings were 8-14 days old
// still satisfied `n >= 3` and could raise a coach `energy_low`/`hunger_high`
// flag, while `vitalsFromProgress` (mobile-app/src/services/signalsMap.mjs)
// correctly treated those same readings as stale and raised nothing. That is an
// asymmetry where the coach sees a flag the member's own engine does not.
//
// The window semantics here are the SAME ones the client mapper enforces:
//   • a 7-CALENDAR-DAY window, cutoff inclusive at today − 6;
//   • `snapshot_date` is an ISO 'YYYY-MM-DD' string, so a lexicographic `>=`
//     compare is exact and needs no date arithmetic;
//   • a row whose date is missing or not a string is DROPPED — recency it
//     cannot prove is absence, which is the under-firing (safe) direction;
//   • still capped at 7 readings, so duplicated dates cannot widen a average
//     that calls itself a 7-day average;
//   • a value that is not a finite number > 0 is ABSENCE, dropped from BOTH the
//     numerator and the denominator (`Number(null)` is a finite 0 — the
//     documented fabrication class). energy/hunger carry a DB CHECK of 1-10 and
//     a 0-litre hydration row is indistinguishable from a row another metric's
//     write created, so `> 0` is absence-safe for every leg here.
//
// ⚠ DAY-BOUNDARY BASIS + ITS RESIDUAL. `snapshot_date` is written from the
// MEMBER's local day (`_localDate()`), and the client mapper builds its cutoff
// from the member's own device-local date parts. This route has no per-member
// timezone, so the cutoff is built in **UTC** — the same basis the route's
// existing 14-day `since` already uses. The semantics (7 calendar days,
// inclusive at today − 6) are identical; only the zone differs, which leaves a
// documented tolerance of at most ONE DAY at the boundary:
//   • a member WEST of UTC (e.g. UTC−7, late evening) is already on the next
//     UTC day, so the server cutoff advances first and its window is NARROWER
//     than the member's — it can only drop a reading the member still counts,
//     i.e. under-fire. Safe.
//   • a member EAST of UTC (e.g. UTC+10, early morning) is still on the
//     previous UTC day, so the server window is WIDER by one day and may keep
//     the single oldest reading the member has already aged out.
// Closing that last day would require joining each member's stored timezone
// (`client_profiles.timezone`) into this read; it is deliberately NOT done here
// — the residual is one boundary day, versus the six-plus days of drift this
// module exists to remove.

export const VITALS_WINDOW_DAYS = 7;

// The inclusive ISO cutoff for the vitals window: today − (WINDOW − 1) in UTC.
export function vitalsCutoffISO(now = new Date()) {
  const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const cut = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  cut.setUTCDate(cut.getUTCDate() - (VITALS_WINDOW_DAYS - 1));
  return cut.toISOString().slice(0, 10);
}

function positive(raw) {
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function leg(vals) {
  if (!vals.length) return null;
  const last = vals.slice(-VITALS_WINDOW_DAYS);
  const avg = last.reduce((a, b) => a + b, 0) / last.length;
  return { avg: Math.round(avg * 100) / 100, n: last.length };
}

// buildRosterVitals(rows, { now }) -> Map<userId, vitals>
//
// `rows` are the raw `daily_health_snapshot` rows the route already selected
// (any window — this filters to the vitals window itself), expected in
// snapshot_date ASC order. A user with no in-window reading on any leg is
// ABSENT from the map, so the caller never attaches an empty `vitals` object.
//
// `hydration.targetL` is deliberately always null: hydration_low is a
// CLIENT-ONLY directive (owner ruling), and with no target the engine's rule
// cannot fire even if a caller routed this record through a client evaluation.
export function buildRosterVitals(rows, opts = {}) {
  const cutoff = vitalsCutoffISO(opts.now);
  const byUser = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = raw && typeof raw === 'object' ? raw : null;
    if (!row) continue;
    const day = typeof row.snapshot_date === 'string' ? row.snapshot_date : '';
    if (!day || day < cutoff) continue;
    const key = String(row.user_id);
    let b = byUser.get(key);
    if (!b) { b = { energy: [], hunger: [], hydration: [] }; byUser.set(key, b); }
    const e = positive(row.energy); if (e != null) b.energy.push(e);
    const h = positive(row.hunger); if (h != null) b.hunger.push(h);
    const w = positive(row.hydration_l); if (w != null) b.hydration.push(w);
  }
  const out = new Map();
  for (const [key, b] of byUser) {
    const vitals = {};
    const energy = leg(b.energy);
    const hunger = leg(b.hunger);
    const hydration = leg(b.hydration);
    if (energy) vitals.energy = { avg7: energy.avg, n: energy.n };
    if (hunger) vitals.hunger = { avg7: hunger.avg, n: hunger.n };
    if (hydration) vitals.hydration = { avg7L: hydration.avg, targetL: null, n: hydration.n };
    if (Object.keys(vitals).length) out.set(key, vitals);
  }
  return out;
}

// ── The whole roster read: recent sleep and the check-in vitals, in ONE query ──
// Shared by /api/coach/roster-sleep (the app's Today feed) and Nora's "What needs me
// today?" (src/lib/ai/coachToday.mjs), so the two triage the same inputs. `sb` is the
// COACH'S own client: RLS (providers_read_subscriber_snapshots) gates each snapshot row
// to coaches with an active subscription on that client, so an `.in('user_id', ids)`
// only ever returns the caller's own clients' rows.
//
// Each leg is present only when that client has REAL data for it: a client with check-in
// gauges but no synced sleep gets a vitals-only entry, never a fabricated sleepHours.

// The QUERY window is 14 days because the SLEEP leg wants that much history; the vitals
// legs narrow it to 7 calendar days (buildRosterVitals above).
export const RECOVERY_QUERY_DAYS = 14;

/**
 * { [userId]: { sleepHours?: { avg7, lastNight, target }, vitals? } } from snapshot rows
 * in snapshot_date order.
 * @param {unknown[]} rows
 * @param {{ now?: Date }} [opts]
 */
export function buildRosterRecovery(rows, opts = {}) {
  // Per-user sleep values in snapshot_date order, over the full 14-day read. A missing or
  // junk value is ABSENCE: the row is skipped, never coerced (Number(null) is a finite 0,
  // the documented fabrication class), and `v > 0` matches the engine's absence doctrine.
  const sleepByUser = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const v = Number(r && r.sleep_hours);
    if (!Number.isFinite(v) || v <= 0) continue;
    const k = String(r.user_id);
    const vals = sleepByUser.get(k) || [];
    vals.push(v);
    sleepByUser.set(k, vals);
  }
  const vitalsByUser = buildRosterVitals(rows, { now: opts.now });
  // Sleep keeps its own window: the last 7 LOGGED nights out of the 14-day read.
  const avg7 = (vals) => {
    const last7 = vals.slice(-7);
    return Math.round((last7.reduce((a, b) => a + b, 0) / last7.length) * 100) / 100;
  };
  /** @type {Record<string, { sleepHours?: { avg7: number, lastNight: number, target: number }, vitals?: object }>} */
  const recovery = {};
  // A client may have sleep with no in-window vitals, or vitals with no sleep: walk the
  // union so neither leg can drop the other's entry.
  for (const k of new Set([...sleepByUser.keys(), ...vitalsByUser.keys()])) {
    /** @type {{ sleepHours?: { avg7: number, lastNight: number, target: number }, vitals?: object }} */
    const entry = {};
    const sleep = sleepByUser.get(k);
    if (sleep && sleep.length) entry.sleepHours = { avg7: avg7(sleep), lastNight: sleep[sleep.length - 1], target: 7.5 };
    const vitals = vitalsByUser.get(k);
    if (vitals) entry.vitals = vitals;
    if (entry.sleepHours || entry.vitals) recovery[k] = entry;
  }
  return recovery;
}

/**
 * Read and build the roster's recovery. `ok` is false when the read failed, so a caller
 * can say so rather than read the absence as "nobody slept badly".
 * @param {any} sb
 * @param {string[]} ids
 * @param {{ now?: Date }} [opts]
 */
export async function readRosterRecovery(sb, ids, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  if (!Array.isArray(ids) || !ids.length) return { ok: true, recovery: {} };
  const since = new Date(now.getTime() - RECOVERY_QUERY_DAYS * 86_400_000).toISOString().slice(0, 10);
  let rows = null;
  try {
    // Explicit column list is safe: user_id / snapshot_date / sleep_hours / hydration_l
    // predate the sleep-detail migration, and energy / hunger landed with
    // 2026-06-25-daily-energy-hunger.sql (applied live), so PostgREST won't 400.
    const r = await sb.from('daily_health_snapshot')
      .select('user_id, snapshot_date, sleep_hours, energy, hunger, hydration_l')
      .in('user_id', ids)
      .gte('snapshot_date', since)
      .order('snapshot_date', { ascending: true });
    if (r && !r.error) rows = Array.isArray(r.data) ? r.data : [];
  } catch { rows = null; }
  return { ok: rows !== null, recovery: buildRosterRecovery(rows || [], { now }) };
}
