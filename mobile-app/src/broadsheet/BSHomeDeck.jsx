import React from 'react';
import { bsProDeckTheme, BS_DECK_TEAL, BS_GAUGE_FACE } from './BSProInstrument.jsx';
import { bsHomeGoalRead } from '../services/homeWeek.mjs';
import { bsHomeClimbState, bsClimbPoint, bsClimbPath, bsClimbArea, bsClimbMilestones, bsClimbGold, BS_CLIMB_W, BS_CLIMB_H } from '../services/homeClimb.mjs';
import { bsHomeCare, bsCareGoalTitle, bsCareTrails, bsCareRoleInk, bsCareFirstName } from '../services/homeCare.mjs';
import { bsCiIso } from './BSCheckinCard.jsx';
import { useBSHomeGoalData, useBSHomeWeek } from './BSHomeSections.jsx';
import { bsHomePlate, bsHomeSlot, bsHomeMono, bsHomeInk, bsHomeA, BSHomePlateLabel, BSHomeCoachesRow, bsHomeCoachName } from './BSHomeCare.jsx';

// ─── THE MEMBER HOME'S TOP: SHAPE RADIO, THIS WEEK, THE GOAL ────────────────────────────────────────
// The Home the owner approved on 2026-11-17 ("ok make new home screens live", "build those. Please make
// it look like the preview", then "just make sure look and design is same as preview"): under Shape
// Radio's box, This week on a plate of its own ("keep the week calendar towards the top"), then the goal
// plate, which keeps every figure the climb showed ("keep this") and says who is on the goal with the
// member: its title by who they have hired, a trail a coach into the start of the climb, and the coaches
// at its foot. It replaced the one deck of 2026-11-03 (the climb over the week in one raised box).
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

// The deck: Home's plates under Shape Radio, 10px apart and 10px in from the page's edges, handing the
// deck's theme (the paper's own, its tones a step stronger) to what it holds. It was one raised box; each
// section is its own plate now (This week, the goal), so the deck draws no box.
// ⚠ SHAPE RADIO STANDS ABOVE THE PLATES, ON ITS OWN LINE (owner, 2026-11-04: "take the shape radio box out
// of the new climb box above it so its on its own line"). It is still handed in as `radio`, so Home keeps
// one place that says what leads the page, but it is drawn first, outside the deck's theme, its edges on
// the plates' (its own 8px margin and 2px more make their 10px).
export function BSHomeDeck({ radio = null, children }) {
  const t = window.useBS();
  const d = bsProDeckTheme(t);
  const Ctx = typeof window !== 'undefined' ? window.BSContext : null;
  const band = (
    <div data-bs-home-deck="" style={{ color: d.INK, margin: radio ? '10px 10px 0' : '6px 10px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {children}
    </div>
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

// ── THE GOAL PLATE ───────────────────────────────────────────────────────────────────────────────

export function BSHomeClimb({ demo = null, ...view }) {
  const data = useBSHomeGoalData(demo);
  return <BSHomeClimbView data={data} {...view} />;
}

// The goal plate off `data` (the goal document, its words and the weigh-ins; null while it reads or after
// a read that failed, which draws the plate's title over an empty chart) and `coaches` (the ones the
// member pays). The tests draw it directly.
//
// ⚠ EVERY FIGURE THE CLIMB SHOWED IS STILL HERE (owner, 2026-11-17: "keep this"), laid out as the approved
// Home lays them: what is left, large; the chart with the start, the weight now and the goal on it; Start,
// Current, Pace and the date the goal falls at that pace, each only when the read has it; and the next
// milestone with the share walked as a ring and the four milestones as dots. Every figure is the goal
// read's own: the share is the route's (st.pct), the milestones are the goal page's (homeClimb.mjs's
// bsClimbMilestones, BSGoals' rule), and what is left runs from the latest weigh-in.
//
// ⚠ WHO IS ON THE GOAL (services/homeCare.mjs). The title is "Your goal" with no coach, "Your goal, with
// {first name}" with one, and "Your team's goal" with a trainer and a nutritionist. On the chart a short
// trail a discipline leads into the start of the climb, rust for training and gold for food, solid with a
// coach on it and dashed where the seat is open; a member with no coach has none. At the plate's foot,
// the coaches (BSHomeCoachesRow).
//
// ⚠ THE BIG FIGURE IS PLAIN INK (owner, 2026-11-17: "remove the rainbow font color on home page, keep it
// neutral"): no gradient text on Home.
export function BSHomeClimbView({ data, docKg, isWeightGoal, goalWords, onOpen, tour, todayIso = bsCiIso(new Date()), coaches = [], onCoach = null, onSeat = null }) {
  const t = window.useBS();
  const tr = useShapeTr();
  // The gradients' ids, one set per climb drawn.
  const gid = `bshc${String(React.useId()).replace(/[^a-zA-Z0-9]/g, '')}`;
  const teal = t.ACCENT || BS_DECK_TEAL;
  const gold = bsClimbGold(t);
  const fg = t.INK;
  const ink = (a) => bsHomeInk(t, a);
  const care = bsHomeCare(coaches);
  const titleKind = bsCareGoalTitle(care);
  const title = titleKind === 'team' ? tr('home:care.goalTeam', { defaultValue: 'Your team’s goal' })
    : titleKind === 'with' ? tr('home:care.goalWith', { defaultValue: 'Your goal, with {name}', name: bsCareFirstName(care.only.name) })
      : titleKind === 'coach' ? tr('home:care.goalWithCoach', { defaultValue: 'Your goal, with your coach' })
        : titleKind === 'coaches' ? tr('home:care.goalWithCoaches', { defaultValue: 'Your goal, with your coaches' })
          : tr('home:goal.title', { defaultValue: 'Your goal' });
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
  const mono = bsHomeMono(t, { color: ink(0.6), whiteSpace: 'nowrap' });
  // The goal in the member's words is the plate's tag, unless they are its big line already (the words
  // state).
  const tag = words && st.kind !== 'words' ? words : '';
  const link = (label) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); if (typeof onOpen === 'function') onOpen(); }}
      style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', ...bsHomeMono(t, { fontWeight: 700, color: teal }) }}>{label}</button>
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
  const live = st.kind !== 'loading';
  const onWay = st.kind === 'progress' && !!read;
  const foot = bsClimbPoint(0);
  const nowP = bsClimbPoint(pct / 100);
  const summit = bsClimbPoint(1);
  // A pace with its sign, unless it shows as zero: a flat trend reads 0.0, never +0.0 (Codex P2 on #2618).
  const signed = (kg) => (Math.round(Math.abs(Number(disp(kg)) || 0) * 10) === 0 ? fmt(0) : `${kg < 0 ? '−' : '+'}${fmt(Math.abs(kg))}`);
  // Capitals in the reader's locale: Turkish "şimdi" is ŞİMDİ, not ŞIMDI (Codex P2 on #2618).
  const upper = (str) => { try { return String(str).toLocaleUpperCase(bsHdLocale()); } catch (e) { return String(str).toUpperCase(); } };
  const nowWord = tr('home:climb.nowWord', { defaultValue: 'now' });
  // The four figures under the chart, each a chip with its top edge in its colour: what is behind the
  // member in the teal of progress, what is ahead in the goal's gold.
  const band = onWay ? [
    read.startKg != null ? { k: 'start', label: tr('goal:terms.whenStart', { defaultValue: 'Start' }), value: fmt(read.startKg), c: teal } : null,
    read.nowKg != null ? { k: 'current', label: tr('goal:cover.statCurrent', { defaultValue: 'Current' }), value: fmt(read.nowKg), c: teal } : null,
    read.paceKgWk != null ? { k: 'pace', label: tr('goal:cover.statPace', { defaultValue: 'Pace' }), value: tr('home:climb.paceWeek', { defaultValue: '{pace} {unit}/wk', pace: signed(read.paceKgWk), unit }), c: gold } : null,
    read.etaIso ? { k: 'eta', label: tr('goal:terms.whenGoal', { defaultValue: 'Goal' }), value: `≈ ${bsHdDate(read.etaIso, { month: 'short', day: 'numeric' })}`, c: gold } : null,
  ].filter(Boolean) : [];
  // The weight now beside its dot: over it, or to its upper left once the dot is near the flag, so it
  // never runs into the flag or off the box.
  const nowLabel = onWay && walked && pct < 100 && read.nowKg != null ? (() => {
    const text = upper(`${fmt(read.nowKg)} ${nowWord}`);
    return nowP.x > 262
      ? { text, where: 'left', anchor: 'end', x: nowP.x - 10, y: Math.max(12, nowP.y - 9) }
      : { text, where: 'above', anchor: 'middle', x: Math.max(foot.x + 26, nowP.x - 4), y: nowP.y - 12 };
  })() : null;
  const sv = { fontFamily: t.MONO, fontWeight: 700, fontSize: 9, letterSpacing: '1.2px' };
  // The door's name carries the strip and the band too, so a screen reader hears them as well.
  const doorName = [aria, ...(next ? [nextHead, next.weight, next.left] : []), ...band.map((b) => `${b.label} ${b.value}`)].join(' · ');
  const R = 18, RING = 2 * Math.PI * R;
  const trails = live ? bsCareTrails(care) : [];
  const slot = bsHomeSlot(t);

  return (
    <section data-bs-home-goal={care.kind} aria-label={title} style={{ ...bsHomePlate(t), padding: 16, display: 'flex', flexDirection: 'column', gap: 12, color: fg }}>
      {/* ⚠ THE CLIMB IS A DOOR FOR EVERY HAND (Codex P2 on #2583): a state with its own link (reached, start
          only, words, none) keeps that link as the keyboard's way in; a climb with none (progress) is itself
          a button, focusable and opened with Enter or Space, named by what it shows. A climb still reading
          (or whose read failed) shows nothing yet and is no door at all: an unnamed button in the tab order
          otherwise (Codex P2 on #2583). The coaches at the plate's foot are doors of their own, so they sit
          under this one, never inside it. */}
      <div data-bs-home-climb={st.kind} data-tour={tour || undefined} onClick={typeof onOpen === 'function' && st.kind !== 'loading' ? onOpen : undefined}
        {...(typeof onOpen === 'function' && !action && st.kind === 'progress' && aria ? {
          role: 'button', tabIndex: 0, 'aria-label': doorName || undefined,
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
        } : null)}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, cursor: typeof onOpen === 'function' && st.kind !== 'loading' ? 'pointer' : 'default' }}>
        <BSHomePlateLabel t={t} dot={gold} note={tag || null}>{title}</BSHomePlateLabel>
        {big != null ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <span data-climb-figure="" style={{ fontFamily: BS_GAUGE_FACE, fontWeight: textBig ? 700 : 800, fontSize: textBig ? 26 : 60, lineHeight: textBig ? 1.15 : 0.95, color: fg, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{big}</span>
              {unitWord ? <span style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 16, color: ink(0.7) }}>{unitWord}</span> : null}
            </div>
            {line ? <div data-climb-pace="" style={{ ...mono, marginTop: 6, whiteSpace: 'normal' }}>{line}</div> : null}
            {action ? <div>{action}</div> : null}
          </div>
        ) : null}
        {/* Named by what it shows; still reading, it shows nothing yet and is hidden from a screen reader,
            never an unnamed graphic in browse mode (Codex P2 on #2583). */}
        <svg {...(aria ? { role: 'img', 'aria-label': aria } : { 'aria-hidden': true, focusable: 'false' })} viewBox={`0 0 ${BS_CLIMB_W} ${BS_CLIMB_H}`} width="100%" style={{ display: 'block', height: 'auto' }}>
          <defs>
            {/* What is walked runs from the goal's gold at the start to the teal of where the member is. */}
            <linearGradient id={`${gid}p`} gradientUnits="userSpaceOnUse" x1={foot.x} y1="0" x2={Math.max(foot.x + 1, nowP.x)} y2="0">
              <stop offset="0" stopColor={gold} />
              <stop offset="1" stopColor={teal} />
            </linearGradient>
            {/* The ground under the route, the goal's gold fading down. */}
            <linearGradient id={`${gid}f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={gold} stopOpacity={live ? (t.isLight ? 0.22 : 0.28) : 0.1} />
              <stop offset="1" stopColor={gold} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon data-climb-area="" points={bsClimbArea()} fill={`url(#${gid}f)`} />
          {trails.map((tl) => (
            <path key={tl.role} data-climb-trail={tl.role} data-climb-trail-open={tl.open ? '' : undefined} d={tl.d} fill="none"
              stroke={bsCareRoleInk(t.isLight, tl.role).line} strokeWidth={tl.open ? 2 : 3} strokeLinecap="round" strokeDasharray={tl.open ? '3 5' : undefined} />
          ))}
          {live ? <polyline data-climb-ahead="" points={bsClimbPath(walked ? pct / 100 : 0, 1)} fill="none" stroke={gold} strokeWidth="1.5" strokeDasharray="4 5" /> : null}
          {walked && pct > 0 ? <polyline data-climb-walked={pct} points={bsClimbPath(0, pct / 100)} fill="none" stroke={pct >= 100 ? teal : `url(#${gid}p)`} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {onWay ? <circle data-climb-start-dot="" cx={foot.x} cy={foot.y} r="5" fill={t.PAPER} stroke={teal} strokeWidth="2.5" /> : null}
          {walked && pct < 100 ? <circle data-climb-now="" cx={nowP.x} cy={nowP.y} r="6" fill={t.PAPER} stroke={teal} strokeWidth="3" /> : null}
          {live ? (() => {
            const planted = st.kind === 'reached';
            const c = planted ? teal : gold;
            return (
              <g data-climb-flag={planted ? 'planted' : 'open'}>
                <line x1={summit.x} y1={summit.y} x2={summit.x} y2={summit.y - 18} stroke={c} strokeWidth="1.5" />
                <polygon points={`${summit.x},${summit.y - 18} ${summit.x + 16},${summit.y - 13} ${summit.x},${summit.y - 8}`} fill={c} fillOpacity={st.kind === 'none' || st.kind === 'words' ? 0 : 1} stroke={c} strokeWidth="1" />
              </g>
            );
          })() : null}
          {nowLabel ? <text data-climb-now-chip={nowLabel.where} x={nowLabel.x} y={nowLabel.y} textAnchor={nowLabel.anchor} style={sv} fill={teal}>{nowLabel.text}</text> : null}
          {onWay && read.startKg != null ? (
            <text data-climb-start="" x={foot.x} y={foot.y + 22} style={sv} fill={ink(0.7)}>{upper(`${tr('goal:terms.whenStart', { defaultValue: 'Start' })} ${fmt(read.startKg)}`)}</text>
          ) : null}
          {st.kind === 'progress' && read.targetKg != null ? (
            <text data-climb-goal="" x={summit.x - 8} y={summit.y + 28} textAnchor="end" style={sv} fill={gold}>{upper(`${tr('home:goal.target', { defaultValue: 'Goal' })} ${fmt(read.targetKg)}`)}</text>
          ) : null}
        </svg>
        {band.length ? (
          <div data-climb-band={band.map((b) => b.k).join(' ')} style={{ display: 'grid', gridTemplateColumns: `repeat(${band.length}, minmax(0, 1fr))`, gap: 6 }}>
            {band.map((b) => (
              <div key={b.k} data-climb-band-cell={b.k} style={{ minWidth: 0, boxSizing: 'border-box', ...slot, borderTop: `2px solid ${b.c}`, borderRadius: 12, padding: '7px 7px 7px 8px' }}>
                <div style={{ ...bsHomeMono(t, { fontSize: 9, letterSpacing: '0.14em', color: ink(0.6) }), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</div>
                {/* A value wraps at its spaces rather than losing its unit where a slot is narrow, as on a 320px
                    phone (Codex P2 on #2618); the slots of a row grow together. */}
                <div data-climb-band-value="" style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: b.value.length > 8 ? 12 : b.value.length > 6 ? 14.5 : 16, lineHeight: b.value.length > 8 ? '19px' : 1.2, color: fg, whiteSpace: 'normal', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{b.value}</div>
              </div>
            ))}
          </div>
        ) : null}
        {/* The next milestone: the share walked as a ring, the milestone with its weight and what is left to
            it, and the four milestones as dots (met ones filled, the next one ringed, the goal a square in
            its gold). */}
        {ms ? (
          <div data-climb-strip="" style={{ display: 'flex', alignItems: 'center', gap: 12, ...slot, borderRadius: 14, padding: '10px 12px' }}>
            <span aria-hidden="true" style={{ position: 'relative', width: 44, height: 44, flex: 'none' }}>
              <svg width="44" height="44" viewBox="0 0 44 44" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
                <circle cx="22" cy="22" r={R} fill="none" stroke={ink(0.14)} strokeWidth="4" />
                <circle data-climb-ring={pct} cx="22" cy="22" r={R} fill="none" stroke={teal} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(RING * pct) / 100} ${RING}`} />
              </svg>
              <span data-climb-strip-pct="" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: t.DISPLAY, fontSize: 11, fontWeight: 700, color: fg, fontVariantNumeric: 'tabular-nums' }}>{pctOf(pct)}</span>
            </span>
            <span style={{ flex: '1 1 0', minWidth: 0 }}>
              <span data-climb-next={next ? next.m : undefined} style={{ display: 'block', ...mono, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {next ? nextHead : tr('home:goal.pctThere', { defaultValue: '{pct}% there', pct })}
              </span>
              {next ? (
                <span style={{ display: 'block', fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 16, lineHeight: 1.3, color: fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span data-climb-next-weight="">{next.weight}</span><span data-climb-next-left="" style={{ color: ink(0.6) }}> · {next.left}</span>
                </span>
              ) : null}
            </span>
            <span aria-hidden="true" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
              {ms.stops.map((s) => {
                const isNext = !!next && s.m === next.m;
                const goal = s.m === 100;
                const c = goal ? gold : (s.done || isNext ? teal : ink(0.4));
                const sz = goal ? 9 : 8;
                return <span key={s.m} data-climb-pip={s.m} data-climb-pip-state={s.done ? 'done' : isNext ? 'next' : 'ahead'} data-climb-pip-color={c} style={{ width: sz, height: sz, borderRadius: goal ? 0 : 99, boxSizing: 'border-box', background: s.done ? c : 'transparent', border: `1.5px solid ${c}` }} />;
              })}
            </span>
          </div>
        ) : null}
      </div>
      <BSHomeCoachesRow care={care} onCoach={onCoach} onSeat={onSeat} onData={typeof onOpen === 'function' && live ? onOpen : null} />
    </section>
  );
}

// ── THIS WEEK, FIVE BARS A DAY ─────────────────────────────────────────────────────────────────

// Each day's bars are Week so far's rows (owner, 2026-11-03: "ok looks good" of the key Train · Food ·
// Protein · Steps · Check-in): tall where the day hit it, a stub where it missed, an outline for a day
// still to come, a dash for a rest day, and a dot where nothing could read. In the approved Home's cell
// (2026-11-17) the bars stand 20px in a 22px row, training's in the trainer's rust and food's in the
// nutritionist's gold (`tone`); the other three keep the cell's ink.
function BSHdBar({ state, on, tone = null }) {
  const t = window.useBS();
  const ink = tone || (on ? t.PAPER : t.INK);
  const rule = tone ? bsHomeA(tone, 0.6) : (on ? `${t.PAPER}55` : t.RULE);
  const base = { width: 4.5, borderRadius: 2, boxSizing: 'border-box' };
  if (state === 'hit') return <span data-bar="hit" style={{ ...base, height: 20, background: ink }} />;
  if (state === 'miss') return <span data-bar="miss" style={{ ...base, height: 4, background: ink, opacity: 0.55 }} />;
  if (state === 'ahead') return <span data-bar="ahead" style={{ ...base, height: 20, border: `1px solid ${rule}` }} />;
  if (state === 'rest') return <span data-bar="rest" style={{ ...base, height: 2, background: rule }} />;
  return <span data-bar="unknown" style={{ ...base, height: 2, width: 2, background: rule }} />;
}

// Steps under the strip is the door to the Shape Steps page (owner, 2026-11-04: "where did shape steps
// go?", then "yes put it back on this week steps"): Week so far's Steps tile was its only door, and it
// went with that block (#2583). The word keeps its place in the line, in the accent as the date's → is.
// Its 44px box reaches `up` px into the gap over the line and 26px down, over the line that says whose
// bars are whose and into the plate's foot, as the date's does; the line's own box is as tall, so its
// clip never cuts the target.
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

export function BSHomeWeekBars({ checkinsOn = true, onDay, onMonth, onSteps, picked, onPick, coaches, ...reads }) {
  const w = useBSHomeWeek(reads);
  return <BSHomeWeekBarsView w={w} checkinsOn={checkinsOn} onDay={onDay} onMonth={onMonth} onSteps={onSteps} picked={picked} onPick={onPick} coaches={coaches} />;
}

// `picked` / `onPick`: the day picked, when Home holds it (so Today's plan below follows it); with no
// onPick the strip keeps its own. `onSteps` opens the Shape Steps page from the line's Steps. `coaches`
// are the ones the member pays: the line under the strip says whose the two coloured bars are.
//
// ⚠ THE STRIP KEEPS WHAT IT SAID AND DID (owner, 2026-11-17: "keep the week calendar towards the top"): all
// five bars a day, the picked day's line and a day picked in place. Only its place (its own plate, first
// under Shape Radio) and its cell changed: the day in mono, the date, today's cell filled.
export function BSHomeWeekBarsView({ w, checkinsOn = true, onDay, onMonth, onSteps = null, picked: pickedProp = null, onPick = null, coaches = [] }) {
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
  // The two disciplines' bars take their role's colour; the rest keep the cell's ink.
  const tones = { sessions: bsCareRoleInk(t.isLight, 'trainer').bar, food: bsCareRoleInk(t.isLight, 'nutritionist').bar };
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
  const mono = { fontFamily: t.MONO, fontWeight: 700, textTransform: 'uppercase' };
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
  // Whose the two coloured bars are: training's and food's, each with its coach's first name; with exactly
  // one coach the other reads as the open seat, dashed; with no coach, the two names alone.
  const care = bsHomeCare(coaches);
  const whose = [
    { role: 'trainer', coach: care.trainers[0] || null, bar: names.sessions, coached: names.sessions },
    { role: 'nutritionist', coach: care.nutris[0] || null, bar: names.food, coached: tr('home:care.fuel', { defaultValue: 'Fuel' }) },
  ].map((x) => {
    const open = !x.coach && care.seat && care.openRole === x.role;
    return { ...x, open, text: x.coach ? `${x.coached} · ${bsHomeCoachName(tr, x.coach)}` : open ? `${x.bar} · ${tr('home:care.openSeat', { defaultValue: 'Open seat' })}` : x.bar };
  });
  return (
    // ⚠ NO TAP BOX OVERLAPS ANOTHER (Codex P2 on #2593): Month reaches 12px up into the head's padding and
    // 6px down into the 6px gap over the days, never onto a day; the picked day's → reaches 6px up into the
    // gap over its line and 26px down, over the line that says whose bars are whose (no door) and into the
    // plate's 14px foot, never past the plate.
    <section data-bs-home-week-bars="" aria-label={tr('home:section.thisWeek', { defaultValue: 'This week' })} style={{ ...bsHomePlate(t), padding: '10px 10px 14px', color: t.INK }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 6px' }}>
        <h2 style={{ margin: 0, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, lineHeight: 1.35, color: t.INK, whiteSpace: 'nowrap' }}>
          {tr('home:section.thisWeek', { defaultValue: 'This week' })}<span aria-hidden="true" style={{ color: bsCareRoleInk(t.isLight, 'trainer').line }}>.</span>
        </h2>
        {isoWeek ? <span style={{ ...mono, fontWeight: 500, fontSize: 10, letterSpacing: '0.16em', color: bsHomeInk(t, 0.6), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('home:dateline.wkAbbr', { defaultValue: 'Wk' })} {isoWeek} · {span}</span> : null}
        {onMonth ? <button type="button" onClick={onMonth} style={{ minHeight: 44, margin: '-12px 0 -6px auto', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', ...mono, fontSize: 10, letterSpacing: '0.16em', color: t.ACCENT, whiteSpace: 'nowrap' }}>{tr('home:week.month', { defaultValue: 'Month →' })}</button> : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginTop: 6 }}>
        {(week.length ? week : Array.from({ length: 7 }, () => null)).map((iso, i) => {
          const today = g && i === g.today;
          const isPicked = g && i === pickIdx;
          const states = rows.map((k) => (g && g[k] ? g[k][i] : null));
          const label = iso ? `${fmtDay(iso, { weekday: 'long', month: 'long', day: 'numeric' })}: ${rows.map((k, j) => (states[j] ? `${names[k]} ${word[states[j]]}` : null)).filter(Boolean).join(', ')}` : '';
          return (
            <button key={iso || i} type="button" data-bs-home-day={iso || ''} aria-label={label} aria-current={today ? 'date' : undefined} aria-pressed={iso ? !!isPicked : undefined}
              onClick={() => { if (!iso) return; if (isPicked) openDay(iso); else setPicked(i); }}
              style={{ minWidth: 0, minHeight: 74, padding: '8px 0', border: 0, borderRadius: 12, background: today ? t.INK : 'transparent', color: today ? t.PAPER : t.INK,
                // The picked day, when it is not today, is ringed (today keeps its ink).
                boxShadow: isPicked && !today ? `inset 0 0 0 1.5px ${t.INK70}` : 'none', cursor: iso ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ ...mono, fontWeight: 500, fontSize: 9, letterSpacing: '0.12em', opacity: 0.75 }}>{iso ? fmtDay(iso, { weekday: 'short' }) : ''}</span>
              <span style={{ fontFamily: BS_GAUGE_FACE, fontWeight: 600, fontSize: 19, lineHeight: 1.35, fontVariantNumeric: 'tabular-nums' }}>{iso ? dayOf(iso).getDate() : ''}</span>
              <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2.5, height: 22 }}>
                {states.map((s, j) => <BSHdBar key={j} state={s} on={today} tone={tones[rows[j]] || null} />)}
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
      {/* Whose bars are whose. It carries no door: the date's → and Steps reach down over it. */}
      <div data-bs-home-week-whose={care.kind} style={{ position: 'relative', pointerEvents: 'none', marginTop: 10, padding: '0 6px', display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 2, ...mono, fontWeight: 500, fontSize: 10, lineHeight: '14px', letterSpacing: '0.14em' }}>
        {whose.map((x) => (
          <span key={x.role} data-week-whose={x.role} data-week-whose-open={x.open ? '' : undefined} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: bsCareRoleInk(t.isLight, x.role).text }}>
            <span aria-hidden="true">{x.open ? '┆ ' : '▌'}</span>{x.text}
          </span>
        ))}
      </div>
    </section>
  );
}
