// "The Record" — the caller's full Shape Score history + report. Reads the
// existing score_ledger (RLS-scoped) and runs the shared aggregation twin. Kept
// separate from /api/client/score so the Standing page stays lean (the Record
// opens on demand). No migration.

import { NextResponse } from 'next/server';
import { dbError } from '@/lib/request-utils';
import { createClient } from '@/lib/supabase/server';
import { bsScoreRecord, type LedgerRow } from '@/lib/scoreHistory';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // Full ledger, newest first, capped — the report windows + groups in the shared
  // aggregation twin. 1000 rows is far beyond a real member's history.
  const { data: rows, error } = await supabase
    .from('score_ledger')
    .select('category, delta, note, earned_at, source_kind')
    .eq('user_id', user.id)
    .order('earned_at', { ascending: false })
    .limit(1000);

  if (error) return dbError(error, 'score record read', 500);

  const record = bsScoreRecord((rows || []) as LedgerRow[], { now: new Date() });
  return NextResponse.json(record);
}
