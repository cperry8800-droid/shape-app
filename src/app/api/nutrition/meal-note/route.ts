// Deliver a meal log's note + optional voice memo + photo to the client's coach(es).
//
// POST /api/nutrition/meal-note  (multipart/form-data)
//   fields: note?, mealTitle?, mealSummary?, audio? (File), photo? (File)
//   → { ok, delivered, deliveredCount, audioAttached, photoAttached, reason? }
//
// Resolves every linked coach (active/trialing trainer + nutritionist), uploads
// the audio memo and/or meal photo to the "meal-notes" storage bucket, then posts
// a message into each coach's direct conversation (via get_or_create_direct_conversation)
// with the note + meal summary and the memo/photo links in metadata. Accepts the
// mobile Bearer token or the cookie session. Degrades gracefully with no coach.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEMO_BUCKET = 'meal-notes';
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

// Upload one attachment (voice memo or photo) to the meal-notes bucket via the
// service-role admin client (matches the apply route — no storage RLS needed).
// Best-effort: returns nulls (and logs) if the bucket is missing or rejects the
// file, so a meal note still delivers without its attachment.
async function uploadAttachment(
  file: File,
  prefix: string,
  fallbackExt: string,
  fallbackType: string,
): Promise<{ path: string | null; url: string | null }> {
  const ext = (file.type.split('/')[1] || fallbackExt).replace(/[^a-z0-9]/gi, '') || fallbackExt;
  const path = `${prefix}${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const admin = createAdminClient();
    const { error: upErr } = await admin.storage.from(MEMO_BUCKET).upload(path, bytes, {
      contentType: file.type || fallbackType,
      upsert: false,
    });
    if (upErr) {
      console.warn('[shape-app] meal attachment upload failed:', upErr.message);
      return { path: null, url: null };
    }
    const { data: signed } = await admin.storage.from(MEMO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    return { path, url: signed?.signedUrl ?? null };
  } catch (e) {
    console.warn('[shape-app] meal attachment upload error:', e instanceof Error ? e.message : e);
    return { path: null, url: null };
  }
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to send a note to your coach.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const note = String(form.get('note') ?? '').trim();
  const mealTitle = String(form.get('mealTitle') ?? '').trim() || 'a meal';
  const mealSummary = String(form.get('mealSummary') ?? '').trim();
  const audio = form.get('audio');
  const hasAudio = audio instanceof File && audio.size > 0;
  const photo = form.get('photo');
  const hasPhoto = photo instanceof File && photo.size > 0;

  if (!note && !hasAudio && !hasPhoto) {
    return NextResponse.json({ ok: true, delivered: false, audioAttached: false, photoAttached: false, reason: 'nothing_to_send' });
  }

  // Resolve every linked coach (active/trialing trainer + nutritionist). RLS
  // scopes subscriptions to the signed-in client, so client_id is implicit.
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('provider_id, provider_role')
    .eq('client_id', user.id)
    .in('provider_role', ['trainer', 'nutritionist'])
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false });

  const providers: Array<{ role: 'trainer' | 'nutritionist'; id: number }> = [];
  const seen = new Set<string>();
  for (const s of subs ?? []) {
    const role = s.provider_role === 'trainer' ? 'trainer' : s.provider_role === 'nutritionist' ? 'nutritionist' : null;
    const id = Number(s.provider_id);
    if (!role || !Number.isInteger(id) || id <= 0) continue;
    const key = `${role}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    providers.push({ role, id });
  }
  if (!providers.length) {
    // No coaches linked yet — nothing to deliver to (not an error).
    return NextResponse.json({ ok: true, delivered: false, audioAttached: false, photoAttached: false, reason: 'no_coach' });
  }

  // Upload the voice memo + photo (best-effort) to the meal-notes bucket. The
  // memo keeps a bare timestamp path; the photo is prefixed so they don't collide.
  let audioPath: string | null = null;
  let audioUrl: string | null = null;
  if (hasAudio) ({ path: audioPath, url: audioUrl } = await uploadAttachment(audio as File, `${user.id}/`, 'webm', 'audio/webm'));

  let photoPath: string | null = null;
  let photoUrl: string | null = null;
  if (hasPhoto) ({ path: photoPath, url: photoUrl } = await uploadAttachment(photo as File, `${user.id}/photo-`, 'jpg', 'image/jpeg'));

  const bodyLines = [
    `🍽 Logged ${mealTitle}${mealSummary ? ` · ${mealSummary}` : ''}`,
    note,
    hasAudio ? (audioUrl ? '🎤 Voice memo attached' : '🎤 Voice memo recorded') : '',
    hasPhoto ? (photoUrl ? '📷 Meal photo attached' : '📷 Meal photo added') : '',
  ].filter(Boolean);
  const body = bodyLines.join('\n');

  // Fan the note out to every linked coach (trainer + nutritionist). Each gets
  // its own direct conversation + message; the memo/photo links ride along in
  // metadata so their chat thread can render a player / image.
  let delivered = 0;
  for (const p of providers) {
    const { data: conversationId, error: convErr } = await supabase.rpc('get_or_create_direct_conversation', {
      p_provider_role: p.role,
      p_provider_id: p.id,
    });
    if (convErr || !conversationId) continue;

    const { error: msgErr } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body,
      metadata: {
        source: 'meal-note',
        provider_role: p.role,
        provider_id: p.id,
        meal_title: mealTitle,
        meal_summary: mealSummary || null,
        note: note || null,
        audio: hasAudio ? { bucket: MEMO_BUCKET, path: audioPath, url: audioUrl } : null,
        photo: hasPhoto ? { bucket: MEMO_BUCKET, path: photoPath, url: photoUrl } : null,
      },
    });
    if (!msgErr) delivered += 1;
  }

  return NextResponse.json({ ok: true, delivered: delivered > 0, deliveredCount: delivered, audioAttached: !!audioUrl, photoAttached: !!photoUrl });
}
