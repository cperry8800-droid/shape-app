import React from 'react';
import { bsProDeckTheme, bsRaised, BSGlassEdge, BS_DECK_TEAL, BS_GAUGE_FACE, BS_DECK_MONO } from './BSProInstrument.jsx';
import { bsHomeGoalRead } from '../services/homeWeek.mjs';
import { bsHomeClimbState, bsClimbPoint, bsClimbPath, bsClimbRidge, bsClimbMilestones, bsClimbGold, bsClimbMix, BS_CLIMB_W, BS_CLIMB_H, BS_CLIMB_MILESTONES } from '../services/homeClimb.mjs';
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
//
// ⚠ IN COLOUR, WITH THE MILESTONES (owner, 2026-11-04: "add a little more info here, either milestones, and
// percentage progress, be creative, just not too much", then "lets maybe add a little more color to this
// graph, home page looking a little bland", and of the options, "this design but with option C coloring
// scheme on graph", then of option B's graph, "also i like this coloring for graph on home page"). The hill
// is washed from Shape's teal at the foot to gold at the summit, the goal, and the route runs the same way:
// the walked line solid, what is still to walk dashed, each milestone's tick and the now dot in the colour
// of where they stand, the flag in gold. Under the route, a goal on its way reads one
// slim strip: the share walked as a ring, the next milestone with its weight and what is left to it, and
// the four milestones as dots on the same teal → gold scale. Every figure is the goal read's own: the share
// is the route's (st.pct), the milestones are the goal page's (homeClimb.mjs's bsClimbMilestones, BSGoals'
// rule), and what is left runs from the latest weigh-in.
export function BSHomeClimbView({ data, docKg, isWeightGoal, goalWords, onOpen, tour, todayIso = bsCiIso(new Date()) }) {
  const t = window.useBS();
  const tr = useShapeTr();
  // The gradients' ids, one set per climb drawn.
  const gid = `bshc${String(React.useId()).replace(/[^a-zA-Z0-9]/g, '')}`;
  const teal = t.ACCENT || BS_DECK_TEAL;
  const gold = bsClimbGold(t);
  const along = (f) => bsClimbMix(teal, gold, f);
  const fg = t.INK;
  const faint = t.INK50;
  const ink = (a) => `rgba(${t.inkRGB || (t.isLight ? '20,18,15' : '245,240,230')},${a})`;
  // A colour at an alpha (the theme's colours are hex).
  const ha = (hex, a) => {
    const h = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
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
  const pctOf = (n) => tr('home:mornings.unitPct', { defaultValue: '{n}%', n });
  // The milestones, for a goal on its way only (the other states have no route walked to measure).
  const ms = st.kind === 'progress' ? bsClimbMilestones(read) : null;
  const msName = (m) => ({
    25: tr('goal:terms.mQuarter', { defaultValue: '25% there' }),
    50: tr('goal:terms.mHalf', { defaultValue: 'Halfway' }),
    75: tr('goal:terms.mThree', { defaultValue: '75% there' }),
    100: tr('goal:terms.mGoal', { defaultValue: 'Goal' }),
  })[m];
  const next = ms && ms.next ? { m: ms.next.m, name: msName(ms.next.m), weight: `${fmt(ms.next.kg)} ${unit}`, left: tr('home:goal.toGo', { defaultValue: '{amount} {unit} to go', amount: fmt(ms.away), unit }) } : null;
  const nextHead = next ? `${tr('goal:terms.next', { defaultValue: 'Next' })} · ${next.name}` : '';
  const mono = { fontFamily: BS_DECK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: faint, whiteSpace: 'nowrap' };
  // OVER THE SKY, THREE THINGS: the goal in the member's words, what is left, and the goal by the flag, alone
  // in its corner. The route's own numbers and the band under the hill are below (owner, 2026-11-04: "add more
  // info on this graph"); the share and the next milestone are the strip's, once each. The goal's words over
  // the climb, unless they are its big line already (the words state).
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
  // ⚠ THE NUMBERS ON THE ROUTE, A BAND OF FIGURES, AND MORE LIGHT (owner, 2026-11-04: "add more info on this
  // graph. Make it pop more", then of three designs, "go with A and include these and clean up the flag
  // section", with option B's band of four figures). For a goal on its way: the start weight at the foot,
  // each milestone's weight under its tick and the weight now in a chip over the dot; under the hill, Start,
  // Current, Pace and the date the goal falls at that pace, each only when the read has it (no pace yet, no
  // placeholder). The flag's corner says the goal alone. The light, every state but loading: a sun behind
  // the summit, the hill shaded toward its foot, a lit crest; on a goal on its way, a glow under the walked
  // line and the now dot breathing (still under reduced motion). Every figure is the goal read's own.
  const live = st.kind !== 'loading';
  const onWay = st.kind === 'progress' && !!read;
  const nowP = bsClimbPoint(pct / 100);
  const summit = bsClimbPoint(1);
  // A pace with its sign, unless it shows as zero: a flat trend reads 0.0, never +0.0 (Codex P2 on #2618).
  const signed = (kg) => (Math.round(Math.abs(Number(disp(kg)) || 0) * 10) === 0 ? fmt(0) : `${kg < 0 ? '−' : '+'}${fmt(Math.abs(kg))}`);
  // Capitals in the reader's locale: Turkish "şimdi" is ŞİMDİ, not ŞIMDI (Codex P2 on #2618).
  const upper = (str) => { try { return String(str).toLocaleUpperCase(bsHdLocale()); } catch (e) { return String(str).toUpperCase(); } };
  const nowWord = tr('home:climb.nowWord', { defaultValue: 'now' });
  const band = onWay ? [
    read.startKg != null ? { k: 'start', label: tr('goal:terms.whenStart', { defaultValue: 'Start' }), value: fmt(read.startKg), c: teal } : null,
    read.nowKg != null ? { k: 'current', label: tr('goal:cover.statCurrent', { defaultValue: 'Current' }), value: fmt(read.nowKg), c: along(pct / 100) } : null,
    read.paceKgWk != null ? { k: 'pace', label: tr('goal:cover.statPace', { defaultValue: 'Pace' }), value: tr('home:climb.paceWeek', { defaultValue: '{pace} {unit}/wk', pace: signed(read.paceKgWk), unit }), c: along(0.7) } : null,
    read.etaIso ? { k: 'eta', label: tr('goal:terms.whenGoal', { defaultValue: 'Goal' }), value: `≈\u00a0${bsHdDate(read.etaIso, { month: 'short', day: 'numeric' })}`, c: gold } : null,
  ].filter(Boolean) : [];
  // The weight now over the dot, or under it where the dot is too near the top for the chip to clear the
  // goal's corner; always inside the box.
  const chip = onWay && walked && pct < 100 && read.nowKg != null ? (() => {
    const text = upper(`${fmt(read.nowKg)} ${nowWord}`);
    const w = Math.round(text.length * 5.2 + 12);
    const above = nowP.y - 28 >= 22;
    return { text, w, x: Math.max(4, Math.min(BS_CLIMB_W - w - 4, nowP.x - w / 2)), y: above ? nowP.y - 28 : nowP.y + 9, above };
  })() : null;
  const sv = { fontFamily: BS_DECK_MONO, fontWeight: 700, letterSpacing: '0.08em' };
  // The door's name carries the strip and the band too, so a screen reader hears them as well.
  const doorName = [aria, ...(next ? [nextHead, next.weight, next.left] : []), ...band.map((b) => `${b.label} ${b.value}`)].join(' · ');
  const R = 13, RING = 2 * Math.PI * R;

  return (
    // ⚠ THE CLIMB IS A DOOR FOR EVERY HAND (Codex P2 on #2583): a state with its own link (reached, start
    // only, words, none) keeps that link as the keyboard's way in; a climb with none (progress) is itself a
    // button, focusable and opened with Enter or Space, named by what it shows. A climb still reading (or
    // whose read failed) shows nothing yet and is no door at all: an unnamed button in the tab order
    // otherwise (Codex P2 on #2583).
    <div data-bs-home-climb={st.kind} data-tour={tour || undefined} onClick={typeof onOpen === 'function' && st.kind !== 'loading' ? onOpen : undefined}
      {...(typeof onOpen === 'function' && !action && st.kind === 'progress' && aria ? {
        role: 'button', tabIndex: 0, 'aria-label': doorName || undefined,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
      } : null)}
      // 22px under the radio box: at 8px the ridge and the flag ran up against the box's foot (owner,
      // 2026-11-04: "there is some overlap with new home design and shape radio box, can we move the graph
      // down a little").
      style={{ position: 'relative', margin: '22px 0 0', cursor: typeof onOpen === 'function' && st.kind !== 'loading' ? 'pointer' : 'default' }}>
      {/* Named by what it shows; still reading, it shows nothing yet and is hidden from a screen reader,
          never an unnamed graphic in browse mode (Codex P2 on #2583). */}
      <svg {...(aria ? { role: 'img', 'aria-label': aria } : { 'aria-hidden': true, focusable: 'false' })} viewBox={`0 0 ${BS_CLIMB_W} ${BS_CLIMB_H}`} width="100%" style={{ display: 'block', height: 'auto' }}>
        <defs>
          {/* The hill washed from the teal at the foot to the gold at the summit, and the route drawn in the
              same run of colour, walked and still to walk. */}
          <linearGradient id={`${gid}rb`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={teal} stopOpacity={t.isLight ? 0.14 : 0.2} />
            <stop offset="1" stopColor={gold} stopOpacity={t.isLight ? 0.3 : 0.36} />
          </linearGradient>
          <linearGradient id={`${gid}p`} gradientUnits="userSpaceOnUse" x1="14" y1="0" x2="300" y2="0">
            <stop offset="0" stopColor={teal} />
            <stop offset="1" stopColor={gold} />
          </linearGradient>
          {/* The sun behind the summit, fading out before the box's edge so it never shows one, and the
              hill shaded toward its foot. */}
          <radialGradient id={`${gid}sun`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={gold} stopOpacity={t.isLight ? 0.38 : 0.5} />
            <stop offset="1" stopColor={gold} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${gid}sh`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={t.PAPER} stopOpacity="0" />
            <stop offset="1" stopColor={t.PAPER} stopOpacity={t.isLight ? 0.35 : 0.55} />
          </linearGradient>
        </defs>
        {onWay && walked && pct < 100 ? (
          <style>{`@keyframes ${gid}br{0%,100%{opacity:.18}50%{opacity:.42}}.${gid}br{animation:${gid}br 2.6s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.${gid}br{animation:none}}`}</style>
        ) : null}
        {live ? <circle data-climb-sun="" cx={summit.x} cy={summit.y + 4} r={summit.y + 4} fill={`url(#${gid}sun)`} /> : null}
        <polygon data-climb-ridge="" points={bsClimbRidge()} fill={`url(#${gid}rb)`} />
        {live ? <polygon data-climb-shade="" points={bsClimbRidge()} fill={`url(#${gid}sh)`} /> : null}
        {live ? <polyline data-climb-crest="" points={bsClimbRidge().split(' ').slice(2, -2).join(' ')} fill="none" stroke={`url(#${gid}p)`} strokeOpacity={t.isLight ? 0.55 : 0.75} strokeWidth="1.1" strokeLinejoin="round" /> : null}
        {onWay && walked && pct > 0 ? <polyline data-climb-glow="" points={bsClimbPath(0, pct / 100)} fill="none" stroke={`url(#${gid}p)`} strokeOpacity={t.isLight ? 0.18 : 0.3} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /> : null}
        <polyline data-climb-ahead="" points={bsClimbPath(walked ? pct / 100 : 0, 1)} fill="none" stroke={`url(#${gid}p)`} strokeOpacity="0.7" strokeWidth="1.6" strokeDasharray="3 4" strokeLinecap="round" />
        {walked && pct > 0 ? <polyline data-climb-walked={pct} points={bsClimbPath(0, pct / 100)} fill="none" stroke={`url(#${gid}p)`} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {st.kind !== 'loading' ? BS_CLIMB_MILESTONES.map((m, i) => {
          const p = bsClimbPoint(m / 100);
          // Passed by the goal page's test when there is one to run (so a tick and its dot agree), else by
          // the share walked.
          const passed = ms ? ms.stops[i].done : (walked && pct >= m);
          return (
            <g key={m} data-climb-milestone={m} data-climb-passed={passed ? '' : undefined}>
              <line x1={p.x} y1={p.y - 5} x2={p.x} y2={p.y + 5} stroke={passed ? along(m / 100) : ha(along(m / 100), 0.6)} strokeWidth="2" />
              {onWay && ms ? <text data-climb-ms-weight={m} x={p.x} y={p.y + 15} textAnchor="middle" style={{ ...sv, fontSize: 7.5 }} fill={along(m / 100)} fillOpacity={passed ? 1 : 0.75}>{fmt(ms.stops[i].kg)}</text> : null}
            </g>
          );
        }) : null}
        {(() => {
          const p = bsClimbPoint(1);
          const planted = st.kind === 'reached';
          return (
            <g data-climb-flag={planted ? 'planted' : 'open'}>
              <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - 20} stroke={fg} strokeWidth="1.5" />
              <polygon points={`${p.x},${p.y - 20} ${p.x + 14},${p.y - 15} ${p.x},${p.y - 10}`} fill={planted ? teal : gold} fillOpacity={planted ? 1 : (st.kind === 'none' || st.kind === 'words' ? 0 : 1)} stroke={planted ? fg : gold} strokeWidth="1" />
            </g>
          );
        })()}
        {onWay && walked && pct < 100 ? <circle data-climb-breath="" className={`${gid}br`} cx={nowP.x} cy={nowP.y} r="10" fill={along(pct / 100)} opacity="0.3" /> : null}
        {walked && pct < 100 ? (() => { const p = bsClimbPoint(pct / 100); return <circle data-climb-now="" cx={p.x} cy={p.y} r="4.5" fill={along(pct / 100)} stroke={t.PAPER} strokeWidth="2" />; })() : null}
        {chip ? (
          <g data-climb-now-chip={chip.above ? 'above' : 'below'}>
            <line x1={nowP.x} y1={chip.above ? nowP.y - 7 : nowP.y + 6} x2={nowP.x} y2={chip.above ? nowP.y - 13 : nowP.y + 9} stroke={along(pct / 100)} strokeWidth="1" />
            <rect x={chip.x} y={chip.y} width={chip.w} height="15" rx="7.5" fill={ha(along(pct / 100), t.isLight ? 0.16 : 0.22)} stroke={along(pct / 100)} strokeWidth="0.9" />
            <text x={chip.x + chip.w / 2} y={chip.y + 10} textAnchor="middle" style={{ ...sv, fontSize: 7.5 }} fill={fg}>{chip.text}</text>
          </g>
        ) : null}
        {onWay && read.startKg != null ? (
          <text data-climb-start="" x="12" y="148" style={{ ...sv, fontSize: 7.5 }} fill={teal}>{upper(`${tr('goal:terms.whenStart', { defaultValue: 'Start' })} ${fmt(read.startKg)}`)}</text>
        ) : null}
      </svg>
      {band.length ? (
        // The band under the hill: each figure in a glass slot with an edge in its colour on the run.
        <div data-climb-band={band.map((b) => b.k).join(' ')} style={{ margin: '6px 14px 0', display: 'grid', gridTemplateColumns: `repeat(${band.length}, minmax(0, 1fr))`, gap: 6 }}>
          {band.map((b) => (
            <div key={b.k} data-climb-band-cell={b.k} style={{ minWidth: 0, padding: '6px 8px 7px', borderRadius: 11, background: ink(t.isLight ? 0.045 : 0.07), border: `1px solid ${ink(t.isLight ? 0.08 : 0.1)}`, boxShadow: `inset 0 2px 0 ${ha(b.c, 0.75)}` }}>
              <div style={{ ...mono, fontSize: 7.5, letterSpacing: '0.12em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</div>
              {/* A value wraps at its spaces rather than losing its unit where a slot is narrow, as on a 320px
                  phone (Codex P2 on #2618); the slots of a row grow together. */}
              <div data-climb-band-value="" style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: b.value.length > 8 ? 12.5 : 14, lineHeight: 1.15, color: fg, whiteSpace: 'normal', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{b.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* The words over the sky, top left, and the target by the flag, in the goal's gold. */}
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
        <div data-climb-goal="" style={{ position: 'absolute', right: t.padX, top: 0, ...mono, color: gold, textShadow: t.isLight ? undefined : `0 0 8px ${ha(gold, 0.6)}` }}>{tr('home:goal.target', { defaultValue: 'Goal' })} {fmt(read.targetKg)}</div>
      ) : null}

      {/* The strip: the share walked as a ring, the next milestone and what is left to it, the four
          milestones as dots (met ones filled, the next one ringed and lit). */}
      {ms ? (
        <div data-climb-strip="" style={{ margin: '4px 14px 0', padding: '9px 12px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 11, background: ink(t.isLight ? 0.045 : 0.06), border: `1px solid ${ink(t.isLight ? 0.08 : 0.1)}` }}>
          <span aria-hidden="true" style={{ position: 'relative', width: 34, height: 34, flex: 'none' }}>
            <svg width="34" height="34" viewBox="0 0 34 34" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
              <defs>
                <linearGradient id={`${gid}k`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={teal} />
                  <stop offset="1" stopColor={along(pct / 100)} />
                </linearGradient>
              </defs>
              <circle cx="17" cy="17" r={R} fill="none" stroke={ink(0.14)} strokeWidth="3" />
              <circle data-climb-ring={pct} cx="17" cy="17" r={R} fill="none" stroke={`url(#${gid}k)`} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(RING * pct) / 100} ${RING}`} />
            </svg>
            <span data-climb-strip-pct="" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: BS_DECK_MONO, fontSize: 8.5, fontWeight: 800, color: fg, fontVariantNumeric: 'tabular-nums' }}>{pctOf(pct)}</span>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span data-climb-next={next ? next.m : undefined} style={{ display: 'block', ...mono, fontSize: 8.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {next ? nextHead : tr('home:goal.pctThere', { defaultValue: '{pct}% there', pct })}
            </span>
            {next ? (
              <span style={{ display: 'block', marginTop: 3, fontFamily: t.DISPLAY, fontSize: 14, color: fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span data-climb-next-weight="">{next.weight}</span><span data-climb-next-left="" style={{ color: faint }}> · {next.left}</span>
              </span>
            ) : null}
          </span>
          <span aria-hidden="true" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            {ms.stops.map((s) => {
              const isNext = !!next && s.m === next.m;
              const c = along(s.m / 100);
              const sz = s.m === 100 ? 9 : 7;
              return <span key={s.m} data-climb-pip={s.m} data-climb-pip-state={s.done ? 'done' : isNext ? 'next' : 'ahead'} data-climb-pip-color={c} style={{ width: sz, height: sz, borderRadius: s.m === 100 ? 2 : 99, boxSizing: 'border-box', background: s.done ? c : 'transparent', border: `1.5px solid ${s.done || isNext ? c : ha(c, 0.55)}`, boxShadow: isNext && !t.isLight ? `0 0 6px ${ha(c, 0.85)}` : 'none' }} />;
            })}
          </span>
        </div>
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
// It never shrinks: where the line runs out of room (a narrow phone, a long language) the words around it
// end in "…" and the door stays whole (Codex P2 on #2601).
function BSHdStepsDoor({ onSteps, up, children }) {
  const t = window.useBS();
  return (
    <button type="button" data-bs-home-steps="" onClick={onSteps}
      style={{ display: 'inline-block', flex: 'none', verticalAlign: 'top', boxSizing: 'border-box', minWidth: 44, minHeight: 44, margin: `-${up}px -6px -26px`, padding: `${up}px 6px 26px`, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', lineHeight: '12px', whiteSpace: 'nowrap', textAlign: 'center', color: t.ACCENT }}>
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
  // The words are pieces of a flex line: the words before Steps, the door, the words after. The words
  // shrink and end in "…" (white space kept, so " · " keeps its spaces at a piece's edge); the door never
  // does, so a narrow line cuts words, never the one way to the Shape Steps page (Codex P2 on #2601).
  const piece = { minWidth: 0, flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre' };
  const nameLine = (markOf, up) => {
    const said = rows.map((k) => { const m = markOf(k); return `${m ? `${m} ` : ''}${names[k]}`; });
    const at = typeof onSteps === 'function' ? rows.indexOf('steps') : -1;
    if (at < 0) return <span aria-hidden="true" style={piece}>{said.join(' · ')}</span>;
    const before = said.slice(0, at).join(' · ');
    const after = said.slice(at + 1).join(' · ');
    const m = markOf('steps');
    return [
      before ? <span key="before" aria-hidden="true" style={piece}>{`${before} · `}</span> : null,
      <BSHdStepsDoor key="steps" onSteps={onSteps} up={up}>{m ? <span aria-hidden="true">{`${m} `}</span> : null}{names.steps}</BSHdStepsDoor>,
      after ? <span key="after" aria-hidden="true" style={piece}>{` · ${after}`}</span> : null,
    ];
  };
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
          <span data-bs-home-day-line="" style={{ minWidth: 0, display: 'flex', alignItems: 'flex-start', margin: '-6px 0 -26px', padding: '6px 0 26px', color: t.INK70, overflow: 'hidden' }}>
            {nameLine((k) => { const st = g[k] ? g[k][pickIdx] : null; return st && mark[st] ? mark[st] : ''; }, 6)}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginTop: 4, padding: '0 6px', ...mono, fontSize: 8, lineHeight: '12px', letterSpacing: '0.12em', color: t.INK50 }}>
          <span aria-hidden="true">{tr('home:week.barsKey', { defaultValue: 'Each day' })}</span>
          <span data-bs-home-day-line="" style={{ minWidth: 0, display: 'flex', alignItems: 'flex-start', margin: '-4px 0 -26px', padding: '4px 0 26px', color: t.INK70, overflow: 'hidden' }}>{nameLine(() => '', 4)}</span>
        </div>
      )}
    </section>
  );
}
