// libraryUpload.mjs — one song's way into Nora's library, as the admin page runs it:
//
//   read → fingerprint (SHA-256) → tags → decode → measure → [ask for a missing title or artist]
//   → create (pending row + signed upload URL) → upload straight to storage → confirm
//
// The browser's own APIs come in through `deps`, so the order and every failure path is tested
// without a browser (tests/radio-library.test.mjs). Stages are reported through `onStage`.
//
// ⚠ NOTHING IS UPLOADED BEFORE IT IS MEASURED. A file the browser cannot decode, or that the
// server would refuse (too long, too short, not audio), stops before any row or upload URL
// exists, so a failed song never leaves a pending row behind. The one exception is an upload that
// dies in transit: its row stays pending, the page shows it, and dropping the same file again
// reuses that row (libraryStore.createTrack).

import { MAX_TRACK_BYTES, MAX_TRACK_SEC, MIN_TRACK_SEC, trackExt } from './library.mjs';

export const STAGES = Object.freeze(['reading', 'analysing', 'needs-info', 'uploading', 'saving', 'done']);

/** What the page says when a song stops, by the reason. */
export const FAILURE_TEXT = Object.freeze({
  not_audio: 'Not a file Nora can play. Use MP3, M4A, AAC, WAV, FLAC or OGG.',
  too_large: 'Over 60 MB. Export it as a 320 kbps MP3 or an M4A.',
  too_short: 'Shorter than 30 seconds.',
  too_long: 'Longer than 30 minutes.',
  decode_failed: 'Your browser could not decode this file. M4A and AAC need Chrome, Edge or Safari; any browser takes MP3, WAV and FLAC.',
  silent: 'The file is silent.',
  duplicate: 'Already in the library.',
  upload_failed: 'The upload did not finish. Drop the file again to retry.',
  upload_url_failed: 'Storage did not give an upload link. Try again in a minute.',
  file_missing: 'Storage does not have the file. Drop it again to retry.',
  file_size_mismatch: 'Storage has a different size for this file. Drop it again to retry.',
  analysis: 'The measurements did not check out on the server.',
  not_set_up: 'The library is not set up yet (run the migration).',
  cancelled: 'Skipped.',
});

export const failureText = (code) => FAILURE_TEXT[code] || `Could not add it (${String(code || 'error').replace(/_/g, ' ')}).`;

/**
 * @param {File|{name:string,type:string,size:number,arrayBuffer:()=>Promise<ArrayBuffer>}} file
 * @param {object} deps
 * @param {(buf: ArrayBuffer) => Promise<string>} deps.sha256      hex digest
 * @param {(buf: ArrayBuffer) => Promise<{channels: Float32Array[], sampleRate: number, duration: number}>} deps.decode
 * @param {(channels: Float32Array[], sampleRate: number) => object} deps.profile
 * @param {(bytes: Uint8Array, name: string) => object} deps.readTags
 * @param {(missing: {title: string|null, artist: string|null}) => Promise<{title: string, artist: string}|null>} deps.askInfo
 *        asked only when the file names no title or artist; null skips the song
 * @param {(body: object) => Promise<{status: number, body: any}>} deps.create
 * @param {(url: string, file: any, headers: Record<string, string>, onProgress: (f: number) => void) => Promise<boolean>} deps.put
 * @param {(id: string, body: object) => Promise<{status: number, body: any}>} deps.confirm
 * @param {(stage: string, info?: object) => void} [deps.onStage]
 * @param {() => Promise<void>} [deps.yieldToPaint]  lets the page draw between the heavy steps
 * @returns {Promise<{ok: true, track: object} | {ok: false, error: string, id?: string}>}
 */
export async function uploadSong(file, deps) {
  const stage = (s, info) => { if (deps.onStage) deps.onStage(s, info); };
  const breathe = () => (deps.yieldToPaint ? deps.yieldToPaint() : Promise.resolve());

  if (!trackExt(file.name, file.type)) return { ok: false, error: 'not_audio' };
  if (!(file.size > 0)) return { ok: false, error: 'not_audio' };
  if (file.size > MAX_TRACK_BYTES) return { ok: false, error: 'too_large' };

  stage('reading');
  const buf = await file.arrayBuffer();
  const sha256 = await deps.sha256(buf);
  const tags = deps.readTags(new Uint8Array(buf), file.name) || {};

  stage('analysing');
  await breathe();
  let decoded;
  try {
    // ⚠ decodeAudioData DETACHES the buffer it is given, so the fingerprint and the tags are read
    // above, before this line, and nothing reads `buf` after it (a copy would cost up to 60 MB).
    decoded = await deps.decode(buf);
  } catch {
    return { ok: false, error: 'decode_failed' };
  }
  if (!decoded || !Array.isArray(decoded.channels) || !decoded.channels.length) return { ok: false, error: 'decode_failed' };
  const duration = Number(decoded.duration);
  if (!(duration >= MIN_TRACK_SEC)) return { ok: false, error: 'too_short' };
  if (duration > MAX_TRACK_SEC) return { ok: false, error: 'too_long' };
  await breathe();
  let analysis;
  try {
    analysis = deps.profile(decoded.channels, decoded.sampleRate);
  } catch (e) {
    return { ok: false, error: /silent/.test(String(e && e.message)) ? 'silent' : 'decode_failed' };
  }

  let { title, artist } = tags;
  if (!title || !artist) {
    stage('needs-info', { title: title || null, artist: artist || null });
    const got = await deps.askInfo({ title: title || null, artist: artist || null });
    if (!got) return { ok: false, error: 'cancelled' };
    title = got.title; artist = got.artist;
  }

  stage('uploading', { progress: 0 });
  const created = await deps.create({
    fileName: file.name, type: file.type, size: file.size, sha256, durationSec: duration,
    title, artist, album: tags.album || null, label: tags.label || null, isrc: tags.isrc || null,
  });
  if (created.status !== 201) return { ok: false, error: (created.body && created.body.error) || 'create_failed', id: created.body && created.body.id };
  const { id, signedUrl, contentType } = created.body;
  const sent = await deps.put(signedUrl, file, { 'content-type': contentType, 'x-upsert': 'true', 'cache-control': 'max-age=3600' },
    (f) => stage('uploading', { progress: Math.max(0, Math.min(1, f)) }));
  if (!sent) return { ok: false, error: 'upload_failed', id };

  stage('saving');
  const confirmed = await deps.confirm(id, { confirm: true, analysis });
  if (confirmed.status !== 200) return { ok: false, error: (confirmed.body && confirmed.body.error) || 'confirm_failed', id };
  stage('done');
  return { ok: true, track: confirmed.body.track };
}
