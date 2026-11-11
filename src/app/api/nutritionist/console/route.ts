// Live Console persistence for the newdesign Nutritionist "Console" page.
// Mirrors /api/trainer/console with provider_role = 'nutritionist' and
// kind = 'meal'. See that file for the action / response shapes, the client
// names (null when none is on file, `nameUnread` when the read failed), what
// "Logged today" reads, and why a live cue is its own row ('cue').

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { profileNames } from '@/lib/client-names';
import { normalizeZone } from '@/lib/time';
import { memberDay, shiftDay } from '@/lib/workout-days';
import { exerciseReadSince } from '@/lib/coach-exercises';
import { GROCERY_NOTE_MAX, latestGroceryNotes, pushedMealOf } from '@/lib/coach-meals';
import { OPEN_SUB_STATUSES } from '../../../../lib/coach-trajectory.mjs';

export const dynamic = 'force-dynamic';

const ROLE = 'nutritionist' as const;
const KIND = 'meal' as const;
const CUE_MAX = 500;
const RECENT_CLIENT_MS = 60 * 86_400_000; // 60 days = "current"
const TRAJECTORY_DAYS = 90;

function ageFromDob(dob: unknown): number | null {
  if (typeof dob !== 'string' || !dob) return null;
  const t = new Date(dob).getTime();
  if (!Number.isFinite(t)) return null;
  const years = (Date.now() - t) / (365.25 * 86_400_000);
  if (years < 0 || years > 130) return null;
  return Math.floor(years);
}

// Lightweight Shape Score: per-day increment from daily_health_snapshot
// signals. Cumulative across the trajectory window so the chart renders a
// monotonically growing total per client. Mirrors /api/trainer/console.
function dailyShapeScore(row: Record<string, unknown>): number {
  let s = 0;
  if (Number(row.workout_minutes ?? 0) >= 30) s += 10;
  if (Number(row.protein_g ?? 0) >= 100) s += 5;
  if (Number(row.sleep_hours ?? 0) >= 7) s += 3;
  if (Number(row.calories ?? 0) > 0) s += 2;
  return s;
}

type PushedItemRow = {
  id: string;
  client_id: string;
  kind: string;
  payload: Record<string, unknown>;
  sent_at: string;
};

type ConsoleClient = {
  id: string;
  name: string | null;
  nameUnread: boolean;
  status: 'current' | 'past';
  lastAt: string | null;
};

async function getProviderId(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('nutritionists')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

// Fetches the nutritionist's client roster from subscriptions + sessions,
// grouped by client_id with a "current" / "past" status the dropdown groups by.
// "current" = an open subscription (active, trialing or past_due: a renewal Stripe is still
// retrying keeps the client, owner 2026-10-18) OR a session in the last 60 days.
async function fetchClientsForProvider(
  supabase: SupabaseClient,
  providerId: number,
): Promise<ConsoleClient[]> {
  const [subRes, sessRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('client_id, status')
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId),
    supabase
      .from('sessions')
      .select('client_id, client_name, scheduled_at')
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId)
      .order('scheduled_at', { ascending: false })
      .limit(1000),
  ]);

  // `sessionName` is the newest session's client_name (sessions come newest first).
  type Entry = { id: string; sessionName: string | null; status: 'current' | 'past'; lastAt: number | null };
  const byId = new Map<string, Entry>();

  for (const sub of subRes.data ?? []) {
    if (!sub.client_id) continue;
    const e: Entry = byId.get(sub.client_id) ?? { id: sub.client_id, sessionName: null, status: 'past', lastAt: null };
    if (OPEN_SUB_STATUSES.includes(sub.status)) e.status = 'current';
    byId.set(sub.client_id, e);
  }

  const now = Date.now();
  for (const s of sessRes.data ?? []) {
    if (!s.client_id) continue;
    const e: Entry = byId.get(s.client_id) ?? { id: s.client_id, sessionName: null, status: 'past', lastAt: null };
    const booked = typeof s.client_name === 'string' ? s.client_name.trim() : '';
    if (booked && !e.sessionName) e.sessionName = booked;
    const t = new Date(s.scheduled_at).getTime();
    if (e.lastAt == null || t > e.lastAt) e.lastAt = t;
    if (now - t < RECENT_CLIENT_MS && e.status !== 'current') e.status = 'current';
    byId.set(s.client_id, e);
  }

  // The name on the client's profile, else the one their newest session was booked under.
  const { names, unread } = await profileNames(supabase, [...byId.keys()]);
  return [...byId.values()]
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
    .map((e) => {
      const name = names.get(e.id) || e.sessionName || null;
      return { id: e.id, name, nameUnread: !name && unread.has(e.id), status: e.status, lastAt: e.lastAt ? new Date(e.lastAt).toISOString() : null };
    });
}

export async function GET(request: Request) {
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const providerId = await getProviderId(supabase, user.id);
  if (providerId == null) {
    return NextResponse.json({ isNutritionist: false, clients: [], focusByClient: {}, itemsByClient: {}, snapshotByClient: {}, todayByClient: {} });
  }

  const clients = await fetchClientsForProvider(supabase, providerId);
  const now = Date.now();

  // Pull the supporting data for each client in parallel.
  // RLS does the gating: providers_read_subscriber_snapshots covers
  // daily_health_snapshot, providers_read_subscriber_profiles covers
  // client_profiles (added in 2026-05-22-client-profiles-provider-read).
  const snapshotByClient: Record<string, Record<string, unknown>> = {};
  const seriesByClient: Record<string, Record<string, Array<number | null>>> = {};
  const profileByClient: Record<string, { age: number | null; focus: string | null }> = {};
  // What each client logged on THEIR today, never the latest row (see /api/trainer/console).
  const todayByClient: Record<string, { date: string; calories: number | null; protein_g: number | null }> = {};
  let todayUnread = false;
  // ⚠ A FAILED ZONE READ IS UNREAD, NOT UTC (Codex P2 on #2686). A client with no zone on file counts
  // in UTC; a client whose zone could not be read does not, or near midnight their today's log (and the
  // trainer's session list) is read on the wrong date and shown as nothing. src/lib/roster-days.ts falls
  // back to UTC for a 30-day window, where a day's shift moves one end; for "today" it is the answer.
  let zonesUnread = false;
  const zoneByClient = new Map<string, string>();

  if (clients.length > 0) {
    const clientIds = clients.map((c) => c.id);
    const since = new Date(now - TRAJECTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    // Any zone's today is the UTC date or a day either side of it.
    const utcToday = memberDay(now, null) as string;
    const nearDays = [shiftDay(utcToday, -1), utcToday, shiftDay(utcToday, 1)];

    const [snapRes, profRes, todayRes] = await Promise.all([
      supabase
        .from('daily_health_snapshot')
        // `calories` here is calories EATEN, read from dietary_kcal under the name the
        // score below and the live console's snapshotByClient already use; the
        // snapshot's own `calories` column is a device's burn. `workout_minutes` is
        // the score's 10 points (dailyShapeScore), which it scored but never read.
        .select('user_id, snapshot_date, weight_lb, sleep_hours, resting_hr, stress, calories:dietary_kcal, protein_g, hrv_ms, recovery_score, workout_minutes')
        .in('user_id', clientIds)
        .gte('snapshot_date', since)
        .order('snapshot_date', { ascending: true }),
      supabase
        .from('client_profiles')
        .select('user_id, data, timezone')
        .in('user_id', clientIds),
      supabase
        .from('daily_health_snapshot')
        .select('user_id, snapshot_date, calories:dietary_kcal, protein_g')
        .in('user_id', clientIds)
        .in('snapshot_date', nearDays),
    ]);

    // daily_health_snapshot: walk ascending so the LAST row per client is
    // the latest snapshot. Also accumulate per-metric series for trajectory,
    // including a cumulative Shape Score derived per-day.
    const cumScoreByClient: Record<string, number> = {};
    for (const row of snapRes.data ?? []) {
      const uid = row.user_id as string;
      snapshotByClient[uid] = row as Record<string, unknown>;
      const s = (seriesByClient[uid] ??= { weight: [], sleep: [], hr: [], stress: [], protein: [], score: [] });
      s.weight.push(row.weight_lb != null ? Number(row.weight_lb) : null);
      s.sleep.push(row.sleep_hours != null ? Number(row.sleep_hours) : null);
      s.hr.push(row.resting_hr != null ? Number(row.resting_hr) : null);
      s.stress.push(row.stress != null ? Number(row.stress) : null);
      s.protein.push(row.protein_g != null ? Number(row.protein_g) : null);
      cumScoreByClient[uid] = (cumScoreByClient[uid] ?? 0) + dailyShapeScore(row as Record<string, unknown>);
      s.score.push(cumScoreByClient[uid]);
    }

    for (const row of profRes.data ?? []) {
      const uid = row.user_id as string;
      const data = (row.data ?? {}) as Record<string, unknown>;
      profileByClient[uid] = {
        age: ageFromDob(data.dob),
        focus: typeof data.goal === 'string' && data.goal ? data.goal : null,
      };
      const zone = normalizeZone(row.timezone);
      if (zone) zoneByClient.set(uid, zone);
    }

    if (profRes.error) {
      zonesUnread = true;
      console.warn('[shape-app] nutritionist console: client zones read failed — today renders as unread:', profRes.error.message);
    }
    if (todayRes.error || zonesUnread) todayUnread = true;
    if (todayRes.error) {
      console.warn('[shape-app] nutritionist console: today\'s logs read failed — "Logged today" renders as unread:', todayRes.error.message);
    }
    for (const row of zonesUnread ? [] : todayRes.data ?? []) {
      const uid = row.user_id as string;
      if (row.snapshot_date !== memberDay(now, zoneByClient.get(uid) ?? null)) continue;
      todayByClient[uid] = {
        date: String(row.snapshot_date),
        calories: row.calories != null ? Number(row.calories) : null,
        protein_g: row.protein_g != null ? Number(row.protein_g) : null,
      };
    }
  }

  const { data: bannerRows } = await supabase
    .from('coach_focus_banners')
    .select('client_id, text, sent_at')
    .eq('provider_role', ROLE)
    .eq('provider_id', providerId);

  const focusByClient: Record<string, string> = {};
  for (const b of bannerRows ?? []) {
    if (typeof b.client_id === 'string' && typeof b.text === 'string') {
      focusByClient[b.client_id] = b.text;
    }
  }

  // Today's plan: the meals sent on each client's today (src/lib/coach-meals.ts), as the member's Eat
  // day shows them; a meal from another day stays on that day in their Eat week. ⚠ A FAILED READ IS
  // `itemsUnread`, NOT AN EMPTY PLAN (left by #2686): the page would say "Nothing on today's plan" and a
  // coach could add the same meal twice, as the trainer's session list could (Codex P2 on #2686).
  // The grocery note is a standing note, read on its own with no day window; `groceryNoteUnread` is a
  // failed read of it, which the page says rather than showing an empty box to save over.
  const [mealRes, noteRes] = await Promise.all([
    supabase
      .from('coach_pushed_items')
      .select('id, client_id, kind, payload, sent_at')
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId)
      .eq('kind', KIND)
      .is('removed_at', null)
      .gte('sent_at', exerciseReadSince(now, 1))
      .order('sent_at', { ascending: true }),
    supabase
      .from('coach_pushed_items')
      .select('id, client_id, kind, provider_id, payload, sent_at')
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId)
      .eq('kind', 'grocery_note')
      .is('removed_at', null),
  ]);

  const itemsUnread = !!mealRes.error || zonesUnread;
  if (mealRes.error) console.warn('[shape-app] nutritionist console: pushed meals read failed — today\'s plan renders as unread:', mealRes.error.message);
  const itemsByClient: Record<string, Array<Record<string, unknown>>> = {};
  for (const r of (zonesUnread ? [] : mealRes.data ?? []) as PushedItemRow[]) {
    const zone = zoneByClient.get(r.client_id) ?? null;
    const m = pushedMealOf(r, zone);
    if (!m || m.day !== memberDay(now, zone)) continue;
    const list = itemsByClient[r.client_id] ?? [];
    list.push({ id: m.id, name: m.name, time: m.time ?? '—', kcal: m.kcal, protein: m.protein, note: m.note ?? '', ingredients: m.ingredients, alternatives: m.alternatives });
    itemsByClient[r.client_id] = list;
  }

  const groceryNoteUnread = !!noteRes.error;
  if (noteRes.error) console.warn('[shape-app] nutritionist console: grocery notes read failed — the note renders as unread:', noteRes.error.message);
  const groceryNoteByClient: Record<string, string> = {};
  const noteRows = (noteRes.data ?? []) as PushedItemRow[];
  for (const cid of new Set(noteRows.map((r) => r.client_id))) {
    const note = latestGroceryNotes(noteRows.filter((r) => r.client_id === cid)).get(String(providerId));
    if (note) groceryNoteByClient[cid] = note.text;
  }

  return NextResponse.json({
    isNutritionist: true,
    clients,
    focusByClient,
    groceryNoteByClient,
    groceryNoteUnread,
    itemsByClient,
    itemsUnread,
    snapshotByClient,
    todayByClient,
    todayUnread,
    seriesByClient,
    profileByClient,
  });
}

export async function POST(req: Request) {
  const supabase = await clientForRequest(req);
  const user = await currentUser(req);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const providerId = await getProviderId(supabase, user.id);
  if (providerId == null) {
    return NextResponse.json({ error: 'Not a nutritionist.' }, { status: 403 });
  }

  const bodyResult = await readJson<
    | {
        clientId?: unknown;
        action?: unknown;
        text?: unknown;
        payload?: unknown;
        itemId?: unknown;
      }
    | null
  >(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const clientId = String(body?.clientId ?? '').trim();
  const action = String(body?.action ?? '').trim();
  if (!clientId) {
    return NextResponse.json({ error: 'Missing clientId.' }, { status: 400 });
  }

  // IDOR guard (AUTHZ-P2-console-idor): coaching content may only be written for a
  // client this coach ACTIVELY coaches. removeItem is owner+item scoped, so it
  // stays usable even after a subscription lapses. RLS enforces the same on INSERT.
  if (action !== 'removeItem') {
    const { data: onClient, error: gateErr } = await supabase.rpc('is_coach_on_client', {
      p_client_id: clientId,
    });
    if (gateErr) {
      return NextResponse.json({ error: 'Could not verify client access.' }, { status: 500 });
    }
    if (onClient !== true) {
      return NextResponse.json({ error: 'You can only push to your own active clients.' }, { status: 403 });
    }
  }

  if (action === 'focus') {
    const text = String(body?.text ?? '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Focus text is empty.' }, { status: 400 });
    }
    const { error } = await supabase.from('coach_focus_banners').upsert(
      {
        provider_role: ROLE,
        provider_id: providerId,
        client_id: clientId,
        text,
        sent_at: new Date().toISOString(),
      },
      { onConflict: 'provider_role,provider_id,client_id' },
    );
    if (error) return dbError(error, 'nutritionist console write', 400);
    return NextResponse.json({ ok: true });
  }

  // A live cue from the workout panel: a row of its own, never the focus banner (see /api/trainer/console).
  if (action === 'cue') {
    const text = String(body?.text ?? '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Cue text is empty.' }, { status: 400 });
    }
    if (text.length > CUE_MAX) {
      return NextResponse.json({ error: `Keep cues to ${CUE_MAX} characters or fewer.` }, { status: 400 });
    }
    const { error } = await supabase.from('coach_pushed_items').insert({
      provider_role: ROLE,
      provider_id: providerId,
      client_id: clientId,
      kind: 'cue',
      payload: { text },
    });
    if (error) return dbError(error, 'nutritionist console write', 400);
    return NextResponse.json({ ok: true });
  }

  if (action === 'groceryNote') {
    // The note on the client's grocery list (separate from the focus banner). ⚠ THE NEW NOTE FIRST, THEN
    // THE OLD ONES MARKED REMOVED. This deleted every note and then inserted, ignoring the delete's error
    // and with no role filter, so a refused insert (the live kind check refused every one: left by #2686)
    // lost the note that was there and still answered ok. An empty text clears the note.
    const text = String(body?.text ?? '').trim();
    if (text.length > GROCERY_NOTE_MAX) {
      return NextResponse.json({ error: `Keep the grocery note to ${GROCERY_NOTE_MAX} characters or fewer.` }, { status: 400 });
    }
    let keep: string | null = null;
    if (text) {
      const { data, error } = await supabase
        .from('coach_pushed_items')
        .insert({ provider_role: ROLE, provider_id: providerId, client_id: clientId, kind: 'grocery_note', payload: { text } })
        .select('id')
        .single();
      if (error) return dbError(error, 'nutritionist console write', 400);
      keep = String(data.id);
    }
    let older = supabase
      .from('coach_pushed_items')
      .update({ removed_at: new Date().toISOString() })
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId)
      .eq('client_id', clientId)
      .eq('kind', 'grocery_note')
      .is('removed_at', null);
    if (keep) older = older.neq('id', keep);
    const { error: olderErr } = await older;
    // The new note is saved and is the newest, so it is the one the member reads; an old row left
    // behind is only an older note, which every reader passes over (latestGroceryNotes).
    if (olderErr && !keep) return dbError(olderErr, 'nutritionist console write', 400);
    if (olderErr) console.warn('[shape-app] nutritionist console: older grocery notes not marked removed — the newest still wins:', olderErr.message);
    return NextResponse.json({ ok: true });
  }

  if (action === 'addItem') {
    const payload = body?.payload && typeof body.payload === 'object' ? (body.payload as Record<string, unknown>) : null;
    const name = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!payload || !name) {
      return NextResponse.json({ error: 'Meal name is required.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('coach_pushed_items')
      .insert({
        provider_role: ROLE,
        provider_id: providerId,
        client_id: clientId,
        kind: KIND,
        payload,
      })
      .select('id')
      .single();
    if (error) return dbError(error, 'nutritionist console write', 400);
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (action === 'removeItem') {
    const itemId = String(body?.itemId ?? '').trim();
    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId.' }, { status: 400 });
    }
    const { error } = await supabase
      .from('coach_pushed_items')
      .update({ removed_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId);
    if (error) return dbError(error, 'nutritionist console write', 400);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
