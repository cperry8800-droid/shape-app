import { NextResponse } from 'next/server';
import { readJson, dbError, cleanText } from '@/lib/request-utils';
import { type SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizePrivacy(input: unknown): 'public' | 'community' | 'private' | 'profile' {
  const value = String(input ?? '').toLowerCase();
  if (value === 'public' || value === 'private' || value === 'profile') return value;
  return 'community';
}

function normalizeRole(input: unknown): 'client' | 'trainer' | 'nutritionist' | 'member' {
  const value = String(input ?? '').toLowerCase();
  if (value === 'client' || value === 'trainer' || value === 'nutritionist') return value;
  return 'member';
}

async function profileForUser(client: SupabaseClient, userId: string) {
  const { data } = await client
    .from('profiles')
    .select('full_name, role')
    .eq('id', userId)
    .maybeSingle();
  return data as { full_name?: string | null; role?: string | null } | null;
}

// Object path out of a Supabase public storage URL for a bucket; null if the URL
// isn't one of ours (e.g. a pasted YouTube link), so we never delete foreign media.
function storagePathFromUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  try { return decodeURIComponent(url.slice(i + marker.length).split('?')[0]); }
  catch { return url.slice(i + marker.length).split('?')[0]; }
}

export async function GET(request: Request) {
  const client = await clientForRequest(request);
  const { data: posts, error } = await client
    .from('community_posts')
    .select('*, likes:community_likes(user_id), comments:community_comments(id, user_id, author_name, body, created_at)')
    // 'profile' (profile-only) and 'private' posts never appear in the feed.
    .in('privacy', ['public', 'community'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return dbError(error, 'community feed read', 400);
  return NextResponse.json({ posts: posts ?? [] });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const client = await clientForRequest(request);
  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const payload = body as {
    activityType?: unknown;
    title?: unknown;
    status?: unknown;
    note?: unknown;
    privacy?: unknown;
    metrics?: unknown;
    route?: unknown;
    photoUrl?: unknown;
    sourceProvider?: unknown;
    sourceActivityId?: unknown;
  } | null;

  const photoUrl = cleanText(payload?.photoUrl, 2048);
  const title = cleanText(payload?.title, 200) || (photoUrl ? 'Photo' : '');
  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });

  const profile = await profileForUser(client, user.id);
  const authorName = profile?.full_name || user.email?.split('@')[0] || 'Shape member';

  const { data, error } = await client
    .from('community_posts')
    .insert({
      author_id: user.id,
      author_name: authorName,
      author_role: normalizeRole(profile?.role),
      privacy: normalizePrivacy(payload?.privacy),
      activity_type: cleanText(payload?.activityType, 60) || 'workout',
      title,
      status: cleanText(payload?.status, 200) || null,
      note: cleanText(payload?.note, 4000) || null,
      metrics: typeof payload?.metrics === 'object' && payload?.metrics ? payload.metrics : {},
      route: typeof payload?.route === 'object' && payload?.route ? payload.route : {},
      photo_url: photoUrl || null,
      source_provider: cleanText(payload?.sourceProvider, 60) || null,
      source_activity_id: cleanText(payload?.sourceActivityId, 200) || null,
    })
    .select()
    .single();

  if (error) return dbError(error, 'community feed write', 400);

  // Shape Score: +5 for a feed-visible community post. The RPC hard-codes the
  // amount and re-verifies the post is caller-owned + feed-visible, so it can't
  // be abused; idempotent on the post id. Fire-and-forget; no-ops pre-migration.
  if (data?.id) {
    await client.rpc('award_community_post', { p_post_id: data.id });
  }
  return NextResponse.json({ post: data });
}

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const client = await clientForRequest(request);
  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as { postId?: unknown; title?: unknown; note?: unknown; photoUrl?: unknown; privacy?: unknown; metrics?: unknown } | null;
  const postId = cleanText(body?.postId, 64);
  if (!postId) return NextResponse.json({ error: 'postId is required.' }, { status: 400 });

  // Merge metrics so workoutStats/coach/etc. survive a partial edit. Scope to the
  // owner and fail on a read error — otherwise we'd merge against {} and wipe the
  // existing metrics.
  const { data: cur, error: curError } = await client
    .from('community_posts').select('metrics').eq('id', postId).eq('author_id', user.id).maybeSingle();
  if (curError) return dbError(curError, 'community feed edit prefetch', 400);
  const existing = (cur && typeof cur.metrics === 'object' && cur.metrics) ? cur.metrics as Record<string, unknown> : {};
  const incoming = (typeof body?.metrics === 'object' && body?.metrics) ? body.metrics as Record<string, unknown> : {};
  const merged: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(incoming)) { if (v === '' || v === null) delete merged[k]; else merged[k] = v; }
  merged.editedAt = new Date().toISOString();

  const patch: Record<string, unknown> = { metrics: merged };
  if (body?.title !== undefined) patch.title = cleanText(body.title, 200) || 'Post';
  if (body?.note !== undefined) patch.note = cleanText(body.note, 4000) || null;
  if (body?.photoUrl !== undefined) patch.photo_url = cleanText(body.photoUrl, 2048) || null;
  if (body?.privacy !== undefined) patch.privacy = normalizePrivacy(body.privacy);

  const { data, error } = await client
    .from('community_posts').update(patch)
    .eq('id', postId).eq('author_id', user.id) // RLS also enforces ownership
    .select().single();
  if (error) return dbError(error, 'community feed edit', 400);
  return NextResponse.json({ post: data });
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const client = await clientForRequest(request);
  const postId = (new URL(request.url).searchParams.get('id') || '').trim();
  if (!postId || postId.length > 64) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  // Best-effort: remove the post's own uploaded media from public storage so a
  // deleted photo/video isn't still reachable by URL. Owner-scoped; never blocks the delete.
  try {
    const { data: row } = await client.from('community_posts')
      .select('photo_url, metrics').eq('id', postId).eq('author_id', user.id).maybeSingle();
    if (row) {
      const m = (row.metrics && typeof row.metrics === 'object') ? row.metrics as Record<string, unknown> : {};
      const jobs: Promise<unknown>[] = [];
      const ph = storagePathFromUrl(typeof row.photo_url === 'string' ? row.photo_url : '', 'community-photos');
      if (ph) jobs.push(client.storage.from('community-photos').remove([ph]));
      const vurl = (m.video_url ?? m.video);
      const vp = storagePathFromUrl(typeof vurl === 'string' ? vurl : '', 'coach-media');
      if (vp) jobs.push(client.storage.from('coach-media').remove([vp]));
      if (jobs.length) await Promise.allSettled(jobs);
    }
  } catch { /* media cleanup is best-effort */ }
  const { error } = await client.from('community_posts').delete().eq('id', postId).eq('author_id', user.id);
  if (error) return dbError(error, 'community feed delete', 400);
  return NextResponse.json({ ok: true });
}
