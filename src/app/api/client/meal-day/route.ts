// One day of a member's plan as the account keeps it: that day's swaps and the planned meals already
// logged (P7; owner, 2026-11-05: "the website and app need to fully communicate").
//
// GET  ?date=YYYY-MM-DD
//   -> { ok, date, swap: { '<meal key>': { title, kcal, p, c, f, recipeId? } }, logged: { '<meal key>': true } }
// POST { date, mealId, swap: { title, kcal, p, c, f } | null, today? }   one meal's swap that day, or undone
// POST { date, swaps: { '<meal key>': { … } }, today? }                    several (the website's one-time move)
//   -> { ok, date, swap }
//
// ⚠ THE WEBSITE'S SWAPS LIVE IN THE ACCOUNT NOW, IN THE APP'S OWN STORE. The website kept them in
// localStorage under two keys (Today's `shape.dashMealSwap.<date>`, Nutrition's
// `shape.dashNutriSwap.<date>.<dow>`), so the app, the other page and tonight's prep reminder never saw
// one. A website swap is a swap of one meal on one day, which is exactly the app's day swap
// (`client_meal_days`, mobile-app/src/services/mealDays.mjs), so it is written there, through the same
// validation and on the same compare-and-set revision, and read back by Eat, Home and the prep cron
// (prepAhead.mjs) as they already read it. The `logged` half is the meal-log route's record
// (public/newdesign/mealLogged.mjs), so the website ticks ✓ from the account, not from a device flag.
// A read that fails is an error, never an empty day: a ledger drawn from it would untick meals the
// member logged.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { clientLocalDay } from '@/lib/local-day';
import { requireMembership } from '@/lib/require-membership';
import { readGoalsDoc, writeGoalsDoc, type GoalsClient } from '@/lib/user-goals-cas';
import { BS_MEAL_DAYS_KIND, bsMealDayOf, bsMealDaysSwap } from '../../../../../mobile-app/src/services/mealDays.mjs';
import { BS_MEAL_LOGGED_KIND, bsMealLoggedTicks } from '../../../../../public/newdesign/mealLogged.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
// The most swaps one POST carries (a day holds a plan's meals; the move from localStorage sends a day).
const MAX_SWAPS = 12;

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const asked = new URL(request.url).searchParams.get('date');
  const date = isYmd(asked) ? asked : clientLocalDay(null);
  const supabase = (await clientForRequest(request)) as unknown as GoalsClient;
  const [days, logged] = await Promise.all([
    readGoalsDoc(supabase, user.id, BS_MEAL_DAYS_KIND),
    readGoalsDoc(supabase, user.id, BS_MEAL_LOGGED_KIND),
  ]);
  if (!days || !logged) return NextResponse.json({ error: 'Could not read your day.' }, { status: 502 });
  return NextResponse.json({ ok: true, date, swap: bsMealDayOf(days, date).swap, logged: bsMealLoggedTicks(logged, date) });
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const parsed = await readJson<Record<string, unknown>>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const body = (parsed.data || {}) as Record<string, unknown>;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!isYmd(body.date)) return NextResponse.json({ error: 'A date is required.' }, { status: 400 });
  const date = body.date;
  // The member's own today: a day before it is not planned any more (mealDays prunes it).
  const today = clientLocalDay(body.today);
  if (date < today) return NextResponse.json({ error: 'That day has passed.' }, { status: 400 });

  // One meal (mealId + swap, null to undo) or several (swaps).
  let edits: [string, unknown][] = [];
  if (body.swaps && typeof body.swaps === 'object' && !Array.isArray(body.swaps)) {
    edits = Object.entries(body.swaps as Record<string, unknown>).slice(0, MAX_SWAPS);
  } else if (typeof body.mealId === 'string') {
    edits = [[body.mealId, body.swap === undefined ? null : body.swap]];
  }
  if (!edits.length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  const supabase = (await clientForRequest(request)) as unknown as GoalsClient;
  const res = await writeGoalsDoc(supabase, user.id, BS_MEAL_DAYS_KIND, (cur) => {
    let next: Record<string, unknown> = cur;
    for (const [mealId, swap] of edits) next = bsMealDaysSwap(next, date, mealId, swap, today);
    return next;
  });
  if (!res.ok) {
    const status = res.reason === 'unreadable' ? 502 : res.reason === 'contended' ? 409 : 500;
    return NextResponse.json({ error: 'The swap was not saved. Try again.', reason: res.reason }, { status });
  }
  return NextResponse.json({ ok: true, date, swap: bsMealDayOf(res.doc, date).swap });
}
