// Voice notes in chat threads (owner, 2026-11-02: "build voice notes next"). The pure parts: which
// recording type a device can make, where a note is stored, the waveform a note carries, how a note's
// metadata is read back (strictly: it is another member's input), and the words a note leaves behind
// for previews and pushes. The recorder and player are BSVoiceNote.jsx; the upload and the playable
// link are shapeBackend.js (window.ShapeVoiceNotes); the bucket and its rules are
// supabase-migrations/2026-11-03-voice-notes.sql.

export const BS_VOICE = Object.freeze({
  BUCKET: 'voice-notes',
  MAX_SEC: 120,          // a note stops itself, and sends, at two minutes
  MIN_SEC: 1,            // shorter than this is a slip of the finger, never sent
  PEAKS: 32,             // the bars a note's waveform is drawn with
  PEAKS_MAX: 64,         // the most a stored note may carry
  MAX_BYTES: 5 * 1024 * 1024,
  SIGNED_SEC: 3600,      // a playable link lasts an hour
});

// The recording types, best first. MP4/AAC plays everywhere (iOS included), so a device that can make
// it does; WebM and Ogg Opus are the fallbacks. The extension and the stored type go with each.
export const BS_VOICE_TYPES = Object.freeze([
  Object.freeze({ type: 'audio/mp4', mime: 'audio/mp4', ext: 'm4a' }),
  Object.freeze({ type: 'audio/webm;codecs=opus', mime: 'audio/webm', ext: 'webm' }),
  Object.freeze({ type: 'audio/webm', mime: 'audio/webm', ext: 'webm' }),
  Object.freeze({ type: 'audio/ogg;codecs=opus', mime: 'audio/ogg', ext: 'ogg' }),
]);
const MIMES = new Set(BS_VOICE_TYPES.map((x) => x.mime));

export function bsVoicePickType(isSupported) {
  if (typeof isSupported !== 'function') return null;
  for (const t of BS_VOICE_TYPES) {
    try { if (isSupported(t.type)) return t; } catch (e) { /* this one is not supported */ }
  }
  return null;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// <kind>/<thread>/<sender>/<file>: the shape the bucket's rules accept (2026-11-03-voice-notes.sql).
export const BS_VOICE_PATH = new RegExp(`^(dm|ch)/(${UUID})/(${UUID})/[A-Za-z0-9_-]{1,64}\\.(m4a|webm|ogg)$`);

// Where a note is stored: under its thread, then its sender, so the bucket's rules can say who may
// write it (the sender, while they may post in the thread) and who may play it (whoever may read it).
export function bsVoicePath({ kind, threadId, userId, name, ext } = {}) {
  const k = kind === 'ch' ? 'ch' : kind === 'dm' ? 'dm' : null;
  const path = k && `${k}/${String(threadId || '').toLowerCase()}/${String(userId || '').toLowerCase()}/${name}.${ext}`;
  return path && BS_VOICE_PATH.test(path) ? path : null;
}

// A recording's levels (0..1, sampled as it was made) as PEAKS bars: the loudest moment of each slice,
// scaled to the note's own loudest moment (a quiet microphone and a loud one draw the same shape), to
// two places. Silence draws as silence; a note too short to fill the bars repeats its levels.
export function bsVoicePeaks(levels, n = BS_VOICE.PEAKS) {
  const src = (Array.isArray(levels) ? levels : []).map((v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0));
  if (!src.length) return Array(n).fill(0);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = Math.floor((i * src.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * src.length) / n));
    let peak = 0;
    for (let j = a; j < b && j < src.length; j += 1) peak = Math.max(peak, src[j]);
    out.push(peak);
  }
  const top = Math.max(...out);
  return out.map((v) => Math.round((top >= 0.01 ? v / top : 0) * 100) / 100);
}

// A note's metadata, read back strictly (it is another member's input). Its file must sit under the
// thread it was sent in, its length must be one a note can have, its waveform at most PEAKS_MAX bars
// of 0..1, its type one the app records. Anything else reads as no note at all.
export function bsVoiceFromMetadata(md, { kind = null, threadId = null } = {}) {
  const v = md && typeof md === 'object' && !Array.isArray(md) ? md.voice : null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const path = typeof v.path === 'string' ? v.path : '';
  const m = BS_VOICE_PATH.exec(path);
  if (!m) return null;
  if (kind && m[1] !== kind) return null;
  if (threadId && m[2] !== String(threadId).toLowerCase()) return null;
  const duration = Number(v.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > BS_VOICE.MAX_SEC + 5) return null;
  const mime = typeof v.mime === 'string' && MIMES.has(v.mime) ? v.mime : null;
  if (!mime) return null;
  const peaks = Array.isArray(v.peaks)
    ? v.peaks.slice(0, BS_VOICE.PEAKS_MAX).map((x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, Math.round(x * 100) / 100)) : 0))
    : [];
  return { path, duration: Math.round(duration * 10) / 10, mime, peaks, sender: m[3] };
}

// 0:07, 1:42.
export function bsVoiceClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The words a note leaves where only words go (a thread's preview line, a push).
export function bsVoiceBody(duration) {
  return `Voice note · ${bsVoiceClock(duration)}`;
}
