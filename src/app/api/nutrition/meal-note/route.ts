// Deliver a meal log's note + optional voice memo to the client's nutritionist.
//
// POST /api/nutrition/meal-note  (multipart/form-data)
//   fields: note?, mealTitle?, mealSummary?, audio? (File)
//   → { ok, delivered, conversationId?, audioAttached, reason? }
//
// Resolves the signed-in client's nutritionist (active subscription), uploads
// the audio memo to the "meal-notes" storage bucket, and posts a message into
// the direct conversation (via get_or_create_direct_conversation) with the note
// + meal summary and the memo link in metadata. Accepts the mobile Bearer token
// or the cookie session. Degrades gracefully when there's no coach or no key.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEMO_BUCKET = 'meal-notes';
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

export async function POST(request: Request) {
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

  if (!note && !hasAudio) {
    return NextResponse.json({ ok: true, delivered: false, audioAttached: false, reason: 'nothing_to_send' });
  }

  // Resolve the client's nutritionist (active subscription). RLS scopes
  // subscriptions to the signed-in client, so client_id is implicit.
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('provider_id')
    .eq('client_id', user.id)
    .eq('provider_role', 'nutritionist')
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const providerId = Number(sub?.provider_id);
  if (!Number.isInteger(providerId) || providerId <= 0) {
    // No coach linked yet — nothing to deliver to (not an error).
    return NextResponse.json({ ok: true, delivered: false, audioAttached: false, reason: 'no_coach' });
  }

  // Upload the voice memo via the service-role admin client (matches the apply
  // route — no storage RLS needed). Best-effort: needs the meal-notes bucket.
  let audioPath: string | null = null;
  let audioUrl: string | null = null;
  if (hasAudio) {
    const file = audio as File;
    const ext = (file.type.split('/')[1] || 'webm').replace(/[^a-z0-9]/gi, '') || 'webm';
    const path = `${user.id}/${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const admin = createAdminClient();
      const { error: upErr } = await admin.storage.from(MEMO_BUCKET).upload(path, bytes, {
        contentType: file.type || 'audio/webm',
        upsert: false,
      });
      if (!upErr) {
        audioPath = path;
        const { data: signed } = await admin.storage.from(MEMO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
        audioUrl = signed?.signedUrl ?? null;
      } else {
        console.warn('[shape-app] meal memo upload failed:', upErr.message);
      }
    } catch (e) {
      console.warn('[shape-app] meal memo upload error:', e instanceof Error ? e.message : e);
    }
  }

  const { data: conversationId, error: convErr } = await supabase.rpc('get_or_create_direct_conversation', {
    p_provider_role: 'nutritionist',
    p_provider_id: providerId,
  });
  if (convErr || !conversationId) {
    return NextResponse.json({ error: convErr?.message || 'Could not reach your coach.' }, { status: 400 });
  }

  const bodyLines = [
    `🍽 Logged ${mealTitle}${mealSummary ? ` · ${mealSummary}` : ''}`,
    note,
    hasAudio ? (audioUrl ? '🎤 Voice memo attached' : '🎤 Voice memo recorded') : '',
  ].filter(Boolean);

  const { error: msgErr } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: user.id,
    body: bodyLines.join('\n'),
    metadata: {
      source: 'meal-note',
      provider_role: 'nutritionist',
      provider_id: providerId,
      meal_title: mealTitle,
      meal_summary: mealSummary || null,
      note: note || null,
      audio: hasAudio ? { bucket: MEMO_BUCKET, path: audioPath, url: audioUrl } : null,
    },
  });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, delivered: true, conversationId, audioAttached: !!audioUrl });
}
