// Self-serve data export (GDPR Art. 15/20 access + portability, CCPA right to
// know). Returns the personal and health data Shape holds about the caller as a
// downloadable JSON file. Reads are RLS-scoped to the authenticated user (cookie
// session OR Bearer token) and additionally filtered by the owner column, so an
// export never includes anyone else's rows. Media files (progress photos, voice
// notes) are referenced by path; the file itself is delivered on request.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tables the user owns, with the column that scopes a row to them.
const OWNED: { key: string; table: string; col: string }[] = [
  { key: 'health_screening_and_goals', table: 'user_goals', col: 'user_id' },
  { key: 'weigh_ins', table: 'client_weigh_ins', col: 'user_id' },
  { key: 'measurements', table: 'client_measurements', col: 'user_id' },
  { key: 'weekly_checkins', table: 'client_checkins', col: 'user_id' },
  { key: 'progress_photos', table: 'client_progress_photos', col: 'user_id' },
  { key: 'cycle_events', table: 'cycle_events', col: 'user_id' },  // WA MHMD consumer health data (The Cycle)
  { key: 'daily_health_snapshots', table: 'daily_health_snapshot', col: 'user_id' },
  { key: 'score_ledger', table: 'score_ledger', col: 'user_id' },
  { key: 'playlists', table: 'member_playlists', col: 'user_id' },
  { key: 'reminders', table: 'user_scheduled_reminders', col: 'user_id' },
  { key: 'assigned_workouts', table: 'client_workouts', col: 'client_id' },
  { key: 'community_posts', table: 'community_posts', col: 'author_id' },
  { key: 'sent_messages', table: 'messages', col: 'sender_id' },
];

// Keys we never include in an export even if present — at ANY nesting level,
// since jsonb columns (user_goals.data, client_workouts.payload, integration
// rows) can carry tokens/secrets in nested objects.
const SENSITIVE_KEYS = /(access|refresh|provider|id|api|bearer|client|private|secret|public|signing|encryption|webhook)?_?(token|secret|key|credential)s?$|^password/i;
function scrub(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(scrub);
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k)) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  return val;
}

export async function GET(request: Request) {
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const data: Record<string, unknown> = {};

  try {
    const res = await supabase.from('profiles').select('*').eq('id', user.id);
    data.profile = res.error ? { unavailable: res.error.message } : scrub(res.data || []);
  } catch (e) {
    data.profile = { unavailable: (e as Error).message };
  }

  for (const t of OWNED) {
    try {
      const res = await supabase.from(t.table).select('*').eq(t.col, user.id);
      data[t.key] = res.error ? { unavailable: res.error.message } : scrub(res.data || []);
    } catch (e) {
      data[t.key] = { unavailable: (e as Error).message };
    }
  }

  // Connected integrations — metadata only (scrub() drops any token columns).
  try {
    const res = await supabase.from('user_integrations').select('*').eq('user_id', user.id);
    data.connected_integrations = res.error ? { unavailable: res.error.message } : scrub(res.data || []);
  } catch (e) {
    data.connected_integrations = { unavailable: (e as Error).message };
  }

  const payload = {
    export: {
      generatedAt: new Date().toISOString(),
      userId: user.id,
      email: user.email ?? null,
      note:
        'This file contains the personal and health data Shape holds about you. ' +
        'Authentication tokens are excluded for security. Media files (progress ' +
        'photos, voice notes) are referenced by path in the rows above; to receive ' +
        'copies of those files, email privacy@theshapecommunity.com.',
    },
    data,
  };

  const filename = `shape-data-export-${user.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
