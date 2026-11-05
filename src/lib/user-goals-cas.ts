// A user_goals document written compare-and-set from a route, on the caller's own session (P7).
//
// The browser's shapeDb.saveUserGoalsIfRev (public/supabase.js, and its twin in the app's
// shapeBackend.js) writes a whole-document kind only when the document still carries the revision its
// read saw, so two devices that each change a copy never lose one change to the other. A route that
// writes one of those documents (the meal-log route's "✓ Logged", the website's day swaps) must keep the
// same contract, or it becomes the one writer that overwrites. This is that writer, for a route:
//   · the revision lives inside the jsonb document (no migration), compared as the RAW `data->>rev`;
//   · update first, insert only when there was no row (getUserGoals reads {} for an absent row AND an
//     empty one, so inserting first would conflict forever on the second);
//   · the `.select()` is load-bearing: PostgREST reports an UPDATE that matched no row as success.
// It runs on the caller's own client (RLS: their own rows only); the account is the session's.

type Res = { data: unknown; error: { message?: string; code?: string } | null };
type Chain = PromiseLike<Res> & {
  select: (cols: string) => Chain;
  eq: (col: string, v: unknown) => Chain;
  is: (col: string, v: null) => Chain;
  maybeSingle: () => PromiseLike<Res>;
};
export type GoalsClient = {
  from: (table: string) => {
    select: (cols: string) => Chain;
    update: (row: Record<string, unknown>) => Chain;
    insert: (row: Record<string, unknown>) => PromiseLike<Res>;
  };
};

export type GoalsDocResult =
  | { ok: true; doc: Record<string, unknown>; unchanged?: boolean }
  | { ok: false; reason: 'unreadable' | 'write-failed' | 'contended' };

export const GOALS_CAS_TRIES = 4;

/** The document's revision, 0 when it has none. */
export function goalsDocRev(raw: unknown): number {
  const r = raw && typeof raw === 'object' ? (raw as { rev?: unknown }).rev : null;
  return typeof r === 'number' && Number.isFinite(r) && r >= 0 ? Math.floor(r) : 0;
}
/** The raw value to compare-and-set on: `data->>'rev'` as Postgres reads it, null when absent. */
export function goalsDocRevToken(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || (raw as { rev?: unknown }).rev == null) return null;
  return String((raw as { rev?: unknown }).rev);
}

/** The caller's document of `kind`: {} when there is none, null when the read failed. */
export async function readGoalsDoc(supabase: GoalsClient, userId: string, kind: string): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.from('user_goals').select('data').eq('user_id', userId).eq('kind', kind).maybeSingle();
    if (error) return null;
    const blob = (data as { data?: unknown } | null)?.data;
    return blob && typeof blob === 'object' && !Array.isArray(blob) ? (blob as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

/** One compare-and-set write: 'ok', 'conflict' (another write got there first) or 'error'. */
export async function saveGoalsDocIfRev(
  supabase: GoalsClient, userId: string, kind: string, data: Record<string, unknown>, expectedRev: string | null,
): Promise<'ok' | 'conflict' | 'error'> {
  try {
    const q = supabase.from('user_goals').update({ data }).eq('user_id', userId).eq('kind', kind);
    const res = expectedRev == null
      ? await q.is('data->>rev', null).select('kind')
      : await q.eq('data->>rev', expectedRev).select('kind');
    if (res.error) return 'error';
    if (Array.isArray(res.data) && res.data.length) return 'ok';
    if (expectedRev != null) return 'conflict';
    const ins = await supabase.from('user_goals').insert({ user_id: userId, kind, data });
    if (!ins.error) return 'ok';
    return ins.error.code === '23505' ? 'conflict' : 'error';
  } catch {
    return 'error';
  }
}

/**
 * Read, change and write the caller's document of `kind`. `change(cur)` returns the new document, or
 * null to write nothing (the answer is then { ok: true, doc: cur, unchanged: true }). A conflict reads
 * again and applies the change to the newer copy. A failed read writes nothing: an empty document saved
 * over a real one would lose it.
 */
export async function writeGoalsDoc(
  supabase: GoalsClient,
  userId: string,
  kind: string,
  change: (cur: Record<string, unknown>) => Record<string, unknown> | null,
  tries = GOALS_CAS_TRIES,
): Promise<GoalsDocResult> {
  for (let i = 0; i < tries; i += 1) {
    const cur = await readGoalsDoc(supabase, userId, kind);
    if (!cur) return { ok: false, reason: 'unreadable' };
    const changed = change(cur);
    if (!changed) return { ok: true, doc: cur, unchanged: true };
    const next = { ...changed, rev: goalsDocRev(cur) + 1 };
    const res = await saveGoalsDocIfRev(supabase, userId, kind, next, goalsDocRevToken(cur));
    if (res === 'conflict') continue;
    if (res === 'error') return { ok: false, reason: 'write-failed' };
    return { ok: true, doc: next };
  }
  return { ok: false, reason: 'contended' };
}
