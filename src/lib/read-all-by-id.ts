// ⚠ EVERY ROW, A PAGE AT A TIME. One select returns at most 1,000 rows (the API's cap) and says
// nothing when it stops there, so a big roster's workouts and weigh-ins were read short (Codex on
// #2324). Keyset on id, not an offset (cron/guardrail-health says why: a row written mid-read
// shifts every later offset); a read that reaches the ceiling is unknown, not short. `page` builds
// one filtered page: rows after `after`, ordered by id, ROW_PAGE at most.
//
// Shared by the trainer and nutritionist analytics routes, so the two read alike and cannot drift
// (their practice trajectories were one read each, cut at 1,000: Codex, #2394).
export const ROW_PAGE = 1000;
export const ROW_PAGES = 50;
export async function readAllById<T extends { id: unknown }>(
  page: (after: string | null) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const rows: T[] = [];
  let after: string | null = null;
  for (let i = 0; i < ROW_PAGES; i += 1) {
    const { data, error } = await page(after);
    if (error) return { data: null, error };
    const got = (data ?? []) as T[];
    rows.push(...got);
    if (got.length < ROW_PAGE) return { data: rows, error: null };
    after = String(got[got.length - 1].id);
  }
  return { data: null, error: { message: `more than ${ROW_PAGE * ROW_PAGES} rows` } };
}
