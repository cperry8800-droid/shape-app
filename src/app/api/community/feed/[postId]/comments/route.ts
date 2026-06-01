import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ postId: string }> }
) {
  const { postId } = await ctx.params;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null as unknown);
  const text = String((body as { body?: unknown } | null)?.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Comment cannot be empty.' }, { status: 400 });

  const client = await clientForRequest(request);
  const { data: profile } = await client
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const { data, error } = await client
    .from('community_comments')
    .insert({
      post_id: postId,
      user_id: user.id,
      author_name: profile?.full_name || user.email?.split('@')[0] || 'Shape member',
      body: text,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ comment: data });
}
