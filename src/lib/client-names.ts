// ⚠ EVERY CLIENT'S NAME, A BATCH OF IDS AT A TIME, AND A NAME THAT COULD NOT BE READ IS SAID SO.
// Both analytics routes read their roster's names in ONE `profiles` select over every client id: it
// stopped at 1,000 rows (the API's cap) with no error, a long id list could pass the URL length
// limit, and a failed read was ignored, so each name fell back to the English "Client" as if none
// were on file (left open by #2394 and #2395). This reads NAME_BATCH ids per request, through the
// caller's own client (RLS: a coach sees the profiles of their active and trialing clients,
// providers_read_subscriber_profiles_base), and says which ids it could not read:
//   names   id → the name on file ('' when the profile has none)
//   unread  the ids whose batch failed: their names went unread, which is not "no name on file"
// An id in neither was read and has no profile the caller can see.
//
// Shared by the trainer and nutritionist analytics routes, so the two read alike and cannot drift
// (as src/lib/read-all-by-id.ts is).
import type { SupabaseClient } from '@supabase/supabase-js';

// About 3.7 KB of uuids in the query string, well inside a URL's limit, and a batch answers one row
// per id, far under the 1,000-row cap.
export const NAME_BATCH = 100;

export async function profileNames(
  supabase: SupabaseClient,
  ids: ReadonlyArray<string | null | undefined>,
): Promise<{ names: Map<string, string>; unread: Set<string> }> {
  const names = new Map<string, string>();
  const unread = new Set<string>();
  const want = [...new Set(ids.filter((id) => id != null && id !== '').map(String))];
  // One batch at a time: a big roster is a few short reads in a row, never a burst of them.
  for (let i = 0; i < want.length; i += NAME_BATCH) {
    const batch = want.slice(i, i + NAME_BATCH);
    const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', batch);
    if (error) {
      console.warn(`[shape-app] client names: a profiles read failed — ${batch.length} names render as unread:`, error.message);
      for (const id of batch) unread.add(id);
      continue;
    }
    for (const r of (data ?? []) as { id: string; full_name: string | null }[]) {
      names.set(String(r.id), String(r.full_name ?? '').trim());
    }
  }
  return { names, unread };
}
