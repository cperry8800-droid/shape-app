// Structured progress photos (front / side / back, date-stamped).
//
// POST /api/client/progress-photos  (multipart/form-data)
//   fields: photo (File, required), pose? front|side|back, takenOn? YYYY-MM-DD
//   → { ok, photo: { id, taken_on, pose, url } }
// GET /api/client/progress-photos → { ok, photos: [...] } (own, newest first)
//
// Files live in the PRIVATE progress-photos bucket — uploaded with the
// service-role client (no public read), and the row stores a 1-year signed URL
// so both the client app and a linked coach (via get_client_progress_photos)
// can render it. Accepts Bearer or cookie auth; under /api/client so the
// membership proxy gate applies.

import { NextResponse } from 'next/server';
import { dbError } from '@/lib/request-utils';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'progress-photos';
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const { data, error } = await supabase
    .from('client_progress_photos')
    .select('id, taken_on, pose, url, created_at')
    .eq('user_id', user.id)
    .order('taken_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(120);
  if (error) return dbError(error, 'progress photos query', 500);
  return NextResponse.json({ ok: true, photos: data ?? [] });
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const form = await request.formData().catch(() => null);
  const photo = form?.get('photo');
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: 'Attach a photo.' }, { status: 400 });
  }
  if (!/^image\//.test(photo.type || '')) {
    return NextResponse.json({ error: 'Photos only.' }, { status: 400 });
  }
  const poseRaw = String(form?.get('pose') ?? 'front');
  const pose = ['front', 'side', 'back'].includes(poseRaw) ? poseRaw : 'front';
  const takenRaw = String(form?.get('takenOn') ?? '');
  const takenOn = /^\d{4}-\d{2}-\d{2}$/.test(takenRaw) ? takenRaw : new Date().toISOString().slice(0, 10);

  const ext = (photo.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
  const path = `${user.id}/${takenOn}-${pose}-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await photo.arrayBuffer());

  let url: string | null = null;
  try {
    const admin = createAdminClient();
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: photo.type || 'image/jpeg',
      upsert: false,
    });
    if (upErr) return dbError(upErr, 'progress photo upload', 500, 'Upload failed.');
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    url = signed?.signedUrl ?? null;
  } catch (e) {
    return dbError(e, 'progress photo upload', 500, 'Upload failed.');
  }
  if (!url) return NextResponse.json({ error: 'Could not sign the photo URL.' }, { status: 500 });

  const { data: row, error } = await supabase
    .from('client_progress_photos')
    .insert({ user_id: user.id, taken_on: takenOn, pose, url, storage_path: path })
    .select('id, taken_on, pose, url, created_at')
    .single();
  if (error) return dbError(error, 'progress photos query', 500);
  return NextResponse.json({ ok: true, photo: row });
}
