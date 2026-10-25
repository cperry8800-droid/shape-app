import React from 'react';
import { BSFocusTitle, BSFocusLink } from './BSFocus.jsx';
import { bsCiDay, bsCiAnswered, bsCiIso, BS_CI_SAVED } from './BSCheckinCard.jsx';
import { bsHomeWeekSoFar, bsHwPct, bsHomeGoalRead, bsHwRedate, bsHomeNextSession, bsHwDaysBetween, bsHwWeekDays as bsHomeWeekSoFarDays, bsHwTrainedOf, bsHwTrainedDaysOf, bsHwSeriesOf, bsHwGoalData, bsHwOfWeek, bsHwWeekGrid, bsHwShift } from '../services/homeWeek.mjs';
import { bsWsRed } from './bsMagazine.mjs';
// ─── HOME, PART 2: YOUR GOAL · WEEK SO FAR · FROM YOUR COACHES ─────────────────────────────────────
// Owner, 2026-10-22: "The home page is repetitive of the train and eat pages." Off the mockup the owner
// approved, Home says what only Home can, under Today's call:
//   · Your goal: the goal in the member's words and, for a weight goal or a weight target, where the
//     weigh-ins stand: now, the target, the line of the last weeks, the pace and when it lands;
//   · Week so far: Monday to today, against the plan: sessions, days with food logged, protein,
//     steps and the mornings checked in, as a square a day (owner, 2026-10-25, of three mockups:
//     "go with B");
//   · From your coaches: their notes, a message door to each coach they pay (with what is unread)
//     and their next booked session.
// Home hands in what it already holds (the plan's sessions and coaches, the targets, the doors);
// each section reads the rest itself. The figures are services/homeWeek.mjs's.
//
// ⚠ THE GOAL'S OWN HELPERS STAY IN THE CLIENT MODULE (tests read them from its text), so Home hands
// them in (`docKg`, `isWeightGoal`, `goalWords`) and this file never imports back into it.
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

function bsHsLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}

function bsHsDate(iso, opts) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(dt.getTime())) return '';
  try { return dt.toLocaleDateString(bsHsLocale(), opts); } catch (e) { return dt.toDateString(); }
}

const bsHsGold = (t) => (t.isLight ? '#a07a2e' : '#c9a14a');
const bsHsTeal = (t) => (t.isLight ? '#0a8f87' : '#34d6c5');

function bsHsSignedIn() {
  return !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
}

// A small accent action on a section title's right side ("Edit →").
function BSHsAction({ label, onClick, color }) {
  const t = window.useBS();
  return (
    <button type="button" onClick={onClick} style={{ flexShrink: 0, minHeight: 44, marginBottom: -6, padding: '0 2px', background: 'transparent', border: 0, cursor: 'pointer', color: color || t.ACCENT, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</button>
  );
}

// ── YOUR GOAL ────────────────────────────────────────────────────────────────────────────────────

// The weigh-ins as a line: oldest left, newest right, the newest dotted.
function BSHsTrend({ points, color, label }) {
  const t = window.useBS();
  if (!Array.isArray(points) || points.length < 2) return null;
  const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  const xs = points.map((p) => day(p.d));
  const ys = points.map((p) => p.kg);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const W = 300, H = 36, pad = 4;
  const sx = (x) => (x1 === x0 ? W / 2 : pad + ((x - x0) / (x1 - x0)) * (W - pad * 2));
  const sy = (y) => (hi === lo ? H / 2 : pad + ((hi - y) / (hi - lo)) * (H - pad * 2));
  const pts = points.map((p, i) => `${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block', marginTop: 10 }}>
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke={t.HAIR} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={sx(xs[last])} cy={sy(ys[last])} r="3.5" fill={color} />
    </svg>
  );
}

// The goal document, its words and the weigh-ins: read signed in, or the preview's sample (`demo`,
// the client module's BS_GOALS_DEFAULT) moved to end today. null while it reads, and after a goal
// read that failed.
function useBSHomeGoalData(demo) {
  const signedIn = bsHsSignedIn();
  const [data, setData] = useState(() => (signedIn ? null : {
    primary: (demo && demo.primaryGoal) || '',
    overall: (demo && demo.overall) || {},
    weighIns: bsHwRedate((demo && demo.overall && demo.overall.weighIns) || [], bsCiIso(new Date())),
  }));
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
  }, [signedIn]);
  return data;
}

export function BSHomeGoal({ demo = null, ...view }) {
  const data = useBSHomeGoalData(demo);
  return data ? <BSHomeGoalView data={data} {...view} /> : null;
}

// The section itself, off `data` ({ primary, overall, weighIns }): the tests draw it directly.
// Sized down a step (owner, 2026-10-23: "make this a little smaller"): the figure 42, the line 36 px
// tall, the three figures under it 18.
export function BSHomeGoalView({ data, docKg, isWeightGoal, goalWords, onOpen, tour, todayIso = bsCiIso(new Date()) }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const gold = bsHsGold(t);
  const overall = data.overall || {};
  // The document's figures are in its own unit; the weigh-ins are kilograms (bsGoalDocKg's rule).
  const toKg = (v) => (typeof docKg === 'function' ? docKg(v, overall) : null);
  const read = bsHomeGoalRead({ weighIns: data.weighIns, startKg: toKg(overall.start), targetKg: toKg(overall.target), todayIso });
  const words = String(overall.title || '').trim() || (typeof goalWords === 'function' ? goalWords(data.primary) : '') || '';
  const weightGoal = (typeof isWeightGoal === 'function' ? isWeightGoal(data.primary) : true) || read.targetKg != null;
  const hasRead = weightGoal && read.nowKg != null;
  const unit = (t.unitPrefs && t.unitPrefs.weight) || 'kg';
  const disp = (kg) => (typeof t.kgToDisplay === 'function' ? t.kgToDisplay(kg) : kg);
  const fmt = (kg, digits = 1) => {
    const v = disp(kg);
    try { return Number(v).toLocaleString(bsHsLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }); } catch (e) { return Number(v).toFixed(digits); }
  };
  const signed = (kg) => `${kg < 0 ? '−' : kg > 0 ? '+' : ''}${fmt(Math.abs(kg))}`;
  const mono = { fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 };
  const link = (label) => <BSHsAction label={label} onClick={onOpen} />;
  const since = hasRead && read.sinceIso ? tr('home:goal.since', { defaultValue: 'Since {date}', date: bsHsDate(read.sinceIso, { month: 'short', day: 'numeric' }) }) : null;
  const weeks = hasRead && read.sinceIso ? Math.max(1, Math.round(bsHwDaysBetween(read.sinceIso, todayIso) / 7)) : null;

  return (
    <section data-bs-home-goal="" data-tour={tour || undefined}>
      <BSFocusTitle kicker={since} title={tr('home:goal.title', { defaultValue: 'Your goal' })} color={gold}
        right={<BSHsAction label={tr('home:goal.edit', { defaultValue: 'Edit →' })} onClick={onOpen} />} />
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        {words ? (
          <p style={{ margin: 0, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.35, color: t.INK85 || t.INK }}>&ldquo;{words}&rdquo;</p>
        ) : null}
        {!words && !hasRead ? (
          <p style={{ margin: 0, fontFamily: t.BODY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>{tr('home:goal.empty', { defaultValue: 'Set a goal to follow it here.' })}</p>
        ) : null}
        {hasRead ? (
          <>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <span style={{ fontFamily: t.DISPLAY, fontWeight: 300, fontSize: 34, lineHeight: 0.9, letterSpacing: '-0.04em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{fmt(read.nowKg)}</span>
                <span style={{ ...mono, fontSize: 9.5 }}>{tr('home:goal.now', { defaultValue: '{unit} now', unit })}</span>
              </div>
              {read.targetKg != null ? (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...mono, fontWeight: 800, letterSpacing: '0.16em' }}>{tr('home:goal.target', { defaultValue: 'Goal' })}</div>
                  <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 16, color: gold, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(read.targetKg)} {unit}</div>
                </div>
              ) : null}
            </div>
            <BSHsTrend points={read.trend} color={gold}
              label={tr('home:goal.trendAria', { defaultValue: 'Weigh-ins from {from} to {to} {unit}', from: fmt(read.trend[0] ? read.trend[0].kg : read.nowKg), to: fmt(read.nowKg), unit })} />
            {read.pct != null ? (
              <div aria-hidden style={{ marginTop: 10, height: 3, background: t.HAIR }}>
                <div style={{ width: `${read.pct}%`, height: 3, background: gold }} />
              </div>
            ) : null}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.HAIR}`, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 16, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{signed(read.changeKg)}</div>
                <div style={{ ...mono, marginTop: 2 }}>{tr('home:goal.inWeeks', { defaultValue: '{unit} in {n, plural, one {# week} other {# weeks}}', unit, n: weeks })}</div>
              </div>
              <div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 16, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{read.paceKgWk != null ? signed(read.paceKgWk) : '—'}</div>
                <div style={{ ...mono, marginTop: 2 }}>{tr('home:goal.aWeek', { defaultValue: '{unit} a week lately', unit })}</div>
              </div>
              <div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 16, color: read.reached ? gold : t.INK, fontVariantNumeric: 'tabular-nums' }}>{read.reached ? '✓' : read.toGoKg != null ? fmt(read.toGoKg) : '—'}</div>
                <div style={{ ...mono, marginTop: 2 }}>{read.reached ? tr('home:goal.reached', { defaultValue: 'Goal reached' }) : tr('home:goal.left', { defaultValue: '{unit} to go', unit })}</div>
              </div>
            </div>
          </>
        ) : null}
        <div style={{ marginTop: hasRead ? 6 : 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>
            {hasRead && read.etaIso ? tr('home:goal.eta', { defaultValue: 'At this rate, around {date}', date: bsHsDate(read.etaIso, { month: 'short', day: 'numeric', year: 'numeric' }) })
              : weightGoal && !hasRead && (words || read.targetKg != null) ? tr('home:goal.noWeighIns', { defaultValue: 'No weigh-ins yet.' }) : ''}
          </span>
          {!words && !hasRead && read.targetKg == null ? link(tr('home:goal.set', { defaultValue: 'Set your goal →' }))
            : weightGoal ? link(tr('home:goal.weighIn', { defaultValue: 'Weigh in →' }))
              : link(tr('home:goal.open', { defaultValue: 'Your goal →' }))}
        </div>
      </div>
    </section>
  );
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
    answered: (d) => on('mornings').includes(d), trainedDays: on('sessions'), plannedDays: BS_HS_DEMO.planned.map(Boolean),
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

export function BSHomeWeekSoFar({ sessionsPlanned = null, plannedDays = null, proteinTarget = null, stepGoal = null, ...view }) {
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
      trainedDays: trained && trained.monday === monday ? trained.days : null, plannedDays,
    })
    : bsHsDemoWeek(todayIso);
  return <BSHomeWeekView w={w} {...view} />;
}

// One day's square in a row's colour: filled for a day it was hit, an outline for one missed, a dash
// for a rest day, a dashed outline for today until it is hit and the days still to come, and a dot
// for one nothing could read.
function BSHsWeekCell({ state, color }) {
  const t = window.useBS();
  const box = { width: 16, height: 16, boxSizing: 'border-box' };
  const mark = state === 'hit' ? <span style={{ ...box, background: color }} />
    : state === 'miss' ? <span style={{ ...box, boxShadow: `inset 0 0 0 1.5px ${t.RULE}` }} />
      : state === 'rest' ? <span style={{ width: 8, height: 2, background: t.RULE }} />
        : state === 'ahead' ? <span style={{ ...box, border: `1px dashed ${t.RULE}` }} />
          : <span style={{ width: 4, height: 4, background: t.RULE }} />;
  return <span data-cell={state || 'unknown'} style={{ display: 'grid', placeItems: 'center', minWidth: 0 }}>{mark}</span>;
}

// The section itself, off `w` (bsHomeWeekSoFar's shape): the tests draw it directly. A row a figure,
// each a door to where it lives: its name, a square a day Monday to Sunday (w.grid), and the week's
// figure at the right.
export function BSHomeWeekView({ w, checkinsOn = true, onTrain, onEat, onProgress, onSteps, onMornings }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const teal = bsHsTeal(t);
  const red = bsWsRed(t);
  const locale = bsHsLocale();
  const num = (n) => (n == null ? '—' : Number(n).toLocaleString(locale));
  const g = w.grid || null;
  const rows = [
    { key: 'sessions', label: tr('home:week.sessions', { defaultValue: 'Sessions' }), value: num(w.sessions.done), of: w.sessions.planned && w.sessions.done != null ? w.sessions.planned : null,
      note: w.sessions.planned ? tr('home:week.ofN', { defaultValue: 'of {n}', n: w.sessions.planned }) : tr('home:week.thisWeek', { defaultValue: 'this week' }),
      color: t.RUST, cells: g && g.sessions, onOpen: onTrain },
    { key: 'food', label: tr('home:week.food', { defaultValue: 'Food logged' }), value: num(w.daysLogged), of: w.daysLogged != null ? w.days : null,
      note: tr('home:week.ofDays', { defaultValue: 'of {n, plural, one {# day} other {# days}}', n: w.days }),
      color: teal, cells: g && g.food, onOpen: onEat },
    { key: 'protein', label: tr('home:week.gridProtein', { defaultValue: 'Protein' }), value: num(w.protein.avg), unit: w.protein.avg != null ? 'g' : null,
      note: w.protein.target ? tr('home:week.ofG', { defaultValue: 'of {n} g', n: num(w.protein.target) }) : '',
      color: t.RUST, cells: g && g.protein, onOpen: onProgress },
    { key: 'steps', label: tr('home:week.gridSteps', { defaultValue: 'Steps' }), value: num(w.steps.avg),
      note: w.steps.goal ? tr('home:week.ofN', { defaultValue: 'of {n}', n: num(w.steps.goal) }) : '',
      color: teal, cells: g && g.steps, onOpen: onSteps },
    ...(checkinsOn ? [{ key: 'mornings', label: tr('home:week.mornings', { defaultValue: 'Check-ins' }), value: num(w.mornings), of: w.mornings != null ? w.days : null,
      note: tr('home:week.ofN', { defaultValue: 'of {n}', n: w.days }),
      color: t.BLUE || teal, cells: g && g.mornings, onOpen: onMornings }] : []),
  ];
  const cols = '84px repeat(7, minmax(0, 1fr)) 62px';
  const mono = { fontFamily: t.MONO, textTransform: 'uppercase' };
  let narrow = null;
  try { narrow = new Intl.DateTimeFormat(locale, { weekday: 'narrow' }); } catch (e) { narrow = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }); }
  const dayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const anyRest = !!(g && g.sessions && g.sessions.includes('rest'));
  const rules = [
    w.protein.target ? tr('home:week.ruleProtein', { defaultValue: 'a protein day reaches {n} g', n: num(w.protein.target) }) : null,
    w.steps.goal ? tr('home:week.ruleSteps', { defaultValue: 'a steps day reaches {n}', n: num(w.steps.goal) }) : null,
  ].filter(Boolean);
  const key = (style, text) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ display: 'inline-block', width: 9, height: 9, boxSizing: 'border-box', ...style }} />{text}
    </span>
  );
  return (
    <section data-bs-home-week="" style={{ padding: `${t.sectGap + 6}px ${t.padX}px 0` }}>
      <div data-bs-home-week-head="" style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 6, borderBottom: `2px solid ${t.INK}` }}>
        <h2 style={{ margin: 0, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 600, lineHeight: 1, letterSpacing: '0.02em', textTransform: 'uppercase', color: t.INK, whiteSpace: 'nowrap' }}>{tr('home:week.title', { defaultValue: 'Week so far' })}</h2>
        <span style={{ ...mono, marginLeft: 'auto', fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('home:week.gridMeta', { defaultValue: 'A square a day' })}</span>
      </div>
      {g ? (
        <div aria-hidden style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', padding: '10px 0 4px' }}>
          <span />
          {g.week.map((d, i) => (
            <span key={d} style={{ ...mono, textAlign: 'center', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color: i === g.today ? t.INK : t.INK50 }}>
              <span style={{ paddingBottom: 2, boxShadow: i === g.today ? `inset 0 -2px 0 ${red}` : 'none' }}>{narrow.format(dayOf(d))}</span>
            </span>
          ))}
          <span />
        </div>
      ) : null}
      {rows.map((r) => (
        <button key={r.key} type="button" data-bs-home-week-row={r.key} onClick={typeof r.onOpen === 'function' ? r.onOpen : undefined} disabled={typeof r.onOpen !== 'function'}
          aria-label={`${r.label}: ${r.value}${r.unit || ''}${r.note ? ` ${r.note}` : ''}`}
          style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', width: '100%', minHeight: 44, padding: '6px 0', border: 0, borderBottom: `1px solid ${t.HAIR}`, borderRadius: 0, background: 'transparent', cursor: typeof r.onOpen === 'function' ? 'pointer' : 'default', font: 'inherit', color: 'inherit', textAlign: 'left' }}>
          <span style={{ ...mono, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', lineHeight: 1.3, color: t.INK70, overflowWrap: 'anywhere' }}>{r.label}</span>
          {(r.cells || Array.from({ length: 7 }, () => null)).map((c, i) => <BSHsWeekCell key={i} state={c} color={r.color} />)}
          <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
            {r.unit ? <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50 }}>{r.unit}</span> : null}
            {r.of != null ? <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50 }}>/{num(r.of)}</span> : null}
          </span>
        </button>
      ))}
      <div aria-hidden style={{ ...mono, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 6, marginTop: 10, fontSize: 8.5, letterSpacing: '0.08em', color: t.INK50, textTransform: 'none' }}>
        {key({ background: t.INK }, tr('home:week.keyHit', { defaultValue: 'hit' }))}
        {key({ boxShadow: `inset 0 0 0 1.5px ${t.RULE}` }, tr('home:week.keyMissed', { defaultValue: 'missed' }))}
        {key({ border: `1px dashed ${t.RULE}` }, tr('home:week.keyAhead', { defaultValue: 'to come' }))}
        {anyRest ? key({ height: 2, width: 8, background: t.RULE }, tr('home:week.keyRest', { defaultValue: 'rest day' })) : null}
      </div>
      {rules.length ? <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', color: t.INK50 }}>{rules.join(' · ')}</div> : null}
    </section>
  );
}

// ── FROM YOUR COACHES ────────────────────────────────────────────────────────────────────────────

function useBSHomeUnread(ids) {
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

// `notes` are the coaches' weekly notes ({ role, text, who }), `coaches` the ones the member pays
// ({ role, name, conversationId, providerId }; a name that couldn't be read is null), both Home's.
// Nothing to say → nothing drawn.
export function BSHomeCoaches({ notes = [], coaches = [], onCalendar, onCoaches }) {
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
  const next = coached ? bsHomeNextSession(sessions, coaches) : null;
  const unread = useBSHomeUnread(coaches.map((c) => c.conversationId).filter(Boolean));
  return <BSHomeCoachesView notes={notes} coaches={coaches} next={next} unread={unread} onCalendar={onCalendar} onCoaches={onCoaches} />;
}

// The section itself: the notes, the coaches, the next session (bsHomeNextSession's) and the unread
// counts by thread ('dm:<id>'). The tests draw it directly. `onCoaches` opens Chat on the coaches'
// threads: a coach whose thread is not set up yet (the plan read's conversationId is null) has none
// to open, and opening by name would land on another coach's (Codex P2 on #2424).
export function BSHomeCoachesView({ notes = [], coaches = [], next = null, unread = {}, onCalendar, onCoaches }) {
  const t = window.useBS();
  const tr = useShapeTr();
  if (!notes.length && !coaches.length && !next) return null;
  const gold = bsHsGold(t);
  const roleWord = (role) => (role === 'nutritionist' ? tr('home:role.nutritionist', { defaultValue: 'Nutritionist' }) : tr('home:role.trainer', { defaultValue: 'Trainer' }));
  const openThread = (c) => {
    if (!c.conversationId) { if (typeof onCoaches === 'function') onCoaches(); return; }
    try { window.dispatchEvent(new window.CustomEvent('shape:openConversation', { detail: { conversationId: c.conversationId, name: c.name || undefined } })); } catch (e) { /* the chat tab is still a tap away */ }
  };
  const when = next ? (() => {
    try { return new Date(next.at).toLocaleString(bsHsLocale(), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return new Date(next.at).toString(); }
  })() : '';
  return (
    <section data-bs-home-coaches="">
      <BSFocusTitle kicker={tr('home:coaches.kicker', { defaultValue: 'Your coaches' })} title={tr('home:coaches.title', { defaultValue: 'From your coaches' })} color={gold} />
      {notes.length ? (
        <div style={{ padding: `14px ${t.padX}px 4px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notes.map((n, i) => (
            <div key={i} style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15, fontWeight: 500, color: t.INK70, lineHeight: 1.45, letterSpacing: '-0.01em' }}>
              &ldquo;{n.text}&rdquo;
              <span style={{ display: 'block', marginTop: 4, fontStyle: 'normal', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
                — {n.who ? `${n.who} · ` : ''}{roleWord(n.role)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop: 10 }}>
        {coaches.map((c) => {
          const n = (c.conversationId && unread && unread[`dm:${c.conversationId}`]) || 0;
          return (
            <BSFocusLink key={`${c.role}:${c.providerId ?? c.name}`} color={gold} glyph="✎"
              label={c.name ? tr('home:coaches.message', { defaultValue: 'Message {name}', name: c.name })
                : c.role === 'nutritionist' ? tr('home:coaches.messageNutritionist', { defaultValue: 'Message your nutritionist' })
                  : tr('home:coaches.messageTrainer', { defaultValue: 'Message your trainer' })}
              tag={n > 0 ? tr('home:coaches.unread', { defaultValue: '{n} new', n }) : roleWord(c.role)}
              onOpen={() => openThread(c)} />
          );
        })}
        {next ? (
          <BSFocusLink color={gold} glyph="◷" label={tr('home:coaches.nextSession', { defaultValue: 'Next session' })}
            tag={`${when} · ${next.providerName || roleWord(next.providerRole)}`}
            onOpen={() => { if (typeof onCalendar === 'function') onCalendar(new Date(next.at)); }} />
        ) : null}
      </div>
    </section>
  );
}
