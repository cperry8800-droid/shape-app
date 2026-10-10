// libraryStore.mjs — the admin routes' work on Nora's library, against the SERVICE-ROLE client
// (the table and the bucket have no anon or authenticated access at all). Each function takes
// the client so tests drive it with a fake; the routes only gate on the admin and map results to
// HTTP. Results are { status, body }.
//
// The upload is three steps, so a file is never recorded as in the library before it is there:
//   1. create  → a `pending` row and a signed upload URL for tracks/<id>.<ext>;
//   2. the browser uploads the file straight to storage (it never passes through Vercel, whose
//      request bodies cap at 4.5 MB);
//   3. confirm → the object is checked in storage (present, and the size declared) and the row
//      becomes `ready` with its analysis.
// ⚠ THE SAME FILE TWICE IS ONE SONG. The SHA-256 is unique: a second upload of a ready song is
// refused with its id; a second try at a pending one (an upload that died) reuses that row.

import {
  LIBRARY_BUCKET, LISTING_COLUMNS, analysisColumns, checkEdit, checkUpload, cleanAnalysis, isUuid, trackPath,
} from './library.mjs';

const missingTable = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205');

export async function listTracks(db) {
  const { data, error } = await db.from('radio_tracks').select(LISTING_COLUMNS).order('created_at', { ascending: false }).limit(2000);
  if (missingTable(error)) return { status: 503, body: { error: 'not_set_up' } };
  if (error) return { status: 500, body: { error: 'read_failed' } };
  return { status: 200, body: { tracks: data || [] } };
}

async function signedUpload(db, path) {
  const { data, error } = await db.storage.from(LIBRARY_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data || !data.token) return null;
  return { path: data.path || path, token: data.token, signedUrl: data.signedUrl || null };
}

/**
 * Step 1. `newId` is injected so a test can name the row; the route passes crypto.randomUUID.
 */
export async function createTrack(db, input, { userId, newId }) {
  const checked = checkUpload(input);
  if (!checked.ok) return { status: 400, body: { error: checked.error } };
  const v = checked.value;

  const { data: existing, error: readErr } = await db.from('radio_tracks').select('id,status,storage_path').eq('sha256', v.sha256).maybeSingle();
  if (missingTable(readErr)) return { status: 503, body: { error: 'not_set_up' } };
  if (readErr) return { status: 500, body: { error: 'read_failed' } };
  if (existing && existing.status === 'ready') return { status: 409, body: { error: 'duplicate', id: existing.id } };

  let id, path;
  if (existing) {
    // A pending row from an upload that never finished: same file, so retry into the same place.
    ({ id } = existing);
    path = existing.storage_path;
    const { error } = await db.from('radio_tracks').update({
      file_name: v.fileName, title: v.title, artist: v.artist, album: v.album, label: v.label, isrc: v.isrc,
      duration_sec: v.durationSec, updated_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'pending');
    if (error) return { status: 500, body: { error: 'write_failed' } };
  } else {
    id = newId();
    path = trackPath(id, v.ext);
    const { error } = await db.from('radio_tracks').insert({
      id, storage_path: path, sha256: v.sha256, file_name: v.fileName, mime: v.mime, size_bytes: v.size,
      title: v.title, artist: v.artist, album: v.album, label: v.label, isrc: v.isrc,
      duration_sec: v.durationSec, status: 'pending', uploaded_by: userId || null,
    });
    // Two tabs racing the same file: the unique SHA-256 refuses the second insert.
    if (error && error.code === '23505') return { status: 409, body: { error: 'duplicate' } };
    if (error) return { status: 500, body: { error: 'write_failed' } };
  }

  const upload = await signedUpload(db, path);
  if (!upload) return { status: 502, body: { error: 'upload_url_failed', id } };
  return { status: 201, body: { id, bucket: LIBRARY_BUCKET, contentType: v.mime, ...upload } };
}

/** Is the object there, at the size the row declares? */
async function storedSize(db, path) {
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash), name = path.slice(slash + 1);
  const { data, error } = await db.storage.from(LIBRARY_BUCKET).list(dir, { search: name, limit: 5 });
  if (error) return { error: true };
  const hit = (data || []).find((o) => o && o.name === name);
  if (!hit) return { size: null };
  const size = Number(hit.metadata && (hit.metadata.size ?? hit.metadata.contentLength));
  return { size: Number.isFinite(size) ? size : null, present: true };
}

/** Step 3: the file is in storage, so the song joins the library with its analysis. */
export async function confirmTrack(db, id, input) {
  if (!isUuid(id)) return { status: 400, body: { error: 'id' } };
  const { data: row, error } = await db.from('radio_tracks').select('id,storage_path,size_bytes,duration_sec,status').eq('id', id).maybeSingle();
  if (missingTable(error)) return { status: 503, body: { error: 'not_set_up' } };
  if (error) return { status: 500, body: { error: 'read_failed' } };
  if (!row) return { status: 404, body: { error: 'not_found' } };
  const clean = cleanAnalysis(input && input.analysis, Number(row.duration_sec));
  if (!clean) return { status: 400, body: { error: 'analysis' } };

  const stored = await storedSize(db, row.storage_path);
  if (stored.error) return { status: 502, body: { error: 'storage_check_failed' } };
  if (!stored.present) return { status: 409, body: { error: 'file_missing' } };
  if (stored.size != null && stored.size !== Number(row.size_bytes)) return { status: 409, body: { error: 'file_size_mismatch' } };

  const { data: saved, error: upErr } = await db.from('radio_tracks')
    .update({ ...analysisColumns(clean), status: 'ready', updated_at: new Date().toISOString() })
    .eq('id', id).select(LISTING_COLUMNS).maybeSingle();
  if (upErr) return { status: 500, body: { error: 'write_failed' } };
  return { status: 200, body: { track: saved } };
}

/** Edits from the page: title, artist, album, label, ISRC, in rotation. */
export async function editTrack(db, id, input) {
  if (!isUuid(id)) return { status: 400, body: { error: 'id' } };
  const checked = checkEdit(input);
  if (!checked.ok) return { status: 400, body: { error: checked.error } };
  const { data, error } = await db.from('radio_tracks')
    .update({ ...checked.value, updated_at: new Date().toISOString() })
    .eq('id', id).select(LISTING_COLUMNS).maybeSingle();
  if (missingTable(error)) return { status: 503, body: { error: 'not_set_up' } };
  if (error) return { status: 500, body: { error: 'write_failed' } };
  if (!data) return { status: 404, body: { error: 'not_found' } };
  return { status: 200, body: { track: data } };
}

/**
 * Remove a song: the file first, then the row. A row whose file is already gone is still removed;
 * a file that cannot be removed keeps the row, so nothing in storage is ever left unlisted.
 */
export async function deleteTrack(db, id) {
  if (!isUuid(id)) return { status: 400, body: { error: 'id' } };
  const { data: row, error } = await db.from('radio_tracks').select('id,storage_path').eq('id', id).maybeSingle();
  if (missingTable(error)) return { status: 503, body: { error: 'not_set_up' } };
  if (error) return { status: 500, body: { error: 'read_failed' } };
  if (!row) return { status: 404, body: { error: 'not_found' } };
  const { error: rmErr } = await db.storage.from(LIBRARY_BUCKET).remove([row.storage_path]);
  if (rmErr) return { status: 502, body: { error: 'storage_remove_failed' } };
  const { error: delErr } = await db.from('radio_tracks').delete().eq('id', id);
  if (delErr) return { status: 500, body: { error: 'write_failed' } };
  return { status: 200, body: { deleted: id } };
}
