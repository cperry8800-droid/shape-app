import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError, cleanText } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ postId: string }> }
) {
  const { postId } = await ctx.params;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<unknown>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const text = cleanText((body as { body?: unknown } | null)?.body, 2000);
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

  if (error) return dbError(error, 'community comment write', 400);
  return NextResponse.json({ comment: data });
}
