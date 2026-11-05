// The account's own time zone (P9, owner 2026-11-05: "all time zones should be set by user").
//
// profiles.timezone is the one the person chose in Settings (2026-11-05-account-timezone.sql). The
// database copies it onto their trainers / nutritionists / client_profiles rows, so every reader
// that already reads one of those follows it. These two helpers are the only server code that
// reads or writes it: /api/me/timezone (the setting), /api/client/timezone (an app's first-open
// default) and /api/my-availability (the hours editor, which keeps hours in this zone).
//
// ⚠ PRE-MIGRATION IS `ready: false`, NEVER "NO ZONE". A database without the column answers an
// error naming it. Read as "no zone set", the first-open default would try to write a column that
// isn't there on every open, and the hours editor would lose the zone it stores hours in. Every
// caller keeps its old behaviour while `ready` is false.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeZone } from '@/lib/time';

export type AccountZone = { ready: boolean; zone: string | null };

// `select('*')`, not `select('timezone')`: naming a column PostgREST doesn't know fails the
// whole read, which is the pre-migration case this has to tell apart from a failed read.
export async function readAccountZone(supabase: SupabaseClient, uid: string): Promise<AccountZone & { error: boolean }> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) return { ready: false, zone: null, error: true };
  const row = (data ?? null) as Record<string, unknown> | null;
  if (!row) return { ready: true, zone: null, error: false }; // no profile row yet: nothing set
  if (!('timezone' in row)) return { ready: false, zone: null, error: false };
  return { ready: true, zone: normalizeZone(row.timezone), error: false };
}

export type WriteResult =
  | { ok: true; zone: string; changed: boolean }
  | { ok: false; reason: 'invalid' | 'not_ready' | 'failed' };

/**
 * Sets the account's zone. With `onlyIfUnset`, writes only when none is set yet (an app's first
 * open), and answers the zone that stands either way. The answer is read back, never assumed.
 */
export async function writeAccountZone(
  supabase: SupabaseClient,
  uid: string,
  raw: unknown,
  opts: { onlyIfUnset?: boolean } = {}
): Promise<WriteResult> {
  const zone = normalizeZone(raw);
  if (!zone) return { ok: false, reason: 'invalid' };
  const before = await readAccountZone(supabase, uid);
  if (before.error) return { ok: false, reason: 'failed' };
  if (!before.ready) return { ok: false, reason: 'not_ready' };
  if (before.zone === zone) return { ok: true, zone, changed: false };
  if (opts.onlyIfUnset && before.zone) return { ok: true, zone: before.zone, changed: false };

  let q = supabase.from('profiles').update({ timezone: zone }).eq('id', uid);
  // ⚠ CONDITIONED ON STILL BEING EMPTY, so two first opens racing (the website and the app) can't
  // replace a zone the person chose a moment ago.
  if (opts.onlyIfUnset) q = q.is('timezone', null);
  const { error } = await q;
  if (error) return { ok: false, reason: 'failed' };

  const after = await readAccountZone(supabase, uid);
  if (after.error || !after.ready || !after.zone) return { ok: false, reason: 'failed' };
  return { ok: true, zone: after.zone, changed: after.zone !== before.zone };
}
