// A client's wins, told to their coach (owner, 2026-11-05: "Client win: a PR, a goal reached, a streak
// milestone, using whatever wins data exists. Default on, low priority"). Before this, wins showed on
// the website's Today only, and only the few the engine could read.
//
// Pure: /api/cron/client-wins reads the rows and hands them here. Three kinds, each from data Shape
// already keeps:
//   prWins(recent, prior)        a set heavier than every earlier set of that move (workout_set_logs),
//                                in pounds for the comparison. A move with no earlier set is a first
//                                log, not a PR.
//   streakWin(days, today)       the newest milestone (STREAK_MILESTONES) the current run of days with a
//                                completed workout reached today or yesterday, on the coach's streak
//                                definition (get_client_score_history: UTC days, a run ending today or
//                                yesterday). Today or yesterday, so a daily run that lands either side
//                                of the client's workout still sees it.
//   goalWins(goals, sinceYmd)    a coach-set goal (client_programs.detail.goals) whose newest reading,
//                                on or after `sinceYmd`, met its target for the first time.
// winNotice(kind, …) is the English the row keeps and the copy noticeCopy.mjs says in the reader's
// language. Each win carries a dedupe key, so a run that sees it again stores nothing.

import { np, phrase } from '../../mobile-app/src/services/noticeCopy.mjs';

export const STREAK_MILESTONES = Object.freeze([7, 14, 30, 60, 100, 150, 200, 365]);
const KG_TO_LB = 2.20462;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// A set's load, as get_my_recent_lift_prs reads it: the actual column when it is above 0, else the
// first number in the payload's actualLoad, load or actual_load.
export function setLoad(row) {
  if (!row || typeof row !== 'object') return null;
  const col = Number(row.actual_load);
  if (Number.isFinite(col) && col > 0) return col;
  const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const raw = String(p.actualLoad ?? p.load ?? p.actual_load ?? '');
  const m = /([0-9]+(?:\.[0-9]+)?)/.exec(raw);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
const unitOf = (row) => (String((row && row.load_unit) || 'lb').toLowerCase() === 'kg' ? 'kg' : 'lb');
const toLb = (load, unit) => (unit === 'kg' ? load * KG_TO_LB : load);
const moveOf = (row) => String((row && row.move_name) || '').replace(/\s+/g, ' ').trim();
const counted = (row) => row && row.completed !== false && moveOf(row) !== '';

// The PRs among `recent` sets, against every `prior` set of the same move (both workout_set_logs rows).
// Moves compare case-insensitively. One win per move: its heaviest recent set (the latest on a tie).
export function prWins(recent, prior) {
  const priorBest = new Map();
  for (const row of Array.isArray(prior) ? prior : []) {
    if (!counted(row)) continue;
    const load = setLoad(row);
    if (load == null) continue;
    const key = moveOf(row).toLowerCase();
    const lb = toLb(load, unitOf(row));
    if (!priorBest.has(key) || lb > priorBest.get(key)) priorBest.set(key, lb);
  }
  const best = new Map();
  for (const row of Array.isArray(recent) ? recent : []) {
    if (!counted(row)) continue;
    const load = setLoad(row);
    if (load == null) continue;
    const key = moveOf(row).toLowerCase();
    const unit = unitOf(row);
    const lb = toLb(load, unit);
    const at = Date.parse(String(row.created_at || ''));
    const cur = best.get(key);
    if (!cur || lb > cur.lb || (lb === cur.lb && at > cur.at)) best.set(key, { move: moveOf(row), load, unit, lb, at });
  }
  const out = [];
  for (const [key, b] of best) {
    if (!priorBest.has(key)) continue;
    if (b.lb > priorBest.get(key)) out.push({ kind: 'pr', move: b.move, load: b.load, unit: b.unit, dedupe: `win:pr:${key}:${b.load}${b.unit}` });
  }
  return out.sort((x, y) => x.move.localeCompare(y.move));
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The current run of days: { length, start, end }, a run ending today or yesterday, else length 0.
// Days after `today` never count (a session dated tomorrow is not part of today's streak).
export function currentRun(days, today) {
  if (typeof today !== 'string' || !YMD.test(today)) return { length: 0, start: null, end: null };
  const set = new Set((Array.isArray(days) ? days : [...(days || [])]).filter((d) => typeof d === 'string' && YMD.test(d) && d <= today));
  let end = set.has(today) ? today : set.has(addDays(today, -1)) ? addDays(today, -1) : null;
  if (!end) return { length: 0, start: null, end: null };
  let start = end;
  let length = 1;
  while (set.has(addDays(start, -1))) { start = addDays(start, -1); length += 1; }
  return { length, start, end };
}

export function streakWin(days, today) {
  const run = currentRun(days, today);
  if (!run.length) return null;
  const hit = STREAK_MILESTONES.filter((m) => m <= run.length).pop();
  if (!hit) return null;
  // The day the run reached the milestone: today or yesterday, or it was told already (or missed for good).
  const reached = addDays(run.start, hit - 1);
  if (reached < addDays(today, -1)) return null;
  return { kind: 'streak', days: hit, dedupe: `win:streak:${hit}:${run.start}` };
}

// Whether `value` meets `target`, going the way the goal goes: down when it started above the target,
// up otherwise.
function meets(value, target, start) {
  if (value == null || target == null) return false;
  return start != null && start > target ? value <= target : value >= target;
}

export function goalWins(goals, sinceYmd) {
  const out = [];
  for (const g of Array.isArray(goals) ? goals : []) {
    if (!g || typeof g !== 'object') continue;
    const target = finite(Number(g.target));
    const label = String(g.label || '').replace(/\s+/g, ' ').trim();
    const hist = (Array.isArray(g.history) ? g.history : [])
      .filter((p) => p && typeof p.on === 'string' && YMD.test(p.on) && Number.isFinite(Number(p.value)))
      .map((p) => ({ on: p.on, value: Number(p.value) }))
      .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
    if (!label || target == null || !hist.length) continue;
    const last = hist[hist.length - 1];
    if (typeof sinceYmd === 'string' && last.on < sinceYmd) continue;
    const start = finite(g.start == null ? NaN : Number(g.start)) ?? (hist.length > 1 ? hist[0].value : null);
    if (!meets(last.value, target, start)) continue;
    // Met before this reading too: not news.
    if (hist.slice(0, -1).some((p) => meets(p.value, target, start))) continue;
    const unit = String(g.unit || '').trim().slice(0, 12);
    out.push({ kind: 'goal', label: label.slice(0, 60), value: last.value, unit, dedupe: `win:goal:${String(g.id || label).slice(0, 40)}:${target}` });
  }
  return out;
}

// The notice for one win. `client` is the member's name, or null.
export function winNotice(win, client) {
  const name = String(client || '').trim();
  const shown = name || 'A client';
  const who = name || phrase('word.aClient');
  if (win.kind === 'pr') {
    const value = `${win.load} ${win.unit}`;
    return {
      title: `${shown} set a PR`,
      body: `${win.move}: ${value}, a new best.`,
      copy: { title: np('win.pr.title', { client: who }), body: np('win.pr.body', { move: win.move, value }) },
    };
  }
  if (win.kind === 'goal') {
    const value = win.unit ? `${win.value} ${win.unit}` : String(win.value);
    return {
      title: `${shown} reached a goal`,
      body: `${win.label}: ${value}, on target.`,
      copy: { title: np('win.goal.title', { client: who }), body: np('win.goal.body', { goal: win.label, value }) },
    };
  }
  if (win.kind === 'streak') {
    return {
      title: `${shown}: ${win.days}-day streak`,
      body: `${win.days} days in a row with a workout.`,
      copy: { title: np('win.streak.title', { client: who, days: win.days }), body: np('win.streak.body', { days: win.days }) },
    };
  }
  return null;
}
