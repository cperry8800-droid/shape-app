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

  // The FULL ledger — no cap. `/api/client/score` computes the Standing from every
  // row; the Record must aggregate the same set or lifetime/all-range/history would
  // diverge from the Standing for a member with a long history (Codex). The twin
  // windows + groups client-side; a display cap belongs there, not on the fetch.
  const { data: rows, error } = await supabase
    .from('score_ledger')
    .select('category, delta, note, earned_at, source_kind')
    .eq('user_id', user.id);

  if (error) return dbError(error, 'score record read', 500);

  const record = bsScoreRecord((rows || []) as LedgerRow[], { now: new Date() });
  return NextResponse.json(record);
}
