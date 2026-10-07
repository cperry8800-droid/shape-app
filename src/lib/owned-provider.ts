// The signed-in coach's own provider row, for the coach-only Schedule routes
// (/api/my-booking-rules, /api/my-time-off; 2026-10-07, "Protect your time").
//
// The same lookup /api/my-availability carries inline, lifted so the two new routes share one
// copy instead of making it three. my-availability keeps its own for now (this change adds
// routes and touches no existing one); moving it onto this is a small change for whoever is
// next in that file.
//
// ⚠ ONE DIFFERENCE, ON PURPOSE: a FAILED read is reported as 'unavailable', not as "this
// account has no provider row". my-availability folds the two together, which turns a database
// blip into "you are not a coach" — for time off, that would answer a coach's vacation list
// with an empty one, and the next save would look like it had nothing to merge with.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeZone } from '@/lib/time';

export type ProviderRole = 'trainer' | 'nutritionist';
export type OwnedProvider = { id: number; timezone: string | null };

/** 'trainer' | 'nutritionist' from a query or body value, or null. */
export function providerRole(raw: unknown): ProviderRole | null {
  const r = String(raw ?? '').trim().toLowerCase();
  return r === 'trainer' || r === 'nutritionist' ? r : null;
}

// ⚠ `select('*')` IS MIGRATION-SAFE AND THAT IS WHY IT IS NOT `select('id, timezone')`.
// Naming a column PostgREST does not know errors the WHOLE query on a database that predates
// 2026-09-11-provider-timezone.sql. The house pattern (my-availability, trainer/dashboard).
export async function resolveOwnedProvider(
  supabase: Pick<SupabaseClient, 'from'>,
  role: ProviderRole,
  userId: string
): Promise<OwnedProvider | null | 'unavailable'> {
  const table = role === 'trainer' ? 'trainers' : 'nutritionists';
  // ⚠ THE LOWEST id, NOT "THE ONLY ROW" (Codex, the review of #2225). `owner_id` is not unique,
  // so an account that owns two rows for one role made `maybeSingle()` error, and every rules
  // and time-off call for that role answered 503 with nothing the caller could send to pick
  // one. Measured 2026-10-07: no real account owns two (the duplicates are the seeded example
  // coaches, which own nothing), but the schema permits it. The lowest id is "the account's
  // primary provider row" — the rule /api/lead-boosts and /api/stripe/connect-account already
  // use — so all three agree on which row an account's settings belong to.
  const { data, error } = await supabase.from(table).select('*').eq('owner_id', userId)
    .order('id', { ascending: true }).limit(1).maybeSingle();
  if (error) return 'unavailable';
  if (!data) return null;
  const row = data as { id: number; timezone?: unknown };
  return { id: row.id, timezone: normalizeZone(row.timezone) };
}

/**
 * Whether a PostgREST error says the table (or function) is not there at all — the state of
 * a database the feature's migration has not been applied to yet. PGRST205 is PostgREST 12's
 * "Could not find the table … in the schema cache", PGRST202 the same for a function, and
 * 42P01 / 42883 are Postgres's own undefined_table / undefined_function, which older
 * PostgREST passes through.
 *
 * ⚠ THIS IS WHAT LETS A DEPLOY LAND BEFORE THE MIGRATION. Every other error is a real failure
 * and is reported as one; only "not set up yet" is answered with defaults, because reading it
 * as an outage would show a coach a scary error for a feature that simply is not switched on.
 */
export function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = String(e.code ?? '');
  if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883') return true;
  return /could not find the (table|function)|relation .* does not exist|schema cache/i.test(String(e.message ?? ''));
}
