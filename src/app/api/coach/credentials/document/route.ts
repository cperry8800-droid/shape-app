// Coach credential documents — upload a Certificate of Insurance (COI) or a
// certification file to the PRIVATE coach-credentials bucket. The file is uploaded
// with the service-role admin client (the bucket has no anon RLS policy); the
// resulting path is recorded on the coach's own provider_credentials row
// (owner-RLS), read back only through short-lived signed URLs in the admin queue.
//
// POST multipart: file, kind=coi|cert, [type], [number]  ->  { ok, path }
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'coach-credentials';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function safeName(name: string): string {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60) || 'file';
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart form upload.' }, { status: 400 });
  }

  const file = form.get('file');
  const kind = String(form.get('kind') || 'coi').toLowerCase();
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (kind !== 'coi' && kind !== 'cert') return NextResponse.json({ error: 'Invalid document kind.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is larger than 10MB.' }, { status: 413 });
  if (!file.type || !ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'File must be a PDF, DOC, DOCX, or image.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const path = `${user.id}/${kind}-${Date.now()}-${safeName(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type || undefined, upsert: false });
  if (upErr) {
    console.error('[shape] coach credential upload failed:', upErr.message);
    return NextResponse.json({ error: 'Upload failed — try again.' }, { status: 500 });
  }

  // Record the path on the coach's own credential row (owner-scoped RLS).
  const supabase = await clientForRequest(request);
  const now = new Date().toISOString();

  if (kind === 'coi') {
    const { error } = await supabase
      .from('provider_credentials')
      .upsert({ owner_id: user.id, insurance_coi_path: path, updated_at: now }, { onConflict: 'owner_id' });
    if (error) {
      console.error('[shape] coi path save failed:', error.message);
      return NextResponse.json({ error: 'Could not record the document.' }, { status: 500 });
    }
  } else {
    const { data: cur } = await supabase
      .from('provider_credentials')
      .select('cert_files')
      .eq('owner_id', user.id)
      .maybeSingle();
    const existing = Array.isArray(cur?.cert_files) ? (cur!.cert_files as Array<Record<string, unknown>>) : [];
    const entry = {
      type: String(form.get('type') || '').slice(0, 40),
      number: String(form.get('number') || '').slice(0, 60),
      path,
      name: String(file.name || '').slice(0, 120),
    };
    const next = [...existing, entry].slice(0, 12);
    const { error } = await supabase
      .from('provider_credentials')
      .upsert({ owner_id: user.id, cert_files: next, updated_at: now }, { onConflict: 'owner_id' });
    if (error) {
      console.error('[shape] cert file save failed:', error.message);
      return NextResponse.json({ error: 'Could not record the document.' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, path });
}
