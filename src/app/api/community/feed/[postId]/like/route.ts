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

  const client = await clientForRequest(request);
  const { data: existing } = await client
    .from('community_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await client
      .from('community_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ liked: false });
  }

  const { error } = await client
    .from('community_likes')
    .insert({ post_id: postId, user_id: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ liked: true });
}
