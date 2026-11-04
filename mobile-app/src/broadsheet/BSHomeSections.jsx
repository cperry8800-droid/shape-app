import React from 'react';
import { bsCiDay, bsCiAnswered, bsCiIso, BS_CI_SAVED } from './BSCheckinCard.jsx';
import { bsHomeWeekSoFar, bsHomeNextSession, bsHwRedate, bsHwWeekDays as bsHomeWeekSoFarDays, bsHwTrainedOf, bsHwTrainedDaysOf, bsHwSeriesOf, bsHwGoalData, bsHwOfWeek, bsHwWeekGrid, bsHwShift } from '../services/homeWeek.mjs';
import { bsUserGoalsRevHook } from '../services/userGoalsRefresh.mjs';

// Home's goal reads its documents again when Nora's account setup (or its Undo) changes them.
const useBSUserGoalsRev = bsUserGoalsRevHook(React);
const BS_HOME_GOAL_KINDS = ['client_goals', 'client_identity'];
// ─── HOME'S READS, THE MORNING PANEL'S HABITS, AND THE SHORTCUTS ──────────────────────────────────
// The member Home the owner chose (2026-11-03, the Home preview) draws its goal, its week and its
// coaches elsewhere: the climb and the week's bars in BSHomeDeck.jsx, Team in BSHomeTeam.jsx. This file
// keeps the reads they share:
//   · useBSHomeGoalData: the goal document, its words and the weigh-ins (or the preview's sample);
//   · useBSHomeWeek: the week so far against the plan, a square a day (services/homeWeek.mjs's);
//   · useBSHomeUnread and useBSHomeNextSession: what is unread from each coach, and the next session;
// and the two Home rows that are not a section of their own: Daily habits in the morning panel, and
// the Shortcuts list.
//
// ⚠ THE GOAL'S OWN HELPERS STAY IN THE CLIENT MODULE (tests read them from its text), so Home hands
// them in (`docKg`, `isWeightGoal`, `goalWords`) and no Home module imports back into it.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx).

const { useState, useEffect } = React;

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

function bsHsSignedIn() {
  return !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
}

// The goal document, its words and the weigh-ins: read signed in, or the preview's sample (`demo`,
// the client module's BS_GOALS_DEFAULT) moved to end today. null while it reads, and after a goal
// read that failed.
export function useBSHomeGoalData(demo) {
  const signedIn = bsHsSignedIn();
  const [data, setData] = useState(() => (signedIn ? null : {
    primary: (demo && demo.primaryGoal) || '',
    overall: (demo && demo.overall) || {},
    weighIns: bsHwRedate((demo && demo.overall && demo.overall.weighIns) || [], bsCiIso(new Date())),
  }));
  const goalsRev = useBSUserGoalsRev(BS_HOME_GOAL_KINDS);
  useEffect(() => {
    if (!signedIn) return undefined;
    let on = true;
    (async () => {
      let doc = null, ident = null, weigh = null;
      try { doc = window.shapeDb?.getUserGoals ? await window.shapeDb.getUserGoals('client_goals') : null; } catch (e) { /* no goal read */ }
      try { ident = window.shapeDb?.getUserGoals ? await window.shapeDb.getUserGoals('client_identity') : null; } catch (e) { /* no mirror read */ }
      try { weigh = window.ShapeWeighIns?.list ? await window.ShapeWeighIns.list() : null; } catch (e) { /* no weigh-ins */ }
      if (!on) return;
      // A goal read that failed leaves the section unresolved (null): nothing is drawn.
      setData(bsHwGoalData(doc, ident, weigh));
    })();
    return () => { on = false; };
  }, [signedIn, goalsRev]);
  return data;
}

// ── WEEK SO FAR ──────────────────────────────────────────────────────────────────────────────────

// The preview's week: a sample, laid on this week's days. The squares run off one pattern a row
// (Monday first), so the counts beside them are the sample's own hits so far; protein and steps keep
// a sample average. The plan sets sessions on Monday, Wednesday, Thursday and Saturday.
const BS_HS_DEMO = {
  sessions: [1, 0, 0, 1, 0, 0, 0], planned: [1, 0, 1, 1, 0, 1, 0],
  food: [1, 1, 0, 1, 0, 0, 1], protein: [1, 0, 1, 1, 0, 1, 0], steps: [1, 1, 0, 0, 1, 0, 1], mornings: [1, 0, 1, 0, 0, 1, 0],
};
function bsHsDemoWeek(todayIso) {
  const so = bsHomeWeekSoFarDays(todayIso);
  const week = so.length ? Array.from({ length: 7 }, (_, i) => bsHwShift(so[0], i)) : [];
  const on = (k) => week.filter((d, i) => BS_HS_DEMO[k][i] && d <= todayIso);
  const map = (k, hit, miss) => new Map(week.map((d, i) => [d, BS_HS_DEMO[k][i] ? hit : miss]));
  const grid = bsHwWeekGrid({
    todayIso, read: true,
    cal: new Map(on('food').map((d) => [d, 1900])),
    pro: map('protein', 150, 104), st: map('steps', 9200, 5400), proteinTarget: 140, stepGoal: 8000,
    answered: (d) => on('mornings').includes(d), trainedDays: on('sessions'), plannedDays: BS_HS_DEMO.planned.map(Boolean), planRead: true,
  });
  return {
    days: so.length,
    sessions: { done: on('sessions').length, planned: BS_HS_DEMO.planned.filter(Boolean).length },
    daysLogged: on('food').length,
    protein: { avg: 121, target: 140 },
    steps: { avg: 6980, goal: 8000 },
    mornings: on('mornings').length,
    grid,
  };
}

// The week's reads (bsHomeWeekSoFar's shape, or the preview's sample), for Week so far and for the
// Home deck's day bars, which draw the same five rows a day (owner, 2026-11-03, the Home preview).
export function useBSHomeWeek({ sessionsPlanned = null, plannedDays = null, planRead = false, proteinTarget = null, stepGoal = null } = {}) {
  const signedIn = bsHsSignedIn();
  // The week the reads are for: Home left open across Sunday into Monday reads the new week, and each
  // read is kept with its Monday and used only in that week (bsHwOfWeek), so last week's figures
  // never sit against this week's plan or read as its zeros (Codex P2s on #2424).
  const todayIso = bsCiIso(new Date());
  const monday = bsHomeWeekSoFarDays(todayIso)[0];
  const [series, setSeries] = useState(null); // { monday, v }
  const [trained, setTrained] = useState(null); // { monday, v, days }
  const [reads, setReads] = useState(0);
  useEffect(() => {
    const again = () => setReads((n) => n + 1);
    // A check-in lands → read the week again, so the mornings row moves with the card above it.
    window.addEventListener(BS_CI_SAVED, again);
    return () => window.removeEventListener(BS_CI_SAVED, again);
  }, []);
  useEffect(() => {
    if (!signedIn) return undefined;
    let on = true;
    if (window.ShapeProgress?.progress) {
      window.ShapeProgress.progress().then((p) => { if (on) setSeries({ monday, v: bsHwSeriesOf(p) }); }).catch(() => {});
    }
    if (window.ShapeCommit?.progress) {
      // This member's own Monday, not UTC's (see getCommitmentProgress).
      window.ShapeCommit.progress(monday).then((p) => { if (on) setTrained({ monday, v: bsHwTrainedOf(p), days: bsHwTrainedDaysOf(p) }); }).catch(() => {});
    }
    return () => { on = false; };
  }, [signedIn, reads, monday]);

  const weekSeries = bsHwOfWeek(series, monday);
  const w = signedIn
    ? bsHomeWeekSoFar({
      todayIso, series: weekSeries, workoutsDone: bsHwOfWeek(trained, monday), workoutsPlanned: sessionsPlanned, proteinTarget, stepGoal,
      answered: (iso) => bsCiAnswered(bsCiDay(weekSeries, iso)),
      trainedDays: trained && trained.monday === monday ? trained.days : null, plannedDays, planRead,
    })
    : bsHsDemoWeek(todayIso);
  return w;
}

// ── FROM YOUR COACHES ────────────────────────────────────────────────────────────────────────────

export function useBSHomeUnread(ids) {
  const [map, setMap] = useState(() => ({ ...(window.ShapeUnread?.all?.() || {}) }));
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return undefined;
    try { window.ShapeUnread?.start?.(); } catch (e) { /* counts stay as read */ }
    const off = window.ShapeUnread?.onChange?.((m) => setMap({ ...(m || {}) }));
    setMap({ ...(window.ShapeUnread?.all?.() || {}) });
    return () => { try { if (typeof off === 'function') off(); } catch (e) { /* already gone */ } };
  }, [key]);
  return map;
}

// The member's next session with a coach they pay, or null (bsHomeNextSession's), read once there is
// a coach: Home's Team says it.
export function useBSHomeNextSession(coaches) {
  const signedIn = bsHsSignedIn();
  const [sessions, setSessions] = useState(null);
  // Sessions are booked with a coach, so a member with none is not asked.
  const coached = coaches.length > 0;
  useEffect(() => {
    if (!signedIn || !coached || !window.ShapeSessions?.getSessions) return undefined;
    let on = true;
    window.ShapeSessions.getSessions().then((list) => { if (on) setSessions(list); }).catch(() => {});
    return () => { on = false; };
  }, [signedIn, coached]);
  // Matched against the coaches on each draw, so a change of coach needs no second read.
  return coached ? bsHomeNextSession(sessions, coaches) : null;
}

// ── DAILY HABITS, IN THE MORNING PANEL ───────────────────────────────────────────────────────────
// Owner, 2026-11-03, of the morning panel: "add daily habits in here instead of at bottom". A row under
// water: "Daily habits", how many are done today, and the first three as ticks to check off where they
// are, through the store the Habits page uses (window._bsUseServerHabits), so a tick here is the
// page's tick. The rest open on the page; the title opens it too. The signed-out preview shows the
// sample's habits, and a tick asks for an account (the store's own gate).
const BS_HS_HABIT_TICKS = 3;
function useBSHomeHabitsFallback() { return { habits: [], status: 'ready', toggle: () => {} }; }
export function BSHomeHabitsRow({ tweaks = {}, setTweak = () => {}, onOpen, tour, onTicked }) {
  const useHabits = (typeof window !== 'undefined' && window._bsUseServerHabits) || useBSHomeHabitsFallback;
  const store = useHabits(tweaks, setTweak);
  // A tick may earn points: the score on Home reads itself again once the tick is written (onTicked).
  const toggle = (id) => {
    const r = store.toggle(id);
    if (typeof onTicked === 'function') Promise.resolve(r).then(() => onTicked(), () => {});
  };
  return <BSHomeHabitsRowView habits={store.habits} ready={store.status === 'ready'} onToggle={toggle} onOpen={onOpen} tour={tour} />;
}

export function BSHomeHabitsRowView({ habits = [], ready = true, onToggle, onOpen, tour, todayIso = bsCiIso(new Date()) }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const signedIn = bsHsSignedIn();
  const demo = !signedIn && !habits.length ? ((typeof window !== 'undefined' && window._BS_HABIT_DEMO_ROWS) || []) : null;
  const today = Math.max(0, bsHomeWeekSoFarDays(todayIso).length - 1); // 0 = Monday, as the sample's pattern
  const list = demo
    ? demo.map((h) => ({ id: h.id, name: h.name, type: h.type, done: (h.pattern || [])[today] === 1 }))
    : habits.map((h) => ({ id: h.id, name: h.name, type: h.type, done: (h.history || []).includes(todayIso) }));
  const done = list.filter((h) => h.done).length;
  const ticks = list.slice(0, BS_HS_HABIT_TICKS);
  const more = list.length - ticks.length;
  const open = () => { if (typeof onOpen === 'function') onOpen(); };
  // A tick's label: the habit's last word ("Drink 3 glasses of water" → water), and for a habit to
  // avoid, "No" with it (smoking → No smoking). The tick's own name is the whole habit.
  const short = (h) => {
    const words = String(h.name || '').split(/\s+/).filter((w) => /\p{L}/u.test(w));
    const last = words[words.length - 1] || '';
    return h.type === 'avoid' ? tr('home:habits.avoidShort', { defaultValue: 'No {what}', what: last }) : last;
  };
  return (
    <div data-bs-home-habits="" data-tour={tour || undefined} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.HAIR}`, display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={open} style={{ flex: 1, minWidth: 0, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: t.INK }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 650 }}>{tr('home:slate.habitsHead', { defaultValue: 'Daily habits' })}</span>
        <span style={{ display: 'block', marginTop: 1, fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70 }}>
          {!ready ? '—' : list.length ? tr('home:focus.habitsDone', { defaultValue: '{done} of {total} done', done, total: list.length }) : tr('home:focus.habitsFirst', { defaultValue: 'Add your first' })}
        </span>
      </button>
      {ready ? ticks.map((h) => (
        <button key={h.id} type="button" data-habit-tick={h.done ? 'done' : 'open'} aria-pressed={h.done}
          aria-label={h.name} onClick={() => { if (typeof onToggle === 'function') onToggle(h.id); }}
          style={{ minWidth: 46, minHeight: 44, flexShrink: 0, padding: '3px 5px 2px', boxSizing: 'border-box', borderRadius: 4, border: `1px solid ${h.done ? t.INK : t.INK50}`, background: h.done ? t.INK : 'transparent', color: h.done ? t.PAPER : t.INK, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>✓</span>
          {/* The box grows to its word ("No smoking" is not "NO SMOKI…"), up to a cap a long language still fits. */}
          <span style={{ maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: t.MONO, fontSize: 6.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{short(h)}</span>
        </button>
      )) : null}
      {ready && more > 0 ? (
        <button type="button" onClick={open} aria-label={tr('home:habits.more', { defaultValue: '{count, plural, one {# more habit} other {# more habits}}', count: more })}
          style={{ minWidth: 44, minHeight: 44, flexShrink: 0, padding: '0 4px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK70 }}>+{more}</button>
      ) : null}
      {ready && !list.length ? <span aria-hidden="true" style={{ color: t.INK50, fontSize: 20 }}>›</span> : null}
    </div>
  );
}

// ── YOUR MOVE ─────────────────────────────────────────────────────────────────────────────────────
// The engine's one move for today, back on Home as the morning panel's first row (owner, 2026-11-04: "ok
// add it", of the row that brings back what Today's call carried): only when the engine flags something
// (sleep, water, energy, hunger, the weekly check-in, the streak, a meal, the goal's pace, the score), so a
// day with nothing flagged reads as before. "Your move" in the lever's colour, the move, its reason in the
// member's words, and the pledge as the panel's ink square.
export function BSHomeMoveRow({ head, sub, cta, color }) {
  const t = window.useBS();
  const tr = useShapeTr();
  if (!head) return null;
  const go = cta && typeof cta[1] === 'function' ? cta[1] : null;
  return (
    <div data-bs-home-move="" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${t.HAIR}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: color || t.ACCENT }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: color || t.ACCENT, flex: 'none' }} />
          {tr('home:lead.railHeader', { defaultValue: 'Your move' })}
        </div>
        <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2, color: t.INK }}>{head}</div>
        {sub ? <div style={{ marginTop: 2, fontFamily: t.BODY, fontSize: 12, lineHeight: 1.35, color: t.INK70 }}>{sub}</div> : null}
      </div>
      {go ? (
        <button type="button" data-bs-home-move-go="" onClick={go} aria-label={String(cta[0] || '').replace(/\s*→\s*$/, '')}
          style={{ flex: 'none', width: 44, height: 44, minHeight: 44, padding: 0, borderRadius: 6, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      ) : null}
    </div>
  );
}

// ── SHORTCUTS, AS A LIST ─────────────────────────────────────────────────────────────────────────
// The Home preview's Shortcuts (owner, 2026-11-03): a numbered list under a 2px ink rule, each row a
// door with its name over one line, and a chevron. No figures.
export function BSHomeShortcutList({ title, rows = [] }) {
  const t = window.useBS();
  if (!rows.length) return null;
  return (
    <section data-bs-home-shortcuts="" style={{ padding: `${t.sectGap || 22}px ${t.padX}px 0` }}>
      <h2 style={{ margin: 0, paddingBottom: 8, borderBottom: `2px solid ${t.INK}`, fontFamily: t.HEAD || t.DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: t.INK }}>
        {title}<span aria-hidden="true" style={{ color: '#c0533b' }}>.</span>
      </h2>
      {rows.map((r, i) => (
        <button key={r.key} type="button" data-home-shortcut={r.key} data-tour={r.tour || undefined} onClick={r.onOpen}
          style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', border: 0, borderBottom: `1px solid ${t.HAIR}`, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: t.INK }}>
          <span aria-hidden="true" style={{ width: 22, flexShrink: 0, fontFamily: t.MONO, fontSize: 10.5, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 650 }}>{r.label}</span>
            {r.sub ? <span style={{ display: 'block', marginTop: 1, fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70 }}>{r.sub}</span> : null}
          </span>
          <span aria-hidden="true" style={{ color: t.INK50, fontSize: 20 }}>›</span>
        </button>
      ))}
    </section>
  );
}
