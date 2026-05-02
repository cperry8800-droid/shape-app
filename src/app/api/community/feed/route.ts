import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function clientForRequest(request: Request): Promise<SupabaseClient> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        global: { headers: { Authorization: `Bearer ${bearerMatch[1]}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
  }
  return createClient() as Promise<SupabaseClient>;
}

async function currentUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const client = await clientForRequest(request);
    const { data } = await client.auth.getUser(bearerMatch[1]);
    return data.user ?? null;
  }
  const client = await createClient();
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

function normalizePrivacy(input: unknown): 'public' | 'community' | 'private' {
  const value = String(input ?? '').toLowerCase();
  if (value === 'public' || value === 'private') return value;
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
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ posts: posts ?? [] });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const client = await clientForRequest(request);
  const body = await request.json().catch(() => null as unknown);
  const payload = body as {
    activityType?: unknown;
    title?: unknown;
    status?: unknown;
    note?: unknown;
    privacy?: unknown;
    metrics?: unknown;
    route?: unknown;
    sourceProvider?: unknown;
    sourceActivityId?: unknown;
  } | null;

  const title = String(payload?.title ?? '').trim();
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
      activity_type: String(payload?.activityType || 'workout'),
      title,
      status: String(payload?.status || '').trim() || null,
      note: String(payload?.note || '').trim() || null,
      metrics: typeof payload?.metrics === 'object' && payload?.metrics ? payload.metrics : {},
      route: typeof payload?.route === 'object' && payload?.route ? payload.route : {},
      source_provider: String(payload?.sourceProvider || '').trim() || null,
      source_activity_id: String(payload?.sourceActivityId || '').trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ post: data });
}
