import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivityActor = { id: string; email: string };
export type ActivityEntry = {
  action: string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  details?: Record<string, unknown>;
};

export function startActivity(
  db: SupabaseClient,
  actor: ActivityActor,
  entry: ActivityEntry
): Promise<{ id: string; error?: undefined } | { id?: undefined; error: 'missing_migration' | 'not_logged' }>;
export function finishActivity(
  db: SupabaseClient,
  id: string,
  outcome: 'done' | 'failed',
  extra?: { targetEmail?: string | null }
): Promise<void>;
