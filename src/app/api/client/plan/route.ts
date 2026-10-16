// Client prescribed plan — assigned training (scheduled client_workouts) and
// the active meal plan (client_meal_plans). Read-only; RLS scopes every row to
// the signed-in user.
//
// Returns raw plan data; the mobile UI derives presentation (titles, accents,
// day labels). When the client has no assigned plan the caller falls back to
// its demo program, so this endpoint never fabricates content.
//
// Auth: cookie session OR Bearer token (the native app sends Bearer).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { requireMembership } from '@/lib/require-membership';
import { supersetKey, blockKind, videoUrl } from '../../../../../public/newdesign/workoutDocument.mjs';
// Relative, as workoutDocument.mjs above: the route's test harnesses resolve a relative module themselves.
import { sharedWeekOneOf } from '../../../../lib/coach-client-legs.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Monday 00:00 of the current week, as 'YYYY-MM-DD'.
function weekStartISO(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const mondayOffset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - mondayOffset);
  return x.toISOString().slice(0, 10);
}

type ExerciseRow = { name?: string; sets?: unknown; reps?: unknown; rest?: unknown; notes?: unknown; load?: unknown; rpe?: unknown; tempo?: unknown; cue?: unknown; group?: unknown; block?: unknown; seg?: unknown; video?: unknown; perSet?: unknown };

type SetTarget = { reps: string; load: string };
// Each set's own target when the coach wrote a ladder (ShapeWorkoutDocument.
// exerciseFromRow resolves it: `{ reps, load }` per set, every weight with its unit).
// ⚠ THE PAYLOAD IS CLIENT-WRITTEN JSONB, so this reads a shape rather than trusting
// one: only strings and numbers become text, at most 50 sets, and anything that is
// not a list is no ladder at all.
// ⚠ NO LENGTH CAP ON AN ENTRY. A set the coach left blank carries the row's own reps
// and load, which pass through whole below (`reps`, `load`), so capping an entry at
// 24 and 40 characters cut "12 each side, 3-sec pause" to "12 each side, 3-sec paus"
// in that set's box: part of a target, shown as the whole of it. It bounded nothing
// the exercise's own fields do not already carry.
const perSetOf = (v: unknown): SetTarget[] | undefined => {
  if (!Array.isArray(v) || !v.length) return undefined;
  const field = (x: unknown) => (typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x)) ? String(x) : '');
  return v.slice(0, 50).map((entry) => {
    const o = entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {};
    return { reps: field(o.reps), load: field(o.load) };
  });
};

const rpeOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 10 ? n : null;
};

function mapExercises(payload: Record<string, unknown> | null): Array<{ name: string; sets: string; reps: string; rest: string; load: string; rpe: number | null; tempo: string; cue: string; group: string; block: string; seg: string; video: unknown; perSet?: SetTarget[] }> {
  const list = Array.isArray(payload?.exercises) ? (payload!.exercises as ExerciseRow[]) : [];
  return list
    .filter((e) => e && (e.name != null))
    .map((e) => ({ e, perSet: perSetOf(e.perSet) }))
    .map(({ e, perSet }) => ({
      name: String(e.name ?? '').trim(),
      sets: e.sets != null ? String(e.sets) : '',
      reps: e.reps != null ? String(e.reps) : '',
      rest: e.rest != null ? String(e.rest) : '',
      load: e.load != null ? String(e.load) : (e.notes != null ? String(e.notes) : ''),
      // The target RPE, as a number, beside the display label that already
      // carries it ("100 kg · RPE 8"). ⚠ An explicit whitelist drops every field
      // it does not name, so a structured prescription that is not listed here
      // never reaches the member — the assignment snapshot has carried `rpe`
      // since RPE became its own axis. The scale is 1–10; anything else is none.
      rpe: rpeOf(e.rpe),
      // Builder fields — the trainer's tempo and verbatim cue ride through
      // untouched so the client card shows exactly what was typed.
      tempo: e.tempo != null ? String(e.tempo) : '',
      cue: e.cue != null ? String(e.cue) : '',
      // ⚠ THE SUPERSET KEY IS DELIVERED UNDER THE DOCUMENT'S OWN KEY RULE, NOT
      // COPIED. `String(e.group)` turned a stray boolean or object into a truthy
      // key ("false", "[object Object]") that every reader then paired on, and
      // passed a legacy "a " through for the player to print as its superset
      // badge. Delivery is one of the places the one rule has to hold, with
      // storage, the labels and the player (the A1/A2 label is derived from
      // this key at render, never stored).
      group: supersetKey(e.group),
      // ⚠ THE COACH'S BLOCK (warmup · main · accessory · finisher), which the assign
      // flow has stamped on every exercise all along and this whitelist dropped — so
      // the app's preview invented "Warm-up / Main set / Cool-down" headings around
      // moves the coach had already sorted. Read under the document's own rule:
      // anything that is not one of the builder's kinds is '' (no block), and an
      // assignment without blocks renders as one plain list.
      block: blockKind(e.block),
      // Self-authored segment row (a run/ride/swim leg or a Hyrox station) — the
      // free descriptor the deck renders in place of a load ("10 mi · Z2").
      seg: e.seg != null ? String(e.seg) : '',
      // The trainer's per-exercise form clip ({url,type,name} from the #1577
      // ＋CLIP rails) rides through untouched — the live session's ▶ How-to
      // chip gates on it (honest-absent when the block carries none).
      video: e.video ?? null,
      // ⚠ THE LADDER IS LISTED OR IT NEVER ARRIVES. This whitelist drops every field
      // it does not name — the same way `rpe` was lost before it was added above — and
      // without `perSet` the player would pre-fill every set with the written-out
      // "8/6/4". Absent (not an empty list) when the coach wrote straight sets.
      ...(perSet ? { perSet } : {}),
    }));
}

// Self-program stamp ({ id, name, week, day, weeks, runId }) — the deck groups /
// labels a materialized block with it.
function mapProgram(payload: Record<string, unknown> | null): { id: string; name: string; week: number | null; day: number | null; weeks: number | null; runId: string } | null {
  const p = payload?.program;
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  return {
    id: String(o.id ?? ''),
    name: String(o.name ?? ''),
    week: Number(o.week) || null,
    day: o.day != null && Number.isFinite(Number(o.day)) ? Number(o.day) : null,
    weeks: Number(o.weeks) || null,
    runId: String(o.runId ?? ''),
  };
}

// Weekly-repeat weekdays (0=Mon..6=Sun) for a self session that recurs each week.
function mapRepeatDow(payload: Record<string, unknown> | null): number[] | null {
  const r = payload?.repeatDow;
  if (!Array.isArray(r)) return null;
  const dows = r.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return dows.length ? dows : null;
}

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const weekStart = weekStartISO();

  // ── Training: assigned + self-authored workouts. ──
  // WINDOW the dated rows to this-week-forward OR undated (weekly-repeat + not-
  // yet-scheduled), and sort NULLS FIRST so the undated repeat rows always
  // survive the 60-row cap. A 26-week program has up to 182 future dated rows;
  // with nulls first + ascending dates, the order is [repeats, this-week,
  // early-future…], so the current week + repeats are never crowded out by a
  // long block's later weeks. (this-week-forward, not this-week-only, so a coach
  // plan that starts next week still reads as hasPlan — no false Build door.)
  const { data: cwRows } = await supabase
    .from('client_workouts')
    .select('id, title, description, kind, payload, scheduled_date, created_at, trainer_id')
    .eq('client_id', user.id)
    .eq('status', 'published')
    .or(`scheduled_date.gte.${weekStart},scheduled_date.is.null`)
    .order('scheduled_date', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(60);

  const workouts = (cwRows ?? []).map((w) => {
    const payload = (w.payload && typeof w.payload === 'object') ? (w.payload as Record<string, unknown>) : null;
    const durationRaw = payload?.duration;
    const durMatch = durationRaw != null ? String(durationRaw).match(/\d+/) : null;
    const timeRaw = payload?.time != null ? String(payload.time) : '';
    return {
      id: w.id,
      title: w.title,
      description: w.description ?? '',
      kind: w.kind,
      // Self-authored (member-built) when there's no coach behind the row.
      selfAuthored: w.trainer_id === null,
      // The trainer who wrote it, by name (filled below): a member may pay two (owner, 2026-10-16), so
      // the plan-level `coach` cannot credit every workout. Null for their own, or a name not read.
      coach: null as string | null,
      // Adjust-regeneration generation stamp (spec #1707) — the deck skips
      // display-time scaling for rows the regeneration already rewrote.
      adjustGen: Number((payload as Record<string, unknown> | null)?.adjustGen) || null,
      program: mapProgram(payload),
      repeatDow: mapRepeatDow(payload),
      scheduledDate: w.scheduled_date ?? null,
      time: /^\d{1,2}:\d{2}$/.test(timeRaw) ? timeRaw : null,
      durationMin: durMatch ? Number(durMatch[0]) : null,
      playlist: payload?.playlist && typeof payload.playlist === 'object'
        ? { name: String((payload.playlist as Record<string, unknown>).name ?? ''), meta: String((payload.playlist as Record<string, unknown>).meta ?? '') }
        : null,
      // Builder snapshot stamp ({id, name, version, week, day}) — the client
      // Workouts tab groups the program into weeks with it.
      template: payload?.template && typeof payload.template === 'object'
        ? {
            id: String((payload.template as Record<string, unknown>).id ?? ''),
            name: String((payload.template as Record<string, unknown>).name ?? ''),
            version: Number((payload.template as Record<string, unknown>).version) || null,
            week: Number((payload.template as Record<string, unknown>).week) || null,
            day: Number((payload.template as Record<string, unknown>).day) || null,
          }
        : null,
      exercises: mapExercises(payload),
      video: videoUrl(payload?.video),
      programVideo: videoUrl(payload?.programVideo),
    };
  });

  // ── Meals: the most recent published weekly menu. ──
  const { data: mpRows } = await supabase
    .from('client_meal_plans')
    .select('id, title, week_start, payload, created_at, nutritionist_id')
    .eq('client_id', user.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1);

  const mp = (mpRows ?? [])[0] ?? null;

  // Coach Adjust target override (client_programs.detail.nutrition) — the
  // mobile Eat hero already reads it directly; exposing it here closes the
  // website half of the drift (spec #1707 companion fix).
  const { data: progRow } = await supabase
    .from('client_programs')
    .select('detail')
    .eq('user_id', user.id)
    .maybeSingle();
  const nutriDetail = (progRow?.detail as Record<string, unknown> | null)?.nutrition as Record<string, unknown> | undefined;
  // A partial/invalid override must return null, never fabricated zeroes —
  // every field validates as a finite non-negative number or the override
  // doesn't exist (the honest-absent contract).
  const asTarget = (value: unknown): number | null => {
    if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const tKcal = asTarget(nutriDetail?.calories);
  const tP = asTarget(nutriDetail?.protein);
  const tC = asTarget(nutriDetail?.carbs);
  const tF = asTarget(nutriDetail?.fat);
  const coachTargets = tKcal != null && tKcal > 0 && tP != null && tC != null && tF != null
    ? {
        kcal: tKcal,
        p: tP,
        c: tC,
        f: tF,
        updatedAt: typeof nutriDetail?.updatedAt === 'string' ? nutriDetail.updatedAt : null,
      }
    : null;
  const mealDays = mp && mp.payload && Array.isArray((mp.payload as Record<string, unknown>).days)
    ? (mp.payload as Record<string, unknown>).days
    : [];

  // ⚠ A MEMBER MAY PAY TWO COACHES OF ONE ROLE (owner, 2026-10-16: "members can have multiple coaches
  // if they choose to"). Read every active subscription; `coaching` per discipline names them all.
  const { data: subRows, error: subErr } = await supabase
    .from('subscriptions')
    .select('provider_role, provider_id, created_at')
    .eq('client_id', user.id)
    .in('status', ['active', 'trialing']);
  type Sub = { provider_role: string; provider_id: number; created_at: string | null };
  // One row per listing (its earliest live subscription), the earliest first.
  const subsOf = (role: 'trainer' | 'nutritionist'): Sub[] => {
    const byListing = new Map<string, Sub>();
    for (const r of (subRows ?? []) as Sub[]) {
      if (r.provider_role !== role) continue;
      const prev = byListing.get(String(r.provider_id));
      if (!prev || String(r.created_at || '') < String(prev.created_at || '')) byListing.set(String(r.provider_id), r);
    }
    return [...byListing.values()].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  };
  const trainerSubs = subsOf('trainer');
  const nutriSubs = subsOf('nutritionist');

  // ── Coach attribution: resolve the provider names (public-read marketplace rows) so the client UI
  // credits the real coach, not the demo: every trainer behind a workout and every coach they pay. ──
  const trainerIds = [...new Set([
    ...(cwRows ?? []).map((w) => w.trainer_id).filter((id): id is number => id != null),
    ...trainerSubs.map((r) => r.provider_id),
  ].map(Number))];
  const nutriIds = [...new Set([
    ...(mp?.nutritionist_id != null ? [mp.nutritionist_id] : []),
    ...nutriSubs.map((r) => r.provider_id),
  ].map(Number))];
  const [trNames, nuNames] = await Promise.all([
    trainerIds.length ? supabase.from('trainers').select('id, name').in('id', trainerIds) : Promise.resolve({ data: [] }),
    nutriIds.length ? supabase.from('nutritionists').select('id, name').in('id', nutriIds) : Promise.resolve({ data: [] }),
  ]);
  const nameMap = (res: { data: unknown }) =>
    new Map(((res.data ?? []) as Array<{ id: number; name: string | null }>).map((r) => [String(r.id), r.name ?? null]));
  const trainerName = nameMap(trNames);
  const nutriName = nameMap(nuNames);
  const trainerByWorkout = new Map((cwRows ?? []).map((w) => [w.id, w.trainer_id]));
  for (const w of workouts) {
    const id = trainerByWorkout.get(w.id);
    w.coach = id != null ? trainerName.get(String(id)) ?? null : null;
  }
  // The plan-level name stays the first coached workout's trainer, as it was.
  const trainerId = (cwRows ?? []).find((w) => w.trainer_id != null)?.trainer_id ?? null;
  const trName = trainerId != null ? trainerName.get(String(trainerId)) ?? null : null;
  const nuName = mp?.nutritionist_id != null ? nutriName.get(String(mp.nutritionist_id)) ?? null : null;

  // ⚠ A COACHED MEMBER WITH NO PLAN YET WAS TOLD "NO COACH REQUIRED" (client-onboarding review, M16).
  // The plan was the only coach signal here, so between subscribing and week 1 the member read "No
  // plan yet", "Find a trainer" and a first check-in about a plan that did not exist. `coaching` is
  // the coaches they pay, per discipline, by their own active subscriptions: `coaches` names every one
  // with the thread to message them in, `name` / `conversationId` are the earliest's, and `weekOne` is
  // the week-one target one of them set (client_programs.detail[discipline].weekOne, fix 4), with
  // `setBy` naming who. Null when they have no such coach; the key is omitted when the read failed,
  // so the app can tell "no coach" from "could not tell".
  const { data: convRows, error: convErr } = trainerSubs.length || nutriSubs.length
    ? await supabase.from('conversations').select('id, provider_role, provider_id').eq('client_id', user.id).eq('kind', 'direct').not('provider_role', 'is', null)
    : { data: [], error: null };
  if (convErr) console.error('[client/plan] coach thread read failed:', convErr.message);
  const threadOf = (role: string, providerId: number) =>
    ((convRows ?? []) as Array<{ id: string; provider_role: string | null; provider_id: number | null }>)
      .find((c) => c.provider_role === role && String(c.provider_id) === String(providerId))?.id ?? null;
  const coachingFor = (role: 'trainer' | 'nutritionist') => {
    const subs = role === 'trainer' ? trainerSubs : nutriSubs;
    if (!subs.length) return null;
    const names = role === 'trainer' ? trainerName : nutriName;
    const coaches = subs.map((sub) => ({
      providerId: sub.provider_id,
      name: names.get(String(sub.provider_id)) ?? null,
      conversationId: threadOf(role, sub.provider_id),
    }));
    // The target one of them set during their own subscription (Codex on #2378: the section outlives a
    // change of coach, and an earlier run's target is not this one's); the section is shared, so it is
    // whichever of the coaches they pay now set it last.
    const w = sharedWeekOneOf(progRow?.detail ?? null, role === 'trainer' ? 'training' : 'nutrition',
      subs.map((sub) => ({ providerId: sub.provider_id, since: sub.created_at })), null);
    return {
      name: coaches[0].name,
      conversationId: coaches[0].conversationId,
      coaches,
      weekOne: w
        ? { count: w.count, startsOn: w.startsOn, setBy: coaches.find((c) => String(c.providerId) === String(w.providerId))?.name ?? null }
        : null,
    };
  };
  const [trainerCoaching, nutritionCoaching] = subErr
    ? [undefined, undefined]
    : [coachingFor('trainer'), coachingFor('nutritionist')];

  return NextResponse.json({
    ok: true,
    weekStart,
    training: {
      hasPlan: workouts.length > 0,
      coach: trName,
      workouts,
      ...(trainerCoaching === undefined ? {} : { coaching: trainerCoaching }),
    },
    meals: {
      hasPlan: Array.isArray(mealDays) && mealDays.length > 0,
      title: mp?.title ?? null,
      coach: nuName,
      weekStart: mp?.week_start ?? null,
      days: mealDays,
      // The nutritionist's live Adjust targets — when present these are the
      // CURRENT prescription and outrank the menu's authored day targets.
      coachTargets,
      ...(nutritionCoaching === undefined ? {} : { coaching: nutritionCoaching }),
    },
  });
}
