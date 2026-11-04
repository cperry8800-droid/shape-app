// noraEngineApi.mjs — what Shape tells Nora's engine (services/nora-engine) and what it keeps of
// what the engine reports, against the SERVICE-ROLE client. The route
// (src/app/api/radio/nora/engine/route.ts) only checks the engine's token and maps to HTTP.
//
//   setJob(db, set, { now })        one of Nora's sets for the engine: its programme and a signed
//                                   link to each song's file
//   signSources(db, programme, ttl) the signed links alone (a rotation block's too)
//   recordEngineEvent(db, body, { now })  a set or rotation block started / a song played / it
//                                   ended or failed
//
// What plays when is src/lib/radio/rotation.mjs's (the engine's ?mode=station questions): it hands
// out Nora's sets through setJob and fills the time between them, and holds the licence gate (a
// withdrawal stops what plays at the engine's next check, not at the next hourly sync).
// ⚠ THE PLAY LOG IS THE LICENCE REPORT'S SOURCE. Each played song is logged with its title, artist,
// album, label and ISRC copied from the library at that moment, so a song removed later still
// reports as what was played.

import { ensureProgramme } from './noraSetStore.mjs';
import { LIBRARY_BUCKET, cleanText, isUuid } from './library.mjs';
import { performanceReport } from './listens.mjs';

const OVERRUN_MS = 10 * 60000;                  // a set's links outlast its planned end by this
const LINK_TTL_MIN_SEC = 3600;
export const ENGINE_EVENTS = Object.freeze(['started', 'song', 'ended', 'failed']);

/** A signed link to each song of a programme, lasting `ttlSec`. */
export async function signSources(db, programme, ttlSec) {
  const ids = [...new Set(((programme && programme.items) || []).map((it) => it.trackId))];
  const { data: rows, error: tErr } = await db.from('radio_tracks').select('id,storage_path').in('id', ids);
  if (tErr) return { status: 503, body: { error: 'read_failed' } };
  const pathOf = new Map((rows || []).map((r) => [r.id, r.storage_path]));
  const sources = {};
  for (const id of ids) {
    const path = pathOf.get(id);
    // A song deleted since the plan: the engine refuses a programme with a missing source, so the
    // station falls back to its standby loop instead of airing a hole.
    if (!path) return { status: 409, body: { error: 'song_missing', trackId: id } };
    const { data, error: sErr } = await db.storage.from(LIBRARY_BUCKET).createSignedUrl(path, ttlSec);
    if (sErr || !data || !data.signedUrl) return { status: 503, body: { error: 'sign_failed' } };
    sources[id] = data.signedUrl;
  }
  return { sources };
}

/** The engine's job for one Nora set: its programme (planned now if the cron missed it) and links. */
export async function setJob(db, set, { now }) {
  const prog = await ensureProgramme(db, set.id);
  if (prog.error) return { status: 503, body: { error: prog.error, setId: set.id } };
  const endMs = Date.parse(set.starts_at) + prog.programme.endsSec * 1000 + OVERRUN_MS;
  const ttl = Math.max(LINK_TTL_MIN_SEC, Math.ceil((endMs - now) / 1000) + LINK_TTL_MIN_SEC);
  const signed = await signSources(db, prog.programme, ttl);
  if (!signed.sources) return { status: signed.status, body: { ...signed.body, setId: set.id } };
  return {
    status: 200,
    body: { nowMs: now, set: { id: set.id, startsAt: new Date(Date.parse(set.starts_at)).toISOString(), durationMin: set.duration_min }, programme: prog.programme, sources: signed.sources },
  };
}

/**
 * Check and store one engine report: about a Nora set (`setId`) or a block of the station's own
 * rotation (`blockId`, src/lib/radio/rotation.mjs), never both.
 */
export async function recordEngineEvent(db, body, { now }) {
  const b = body && typeof body === 'object' ? body : {};
  if (!ENGINE_EVENTS.includes(b.event)) return { status: 400, body: { error: 'event' } };
  const isBlock = b.blockId != null;
  if (isBlock && (b.setId != null || !isUuid(b.blockId))) return { status: 400, body: { error: 'block_id' } };
  if (!isBlock && !isUuid(b.setId)) return { status: 400, body: { error: 'set_id' } };
  const atSec = Number(b.atSec);
  if (b.atSec != null && !(Number.isFinite(atSec) && atSec >= 0 && atSec < 7 * 3600)) return { status: 400, body: { error: 'at' } };

  // The segment: when it started, and (for a song) the programme the song must be in.
  let startsAt, readItems, row;
  if (isBlock) {
    const { data: blk, error } = await db.from('radio_rotation_blocks').select('id,starts_at,programme').eq('id', b.blockId).maybeSingle();
    if (error) return { status: 503, body: { error: 'read_failed' } };
    if (!blk) return { status: 404, body: { error: 'not_a_block' } };
    startsAt = blk.starts_at;
    readItems = async () => ({ items: (blk.programme && blk.programme.items) || [] });
    row = { block_id: blk.id };
  } else {
    const { data: set, error } = await db.from('nora_sets').select('id,starts_at,host_kind').eq('id', b.setId).maybeSingle();
    if (error) return { status: 503, body: { error: 'read_failed' } };
    if (!set || set.host_kind !== 'nora') return { status: 404, body: { error: 'not_a_nora_set' } };
    startsAt = set.starts_at;
    readItems = async () => {
      const { data: prog, error: pErr } = await db.from('nora_set_programmes').select('programme').eq('set_id', set.id).maybeSingle();
      if (pErr) return { error: pErr };
      return { items: (prog && prog.programme && prog.programme.items) || [] };
    };
    row = { set_id: set.id };
  }
  const at = Number.isFinite(atSec) ? new Date(Date.parse(startsAt) + atSec * 1000) : new Date(now);

  Object.assign(row, { event: b.event, played_at: at.toISOString(), detail: b.detail == null ? null : cleanText(String(b.detail), 300) || null });
  if (b.event === 'song') {
    if (!isUuid(b.trackId)) return { status: 400, body: { error: 'track_id' } };
    // The song must be one this set or block planned: the log is a licence record, not a
    // free-form list.
    const got = await readItems();
    if (got.error) return { status: 503, body: { error: 'read_failed' } };
    const item = got.items.find((it) => it.trackId === b.trackId);
    if (!item) return { status: 409, body: { error: 'not_in_programme' } };
    const { data: t, error: tErr } = await db.from('radio_tracks').select('id,title,artist,album,label,isrc').eq('id', b.trackId).maybeSingle();
    if (tErr) return { status: 503, body: { error: 'read_failed' } };
    Object.assign(row, {
      track_id: t ? t.id : null,
      title: (t && t.title) || item.title, artist: (t && t.artist) || item.artist,
      album: (t && t.album) || item.album || null, label: (t && t.label) || item.label || null, isrc: (t && t.isrc) || item.isrc || null,
    });
  }
  const { error: insErr } = await db.from('nora_engine_log').insert(row);
  if (insErr) return { status: 503, body: { error: 'write_failed' } };
  return { status: 200, body: { ok: true } };
}

// ── The play report ────────────────────────────────────────────────────────────────────────
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  // A cell a spreadsheet would run as a formula is prefixed so it stays text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** "2026-10" → [start, end) of that calendar month in UTC, or null. */
export function monthRange(month) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month || ''));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  return [new Date(Date.UTC(y, mo - 1, 1)).toISOString(), new Date(Date.UTC(y, mo, 1)).toISOString()];
}

/**
 * Every song the engine played in a month (Nora's sets and, on Shape's own station, its rotation),
 * as CSV, in the order SoundExchange's report of use asks for its per-play fields, each with its
 * performances: the listeners who heard any part of it (src/lib/radio/listens.mjs; blank only
 * before the station's sessions were kept). Every play, a page at a time.
 */
export async function playsCsv(db, month, { now = Date.now() } = {}) {
  const range = monthRange(month);
  if (!range) return { status: 400, body: 'month must be YYYY-MM' };
  const report = await performanceReport(db, range, { now });
  if (!report.ok) return { status: 503, body: 'read failed' };
  const head = ['Played at (UTC)', 'Featured artist', 'Sound recording title', 'ISRC', 'Album title', 'Marketing label', 'Actual total performances', 'Nora set', 'Rotation block'];
  const lines = [head.join(',')];
  for (const r of report.plays) {
    lines.push([r.played_at, r.artist, r.title, r.isrc, r.album, r.label, r.performances, r.set_id, r.block_id].map(csvCell).join(','));
  }
  return { status: 200, body: `${lines.join('\r\n')}\r\n`, count: report.plays.length };
}

/**
 * The month's totals, as one CSV row: its plays, its performances, its listening hours (aggregate
 * tuning hours) and its sessions, with those whose end never reached Shape (each counted until its
 * station started again: a number that grows means the station's word on leaving is being lost).
 */
export async function playsSummaryCsv(db, month, { now = Date.now() } = {}) {
  const range = monthRange(month);
  if (!range) return { status: 400, body: 'month must be YYYY-MM' };
  const report = await performanceReport(db, range, { now });
  if (!report.ok) return { status: 503, body: 'read failed' };
  const t = report.totals;
  const head = ['Month (UTC)', 'Plays', 'Plays measured', 'Actual total performances', 'Aggregate tuning hours', 'Listening sessions', 'Sessions with no reported end'];
  const row = [month, t.plays, t.measuredPlays, t.performances, t.tuningHours == null ? null : t.tuningHours.toFixed(2), t.sessions, t.openSessions];
  return { status: 200, body: `${head.join(',')}\r\n${row.map(csvCell).join(',')}\r\n`, totals: t };
}
