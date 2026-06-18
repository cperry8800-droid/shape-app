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

  // Shape Score: +5 for a feed-visible community post (idempotent on the post id;
  // not private/profile-only — those aren't shared engagement). Fire-and-forget;
  // no-ops until the awards migration is applied.
  if (data && (data.privacy === 'public' || data.privacy === 'community')) {
    await client.rpc('insert_score', {
      p_category: 'community',
      p_source_kind: 'community_post',
      p_source_id: data.id,
      p_delta: 5,
      p_note: 'Community post',
    });
  }
  return NextResponse.json({ post: data });
}
