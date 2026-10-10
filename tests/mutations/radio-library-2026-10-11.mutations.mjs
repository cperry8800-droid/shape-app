// Mutation spec for Nora's library (the songs her DJ sets are built from): what an upload may be,
// what of the browser's analysis the server keeps, the three-step upload, the tag readers, the
// key and tempo measurements, and the privacy of the table and bucket. Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/radio-library-2026-10-11.mutations.mjs --fail-on-skipped
const LIB = 'src/lib/radio/library.mjs';
const STORE = 'src/lib/radio/libraryStore.mjs';
const UP = 'src/lib/radio/libraryUpload.mjs';
const TAGS = 'src/lib/radio/audioTags.mjs';
const KEY = 'src/lib/radio/keyDetect.mjs';
const PROF = 'src/lib/radio/trackProfile.mjs';
const SQL = 'supabase-migrations/2026-10-11-radio-library.sql';
const R1 = 'src/app/api/admin/radio/tracks/route.ts';
const R2 = 'src/app/api/admin/radio/tracks/[id]/route.ts';
const PAGE = 'src/app/dashboard/radio/page.tsx';

export default {
  test: 'node --test tests/radio-library.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── what an upload may be ──
    { name: 'octet-stream is trusted over the extension', file: LIB,
      find: "  if (EXT_BY_TYPE[t]) return EXT_BY_TYPE[t];\n", replace: "  if (EXT_BY_TYPE[t] || t === 'application/octet-stream') return EXT_BY_TYPE[t] || 'mp3';\n" },
    { name: 'a file over 60 MB is taken', file: LIB,
      find: "  if (size > MAX_TRACK_BYTES) return { ok: false, error: 'too_large' };\n", replace: '' },
    { name: 'a song under 30 seconds is taken', file: LIB,
      find: "durationSec < MIN_TRACK_SEC) return { ok: false, error: 'too_short' };", replace: "durationSec < 0) return { ok: false, error: 'too_short' };" },
    { name: 'a song with no artist is taken', file: LIB,
      find: "  if (!artist) return { ok: false, error: 'artist' };\n  return {", replace: '  return {' },
    { name: 'any text is kept as an ISRC', file: LIB,
      find: '  return ISRC_RE.test(s) ? s : null;', replace: '  return s || null;' },
    { name: 'an edit can empty the artist', file: LIB,
      find: "    if (k in i) { const v = cleanText(i[k]); if (!v) return { ok: false, error: k }; out[k] = v; }", replace: '    if (k in i) { out[k] = cleanText(i[k]); }' },
    { name: 'an edit can set any column', file: LIB,
      find: "  return Object.keys(out).length ? { ok: true, value: out } : { ok: false, error: 'nothing_to_change' };", replace: "  return { ok: true, value: { ...i, ...out } };" },
    // ── the analysis the server keeps ──
    { name: 'a duration that disagrees with the file is kept', file: LIB,
      find: ' || Math.abs(a.durationSec - dur) > 1) return null;', replace: ') return null;' },
    { name: 'a broken grid keeps its tempo', file: LIB,
      find: "    if (energy.length !== L || !energy.every((v) => inRange(v, 0, 1))) return null;", replace: '' },
    { name: 'a mix point past the song is kept', file: LIB,
      find: "for (const k of ['firstKickBar', 'outroBar', 'mixOutBar', 'mixInFromBar']) if (!intIn(a[k], 0, L)) return null;", replace: '' },
    { name: "the key's name is taken from the payload", file: LIB,
      find: '    out.key = keyName(a.camelot);', replace: '    out.key = a.key || keyName(a.camelot);' },
    { name: 'an out-of-range overview is kept', file: LIB,
      find: ' && a.overview.every((v) => inRange(v, 0, 1))) {', replace: ') {' },
    { name: 'the totals count songs out of rotation', file: LIB,
      find: "r.status === 'ready' && r.enabled !== false", replace: "r.status === 'ready'" },
    // ── the store ──
    { name: 'the same ready file is added twice', file: STORE,
      find: "  if (existing && existing.status === 'ready') return { status: 409, body: { error: 'duplicate', id: existing.id } };\n", replace: '' },
    { name: 'a retry makes a second row', file: STORE,
      find: '  if (existing) {\n    // A pending row', replace: '  if (false) {\n    // A pending row' },
    { name: 'a song is ready without its file', file: STORE,
      find: "  if (!stored.present) return { status: 409, body: { error: 'file_missing' } };\n", replace: '' },
    { name: 'a file of the wrong size is accepted', file: STORE,
      find: "  if (stored.size != null && stored.size !== Number(row.size_bytes)) return { status: 409, body: { error: 'file_size_mismatch' } };\n", replace: '' },
    { name: 'an analysis that fails the check is stored', file: STORE,
      find: "  if (!clean) return { status: 400, body: { error: 'analysis' } };\n", replace: '' },
    { name: 'the row goes before the file', file: STORE,
      find: "  if (rmErr) return { status: 502, body: { error: 'storage_remove_failed' } };\n", replace: '' },
    // ── the page's order of work ──
    { name: 'a row is created before the song is measured', file: UP,
      find: "  if (!(duration >= MIN_TRACK_SEC)) return { ok: false, error: 'too_short' };", replace: "  if (!(duration >= MIN_TRACK_SEC)) { await deps.create({}); return { ok: false, error: 'too_short' }; }" },
    { name: 'a skipped song is uploaded anyway', file: UP,
      find: "    if (!got) return { ok: false, error: 'cancelled' };\n    title = got.title; artist = got.artist;", replace: "    if (got) { title = got.title; artist = got.artist; }" },
    { name: 'a dead upload is confirmed', file: UP,
      find: "  if (!sent) return { ok: false, error: 'upload_failed', id };\n", replace: '' },
    { name: 'the decoder is handed the buffer itself', file: UP,
      find: 'decoded = await deps.decode(buf.slice(0));', replace: 'decoded = await deps.decode(buf);' },
    // ── tags ──
    { name: 'ID3v2.4 sizes read as plain integers', file: TAGS,
      find: 'major === 4 ? synchsafe(b, o + 4) : be32(b, o + 4)', replace: 'be32(b, o + 4)' },
    { name: 'UTF-16 tags read as Latin-1', file: TAGS,
      find: "    if (b[body] === 0xff && b[body + 1] === 0xfe) return tidy(utf16(b, body + 2, e, false).split('\\u0000')[0]);", replace: "    if (b[body] === 0xff && b[body + 1] === 0xfe) return tidy(latin1(b, body + 2, e));" },
    { name: 'TXXX:ISRC is ignored', file: TAGS,
      find: "const TXXX_FIELDS = { ISRC: 'isrc', LABEL: 'label', PUBLISHER: 'label' };", replace: "const TXXX_FIELDS = { LABEL: 'label', PUBLISHER: 'label' };" },
    { name: "MP4 meta's version bytes are not skipped", file: TAGS,
      find: "  const ilst = child(b, { s: meta.s + 4, e: meta.e }, 'ilst');", replace: "  const ilst = child(b, meta, 'ilst');" },
    { name: 'a malformed tag throws', file: TAGS,
      find: '    try { got = read(b); } catch { got = null; }', replace: '    got = read(b);' },
    { name: 'the track number stays in a file-name title', file: TAGS,
      find: "  const noTrack = base.replace(/^\\s*\\d{1,3}\\s*[-.)]\\s*/, '');", replace: '  const noTrack = base;' },
    // ── key and tempo ──
    { name: 'a key is guessed for noise', file: KEY,
      find: "  if (best.r < 0.4 || confidence < 0.1) return", replace: "  if (false) return" },
    { name: 'the minor profile is the major one', file: KEY,
      find: '      const prof = minor ? MINOR : MAJOR;', replace: '      const prof = MAJOR;' },
    { name: 'pitch classes are off by a semitone', file: KEY,
      find: '((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12', replace: '((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 10) % 12' },
    { name: '⚠ the half-tempo range comes back', file: PROF,
      find: 'const TEMPO_RANGES = [[100, 140], [140, 180]];', replace: 'const TEMPO_RANGES = [[100, 140], [70, 100], [140, 180]];' },
    { name: 'the mix point is not kept inside the body', file: PROF,
      find: "  const mixOutBar = hasGrid ? clamp(grid.mixOutBar, grid.firstKickBar, Math.max(grid.firstKickBar, grid.outroBar)) : null;", replace: '  const mixOutBar = hasGrid ? grid.lengthBars + 3 : null;' },
    { name: 'the fade is the last sound', file: PROF,
      find: '  while (fade > first && db(median1s(fade)) < db(bodyRms) + FADE_DB) fade -= 1;\n', replace: '' },
    // ── privacy ──
    { name: 'the bucket is public', file: SQL,
      find: "  'radio-library', 'radio-library', false, 62914560,", replace: "  'radio-library', 'radio-library', true, 62914560," },
    { name: 'the table is readable by members', file: SQL,
      find: 'revoke all on table public.radio_tracks from public, anon, authenticated;', replace: 'revoke all on table public.radio_tracks from public, anon;' },
    { name: 'the list route skips the admin check', file: R1,
      find: "export async function GET() {\n  try {\n    await requireAdminUser();", replace: "export async function GET() {\n  try {\n    void requireAdminUser;" },
    { name: 'the edit route skips the admin check', file: R2,
      find: "export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {\n  try {\n    await requireAdminUser();", replace: "export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {\n  try {\n    void requireAdminUser;" },
    { name: 'the page reads the library before the admin check', file: PAGE,
      find: "  try {\n    await requireAdminUser();\n  } catch {\n    redirect('/dashboard');\n  }\n\n  const r = await listTracks(createAdminClient());", replace: "  const r = await listTracks(createAdminClient());\n  try {\n    await requireAdminUser();\n  } catch {\n    redirect('/dashboard');\n  }\n" },
  ],
};
