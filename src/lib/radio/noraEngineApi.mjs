// noraEngineApi.mjs — what Shape tells Nora's engine (services/nora-engine) and what it keeps of
// what the engine reports, against the SERVICE-ROLE client. The route
// (src/app/api/radio/nora/engine/route.ts) only checks the engine's token and maps to HTTP.
//
//   engineJob(db, { now })          the set due now or next: its programme and a signed link to
//                                   each song's file, or { set: null }
//   recordEngineEvent(db, body, { now })  a set started / a song played / a set ended or failed
//
// ⚠ NOTHING GOES ON THE AIR WITHOUT THE LICENCES. The engine is handed a set only while the owner's
// licence confirmation stands AND the set is published (which the schedule does only then); a
// withdrawal takes effect at the engine's next poll, not at the next hourly sync.
// ⚠ THE PLAY LOG IS THE LICENCE REPORT'S SOURCE. Each played song is logged with its title, artist,
// album, label and ISRC copied from the library at that moment, so a song removed later still
// reports as what was played.

import { ensureProgramme, readLicensed } from './noraSetStore.mjs';
import { LIBRARY_BUCKET, cleanText, isUuid } from './library.mjs';

export const CONNECT_WINDOW_MS = 10 * 60000;   // a set is handed out this long before it starts
const OVERRUN_MS = 10 * 60000;                  // and until this long after its planned end
const LINK_TTL_MIN_SEC = 3600;
export const ENGINE_EVENTS = Object.freeze(['started', 'song', 'ended', 'failed']);

export async function engineJob(db, { now }) {
  const lic = await readLicensed(db);
  if (lic.error) return { status: 503, body: { error: 'read_failed' } };
  if (!lic.licensed) return { status: 200, body: { nowMs: now, set: null, reason: 'unlicensed' } };

  const { data: sets, error } = await db.from('nora_sets').select('id,starts_at,duration_min,published,host_kind')
    .eq('host_kind', 'nora').eq('published', true)
    .gt('starts_at', new Date(now - 7 * 3600000).toISOString()).lte('starts_at', new Date(now + CONNECT_WINDOW_MS).toISOString())
    .order('starts_at', { ascending: true }).limit(20);
  if (error) return { status: 503, body: { error: 'read_failed' } };
  const set = (sets || []).find((s) => Date.parse(s.starts_at) + s.duration_min * 60000 + OVERRUN_MS > now);
  if (!set) return { status: 200, body: { nowMs: now, set: null } };

  const prog = await ensureProgramme(db, set.id);
  if (prog.error) return { status: 503, body: { error: prog.error, setId: set.id } };
  const ids = [...new Set(prog.programme.items.map((it) => it.trackId))];
  const { data: rows, error: tErr } = await db.from('radio_tracks').select('id,storage_path').in('id', ids);
  if (tErr) return { status: 503, body: { error: 'read_failed' } };
  const pathOf = new Map((rows || []).map((r) => [r.id, r.storage_path]));
  const endMs = Date.parse(set.starts_at) + prog.programme.endsSec * 1000 + OVERRUN_MS;
  const ttl = Math.max(LINK_TTL_MIN_SEC, Math.ceil((endMs - now) / 1000) + LINK_TTL_MIN_SEC);
  const sources = {};
  for (const id of ids) {
    const path = pathOf.get(id);
    // A song deleted since the plan: the engine refuses a set with a missing source, so the
    // station's AutoDJ plays instead of a set with a hole in it.
    if (!path) return { status: 409, body: { error: 'song_missing', trackId: id, setId: set.id } };
    const { data, error: sErr } = await db.storage.from(LIBRARY_BUCKET).createSignedUrl(path, ttl);
    if (sErr || !data || !data.signedUrl) return { status: 503, body: { error: 'sign_failed' } };
    sources[id] = data.signedUrl;
  }
  return {
    status: 200,
    body: { nowMs: now, set: { id: set.id, startsAt: new Date(Date.parse(set.starts_at)).toISOString(), durationMin: set.duration_min }, programme: prog.programme, sources },
  };
}

/** Check and store one engine report. */
export async function recordEngineEvent(db, body, { now }) {
  const b = body && typeof body === 'object' ? body : {};
  if (!ENGINE_EVENTS.includes(b.event)) return { status: 400, body: { error: 'event' } };
  if (!isUuid(b.setId)) return { status: 400, body: { error: 'set_id' } };
  const atSec = Number(b.atSec);
  if (b.atSec != null && !(Number.isFinite(atSec) && atSec >= 0 && atSec < 7 * 3600)) return { status: 400, body: { error: 'at' } };

  const { data: set, error } = await db.from('nora_sets').select('id,starts_at,host_kind').eq('id', b.setId).maybeSingle();
  if (error) return { status: 503, body: { error: 'read_failed' } };
  if (!set || set.host_kind !== 'nora') return { status: 404, body: { error: 'not_a_nora_set' } };
  const at = Number.isFinite(atSec) ? new Date(Date.parse(set.starts_at) + atSec * 1000) : new Date(now);

  const row = { set_id: set.id, event: b.event, played_at: at.toISOString(), detail: b.detail == null ? null : cleanText(String(b.detail), 300) || null };
  if (b.event === 'song') {
    if (!isUuid(b.trackId)) return { status: 400, body: { error: 'track_id' } };
    // The song must be one this set planned: the log is a licence record, not a free-form list.
    const { data: prog, error: pErr } = await db.from('nora_set_programmes').select('programme').eq('set_id', set.id).maybeSingle();
    if (pErr) return { status: 503, body: { error: 'read_failed' } };
    if (!prog || !((prog.programme && prog.programme.items) || []).some((it) => it.trackId === b.trackId)) return { status: 409, body: { error: 'not_in_programme' } };
    const { data: t, error: tErr } = await db.from('radio_tracks').select('id,title,artist,album,label,isrc').eq('id', b.trackId).maybeSingle();
    if (tErr) return { status: 503, body: { error: 'read_failed' } };
    const item = prog.programme.items.find((it) => it.trackId === b.trackId);
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
 * Every song Nora played in a month, as CSV, in the order SoundExchange's report of use asks for
 * its per-play fields. Listener counts are the station's own figure (radio.co's statistics) and
 * are not here.
 */
export async function playsCsv(db, month) {
  const range = monthRange(month);
  if (!range) return { status: 400, body: 'month must be YYYY-MM' };
  const { data, error } = await db.from('nora_engine_log').select('played_at,artist,title,isrc,album,label,set_id')
    .eq('event', 'song').gte('played_at', range[0]).lt('played_at', range[1]).order('played_at', { ascending: true }).limit(50000);
  if (error) return { status: 503, body: 'read failed' };
  const head = ['Played at (UTC)', 'Featured artist', 'Sound recording title', 'ISRC', 'Album title', 'Marketing label', 'Nora set'];
  const lines = [head.join(',')];
  for (const r of data || []) lines.push([r.played_at, r.artist, r.title, r.isrc, r.album, r.label, r.set_id].map(csvCell).join(','));
  return { status: 200, body: `${lines.join('\r\n')}\r\n`, count: (data || []).length };
}
