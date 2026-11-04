import React from 'react';
import { bsProDeckTheme, bsRaised, BSGlassEdge, BS_DECK_TEAL, BS_GAUGE_FACE, BS_DECK_MONO } from './BSProInstrument.jsx';
import { bsHomeGoalRead } from '../services/homeWeek.mjs';
import { bsHomeClimbState, bsClimbPoint, bsClimbPath, bsClimbRidge, BS_CLIMB_W, BS_CLIMB_H, BS_CLIMB_MILESTONES } from '../services/homeClimb.mjs';
import { bsCiIso } from './BSCheckinCard.jsx';
import { useBSHomeGoalData, useBSHomeWeek } from './BSHomeSections.jsx';

// ─── THE MEMBER HOME'S DECK ─────────────────────────────────────────────────────────────────────
// The Home the owner chose (2026-11-03, "go with The whole Home: C on top, M3 below, but use this
// design at the top, and move shape radio box above the graph", then "the chart should just be goal
// progress"): an ink band, the coach pages' deck (BSProInstrument.jsx), holding Shape Radio's slim
// box, the climb to the member's goal, and This week as five bars a day.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx).

const { useState, useEffect } = React;

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

function bsHdLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}
function bsHdDate(iso, opts) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(dt.getTime())) return '';
  try { return dt.toLocaleDateString(bsHdLocale(), opts); } catch (e) { return dt.toDateString(); }
}

// The deck: a round, raised box in the paper's own colour (bsProDeckTheme, bsRaised; owner, 2026-11-04:
// "make sure the glassy look matches the print color", "this doesnt go together now"), inset from the
// page's edges, handing its theme to what it holds so the climb and the week read on it. The paper's accent
// reads on it as it is; it was lifted toward white while the band was dark on a light paper.
// ⚠ SHAPE RADIO STANDS ABOVE THE DECK, ON ITS OWN LINE (owner, 2026-11-04: "take the shape radio box out of
// the new climb box above it so its on its own line"). It is still handed in as `radio`, so Home keeps one
// place that says what leads the page, but it is drawn before the band, outside its theme, its edges on
// the deck's (its own 8px margin and 2px more make the deck's 10px).
export function BSHomeDeck({ radio = null, children }) {
  const t = window.useBS();
  const d = bsProDeckTheme(t);
  const Ctx = typeof window !== 'undefined' ? window.BSContext : null;
  const band = (
    <section data-bs-home-deck="" data-glass="" style={{ color: d.INK, padding: '2px 0 16px', margin: radio ? '10px 10px 0' : '6px 10px 0', ...bsRaised(t) }}>
      <BSGlassEdge t={t} />
      {children}
    </section>
  );
  const deck = Ctx ? <Ctx.Provider value={d}>{band}</Ctx.Provider> : band;
  if (!radio) return deck;
  return (
    <React.Fragment>
      <div data-bs-home-radio="" style={{ margin: '0 2px' }}>{radio}</div>
      {deck}
    </React.Fragment>
  );
}

// ── THE CLIMB ────────────────────────────────────────────────────────────────────────────────────

export function BSHomeClimb({ demo = null, ...view }) {
  const data = useBSHomeGoalData(demo);
  return <BSHomeClimbView data={data} {...view} />;
}

// The climb off `data` (the goal document, its words and the weigh-ins; null while it reads or after a
// read that failed, which draws the ridge alone and says nothing). The tests draw it directly.
export function BSHomeClimbView({ data, docKg, isWeightGoal, goalWords, onOpen, tour, todayIso = bsCiIso(new Date()) }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const teal = t.ACCENT || BS_DECK_TEAL;
  const fg = t.INK;
  const faint = t.INK50;
  const overall = (data && data.overall) || {};
  const toKg = (v) => (typeof docKg === 'function' ? docKg(v, overall) : null);
  const read = data ? bsHomeGoalRead({ weighIns: data.weighIns, startKg: toKg(overall.start), targetKg: toKg(overall.target), todayIso }) : null;
  const words = data ? (String(overall.title || '').trim() || (typeof goalWords === 'function' ? goalWords(data.primary) : '') || '') : '';
  const weightGoal = !!data && ((typeof isWeightGoal === 'function' ? isWeightGoal(data.primary) : true) || (read && read.targetKg != null));
  const st = data ? bsHomeClimbState({ read, words, weightGoal }) : { kind: 'loading', pct: 0, early: false };
  const unit = (t.unitPrefs && t.unitPrefs.weight) || 'kg';
  const disp = (kg) => (typeof t.kgToDisplay === 'function' ? t.kgToDisplay(kg) : kg);
  const fmt = (kg, digits = 1) => {
    const v = disp(kg);
    try { return Number(v).toLocaleString(bsHdLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }); } catch (e) { return Number(v).toFixed(digits); }
  };
  const pct = st.pct || 0;
  const walked = st.kind === 'progress' || st.kind === 'reached';
  const mono = { fontFamily: BS_DECK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: faint, whiteSpace: 'nowrap' };
  // ⚠ THE CLIMB SAYS THREE THINGS (owner, 2026-11-04: "simplify some of the data on the hill climb/chart.
  // looks like too much and can be a little overwhelming"): the goal in the member's words, what is left,
  // and the goal by the flag; the route shows how far. The pace, its date, the start, the weight now and the
  // milestones' shares went; they are on the goal page the climb opens. The goal's words over the climb,
  // unless they are its big line already (the words state).
  const eyebrow = words && st.kind !== 'words' ? `“${words}”` : '';
  const link = (label) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); if (typeof onOpen === 'function') onOpen(); }}
      style={{ minHeight: 44, padding: 0, marginTop: 2, border: 0, background: 'transparent', cursor: 'pointer', ...mono, fontSize: 9.5, color: teal }}>{label}</button>
  );

  let big = null, unitWord = null, line = null, action = null;
  if (st.kind === 'progress') {
    big = fmt(read.toGoKg ?? 0);
    unitWord = tr('home:goal.left', { defaultValue: '{unit} to go', unit });
  } else if (st.kind === 'reached') {
    big = `${tr('home:goal.reached', { defaultValue: 'Goal reached' })} ✓`;
    action = link(tr('home:climb.nextOne', { defaultValue: 'Set the next one →' }));
  } else if (st.kind === 'start') {
    big = fmt(read.nowKg);
    unitWord = tr('home:goal.now', { defaultValue: '{unit} now', unit });
    action = link(tr('home:climb.addNumber', { defaultValue: 'Add a number to track it →' }));
  } else if (st.kind === 'target') {
    big = fmt(read.targetKg);
    unitWord = unit;
    line = [tr('home:goal.target', { defaultValue: 'Goal' }), tr('home:goal.noWeighIns', { defaultValue: 'No weigh-ins yet.' })].join(' · ');
    action = link(tr('home:goal.weighIn', { defaultValue: 'Weigh in →' }));
  } else if (st.kind === 'words') {
    big = `“${words}”`;
    action = link(tr('home:climb.addNumber', { defaultValue: 'Add a number to track it →' }));
  } else if (st.kind === 'none') {
    big = tr('home:climb.noGoal', { defaultValue: 'No goal yet' });
    action = link(tr('home:goal.set', { defaultValue: 'Set your goal →' }));
  }
  const textBig = st.kind === 'words' || st.kind === 'none' || st.kind === 'reached';
  const aria = st.kind === 'progress'
    ? tr('home:climb.aria', { defaultValue: 'Your goal: {pct}% of the way, {amount} {unit} to go', pct, amount: fmt(read.toGoKg ?? 0), unit })
    : (typeof big === 'string' ? big : '');

  return (
    // ⚠ THE CLIMB IS A DOOR FOR EVERY HAND (Codex P2 on #2583): a state with its own link (reached, start
    // only, words, none) keeps that link as the keyboard's way in; a climb with none (progress) is itself a
    // button, focusable and opened with Enter or Space, named by what it shows. A climb still reading (or
    // whose read failed) shows nothing yet and is no door at all: an unnamed button in the tab order
    // otherwise (Codex P2 on #2583).
    <div data-bs-home-climb={st.kind} data-tour={tour || undefined} onClick={typeof onOpen === 'function' && st.kind !== 'loading' ? onOpen : undefined}
      {...(typeof onOpen === 'function' && !action && st.kind === 'progress' && aria ? {
        role: 'button', tabIndex: 0, 'aria-label': aria || undefined,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
      } : null)}
      // 22px under the radio box: at 8px the ridge and the flag ran up against the box's foot (owner,
      // 2026-11-04: "there is some overlap with new home design and shape radio box, can we move the graph
      // down a little").
      style={{ position: 'relative', margin: '22px 0 0', cursor: typeof onOpen === 'function' && st.kind !== 'loading' ? 'pointer' : 'default' }}>
      {/* Named by what it shows; still reading, it shows nothing yet and is hidden from a screen reader,
          never an unnamed graphic in browse mode (Codex P2 on #2583). */}
      <svg {...(aria ? { role: 'img', 'aria-label': aria } : { 'aria-hidden': true, focusable: 'false' })} viewBox={`0 0 ${BS_CLIMB_W} ${BS_CLIMB_H}`} width="100%" style={{ display: 'block', height: 'auto' }}>
        <polygon points={bsClimbRidge()} fill={`rgba(${t.inkRGB || '245,240,230'},0.07)`} />
        <polyline points={bsClimbPath(walked ? pct / 100 : 0, 1)} fill="none" stroke={faint} strokeWidth="1.4" strokeDasharray="3 4" strokeLinecap="round" />
        {walked && pct > 0 ? <polyline data-climb-walked={pct} points={bsClimbPath(0, pct / 100)} fill="none" stroke={teal} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {st.kind !== 'loading' ? BS_CLIMB_MILESTONES.map((m) => {
          const p = bsClimbPoint(m / 100);
          const passed = walked && pct >= m;
          // A tick at each quarter, in the teal once passed; their shares went with the rest of the numbers.
          return (
            <g key={m} data-climb-milestone={m} data-climb-passed={passed ? '' : undefined}>
              <line x1={p.x} y1={p.y - 5} x2={p.x} y2={p.y + 5} stroke={passed ? teal : faint} strokeWidth="1.4" />
            </g>
          );
        }) : null}
        {(() => {
          const p = bsClimbPoint(1);
          const planted = st.kind === 'reached';
          return (
            <g data-climb-flag={planted ? 'planted' : 'open'}>
              <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - 20} stroke={fg} strokeWidth="1.5" />
              <polygon points={`${p.x},${p.y - 20} ${p.x + 14},${p.y - 15} ${p.x},${p.y - 10}`} fill={planted ? teal : fg} fillOpacity={planted ? 1 : (st.kind === 'none' || st.kind === 'words' ? 0 : 0.9)} stroke={fg} strokeWidth="1" />
            </g>
          );
        })()}
        {walked && pct < 100 ? (() => { const p = bsClimbPoint(pct / 100); return <circle data-climb-now="" cx={p.x} cy={p.y} r="4.5" fill={teal} stroke={t.PAPER} strokeWidth="2" />; })() : null}
      </svg>

      {/* The words over the sky, top left, and the target by the flag. */}
      <div style={{ position: 'absolute', left: t.padX, right: t.padX, top: 0, pointerEvents: 'none' }}>
        {eyebrow ? <div style={{ ...mono, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>{eyebrow}</div> : null}
        {big != null ? (
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: BS_GAUGE_FACE, fontWeight: 300, fontSize: textBig ? 28 : 46, lineHeight: 1, letterSpacing: '-0.03em', color: fg, fontVariantNumeric: 'tabular-nums' }}>{big}</span>
            {unitWord ? <span style={{ fontFamily: t.DISPLAY, fontSize: 15, color: fg }}>{unitWord}</span> : null}
          </div>
        ) : null}
        {line ? <div data-climb-pace="" style={{ ...mono, marginTop: 4 }}>{line}</div> : null}
        {action ? <div style={{ pointerEvents: 'auto' }}>{action}</div> : null}
      </div>
      {st.kind === 'progress' && read.targetKg != null ? (
        <div style={{ position: 'absolute', right: t.padX, top: 0, ...mono, color: fg }}>{tr('home:goal.target', { defaultValue: 'Goal' })} {fmt(read.targetKg)}</div>
      ) : null}
    </div>
  );
}

// ── THIS WEEK, FIVE BARS A DAY ─────────────────────────────────────────────────────────────────

// Each day's bars are Week so far's rows (owner, 2026-11-03: "ok looks good" of the key Train · Food ·
// Protein · Steps · Check-in): tall where the day hit it, a stub where it missed, an outline for a day
// still to come, a dash for a rest day, and a dot where nothing could read.
function BSHdBar({ state, on }) {
  const t = window.useBS();
  const ink = on ? t.PAPER : t.INK;
  const rule = on ? `${t.PAPER}55` : t.RULE;
  const base = { width: 3.5, borderRadius: 1, boxSizing: 'border-box' };
  if (state === 'hit') return <span data-bar="hit" style={{ ...base, height: 11, background: ink }} />;
  if (state === 'miss') return <span data-bar="miss" style={{ ...base, height: 3, background: ink, opacity: 0.55 }} />;
  if (state === 'ahead') return <span data-bar="ahead" style={{ ...base, height: 11, border: `1px solid ${rule}` }} />;
  if (state === 'rest') return <span data-bar="rest" style={{ ...base, height: 2, background: rule }} />;
  return <span data-bar="unknown" style={{ ...base, height: 2, width: 2, background: rule }} />;
}

// Steps under the strip is the door to the Shape Steps page (owner, 2026-11-04: "where did shape steps
// go?", then "yes put it back on this week steps"): Week so far's Steps tile was its only door, and it
// went with that block (#2583). The word keeps its place in the line, in the accent as the date's → is.
// Its 44px box reaches `up` px into the gap over the line and 26px down into this section's 10px and the
// deck's 16px, as the date's does; the line's own box is as tall, so its clip never cuts the target.
function BSHdStepsDoor({ onSteps, up, children }) {
  const t = window.useBS();
  return (
    <button type="button" data-bs-home-steps="" onClick={onSteps}
      style={{ display: 'inline-block', verticalAlign: 'top', boxSizing: 'border-box', minWidth: 44, minHeight: 44, margin: `-${up}px -6px -26px`, padding: `${up}px 6px 26px`, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', lineHeight: '12px', textAlign: 'center', color: t.ACCENT }}>
      {children}
    </button>
  );
}

export function BSHomeWeekBars({ checkinsOn = true, onDay, onMonth, onSteps, picked, onPick, ...reads }) {
  const w = useBSHomeWeek(reads);
  return <BSHomeWeekBarsView w={w} checkinsOn={checkinsOn} onDay={onDay} onMonth={onMonth} onSteps={onSteps} picked={picked} onPick={onPick} />;
}

// `picked` / `onPick`: the day picked, when Home holds it (so Team below follows it); with no onPick the
// strip keeps its own. `onSteps` opens the Shape Steps page from the line's Steps.
export function BSHomeWeekBarsView({ w, checkinsOn = true, onDay, onMonth, onSteps = null, picked: pickedProp = null, onPick = null }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const g = (w && w.grid) || null;
  const rows = ['sessions', 'food', 'protein', 'steps', ...(checkinsOn ? ['mornings'] : [])];
  const names = {
    sessions: tr('home:week.barTrain', { defaultValue: 'Train' }),
    food: tr('home:week.barFood', { defaultValue: 'Food' }),
    protein: tr('home:week.gridProtein', { defaultValue: 'Protein' }),
    steps: tr('home:week.gridSteps', { defaultValue: 'Steps' }),
    mornings: tr('home:week.barCheckin', { defaultValue: 'Check-in' }),
  };
  const word = {
    hit: tr('home:week.keyHit', { defaultValue: 'hit' }),
    miss: tr('home:week.keyMissed', { defaultValue: 'missed' }),
    ahead: tr('home:week.keyAhead', { defaultValue: 'to come' }),
    rest: tr('home:week.keyRest', { defaultValue: 'rest day' }),
  };
  const locale = bsHdLocale();
  const dayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDay = (iso, opts) => { try { return dayOf(iso).toLocaleDateString(locale, opts); } catch (e) { return iso; } };
  const week = g ? g.week : [];
  const isoWeek = week.length ? (() => {
    const d = dayOf(week[3]);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  })() : null;
  const span = week.length ? `${fmtDay(week[0], { month: 'short', day: 'numeric' })}–${fmtDay(week[6], dayOf(week[0]).getMonth() === dayOf(week[6]).getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}` : '';
  const mono = { fontFamily: BS_DECK_MONO, fontWeight: 700, textTransform: 'uppercase' };
  // A tap picks a day in place; the picked day's line under the strip says how it went, and a second tap
  // (or its →) opens the calendar on it (owner, 2026-11-04: "when i click on any day on week view for
  // client home page it immediatly takes me to month calendar"). Today is picked until another is.
  const [pickedOwn, setPickedOwn] = React.useState(null);
  const held = typeof onPick === 'function';
  const picked = held ? pickedProp : pickedOwn;
  const setPicked = (i) => { if (held) onPick(i); else setPickedOwn(i); };
  const pickIdx = g ? (picked != null && picked >= 0 && picked < week.length ? picked : g.today) : null;
  const pickIso = pickIdx != null ? week[pickIdx] : null;
  const openDay = (iso) => { if (iso && typeof onDay === 'function') onDay(dayOf(iso)); };
  const mark = { hit: '✓', miss: '×', ahead: '○', rest: '–' };
  // The line's words, each bar's mark and name; Steps is the door to the Shape Steps page when Home gives
  // one. The words stay hidden from a screen reader (each day's button says them); the door reads its name.
  const nameLine = (markOf, up) => rows.map((k, j) => {
    const m = markOf(k);
    return (
      <React.Fragment key={k}>
        {j ? <span aria-hidden="true"> · </span> : null}
        {k === 'steps' && typeof onSteps === 'function'
          ? <BSHdStepsDoor onSteps={onSteps} up={up}>{m ? <span aria-hidden="true">{`${m} `}</span> : null}{names[k]}</BSHdStepsDoor>
          : <span aria-hidden="true">{`${m ? `${m} ` : ''}${names[k]}`}</span>}
      </React.Fragment>
    );
  });
  return (
    // Condensed (owner, 2026-11-04: "the week calendar can be condensed a little to create more space"): the
    // head's Month keeps its 44px tap without standing the row 44px tall, the days 52px (from 64), the bars
    // 11px (from 14). ⚠ NO TAP BOX OVERLAPS ANOTHER (Codex P2 on #2593): Month reaches 12px up into the
    // head's padding and 6px down into the 6px gap over the days, never onto a day; the picked day's →
    // reaches 6px up into the gap over its line and 26px down into this section's 10px and the deck's 16px.
    <section data-bs-home-week-bars="" aria-label={tr('home:section.thisWeek', { defaultValue: 'This week' })} style={{ padding: `8px ${t.padX - 6}px ${10}px` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 6px' }}>
        <h2 style={{ margin: 0, fontFamily: t.HEAD || t.DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: t.INK, whiteSpace: 'nowrap' }}>
          {tr('home:section.thisWeek', { defaultValue: 'This week' })}<span aria-hidden="true" style={{ color: '#e0654b' }}>.</span>
        </h2>
        {isoWeek ? <span style={{ ...mono, fontSize: 8.5, letterSpacing: '0.14em', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('home:dateline.wkAbbr', { defaultValue: 'Wk' })} {isoWeek} · {span}</span> : null}
        {onMonth ? <button type="button" onClick={onMonth} style={{ minHeight: 44, margin: '-12px 0 -6px auto', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', ...mono, fontSize: 9, letterSpacing: '0.14em', color: t.ACCENT, whiteSpace: 'nowrap' }}>{tr('home:week.month', { defaultValue: 'Month →' })}</button> : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3, marginTop: 6 }}>
        {(week.length ? week : Array.from({ length: 7 }, () => null)).map((iso, i) => {
          const today = g && i === g.today;
          const isPicked = g && i === pickIdx;
          const states = rows.map((k) => (g && g[k] ? g[k][i] : null));
          const label = iso ? `${fmtDay(iso, { weekday: 'long', month: 'long', day: 'numeric' })}: ${rows.map((k, j) => (states[j] ? `${names[k]} ${word[states[j]]}` : null)).filter(Boolean).join(', ')}` : '';
          return (
            <button key={iso || i} type="button" data-bs-home-day={iso || ''} aria-label={label} aria-current={today ? 'date' : undefined} aria-pressed={iso ? !!isPicked : undefined}
              onClick={() => { if (!iso) return; if (isPicked) openDay(iso); else setPicked(i); }}
              style={{ minWidth: 0, minHeight: 52, padding: '4px 0 5px', border: 0, borderRadius: 8, background: today ? t.INK : 'transparent', color: today ? t.PAPER : t.INK,
                // The picked day, when it is not today, is ringed (today keeps its ink).
                boxShadow: isPicked && !today ? `inset 0 0 0 1.5px ${t.INK70}` : 'none', cursor: iso ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ ...mono, fontSize: 8.5, letterSpacing: '0.1em', color: today ? t.PAPER : t.INK70 }}>{iso ? fmtDay(iso, { weekday: 'short' }) : ''}</span>
              <span style={{ fontFamily: BS_GAUGE_FACE, fontSize: 17, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{iso ? dayOf(iso).getDate() : ''}</span>
              <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 11 }}>
                {states.map((s, j) => <BSHdBar key={j} state={s} on={today} />)}
              </span>
            </button>
          );
        })}
      </div>
      {/* The picked day's line: its date as the door to the calendar, then each bar's name marked as it went
          (✓ hit, × missed, ○ to come, – rest day). An unread week keeps the key. */}
      {pickIso ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginTop: 6, padding: '0 0 0 6px', height: 12, ...mono, fontSize: 8, lineHeight: '12px', letterSpacing: '0.12em', color: t.INK50 }}>
          <button type="button" data-bs-home-open-day={pickIso} onClick={() => openDay(pickIso)}
            aria-label={fmtDay(pickIso, { weekday: 'long', month: 'long', day: 'numeric' })}
            style={{ flex: 'none', minHeight: 44, margin: '-6px 0 -26px', padding: '6px 0 0', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', ...mono, fontSize: 8.5, lineHeight: '12px', letterSpacing: '0.12em', color: t.ACCENT, whiteSpace: 'nowrap' }}>
            {fmtDay(pickIso, { weekday: 'short' })} {dayOf(pickIso).getDate()} →
          </button>
          <span style={{ minWidth: 0, margin: '-6px 0 -26px', padding: '6px 0 26px', color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nameLine((k) => { const st = g[k] ? g[k][pickIdx] : null; return st && mark[st] ? mark[st] : ''; }, 6)}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginTop: 4, padding: '0 6px', ...mono, fontSize: 8, lineHeight: '12px', letterSpacing: '0.12em', color: t.INK50 }}>
          <span aria-hidden="true">{tr('home:week.barsKey', { defaultValue: 'Each day' })}</span>
          <span style={{ minWidth: 0, margin: '-4px 0 -26px', padding: '4px 0 26px', color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameLine(() => '', 4)}</span>
        </div>
      )}
    </section>
  );
}
