// Nora's library (supabase-migrations/2026-10-11-radio-library.sql, /dashboard/radio): the songs
// her DJ sets are built from. The owner uploads a playlist of real artists' songs; each is
// measured in the browser (src/lib/radio/trackProfile.mjs), uploaded straight to the private
// bucket, and confirmed on the server. Listeners never get a file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIBRARY_BUCKET, MAX_TRACK_BYTES, TYPE_BY_EXT, camelotOf, checkEdit, checkUpload, cleanAnalysis, cleanIsrc,
  keyName, libraryTotals, trackExt, trackPath,
} from '../src/lib/radio/library.mjs';
import { detectKey } from '../src/lib/radio/keyDetect.mjs';
import { readTags, tagsFromName } from '../src/lib/radio/audioTags.mjs';
import { profileTrack } from '../src/lib/radio/trackProfile.mjs';
import { confirmTrack, createTrack, deleteTrack, editTrack, listTracks } from '../src/lib/radio/libraryStore.mjs';
import { uploadSong } from '../src/lib/radio/libraryUpload.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SHA = 'a'.repeat(64);
const ID = '0b0e7a2c-5d1f-4e8a-9c3b-1a2b3c4d5e6f';
const SR = 44100;

// ── Synthetic audio ────────────────────────────────────────────────────────────────────────
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Chords with a few harmonics, each `sec` long, as one mono channel. */
function chords(list, sec = 1.5) {
  const per = Math.round(sec * SR);
  const x = new Float32Array(list.length * per);
  list.forEach((notes, c) => {
    for (let i = 0; i < per; i++) {
      const t = i / SR;
      let s = 0;
      for (const m of notes) for (let h = 1; h <= 3; h++) s += Math.sin(2 * Math.PI * midiHz(m) * h * t) / (h * h);
      x[c * per + i] = 0.08 * s;
    }
  });
  return [x];
}

/** A four-on-the-floor song: kick from 8 s, A-minor-ish chords, a 10 s fade at the end. */
function houseSong(bpm = 124, dur = 90) {
  const n = SR * dur, x = new Float32Array(n), beat = 60 / bpm;
  const prog = [[57, 60, 64], [53, 57, 60], [52, 56, 59], [57, 60, 64]];
  for (let i = 0; i < n; i++) {
    const t = i / SR, b = Math.floor(t / beat), tb = t - b * beat;
    let s = 0;
    if (t > 8 && t < dur - 12) s += 0.8 * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-tb * 30)) * tb) * Math.exp(-tb * 8);
    for (const m of prog[Math.floor(b / 4) % 4]) s += 0.08 * Math.sin(2 * Math.PI * midiHz(m) * t);
    x[i] = s * 0.6 * (t > dur - 10 ? (dur - t) / 10 : 1);
  }
  return [x];
}

// ── library.mjs ────────────────────────────────────────────────────────────────────────────
test('an upload is audio the bucket takes, decided by its type or else its extension', () => {
  const base = { fileName: 'Song.mp3', type: 'audio/mpeg', size: 5e6, sha256: SHA, durationSec: 215.4, title: ' Song ', artist: 'Artist' };
  const ok = checkUpload(base);
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.value.ext, ok.value.mime, ok.value.title, ok.value.isrc], ['mp3', 'audio/mpeg', 'Song', null]);
  // ⚠ A file with no type arrives as octet-stream or '', so the extension decides.
  assert.equal(checkUpload({ ...base, fileName: 'x.FLAC', type: 'application/octet-stream' }).value.mime, 'audio/flac');
  assert.equal(checkUpload({ ...base, fileName: 'x.m4a', type: '' }).value.mime, 'audio/mp4');
  assert.equal(checkUpload({ ...base, fileName: 'x.m4a', type: 'audio/x-m4a' }).value.ext, 'm4a');
  assert.deepEqual(checkUpload({ ...base, fileName: 'cover.jpg', type: 'image/jpeg' }), { ok: false, error: 'not_audio' });
  assert.deepEqual(checkUpload({ ...base, size: MAX_TRACK_BYTES + 1 }), { ok: false, error: 'too_large' });
  assert.equal(checkUpload({ ...base, size: MAX_TRACK_BYTES }).ok, true);
  assert.deepEqual(checkUpload({ ...base, durationSec: 29.9 }), { ok: false, error: 'too_short' });
  assert.deepEqual(checkUpload({ ...base, durationSec: 1800.1 }), { ok: false, error: 'too_long' });
  assert.deepEqual(checkUpload({ ...base, sha256: 'xyz' }), { ok: false, error: 'sha256' });
  assert.deepEqual(checkUpload({ ...base, artist: '  \n ' }), { ok: false, error: 'artist' });
  assert.deepEqual(checkUpload({ ...base, title: '' }), { ok: false, error: 'title' });
  assert.equal(checkUpload({ ...base, isrc: 'us-rc1-76-07839' }).value.isrc, 'USRC17607839');
  // Every stored type is one the bucket allows.
  const sql = read('supabase-migrations/2026-10-11-radio-library.sql');
  for (const mime of Object.values(TYPE_BY_EXT)) assert.ok(sql.includes(`'${mime}'`), `${mime} is allowed by the bucket`);
  assert.equal(trackExt('a.wav', 'audio/x-wav'), 'wav');
  assert.equal(trackPath(ID, 'mp3'), `tracks/${ID}.mp3`);
  assert.throws(() => trackPath('../x', 'mp3'));
});

test('an ISRC is kept only in the registry form, and an edit cannot empty a required field', () => {
  assert.equal(cleanIsrc('GB-AYE-08-00073'), 'GBAYE0800073');
  assert.equal(cleanIsrc('not an isrc'), null);
  assert.equal(cleanIsrc(42), null);
  assert.deepEqual(checkEdit({ title: '  New  ' }), { ok: true, value: { title: 'New' } });
  assert.deepEqual(checkEdit({ artist: '' }), { ok: false, error: 'artist' });
  assert.deepEqual(checkEdit({ isrc: 'nope' }), { ok: false, error: 'isrc' });
  assert.deepEqual(checkEdit({ isrc: '' }), { ok: true, value: { isrc: null } });
  assert.deepEqual(checkEdit({ album: '' }), { ok: true, value: { album: null } });
  assert.deepEqual(checkEdit({ enabled: 'yes' }), { ok: false, error: 'enabled' });
  assert.deepEqual(checkEdit({ enabled: false }), { ok: true, value: { enabled: false } });
  assert.deepEqual(checkEdit({ storage_path: 'x', status: 'ready' }), { ok: false, error: 'nothing_to_change' }, 'only the editable fields');
});

test('Camelot codes: all 24 keys, the wheel the DJs use', () => {
  // Spot checks against the published wheel.
  const wheel = { '8A': 'A minor', '8B': 'C major', '1A': 'A♭ minor', '1B': 'B major', '5A': 'C minor', '12B': 'E major', '2B': 'F♯ major', '7B': 'F major' };
  for (const [code, name] of Object.entries(wheel)) assert.equal(keyName(code), name, code);
  const seen = new Set();
  for (let pc = 0; pc < 12; pc++) for (const minor of [false, true]) {
    const code = camelotOf(pc, minor);
    assert.match(code, /^(1[0-2]|[1-9])[AB]$/);
    seen.add(code);
  }
  assert.equal(seen.size, 24);
  // A fifth up is one step round the wheel.
  assert.equal(camelotOf(7, false), '9B');
  assert.equal(keyName('13A'), null);
});

test('the server keeps the analysis only when it holds together, and the grid is all or nothing', () => {
  const good = profileTrack(houseSong(124, 60), SR);
  const clean = cleanAnalysis(good, 60);
  assert.ok(clean);
  assert.equal(clean.bpm, good.bpm);
  assert.equal(clean.key, keyName(good.camelot), 'the key name is derived on the server');
  assert.equal(cleanAnalysis({ ...good, key: 'Totally C' }, 60).key, keyName(good.camelot));
  assert.equal(cleanAnalysis(good, 70), null, 'a duration that disagrees with the file');
  assert.equal(cleanAnalysis({ ...good, version: 2 }, 60), null);
  assert.equal(cleanAnalysis({ ...good, loudnessDb: 3 }, 60), null);
  assert.equal(cleanAnalysis({ ...good, fadeOutSec: 61 }, 60), null);
  // A broken grid loses the whole grid, not the song.
  const broken = cleanAnalysis({ ...good, energyByBar: good.energyByBar.slice(1) }, 60);
  assert.equal(broken.bpm, null);
  assert.equal(broken.lengthBars, null);
  assert.deepEqual(broken.breakdowns, []);
  assert.equal(broken.reason, 'grid-rejected');
  assert.equal(cleanAnalysis({ ...good, mixOutBar: good.lengthBars + 1 }, 60).bpm, null);
  assert.equal(cleanAnalysis({ ...good, bpm: 300 }, 60).bpm, null);
  assert.equal(cleanAnalysis({ ...good, camelot: 'H#' }, 60).camelot, null);
  assert.deepEqual(cleanAnalysis({ ...good, overview: [2] }, 60).overview, []);
});

test('the totals count only ready songs in rotation', () => {
  const t = libraryTotals([
    { status: 'ready', enabled: true, duration_sec: 1800, artist: 'A' },
    { status: 'ready', enabled: true, duration_sec: 1800, artist: 'a' },
    { status: 'ready', enabled: false, duration_sec: 600, artist: 'B' },
    { status: 'pending', enabled: true, duration_sec: 600, artist: 'C' },
  ]);
  assert.deepEqual(t, { songs: 4, playable: 2, pending: 1, playableHours: 1, distinctArtists: 1 });
});

// ── keyDetect.mjs ──────────────────────────────────────────────────────────────────────────
test('the key of a chord progression, and none for noise', () => {
  const Am = [45, 57, 60, 64], Dm = [50, 57, 62, 65], E = [52, 59, 64, 68];
  assert.equal(detectKey(chords([Am, Dm, E, Am, Am, Dm, E, Am, Am, Dm, E, Am]), SR).camelot, '8A');
  const C = [48, 60, 64, 67], F = [53, 60, 65, 69], G = [55, 59, 62, 67];
  assert.equal(detectKey(chords([C, F, G, C, C, F, G, C, C, F, G, C]), SR).camelot, '8B');
  const Fs = [54, 61, 66, 70], B = [47, 59, 63, 66], Cs = [49, 61, 65, 68];
  const fs = detectKey(chords([Fs, B, Cs, Fs, Fs, B, Cs, Fs, Fs, B, Cs, Fs]), SR);
  assert.deepEqual([fs.camelot, fs.reason], ['2B', null]);
  assert.ok(fs.confidence > 0.5);
  let s = 7;
  const noise = new Float32Array(SR * 12);
  for (let i = 0; i < noise.length; i++) { s = (s * 16807) % 2147483647; noise[i] = (s / 2147483647 - 0.5) * 0.3; }
  assert.equal(detectKey([noise], SR).camelot, null, 'noise has no key, and none is guessed');
  assert.equal(detectKey([new Float32Array(SR * 2)], SR).reason, 'too-little-music');
  assert.throws(() => detectKey([[0, 1]], SR));
});

// ── trackProfile.mjs ───────────────────────────────────────────────────────────────────────
test('a four-on-the-floor song gets a grid, a key, its fade and its loudness', () => {
  const p = profileTrack(houseSong(124, 90), SR);
  assert.equal(p.bpm, 124);
  assert.ok(p.firstKickBar >= 3 && p.firstKickBar <= 5, `the kick enters at ~8 s (bar ${p.firstKickBar})`);
  assert.ok(p.mixOutBar >= p.firstKickBar && p.mixOutBar <= p.outroBar);
  assert.ok(p.fadeOutSec > 76 && p.fadeOutSec < 86, `the fade starts in the last 10 s (${p.fadeOutSec})`);
  assert.ok(p.soundStartSec < 0.1 && p.soundEndSec > 88);
  assert.ok(p.loudnessDb < -6 && p.loudnessDb > -40);
  assert.ok(p.camelot === '8A' || p.camelot === '8B', `A minor or its relative (${p.camelot})`);
  assert.ok(p.intensity > 0 && p.intensity < 1);
  assert.equal(p.overview.length, 200);
  assert.ok(cleanAnalysis(p, 90), 'what the browser measures is what the server keeps');
});

test('⚠ a kick on beats 1 and 3 only gets NO tempo, never half the real one', () => {
  // Boom-bap at 150: a kick every 0.8 s is 75 BPM, which a 70–100 search reads with full confidence.
  const n = SR * 40, x = new Float32Array(n), beat = 60 / 150;
  let seed = 3;
  for (let i = 0; i < n; i++) {
    const t = i / SR, b = Math.floor(t / beat), tb = t - b * beat;
    let s = 0.05 * Math.sin(2 * Math.PI * 110 * t);
    if (b % 2 === 0) s += 0.8 * Math.sin(2 * Math.PI * (50 + 70 * Math.exp(-tb * 30)) * tb) * Math.exp(-tb * 7);
    else { seed = (seed * 16807) % 2147483647; s += 0.3 * ((seed / 2147483647) - 0.5) * Math.exp(-tb * 18); }
    x[i] = s * 0.6;
  }
  const p = profileTrack([x], SR);
  assert.equal(p.bpm, null);
  assert.equal(p.lengthBars, null);
  assert.ok(p.reason);
  assert.ok(cleanAnalysis(p, 40), 'a song with no grid is still a song');
  assert.throws(() => profileTrack([new Float32Array(SR * 40)], SR), /silent/);
});

// ── audioTags.mjs ──────────────────────────────────────────────────────────────────────────
const enc = (s) => Array.from(Buffer.from(s, 'latin1'));
const be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ss = (n) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];

function id3(major, frames) {
  const body = frames.flatMap(([id, bytes]) => [...enc(id), ...(major === 4 ? ss(bytes.length) : be(bytes.length)), 0, 0, ...bytes]);
  return new Uint8Array([...enc('ID3'), major, 0, 0, ...ss(body.length + 16), ...body, ...new Array(16).fill(0)]);
}
const utf16bom = (s) => [1, 0xff, 0xfe, ...Array.from(Buffer.from(s, 'utf16le'))];
const utf8f = (s) => [3, ...Array.from(Buffer.from(s, 'utf8'))];
const latin = (s) => [0, ...enc(s)];

function atom(type, payload) { return [...be(8 + payload.length), ...enc(type), ...payload]; }
function mp4(items) {
  const ilst = atom('ilst', items.flatMap(([type, value, name]) => atom(type, [
    ...(name ? atom('mean', [0, 0, 0, 0, ...enc('com.apple.iTunes')]).concat(atom('name', [0, 0, 0, 0, ...enc(name)])) : []),
    ...atom('data', [0, 0, 0, 1, 0, 0, 0, 0, ...Array.from(Buffer.from(value, 'utf8'))]),
  ])));
  const meta = atom('meta', [0, 0, 0, 0, ...ilst]);
  return new Uint8Array([...atom('ftyp', enc('M4A 0000')), ...atom('moov', atom('udta', meta)), ...atom('mdat', [1, 2, 3])]);
}

test('tags: ID3v2.3 (UTF-16), ID3v2.4 (UTF-8), iTunes atoms, FLAC comments, ID3v1', () => {
  const v23 = readTags(id3(3, [['TIT2', utf16bom('Señorita')], ['TPE1', latin('Café Tacvba')], ['TALB', latin('Re')], ['TSRC', latin('MXF019400123')], ['TPUB', latin('WEA')]]), 'x.mp3');
  assert.deepEqual(v23, { title: 'Señorita', artist: 'Café Tacvba', album: 'Re', label: 'WEA', isrc: 'MXF019400123', source: 'id3' });
  // ⚠ ffmpeg (and several taggers) write the ISRC as TXXX:ISRC, not TSRC: measured on an ffmpeg-tagged MP3.
  const txxx = readTags(id3(3, [['TIT2', latin('T')], ['TPE1', latin('A')], ['TXXX', [0, ...enc('ISRC'), 0, ...enc('USRC17607839'), 0]], ['TXXX', utf16bom('LABEL\u0000Big Beat')]]), 'x.mp3');
  assert.deepEqual([txxx.isrc, txxx.label], ['USRC17607839', 'Big Beat']);
  assert.equal(readTags(id3(3, [['TIT2', latin('T')], ['TXXX', latin('MOOD\u0000calm')]]), 'x.mp3').isrc, null, 'other user frames are ignored');
  const v24 = readTags(id3(4, [['TIT2', utf8f('Ünïcode ✓')], ['TPE1', utf8f('Björk')]]), 'x.mp3');
  assert.deepEqual([v24.title, v24.artist], ['Ünïcode ✓', 'Björk']);
  const m = readTags(mp4([['©nam', 'Strobe'], ['©ART', 'deadmau5'], ['©alb', 'For Lack of a Better Name'], ['----', 'USUM70912345', 'ISRC']]), 'x.m4a');
  assert.deepEqual([m.title, m.artist, m.album, m.isrc, m.source], ['Strobe', 'deadmau5', 'For Lack of a Better Name', 'USUM70912345', 'mp4']);
  const comments = ['TITLE=Midnight City', 'ARTIST=M83', 'ISRC=FR1234567890'].map((c) => Buffer.from(c, 'utf8'));
  const vc = [...[3, 0, 0, 0], ...enc('abc'), comments.length, 0, 0, 0, ...comments.flatMap((c) => [c.length & 255, 0, 0, 0, ...c])];
  const flac = new Uint8Array([...enc('fLaC'), 0, 0, 0, 34, ...new Array(34).fill(0), 0x84, (vc.length >> 16) & 255, (vc.length >> 8) & 255, vc.length & 255, ...vc]);
  const f = readTags(flac, 'x.flac');
  assert.deepEqual([f.title, f.artist, f.isrc, f.source], ['Midnight City', 'M83', 'FR1234567890', 'flac']);
  const v1 = new Uint8Array(300);
  v1.set(enc('TAG'), 172); v1.set(enc('Old Title'), 175); v1.set(enc('Old Artist'), 205);
  assert.deepEqual([readTags(v1, 'x.mp3').title, readTags(v1, 'x.mp3').artist], ['Old Title', 'Old Artist']);
});

test('tags: a malformed file falls back to its name, never throws', () => {
  assert.deepEqual(tagsFromName('03 - Daft Punk - One More Time (Radio Edit).mp3'), { title: 'One More Time (Radio Edit)', artist: 'Daft Punk', album: null, label: null, isrc: null });
  assert.deepEqual([tagsFromName('Untitled_track.wav').title, tagsFromName('Untitled_track.wav').artist], ['Untitled track', null]);
  const junk = new Uint8Array([...enc('ID3'), 3, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f, ...enc('TIT2'), 255, 255, 255, 255]);
  const t = readTags(junk, 'Artist - Name.mp3');
  assert.deepEqual([t.title, t.artist, t.source], ['Name', 'Artist', 'file-name']);
  assert.equal(readTags(new Uint8Array([...enc('fLaC'), 0x84, 0, 0, 200]), 'a.flac').source, 'file-name');
  // The first source to name a field wins; later ones fill the gaps.
  const mixed = readTags(id3(3, [['TIT2', latin('Tagged')]]), 'Name Artist - File Title.mp3');
  assert.deepEqual([mixed.title, mixed.artist], ['Tagged', 'Name Artist']);
});

// ── libraryStore.mjs (the admin routes' work) ──────────────────────────────────────────────
function fakeDb({ rows = [], objects = {}, fail = [] } = {}) {
  const calls = [];
  const db = {
    _rows: rows, _objects: objects, _calls: calls,
    storage: {
      from(bucket) {
        assert.equal(bucket, LIBRARY_BUCKET);
        return {
          async createSignedUploadUrl(path, opts) {
            calls.push({ op: 'sign', path, opts });
            if (fail.includes('sign')) return { data: null, error: { message: 'no' } };
            return { data: { path, token: 'tok', signedUrl: `https://x/upload/${path}?token=tok` }, error: null };
          },
          async list(dir, opts) {
            calls.push({ op: 'list', dir, opts });
            if (fail.includes('list')) return { data: null, error: { message: 'no' } };
            return { data: Object.entries(objects).filter(([p]) => p.startsWith(`${dir}/`) && p.includes(opts.search)).map(([p, size]) => ({ name: p.slice(dir.length + 1), metadata: { size } })), error: null };
          },
          async remove(paths) {
            calls.push({ op: 'remove', paths });
            if (fail.includes('remove')) return { data: null, error: { message: 'no' } };
            for (const p of paths) delete objects[p];
            return { data: [], error: null };
          },
        };
      },
    },
    from(table) {
      assert.equal(table, 'radio_tracks');
      const st = { op: 'select', filters: [], payload: null, single: false, cols: null };
      const run = () => {
        calls.push({ op: st.op, payload: st.payload });
        if (fail.includes('missing')) return { data: null, error: { code: '42P01' } };
        if (fail.includes(st.op)) return { data: null, error: { message: 'fail' } };
        if (st.op === 'insert') {
          if (rows.some((r) => r.sha256 === st.payload.sha256)) return { data: null, error: { code: '23505' } };
          rows.push({ ...st.payload, enabled: true, created_at: 'now' });
          return { data: null, error: null };
        }
        const hit = rows.filter((r) => st.filters.every((f) => f(r)));
        if (st.op === 'update') for (const r of hit) Object.assign(r, st.payload);
        if (st.op === 'delete') for (const r of hit) rows.splice(rows.indexOf(r), 1);
        const out = hit.map((r) => ({ ...r }));
        return { data: st.single ? out[0] || null : out, error: null };
      };
      const chain = {
        select(c) { st.cols = c; return chain; },
        insert(p) { st.op = 'insert'; st.payload = p; return chain; },
        update(p) { st.op = 'update'; st.payload = p; return chain; },
        delete() { st.op = 'delete'; return chain; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() { st.single = true; return chain; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return chain;
    },
  };
  return db;
}

const upload = { fileName: 'Song.mp3', type: 'audio/mpeg', size: 1000, sha256: SHA, durationSec: 200, title: 'Song', artist: 'Artist' };

test('create: a pending row and an upload URL for tracks/<id>.<ext>, and the same file is one song', async () => {
  const db = fakeDb();
  const r = await createTrack(db, upload, { userId: 'u1', newId: () => ID });
  assert.equal(r.status, 201);
  assert.deepEqual([r.body.id, r.body.path, r.body.token, r.body.contentType], [ID, `tracks/${ID}.mp3`, 'tok', 'audio/mpeg']);
  assert.deepEqual([db._rows[0].status, db._rows[0].uploaded_by, db._rows[0].storage_path], ['pending', 'u1', `tracks/${ID}.mp3`]);
  // An upload that died: the same file reuses the pending row and its path, with a fresh URL.
  const again = await createTrack(db, { ...upload, title: 'Song (fixed)' }, { userId: 'u1', newId: () => 'never-used' });
  assert.equal(again.status, 201);
  assert.equal(again.body.id, ID);
  assert.equal(db._rows.length, 1);
  assert.equal(db._rows[0].title, 'Song (fixed)');
  // A ready one is refused with its id.
  db._rows[0].status = 'ready';
  assert.deepEqual(await createTrack(db, upload, { userId: 'u1', newId: () => ID }), { status: 409, body: { error: 'duplicate', id: ID } });
  assert.deepEqual((await createTrack(fakeDb(), { ...upload, type: 'text/plain', fileName: 'a.txt' }, { newId: () => ID })).status, 400);
  assert.equal((await createTrack(fakeDb({ fail: ['missing'] }), upload, { newId: () => ID })).status, 503);
  const noUrl = await createTrack(fakeDb({ fail: ['sign'] }), upload, { newId: () => ID });
  assert.deepEqual([noUrl.status, noUrl.body.error, noUrl.body.id], [502, 'upload_url_failed', ID]);
});

test('confirm: the file must be in storage at its declared size, and the analysis must check out', async () => {
  const analysis = profileTrack(houseSong(124, 60), SR);
  const pending = () => ({ id: ID, storage_path: `tracks/${ID}.mp3`, sha256: SHA, size_bytes: 1000, duration_sec: 60, status: 'pending' });
  const missing = fakeDb({ rows: [pending()] });
  assert.deepEqual(await confirmTrack(missing, ID, { analysis }), { status: 409, body: { error: 'file_missing' } });
  assert.equal(missing._rows[0].status, 'pending', 'nothing is marked ready without its file');
  const wrong = fakeDb({ rows: [pending()], objects: { [`tracks/${ID}.mp3`]: 999 } });
  assert.deepEqual(await confirmTrack(wrong, ID, { analysis }), { status: 409, body: { error: 'file_size_mismatch' } });
  const bad = fakeDb({ rows: [pending()], objects: { [`tracks/${ID}.mp3`]: 1000 } });
  assert.deepEqual(await confirmTrack(bad, ID, { analysis: { ...analysis, version: 9 } }), { status: 400, body: { error: 'analysis' } });
  const ok = fakeDb({ rows: [pending()], objects: { [`tracks/${ID}.mp3`]: 1000 } });
  const r = await confirmTrack(ok, ID, { analysis });
  assert.equal(r.status, 200);
  assert.deepEqual([ok._rows[0].status, ok._rows[0].bpm, ok._rows[0].camelot], ['ready', analysis.bpm, analysis.camelot]);
  assert.equal(ok._rows[0].analysis.version, 1);
  assert.equal((await confirmTrack(ok, 'nope', { analysis })).status, 400);
  assert.equal((await confirmTrack(fakeDb(), ID, { analysis })).status, 404);
  assert.equal((await confirmTrack(fakeDb({ rows: [pending()], fail: ['list'] }), ID, { analysis })).status, 502);
});

test('edit and remove: the file goes first, and a file that will not go keeps its row', async () => {
  const row = () => ({ id: ID, storage_path: `tracks/${ID}.mp3`, title: 'A', artist: 'B', status: 'ready' });
  const db = fakeDb({ rows: [row()] });
  assert.equal((await editTrack(db, ID, { title: 'New', enabled: false })).status, 200);
  assert.deepEqual([db._rows[0].title, db._rows[0].enabled], ['New', false]);
  assert.equal((await editTrack(db, ID, { artist: '' })).status, 400);
  assert.equal((await editTrack(fakeDb(), ID, { title: 'x' })).status, 404);
  const stuck = fakeDb({ rows: [row()], objects: { [`tracks/${ID}.mp3`]: 1 }, fail: ['remove'] });
  assert.equal((await deleteTrack(stuck, ID)).status, 502);
  assert.equal(stuck._rows.length, 1, 'nothing in storage is ever left unlisted');
  const gone = fakeDb({ rows: [row()], objects: { [`tracks/${ID}.mp3`]: 1 } });
  assert.deepEqual(await deleteTrack(gone, ID), { status: 200, body: { deleted: ID } });
  assert.deepEqual([gone._rows.length, Object.keys(gone._objects).length], [0, 0]);
  assert.deepEqual((await listTracks(fakeDb({ fail: ['missing'] }))).status, 503);
});

// ── libraryUpload.mjs (the page's order of work) ───────────────────────────────────────────
function fakeFile(name = 'Artist - Song.mp3', { type = 'audio/mpeg', size = 1000 } = {}) {
  return { name, type, size, arrayBuffer: async () => new ArrayBuffer(16) };
}
function deps(over = {}) {
  const log = [];
  const d = {
    log,
    sha256: async () => SHA,
    readTags: (_b, name) => ({ ...tagsFromName(name) }),
    decode: async () => { log.push('decode'); return { channels: [new Float32Array(10)], sampleRate: SR, duration: 200 }; },
    profile: () => { log.push('profile'); return { version: 1 }; },
    askInfo: async () => { log.push('ask'); return { title: 'T', artist: 'A' }; },
    create: async (body) => { log.push(['create', body]); return { status: 201, body: { id: ID, signedUrl: 'https://x', contentType: 'audio/mpeg' } }; },
    put: async (url, _f, headers, onProgress) => { log.push(['put', url, headers['content-type']]); onProgress(0.5); return true; },
    confirm: async (id, body) => { log.push(['confirm', id, body]); return { status: 200, body: { track: { id } } }; },
    onStage: (s) => log.push(`stage:${s}`),
    ...over,
  };
  return d;
}

test('upload order: measured before anything is created, then create → put → confirm with the analysis', async () => {
  const d = deps();
  const r = await uploadSong(fakeFile(), d);
  assert.deepEqual(r, { ok: true, track: { id: ID } });
  const ops = d.log.map((x) => (Array.isArray(x) ? x[0] : x));
  assert.deepEqual(ops, ['stage:reading', 'stage:analysing', 'decode', 'profile', 'stage:uploading', 'create', 'put', 'stage:uploading', 'stage:saving', 'confirm', 'stage:done']);
  const created = d.log.find((x) => Array.isArray(x) && x[0] === 'create')[1];
  assert.deepEqual([created.title, created.artist, created.sha256, created.durationSec], ['Song', 'Artist', SHA, 200]);
  assert.deepEqual(d.log.find((x) => Array.isArray(x) && x[0] === 'confirm')[2], { confirm: true, analysis: { version: 1 } });
});

test('⚠ a song that stops early leaves no row behind', async () => {
  for (const [file, over, error] of [
    [fakeFile('cover.png', { type: 'image/png' }), {}, 'not_audio'],
    [fakeFile('big.wav', { type: 'audio/wav', size: MAX_TRACK_BYTES + 1 }), {}, 'too_large'],
    [fakeFile(), { decode: async () => { throw new Error('EncodingError'); } }, 'decode_failed'],
    [fakeFile(), { decode: async () => ({ channels: [new Float32Array(1)], sampleRate: SR, duration: 12 }) }, 'too_short'],
    [fakeFile(), { profile: () => { throw new Error('profileTrack: the file is silent'); } }, 'silent'],
    [fakeFile('Untitled.mp3'), { askInfo: async () => null }, 'cancelled'],
  ]) {
    const d = deps(over);
    const r = await uploadSong(file, d);
    assert.deepEqual([r.ok, r.error], [false, error]);
    assert.ok(!d.log.some((x) => Array.isArray(x) && x[0] === 'create'), `${error}: nothing was created`);
  }
  // No artist in the tags or the name: the page asks, and the answer is what is uploaded.
  const asked = deps();
  await uploadSong(fakeFile('Untitled.mp3'), asked);
  assert.ok(asked.log.includes('ask'));
  assert.deepEqual(['title', 'artist'].map((k) => asked.log.find((x) => Array.isArray(x) && x[0] === 'create')[1][k]), ['T', 'A']);
  // An upload that dies keeps its id, so the page can show the pending row.
  const died = await uploadSong(fakeFile(), deps({ put: async () => false }));
  assert.deepEqual(died, { ok: false, error: 'upload_failed', id: ID });
  const dup = await uploadSong(fakeFile(), deps({ create: async () => ({ status: 409, body: { error: 'duplicate', id: ID } }) }));
  assert.deepEqual([dup.error, dup.id], ['duplicate', ID]);
});

// ── The migration, the routes, the page ────────────────────────────────────────────────────
test('the library is private: no anon or member access to the table or the bucket', () => {
  const sql = read('supabase-migrations/2026-10-11-radio-library.sql').replace(/--.*$/gm, '');
  assert.match(sql, /'radio-library', 'radio-library', false, 62914560/);
  assert.match(sql, /set public = false/);
  assert.ok(!/on storage\.objects/i.test(sql), 'no storage policy: only the service role and signed URLs reach the bucket');
  assert.match(sql, /alter table public\.radio_tracks enable row level security/);
  assert.ok(!/create policy/i.test(sql), 'no row policy for anon or authenticated');
  assert.match(sql, /revoke all on table public\.radio_tracks from public, anon, authenticated/);
  assert.ok(!/grant [^;]* to (anon|authenticated)/i.test(sql));
  assert.ok(!/create (or replace )?function/i.test(sql), 'no function, so the definer audit has nothing to read');
  // The table's checks mirror library.mjs.
  assert.match(sql, /size_bytes between 1 and 62914560/);
  assert.equal(MAX_TRACK_BYTES, 62914560);
  assert.match(sql, /isrc ~ '\^\[A-Z\]\{2\}\[A-Z0-9\]\{3\}\[0-9\]\{7\}\$'/);
  assert.match(sql, /duration_sec > 0 and duration_sec <= 1800/);
});

test('every route and the page check for an admin before doing anything', () => {
  const list = read('src/app/api/admin/radio/tracks/route.ts');
  const one = read('src/app/api/admin/radio/tracks/[id]/route.ts');
  for (const [name, src, methods] of [['tracks', list, ['GET', 'POST']], ['tracks/[id]', one, ['PATCH', 'DELETE']]]) {
    for (const m of methods) {
      const body = src.slice(src.indexOf(`export async function ${m}`));
      const gate = body.indexOf('requireAdminUser()');
      const firstWork = Math.min(...['createAdminClient()', 'request.json()', 'await params'].map((w) => { const i = body.indexOf(w); return i < 0 ? Infinity : i; }));
      assert.ok(gate > 0 && gate < firstWork, `${name} ${m}: the admin check comes first`);
    }
  }
  const page = read('src/app/dashboard/radio/page.tsx');
  assert.ok(page.indexOf('requireAdminUser()') < page.indexOf('createAdminClient()'));
  assert.match(read('src/app/dashboard/layout.tsx'), /href: '\/dashboard\/radio', label: 'Nora’s library', show: isAdmin/);
  const war = read('src/lib/warroom.ts');
  assert.match(war, /\['\/api\/admin\/radio\/tracks', 'GET,POST'\]/);
  assert.match(war, /\['\/api\/admin\/radio\/tracks\/\[id\]', 'PATCH,DELETE'\]/);
  // The client never reads the file back or signs anything itself.
  const client = read('src/app/dashboard/radio/RadioLibrary.tsx');
  assert.ok(!/SERVICE_ROLE|createAdminClient|createSignedUrl/.test(client));
});
