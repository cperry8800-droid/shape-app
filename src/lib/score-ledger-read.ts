// Every score_ledger row a member has, read a page at a time.
//
// ⚠ ONE SELECT RETURNS AT MOST 1,000 ROWS (the API's row cap), and a typical member
// passes 1,000 ledger rows in about six months, a heavy one in about four weeks.
// Past that, a single read handed the Standing and the Record an arbitrary, unordered
// 1,000-row subset, so the total, the tier and the history quietly disagreed with the
// spendable balance and the unlocks (which the database sums in full). Paging in a
// stable order (earned_at, then id) reads every row once.
const PAGE = 1000;
const MAX_PAGES = 200; // 200,000 rows: years of a heavy member's ledger

type PageQuery<T> = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      order: (column: string, opts: { ascending: boolean }) => {
        order: (column: string, opts: { ascending: boolean }) => {
          range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
        };
      };
    };
  };
};

export async function readAllLedgerRows<T>(
  supabase: { from: (table: string) => unknown },
  userId: string,
  columns: string,
): Promise<{ rows: T[]; error: unknown }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const q = supabase.from('score_ledger') as PageQuery<T>;
    const { data, error } = await q
      .select(columns)
      .eq('user_id', userId)
      .order('earned_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows, error };
    const got = data || [];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return { rows, error: null };
}
