// ⚠ A MEMBER WITH TWO NUTRITIONISTS HAS TWO MENUS, AND THEIR OWN CALENDAR SHOWS BOTH.
// /api/calendar read the member's newest published client_meal_plans row and nothing else, so a
// member coached by two nutritionists saw only whichever pushed a menu last, while each of their
// coaches saw both (get_shared_client_meal_plan, 2026-10-29). The member's own calendar now shows
// the newest published menu of each nutritionist who coaches them now, each named by its
// nutritionist when there is more than one, as a coach's view of them names each.
// Publishing a menu archives that nutritionist's previous one for the client
// (/api/nutritionist/meal-plan), so each nutritionist has one published menu: this reads it.
import type { SupabaseClient } from '@supabase/supabase-js';
import { OPEN_SUB_STATUSES } from '@/lib/coach-trajectory.mjs';

export type MenuRow = {
  id: string;
  title: string;
  week_start: string | null;
  payload: unknown;
  nutritionist_id?: number | string | null;
  created_at?: string | null;
};
export type CalendarMenu = { mp: MenuRow; by: string | null };

export const MENU_COLUMNS = 'id, title, week_start, payload, nutritionist_id, created_at';
// Far past any member's nutritionists; each is one read of one row.
export const MENU_COACHES = 10;

/**
 * The menus on a member's own calendar. `newest` is their newest published menu (the read the
 * calendar already makes), or null.
 *
 * - Each nutritionist who coaches them now (an open subscription: active, trialing or past due)
 *   puts their newest published menu on it, newest first.
 * - With two or more, each is named (`by`) by its nutritionist; one alone is not, as before.
 * - With no current nutritionist's menu, the newest published menu, as before: a member whose
 *   nutritionist has left keeps the menu they were given. A failed subscriptions read does the
 *   same, so a failed read never empties the calendar.
 */
export async function memberMenus(
  supabase: SupabaseClient,
  memberId: string,
  newest: MenuRow | null,
): Promise<CalendarMenu[]> {
  const asBefore: CalendarMenu[] = newest ? [{ mp: newest, by: null }] : [];
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('provider_id')
    .eq('client_id', memberId)
    .eq('provider_role', 'nutritionist')
    .in('status', OPEN_SUB_STATUSES)
    .order('created_at', { ascending: true })
    .limit(MENU_COACHES);
  if (subsError) {
    console.warn('[calendar] the member\'s nutritionists were not read — their newest menu only:', subsError.message);
    return asBefore;
  }
  const ids = [...new Set(((subs ?? []) as { provider_id: number | string | null }[])
    .map((s) => Number(s.provider_id))
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return asBefore;

  const found = (await Promise.all(ids.map(async (id): Promise<MenuRow | null> => {
    // The newest menu overall is already read: it is this nutritionist's newest.
    if (newest && Number(newest.nutritionist_id) === id) return newest;
    const { data, error } = await supabase
      .from('client_meal_plans')
      .select(MENU_COLUMNS)
      .eq('client_id', memberId)
      .eq('nutritionist_id', id)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      console.warn(`[calendar] nutritionist ${id}'s menu was not read:`, error.message);
      return null;
    }
    return ((data ?? []) as MenuRow[])[0] ?? null;
  }))).filter((m): m is MenuRow => !!m);
  if (!found.length) return asBefore;
  found.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  if (found.length === 1) return [{ mp: found[0], by: null }];

  // Two or more: each named, as a coach's view names each (nutritionists are public listings).
  const { data: named, error: namesError } = await supabase
    .from('nutritionists')
    .select('id, name')
    .in('id', found.map((m) => Number(m.nutritionist_id)));
  if (namesError) console.warn('[calendar] the member\'s nutritionists\' names were not read:', namesError.message);
  const nameOf = new Map(((named ?? []) as { id: number | string; name: string | null }[])
    .map((n) => [Number(n.id), String(n.name ?? '').trim()]));
  return found.map((mp) => ({ mp, by: nameOf.get(Number(mp.nutritionist_id)) || null }));
}
