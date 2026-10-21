import React from 'react';
import { createPortal } from 'react-dom';
import { morningReadiness, mrWatchForDay } from '../services/morningReadiness.mjs';
// ─── THE MORNING CHECK-IN: A CARD ON HOME, AND A WALKTHROUGH ─────────────────────────────────────
// Owner, 2026-10-19: "i like the walk through tutorial style, but again the purpose and where you can
// see the data over time, and what it means to the member" (docs/REVIEW-2026-10-19-morning-checkin.md,
// rulings in §6). It is a MORNING check: every question looks back from waking up, and the summary
// says what the answers mean for today and for the week. EVERY TAP SAVES: there is no Log button to
// forget, and leaving halfway keeps what was answered.
//
//   Home card: Start check-in →  ·  Same as yesterday (the morning in one tap)
//   Walkthrough: Last night (sleep, How did you wake up? optional, or Skip) → This morning (energy)
//                → the summary: today's read, the week, who sees it, Your mornings →, Change on
//                  every answer
//   Evening (members with a nutritionist, from 6 p.m.): one question, today's hunger
//   Done: one line on Home — Checked in ✓ · today's read · the streak · Readiness 85 · Ready ·
//         Your mornings → · Edit (step 1)
//
// ⚠ YOUR MORNINGS IS A DOOR, NOT AN IMPORT (part 2, §3.5). The page (BSYourMornings.jsx) imports this
// file's rules, so this file never imports it back: Home passes the door in as `onOpen`, and the
// summary closes the sheet before it opens the page, so the sheet never sits over it.
//
// ⚠ ONE READINESS NUMBER (§3.8). The done line's is morningReadiness.mjs on the morning shown here and
// the watch's readings dated today off the same read, so it is the number Your mornings gives today.
//
// ⚠ FIVE WORDS, STORED ON THE OLD 1-10 SCALE AS 2 · 4 · 6 · 8 · 10. Every reader of
// daily_health_snapshot keeps working unchanged: the coach's case file, roster triage, the
// engine's energy_low (≤ 4) and hunger_high (≥ 8), the correlations. A value written by the old
// 1-10 gauge reads back as its nearest word (bsCiWordIndex).
//
// ⚠ SAME AS YESTERDAY COPIES YESTERDAY'S OWN MORNING VALUES, never their words: a 7 stays a 7. Sleep
// hours are copied only when yesterday's were entered by hand, so a wearable's night is never
// re-typed as the member's own; Rested, the member's own answer on any night, is copied on its own.
// Hunger is the evening's question and is never copied.
//
// ⚠ IT ASKS FROM 4 A.M. LOCAL, NOT MIDNIGHT: at 1 a.m. "last night" has not been slept. The evening
// question asks from 6 p.m.
//
// ⚠ HUNGER IS ASKED ONLY WITH A NUTRITIONIST, IN THE EVENING, ABOUT TODAY (owner, 2026-10-19). The
// plan route's meals.coaching says so: an object is a paid nutritionist, null is none, and a missing
// key is a read that failed, which asks nothing that day. It is saved on today's row, so the coach's
// DAILY HUNGER keeps meaning that day's hunger.
//
// ⚠ WATER IS NOT HERE. It is drunk all day, so it is its own Home line (BSWaterLine.jsx).
//
// ⚠ A FAILED SAVE SAYS SO ON SCREEN. Toasts are a no-op app-wide (BSToastHost), so the answer is
// put back and a line says it was not saved.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx): this file
// is a static import of the client module and evaluates before that module's body has run.

const { useState, useEffect, useRef } = React;

// The i18n translator for this module (the self-contained copy every feature module carries).
function useShapeTr() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

// ── The rules, kept pure so they can be driven ───────────────────────────────

export const BS_CI_ASK_FROM_HOUR = 4;
export const BS_CI_EVENING_FROM_HOUR = 18;
export const BS_CI_STORED = [2, 4, 6, 8, 10];
// A short night: under 6h, the line the engine's sleep_low draws (7.5h less its 1.5h allowance).
export const BS_CI_SHORT_NIGHT_H = 6;
// The engine's energy_low line (dashSignals.js ENERGY_LOW_AVG): Low and Drained, never OK.
export const BS_CI_ENERGY_LOW_AVG = 4;

// A stored 1-10 value → its word (0..4): 1-2 → 0, 3-4 → 1, 5-6 → 2, 7-8 → 3, 9-10 → 4.
export function bsCiWordIndex(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(0, Math.min(4, Math.ceil(Math.min(10, n) / 2) - 1));
}

export function bsCiIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A member-local day `days` away, shifted at local noon so a daylight-saving change never skips or
// repeats one.
export function bsCiShift(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return bsCiIso(new Date(y, m - 1, d + days, 12));
}

// One day's answers off the progress series ({ date, value } points per metric). `device` is
// true when a watch wrote that night's hours: the route's `sleepFromDevice`, from the snapshot's
// per-field sources. A resting heart rate is not the sign: a watch worn by day and charged at
// night reports one with no night, and the member's typed hours then read as the watch's, locked
// and never copied (review on #2398). A server without that series falls back to the old sign.
export function bsCiDay(series, iso) {
  const at = (k) => {
    const p = ((series && series[k]) || []).find((s) => s && s.date === iso);
    const n = p ? Number(p.value) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const device = Array.isArray(series && series.sleepFromDevice)
    ? at('sleepFromDevice') != null
    : at('sleepEfficiency') != null || at('restingHr') != null || at('hrv') != null;
  return { energy: at('energy'), hunger: at('hunger'), sleep: at('sleep'), rested: at('sleepQuality'), device };
}

// A day counts as checked in from a MANUAL MORNING answer only: energy, Rested or typed hours. A
// wearable syncing sleep alone never makes a check-in, and nor does the evening's hunger.
export function bsCiAnswered(day) {
  return !!day && (day.energy != null || day.rested != null || (day.sleep != null && !day.device));
}

// A night a wearable reported: hours on a day with device-only metrics. A watch that reported a
// resting heart rate but no night is not one, and its member is asked like anyone else.
export function bsCiWornNight(day) {
  return !!day && !!day.device && day.sleep != null;
}

// The next morning question, or 'done'. The night comes first: the morning looks back at it. A night
// that already has hours (a wearable's or typed) needs no question, and neither does one the member
// skipped today (a member who does not track sleep is not asked all day).
export function bsCiStep(today, sleepSkipped) {
  const t = today || {};
  if (t.sleep == null && !sleepSkipped) return 'sleep';
  if (t.energy == null) return 'energy';
  return 'done';
}

// Skipping the night is remembered on this device for the rest of the local day, and saved on the
// day's row (sleep_skipped) for the Morning check-in reminder (skipNight below). The card reads the
// row's back too, so the skip holds on the member's other devices.
function bsCiSkipKey(uid) { return `shape.checkin.sleepSkip.${uid || 'preview'}`; }
function bsCiReadSkip(uid, iso) { try { return window.localStorage.getItem(bsCiSkipKey(uid)) === iso; } catch (e) { return false; } }
function bsCiWriteSkip(uid, iso) { try { window.localStorage.setItem(bsCiSkipKey(uid), iso); } catch (e) { /* the skip still holds until the app closes */ } }
// A night skipped on the day's row: the progress route's `sleepSkipped`, one point per row saved with
// sleep_skipped. So a skip on one device is not asked again on another (part 2), and a past night the
// member skipped is told apart from one they never answered. A server without the series has none.
export function bsCiSkippedOn(series, iso) {
  const pts = series && series.sleepSkipped;
  return Array.isArray(pts) && pts.some((s) => s && s.date === iso);
}

// Consecutive days with a manual answer, ending today, or yesterday while today is still open.
export function bsCiStreak(series, todayIso) {
  let iso = bsCiAnswered(bsCiDay(series, todayIso)) ? todayIso : bsCiShift(todayIso, -1);
  let n = 0;
  while (n < 400 && bsCiAnswered(bsCiDay(series, iso))) { n += 1; iso = bsCiShift(iso, -1); }
  return n;
}

// The member's usual night: the median of the last 14 nights they have, to the half hour,
// within the stepper's 3-12h. 7h 30 when there is nothing to go on.
export function bsCiUsualNight(series, todayIso) {
  const nights = [];
  for (let i = 1; i <= 14; i += 1) {
    const s = bsCiDay(series, bsCiShift(todayIso, -i)).sleep;
    if (s != null && s > 0) nights.push(s);
  }
  if (!nights.length) return 7.5;
  nights.sort((a, b) => a - b);
  const mid = nights.length % 2 ? nights[(nights.length - 1) / 2] : (nights[nights.length / 2 - 1] + nights[nights.length / 2]) / 2;
  return Math.max(3, Math.min(12, Math.round(mid * 2) / 2));
}

// What "Same as yesterday" writes for today: yesterday's own morning values for the questions today
// has not answered. Null when yesterday has no energy to copy. A night skipped today stays skipped:
// neither its hours nor How did you wake up? are copied onto it (Codex P2 on #2407).
export function bsCiSamePatch(yesterday, today, sleepSkipped = false) {
  if (!yesterday || yesterday.energy == null) return null;
  const t = today || {};
  const patch = {};
  if (t.energy == null) patch.energy = yesterday.energy;
  if (!sleepSkipped) {
    if (t.sleep == null && yesterday.sleep != null && !yesterday.device) patch.sleepHours = yesterday.sleep;
    // Rested is the member's own answer on any night, a watch's included (ruling 2, Codex P2 on #2398).
    if (t.rested == null && yesterday.rested != null) patch.sleepQuality = yesterday.rested;
  }
  return Object.keys(patch).length ? patch : null;
}

// Hours as hours and minutes. `say(hh, mm)` words it in the member's language (the card passes
// home:checkin.hm / hOnly; Russian reads "7 ч 30"); without one it is "7h 30".
export function bsCiHM(h, say) {
  const n = h == null ? NaN : Number(h);
  if (!Number.isFinite(n)) return '—';
  const total = Math.round(n * 60); // in whole minutes first, so 7.999h reads 8h, never 7h 60
  const hh = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, '0');
  if (say) return say(hh, total % 60 ? mm : null);
  return total % 60 ? `${hh}h ${mm}` : `${hh}h`;
}

// The seven days before today, oldest first: the strip under every step.
export function bsCiWeek(series, todayIso) {
  const out = [];
  for (let i = 7; i >= 1; i -= 1) {
    const iso = bsCiShift(todayIso, -i);
    out.push({ iso, ...bsCiDay(series, iso) });
  }
  return out;
}

// The `n` days ending `endIso`, that day included, oldest first: Your mornings' 7 or 30 days ending
// today, and the same number before them to compare with. Each day is bsCiDay's, with `skipped` when
// the night was skipped on the day's row. Up to 400 days, the most the progress route sends.
export function bsCiWindow(series, endIso, n) {
  const out = [];
  const len = Math.min(400, Math.floor(Number(n)));
  if (typeof endIso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(endIso) || !(len > 0)) return out;
  for (let i = len - 1; i >= 0; i -= 1) {
    const iso = bsCiShift(endIso, -i);
    out.push({ iso, ...bsCiDay(series, iso), skipped: bsCiSkippedOn(series, iso) });
  }
  return out;
}

// The word (0..4) a week was mostly answered with: more than half of at least three answered days.
// Null otherwise, and the strip then says nothing rather than guess at a trend.
export function bsCiMostly(values) {
  const idx = (values || []).map(bsCiWordIndex).filter((i) => i != null);
  if (idx.length < 3) return null;
  const counts = [0, 0, 0, 0, 0];
  for (const i of idx) counts[i] += 1;
  const best = counts.indexOf(Math.max(...counts));
  return counts[best] * 2 > idx.length ? best : null;
}

// A short night: under 6h, or an hour or more under the member's usual night. Null with no hours.
export function bsCiShortNight(hours, usual) {
  const h = hours == null ? NaN : Number(hours);
  if (!Number.isFinite(h)) return null;
  const u = usual == null ? NaN : Number(usual);
  return h < BS_CI_SHORT_NIGHT_H || (Number.isFinite(u) && h <= u - 1);
}

// What this morning's answers mean for today, said on the summary and on Home's done line. Rules,
// never medical: training and bedtime only. Null until energy is answered.
//   'shortLow'  a short night, Drained or Low      'fullLow'  a full night, Drained or Low
//   'low'       Drained or Low, no night known     'shortOk'  a short night, OK or better
//   'ready'     OK or better
export function bsCiTodayRead(today, usual) {
  if (!today) return null;
  const i = bsCiWordIndex(today.energy);
  if (i == null) return null;
  const short = bsCiShortNight(today.sleep, usual);
  if (i <= 1) return short == null ? 'low' : short ? 'shortLow' : 'fullLow';
  return short ? 'shortOk' : 'ready';
}

// Today's read (bsCiTodayRead's key) in the member's words, said on the summary, on Home's done line
// and under Your mornings' readiness, so the three say one sentence. `coached`: a trainer or a
// nutritionist, who a low morning after a full night is told to tell. Null for no key.
export function bsCiTodayReadText(tr, key, coached) {
  return key === 'shortLow' ? tr('home:checkin.readShortLow', { defaultValue: 'Short night, low morning. Keep training easy and aim for bed earlier.' })
    : key === 'fullLow' ? (coached
      ? tr('home:checkin.readFullLowCoach', { defaultValue: 'Low after a full night. If it keeps happening, tell your coach.' })
      : tr('home:checkin.readFullLow', { defaultValue: 'Low after a full night. If it keeps happening, take it easy and keep an eye on it.' }))
    : key === 'low' ? tr('home:checkin.readLow', { defaultValue: 'A low morning. Keep training easy today.' })
    : key === 'shortOk' ? tr('home:checkin.readShortOk', { defaultValue: 'Short night, but you feel fine. Go by how the warm-up feels.' })
    : key === 'ready' ? tr('home:checkin.readReady', { defaultValue: "Ready for today's plan." })
    : null;
}

// The week in the member's words: the engine's own lines over the seven days ending today (sleep_low,
// under 6h on 3 or more nights; energy_low, at or under 4 on 3 or more days), then the word most
// mornings had, then how many more mornings a week needs. Null when none of them holds. `week` is the
// strip's seven days before today; the engine's window is today and the six before it, so only the
// last six are read (review on this PR: a seventh day back made a week the engine never flagged).
export function bsCiWeekLine(week, today) {
  const days = [...(week || []).slice(-6), today || {}];
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const nights = days.map((d) => Number(d && d.sleep)).filter((h) => Number.isFinite(h) && h > 0);
  if (nights.length >= 3 && avg(nights) < BS_CI_SHORT_NIGHT_H) return { kind: 'sleepShort', hours: avg(nights) };
  const energy = days.map((d) => d && d.energy).filter((v) => bsCiWordIndex(v) != null).map(Number);
  if (energy.length >= 3 && avg(energy) <= BS_CI_ENERGY_LOW_AVG) return { kind: 'energyLow', word: bsCiWordIndex(avg(energy)) };
  const most = bsCiMostly(energy);
  if (most != null) return { kind: 'mostly', word: most };
  if (energy.length < 3) return { kind: 'more', n: 3 - energy.length };
  return null;
}

// The plan route's coaching as three states per role: true (a paid coach), false (none), null (the
// read failed or has not answered). Never the object itself: every reader of the plan shares it.
export function bsCiCoachingOf(plan) {
  const role = (part) => (plan && plan[part] && 'coaching' in plan[part] ? !!plan[part].coaching : null);
  return { trainer: role('training'), nutritionist: role('meals') };
}

// Who reads the morning: 'both' | 'trainer' | 'nutritionist' | 'you', or null while unknown.
export function bsCiWhoSees(coaching) {
  if (!coaching || coaching.trainer == null || coaching.nutritionist == null) return null;
  if (coaching.trainer && coaching.nutritionist) return 'both';
  if (coaching.trainer) return 'trainer';
  if (coaching.nutritionist) return 'nutritionist';
  return 'you';
}

// The five words of each scale in the member's language: E energy, H hunger between meals, R How did
// you wake up? (Rested). The card and Your mornings both say a value with these, and a value, stored
// or averaged, becomes its word only through bsCiWordIndex (ruling 11). The keys are written out so
// the i18n gates check every one.
export function bsCiWords(tr) {
  return {
    E: [
      tr('home:checkin.e0', { defaultValue: 'Drained' }),
      tr('home:checkin.e1', { defaultValue: 'Low' }),
      tr('home:checkin.e2', { defaultValue: 'OK' }),
      tr('home:checkin.e3', { defaultValue: 'Good' }),
      tr('home:checkin.e4', { defaultValue: 'Great' }),
    ],
    H: [
      tr('home:checkin.h0', { defaultValue: 'Not hungry' }),
      tr('home:checkin.h1', { defaultValue: 'A little' }),
      tr('home:checkin.h2', { defaultValue: 'Normal' }),
      tr('home:checkin.h3', { defaultValue: 'Hungry' }),
      tr('home:checkin.h4', { defaultValue: 'Starving' }),
    ],
    R: [
      tr('home:checkin.r0', { defaultValue: 'Wrecked' }),
      tr('home:checkin.r1', { defaultValue: 'Tired' }),
      tr('home:checkin.r2', { defaultValue: 'OK' }),
      tr('home:checkin.r3', { defaultValue: 'Rested' }),
      tr('home:checkin.r4', { defaultValue: 'Fresh' }),
    ],
  };
}

// A word mid-sentence starts lower case in the app's language: "Mostly good mornings this week",
// "Diese Woche meist gut". Only its first letter is lowered, so a noun inside it keeps its capital
// ("kein Hunger", never "kein hunger"), and a word in capitals stays as it is ("Mostly OK", never
// "Mostly ok"; review on part 2).
export function bsCiLower(w) {
  const s = String(w);
  const locale = window.ShapeI18n?.intlLocale?.() || undefined;
  const up = (x) => { try { return x.toLocaleUpperCase(locale); } catch (e) { return x.toUpperCase(); } };
  if (s.length > 1 && s === up(s)) return s;
  try { return s.charAt(0).toLocaleLowerCase(locale) + s.slice(1); } catch (e) { return s.charAt(0).toLowerCase() + s.slice(1); }
}

// Morning readiness's bands (morningReadiness.mjs) in the member's words, keyed as the module keys them.
export function bsCiBandWords(tr) {
  return {
    ready: tr('home:mornings.bandReady', { defaultValue: 'Ready' }),
    steady: tr('home:mornings.bandSteady', { defaultValue: 'Steady' }),
    easy: tr('home:mornings.bandEasy', { defaultValue: 'Take it easy' }),
    low: tr('home:mornings.bandLow', { defaultValue: 'Run down' }),
  };
}

// The engine's figures said in the member's language and units (bsCiLeadReason, below). Each line
// says what the engine's English reason says, from the numbers that reason was built from
// (directive.evidence, the flag's `figures`). A figure that is missing, or is not what its rule
// makes (a count that is not a whole number, a date that is not a date), gives no line, and the
// caller keeps the engine's reason: nothing is said that the figures do not hold. Window globals
// are read here, at call time: the locale for a date or a number, and ShapeUnits for water, the
// preference the water line reads through useBS (BSWaterLine.jsx), with its default, imperial.
const BS_CI_L_TO_OZ = 33.814;
function bsCiFigureReason(ev, tr) {
  const key = ev && ev.key;
  const whole = (v, min) => (Number.isInteger(v) && v >= min ? v : null);
  const locale = window.ShapeI18n?.intlLocale?.() || undefined;
  const num = (n, digits) => { try { return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n); } catch (e) { return String(n); } };
  if (key === 'checkin_overdue') {
    if (ev.first === true) return tr('home:lead.reason.checkinFirst', { defaultValue: "You haven't sent a first weekly check-in yet." });
    const weeks = whole(ev.missedWeeks, 1);
    if (weeks != null && weeks >= 2) return tr('home:lead.reason.checkinWeeks', { defaultValue: 'No weekly check-in for {weeks, plural, one {# week} other {# weeks}}.', weeks });
    const m = weeks === 1 && typeof ev.lastWeekOf === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ev.lastWeekOf) : null;
    if (!m) return null;
    // The engine's Monday is a local day, so it is read at local noon, as bsCiShift reads one.
    const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    if (bsCiIso(day) !== ev.lastWeekOf) return null;
    let date;
    try { date = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(day); } catch (e) { return null; }
    return tr('home:lead.reason.checkinDue', { defaultValue: 'Your weekly check-in is due. The last one was for the week of {date}.', date });
  }
  if (key === 'goal_slip') {
    // The goal's own name is the member's or their coach's words, set in the locale's quotes. The
    // untitled weight goal, whose name in the engine is its English stand-in, is named by the catalog.
    const goal = typeof ev.goal === 'string' && ev.goal.trim() ? ev.goal.trim() : null;
    if (!goal && ev.untitled !== true) return null;
    if (ev.lost === true) {
      return goal
        ? tr('home:lead.reason.goalLost', { defaultValue: '“{goal}” lost its projected date. The pace flattened this week.', goal })
        : tr('home:lead.reason.weightLost', { defaultValue: 'Your goal weight lost its projected date. The pace flattened this week.' });
    }
    const days = whole(ev.days, 1);
    if (days == null) return null;
    return goal
      ? tr('home:lead.reason.goalSlip', { defaultValue: '“{goal}” slipped. Its projected finish moved {days, plural, one {# day} other {# days}} later this week.', goal, days })
      : tr('home:lead.reason.weightSlip', { defaultValue: 'Your goal weight slipped. Its projected finish moved {days, plural, one {# day} other {# days}} later this week.', days });
  }
  if (key === 'streak_broken') {
    // The engine's figure is the streak's longest run in what the record holds (the member's own: the
    // longest run of logged days in the last 30), so the line calls it that, never the run that broke.
    const days = whole(ev.best, 1);
    // The window is the nutrition route's 30 days (src/app/api/client/nutrition/route.ts), so the line
    // says it: a run that started before it is longer than the figure (review on this PR).
    return days == null ? null : tr('home:lead.reason.streakBroken', { defaultValue: 'Your streak broke. Your longest run in the last 30 days was {days, plural, one {# day} other {# days}}.', days });
  }
  if (key === 'hydration_low') {
    const avgL = typeof ev.avgL === 'number' && Number.isFinite(ev.avgL) && ev.avgL >= 0 ? ev.avgL : null;
    const targetL = typeof ev.targetL === 'number' && Number.isFinite(ev.targetL) && ev.targetL > 0 ? ev.targetL : null;
    if (avgL == null || targetL == null) return null;
    let metric = false;
    try { metric = window.ShapeUnits?.get?.() === 'metric'; } catch (e) { metric = false; }
    // The target as the water line shows it (to the centilitre, or the whole ounce); the week's
    // average to the decilitre, as the engine rounds it, or the whole ounce.
    const say = (l, digits) => (metric ? `${num(Math.round(l * 10 ** digits) / 10 ** digits, digits)} L` : `${num(Math.round(l * BS_CI_L_TO_OZ), 0)} oz`);
    return tr('home:lead.reason.water', { defaultValue: 'On days you logged water, you averaged {amount} of your {target} target. A glass with each meal closes most of it.', amount: say(avgL, 1), target: say(targetL, 2) });
  }
  if (key === 'food_gap') {
    if (ev.lastWeek === true) return tr('home:lead.reason.foodWeek', { defaultValue: 'No food logged in the last week.' });
    const days = whole(ev.days, 1);
    if (days == null) return null;
    return ev.sinceJoined === true
      ? tr('home:lead.reason.foodJoined', { defaultValue: 'No food logged in the {days, plural, one {# day} other {# days}} since you joined.', days })
      : tr('home:lead.reason.foodDays', { defaultValue: 'No food logged in {days, plural, one {# day} other {# days}}.', days });
  }
  if (key === 'score_drop') {
    const drop = whole(ev.drop, 1);
    return drop == null ? null : tr('home:lead.reason.scoreDrop', { defaultValue: 'Your Shape Score is {drop, number} lower than the week before.', drop });
  }
  return null;
}

// ⚠ HOME'S LEAD SAYS EVERY ENGINE REASON IN THE MEMBER'S WORDS (part 2; rulings 11 and 13). The
// engine's own member reason is English, for what has no locale (the push and the bell row it
// leaves), so Home, and the Shape Daily splash through bsWireLines' opts.reason in
// iosAppBroadsheetMain.jsx, say it again from the app's catalog out of directive.evidence. The
// morning check-in's energy, hunger and sleep flags come from the flag's raw average: in the week
// line's own keys and the card's word rule, so the lead and the summary say one thing. An average is said as one ("low on average"),
// never "mostly": Your mornings' "Most days" is the word most days had, and an average of Drained
// and Great days is Low without one Low day (review on this PR). Sleep is to the 5 minutes, as the
// week line has it. Every other flag comes from its figures (bsCiFigureReason): the check-in's
// weeks and the Monday it names, a goal's slip, the streak's longest run, water in the member's units,
// a food gap, a Score drop. A coach's own reason (source 'coach'), an engine lead with no figures it
// can say, and a key it does not know are said as they came.
export function bsCiLeadReason(dir, tr) {
  if (!dir) return null;
  const ev = dir.source === 'engine' && dir.evidence ? dir.evidence : null;
  const avg = ev && typeof ev.avg === 'number' && Number.isFinite(ev.avg) ? ev.avg : null;
  if (avg == null) return (ev && bsCiFigureReason(ev, tr)) || dir.reason;
  const i = bsCiWordIndex(avg);
  if (ev.key === 'energy_low' && i != null) {
    return tr('home:checkin.weekEnergyLow', { defaultValue: 'Your energy has been {word} on average this week. A lighter session still counts.', word: bsCiLower(bsCiWords(tr).E[i]) });
  }
  if (ev.key === 'hunger_high' && i != null) {
    return tr('home:lead.hungerReason', { defaultValue: "You've been {word} between meals on average this week. The plan may be running light on fuel.", word: bsCiLower(bsCiWords(tr).H[i]) });
  }
  if (ev.key === 'sleep_low' && avg > 0) {
    const say = (hh, mm) => (mm == null ? tr('home:checkin.hOnly', { defaultValue: '{h}h', h: hh }) : tr('home:checkin.hm', { defaultValue: '{h}h {m}', h: hh, m: mm }));
    return tr('home:checkin.weekSleepShort', { defaultValue: 'Short on sleep this week: {hours} a night.', hours: bsCiHM(Math.round(avg * 12) / 12, say) });
  }
  return dir.reason;
}

// The signed-out preview's week: a sample, never saved.
function bsCiSampleWeek(todayIso) {
  const e = [null, 8, 8, 4, 10, 8, 8];
  const h = [null, 6, 6, 4, 6, 8, 6];
  const s = [null, 7.33, 7.5, 5.83, 7.83, 6.67, 7.17];
  return e.map((_, i) => ({ iso: bsCiShift(todayIso, i - 7), energy: e[i], hunger: h[i], sleep: s[i], rested: null, device: false }));
}

// One save at a time per line: two quick taps would otherwise both find no row for today and both
// insert. Water has its own line (BSWaterLine.jsx), so a glass never waits on a check-in answer.
// ⚠ A QUEUED SAVE BELONGS TO THE ACCOUNT AND THE DAY THAT MADE IT (Codex P1 and P2 on #2398). The
// write goes out under whoever is signed in, dated by the data layer, when it leaves the queue. So
// a member who answers on a slow connection and signs out would otherwise have the answer saved to
// the next member's day, and a tap just before midnight to tomorrow. A save whose turn comes after
// either changed is dropped, and rejects like any failed save.
const bsCiLines = { checkin: Promise.resolve(), water: Promise.resolve() };
function bsCiCurrentUid() { return window.ShapeAuth?.getCachedState?.()?.user?.id || null; }
export function bsCiEnqueue(line, uid, send) {
  const day = bsCiIso(new Date());
  const run = bsCiLines[line].then(() => {
    if (bsCiCurrentUid() !== uid) throw new Error('signed-in account changed');
    if (bsCiIso(new Date()) !== day) throw new Error('the local day changed');
    return send();
  });
  bsCiLines[line] = run.catch(() => {});
  return run;
}
function bsCiSave(patch, uid) { return bsCiEnqueue('checkin', uid, () => window.ShapeCheckin.log(patch)); }
// A line's saves have settled, or `ms` has passed: a read waits for saves on their way, but a
// request the network holds does not keep the card off Home for good.
const BS_CI_READ_WAIT_MS = 3000;
export function bsCiSettled(line) {
  let timer;
  const waited = new Promise((r) => { timer = setTimeout(r, BS_CI_READ_WAIT_MS); });
  return Promise.race([bsCiLines[line], waited]).finally(() => clearTimeout(timer));
}
// A line's saves queued so far, landed or failed, with no cap (it never rejects): for a reader the
// 3-second wait let read before them, which reads again once they land (Your mornings). A save that
// lands has cleared the 60-second cache, so that read is fresh.
export function bsCiLanded(line) { return bsCiLines[line]; }

// The card tells the water line that a watch sync may have moved the day's water.
export const BS_CI_HYDRATION_SYNCED = 'shape:hydration-synced';

// ⚠ A WATCH'S NIGHT COMES FIRST (owner, 2026-10-18: "Use the data from smart device priority of the
// member has one, if not manual entry"; "just use smart device data that matches what we are asking
// for"). The night's hours are the one check a watch measures, so opening the card asks each
// connected one for last night first, and the sleep step then shows the watch's hours instead of
// asking. Energy, hunger, Rested and water stay the member's own. At most once in 30 minutes per
// account on this device (a status read that fails, or syncs that all fail, do not use the 30
// minutes up, so the next open tries again: Codex on #2404); Garmin sends
// its nights on its own, and Apple Health is read only in the iPhone app, for today and yesterday,
// and never asks for permission from here. True when a sync answered.
export const BS_CI_SYNC_EVERY_MS = 30 * 60 * 1000;
const bsCiSyncedAt = {};
export async function bsCiSyncDevices(uid, nowMs = Date.now()) {
  const I = window.ShapeIntegrations;
  if (!uid || !I || !I.getStatus) return false;
  const key = `shape.checkin.deviceSync.${uid}`;
  let last = bsCiSyncedAt[uid] || 0;
  try { last = Math.max(last, Number(window.localStorage.getItem(key)) || 0); } catch (e) { /* the module's own time still throttles */ }
  if (nowMs - last < BS_CI_SYNC_EVERY_MS) return false;
  const keep = (t) => {
    bsCiSyncedAt[uid] = t;
    try { window.localStorage.setItem(key, String(t)); } catch (e) { /* as above */ }
  };
  keep(nowMs);
  let status;
  try { status = await I.getStatus(); } catch (e) { keep(last); throw e; }
  const on = new Set(((status && status.providers) || []).filter((p) => p && p.connected).map((p) => p.id));
  const runs = [];
  if (on.has('whoop') && I.syncWhoop) runs.push(I.syncWhoop());
  if (on.has('oura') && I.syncOura) runs.push(I.syncOura());
  if (on.has('apple_health') && I.syncAppleHealth && I.appleHealthAvailable && I.appleHealthAvailable()) runs.push(I.syncAppleHealth({ importWorkouts: false, prompt: false, days: 2 }));
  if (!runs.length) return false;
  const done = await Promise.allSettled(runs);
  if (done.some((r) => r.status === 'fulfilled')) return true;
  keep(last);
  return false;
}

// ── The card, and the walkthrough it opens ───────────────────────────────────

// The morning's steps. The walkthrough's screens are 0..n-1 for these, BS_CI_SUMMARY for the
// summary, and 'evening' for the evening's hunger question.
export const BS_CI_STEPS = ['sleep', 'energy'];
export const BS_CI_SUMMARY = BS_CI_STEPS.length;

function BSCheckinDay({ dayIso, openRequest = null, onOpenRequestConsumed = null, onMornings = null }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const amber = t.isLight ? '#b9802a' : '#e8b14a';
  const blue = t.BLUE || (t.isLight ? '#3a6ea5' : '#5b9bd5');
  const COLOR = { sleep: blue, energy: teal, hunger: amber };
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const signedIn = !!uid;
  const now = new Date();
  const todayIso = dayIso; // the one local day this card belongs to (BSCheckinCard, below)

  // Signed out, the card previews the flow on a sample week and saves nothing.
  const [today, setToday] = useState({ energy: null, hunger: null, sleep: null, rested: null, device: false });
  const [yesterday, setYesterday] = useState(signedIn ? null : { energy: 8, hunger: 6, sleep: 7.17, rested: 8, device: false });
  const [week, setWeek] = useState(() => (signedIn ? [] : bsCiSampleWeek(todayIso)));
  const [usual, setUsual] = useState(7.5);
  const [watch, setWatch] = useState(null);       // the watch's readings dated today, for readiness (mrWatchForDay)
  const [streakBefore, setStreakBefore] = useState(0); // the run through yesterday; today adds one once answered
  const [walk, setWalk] = useState(null);         // the walkthrough's screen: a step, BS_CI_SUMMARY, 'evening'; null closed
  const [fromSummary, setFromSummary] = useState(false); // a Change from the summary goes back to it
  const [sleepH, setSleepH] = useState(null);     // the stepper, before Next saves it
  const [restedPick, setRestedPick] = useState(null);
  const [err, setErr] = useState(null);           // the last write that failed, said on screen
  const [skippedDay, setSkippedDay] = useState(() => (bsCiReadSkip(uid, todayIso) ? todayIso : null)); // the day the night was skipped
  // Who coaches the member, from the plan route: decides the evening question and Who sees this.
  const [coaching, setCoaching] = useState({ trainer: null, nutritionist: null });
  // Signed in, nothing is asked until today's answers are read: a tap on a card that has not
  // loaded would be overwritten by the read. A failed read asks anyway (every tap still saves).
  // A new local day mounts a new card (BSCheckinCard, below), so this gate, like every other piece
  // of state here, only ever holds this card's own day.
  const [ready, setReady] = useState(!signedIn || !window.ShapeProgress?.progress);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // The newest answer per field, numbered, so an older save that fails never undoes a newer one.
  const latest = useRef({ n: 0 });
  // What is stored, as far as this card knows: the day as read, then each answer once its save
  // lands. A failed save puts this back, never the screen from before its tap, which may hold an
  // earlier answer that failed too (review on #2398).
  const confirmed = useRef({ energy: null, hunger: null, sleep: null, rested: null });
  const [, bump] = useState(0); // a re-render, for a tap that finds its day already over

  // ⚠ THE READS WAIT FOR SAVES ALREADY ON THEIR WAY (review on #2398). The lines outlive a card:
  // a member who answers on a slow connection, leaves Home and comes back mounts a new card while
  // the old card's save is still out, and the progress read would answer from its 60-second cache
  // from before it. That card then asked again, and Same as yesterday wrote over the answer. A
  // save the network holds is waited for 3 seconds at most (bsCiSettled).
  useEffect(() => {
    if (!signedIn || !window.ShapeProgress?.progress) return undefined;
    let on = true;
    // A read that fails still opens the card, on its own empty day.
    bsCiSettled('checkin').then(() => window.ShapeProgress.progress()).then((p) => {
      if (!on) return;
      if (p && p.series) {
        const day = bsCiDay(p.series, todayIso);
        confirmed.current = day;
        setToday(day);
        setYesterday(bsCiDay(p.series, bsCiShift(todayIso, -1)));
        setWeek(bsCiWeek(p.series, todayIso));
        setUsual(bsCiUsualNight(p.series, todayIso));
        setStreakBefore(bsCiStreak(p.series, todayIso) - (bsCiAnswered(day) ? 1 : 0));
        setWatch(mrWatchForDay(p.series, todayIso));
        // A night skipped on another device is skipped here too: the day's row says so.
        if (bsCiSkippedOn(p.series, todayIso)) setSkippedDay(todayIso);
      }
      setReady(true);
    }).catch(() => { if (on) setReady(true); });
    return () => { on = false; };
  }, [signedIn, todayIso]);

  // The plan read is the one Home already makes (60-second cache), so this adds no request. Its
  // object is shared by every reader and is never changed here.
  useEffect(() => {
    if (!signedIn || !window.ShapePlan?.get) return undefined;
    let on = true;
    Promise.resolve(window.ShapePlan.get()).then((p) => { if (on) setCoaching(bsCiCoachingOf(p)); }).catch(() => {});
    return () => { on = false; };
  }, [signedIn]);

  // Once today is read, the connected watches are asked for last night (bsCiSyncDevices, above),
  // then the day is read again. A night that came in replaces whatever is on screen, typed hours
  // included, since the route keeps the watch's over them. Apple Health's water comes in with the
  // same sync, and the water line is told to read the day again. A day that already has a watch's
  // night asks again too, within the 30 minutes: a night synced while the member was still asleep is
  // part of one, and only a later sync brings the rest (Codex on #2404). A card that unmounts while
  // the sync is out still clears the cache and claims the night's points, so the next card reads the
  // night rather than ask for it.
  useEffect(() => {
    if (!signedIn || !ready) return undefined;
    let on = true;
    bsCiSyncDevices(uid).then((synced) => {
      if (!synced) return null;
      window.ShapeMetrics?.invalidate?.();
      // A good night the sync brought earns its points now, not on the next app open.
      Promise.resolve(window.ShapeSleepPoints?.check?.()).catch(() => {});
      try { window.dispatchEvent(new window.Event(BS_CI_HYDRATION_SYNCED)); } catch (e) { /* the water line reads again on its next mount */ }
      if (!on || !window.ShapeProgress?.progress) return null;
      return window.ShapeProgress.progress();
    }).then((p) => {
      if (!on || !p || !p.series) return;
      setYesterday(bsCiDay(p.series, bsCiShift(todayIso, -1)));
      setWeek(bsCiWeek(p.series, todayIso));
      setUsual(bsCiUsualNight(p.series, todayIso));
      setWatch(mrWatchForDay(p.series, todayIso)); // the night's recovery and heart readings came with it
      const day = bsCiDay(p.series, todayIso);
      if (!bsCiWornNight(day)) return;
      confirmed.current = { ...confirmed.current, sleep: day.sleep, device: true };
      setToday((cur) => ({ ...cur, sleep: day.sleep, device: true }));
    }).catch(() => {});
    return () => { on = false; };
  }, [signedIn, ready, uid, todayIso]);

  // ⚠ THE SHEET IS A DIALOG (review on #2398): each step starts at its top with its question
  // focused, so a screen reader reads it and the tile just tapped does not drop focus to the
  // page; Escape closes it; and closing hands focus back to what opened it, or to the card.
  const sheetRef = useRef(null);
  const cardRef = useRef(null);
  const openerRef = useRef(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (walk != null) {
      wasOpen.current = true;
      const el = sheetRef.current;
      if (!el) return;
      el.scrollTop = 0;
      el.querySelector('h1')?.focus?.({ preventScroll: true });
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const back = openerRef.current && openerRef.current.isConnected ? openerRef.current : cardRef.current?.querySelector('button');
    back?.focus?.({ preventScroll: true });
  }, [walk]);

  // ⚠ A DAILY CHECK-IN REMINDER OPENS THE WALKTHROUGH (owner, 2026-10-18), at the first morning
  // question not yet answered, or at the summary when the morning is done. It waits for today's read,
  // so the read never lands over an answer given meanwhile, and tells Home the request is used, so a
  // card mounted again later (Check-ins switched off and on) does not open it a second time. It opens
  // the sheet the way Start does, written out here because the effect runs before this render has
  // reached `open` below whenever the card returns early.
  useEffect(() => {
    if (!openRequest || !ready || bsCiIso(new Date()) !== todayIso) return;
    if (onOpenRequestConsumed) onOpenRequestConsumed();
    const step = bsCiStep(today, skippedDay === todayIso);
    openerRef.current = document.activeElement;
    setSleepH(null); setRestedPick(null); setErr(null); setFromSummary(false);
    setWalk(step === 'done' ? BS_CI_SUMMARY : BS_CI_STEPS.indexOf(step));
  }, [openRequest, ready, todayIso]);

  // A card whose day is over shows nothing and saves nothing; Home's next render mounts the new day's.
  if (bsCiIso(now) !== todayIso) return null;
  if (!ready) return null;
  const sleepSkipped = skippedDay === todayIso;
  const status = bsCiStep(today, sleepSkipped);
  if (walk == null && status !== 'done' && now.getHours() < BS_CI_ASK_FROM_HOUR) return null;

  // Save one answer: shown at once, written in the background. Signed out nothing is written, and
  // the done line says so instead of claiming a check-in.
  // ⚠ A FAILED SAVE PUTS BACK ONLY ITS OWN ANSWERS, and only where no newer answer has replaced
  // them (Codex P2 on #2398): an answer queued behind it may still save, and putting back the
  // whole day would hide an answer that is stored.
  const answer = (patch) => {
    if (bsCiIso(new Date()) !== todayIso) { bump((n) => n + 1); return; }
    const merged = { ...today };
    const fields = [];
    if (patch.energy != null) { merged.energy = patch.energy; fields.push('energy'); }
    if (patch.hunger != null) { merged.hunger = patch.hunger; fields.push('hunger'); }
    if (patch.sleepHours != null) { merged.sleep = patch.sleepHours; merged.device = false; fields.push('sleep'); }
    if (patch.sleepQuality != null) { merged.rested = patch.sleepQuality; fields.push('rested'); }
    const mine = {};
    for (const k of fields) { latest.current.n += 1; latest.current[k] = latest.current.n; mine[k] = latest.current.n; }
    setToday(merged);
    setErr(null);
    if (!signedIn) return;
    // Saves run one at a time, so when this one settles every earlier one has, and `confirmed`
    // is what is stored. (Typed hours set `device` false above. A watch's night shows no stepper,
    // and one that synced after the read stands over the typed hours: the route says so, and the
    // watch's hours are shown. Hours typed again before this answered are refused the same way.)
    const landed = (d) => {
      for (const k of fields) confirmed.current = { ...confirmed.current, [k]: merged[k] };
      if (!d || !d.sleepFromDevice || d.sleepHours == null) return;
      const h = Number(d.sleepHours);
      confirmed.current = { ...confirmed.current, sleep: h, device: true };
      if (alive.current) setToday((cur) => ({ ...cur, sleep: h, device: true }));
    };
    const undo = (msg) => {
      setToday((cur) => {
        const back = { ...cur };
        for (const k of fields) if (latest.current[k] === mine[k]) back[k] = confirmed.current[k];
        return back;
      });
      setErr(msg);
    };
    if (!window.ShapeCheckin?.log) { undo('unavailable'); return; }
    bsCiSave(patch, uid).then(landed, () => { if (alive.current) undo('failed'); });
  };
  const streak = streakBefore + (bsCiAnswered(today) ? 1 : 0);

  // ── walkthrough navigation ──
  const reset = () => { setSleepH(null); setRestedPick(null); setErr(null); };
  const open = (i, back) => {
    if (walk == null) openerRef.current = document.activeElement;
    reset(); setFromSummary(!!back); setWalk(i);
  };
  const close = () => { reset(); setFromSummary(false); setWalk(null); };
  const next = () => {
    setSleepH(null); setRestedPick(null);
    if (fromSummary) { setFromSummary(false); setWalk(BS_CI_SUMMARY); return; }
    setWalk((i) => (typeof i === 'number' ? Math.min(BS_CI_SUMMARY, i + 1) : i));
  };
  const back = () => { setSleepH(null); setRestedPick(null); setFromSummary(false); setWalk((i) => (typeof i === 'number' ? Math.max(0, i - 1) : i)); };
  // ⚠ A SKIPPED NIGHT IS TOLD TO THE SERVER (owner, 2026-10-19: "yes fix"). The reminder counts a
  // morning answered once its energy is in and its night is answered, measured or skipped; a skip
  // kept only on this device read as an open night, so it could not hold a finished morning apart
  // from energy saved alone, as the website's old daily card saved it. A save that fails keeps the
  // skip on this device only: the reminder then reads the night as open, a reminder too many at worst.
  const skipNight = () => {
    bsCiWriteSkip(uid, todayIso);
    setSkippedDay(todayIso);
    if (signedIn && window.ShapeCheckin?.log) bsCiSave({ sleepSkipped: true }, uid).catch(() => {});
    next();
  };
  const answered = { sleep: today.sleep != null || sleepSkipped, energy: today.energy != null };
  const manual = bsCiAnswered(today);
  // Start opens the night, even one a watch filled in: it is where its hours and How did you wake
  // up? are. A night skipped today is not opened again, as the reminder skips it too. Continue opens
  // the first morning question still open.
  const firstOpen = () => { if (!manual && !sleepSkipped) return 0; const i = BS_CI_STEPS.findIndex((k) => !answered[k]); return i < 0 ? BS_CI_SUMMARY : i; };

  // The evening question: a member with a nutritionist, from 6 p.m., until today's hunger is in.
  const hungerAsked = signedIn && coaching.nutritionist === true;
  const evening = now.getHours() >= BS_CI_EVENING_FROM_HOUR;
  const eveningOpen = hungerAsked && evening && today.hunger == null;
  const answerHunger = (v) => {
    answer({ hunger: v });
    if (fromSummary) { setFromSummary(false); setWalk(BS_CI_SUMMARY); } else close();
  };

  const { E, H, R } = bsCiWords(tr);
  const word = (list, v) => { const i = bsCiWordIndex(v); return i == null ? null : list[i]; };
  const locale = window.ShapeI18n?.intlLocale?.() || undefined;
  const lower = (w) => bsCiLower(w);
  const hm = (h) => bsCiHM(h, (hh, mm) => (mm == null
    ? tr('home:checkin.hOnly', { defaultValue: '{h}h', h: hh })
    : tr('home:checkin.hm', { defaultValue: '{h}h {m}', h: hh, m: mm })));
  const NAME = {
    energy: tr('home:today.energy', { defaultValue: 'Energy' }),
    hunger: tr('home:today.hunger', { defaultValue: 'Hunger' }),
    sleep: tr('home:today.sleep', { defaultValue: 'Sleep' }),
  };
  const WHEN = {
    sleep: tr('home:checkin.lastNight', { defaultValue: 'Last night' }),
    energy: tr('home:checkin.thisMorning', { defaultValue: 'This morning' }),
  };

  const same = bsCiSamePatch(yesterday, today, sleepSkipped);
  // The line says exactly what the tap writes, built from the patch itself: never a skipped night's
  // hours or Rested, nor an answer today already has (review on this PR).
  const sameLine = same ? [same.energy != null ? word(E, same.energy) : null, same.sleepHours != null ? hm(same.sleepHours) : null, same.sleepQuality != null ? word(R, same.sleepQuality) : null].filter(Boolean).join(' · ') : '';
  const wornNight = bsCiWornNight(today);
  const sleepFromUsual = sleepH == null && !(today.sleep != null && !today.device);
  const sleepValue = sleepH != null ? sleepH : (sleepFromUsual ? usual : today.sleep);
  const restedValue = restedPick != null ? restedPick : today.rested;
  // A night skipped today and opened again (Edit) shows the usual night on the stepper, but nothing
  // was given: walked past untouched, it stays skipped (review on this PR: Next saved the usual
  // night as hours the member typed).
  const skippedUntouched = sleepSkipped && today.sleep == null && sleepH == null && restedPick == null;

  // What the answers mean: today's read, the week's line, and who sees them.
  const readKey = bsCiTodayRead(today, usual);
  const coached = coaching.trainer === true || coaching.nutritionist === true;
  const readText = bsCiTodayReadText(tr, readKey, coached);
  const weekLine = bsCiWeekLine(week, today);
  const weekText = !weekLine ? null
    : weekLine.kind === 'sleepShort' ? tr('home:checkin.weekSleepShort', { defaultValue: 'Short on sleep this week: {hours} a night.', hours: hm(Math.round(weekLine.hours * 12) / 12) })
    : weekLine.kind === 'energyLow' ? tr('home:checkin.weekEnergyLow', { defaultValue: 'Your energy has been {word} on average this week. A lighter session still counts.', word: lower(E[weekLine.word]) })
    : weekLine.kind === 'mostly' ? tr('home:checkin.weekMostly', { defaultValue: 'Mostly {word} mornings this week.', word: lower(E[weekLine.word]) })
    : tr('home:checkin.weekMore', { defaultValue: '{n, plural, one {# more morning and your week shows here.} other {# more mornings and your week shows here.}}', n: weekLine.n });
  // The morning's readiness (§3.8), for the done line: the answers shown here, the night's hours
  // whenever there are some (a skip's too: hours win over a skip, as today's read counts them), and
  // the watch's readings dated today off the same read. Null until energy is in. Signed out it is the
  // preview's own answers, like today's read.
  const readiness = morningReadiness({ energy: today.energy, rested: today.rested, sleepHours: today.sleep, usualNight: usual, watch });
  const readinessText = readiness ? tr('home:mornings.readinessLine', { defaultValue: 'Readiness {score} · {band}', score: readiness.score, band: bsCiBandWords(tr)[readiness.band] }) : null;
  // Coaches see the answers themselves (the nutritionist's day review shows each day's), never readiness
  // or What we've noticed (§3.4, ruling 18), so the line says answers, not "7-day averages".
  const who = signedIn ? bsCiWhoSees(coaching) : null;
  const whoText = who === 'both' ? tr('home:checkin.whoBoth', { defaultValue: 'Your trainer and nutritionist see your answers.' })
    : who === 'trainer' ? tr('home:checkin.whoTrainer', { defaultValue: 'Your trainer sees your answers.' })
    : who === 'nutritionist' ? tr('home:checkin.whoNutritionist', { defaultValue: 'Your nutritionist sees your answers.' })
    : who === 'you' ? tr('home:checkin.whoYou', { defaultValue: 'Only you see these.' })
    : null;

  const mono = { fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' };
  const btnPrimary = { flex: 1, minHeight: 52, borderRadius: 5, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', ...mono, fontSize: 10.5, letterSpacing: '0.14em' };
  const btnGhost = { minHeight: 52, padding: '0 18px', borderRadius: 5, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, cursor: 'pointer', ...mono, fontSize: 10, letterSpacing: '0.14em' };
  const errLine = err ? (
    <div role="alert" style={{ fontFamily: t.BODY, fontSize: 12.5, lineHeight: 1.35, color: t.RUST }}>
      {err === 'unavailable' ? tr('home:today.checkinUnavailable', { defaultValue: 'Check-in is unavailable — try again' })
        : tr('home:today.checkinFailed', { defaultValue: 'Could not save check-in — try again' })}
    </div>
  ) : null;
  // Your mornings → (§3.5), on the done line and the summary, wherever Home gives the door; signed out
  // too, where the page shows example mornings. From the summary the sheet closes first, so it never
  // stays over the page, and Home then unmounts the card with it.
  const morningsLink = (fromSheet) => (onMornings ? (
    <button type="button" data-bs-checkin-mornings="" onClick={() => { if (fromSheet) close(); onMornings(); }} style={{ alignSelf: 'flex-start', minHeight: fromSheet ? 44 : 34, padding: '4px 0', border: 0, background: 'transparent', color: teal, cursor: 'pointer', ...mono, fontSize: fromSheet ? 10 : 8.5, letterSpacing: '0.12em' }}>
      {tr('home:mornings.link', { defaultValue: 'Your mornings' })}<span aria-hidden> →</span>
    </button>
  ) : null);

  // A word in a narrow tile or cell: a step smaller and tighter when it is long (German, Russian,
  // Portuguese at 320 px with Large text), and hyphenated in the page's language where it must break.
  const fit = (text, base) => {
    const n = Math.max(0, ...String(text || '').split(/\s+/).map((x) => x.length));
    return { fontSize: n >= 10 ? base - 1.5 : n >= 7 ? base - 1 : base, letterSpacing: n >= 7 ? '0.01em' : '0.05em', overflowWrap: 'anywhere', hyphens: 'auto', WebkitHyphens: 'auto' };
  };

  // The five-word answers, as tiles with a rising bar.
  const tiles = (prefix, words, color, current, onPick) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 7 }}>
      {words.map((w, i) => {
        const on = bsCiWordIndex(current) === i;
        return (
          <button key={`${prefix}${i}`} type="button" aria-pressed={on} onClick={() => onPick(BS_CI_STORED[i])} style={{
            minHeight: 72, borderRadius: 5, cursor: 'pointer', padding: '6px 2px',
            border: `1px solid ${on ? color : t.RULE}`, background: on ? color : 'transparent', color: on ? t.PAPER : t.INK,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9,
          }}>
            <span aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18 }}>
              {[0, 1, 2, 3, 4].map((b) => <span key={b} style={{ width: 3.5, height: 5 + b * 3.2, background: b <= i ? (on ? t.PAPER : color) : t.RULE }} />)}
            </span>
            <span style={{ fontFamily: t.MONO, fontWeight: 800, textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.15, maxWidth: '100%', ...fit(w, 8.5) }}>{w}</span>
          </button>
        );
      })}
    </div>
  );

  // The last seven days under a step. `onPick` reuses a day's answer; `tip` and `trend` frame it.
  const strip = (kind, color, tip, trend, onPick) => (
    <div data-bs-checkin-week={kind} style={{ borderTop: `1px solid ${t.HAIR}`, paddingTop: 13, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
        <span style={{ ...mono, color: t.INK50 }}>{tr('home:checkin.last7', { defaultValue: 'Your last 7 days' })}</span>
        {tip ? <span style={{ fontFamily: t.BODY, fontSize: 11.5, color: t.INK50, textAlign: 'right' }}>{tip}</span> : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3 }}>
        {week.map((d, i) => {
          const v = d[kind];
          const has = v != null;
          const pct = !has ? 0 : kind === 'sleep' ? Math.min(1, v / 10) : ((bsCiWordIndex(v) || 0) + 1) / 5;
          const label = !has ? '—' : kind === 'energy' ? word(E, v) : kind === 'hunger' ? word(H, v) : hm(v);
          const [y, m, dd] = d.iso.split('-').map(Number);
          const date = new Date(y, m - 1, dd, 12);
          const dayName = date.toLocaleDateString(locale, { weekday: 'short' });
          const pick = onPick && has ? () => onPick(d) : null;
          const isYesterday = i === week.length - 1;
          const cell = (
            <>
              <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{dayName}</span>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1 }}>{dd}</span>
              <span aria-hidden style={{ width: 14, height: 44, background: t.HAIR, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.round(pct * 100)}%`, background: color, opacity: 0.85 }} />
              </span>
              <span style={{ fontFamily: t.MONO, fontWeight: 800, textTransform: 'uppercase', color: has ? t.INK : t.INK50, textAlign: 'center', lineHeight: 1.15, minHeight: 18, maxWidth: '100%', ...fit(label, 7.5) }}>{label}</span>
            </>
          );
          const cellStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0 7px', borderRadius: 5, border: `1px solid ${isYesterday ? t.RULE : 'transparent'}`, background: 'transparent', color: t.INK, minWidth: 0 };
          return pick ? (
            <button key={d.iso} type="button" onClick={pick} aria-label={`${dayName} ${dd}: ${label}`} style={{ ...cellStyle, cursor: 'pointer' }}>{cell}</button>
          ) : (
            <div key={d.iso} role="img" aria-label={`${dayName} ${dd}: ${has ? label : noAnswer}`} style={cellStyle}>{cell}</div>
          );
        })}
      </div>
      {trend ? <div style={{ marginTop: 10, fontFamily: t.BODY, fontSize: 12.5, color: t.INK70, lineHeight: 1.4 }}>{trend}</div> : null}
    </div>
  );
  const mostlyLine = (list, kind) => {
    const i = bsCiMostly(week.map((d) => d[kind]));
    if (i == null) return null;
    // Mid-sentence the word is lower case: "Mostly good this week", "Diese Woche meist gut".
    return tr('home:checkin.trendMostly', { defaultValue: 'Mostly {word} this week.', word: lower(list[i]) });
  };
  const tapTip = tr('home:checkin.tapReuse', { defaultValue: 'Tap a day to reuse it' });
  const noAnswer = tr('home:checkin.noAnswer', { defaultValue: 'No answer' });
  // The stepper's line under the hours: the usual night, or how far the night is from it.
  const usualLine = () => {
    if (skippedUntouched) return tr('home:checkin.skipped', { defaultValue: 'Skipped' });
    if (sleepFromUsual) return tr('home:checkin.usualNight', { defaultValue: 'Your usual night' });
    const diff = Math.round((sleepValue - usual) * 2) / 2;
    if (!diff) return tr('home:checkin.usualNight', { defaultValue: 'Your usual night' });
    // Under an hour reads in minutes ("30 min"), never "0h 30".
    const gap = Math.abs(diff) < 1 ? tr('home:checkin.mOnly', { defaultValue: '{m} min', m: Math.round(Math.abs(diff) * 60) }) : hm(Math.abs(diff));
    return diff < 0
      ? tr('home:checkin.underUsual', { defaultValue: '{diff} under your usual', diff: gap })
      : tr('home:checkin.overUsual', { defaultValue: '{diff} over your usual', diff: gap });
  };

  // ── one screen of the walkthrough ──
  const screen = () => {
    if (walk === BS_CI_SUMMARY) {
      const row = (kind, value, onPick) => (
        <button key={kind} type="button" onClick={onPick} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '12px 14px', border: `1px solid ${t.RULE}`, borderRadius: 5, background: 'transparent', color: t.INK, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ ...mono, letterSpacing: '0.14em', color: COLOR[kind] }}>{NAME[kind]}</span>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 19, color: value ? t.INK : t.INK50, minWidth: 0 }}>{value || '—'}</span>
          <span style={{ ...mono, letterSpacing: '0.12em', color: t.INK70 }}>{tr('home:checkin.change', { defaultValue: 'Change' })}<span aria-hidden> ›</span></span>
        </button>
      );
      const sleepText = today.sleep != null ? [hm(today.sleep), today.rested != null ? word(R, today.rested) : null].filter(Boolean).join(' · ') : sleepSkipped ? tr('home:checkin.skipped', { defaultValue: 'Skipped' }) : null;
      const done = status === 'done';
      return (
        <>
          <span style={{ ...mono, color: teal }}>{done ? tr('home:checkin.allDone', { defaultValue: 'All checks done' }) : tr('home:checkin.nearly', { defaultValue: 'Nearly there' })}</span>
          <h1 tabIndex={-1} style={{ margin: 0, fontFamily: t.DISPLAY, fontWeight: 300, fontSize: 32, letterSpacing: '-0.02em', lineHeight: 1.08, color: t.INK, outline: 'none' }}>
            {!signedIn ? tr('home:today.joinToSave', { defaultValue: 'Join Shape to save your check-in' })
              : done ? <>{tr('home:checkin.checkedIn', { defaultValue: "You're checked in" })} <span style={{ color: teal }}>✓</span></>
              : tr('home:checkin.notYet', { defaultValue: 'A check is still open' })}
          </h1>
          {readText ? <p data-bs-checkin-read="" style={{ margin: 0, fontFamily: t.BODY, fontSize: 16.5, lineHeight: 1.4, color: t.INK }}>{readText}</p> : null}
          {weekText ? <p data-bs-checkin-weekline="" style={{ margin: 0, fontFamily: t.BODY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>{weekText}</p> : null}
          {errLine}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {row('sleep', sleepText, () => open(0, true))}
            {row('energy', word(E, today.energy), () => open(1, true))}
            {hungerAsked && (today.hunger != null || evening) ? row('hunger', word(H, today.hunger), () => open('evening', true)) : null}
          </div>
          {signedIn && !err ? <p style={{ margin: 0, fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 }}>{tr('home:checkin.savedAsYouWent', { defaultValue: 'Saved as you went. Change any answer below, or come back to it from Home.' })}</p> : null}
          {whoText ? <p data-bs-checkin-who="" style={{ margin: 0, fontFamily: t.BODY, fontSize: 13, lineHeight: 1.45, color: t.INK50 }}>{whoText}</p> : null}
          {morningsLink(true)}
          {signedIn && streak >= 2 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, padding: 14, border: `1px solid ${t.RULE}`, borderRadius: 5 }}>
              <span aria-hidden style={{ display: 'flex', gap: 5 }}>{Array.from({ length: Math.min(7, streak) }, (_, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 99, background: amber }} />)}</span>
              <span style={{ ...mono, color: amber, letterSpacing: '0.12em' }}>{tr('home:checkin.streak', { defaultValue: '{n, plural, one {# day running} other {# days running}}', n: streak })}</span>
            </div>
          ) : null}
        </>
      );
    }
    const head = (label, color, askKey, askDefault, whyKey, whyDefault) => (
      <>
        <span style={{ ...mono, color }}>{label}</span>
        <h1 tabIndex={-1} style={{ margin: 0, fontFamily: t.DISPLAY, fontWeight: 300, fontSize: 32, letterSpacing: '-0.02em', lineHeight: 1.08, color: t.INK, outline: 'none' }}>{tr(askKey, { defaultValue: askDefault })}</h1>
        <p style={{ margin: 0, fontFamily: t.BODY, fontSize: 14.5, lineHeight: 1.45, color: t.INK70 }}>{tr(whyKey, { defaultValue: whyDefault })}</p>
        {errLine}
      </>
    );
    if (walk === 'evening') {
      return (
        <>
          {head(tr('home:checkin.eveningLabel', { defaultValue: 'Tonight · Hunger' }), amber, 'home:checkin.askHunger', 'How hungry did you get between meals today?', 'home:checkin.whyHunger', 'Your nutritionist reads this beside what you ate. Hungry most days can mean your meals are running light.')}
          {tiles('h', H, amber, today.hunger, answerHunger)}
          {strip('hunger', amber, tapTip, mostlyLine(H, 'hunger'), (d) => answerHunger(d.hunger))}
        </>
      );
    }
    const kind = BS_CI_STEPS[walk];
    const color = COLOR[kind];
    const label = tr('home:checkin.stepLabel', { defaultValue: 'Step {n} of {total} · {name}', n: walk + 1, total: BS_CI_STEPS.length, name: WHEN[kind] });
    if (kind === 'energy') {
      return (
        <>
          {coaching.trainer === true
            ? head(label, color, 'home:checkin.askEnergy', "How's your energy this morning?", 'home:checkin.whyEnergyTrainer', 'Your trainer sees this before your session. On low mornings training should ease off, so an honest "Low" helps.')
            : head(label, color, 'home:checkin.askEnergy', "How's your energy this morning?", 'home:checkin.whyEnergy', 'How much you have in the tank this morning. After low mornings Home suggests lighter days, so an honest "Low" helps.')}
          {tiles('e', E, color, today.energy, (v) => { answer({ energy: v }); next(); })}
          {strip('energy', color, tapTip, mostlyLine(E, 'energy'), (d) => { answer({ energy: d.energy }); next(); })}
        </>
      );
    }
    // sleep
    return (
      <>
        {head(label, color, 'home:checkin.askSleep', 'How did you sleep?', 'home:checkin.whySleep', 'Hours of sleep last night, the biggest lever on recovery. Shape sets it beside your energy. A connected watch fills this in.')}
        {wornNight ? (
          <div style={{ textAlign: 'center', padding: '6px 0' }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: t.INK }}>{hm(today.sleep)}</div>
            <div style={{ ...mono, marginTop: 6, fontSize: 8.5, color: t.INK50 }}>{tr('home:checkin.fromWatch', { defaultValue: 'From your watch' })}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <button type="button" aria-label={tr('home:checkin.less', { defaultValue: 'Thirty minutes less' })} onClick={() => setSleepH(Math.max(3, sleepValue - 0.5))} style={{ width: 54, height: 54, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontSize: 24, cursor: 'pointer' }}>−</button>
            <div style={{ textAlign: 'center' }}>
              <div aria-live="polite" style={{ fontFamily: t.DISPLAY, fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{hm(sleepValue)}</div>
              <div style={{ ...mono, marginTop: 6, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50 }}>{usualLine()}</div>
            </div>
            <button type="button" aria-label={tr('home:checkin.more', { defaultValue: 'Thirty minutes more' })} onClick={() => setSleepH(Math.min(12, sleepValue + 0.5))} style={{ width: 54, height: 54, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontSize: 24, cursor: 'pointer' }}>+</button>
          </div>
        )}
        {/* Rested is the member's own check, so a wearable's night still offers it (Codex P2 on #2398). */}
        <div style={{ ...mono, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50 }}>{tr('home:checkin.restedOptional', { defaultValue: 'How did you wake up? · optional' })}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
          {R.map((w, i) => {
            const on = bsCiWordIndex(restedValue) === i;
            return (
              <button key={`r${i}`} type="button" aria-pressed={on} onClick={() => setRestedPick(on ? null : BS_CI_STORED[i])} style={{ minHeight: 44, borderRadius: 5, cursor: 'pointer', padding: '4px 2px', border: `1px solid ${on ? color : t.RULE}`, background: on ? color : 'transparent', color: on ? t.PAPER : t.INK, fontFamily: t.MONO, fontWeight: 800, textTransform: 'uppercase', ...fit(w, 8) }}>{w}</button>
            );
          })}
        </div>
        {strip('sleep', color, wornNight ? null : tapTip, null, wornNight ? null : (d) => { setSleepH(d.sleep); if (d.rested != null) setRestedPick(d.rested); })}
      </>
    );
  };

  const foot = () => {
    if (walk === BS_CI_SUMMARY) return <button type="button" onClick={close} style={btnPrimary}>{tr('home:checkin.doneButton', { defaultValue: 'Done' })}</button>;
    if (walk === 'evening') return null;
    const kind = BS_CI_STEPS[walk];
    if (kind === 'sleep') {
      return (
        <>
          {wornNight ? null : <button type="button" onClick={skipNight} style={btnGhost}>{tr('home:checkin.skip', { defaultValue: 'Skip' })}</button>}
          <button type="button" onClick={() => {
            // A wearable's hours are never re-typed; its Rested is saved on its own when picked. A night
            // walked through again unchanged (Edit, then Next) writes nothing.
            const unchanged = skippedUntouched || (!today.device && sleepValue === today.sleep && restedValue === today.rested);
            if (!wornNight && !unchanged) answer({ sleepHours: sleepValue, ...(restedValue != null ? { sleepQuality: restedValue } : {}) });
            else if (wornNight && restedPick != null && restedPick !== today.rested) answer({ sleepQuality: restedPick });
            next();
          }} style={btnPrimary}>{tr('home:checkin.next', { defaultValue: 'Next →' })}</button>
        </>
      );
    }
    // energy, the last morning step
    const can = answered.energy;
    return <button type="button" disabled={!can} onClick={next} style={{ ...btnPrimary, opacity: can ? 1 : 0.35, cursor: can ? 'pointer' : 'default' }}>{tr('home:checkin.finish', { defaultValue: 'Finish ✓' })}</button>;
  };

  const isStep = typeof walk === 'number' && walk < BS_CI_SUMMARY;
  const sheet = walk == null ? null : (
    // `bsck-scroll` and `data-bs-layer`: in the native app a drag is routed by getTargetScroller
    // (iosAppBroadsheet.jsx), which scrolled Home behind the sheet, and Finish sat below the fold
    // of a small phone (review on #2398). The class has no style of its own.
    <div ref={sheetRef} className="bsck-scroll" data-bs-layer="checkin" role="dialog" aria-modal="true" aria-label={tr('home:checkin.title', { defaultValue: 'Morning check-in' })} data-bs-checkin-walk={walk}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }} style={{ position: 'absolute', inset: 0, zIndex: 250, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top, 0px) + 18px) 20px 10px' }}>
        {/* Back on every morning screen after the first, the summary included: a Change is never more
            than one tap away (owner, 2026-10-19: "i cant go back and change any of my entries"). */}
        <button type="button" onClick={back} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: t.INK70, cursor: 'pointer', visibility: typeof walk === 'number' && walk > 0 ? 'visible' : 'hidden', ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' }}>{tr('home:checkin.back', { defaultValue: '← Back' })}</button>
        <span style={{ ...mono, color: t.INK50 }}>{walk === 'evening' ? tr('home:checkin.tonight', { defaultValue: 'Tonight' }) : tr('home:checkin.title', { defaultValue: 'Morning check-in' })}</span>
        <button type="button" onClick={close} aria-label={tr('home:checkin.close', { defaultValue: 'Close' })} style={{ width: 44, height: 44, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
      {walk === 'evening' ? null : (
        <div aria-hidden style={{ display: 'grid', gridTemplateColumns: `repeat(${BS_CI_STEPS.length}, minmax(0, 1fr))`, gap: 6, padding: '4px 20px 0' }}>
          {BS_CI_STEPS.map((k, i) => {
            const on = isStep && i === walk;
            const ok = answered[k];
            return (
              <span key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <span style={{ height: 3, background: on ? COLOR[k] : ok ? t.INK70 : t.HAIR }} />
                <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: on ? COLOR[k] : ok ? t.INK70 : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ok && !on ? '✓ ' : ''}{NAME[k]}</span>
              </span>
            );
          })}
        </div>
      )}
      <div style={{ padding: '22px 20px 0', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>{screen()}</div>
      <div style={{ padding: '18px 20px calc(env(safe-area-inset-bottom, 0px) + 24px)', display: 'flex', gap: 10 }}>{foot()}</div>
    </div>
  );
  const host = typeof document !== 'undefined' ? (document.getElementById('bs-phone-surface') || document.body) : null;

  // ── the card on Home ──
  const done = status === 'done';
  const eveningRow = eveningOpen ? (
    <div data-bs-checkin-evening="" style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${t.HAIR}`, paddingTop: 10 }}>
      <span style={{ ...mono, fontSize: 8.5, color: amber }}>{tr('home:checkin.tonight', { defaultValue: 'Tonight' })}</span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>{tr('home:checkin.eveningRow', { defaultValue: 'How hungry did you get today?' })}</span>
      <button type="button" onClick={() => open('evening')} style={{ minHeight: 34, padding: '5px 11px', borderRadius: 4, border: `1px solid ${amber}80`, background: `${amber}14`, color: amber, cursor: 'pointer', ...mono, fontSize: 8.5, letterSpacing: '0.1em' }}>{tr('home:checkin.answer', { defaultValue: 'Answer →' })}</button>
    </div>
  ) : null;
  return (
    <>
      <div ref={cardRef} data-bs-checkin-card="" style={{ margin: `10px ${t.padX}px 4px`, padding: '14px 13px 12px', border: `1px solid ${done ? t.RULE : `${teal}66`}`, background: t.PAPER2 || t.PAPER, clipPath: 'polygon(0 0, calc(100% - 13px) 0, 100% 13px, 100% 100%, 0 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ ...mono, color: teal }}>{tr('home:checkin.title', { defaultValue: 'Morning check-in' })}</span>
          {done ? null : <span style={{ ...mono, fontWeight: 700, letterSpacing: '0.1em', color: t.INK50 }}>{tr('home:checkin.cardMeta', { defaultValue: '2 checks · 15 sec' })}</span>}
        </div>

        {done ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: signedIn ? 21 : 16, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, color: t.INK }}>
                {signedIn ? <>{tr('home:checkin.done', { defaultValue: 'Checked in' })} <span style={{ color: teal }}>✓</span></> : tr('home:today.joinToSave', { defaultValue: 'Join Shape to save your check-in' })}
              </div>
              <div style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70, lineHeight: 1.4 }}>
                {[
                  today.sleep != null ? `${NAME.sleep} ${hm(today.sleep)}` : null,
                  today.rested != null ? word(R, today.rested) : null,
                  today.energy != null ? `${NAME.energy} ${word(E, today.energy)}` : null,
                  today.hunger != null ? `${NAME.hunger} ${word(H, today.hunger)}` : null,
                ].filter(Boolean).join(' · ')}
              </div>
              {readText ? <div data-bs-checkin-read="" style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK, lineHeight: 1.4 }}>{readText}</div> : null}
              {signedIn && streak >= 2 ? (
                <div style={{ ...mono, fontSize: 8.5, color: amber }}>{tr('home:checkin.streak', { defaultValue: '{n, plural, one {# day running} other {# days running}}', n: streak })}</div>
              ) : null}
              {readinessText ? <div data-bs-checkin-readiness="" style={{ ...mono, fontSize: 8.5, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{readinessText}</div> : null}
              {morningsLink(false)}
            </div>
            <button type="button" onClick={() => open(0)} style={{ flex: 'none', minHeight: 34, padding: '5px 11px', borderRadius: 4, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', ...mono, fontSize: 8.5 }}>{tr('home:action.edit', { defaultValue: 'Edit' })}</button>
          </div>
        ) : (
          <>
            <h2 style={{ margin: 0, fontFamily: t.DISPLAY, fontWeight: 300, fontSize: 25, letterSpacing: '-0.02em', lineHeight: 1.1, color: t.INK }}>
              {tr('home:checkin.cardTitle', { defaultValue: 'Two quick checks.' })}{signedIn ? <><br />{tr('home:checkin.cardSub', { defaultValue: 'Saved as you go.' })}</> : null}
            </h2>
            <div aria-hidden style={{ display: 'grid', gridTemplateColumns: `repeat(${BS_CI_STEPS.length}, minmax(0, 1fr))`, gap: 6 }}>
              {BS_CI_STEPS.map((k) => (
                <span key={k} style={{ borderTop: `3px solid ${answered[k] ? COLOR[k] : t.HAIR}`, paddingTop: 7, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: answered[k] ? t.INK : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{answered[k] ? '✓ ' : ''}{NAME[k]}</span>
              ))}
            </div>
            {errLine}
            <button type="button" onClick={() => open(firstOpen())} style={{ ...btnPrimary, flex: 'none' }}>
              {manual ? tr('home:checkin.continue', { defaultValue: 'Continue →' }) : tr('home:checkin.start', { defaultValue: 'Start check-in →' })}
            </button>
            {same ? (
              <button type="button" onClick={() => answer(same)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minHeight: 56, padding: '8px 10px', borderRadius: 5, border: `1px dashed ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer' }}>
                <span style={{ ...mono, fontSize: 8.5, color: teal }}>{tr('home:checkin.same', { defaultValue: 'Same as yesterday' })} ✓</span>
                <span style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>{sameLine}</span>
              </button>
            ) : null}
          </>
        )}

        {done ? errLine : null}
        {eveningRow}
      </div>
      {sheet && host ? createPortal(sheet, host) : sheet}
    </>
  );
}

// ⚠ ONE CARD PER LOCAL DAY (Codex P2s on #2398). Every piece of the card's state belongs to the day
// it was read for: the answers, the open walkthrough, the save versions. So a new day mounts a new
// card rather than carrying any of it across midnight. A walkthrough open at midnight closes, and a
// save from the day before that fails after midnight lands on the old, unmounted card and changes
// nothing. `onOpen` is Home's door to Your mornings: the done line's and the summary's "Your
// mornings →" (onMornings), shown only when Home gives it.
export function BSCheckinCard(props) {
  const day = bsCiIso(new Date());
  return <BSCheckinDay key={day} dayIso={day} openRequest={props.openRequest} onOpenRequestConsumed={props.onOpenRequestConsumed} onMornings={props.onOpen || null} />;
}
