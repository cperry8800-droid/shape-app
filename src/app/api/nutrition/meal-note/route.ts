// Deliver a meal log's note + optional voice memo to the client's coach(es).
//
// POST /api/nutrition/meal-note  (multipart/form-data)
//   fields: note?, mealTitle?, mealSummary?, audio? (File)
//   → { ok, delivered, deliveredCount, audioAttached, reason? }
//
// Resolves every linked coach (active/trialing trainer + nutritionist), uploads
// the audio memo once to the "meal-notes" storage bucket, then posts a message
// into each coach's direct conversation (via get_or_create_direct_conversation)
// with the note + meal summary and the memo link in metadata. Accepts the mobile
// Bearer token or the cookie session. Degrades gracefully when there's no coach.

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

  const bodyLines = [
    `🍽 Logged ${mealTitle}${mealSummary ? ` · ${mealSummary}` : ''}`,
    note,
    hasAudio ? (audioUrl ? '🎤 Voice memo attached' : '🎤 Voice memo recorded') : '',
  ].filter(Boolean);
  const body = bodyLines.join('\n');

  // Fan the note out to every linked coach (trainer + nutritionist). Each gets
  // its own direct conversation + message; the audio memo link rides along in
  // metadata so their chat thread can render a player.
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
      },
    });
    if (!msgErr) delivered += 1;
  }

  return NextResponse.json({ ok: true, delivered: delivered > 0, deliveredCount: delivered, audioAttached: !!audioUrl });
}
