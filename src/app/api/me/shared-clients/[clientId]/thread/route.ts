// Open (or reuse) a private coach↔coach conversation about a shared client.
// Body: { counterpartUserId: string }. Returns { conversationId }. The
// underlying SQL function enforces that both users are active coaches on
// the client; existing conversation RLS handles read/write afterward.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const supabase = await clientForRequest(req);
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<Record<string, unknown>>(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const counterpartUserId = typeof body?.counterpartUserId === 'string' ? body.counterpartUserId : null;
  if (!counterpartUserId) {
    return NextResponse.json({ error: 'counterpartUserId required.' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('get_or_create_coach_coach_conversation', {
    p_other_user_id: counterpartUserId,
    p_client_id: clientId,
  });
  if (error) return dbError(error, 'shared-client thread', 400);
  return NextResponse.json({ conversationId: data });
}
