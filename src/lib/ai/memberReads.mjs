// Nora's READ tools — what she can look up about a member on request.
//
// Every function takes the CALLER's own Supabase client (request-scoped, RLS
// authoritative) and a user id, and returns a compact, model-ready record.
// Plain ESM with the supabase client injected, so node:test drives the exact
// logic the chat route runs against a table-driven fake.
//
// Three rules, all inherited from memberContext.mjs:
//   • Honest absence: a field renders only when its data exists — a missing
//     number is absent, never 0 (absent ≠ 0). An `ok:false` result means the
//     PRIMARY read itself failed, so the tool can say "I can't see that right
//     now" instead of "you have nothing" — those are different claims.
//   • Member-authored strings (titles, notes, habit names) are DATA. They are
//     clipped, never interpreted; the prompt header tells the model the same.
//   • Days are UTC calendar days (`toISOString().slice(0,10)`), the same key
//     log_meal writes the snapshot under — one clock for the whole rail.
//
// The caps below bound what one tool call can put into the prompt: GPT-6
// Astra bills input by the token, and a member with a 26-week program does
// not need every session of it quoted to answer "what's on today".

import { matchNamed } from './memberTools.mjs';

export const READ_CAPS = Object.freeze({
  workouts: 12, exercises: 10, sessions: 8, movesPerSession: 5,
  ledger: 8, reminders: 12, habits: 20, meals: 8, coaching: 5, roster: 60,
});

const num = (v) => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? null : n; };
const posNum = (v) => { const n = num(v); return n != null && n > 0 ? n : null; };
const str = (v, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);
// A field the app writes as EITHER a number or a string ("4", 4, "185 lb").
const txt = (v, max = 120) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : str(v, max));
// The leading number of a free-text figure ("60 kg" → 60); null when there is none.
const lead = (v) => { if (typeof v === 'number') return Number.isFinite(v) ? v : null; const m = String(v ?? '').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
const round1 = (n) => Math.round(n * 10) / 10;
const avg = (xs) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
export function addDaysISO(iso, n) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); }
/** 0 = Monday … 6 = Sunday — the app's convention (plan route `repeatDow`, dashClient `dow`). */
export function dowMon0(iso) { return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; }
export function weekStartISO(iso) { return addDaysISO(iso, -dowMon0(iso)); }
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// One read → { ok, data }. A PostgREST error or a throw is ok:false; an empty
// result is ok:true with data null/[] — the distinction the tools report.
async function leg(promise) {
  try {
    const r = await promise;
    if (r && r.error) return { ok: false, data: null };
    return { ok: true, data: r ? r.data ?? null : null };
  } catch {
    return { ok: false, data: null };
  }
}

// ─── training plan ───────────────────────────────────────────────────────────

function exerciseLine(e) {
  if (!e || typeof e !== 'object') return null;
  const name = str(e.name, 60);
  if (!name) return null;
  const sets = txt(e.sets, 8), reps = txt(e.reps, 12), load = txt(e.load ?? e.notes, 40), seg = txt(e.seg, 40);
  const scheme = [sets, reps].filter(Boolean).join(' × ') || null;
  return { name, ...(scheme ? { scheme } : {}), ...(load ? { load } : {}), ...(seg ? { seg } : {}) };
}

function workoutRecord(w, today) {
  const payload = w.payload && typeof w.payload === 'object' ? w.payload : {};
  const exercises = (Array.isArray(payload.exercises) ? payload.exercises : []).map(exerciseLine).filter(Boolean).slice(0, READ_CAPS.exercises);
  const repeat = Array.isArray(payload.repeatDow) ? payload.repeatDow.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  const durMatch = payload.duration != null ? String(payload.duration).match(/\d+/) : null;
  const time = payload.time != null && /^\d{1,2}:\d{2}$/.test(String(payload.time)) ? String(payload.time) : null;
  const program = payload.program && typeof payload.program === 'object' ? payload.program : null;
  const scheduledDate = str(w.scheduled_date, 10);
  const isToday = scheduledDate === today || (!scheduledDate && repeat.includes(dowMon0(today)));
  return {
    title: str(w.title, 80) || 'Workout',
    ...(scheduledDate ? { scheduledDate } : {}),
    ...(repeat.length ? { repeats: repeat.map((n) => DAY_NAMES[n]) } : {}),
    ...(time ? { time } : {}),
    ...(durMatch ? { durationMin: Number(durMatch[0]) } : {}),
    ...(program && str(program.name, 60) ? { program: { name: str(program.name, 60), ...(posNum(program.week) ? { week: posNum(program.week) } : {}), ...(posNum(program.weeks) ? { weeks: posNum(program.weeks) } : {}) } } : {}),
    fromCoach: w.trainer_id != null,
    today: isToday,
    ...(exercises.length ? { exercises } : {}),
  };
}

function mealLine(m) {
  if (!m || typeof m !== 'object') return null;
  const title = str(m.title, 80);
  if (!title) return null;
  return {
    ...(str(m.slot, 24) ? { slot: str(m.slot, 24) } : {}),
    ...(str(m.time, 12) ? { time: str(m.time, 12) } : {}),
    title,
    ...(num(m.kcal) != null ? { kcal: Math.round(num(m.kcal)) } : {}),
    ...(num(m.p) != null ? { proteinG: Math.round(num(m.p)) } : {}),
    ...(num(m.c) != null ? { carbsG: Math.round(num(m.c)) } : {}),
    ...(num(m.f) != null ? { fatG: Math.round(num(m.f)) } : {}),
  };
}

/** The day of a weekly menu that applies to `dow` — the client dashboard's own rule
 * (explicit `dow` wins; undated days fill the remaining slots in order). */
export function mealDayFor(days, dow) {
  const byDow = {}; const seq = [];
  for (const d of Array.isArray(days) ? days : []) {
    if (d && Number.isInteger(d.dow) && d.dow >= 0 && d.dow <= 6 && byDow[d.dow] == null) byDow[d.dow] = d; else if (d) seq.push(d);
  }
  for (let i = 0; i < 7 && seq.length; i++) if (byDow[i] == null) byDow[i] = seq.shift();
  return byDow[dow] || null;
}

/**
 * The member's plan: this week's assigned + self-authored workouts (what's on
 * today, what's on this week) and today's meals off the active menu.
 */
export async function readTrainingPlan(sb, uid, { now = new Date() } = {}) {
  const today = isoDay(now);
  const weekStart = weekStartISO(today);
  const [cw, mp] = await Promise.all([
    leg(sb.from('client_workouts').select('id, title, description, kind, payload, scheduled_date, trainer_id')
      .eq('client_id', uid).eq('status', 'published')
      .or(`scheduled_date.gte.${weekStart},scheduled_date.is.null`)
      .order('scheduled_date', { ascending: true, nullsFirst: true }).order('created_at', { ascending: false }).limit(60)),
    leg(sb.from('client_meal_plans').select('title, week_start, payload, nutritionist_id')
      .eq('client_id', uid).eq('status', 'published').order('created_at', { ascending: false }).limit(1)),
  ]);
  if (!cw.ok && !mp.ok) return { ok: false };
  const out = { ok: true, today, weekStart, weekEnd: addDaysISO(weekStart, 6) };

  if (cw.ok) {
    const rows = Array.isArray(cw.data) ? cw.data : [];
    const all = rows.map((w) => workoutRecord(w, today));
    const weekEnd = addDaysISO(weekStart, 6);
    const thisWeek = all.filter((w) => !w.scheduledDate || (w.scheduledDate >= weekStart && w.scheduledDate <= weekEnd));
    const later = all.length - thisWeek.length;
    out.training = {
      hasPlan: all.length > 0,
      todays: thisWeek.filter((w) => w.today).map((w) => w.title),
      thisWeek: thisWeek.slice(0, READ_CAPS.workouts),
      ...(thisWeek.length > READ_CAPS.workouts ? { thisWeekTruncated: thisWeek.length - READ_CAPS.workouts } : {}),
      ...(later > 0 ? { laterWeeks: later } : {}),
    };
    const coachRow = rows.find((w) => w.trainer_id != null);
    if (coachRow) {
      const tr = await leg(sb.from('trainers').select('name').eq('id', coachRow.trainer_id).maybeSingle());
      const name = tr.ok && tr.data ? str(tr.data.name, 60) : null;
      if (name) out.training.coach = name;
    }
  } else {
    out.training = { unavailable: true };
  }

  if (mp.ok) {
    const plan = Array.isArray(mp.data) ? mp.data[0] : mp.data;
    if (plan) {
      const payload = plan.payload && typeof plan.payload === 'object' ? plan.payload : {};
      const day = mealDayFor(payload.days, dowMon0(today));
      const meals = day && Array.isArray(day.meals) ? day.meals.map(mealLine).filter(Boolean).slice(0, READ_CAPS.meals) : [];
      const t = day && day.targets && typeof day.targets === 'object' ? day.targets : null;
      out.meals = {
        hasPlan: Array.isArray(payload.days) && payload.days.length > 0,
        ...(str(plan.title, 80) ? { title: str(plan.title, 80) } : {}),
        ...(str(plan.week_start, 10) ? { weekStart: str(plan.week_start, 10) } : {}),
        todays: meals,
        ...(t && posNum(t.cal) ? { dayTargets: { kcal: Math.round(posNum(t.cal)), ...(num(t.p) != null ? { proteinG: Math.round(num(t.p)) } : {}), ...(num(t.c) != null ? { carbsG: Math.round(num(t.c)) } : {}), ...(num(t.f) != null ? { fatG: Math.round(num(t.f)) } : {}) } } : {}),
      };
      if (plan.nutritionist_id != null) {
        const nu = await leg(sb.from('nutritionists').select('name').eq('id', plan.nutritionist_id).maybeSingle());
        const name = nu.ok && nu.data ? str(nu.data.name, 60) : null;
        if (name) out.meals.coach = name;
      }
    } else {
      out.meals = { hasPlan: false, todays: [] };
    }
  } else {
    out.meals = { unavailable: true };
  }
  return out;
}

// ─── recent training ─────────────────────────────────────────────────────────

// The load a set actually carried, with the unit the LOG stated — never a
// unit the reader guessed. A set with no stated unit renders "135 × 8".
function setLoad(row) {
  const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const pos = (v) => { const n = lead(v); return n != null && n > 0 ? n : null; };
  const load = posNum(row.actual_load) ?? pos(p.actualLoad) ?? pos(p.load);
  const reps = posNum(row.actual_reps) ?? pos(p.actualReps) ?? pos(p.reps);
  const stated = str(p.loadUnit ?? p.load_unit ?? p.unit ?? row.load_unit, 6);
  const raw = String(p.actualLoad ?? p.load ?? '');
  const unit = stated ? stated.toLowerCase() : /\bkg\b/i.test(raw) ? 'kg' : /\b(lb|lbs)\b/i.test(raw) ? 'lb' : null;
  return { load, reps, unit };
}

export function movesForSession(setRows) {
  const byMove = new Map();
  for (const r of Array.isArray(setRows) ? setRows : []) {
    if (r.completed === false) continue;
    const name = str(r.move_name, 60);
    if (!name) continue;
    const m = byMove.get(name) || { name, sets: 0, best: null, bestVol: -1 };
    m.sets += 1;
    const { load, reps, unit } = setLoad(r);
    if (load != null && reps != null && load * reps > m.bestVol) {
      m.bestVol = load * reps;
      m.best = `${load}${unit ? ` ${unit}` : ''} × ${reps}`;
    } else if (load == null && reps != null && m.best == null) {
      m.best = `${reps} reps`;
    }
    byMove.set(name, m);
  }
  return [...byMove.values()].sort((a, b) => b.bestVol - a.bestVol).slice(0, READ_CAPS.movesPerSession).map(({ name, sets, best }) => ({ name, sets, ...(best ? { best } : {}) }));
}

/** The last few completed sessions with the top sets logged in each. */
export async function readRecentTraining(sb, uid, { now = new Date(), limit = READ_CAPS.sessions } = {}) {
  const sess = await leg(sb.from('workout_sessions').select('id, title, activity_type, started_at, ended_at, created_at, duration_seconds')
    .eq('client_id', uid).eq('status', 'completed').order('created_at', { ascending: false }).limit(limit));
  if (!sess.ok) return { ok: false };
  const rows = Array.isArray(sess.data) ? sess.data : [];
  const ids = rows.map((r) => r.id).filter(Boolean);
  const sets = ids.length
    ? await leg(sb.from('workout_set_logs').select('session_id, move_name, actual_load, actual_reps, load_unit, completed, payload').in('session_id', ids).order('move_index', { ascending: true }).order('set_number', { ascending: true }))
    : { ok: true, data: [] };
  const bySession = new Map();
  for (const r of Array.isArray(sets.data) ? sets.data : []) {
    const k = String(r.session_id);
    if (!bySession.has(k)) bySession.set(k, []);
    bySession.get(k).push(r);
  }
  const weekAgo = new Date(now).getTime() - 7 * 86_400_000;
  const at = (r) => r.started_at || r.ended_at || r.created_at || null;
  const sessions = rows.map((r) => {
    const when = at(r);
    const moves = movesForSession(bySession.get(String(r.id)) || []);
    const mins = posNum(r.duration_seconds) ? Math.round(posNum(r.duration_seconds) / 60) : null;
    return {
      title: str(r.title, 80) || 'Workout',
      ...(str(r.activity_type, 24) ? { activity: str(r.activity_type, 24) } : {}),
      ...(when ? { on: isoDay(when) } : {}),
      ...(mins ? { durationMin: mins } : {}),
      ...(moves.length ? { moves } : {}),
    };
  });
  const last7 = rows.filter((r) => at(r) && new Date(at(r)).getTime() >= weekAgo).length;
  return { ok: true, sessions, completedLast7Days: last7, ...(sets.ok ? {} : { setsUnavailable: true }) };
}

// ─── week summary ────────────────────────────────────────────────────────────

/**
 * The last seven days in numbers: nutrition logged, training, sleep and
 * recovery from the daily snapshot, the weigh-in trend, and habit completion.
 * Every average is over the days that carry the value — never zero-filled.
 */
export async function readWeekSummary(sb, uid, { now = new Date() } = {}) {
  const today = isoDay(now);
  const since = addDaysISO(today, -6);
  const [snap, weigh, habits, done] = await Promise.all([
    leg(sb.from('daily_health_snapshot').select('snapshot_date, calories, protein_g, carbs_g, fat_g, hydration_l, workout_minutes, sleep_hours, recovery_score, resting_hr, hrv_ms, strain')
      .eq('user_id', uid).gte('snapshot_date', since).lte('snapshot_date', today).order('snapshot_date', { ascending: true })),
    leg(sb.from('client_weigh_ins').select('weight, unit, logged_on').eq('user_id', uid).order('logged_on', { ascending: false }).limit(2)),
    leg(sb.from('user_habits').select('id').eq('user_id', uid).is('archived_at', null)),
    leg(sb.from('user_habit_completions').select('habit_id, done_on').eq('user_id', uid).gte('done_on', since).lte('done_on', today)),
  ]);
  if (!snap.ok) return { ok: false };
  const rows = Array.isArray(snap.data) ? snap.data : [];
  const col = (k, pred = (n) => n != null) => rows.map((r) => num(r[k])).filter((n) => n != null && pred(n));
  const logged = rows.filter((r) => num(r.calories) != null);
  const out = {
    ok: true, since, until: today,
    nutrition: {
      daysLogged: logged.length,
      ...(logged.length ? { avgKcal: Math.round(avg(logged.map((r) => num(r.calories)))) } : {}),
      ...(col('protein_g').length ? { avgProteinG: Math.round(avg(col('protein_g'))) } : {}),
      ...(col('carbs_g').length ? { avgCarbsG: Math.round(avg(col('carbs_g'))) } : {}),
      ...(col('fat_g').length ? { avgFatG: Math.round(avg(col('fat_g'))) } : {}),
      ...(col('hydration_l').length ? { avgHydrationL: avg(col('hydration_l')) } : {}),
    },
    training: {
      trainedDays: col('workout_minutes', (n) => n > 0).length,
      workoutMinutes: Math.round(col('workout_minutes').reduce((a, b) => a + b, 0)),
      ...(col('strain').length ? { avgStrain: avg(col('strain')) } : {}),
    },
    recovery: {
      ...(col('sleep_hours').length ? { avgSleepHours: avg(col('sleep_hours')), sleepNights: col('sleep_hours').length } : {}),
      ...(col('recovery_score').length ? { avgRecovery: Math.round(avg(col('recovery_score'))) } : {}),
      ...(col('resting_hr').length ? { avgRestingHr: Math.round(avg(col('resting_hr'))) } : {}),
      ...(col('hrv_ms').length ? { avgHrvMs: Math.round(avg(col('hrv_ms'))) } : {}),
    },
  };
  if (!Object.keys(out.recovery).length) delete out.recovery;
  if (weigh.ok) {
    const w = (Array.isArray(weigh.data) ? weigh.data : []).filter((r) => posNum(r.weight) && str(r.unit, 4));
    if (w.length) {
      const latest = { weight: posNum(w[0].weight), unit: str(w[0].unit, 4), on: str(w[0].logged_on, 10) };
      out.weight = { latest };
      if (w[1] && str(w[1].unit, 4) === latest.unit) {
        out.weight.previous = { weight: posNum(w[1].weight), unit: latest.unit, on: str(w[1].logged_on, 10) };
        out.weight.change = round1(latest.weight - posNum(w[1].weight));
      }
    }
  } else {
    out.weight = { unavailable: true };
  }
  if (habits.ok && done.ok) {
    const total = (Array.isArray(habits.data) ? habits.data : []).length;
    if (total > 0) out.habits = { active: total, completions7d: (Array.isArray(done.data) ? done.data : []).length, possible7d: total * 7 };
  }
  return out;
}

// ─── habits ──────────────────────────────────────────────────────────────────

export function habitStreak(dates, today) {
  const set = new Set(dates);
  let cursor = set.has(today) ? today : addDaysISO(today, -1);
  let streak = 0;
  while (set.has(cursor)) { streak += 1; cursor = addDaysISO(cursor, -1); }
  return streak;
}

/** The member's active habits with today's state, the last-7 count and the streak. */
export async function readHabits(sb, uid, { now = new Date() } = {}) {
  const today = isoDay(now);
  const since = addDaysISO(today, -60);
  const [habits, done] = await Promise.all([
    leg(sb.from('user_habits').select('id, name, type, cadence').eq('user_id', uid).is('archived_at', null).order('sort_order', { ascending: true })),
    leg(sb.from('user_habit_completions').select('habit_id, done_on').eq('user_id', uid).gte('done_on', since).lte('done_on', today)),
  ]);
  if (!habits.ok) return { ok: false };
  const byHabit = new Map();
  for (const c of Array.isArray(done.data) ? done.data : []) {
    const k = String(c.habit_id);
    if (!byHabit.has(k)) byHabit.set(k, []);
    byHabit.get(k).push(String(c.done_on).slice(0, 10));
  }
  const weekAgo = addDaysISO(today, -6);
  const list = (Array.isArray(habits.data) ? habits.data : []).filter((h) => h && h.id && str(h.name, 80)).slice(0, READ_CAPS.habits).map((h) => {
    const dates = byHabit.get(String(h.id)) || [];
    return {
      name: str(h.name, 80),
      ...(h.type === 'avoid' ? { type: 'avoid' } : {}),
      doneToday: dates.includes(today),
      last7Days: dates.filter((d) => d >= weekAgo).length,
      ...(done.ok ? { streak: habitStreak(dates, today) } : {}),
    };
  });
  return { ok: true, today, habits: list, doneToday: list.filter((h) => h.doneToday).length, total: list.length, ...(done.ok ? {} : { completionsUnavailable: true }) };
}

// ─── coaching ────────────────────────────────────────────────────────────────

async function providerNames(sb, rows) {
  const t = new Set(), n = new Set();
  for (const r of rows) { if (r.provider_role === 'trainer') t.add(r.provider_id); else if (r.provider_role === 'nutritionist') n.add(r.provider_id); }
  const [tr, nu] = await Promise.all([
    t.size ? leg(sb.from('trainers').select('id, name').in('id', [...t])) : { ok: true, data: [] },
    n.size ? leg(sb.from('nutritionists').select('id, name').in('id', [...n])) : { ok: true, data: [] },
  ]);
  const names = { trainer: {}, nutritionist: {} };
  for (const r of Array.isArray(tr.data) ? tr.data : []) names.trainer[r.id] = str(r.name, 60);
  for (const r of Array.isArray(nu.data) ? nu.data : []) names.nutritionist[r.id] = str(r.name, 60);
  return (role, id) => (names[role] && names[role][id]) || null;
}

/** The member's coaches, their next booked sessions, and the last few held. */
export async function readCoaching(sb, uid, { now = new Date() } = {}) {
  const nowIso = new Date(now).toISOString();
  const [up, past, subs] = await Promise.all([
    leg(sb.from('sessions').select('scheduled_at, duration_min, type, status, topic, provider_id, provider_role')
      .eq('client_id', uid).gte('scheduled_at', nowIso).in('status', ['requested', 'confirmed']).order('scheduled_at', { ascending: true }).limit(READ_CAPS.coaching)),
    leg(sb.from('sessions').select('scheduled_at, duration_min, type, status, topic, provider_id, provider_role')
      .eq('client_id', uid).lt('scheduled_at', nowIso).order('scheduled_at', { ascending: false }).limit(3)),
    leg(sb.from('subscriptions').select('provider_id, provider_role, status').eq('client_id', uid).in('status', ['active', 'trialing'])),
  ]);
  if (!up.ok && !subs.ok) return { ok: false };
  const upRows = Array.isArray(up.data) ? up.data : [];
  const pastRows = Array.isArray(past.data) ? past.data : [];
  const subRows = Array.isArray(subs.data) ? subs.data : [];
  const nameOf = await providerNames(sb, [...upRows, ...pastRows, ...subRows]);
  const session = (r) => ({
    at: r.scheduled_at,
    ...(posNum(r.duration_min) ? { durationMin: posNum(r.duration_min) } : {}),
    ...(str(r.type, 16) ? { type: str(r.type, 16) } : {}),
    status: str(r.status, 16),
    ...(str(r.topic, 80) ? { topic: str(r.topic, 80) } : {}),
    coach: nameOf(r.provider_role, r.provider_id) || (r.provider_role === 'nutritionist' ? 'your nutritionist' : 'your trainer'),
    role: r.provider_role,
  });
  return {
    ok: true,
    team: subs.ok ? subRows.map((r) => ({ name: nameOf(r.provider_role, r.provider_id) || 'Coach', role: r.provider_role })) : undefined,
    ...(subs.ok ? {} : { teamUnavailable: true }),
    upcoming: up.ok ? upRows.map(session) : undefined,
    ...(up.ok ? {} : { upcomingUnavailable: true }),
    recent: past.ok ? pastRows.map(session) : undefined,
  };
}

// ─── reminders ───────────────────────────────────────────────────────────────

export async function readReminders(sb, uid) {
  const r = await leg(sb.from('user_scheduled_reminders').select('kind, label, at_time, days, tz, enabled').eq('user_id', uid).order('at_time', { ascending: true }).limit(READ_CAPS.reminders));
  if (!r.ok) return { ok: false };
  const reminders = (Array.isArray(r.data) ? r.data : []).map((x) => ({
    kind: str(x.kind, 16) || 'custom',
    ...(str(x.label, 80) ? { label: str(x.label, 80) } : {}),
    time: String(x.at_time || '').slice(0, 5),
    days: (Array.isArray(x.days) ? x.days : []).map(Number).filter((n) => n >= 0 && n <= 6).map((n) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n]),
    ...(str(x.tz, 40) ? { tz: str(x.tz, 40) } : {}),
    enabled: x.enabled !== false,
  }));
  return { ok: true, reminders };
}

// ─── points ──────────────────────────────────────────────────────────────────

/** The last few Shape Score entries and the week's earned total (store
 * redemptions are spending, not standing — listed but not summed). */
export async function readPoints(sb, uid, { now = new Date() } = {}) {
  const r = await leg(sb.from('score_ledger').select('category, delta, note, earned_at, source_kind').eq('user_id', uid).order('earned_at', { ascending: false }).limit(40));
  if (!r.ok) return { ok: false };
  const rows = Array.isArray(r.data) ? r.data : [];
  const weekAgo = new Date(now).getTime() - 7 * 86_400_000;
  const earned7d = rows.filter((x) => x.source_kind !== 'store_redeem' && x.earned_at && new Date(x.earned_at).getTime() >= weekAgo).reduce((a, x) => a + (num(x.delta) || 0), 0);
  const recent = rows.slice(0, READ_CAPS.ledger).map((x) => ({
    ...(x.earned_at ? { on: isoDay(x.earned_at) } : {}),
    ...(str(x.category, 32) ? { category: str(x.category, 32) } : {}),
    points: num(x.delta) || 0,
    ...(str(x.note, 80) ? { note: str(x.note, 80) } : {}),
    ...(x.source_kind === 'store_redeem' ? { redemption: true } : {}),
  }));
  return { ok: true, earnedLast7Days: earned7d, recent };
}

// ─── coach side ──────────────────────────────────────────────────────────────

/**
 * The coach's own active roster, by the provider rows they own — the id a
 * coach tool needs, resolved from the name a coach actually says. Names come
 * from get_display_names (the definer the shared-overview page uses), never
 * from a profiles read a coach's RLS would refuse.
 */
export async function readCoachRoster(sb, uid) {
  // ⚠ A LIST READ, NEVER maybeSingle: neither owner_id column is unique, and a
  // coach holding TWO listings of one role is a measured production shape
  // (the shared-clients roster, 2026-08-14). maybeSingle on two rows is a
  // PGRST116 error, which would turn that coach's whole roster into
  // "unavailable" — every listing they own is a provider row here.
  const [tr, nu] = await Promise.all([
    leg(sb.from('trainers').select('id, name').eq('owner_id', uid)),
    leg(sb.from('nutritionists').select('id, name').eq('owner_id', uid)),
  ]);
  if (!tr.ok && !nu.ok) return { ok: false };
  const providers = [];
  for (const r of Array.isArray(tr.data) ? tr.data : []) if (r && r.id != null) providers.push({ role: 'trainer', id: r.id });
  for (const r of Array.isArray(nu.data) ? nu.data : []) if (r && r.id != null) providers.push({ role: 'nutritionist', id: r.id });
  if (!providers.length) return { ok: true, isCoach: false, clients: [] };
  const legs = await Promise.all(providers.map((p) =>
    leg(sb.from('subscriptions').select('client_id, status').eq('provider_role', p.role).eq('provider_id', p.id).in('status', ['active', 'trialing']).limit(READ_CAPS.roster))
      .then((r) => ({ ...r, role: p.role }))));
  if (legs.every((l) => !l.ok)) return { ok: false };
  const byClient = new Map();
  for (const l of legs) {
    for (const s of Array.isArray(l.data) ? l.data : []) {
      if (!s || !s.client_id) continue;
      const e = byClient.get(s.client_id) || { id: s.client_id, roles: new Set() };
      e.roles.add(l.role);
      byClient.set(s.client_id, e);
    }
  }
  const ids = [...byClient.keys()];
  const names = ids.length ? await leg(sb.rpc('get_display_names', { p_ids: ids })) : { ok: true, data: [] };
  const nameById = new Map();
  for (const r of Array.isArray(names.data) ? names.data : []) if (r && r.user_id) nameById.set(r.user_id, str(r.full_name, 80));
  const clients = ids.map((id) => ({ id, name: nameById.get(id) || null, roles: [...byClient.get(id).roles] }));
  return { ok: true, isCoach: true, clients, ...(names.ok ? {} : { namesUnavailable: true }) };
}

/** Resolve the client a coach named against their own roster — exactly one
 * match proceeds; anything else fails closed with what WAS found. */
export function findClient(roster, query) {
  const named = (Array.isArray(roster) ? roster : []).filter((c) => c && c.id && typeof c.name === 'string' && c.name);
  const r = matchNamed(named, query);
  if (r.item) return { client: { id: r.item.id, name: r.item.name, roles: r.item.roles } };
  return r;
}

/**
 * A coached client's numbers through the gated definer RPCs the coach surfaces
 * already use — get_client_stats returns NULL for anyone who is not this
 * caller's active client, so "not allowed" and "not shared" both come back as
 * an honest `allowed:false` and never as a fabricated zero.
 */
export async function readClientSnapshot(sb, clientId) {
  const [stats, lifts] = await Promise.all([
    leg(sb.rpc('get_client_stats', { p_user_id: clientId })),
    leg(sb.rpc('get_client_lifts', { p_user_id: clientId })),
  ]);
  if (!stats.ok) return { ok: false };
  const s = stats.data && typeof stats.data === 'object' ? stats.data : null;
  if (!s) return { ok: true, allowed: false };
  const out = { ok: true, allowed: true };
  const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => num(obj[k]) != null).map((k) => [k, num(obj[k])]));
  const training = pick(s, ['sessionsCompleted', 'sessionsPlanned', 'workoutMinutes30d']);
  const nutrition = pick(s, ['daysLogged7d', 'daysLogged30d', 'avgCalories', 'avgProtein', 'avgCarbs', 'avgFat']);
  const weight = pick(s, ['weightNow', 'weightStart', 'weighInCount']);
  if (Object.keys(training).length) out.training = training;
  if (Object.keys(nutrition).length) out.nutrition = nutrition;
  if (Object.keys(weight).length) out.weight = { ...weight, unitNote: 'as logged by the client (their own unit)' };
  if (Array.isArray(s.recentSessions) && s.recentSessions.length) {
    out.recentSessions = s.recentSessions.slice(0, 4).map((r) => ({
      ...(str(r.title, 60) ? { title: str(r.title, 60) } : {}), ...(str(r.status, 16) ? { status: str(r.status, 16) } : {}), ...(r.at ? { at: String(r.at) } : {}), ...(posNum(r.durationMin) ? { durationMin: posNum(r.durationMin) } : {}),
    }));
  }
  if (lifts.ok && lifts.data && typeof lifts.data === 'object') {
    const l = lifts.data;
    const keyLifts = (Array.isArray(l.keyLifts) ? l.keyLifts : []).slice(0, 5).map((k) => ({
      ...(str(k.name, 60) ? { name: str(k.name, 60) } : {}), ...(posNum(k.best) ? { best: posNum(k.best) } : {}), ...(str(k.unit, 4) ? { unit: str(k.unit, 4) } : {}), ...(posNum(k.e1rm) ? { e1rm: posNum(k.e1rm) } : {}),
    })).filter((k) => k.name);
    out.lifts = { ...(keyLifts.length ? { keyLifts } : {}), ...(num(l.prs) != null ? { prs: num(l.prs) } : {}), ...(num(l.avgRpe) != null ? { avgRpe: num(l.avgRpe) } : {}), ...(num(l.workoutsLogged42d) != null ? { workoutsLogged42d: num(l.workoutsLogged42d) } : {}) };
  } else if (!lifts.ok) {
    out.liftsUnavailable = true;
  }
  return out;
}
