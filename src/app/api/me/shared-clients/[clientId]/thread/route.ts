// Open (or reuse) a private coach↔coach conversation about a shared client.
// Body: { counterpartUserId: string }. Returns { conversationId }. The
// underlying SQL function enforces that both users are active coaches on
// the client; existing conversation RLS handles read/write afterward.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ conversationId: data });
}
