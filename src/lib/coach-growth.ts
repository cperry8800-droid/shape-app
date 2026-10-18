// Real 90-day growth + marketplace-funnel rollups for the coach dashboards
// (dashboard-v2 step 8). Derived ONLY from data we actually have:
//   - growth: NEW CLIENTS per ISO week (subscriptions.created_at) + the
//     monthly price those clients brought, and the last 30 days against the 30
//     before. This is NOT payout history — the UI labels it as new clients.
//   - funnel: consults (sessions) and the clients who found the coach on Shape
//     over 90d. Profile views aren't tracked anywhere yet → always null (the UI
//     shows an honest "connects soon" state, never an invented number).
//
// ⚠ A NEW CLIENT IS A PERSON WHO STARTED PAYING, ONCE (Business review, 2026-10-17).
// This counted every subscription row created in 90 days: an abandoned checkout
// (`incomplete`, never paid) read as a sign-up, and a client who changed plan read as
// a second one. Now a row that never started is dropped, each client counts once, and
// a client who was already a client when the window opened is not new. One who had left
// and came back is new, whether they left before the window or inside it, as the
// Overview's trajectory counts a return (coach-trajectory.mjs).
//
// ⚠ THE COMPARISON IS OVER EQUAL SPANS. It was this calendar month so far against all
// of last month, so on the 3rd of a month nearly every practice read as shrinking.
// It is now the last 30 days against the 30 before them.
//
// ⚠ THE FUNNEL'S "SIGNED" IS THE CLIENTS WHO FOUND THE COACH ON SHAPE (stored fee
// above 0). A client the coach brought never passed through the marketplace, so
// counting them let "consult → signed" pass 100%.

import type { SupabaseClient } from '@supabase/supabase-js';
import { subEndedAt, subNeverStarted } from '@/lib/coach-trajectory.mjs';

export type CoachGrowth = {
  weeklyAdds: Array<{ weekOf: string; count: number; addedCents: number }>;
  // New clients in the last 30 days against the 30 before, as a percent change;
  // null when there were none in the 30 before (no base to compare with).
  momPct: number | null;
};
export type CoachFunnel = { views: null; consults90: number; signed90: number };

type AddRow = { client_id?: string | null; price_cents?: number | null; created_at?: string | null; status?: string | null; fee_bps?: number | null };

const DAY_MS = 86400000;

function mondayISO(d: Date): string {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

// The rollup itself, from the rows created in the window and, for each client who had a
// subscription before it, when that membership ended (Infinity while it runs). Pure, so
// the counting is tested without a database.
export function growthFrom(rows: AddRow[], { existing = new Map<string, number>(), consults90, now = Date.now() }: { existing?: Map<string, number>; consults90: number; now?: number }): { growth: CoachGrowth; funnel: CoachFunnel } {
  // Each client's first row in the window that became a subscription, oldest first.
  const firsts = new Map<string, AddRow>();
  const until = new Map(existing);
  const sorted = rows.slice().sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)));
  sorted.forEach((r, i) => {
    if (subNeverStarted(r)) return;
    if (!Number.isFinite(Date.parse(String(r.created_at)))) return;
    // A row opened while the client was still a client is a plan change, and carries the
    // membership on to its own end. One opened after it ended is a return, and counts.
    const held = r.client_id != null ? until.get(String(r.client_id)) : undefined;
    if (held != null && Date.parse(String(r.created_at)) <= held) {
      until.set(String(r.client_id), Math.max(held, subEndedAt(r, now) ?? Infinity));
      return;
    }
    // A row with no client_id cannot be matched to anyone, so it stands alone.
    const key = r.client_id != null ? 'c:' + String(r.client_id) : 'row:' + i;
    if (!firsts.has(key)) firsts.set(key, r);
  });
  const adds = [...firsts.values()];

  // 13 weekly buckets, zero-filled so the sparkline never has holes.
  const buckets = new Map<string, { count: number; addedCents: number }>();
  for (let i = 12; i >= 0; i--) buckets.set(mondayISO(new Date(now - i * 7 * DAY_MS)), { count: 0, addedCents: 0 });
  let last30 = 0;
  let prior30 = 0;
  let signed = 0;
  for (const r of adds) {
    const at = Date.parse(String(r.created_at));
    const b = buckets.get(mondayISO(new Date(at)));
    if (b) { b.count += 1; b.addedCents += Number(r.price_cents) || 0; }
    if (at > now - 30 * DAY_MS) last30 += 1;
    else if (at > now - 60 * DAY_MS) prior30 += 1;
    // Found on Shape: the stored fee is above 0 (a row with none was written before BYO
    // existed, when every client paid the standard fee).
    if (r.fee_bps == null || Number(r.fee_bps) > 0) signed += 1;
  }
  const weeklyAdds = [...buckets.entries()].map(([weekOf, b]) => ({ weekOf, ...b }));
  const momPct = prior30 > 0 ? Math.round(((last30 - prior30) / prior30) * 100) : null;
  return {
    growth: { weeklyAdds, momPct },
    funnel: { views: null, consults90, signed90: signed },
  };
}

export async function coachGrowthAndFunnel(
  supabase: SupabaseClient,
  role: 'trainer' | 'nutritionist',
  providerId: number,
  consults90: number
): Promise<{ growth: CoachGrowth; funnel: CoachFunnel }> {
  const since = new Date(Date.now() - 90 * DAY_MS).toISOString();
  // ⚠ A FAILED READ THROWS. Supabase answers { error } instead of throwing, and read as no
  // rows it would say no one joined, or (below) that every returning client is new. The
  // dashboards catch it and show growth and the funnel as unread (Codex, #2394).
  const { data: addRows, error: addError } = await supabase
    .from('subscriptions')
    .select('*') // '*' is migration-safe: an explicit fee_bps errors the query on a pre-migration DB
    .eq('provider_role', role)
    .eq('provider_id', providerId)
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (addError) throw new Error('coach growth: ' + addError.message);
  const rows = (addRows ?? []) as AddRow[];
  // Of the clients with a row in the window, when their membership from before it ended: the
  // latest end of their earlier subscriptions. One that ended before the window opened can't
  // cover a row inside it, so it needs no filter of its own.
  const ids = [...new Set(rows.map((r) => r.client_id).filter((v): v is string => !!v))];
  const existing = new Map<string, number>();
  if (ids.length) {
    const { data: before, error: beforeError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('provider_role', role)
      .eq('provider_id', providerId)
      .lt('created_at', since)
      .in('client_id', ids);
    if (beforeError) throw new Error('coach growth: ' + beforeError.message);
    for (const r of (before ?? []) as AddRow[]) {
      if (subNeverStarted(r) || !r.client_id) continue;
      const ended = subEndedAt(r) ?? Infinity;
      existing.set(String(r.client_id), Math.max(ended, existing.get(String(r.client_id)) ?? -Infinity));
    }
  }
  return growthFrom(rows, { existing, consults90 });
}
