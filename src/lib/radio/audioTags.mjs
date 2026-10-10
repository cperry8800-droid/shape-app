// audioTags.mjs — the title, artist, album, label and ISRC a music file carries, read in the
// browser before it uploads, so the owner does not type what the file already says.
//
//   readTags(bytes: Uint8Array, fileName) → { title, artist, album, label, isrc, source }
//
// Reads ID3v2.2–2.4 and ID3v1 (MP3), the iTunes `ilst` atoms (M4A/MP4/AAC in MP4) and FLAC's
// Vorbis comments. Anything missing falls back to the file name ("01 - Artist - Title.mp3").
// Every value is a plain string or null; the server cleans and caps them again (library.mjs).
//
// PURE: bytes in, strings out. A malformed tag is skipped, never thrown on: the worst case is
// the file-name fallback, which the owner can correct on the page.

const EMPTY = Object.freeze({ title: null, artist: null, album: null, label: null, isrc: null });

function latin1(b, s, e) { let out = ''; for (let i = s; i < e; i++) out += String.fromCharCode(b[i]); return out; }

function utf8(b, s, e) {
  try { return new TextDecoder('utf-8').decode(b.subarray(s, e)); } catch { return latin1(b, s, e); }
}

function utf16(b, s, e, bigEndian) {
  let out = '';
  for (let i = s; i + 1 < e; i += 2) {
    const c = bigEndian ? (b[i] << 8) | b[i + 1] : b[i] | (b[i + 1] << 8);
    out += String.fromCharCode(c);
  }
  return out;
}

const tidy = (v) => {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/\u0000+$/g, '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s || null;
};

// ── ID3v2 ──────────────────────────────────────────────────────────────────────────────────
const synchsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const be32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

function id3Text(b, s, e) {
  if (e <= s) return null;
  const enc = b[s];
  const body = s + 1;
  if (enc === 0) return tidy(latin1(b, body, e));
  if (enc === 3) return tidy(utf8(b, body, e));
  if (enc === 1) {
    // UTF-16 with a byte-order mark; several null-separated strings take the first.
    if (b[body] === 0xff && b[body + 1] === 0xfe) return tidy(utf16(b, body + 2, e, false).split('\u0000')[0]);
    if (b[body] === 0xfe && b[body + 1] === 0xff) return tidy(utf16(b, body + 2, e, true).split('\u0000')[0]);
    return tidy(utf16(b, body, e, false).split('\u0000')[0]);
  }
  if (enc === 2) return tidy(utf16(b, body, e, true).split('\u0000')[0]);
  return null;
}

/** A text frame's whole decoded body (every null-separated part kept), for TXXX. */
function id3TextRaw(b, s, e) {
  const enc = b[s], body = s + 1;
  if (enc === 0) return latin1(b, body, e);
  if (enc === 3) return utf8(b, body, e);
  if (enc === 1) {
    if (b[body] === 0xff && b[body + 1] === 0xfe) return utf16(b, body + 2, e, false).replace(/\ufeff/g, '');
    if (b[body] === 0xfe && b[body + 1] === 0xff) return utf16(b, body + 2, e, true).replace(/\ufeff/g, '');
    return utf16(b, body, e, false);
  }
  if (enc === 2) return utf16(b, body, e, true);
  return '';
}

const TXXX_FIELDS = { ISRC: 'isrc', LABEL: 'label', PUBLISHER: 'label' };

// v2.3/2.4 frame ids, and v2.2's three-letter ones.
const ID3_FIELDS = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album', TPUB: 'label', TPB: 'label', TSRC: 'isrc', TRC: 'isrc' };

export function readId3v2(b) {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null;
  const major = b[3];
  if (major < 2 || major > 4) return null;
  const flags = b[5];
  const size = synchsafe(b, 6);
  const end = Math.min(b.length, 10 + size);
  let o = 10;
  if (flags & 0x40 && major >= 3) o += major === 4 ? synchsafe(b, 10) : be32(b, 10) + 4; // extended header
  const out = { ...EMPTY };
  const idLen = major === 2 ? 3 : 4;
  const headLen = major === 2 ? 6 : 10;
  while (o + headLen <= end) {
    const id = latin1(b, o, o + idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    const len = major === 2 ? (b[o + 3] << 16) | (b[o + 4] << 8) | b[o + 5] : major === 4 ? synchsafe(b, o + 4) : be32(b, o + 4);
    const s = o + headLen, e = s + len;
    if (len <= 0 || e > end) break;
    const field = ID3_FIELDS[id];
    if (field && !out[field]) out[field] = id3Text(b, s, e);
    // TXXX / TXX: a user-defined text frame, "description\0value". ffmpeg and several taggers
    // write the ISRC as TXXX:ISRC rather than TSRC (measured on an ffmpeg-tagged MP3).
    if ((id === 'TXXX' || id === 'TXX') && e > s + 1) {
      const both = id3TextRaw(b, s, e);
      const cut = both.indexOf('\u0000');
      if (cut > 0) {
        const desc = both.slice(0, cut).trim().toUpperCase();
        const f = TXXX_FIELDS[desc];
        if (f && !out[f]) out[f] = tidy(both.slice(cut + 1).split('\u0000')[0]);
      }
    }
    o = e;
  }
  return out;
}

export function readId3v1(b) {
  if (b.length < 128) return null;
  const o = b.length - 128;
  if (b[o] !== 0x54 || b[o + 1] !== 0x41 || b[o + 2] !== 0x47) return null;
  return { ...EMPTY, title: tidy(latin1(b, o + 3, o + 33)), artist: tidy(latin1(b, o + 33, o + 63)), album: tidy(latin1(b, o + 63, o + 93)) };
}

// ── MP4 / M4A ──────────────────────────────────────────────────────────────────────────────
function* atoms(b, s, e) {
  let o = s;
  while (o + 8 <= e) {
    let size = be32(b, o);
    const type = latin1(b, o + 4, o + 8);
    let head = 8;
    if (size === 1) { if (o + 16 > e) return; size = be32(b, o + 12) + be32(b, o + 8) * 2 ** 32; head = 16; }
    else if (size === 0) size = e - o;
    if (size < head || o + size > e) return;
    yield { type, s: o + head, e: o + size };
    o += size;
  }
}
const child = (b, parent, type) => { for (const a of atoms(b, parent.s, parent.e)) if (a.type === type) return a; return null; };

const ILST_FIELDS = { '©nam': 'title', '©ART': 'artist', '©alb': 'album', '©pub': 'label' };

export function readMp4(b) {
  if (b.length < 12 || latin1(b, 4, 8) !== 'ftyp') return null;
  const root = { s: 0, e: b.length };
  const moov = child(b, root, 'moov');
  const udta = moov && child(b, moov, 'udta');
  const meta = udta && child(b, udta, 'meta');
  if (!meta) return null;
  // `meta` is a full atom: 4 bytes of version and flags before its children.
  const ilst = child(b, { s: meta.s + 4, e: meta.e }, 'ilst');
  if (!ilst) return null;
  const out = { ...EMPTY };
  for (const item of atoms(b, ilst.s, ilst.e)) {
    let field = ILST_FIELDS[item.type];
    if (item.type === '----') {
      const name = child(b, item, 'name');
      const n = name ? latin1(b, name.s + 4, name.e).trim().toUpperCase() : '';
      field = n === 'ISRC' ? 'isrc' : n === 'LABEL' || n === 'PUBLISHER' ? 'label' : null;
    }
    if (!field || out[field]) continue;
    const data = child(b, item, 'data');
    if (data && data.e - data.s > 8) out[field] = tidy(utf8(b, data.s + 8, data.e));
  }
  return out;
}

// ── FLAC ───────────────────────────────────────────────────────────────────────────────────
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const VORBIS_FIELDS = { TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', LABEL: 'label', ORGANIZATION: 'label', PUBLISHER: 'label', ISRC: 'isrc' };

export function readFlac(b) {
  if (b.length < 8 || latin1(b, 0, 4) !== 'fLaC') return null;
  let o = 4;
  while (o + 4 <= b.length) {
    const last = b[o] & 0x80, type = b[o] & 0x7f;
    const len = (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
    const s = o + 4, e = s + len;
    if (e > b.length) return null;
    if (type === 4) {
      const out = { ...EMPTY };
      let p = s + 4 + le32(b, s); // skip the vendor string
      const count = le32(b, p); p += 4;
      for (let i = 0; i < count && p + 4 <= e; i++) {
        const n = le32(b, p); p += 4;
        const kv = utf8(b, p, Math.min(e, p + n)); p += n;
        const eq = kv.indexOf('=');
        const field = eq > 0 ? VORBIS_FIELDS[kv.slice(0, eq).toUpperCase()] : null;
        if (field && !out[field]) out[field] = tidy(kv.slice(eq + 1));
      }
      return out;
    }
    if (last) return null;
    o = e;
  }
  return null;
}

// ── The file name ──────────────────────────────────────────────────────────────────────────
/** "01 - Artist - Title (Extended Mix).mp3" → { artist, title }; a name with no " - " is the title. */
export function tagsFromName(fileName) {
  const base = String(fileName || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ');
  const noTrack = base.replace(/^\s*\d{1,3}\s*[-.)]\s*/, '');
  const parts = noTrack.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { ...EMPTY, artist: tidy(parts[0]), title: tidy(parts.slice(1).join(' - ')) };
  return { ...EMPTY, title: tidy(noTrack) };
}

/** Everything the file says about itself, the first source that names a field winning. */
export function readTags(bytes, fileName) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const sources = [];
  for (const [name, read] of [['id3', readId3v2], ['mp4', readMp4], ['flac', readFlac], ['id3v1', readId3v1]]) {
    let got = null;
    try { got = read(b); } catch { got = null; }
    if (got) sources.push([name, got]);
  }
  sources.push(['file-name', tagsFromName(fileName)]);
  const out = { ...EMPTY, source: null };
  for (const [name, got] of sources) {
    for (const k of Object.keys(EMPTY)) if (!out[k] && got[k]) { out[k] = got[k]; if (k === 'title' && !out.source) out.source = name; }
  }
  return out;
}
