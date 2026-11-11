// A nutritionist's meals pushed from the Live console ("+ Add to today's plan") and their grocery note,
// read the same way by the console that wrote them and by the member they were written for.
//
// ⚠ A MEAL BELONGS TO THE MEMBER'S DAY IT WAS SENT ON, as a trainer's exercise does
// (src/lib/coach-exercises.ts): coach_pushed_items has no date column, so a row is "today's" when its
// sent_at falls on today in the member's zone. The console shows a client's today, and
// /api/client/coach-meals the member's last MEAL_DAYS days, so Eat's week can show each day's. Before
// this, /api/client/nutrition sent every meal never removed, from any day, as `todayMeals`, and nothing
// in the app or on the website read it.
//
// A grocery note is one standing note per nutritionist and client (kind 'grocery_note', payload
// { text }): the newest row not removed is the note, and Send replaces it (the older rows are marked
// removed, never deleted, so a failed write never loses the note that was there).
//
// The payload is coach-written JSONB from the console's form ({ name, time, kcal, protein, note,
// ingredients, alternatives }, an empty box saved as '—' or null). It is read as a shape, never
// trusted: only strings and finite numbers become text, and a row without a name is no meal.
import { memberDay } from '@/lib/workout-days';

/** The member days /api/client/coach-meals returns, today included: a Monday-first week reaches six back. */
export const MEAL_DAYS = 7;
export const GROCERY_NOTE_MAX = 1000;

export type PushedMeal = {
  id: string;
  providerId: string;
  name: string;
  time: string | null;
  kcal: number | null;
  protein: number | null;
  note: string | null;
  ingredients: string[];
  alternatives: string[];
  sentAt: string;
  /** The member's date ('YYYY-MM-DD') the coach sent it on. */
  day: string;
};

export type GroceryNote = { id: string; providerId: string; text: string; sentAt: string };

type Row = { id?: unknown; kind?: unknown; provider_id?: unknown; payload?: unknown; sent_at?: unknown };

const text = (v: unknown): string | null => {
  if (typeof v !== 'string' && !(typeof v === 'number' && Number.isFinite(v))) return null;
  const s = String(v).trim();
  return s && s !== '—' && s !== '-' ? s : null;
};
const amount = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter((s): s is string => !!s) : []);
const payloadOf = (row: Row): Record<string, unknown> =>
  row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : {};

/** A coach_pushed_items row as a meal on the member's day in `zone`, or null when it is not one. */
export function pushedMealOf(row: Row | null | undefined, zone: string | null): PushedMeal | null {
  if (!row || row.kind !== 'meal' || row.id == null) return null;
  const p = payloadOf(row);
  const name = text(p.name);
  if (!name) return null;
  const sentAt = typeof row.sent_at === 'string' ? row.sent_at : null;
  const day = sentAt ? memberDay(sentAt, zone) : null;
  if (!sentAt || !day) return null;
  return {
    id: String(row.id),
    providerId: String(row.provider_id ?? ''),
    name,
    time: text(p.time),
    kcal: amount(p.kcal),
    protein: amount(p.protein),
    note: text(p.note),
    ingredients: list(p.ingredients),
    alternatives: list(p.alternatives),
    sentAt,
    day,
  };
}

/** A coach_pushed_items row as a grocery note, or null when it is not one (or says nothing). */
export function groceryNoteOf(row: Row | null | undefined): GroceryNote | null {
  if (!row || row.kind !== 'grocery_note' || row.id == null) return null;
  const t = text(payloadOf(row).text);
  const sentAt = typeof row.sent_at === 'string' ? row.sent_at : null;
  if (!t || !sentAt) return null;
  return { id: String(row.id), providerId: String(row.provider_id ?? ''), text: t, sentAt };
}

/** The newest note of each nutritionist, keyed by provider id, whatever order the rows came in. */
export function latestGroceryNotes(rows: Row[] | null | undefined): Map<string, GroceryNote> {
  const out = new Map<string, GroceryNote>();
  for (const r of rows ?? []) {
    const n = groceryNoteOf(r);
    if (!n) continue;
    const had = out.get(n.providerId);
    if (!had || had.sentAt < n.sentAt) out.set(n.providerId, n);
  }
  return out;
}
