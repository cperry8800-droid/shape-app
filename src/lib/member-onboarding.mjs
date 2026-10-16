// The member's own first 30 days (client-onboarding review, fix 4: the board's member mode).
//
// The coach board (bsOnboardingLeg in coach-client-legs.mjs) has a second mode in the review: "a
// member setting themselves up gets the same board with 'you' in place of 'the client'". This is that
// board, for the first 30 days of the membership, built ONLY from the member's own records:
//   joined     the membership's first platform_subscriptions row;
//   profile    a goal on file (client_goals.primaryGoal, or client_identity.goal);
//   plan       the first client_workouts row since joining, theirs or a coach's;
//   workout    the first completed workout_sessions row since joining;
//   review     the first check-in filed since joining (the week-one review);
//   progress   a measurement from day 28 on (the day-30 review).
// Nothing is a box the member ticks; a step is done when its record exists.
//
// ⚠ A FAILED READ IS NEVER A "NOT YET", as on the coach board: each input is `undefined` when its read
// failed, and its step then reads done: null ("couldn't read").
//
// The week-one target is the member's own (owner, 2026-10-14, decision 3: "a member sets their own,
// prefilled from what they told Shape"), kept in user_goals kind `member_setup` as { weekOne: { count,
// startsOn, setAt } }. ⚠ A MEMBER WHO PAYS A TRAINER DOES NOT SET IT: the trainer does, on their own
// board (client_programs.detail.training.weekOne), and this board shows that one, read under the coach
// board's own rule (weekOneOf: this trainer's, set during this subscription).

import { weekOneOf } from './coach-client-legs.mjs';

export const MEMBER_SETUP_DAYS = 30;
// Workouts in week one, as on the coach board for a trainer (WEEK_ONE_MAX).
export const MEMBER_WEEK_ONE_MAX = 14;
// The user_goals kind the member's own target lives under. Its own kind, so no other writer of a
// whole user_goals document (client_onboarding is written whole by the app) can drop it.
export const MEMBER_SETUP_KIND = 'member_setup';

const DAY_MS = 86400000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function ms(v) {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}
function isoDayUTC(atMs) { return new Date(atMs).toISOString().slice(0, 10); }
function addDays(day, n) { return isoDayUTC(Date.parse(day + 'T00:00:00Z') + n * DAY_MS); }
function text(v) { return typeof v === 'string' && v.trim() ? v.trim() : null; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

/** The window week one may start in: the board's 30 days, 'YYYY-MM-DD' (UTC, as the route checks it). */
export function memberSetupWindow(joinedAt) {
  const joined = ms(joinedAt);
  if (joined == null) return null;
  return { firstDay: isoDayUTC(joined), lastDay: isoDayUTC(joined + (MEMBER_SETUP_DAYS - 1) * DAY_MS) };
}

/**
 * The member's own week-one target from their `member_setup` document, or null.
 * ⚠ ONLY ONE SET DURING THIS MEMBERSHIP: a target saved before `joinedMs` is an earlier run's.
 */
export function memberWeekOneOf(doc, joinedMs) {
  const w = obj(obj(doc) && doc.weekOne);
  if (!w) return null;
  const count = typeof w.count === 'number' ? w.count : Number(w.count);
  if (!Number.isInteger(count) || count < 1 || count > MEMBER_WEEK_ONE_MAX) return null;
  const startsOn = typeof w.startsOn === 'string' && DAY_RE.test(w.startsOn) ? w.startsOn : null;
  const setAt = ms(w.setAt);
  if (joinedMs != null && setAt != null && setAt < joinedMs) return null;
  return { count, startsOn, setAt: setAt != null ? new Date(setAt).toISOString() : null };
}

/** What they told Shape: sessions per week (client_training_prefs.sessions_per_week), or null. */
export function memberSuggestedCount(trainingPrefs) {
  const v = obj(trainingPrefs) ? trainingPrefs.sessions_per_week : null;
  const m = /\d+/.exec(String(v == null ? '' : v));
  const n = m ? Number(m[0]) : null;
  return n != null && n >= 1 && n <= MEMBER_WEEK_ONE_MAX ? n : null;
}

// A completed session's day: when it started, else ended, else was saved (the dashboard's own rule).
function sessionDay(s) {
  const t = ms(s && (s.started_at || s.ended_at || s.created_at));
  return t == null ? null : { at: t, day: isoDayUTC(t) };
}

/**
 * @param {object} input
 *   joinedAt: ISO (the membership's first row); now: ms;
 *   answers: { goals, identity, training, nutrition, onboarding, health } | undefined (the user_goals read);
 *   setup: the member_setup document | null | undefined;
 *   devices: string[] (connected device names) | undefined;
 *   weighIn: { on, weight, unit } | null | undefined (the first weigh-in since joining);
 *   measurements: [{ measured_on }] | null | undefined (rows since joining);
 *   firstPlan: { at, title, coach: boolean } | null | undefined;
 *   sessions: [{ started_at, ended_at, created_at }] | null | undefined (completed, since joining);
 *   checkins: [{ week_of, created_at }] | null | undefined (filed since joining);
 *   coaching: { training: { name, providerId, since } | null, nutrition: { name } | null } | undefined;
 *   programDetail: client_programs.detail | null | undefined (read only for a coached member).
 * @returns the board, or null outside the membership's first 30 days.
 */
export function memberOnboardingBoard(input) {
  const i = input || {};
  const now = i.now != null ? i.now : Date.now();
  const joined = ms(i.joinedAt);
  if (joined == null || joined > now) return null;
  const day = Math.floor((now - joined) / DAY_MS) + 1;
  if (day > MEMBER_SETUP_DAYS) return null;
  const joinedDay = isoDayUTC(joined);
  const iso = (t) => (t == null ? null : new Date(t).toISOString());

  // ── What Shape knows (stage 01) ──
  const a = i.answers === undefined ? undefined : obj(i.answers) || {};
  const goals = a && obj(a.goals), identity = a && obj(a.identity);
  const training = a && obj(a.training), nutrition = a && obj(a.nutrition);
  const onboarding = a && obj(a.onboarding), health = a && obj(a.health);
  const goal = a ? text(identity && identity.goal) || text(goals && goals.primaryGoal) : null;
  const wants = onboarding && typeof onboarding.wantsCoaching === 'boolean' ? onboarding.wantsCoaching : null;
  const profile = a === undefined ? null : {
    goal,
    experience: text(training && training.experience),
    sessionsPerWeek: text(training && training.sessions_per_week),
    wantsCoaching: wants,
    coachingFor: onboarding && Array.isArray(onboarding.coachingFor) ? onboarding.coachingFor.filter((x) => x === 'training' || x === 'nutrition') : [],
    screening: !!(health && health.consentAt),
    diet: text(nutrition && nutrition.dietary_style),
    calories: text(nutrition && nutrition.calorie_range),
    devices: Array.isArray(i.devices) ? i.devices.slice() : null,
  };

  // ── The coach fork ──
  const coaching = i.coaching === undefined ? undefined : obj(i.coaching) || { training: null, nutrition: null };
  const trainer = coaching ? obj(coaching.training) : null;
  const nutritionist = coaching ? obj(coaching.nutrition) : null;

  // ── The week-one target ──
  // A trainer's, when they pay one; their own otherwise. `weekOneUnread` when the read it hangs on failed.
  let weekOne = null;
  let weekOneUnread = false;
  let setBy = null;
  if (coaching === undefined) weekOneUnread = true;
  else if (trainer) {
    if (i.programDetail === undefined) weekOneUnread = true;
    else {
      const w = weekOneOf(i.programDetail, 'training', trainer.providerId, ms(trainer.since));
      if (w) { weekOne = { count: w.count, startsOn: w.startsOn }; setBy = 'coach'; }
    }
  } else if (i.setup === undefined) weekOneUnread = true;
  else {
    const w = memberWeekOneOf(i.setup, joined);
    if (w) { weekOne = { count: w.count, startsOn: w.startsOn }; setBy = 'you'; }
  }
  // Week one runs seven days from its start: the target's, or the day they joined.
  const week1Start = weekOneUnread ? null : (weekOne && weekOne.startsOn) || joinedDay;
  const week1End = week1Start ? addDays(week1Start, 6) : null;

  // ── The records ──
  const sessions = i.sessions === undefined || i.sessions === null ? undefined
    : (Array.isArray(i.sessions) ? i.sessions : []).map(sessionDay).filter((s) => s && s.at >= joined).sort((x, y) => x.at - y.at);
  const checkins = i.checkins === undefined || i.checkins === null ? undefined
    : (Array.isArray(i.checkins) ? i.checkins : []).filter((c) => { const t = ms(c && c.created_at); return t != null && t >= joined; })
      .sort((x, y) => ms(x.created_at) - ms(y.created_at));
  // A measurement from day 28 on is the day-30 review, never one dated after today: the member's date
  // is theirs to send, so today is read on the furthest-ahead clock (UTC+14), as on the coach board.
  const latestDay = isoDayUTC(now + 14 * 3_600_000);
  const measuredDays = i.measurements === undefined || i.measurements === null ? undefined
    : (Array.isArray(i.measurements) ? i.measurements : [])
      .map((m) => (m && typeof m.measured_on === 'string' ? m.measured_on.slice(0, 10) : null))
      .filter((d) => d && d >= joinedDay && d <= latestDay).sort();
  const day30 = measuredDays === undefined ? undefined : measuredDays.filter((d) => d >= addDays(joinedDay, 27)).pop() || null;
  const firstPlan = i.firstPlan === undefined ? undefined : obj(i.firstPlan);
  const weighIn = i.weighIn === undefined ? undefined : obj(i.weighIn);

  const known = (v) => (v === undefined ? null : !!v);
  const steps = [
    { key: 'joined', done: true, at: iso(joined) },
    { key: 'profile', done: profile ? !!profile.goal : null },
    {
      key: 'plan', done: known(firstPlan), at: firstPlan ? iso(ms(firstPlan.at)) : null,
      title: firstPlan ? text(firstPlan.title) : null, by: firstPlan ? (firstPlan.coach ? 'coach' : 'you') : null,
      // Not theirs to do while a trainer they pay is writing it (the trainer's name is in `coaching`).
      waiting: firstPlan === null && !!trainer,
    },
    { key: 'workout', done: sessions === undefined ? null : sessions.length > 0, at: sessions && sessions.length ? iso(sessions[0].at) : null, due: week1End },
    { key: 'review', done: checkins === undefined ? null : checkins.length > 0, at: checkins && checkins.length ? iso(ms(checkins[0].created_at)) : null, due: week1End },
    { key: 'progress', done: day30 === undefined ? null : !!day30, at: day30 || null, due: addDays(joinedDay, MEMBER_SETUP_DAYS - 1) },
  ];
  const next = steps.find((s) => s.done === false && !s.waiting) || null;

  return {
    joinedAt: iso(joined),
    day,
    days: MEMBER_SETUP_DAYS,
    profile,
    start: {
      weighIn: weighIn === undefined ? undefined : weighIn && Number.isFinite(Number(weighIn.weight))
        ? { on: text(weighIn.on), weight: Number(weighIn.weight), unit: text(weighIn.unit) || 'kg' } : null,
      measuredOn: measuredDays === undefined ? undefined : measuredDays[0] || null,
    },
    coaching: coaching === undefined ? undefined : {
      training: trainer ? text(trainer.name) || '' : null,
      nutrition: nutritionist ? text(nutritionist.name) || '' : null,
    },
    steps,
    next: next ? next.key : null,
    weekOne,
    weekOneUnread,
    setBy,
    // Who sets it: the trainer they pay, or the member.
    coachSets: !!trainer,
    weekOneDone: weekOne && sessions ? sessions.filter((s) => s.day >= week1Start && s.day <= week1End).length : null,
    suggested: weekOne || weekOneUnread || trainer ? null : memberSuggestedCount(training),
    window: memberSetupWindow(joined),
  };
}
