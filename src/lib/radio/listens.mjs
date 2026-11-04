// listens.mjs — who listened to Shape's own station, and the performances that makes (part 4 of
// Shape's own radio; owner, 2026-11-03: "Compliance requires a per-performance count for every
// play - build that").
//
// The statutory webcasting licence is paid to SoundExchange per performance: one recording, any
// portion of it, to one listener. The station server (services/station) tells Shape as each
// listener joins and leaves (Icecast's url auth, through /api/radio/pass), and Shape keeps each
// session (radio_listens, no account and no address). For every play in the engine's log, the
// report counts the sessions that heard any part of it.
//
//   stationCaller(authorization, env)       is this call the station server's own? (its sign-in)
//   parseBoot(value)                        the station start a call names → { boot, bootAt } | null
//   recordListen(db, event)                 a listener joining or leaving, stored
//   playWindows(events)                     each song's audible span, from the engine's log
//   sessionSpans(rows, nextBoot, { now })   each session's span; an unended one closed where its
//                                           station stopped
//   countPerformances(windows, spans)       per play, the sessions that heard any part of it
//   tuningHours(spans, [fromMs, toMs])      the hours listened in a range
//   performanceReport(db, [from, to), opts) the range's plays, each with its performances, and totals
//   listeningNow(db, { now })               who listens on the station's latest start (the dashboard)
//
// ⚠ EVERY DOUBT COUNTS AS A PERFORMANCE. An uncounted performance is a gap in the licence report;
// a counted one that did not happen costs a fraction of a cent. So a song is heard from the moment
// the engine started sending it until the last of it could have reached a listener (the blend
// into the next song, and the listener's lag), and a session whose end never reached Shape lasts
// until its station started again.

import { timingSafeEqual } from 'node:crypto';
import { HEARD_LAG_SEC } from './noraOnAir.mjs';
import { BLEND_BARS, BEATMATCH_MAX } from './noraPlanner.mjs';
import { MAX_TRACK_SEC } from './library.mjs';

export const STATION_USER = 'station';
// The planner beatmatches songs it can grid, at 60 BPM and up (library.mjs), each played within
// BEATMATCH_MAX of its own tempo: its longest blend is BLEND_BARS (and a bar's slack) at 60 BPM
// played that much slower. Every other kind of blend is shorter (ten seconds at most).
export const MIN_GRID_BPM = 60;
export const BLEND_TAIL_SEC = Math.ceil(((BLEND_BARS + 1) * 4 * (60 / MIN_GRID_BPM)) / (1 - BEATMATCH_MAX));
const PAGE = 1000;           // one select returns at most 1,000 rows, with no error (src/lib/read-all-by-id.ts)
const MAX_PAGES = 500;

/**
 * The station server signs in on every call it makes to Shape (Icecast's url auth `username` and
 * `password`): `station` and the engine's own token, which the station's .env already holds.
 */
export function stationCaller(authorization, env = process.env) {
  const token = String(env.NORA_ENGINE_TOKEN || '');
  if (token.length < 32) return false;
  const want = Buffer.from(`Basic ${Buffer.from(`${STATION_USER}:${token}`, 'utf8').toString('base64')}`);
  const got = Buffer.from(String(authorization || ''));
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * The station start a call comes from. The station's container names each start on its door's
 * address (`?boot=<unix seconds>.<16 hex>`, services/station/icecast/entrypoint.sh): Icecast's
 * numbers for its connections start again at each start, and a session left open by the one before
 * ended, at the latest, when this one began.
 */
export function parseBoot(value) {
  const m = /^(\d{9,11})\.[0-9a-f]{16}$/.exec(String(value || ''));
  if (!m) return null;
  return { boot: m[0], bootAt: new Date(Number(m[1]) * 1000).toISOString() };
}

/**
 * A listener joining (`join`, as the station lets them in) or leaving (`leave`, with the length
 * Icecast measured). Joining opens the session; leaving ends it, or, when Shape never heard the
 * join, stores the whole session from that length. A second word on either is ignored.
 */
export async function recordListen(db, { action, boot, bootAt, client, durationSec = 0, now }) {
  const at = new Date(now).toISOString();
  const T = 'radio_listens';
  if (action === 'join') {
    const { error } = await db.from(T).upsert(
      { boot, boot_at: bootAt, client, started_at: at },
      { onConflict: 'boot,client', ignoreDuplicates: true },
    );
    return error ? { ok: false, error: 'write_failed' } : { ok: true };
  }
  if (action !== 'leave') return { ok: false, error: 'action' };
  const { data: open, error: readErr } = await db.from(T).select('id,started_at,ended_at')
    .eq('boot', boot).eq('client', client).maybeSingle();
  if (readErr) return { ok: false, error: 'read_failed' };
  if (open) {
    if (open.ended_at) return { ok: true };
    // Never before it began (two servers' clocks a moment apart).
    const ended = new Date(Math.max(now, Date.parse(open.started_at))).toISOString();
    const { error } = await db.from(T).update({ ended_at: ended, duration_sec: durationSec })
      .eq('id', open.id).is('ended_at', null);
    return error ? { ok: false, error: 'write_failed' } : { ok: true };
  }
  const { error } = await db.from(T).upsert(
    { boot, boot_at: bootAt, client, started_at: new Date(now - durationSec * 1000).toISOString(), ended_at: at, duration_sec: durationSec },
    { onConflict: 'boot,client', ignoreDuplicates: true },
  );
  return error ? { ok: false, error: 'write_failed' } : { ok: true };
}

const segmentOf = (r) => (r.set_id ? `set:${r.set_id}` : r.block_id ? `block:${r.block_id}` : null);

/**
 * Each song's audible span, in ms, from the engine's log (every event, in played order). A song
 * sounds from its start until the next word on its set or block: through the blend when the next
 * song took over, and no further when the engine stopped; then the listener's lag. With no next
 * word at all, it may have played to the longest song the library takes.
 * @returns {Map<object, {start: number, end: number}>} keyed by the song's own row
 */
export function playWindows(events) {
  const lagMs = HEARD_LAG_SEC * 1000;
  const out = new Map();
  const last = new Map();
  for (const r of events) {
    const seg = segmentOf(r);
    const at = Date.parse(r.played_at);
    if (!seg || !Number.isFinite(at)) continue;
    const prev = last.get(seg);
    if (prev) {
      const tail = r.event === 'song' ? BLEND_TAIL_SEC * 1000 : 0;
      out.set(prev.row, { start: prev.at, end: Math.max(prev.at, at + tail + lagMs) });
      last.delete(seg);
    }
    if (r.event === 'song') last.set(seg, { row: r, at });
  }
  for (const { row, at } of last.values()) out.set(row, { start: at, end: at + (MAX_TRACK_SEC + HEARD_LAG_SEC) * 1000 });
  return out;
}

/**
 * Each session as a span in ms. One with no reported end lasted until its station started again
 * (`nextBoot.get(boot)`, ms), or, while its station is still the latest, until now.
 */
export function sessionSpans(rows, nextBoot, { now }) {
  const spans = [];
  for (const r of rows) {
    const start = Date.parse(r.started_at);
    if (!Number.isFinite(start)) continue;
    let end = r.ended_at ? Date.parse(r.ended_at) : Math.min(nextBoot.get(r.boot) ?? now, now);
    if (!Number.isFinite(end)) end = now;
    spans.push({ start, end: Math.max(start, end), open: !r.ended_at });
  }
  return spans;
}

const countBelow = (sorted, x) => {   // how many values are < x
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
};
const countAtMost = (sorted, x) => {  // how many values are <= x
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= x) lo = mid + 1; else hi = mid; }
  return lo;
};

/**
 * Per window, the sessions that overlap it: began before it ended, and ended after it began. Every
 * session that ended by the window's start also began before its end, so the overlap is the one
 * count less the other.
 */
export function countPerformances(windows, spans) {
  const starts = spans.map((s) => s.start).sort((a, b) => a - b);
  const ends = spans.map((s) => s.end).sort((a, b) => a - b);
  return windows.map((w) => countBelow(starts, w.end) - countAtMost(ends, w.start));
}

/** The hours listened within [fromMs, toMs), across every session. */
export function tuningHours(spans, [fromMs, toMs]) {
  let ms = 0;
  for (const s of spans) ms += Math.max(0, Math.min(s.end, toMs) - Math.max(s.start, fromMs));
  return ms / 3600000;
}

// A session open this long is a listener that long, or the station's word on leaving not reaching
// Shape (counted until its station starts again, so the report pays for it either way).
export const LONG_OPEN_MS = 12 * 3600000;

/**
 * Who is listening on the station's latest start, and how many of those sessions have been open
 * for over LONG_OPEN_MS. Null when it cannot be read (or before the migration).
 */
export async function listeningNow(db, { now }) {
  const { data: latest, error } = await db.from('radio_listens').select('boot').order('boot_at', { ascending: false }).limit(1);
  if (error) return null;
  if (!latest || !latest[0]) return { listening: 0, openLong: 0 };
  const open = () => db.from('radio_listens').select('id', { count: 'exact', head: true }).eq('boot', latest[0].boot).is('ended_at', null);
  const [all, long] = await Promise.all([open(), open().lt('started_at', new Date(now - LONG_OPEN_MS).toISOString())]);
  if (all.error || long.error) return null;
  return { listening: all.count ?? 0, openLong: long.count ?? 0 };
}

async function readAll(build) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build().range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { rows };
  }
  return { error: { code: 'too_many' } };
}
const missingTable = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205');

/**
 * Every song played in [fromIso, toIso), each with its performances, and the range's totals.
 * `performances` is null for a play before Shape's own station was measuring (radio.co's, or before
 * the first listener reached it); a rotation block is always Shape's own.
 */
export async function performanceReport(db, [fromIso, toIso], { now }) {
  const from = Date.parse(fromIso), to = Date.parse(toIso);
  // Songs near the end still blending into the next one, or playing on: their next word is read too.
  const readTo = new Date(to + (MAX_TRACK_SEC + BLEND_TAIL_SEC + HEARD_LAG_SEC + 60) * 1000).toISOString();
  const readEvents = (cols) => readAll(() => db.from('nora_engine_log').select(cols)
    .gte('played_at', fromIso).lt('played_at', readTo).order('played_at', { ascending: true }).order('id', { ascending: true }));
  let ev = await readEvents('id,event,played_at,artist,title,isrc,album,label,set_id,block_id');
  // Before 2026-11-03-radio-rotation.sql there is no block column, and no rotation play to report.
  if (ev.error && ev.error.code === '42703') ev = await readEvents('id,event,played_at,artist,title,isrc,album,label,set_id');
  if (ev.error) return { ok: false, error: 'read_failed' };

  const listens = await readAll(() => db.from('radio_listens').select('id,boot,boot_at,started_at,ended_at')
    .lt('started_at', readTo).or(`ended_at.is.null,ended_at.gt."${fromIso}"`).order('id', { ascending: true }));
  let measured = true;
  let rows = listens.rows || [];
  if (listens.error) {
    // Before 2026-11-03-radio-listens.sql: no sessions to count, and every count is blank.
    if (!missingTable(listens.error)) return { ok: false, error: 'read_failed' };
    measured = false;
    rows = [];
  }
  let firstBoot = null;
  const nextBoot = new Map();
  if (measured) {
    const { data: first, error: fErr } = await db.from('radio_listens').select('boot_at').order('boot_at', { ascending: true }).limit(1);
    if (fErr) return { ok: false, error: 'read_failed' };
    firstBoot = first && first[0] ? Date.parse(first[0].boot_at) : null;
    for (const r of rows) {
      if (r.ended_at || nextBoot.has(r.boot)) continue;
      const { data: nb, error: nErr } = await db.from('radio_listens').select('boot_at')
        .gt('boot_at', r.boot_at).neq('boot', r.boot).order('boot_at', { ascending: true }).limit(1);
      if (nErr) return { ok: false, error: 'read_failed' };
      nextBoot.set(r.boot, nb && nb[0] ? Date.parse(nb[0].boot_at) : undefined);
    }
  }

  const windows = playWindows(ev.rows);
  const spans = sessionSpans(rows, nextBoot, { now });
  const plays = ev.rows.filter((r) => r.event === 'song' && Date.parse(r.played_at) >= from && Date.parse(r.played_at) < to);
  const counted = plays.map((r) => {
    const at = Date.parse(r.played_at);
    return measured && (!!r.block_id || (firstBoot != null && at >= firstBoot));
  });
  const counts = countPerformances(plays.map((r) => windows.get(r)
    || { start: Date.parse(r.played_at), end: Date.parse(r.played_at) + (MAX_TRACK_SEC + HEARD_LAG_SEC) * 1000 }), spans);
  const out = plays.map((r, i) => ({ ...r, performances: counted[i] ? counts[i] : null }));
  const inRange = spans.filter((s) => s.start < to && s.end > from);
  return {
    ok: true,
    plays: out,
    totals: {
      plays: out.length,
      measuredPlays: counted.filter(Boolean).length,
      performances: out.reduce((n, p) => n + (p.performances || 0), 0),
      tuningHours: measured ? tuningHours(spans, [from, Math.min(to, now)]) : null,
      sessions: measured ? inRange.length : null,
      openSessions: measured ? inRange.filter((s) => s.open).length : null,
    },
  };
}
