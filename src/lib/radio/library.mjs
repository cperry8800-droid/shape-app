// library.mjs — Nora's song library: what an upload may be, where its file goes, and which of
// the browser's measurements the server keeps (supabase-migrations/2026-10-11-radio-library.sql).
// Pure: no I/O, no clock. The admin routes and the dashboard page share it, and the database's
// own checks mirror every rule here, so a bypass of this module still meets the same limits.
//
// ⚠ THE SERVER NEVER TRUSTS THE ANALYSIS IT IS HANDED. The browser measured the song, but the
// payload arrives over the network: every number is range-checked, every grid field is dropped
// when the tempo is, and the key's name is derived here from the Camelot code rather than taken
// as text. A song whose analysis fails the check is not stored as analysed.

export const LIBRARY_BUCKET = 'radio-library';
export const MAX_TRACK_BYTES = 62914560; // 60 MB, the bucket's own limit
export const MIN_TRACK_SEC = 30;
export const MAX_TRACK_SEC = 1800;
export const ANALYSIS_VERSION = 1;
export const OVERVIEW_POINTS = 200;

// The type the file is stored as, by extension: the bucket allows exactly these six.
export const TYPE_BY_EXT = Object.freeze({
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
});

// Every spelling a browser or OS reports for those, mapped to the extension.
// ⚠ A FILE WITH NO TYPE ARRIVES AS application/octet-stream OR '', never as missing, so the
// extension decides whenever the declared type is not one of these (#2289's lesson).
const EXT_BY_TYPE = Object.freeze({
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mpeg3': 'mp3', 'audio/x-mpeg': 'mp3',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/aac': 'aac', 'audio/x-aac': 'aac',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/vnd.wave': 'wav',
  'audio/flac': 'flac', 'audio/x-flac': 'flac',
  'audio/ogg': 'ogg', 'audio/vorbis': 'ogg',
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;
const CAMELOT_RE = /^(1[0-2]|[1-9])([AB])$/;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };

/** One line of text: control characters out, whitespace collapsed, trimmed, capped. '' when nothing is left. */
export function cleanText(v, max = 200) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max).trim() : s;
}

/** An ISRC as the registry writes it (no hyphens or spaces, upper case), or null when it is not one. */
export function cleanIsrc(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\s-]+/g, '').toUpperCase();
  return ISRC_RE.test(s) ? s : null;
}

export function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v); }

/** The extension a file is stored under, from its declared type or else its name; null when it is not audio the bucket takes. */
export function trackExt(fileName, type) {
  const t = typeof type === 'string' ? type.trim().toLowerCase().split(';')[0] : '';
  if (EXT_BY_TYPE[t]) return EXT_BY_TYPE[t];
  const m = /\.([a-z0-9]{2,5})$/i.exec(typeof fileName === 'string' ? fileName.trim() : '');
  const ext = m ? m[1].toLowerCase() : '';
  return TYPE_BY_EXT[ext] ? ext : null;
}

export function trackPath(id, ext) {
  if (!isUuid(id) || !TYPE_BY_EXT[ext]) throw new Error('trackPath: bad id or extension');
  return `tracks/${id}.${ext}`;
}

/**
 * Check what the browser says about a file before an upload URL is issued for it.
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
export function checkUpload(input) {
  const i = input && typeof input === 'object' ? input : {};
  const fileName = cleanText(i.fileName, 255);
  if (!fileName) return { ok: false, error: 'file_name' };
  const ext = trackExt(fileName, i.type);
  if (!ext) return { ok: false, error: 'not_audio' };
  const size = Number(i.size);
  if (!Number.isInteger(size) || size < 1) return { ok: false, error: 'size' };
  if (size > MAX_TRACK_BYTES) return { ok: false, error: 'too_large' };
  const sha256 = typeof i.sha256 === 'string' ? i.sha256.toLowerCase() : '';
  if (!SHA_RE.test(sha256)) return { ok: false, error: 'sha256' };
  const durationSec = Number(i.durationSec);
  if (!Number.isFinite(durationSec) || durationSec < MIN_TRACK_SEC) return { ok: false, error: 'too_short' };
  if (durationSec > MAX_TRACK_SEC) return { ok: false, error: 'too_long' };
  const title = cleanText(i.title);
  if (!title) return { ok: false, error: 'title' };
  const artist = cleanText(i.artist);
  if (!artist) return { ok: false, error: 'artist' };
  return {
    ok: true,
    value: {
      fileName, ext, mime: TYPE_BY_EXT[ext], size, sha256, durationSec: round(durationSec, 3),
      title, artist,
      album: cleanText(i.album) || null,
      label: cleanText(i.label) || null,
      isrc: cleanIsrc(i.isrc),
    },
  };
}

/**
 * The editable fields of a song (title, artist, album, label, ISRC, in rotation). Only the keys
 * present are changed; a required field cannot be emptied.
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
export function checkEdit(input) {
  const i = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const k of ['title', 'artist']) {
    if (k in i) { const v = cleanText(i[k]); if (!v) return { ok: false, error: k }; out[k] = v; }
  }
  for (const k of ['album', 'label']) if (k in i) out[k] = cleanText(i[k]) || null;
  if ('isrc' in i) {
    const raw = typeof i.isrc === 'string' ? i.isrc.trim() : '';
    const v = cleanIsrc(raw);
    if (raw && !v) return { ok: false, error: 'isrc' };
    out.isrc = v;
  }
  if ('enabled' in i) {
    if (typeof i.enabled !== 'boolean') return { ok: false, error: 'enabled' };
    out.enabled = i.enabled;
  }
  return Object.keys(out).length ? { ok: true, value: out } : { ok: false, error: 'nothing_to_change' };
}

// ── Keys ───────────────────────────────────────────────────────────────────────────────────
// Camelot codes: the number steps round the circle of fifths, A is minor and B major. Two songs
// mix in key when their codes are equal, a number apart with the same letter, or the same
// number with the other letter (relative major/minor).
const PITCH = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** The Camelot code of a key: tonic pitch class (C = 0) and mode. */
export function camelotOf(pc, minor) {
  const p = ((Math.round(pc) % 12) + 12) % 12;
  const fifths = (p * 7) % 12; // C 0, G 1, D 2, … F 11
  const n = ((fifths + (minor ? 4 : 7)) % 12) + 1;
  return `${n}${minor ? 'A' : 'B'}`;
}

/** The key's name from its Camelot code ("8A" → "A minor"), or null. */
export function keyName(camelot) {
  const m = CAMELOT_RE.exec(typeof camelot === 'string' ? camelot : '');
  if (!m) return null;
  const n = Number(m[1]), minor = m[2] === 'A';
  for (let pc = 0; pc < 12; pc++) if (camelotOf(pc, minor) === `${n}${m[2]}`) return `${PITCH[pc]} ${minor ? 'minor' : 'major'}`;
  return null;
}

// ── The analysis ───────────────────────────────────────────────────────────────────────────
const inRange = (v, lo, hi) => isNum(v) && v >= lo && v <= hi;
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Keep the browser's analysis only if it holds together. Returns the cleaned object, or null.
 * The grid is all or nothing: a tempo with a broken grid keeps no tempo.
 */
export function cleanAnalysis(a, durationSec) {
  if (!a || typeof a !== 'object' || a.version !== ANALYSIS_VERSION) return null;
  const dur = Number(durationSec);
  if (!(dur > 0) || !inRange(a.durationSec, 0.5, MAX_TRACK_SEC) || Math.abs(a.durationSec - dur) > 1) return null;
  const D = a.durationSec;
  if (!inRange(a.soundStartSec, 0, D) || !inRange(a.soundEndSec, 0, D) || !(a.soundEndSec > a.soundStartSec)) return null;
  if (!inRange(a.fadeOutSec, a.soundStartSec, a.soundEndSec)) return null;
  if (!inRange(a.loudnessDb, -70, 0)) return null;
  if (!inRange(a.intensity, 0, 1)) return null;

  const out = {
    version: ANALYSIS_VERSION,
    durationSec: round(D, 3),
    soundStartSec: round(a.soundStartSec, 3),
    soundEndSec: round(a.soundEndSec, 3),
    fadeOutSec: round(a.fadeOutSec, 3),
    loudnessDb: round(a.loudnessDb, 2),
    intensity: round(a.intensity, 3),
    bpm: null, beatSec: null, downbeatSec: null, lengthBars: null, firstKickBar: null,
    outroBar: null, mixOutBar: null, mixInFromBar: null, breakdowns: [], energyByBar: [],
    confidence: inRange(a.confidence, 0, 1) ? round(a.confidence, 3) : 0,
    reason: typeof a.reason === 'string' ? cleanText(a.reason, 40) || null : null,
    camelot: null, key: null, keyConfidence: 0,
    overview: [],
  };

  // The grid, whole or not at all.
  const grid = (() => {
    if (!inRange(a.bpm, 60, 200)) return null;
    const beatSec = 60 / a.bpm;
    const L = a.lengthBars;
    if (!intIn(L, 1, 2000) || !inRange(a.downbeatSec, -0.05, D)) return null;
    if (a.downbeatSec + L * 4 * beatSec > D + beatSec) return null; // the bars must fit in the song
    for (const k of ['firstKickBar', 'outroBar', 'mixOutBar', 'mixInFromBar']) if (!intIn(a[k], 0, L)) return null;
    if (!(a.firstKickBar <= a.outroBar)) return null;
    const breakdowns = Array.isArray(a.breakdowns) ? a.breakdowns : [];
    if (breakdowns.length > 64) return null;
    for (const b of breakdowns) if (!b || !intIn(b.startBar, 0, L) || !intIn(b.endBar, 0, L) || !(b.endBar > b.startBar)) return null;
    const energy = Array.isArray(a.energyByBar) ? a.energyByBar : [];
    if (energy.length !== L || !energy.every((v) => inRange(v, 0, 1))) return null;
    return {
      bpm: round(a.bpm, 3), beatSec: round(beatSec, 6), downbeatSec: round(a.downbeatSec, 6), lengthBars: L,
      firstKickBar: a.firstKickBar, outroBar: a.outroBar, mixOutBar: a.mixOutBar, mixInFromBar: a.mixInFromBar,
      breakdowns: breakdowns.map((b) => ({ startBar: b.startBar, endBar: b.endBar })),
      energyByBar: energy.map((v) => round(v, 3)),
    };
  })();
  if (grid) Object.assign(out, grid);
  else if (a.bpm != null) out.reason = out.reason || 'grid-rejected';

  if (typeof a.camelot === 'string' && CAMELOT_RE.test(a.camelot)) {
    out.camelot = a.camelot;
    out.key = keyName(a.camelot);
    out.keyConfidence = inRange(a.keyConfidence, 0, 1) ? round(a.keyConfidence, 3) : 0;
  }
  if (Array.isArray(a.overview) && a.overview.length <= OVERVIEW_POINTS && a.overview.every((v) => inRange(v, 0, 1))) {
    out.overview = a.overview.map((v) => round(v, 3));
  }
  return out;
}

/** The columns a cleaned analysis fills on radio_tracks. */
export function analysisColumns(clean) {
  return {
    bpm: clean.bpm,
    camelot: clean.camelot,
    intensity: clean.intensity,
    loudness_db: clean.loudnessDb,
    analysis: clean,
  };
}

/** The columns the admin page lists (never the storage path's signed form, never the file). */
export const LISTING_COLUMNS = 'id,file_name,title,artist,album,label,isrc,duration_sec,bpm,camelot,intensity,loudness_db,status,enabled,created_at';

/** The library's totals for the page: songs ready to plan, and how long they run. */
export function libraryTotals(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const playable = list.filter((r) => r && r.status === 'ready' && r.enabled !== false);
  const seconds = playable.reduce((s, r) => s + (Number(r.duration_sec) || 0), 0);
  return {
    songs: list.length,
    playable: playable.length,
    pending: list.filter((r) => r && r.status === 'pending').length,
    playableHours: round(seconds / 3600, 1),
    distinctArtists: new Set(playable.map((r) => String(r.artist || '').toLowerCase())).size,
  };
}
