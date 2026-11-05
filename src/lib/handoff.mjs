// The care-team hand-off line (owner, 2026-11-05: "when a coach changes a shared client's plan, post an
// automatic line to the care-team thread"): what changed, said once, in the English the thread keeps
// and as the notice copy (noticeCopy.mjs) the other coach's bell and push say in their language.
//
// Pure: the save paths (src/lib/care-team.mjs tellCareTeam) read what was there before, hand both
// sides here and post what comes back. Nothing here reads or writes.
//
//   mealPlanChanges(prevDays, nextDays)  the target changes between two published menus
//   mealPlanHandoff({...})               "Rae raised carbs on training days, 160 → 190 g from Mon, Nov 2."
//   programHandoff({...})                "Maya started Hypertrophy Reset from Mon, Nov 9."
//   adjustHandoff({...})                 "Maya adjusted the training plan (deload) from Tue, Nov 3."
//   weekOneHandoff({...})                "Maya set week one to 3 workouts."
// Each answers { title, body, copy: { title, body } }, or null when there is nothing to say.

import { np, onDay, phrase } from '../../mobile-app/src/services/noticeCopy.mjs';

// The targets a menu day carries (dashMealCore.js buildMealAssignment: targets { cal, p, c, f }).
export const HANDOFF_METRICS = Object.freeze(['cal', 'p', 'c', 'f']);
const METRIC_WORD = Object.freeze({ cal: 'calories', p: 'protein', c: 'carbs', f: 'fat' });
const METRIC_UNIT = Object.freeze({ cal: 'kcal', p: 'g', c: 'g', f: 'g' });
const DAYS_WORD = Object.freeze({ training: 'training days', rest: 'rest days', all: 'every day' });
const MODE_WORD = Object.freeze({ deload: 'deload', maintain: 'same loads', progress: 'loads up' });
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
const clean = (s, max = 80) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

// "Mon, Nov 2" for a YYYY-MM-DD, as the catalog's onDay(…, 'weekday') says it in English.
export function weekdayDay(ymd) {
  if (typeof ymd !== 'string' || !YMD.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  if (at.getUTCMonth() !== m - 1) return null;
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(at);
}

// A menu's targets on its training days and on its rest days: the first day of each kind (a published
// menu scales one set of targets per kind, buildMealAssignment). A day without a tag is a training day,
// as the plan reads it. A kind with no day, or a day without targets, is null.
export function targetsByKind(days) {
  const out = { training: null, rest: null };
  for (const day of Array.isArray(days) ? days : []) {
    if (!day || typeof day !== 'object') continue;
    const kind = String(day.tag || '').toUpperCase() === 'REST' ? 'rest' : 'training';
    if (out[kind]) continue;
    const t = day.targets && typeof day.targets === 'object' ? day.targets : null;
    if (!t) continue;
    const row = {};
    for (const k of HANDOFF_METRICS) row[k] = num(t[k]);
    out[kind] = row;
  }
  return out;
}

// What changed between two menus' targets: one change per metric and kind of day, folded to "every
// day" when both kinds moved the same way by the same numbers. A metric either side doesn't state
// is not a change. Calories first, then protein, carbs and fat, as the builder lists them.
export function mealPlanChanges(prevDays, nextDays) {
  const a = targetsByKind(prevDays);
  const b = targetsByKind(nextDays);
  const out = [];
  for (const metric of HANDOFF_METRICS) {
    const moved = {};
    for (const kind of ['training', 'rest']) {
      const from = a[kind] ? a[kind][metric] : null;
      const to = b[kind] ? b[kind][metric] : null;
      if (from == null || to == null || from === to) continue;
      moved[kind] = { from, to };
    }
    if (moved.training && moved.rest && moved.training.from === moved.rest.from && moved.training.to === moved.rest.to) {
      out.push({ metric, days: 'all', from: moved.training.from, to: moved.training.to });
      continue;
    }
    for (const kind of ['training', 'rest']) if (moved[kind]) out.push({ metric, days: kind, ...moved[kind] });
  }
  return out;
}

export function handoffTitle(client) {
  const who = clean(client) || 'A client';
  return { text: `Plan change: ${who}`, copy: np('handoff.title', { client: clean(client) || phrase('word.aClient') }) };
}

function framed(client, body, bodyCopy) {
  const t = handoffTitle(client);
  return { title: t.text, body, copy: { title: t.copy, body: bodyCopy } };
}

// A new menu for a shared client. With an earlier menu from the same coach, the line names the targets
// that moved; one that moved none says nothing when the menu kept its title (a republish), and names
// the new menu when it didn't. With no earlier menu, it names the new one.
export function mealPlanHandoff({ coach, client, plan, prevDays, prevTitle, nextDays, from }) {
  const who = clean(coach) || 'Their nutritionist';
  const day = weekdayDay(from);
  const title = clean(plan, 60);
  const fromText = day ? ` from ${day}` : '';
  const when = day ? onDay(from, 'weekday') : null;
  const changes = prevDays ? mealPlanChanges(prevDays, nextDays) : [];
  if (changes.length === 1) {
    const c = changes[0];
    const up = c.to > c.from;
    const body = `${who} ${up ? 'raised' : 'lowered'} ${METRIC_WORD[c.metric]} on ${DAYS_WORD[c.days]}, ${c.from} → ${c.to} ${METRIC_UNIT[c.metric]}${fromText}.`;
    return framed(client, body, when ? np(up ? 'handoff.macroUp' : 'handoff.macroDown', {
      coach: who, metric: phrase('handoff.metric.' + c.metric), days: phrase('handoff.days.' + c.days),
      from: c.from, to: c.to, unit: METRIC_UNIT[c.metric], when,
    }) : null);
  }
  if (changes.length > 1) {
    const parts = changes.map((c) => `${METRIC_WORD[c.metric]} on ${DAYS_WORD[c.days]} ${c.from} → ${c.to} ${METRIC_UNIT[c.metric]}`);
    const body = `${who} changed the meal plan's targets${fromText}: ${parts.join('; ')}.`;
    return framed(client, body, when ? np('handoff.macroMany', { coach: who, count: changes.length, when }) : null);
  }
  if (prevDays && clean(prevTitle, 60) === title) return null;
  if (!title) return null;
  const body = `${who} started a new meal plan, ${title}${day ? `, from ${day}` : ''}.`;
  return framed(client, body, when ? np('handoff.mealPlan', { coach: who, plan: title, when }) : null);
}

// A program assigned to a shared client (its first week, from the day it starts).
export function programHandoff({ coach, client, plan, from }) {
  const who = clean(coach) || 'Their trainer';
  const title = clean(plan, 60);
  const day = weekdayDay(from);
  if (!title) return null;
  const body = `${who} started ${title}${day ? ` from ${day}` : ''}.`;
  return framed(client, body, day ? np('handoff.program', { coach: who, plan: title, when: onDay(from, 'weekday') }) : null);
}

// The trainer's Adjust (intensity, sessions a week) applied to a shared client's future weeks.
export function adjustHandoff({ coach, client, mode, sessions, from }) {
  const who = clean(coach) || 'Their trainer';
  const m = Object.prototype.hasOwnProperty.call(MODE_WORD, mode) ? mode : null;
  const day = weekdayDay(from);
  if (!m || !day) return null;
  const n = Number.isInteger(sessions) && sessions >= 1 && sessions <= 14 ? sessions : null;
  const what = n ? `${MODE_WORD[m]}, ${n} session${n === 1 ? '' : 's'} a week` : MODE_WORD[m];
  const body = `${who} adjusted the training plan (${what}) from ${day}.`;
  const vars = { coach: who, mode: phrase('handoff.mode.' + m), when: onDay(from, 'weekday') };
  return framed(client, body, n ? np('handoff.adjustSessions', { ...vars, count: n }) : np('handoff.adjust', vars));
}

// A coach's week-one target for a shared client: workouts for a trainer, days logged for a nutritionist.
// A target cleared (count null) says nothing.
export function weekOneHandoff({ coach, client, role, count }) {
  const who = clean(coach) || (role === 'nutritionist' ? 'Their nutritionist' : 'Their trainer');
  if (!Number.isInteger(count) || count < 1) return null;
  if (role === 'nutritionist') {
    const body = `${who} set week one to ${count} day${count === 1 ? '' : 's'} of food logs.`;
    return framed(client, body, np('handoff.weekOneLog', { coach: who, count }));
  }
  const body = `${who} set week one to ${count} workout${count === 1 ? '' : 's'}.`;
  return framed(client, body, np('handoff.weekOneTrain', { coach: who, count }));
}
