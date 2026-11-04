import React from 'react';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType, useBSClean } from './bsCleanType.jsx';
import { bsRaised, BSGlassEdge, BS_GAUGE_FACE, BS_DECK_MONO } from './BSProInstrument.jsx';
import { bsMpGlass, bsMpTile } from './BSMemberBento.jsx';
// ─── EAT · THE DAY VIEW (the orbit) ──────────────────────────────────────────────────────────────
// The top of Eat's Day view, from the head down to the day's meals, as glass instruments (owner, 2026-11-04,
// of three designs drawn for it, "C for eat but these 2 boxes with a faint border similar to option A";
// before them, "be as creative", "include glows maybe some effects", "unique", "different"):
//   · the head as a readout, the Eat tabs under it;
//   · the week as seven small tiles on a raised box, each holding its day's fuel as liquid (owner, of the
//     tiles drawn for option B: "use this weekly calendar in C option for eat");
//   · the day as a 24-hour ORBIT on a raised box over a dot grid: the meals its stations at their times,
//     the day so far lit to a NOW needle, the macros as three rings of lamps round what is left;
//   · the next meal locked on by a reticle, with its arrival and Log it / Swap;
//   · the meals as telemetry: each a ring of its share of the day with its hour inside, and a lamp.
// The two raised boxes (the week and the orbit) take the Home deck's edge (bsRaised, BSGlassEdge), as the
// owner asked; the next meal and the menu keep their glass panes.
//
// ⚠ EAT HANDS IN WHAT IT READS AND THE DOORS IT HAS. The week's figures, Fuel left's (coach-set targets
// already applied, `unread` while the meals read has not answered), the next meal and its arrival, the
// menu's rows with their stamps and shop lists, the notices and the morning swap are Eat's; so are a day,
// Month, a macro's page, Log it, Swap, Swap meal and a meal. Nothing here reads or writes data, and every
// word is a catalog key Eat already had.
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP, and this module never imports the client
// module (the BSLeaderboard / BSGoals pattern).

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

// ── Shared pieces ────────────────────────────────────────────────────────────────────────────────

// A colour at an alpha. Every palette colour is a hex; anything else is mixed by the browser.
const hexA = (c, a) => {
  const s = String(c || '');
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return `color-mix(in srgb, ${s || 'currentColor'} ${Math.round(a * 100)}%, transparent)`;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const inkA = (t, a) => `rgba(${t.inkRGB || (t.isLight ? '15,14,12' : '245,240,230')},${a})`;
const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));

// A glow in a colour: light given off on a dark paper; on a light one a soft tinted shadow, never a halo
// (a halo on cream reads as dirt).
const glowShadow = (t, c, r = 14, a = 0.55) => (t.isLight ? `0 8px ${r + 4}px -8px ${hexA(c, a * 0.75)}` : `0 0 ${r}px ${hexA(c, a)}`);
const glowFilter = (t, c, r = 6, a = 0.6) => (t.isLight ? `drop-shadow(0 2px ${Math.max(2, Math.round(r / 2))}px ${hexA(c, a * 0.45)})` : `drop-shadow(0 0 ${r}px ${hexA(c, a)})`);

function bsEdLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}
const fmtN = (n) => { try { return Number(n || 0).toLocaleString(bsEdLocale()); } catch (e) { return String(n || 0); } };
// This week, Monday first, as Eat counts its days (0 = Monday).
export function bsEatWeekDates(now = new Date()) {
  const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}
const dayFmt = (d, opts) => { try { return d.toLocaleDateString(bsEdLocale(), opts); } catch (e) { return ''; } };

// A day of the week as its ring reads it: what was eaten of its target, and protein hit or not. A day still
// to come is ahead (a dashed ring); a week the plan could not read reads nothing.
export function bsEatDayGauge(w, i, todayIdx, unread) {
  if (i > todayIdx) return { pct: 0, ahead: true, proteinHit: false };
  if (unread || !w) return { pct: 0, ahead: false, proteinHit: false };
  return { pct: w.kcalGoal > 0 ? clamp01(w.kcal / w.kcalGoal) : 0, ahead: false, proteinHit: w.pGoal > 0 && w.p >= w.pGoal };
}

// Angles in degrees from twelve o'clock, clockwise.
const pt = (cx, cy, r, deg) => { const a = (deg * Math.PI) / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
const f2 = (n) => Math.round(n * 100) / 100;
function bsEdArc(cx, cy, r, a0, a1) {
  const span = Math.max(0.01, Math.min(359.99, a1 - a0));
  const [x0, y0] = pt(cx, cy, r, a0); const [x1, y1] = pt(cx, cy, r, a0 + span);
  return `M${f2(x0)} ${f2(y0)}A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${f2(x1)} ${f2(y1)}`;
}
const useSvgId = (prefix) => `${prefix}${String(React.useId ? React.useId() : 'x').replace(/[^a-zA-Z0-9_-]/g, '')}`;

// The motion, in one sheet: draws and lamps on arrival (≤ 900 ms), the week's liquid rising into its tiles,
// the next meal's slow pulse, the head's breathing dot, the picked tile lifting. A reader who asked for less motion gets none, and every
// element's resting style is its finished state, so the page reads the same with its motion off.
// A meal's shop list keeps its own look; here its controls are 44px tall like every other.
const BS_ED_CSS = `
@keyframes bsed-draw { from { stroke-dasharray: 0 100; } }
@keyframes bsed-grow-x { from { transform: scaleX(0); } }
@keyframes bsed-in { from { opacity: 0; transform: translateY(8px); } }
@keyframes bsed-pulse { 0% { transform: scale(0.7); opacity: 0.85; } 70%, 100% { transform: scale(2.3); opacity: 0; } }
@keyframes bsed-breathe { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
@keyframes bsed-led { from { opacity: 0.12; } }
@keyframes bsed-rise { from { transform: translateY(100%); } }
[data-eat-day] button { -webkit-tap-highlight-color: transparent; }
[data-eat-day] button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
[data-eat-day-shop] button { min-height: 44px !important; }
@media (prefers-reduced-motion: reduce) {
  [data-eat-day] *, [data-eat-day] *::before, [data-eat-day] *::after { animation: none !important; transition: none !important; }
}
`;

// The masthead row, as every page's: the logo, the volume and the header's tools.
function BSEdMast({ tools }) {
  const { BSMastRow } = window;
  const t = window.useBS();
  if (!BSMastRow) return null;
  return <div style={{ padding: `${window.BS_MAST_TOP_CSS || '14px'} ${t.padX}px 0` }}><BSMastRow trailing={tools} /></div>;
}

// The day's title as words (a plan's title is a string, the preview's a fragment), without its own full stop:
// the head draws one. The chrome's bsTitleText, kept here so the module reads no global for it.
function bsEdText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(bsEdText).join('');
  if (node.type === 'br') return ' ';
  return node.props ? bsEdText(node.props.children) : '';
}
const bsEdTitle = (title) => bsEdText(title).replace(/\s+/g, ' ').trim().replace(/\.\s*$/, '');

// What the page says about the next meal: its time, the status, how long until it, the meal, and the arrival
// from the stop before (Eat's own figures). null on a picked day that is not today.
function bsEdNext(p, tr) {
  const m = p.next;
  if (!m) return null;
  const hm = (min) => p.fmt12(`${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`);
  const time = p.timeOf(m) || '';
  const slot = p.slotOf(m);
  const late = p.nextAt != null && !p.ahead;
  const until = p.until ? (p.until.h > 0
    ? tr('home:focus.inHourMin', { defaultValue: 'In {h} h {m} min', h: p.until.h, m: p.until.m })
    : tr('home:focus.inMin', { defaultValue: 'In {m} min', m: p.until.m })) : '';
  const arrival = p.prev && typeof p.arrivalPct === 'number' && Number.isFinite(p.arrivalPct) ? {
    pct: Math.max(0, Math.min(100, p.arrivalPct)),
    from: `${hm(p.prev.min)} · ${p.prev.label}${p.prev.done ? ' ✓' : ''}`,
    to: `${time} · ${slot}`,
    aria: tr('home:focus.arrivalAria', { defaultValue: 'Now {now}, between {from} and {to}', now: p.nowText, from: hm(p.prev.min), to: time }),
  } : null;
  return {
    meal: m, time, slot, until, arrival,
    status: late ? tr('home:focus.notLogged', { defaultValue: 'Not logged yet' }) : tr('home:focus.nextStop', { defaultValue: 'Next stop' }),
    sub: `${m.title} · ${p.macroRow(m)}`,
    log: tr('nutrition:eat.logIt', { defaultValue: 'Log it →' }),
    swap: `${tr('nutrition:eat.swapTitle', { defaultValue: 'Swap' })} →`,
  };
}

// The words round the fuel figures. ⚠ `unread`: what was eaten comes from the meal plan, so while its read
// has not answered (or failed) what is left reads "—", never 0, and a target reads only when Eat has one from
// elsewhere (a coach's Adjust: `calTargetKnown`, a macro's `gKnown`, which keep a coach's 0 g).
export function bsEatFuelWords(p, tr) {
  const f = p.fuel;
  const dash = '—';
  const pick = bsEatWeekDates()[p.day] || bsEatWeekDates()[0];
  return {
    // Another day picked: its own head, named as the strip shows it (this week's date, the weekday in the
    // reader's language), never "Fuel left today" over that day's figures.
    head: p.day === p.todayIdx ? tr('nutrition:eat.fuelLeft', { defaultValue: 'Fuel left today' })
      : tr('nutrition:eat.fuelOn', { defaultValue: 'Fuel · {day}', day: `${dayFmt(pick, { weekday: 'short' })} ${pick.getDate()}` }),
    plan: f.unread && !f.calTargetKnown ? dash : tr('nutrition:eat.kcalPlan', { defaultValue: '{kcal} kcal plan', kcal: fmtN(f.calTarget) }),
    left: f.unread ? dash : fmtN(f.calLeft),
    leftWord: tr('nutrition:eat.kcalLeftWord', { defaultValue: 'kcal left' }),
    eaten: f.unread ? '' : tr('nutrition:eat.eatenPct', { defaultValue: '{eaten} eaten · {pct}%', eaten: fmtN(f.calNow), pct: f.calPct }),
    macro: (m) => ({
      // Over the target reads 0 left, never negative.
      left: f.unread ? dash : tr('nutrition:eat.gramsLeft', { defaultValue: '{g}g left', g: Math.max(0, m.g - m.v) }),
      of: f.unread ? `${dash} / ${m.gKnown ? m.g : dash}` : `${m.v} / ${m.g}`,
      pct: !f.unread && m.g > 0 ? clamp01(m.v / m.g) : 0,
    }),
  };
}

// A small ring gauge: `pct` of a circle in a colour, its middle given.
function BSEdRing({ t, pct, color, size = 32, stroke = 3, dashed = false, glow = false, delay = 0, children }) {
  const r = (size - stroke) / 2;
  return (
    <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: size, height: size, flex: 'none' }}>
      <svg aria-hidden="true" width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', overflow: 'visible' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={inkA(t, dashed ? 0.28 : 0.12)} strokeWidth={dashed ? 1 : stroke} strokeDasharray={dashed ? '2 3' : undefined} />
        {pct > 0 ? <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" pathLength="100"
          style={{ strokeDasharray: `${Math.max(0.5, Math.round(pct * 1000) / 10)} 100`, filter: glow ? glowFilter(t, color, 5, 0.9) : 'none', transition: 'filter 260ms ease', animation: `bsed-draw 700ms cubic-bezier(.3,0,.2,1) ${delay}ms both` }} /> : null}
      </svg>
      <span style={{ position: 'relative' }}>{children}</span>
    </span>
  );
}

// The day as a 24-hour orbit: midnight at the top, the day so far lit along it up to NOW, each meal a
// station at its time (lit once eaten, the next one pulsing), and inside it the macros as three rings of
// lamps round what is left of the day's energy.
function BSEdOrbit({ t, p, fw, size }) {
  const id = useSvgId('bsed-orbit');
  const S = 280, C = 140, R = 124;
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const isToday = p.day === p.todayIdx;
  const nowDeg = (p.nowMin / 1440) * 360;
  const stations = p.rows.map((r) => {
    const m = p.meals.find((x) => x.id === r.key) || {};
    const min = p.minOf(m);
    return min == null ? null : { key: r.key, deg: (min / 1440) * 360, state: r.state };
  }).filter(Boolean);
  const radii = [92, 80, 68];
  const SEG = 40;
  const left = fw.left;
  const big = String(left).length <= 3 ? 44 : String(left).length <= 4 ? 34 : 28;
  return (
    <div data-eat-orbit-dial="" style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg aria-hidden="true" viewBox={`0 0 ${S} ${S}`} width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${id}-day`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={hexA(teal, 0.35)} />
            <stop offset="1" stopColor={t.ACCENT} />
          </linearGradient>
          <radialGradient id={`${id}-core`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={hexA(t.ACCENT, t.isLight ? 0.1 : 0.16)} />
            <stop offset="1" stopColor={hexA(t.ACCENT, 0)} />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={62} fill={`url(#${id}-core)`} />
        {/* The hours: a tick each, longer every six, numbered at 0, 6, 12 and 18. */}
        {Array.from({ length: 24 }, (_, h) => {
          const [x0, y0] = pt(C, C, R - (h % 6 ? 4 : 9), h * 15);
          const [x1, y1] = pt(C, C, R + (h % 6 ? 0 : 2), h * 15);
          return <line key={h} x1={f2(x0)} y1={f2(y0)} x2={f2(x1)} y2={f2(y1)} stroke={inkA(t, h % 6 ? 0.22 : 0.45)} strokeWidth={h % 6 ? 1 : 1.4} />;
        })}
        {[0, 6, 12, 18].map((h) => { const [x, y] = pt(C, C, R - 18, h * 15); return <text key={h} x={f2(x)} y={f2(y)} textAnchor="middle" dominantBaseline="central" style={{ fontFamily: BS_DECK_MONO, fontSize: 8.5, fontWeight: 700, fill: inkA(t, 0.5) }}>{String(h).padStart(2, '0')}</text>; })}
        <circle cx={C} cy={C} r={R} fill="none" stroke={inkA(t, 0.16)} strokeWidth="1.2" />
        {/* The day so far, lit to NOW. */}
        {isToday && nowDeg > 1 ? (
          <path d={bsEdArc(C, C, R, 0, nowDeg)} fill="none" stroke={`url(#${id}-day)`} strokeWidth="3.4" strokeLinecap="round" pathLength="100"
            style={{ strokeDasharray: '100 100', filter: glowFilter(t, t.ACCENT, 6, 0.8), animation: 'bsed-draw 900ms cubic-bezier(.4,0,.2,1) 100ms both' }} />
        ) : null}
        {/* The macros: three rings of forty lamps each, lit clockwise to what has been eaten of each, the lamps
            lighting one after another on arrival. */}
        {p.fuel.macros.map((m, i) => {
          const w = fw.macro(m);
          const r = radii[i] || 68;
          const lit = Math.round(w.pct * SEG);
          const seg = (k) => bsEdArc(C, C, r, k * (360 / SEG) + 1.5, (k + 1) * (360 / SEG) - 1.5);
          return (
            <g key={m.k} data-eat-arc={m.k} data-lit={lit}>
              <g stroke={hexA(m.c, t.isLight ? 0.16 : 0.2)} strokeWidth="5" fill="none">
                {Array.from({ length: SEG - lit }, (_, j) => <path key={j} d={seg(lit + j)} />)}
              </g>
              <g stroke={m.c} strokeWidth="5" fill="none" style={{ filter: glowFilter(t, m.c, 4, 0.75) }}>
                {Array.from({ length: lit }, (_, k) => <path key={k} d={seg(k)} style={{ animation: `bsed-led 260ms ease-out ${180 + i * 90 + k * 11}ms both` }} />)}
              </g>
            </g>
          );
        })}
        {/* The stations. */}
        {stations.map((s) => {
          const [x, y] = pt(C, C, R, s.deg);
          const done = s.state === 'done', next = s.state === 'next';
          return (
            <g key={s.key} data-eat-station={s.state || 'ahead'}>
              {next ? <circle cx={f2(x)} cy={f2(y)} r="7" fill="none" stroke={t.ACCENT} strokeWidth="1.5" style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'bsed-pulse 2.4s ease-out infinite' }} /> : null}
              <circle cx={f2(x)} cy={f2(y)} r={next ? 7 : 5.5} fill={done ? t.ACCENT : t.PAPER} stroke={done || next ? t.ACCENT : inkA(t, 0.55)} strokeWidth={next ? 2.4 : 1.6}
                style={{ filter: done || next ? glowFilter(t, t.ACCENT, 6, 0.85) : 'none' }} />
            </g>
          );
        })}
        {/* NOW: a needle out to the orbit with a lit tip. */}
        {isToday ? (() => {
          const [x0, y0] = pt(C, C, 106, nowDeg); const [x1, y1] = pt(C, C, R + 8, nowDeg);
          return (
            <g data-eat-now="">
              <line x1={f2(x0)} y1={f2(y0)} x2={f2(x1)} y2={f2(y1)} stroke={t.INK} strokeWidth="1.4" strokeLinecap="round" />
              <circle cx={f2(x1)} cy={f2(y1)} r="3" fill={t.INK} style={{ filter: glowFilter(t, t.INK, 4, 0.6) }} />
            </g>
          );
        })() : null}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <div data-eat-left="" style={{ textAlign: 'center', lineHeight: 1 }}>
          <div style={{ fontFamily: BS_GAUGE_FACE, fontWeight: 300, fontSize: big, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', color: t.INK, textShadow: t.isLight ? 'none' : `0 0 22px ${hexA(t.ACCENT, 0.45)}` }}>{left}</div>
          <div style={{ marginTop: 4, fontFamily: BS_DECK_MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{fw.leftWord}</div>
        </div>
      </div>
    </div>
  );
}

// A raised box with the Home deck's edge (owner, 2026-11-04: "these 2 boxes with a faint border similar to
// option A"): the paper's own colour, lit from the top, a faint hairline, its teal edge along the top. `grid`
// lays the instrument's dot grid inside it and `light` the accent's glow behind what it holds; what it holds
// sits over both.
function BSEdRaised({ t, grid = false, light = false, style = null, children, ...rest }) {
  return (
    <section {...rest} style={{ ...bsRaised(t), ...(style || {}) }}>
      <BSGlassEdge t={t} />
      {grid ? <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: `radial-gradient(${inkA(t, t.isLight ? 0.09 : 0.075)} 1px, transparent 1.4px)`, backgroundSize: '14px 14px' }} /> : null}
      {light ? <span aria-hidden="true" style={{ position: 'absolute', left: '8%', right: '8%', top: 34, height: 260, borderRadius: '50%', pointerEvents: 'none', background: `radial-gradient(closest-side, ${hexA(t.ACCENT, t.isLight ? 0.12 : 0.22)}, transparent)` }} /> : null}
      <div style={{ position: 'relative' }}>{children}</div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The Day view's top. `tabs` is Eat's tab row, drawn under the head in the app's own type, as the Grocery
// page draws it; the rest is set in the clean type.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function BSEatDay(p) {
  const t0 = window.useBS();
  const t = useBSClean();
  const tr = useShapeTr();
  const fw = bsEatFuelWords(p, tr);
  const nx = bsEdNext(p, tr);
  const dates = bsEatWeekDates();
  const pick = dates[p.day] || dates[0];
  const gauges = dates.map((_, i) => bsEatDayGauge(p.week[i], i, p.todayIdx, p.fuel.unread));
  const INK = t.INK;
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const pane = (opts) => ({ ...bsMpGlass(t, INK, opts), backdropFilter: 'blur(14px) saturate(140%)', WebkitBackdropFilter: 'blur(14px) saturate(140%)' });
  const mono = { fontFamily: BS_DECK_MONO, fontWeight: 700, textTransform: 'uppercase' };
  const kicker = `${p.phase || tr('home:phase.cut', { defaultValue: 'Cut' })} · ${tr('common:unit.weekN', { defaultValue: 'Week {n}', n: p.weekN })}`;
  const f = p.fuel;
  const pad = t.padX;
  // The boxes' inset from the page's edges: the Home deck's (BSHomeDeck), wider than the gutter the heads keep.
  const BOX = 10;
  const dayTarget = f.calTarget > 0 ? f.calTarget : 0;
  const proteinC = (f.macros[0] || {}).c || t.RUST;
  const menu = {
    kicker: tr('nutrition:eat.menuKicker', { defaultValue: 'The menu' }),
    // ⚠ THE POSSESSIVE IS THE CATALOG'S TO FORM (es 'Comidas del lunes', de 'Mahlzeiten am Montag'), over the
    // weekday in the reader's language, never an English list.
    title: p.day === p.todayIdx ? tr('nutrition:eat.mealsToday', { defaultValue: "Today's meals" })
      : tr('nutrition:eat.mealsOnDay', { defaultValue: "{day}'s meals", day: dayFmt(pick, { weekday: 'long' }) }),
    swap: `${tr('nutrition:eat.swapAction', { defaultValue: 'Swap meal' })} →`,
    now: `${tr('home:slate.now', { defaultValue: 'Now' })} · ${p.nowText}`,
  };
  const nowRow = (i) => (
    <div key="now" data-eat-now-row="" aria-label={menu.now} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, borderTop: i ? `1px solid ${inkA(t, 0.08)}` : 0, ...mono, fontSize: 8.5, letterSpacing: '0.18em', color: t.ACCENT }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: t.ACCENT, boxShadow: glowShadow(t, t.ACCENT, 10, 1) }} />
      <span aria-hidden="true">{menu.now}</span>
      <span aria-hidden="true" style={{ flex: 1, height: 1.5, background: `linear-gradient(90deg, ${t.ACCENT}, transparent)`, boxShadow: glowShadow(t, t.ACCENT, 6, 0.8) }} />
    </div>
  );

  return (
    <>
      <style>{BS_ED_CSS}</style>
      <BSEdMast tools={p.tools} />
      <div data-eat-day="">
        {/* The head as a readout: a lit dot and the phase, the day's name in Saira light running from the ink
            to the accent, and a scanline under it with its node. Month opens the calendar. */}
        <div style={{ padding: `12px ${t0.padX}px 0` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, ...mono, fontSize: 9.5, letterSpacing: '0.2em', color: teal, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: teal, boxShadow: glowShadow(t, teal, 10, 1), flex: 'none', animation: 'bsed-breathe 2.8s ease-in-out infinite' }} />{kicker}
            </span>
            <button type="button" data-eat-month="" onClick={() => p.onMonth()} style={{ flex: 'none', minHeight: 44, margin: '-12px -4px -12px 0', padding: '0 4px', border: 0, background: 'transparent', cursor: 'pointer', ...mono, fontSize: 9, letterSpacing: '0.16em', color: teal, whiteSpace: 'nowrap' }}>{tr('home:action.monthView', { defaultValue: 'Month view →' })}</button>
          </div>
          <h1 style={{ margin: '8px 0 0', fontFamily: BS_GAUGE_FACE, fontWeight: 300, fontSize: 34, lineHeight: 1, letterSpacing: '-0.03em', overflowWrap: 'anywhere',
            backgroundImage: `linear-gradient(100deg, ${t.INK} 40%, ${t.ACCENT} 120%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' }}>
            {bsEdTitle(p.title)}.
          </h1>
          <div aria-hidden="true" style={{ position: 'relative', height: 2, marginTop: 12, background: `linear-gradient(90deg, ${hexA(t.ACCENT, 0.9)}, ${hexA(t.ACCENT, 0.15)} 70%, transparent)` }}>
            <span style={{ position: 'absolute', left: 0, top: -2.5, width: 7, height: 7, borderRadius: 99, background: t.ACCENT, boxShadow: glowShadow(t, t.ACCENT, 10, 1) }} />
          </div>
        </div>
        {/* Eat's tabs are the Grocery page's too, so they keep the app's type. */}
        <div style={{ marginTop: 4 }}>{p.tabs}</div>

        <BSCleanType t={t}>
          {/* The week as seven tiles on a raised box (owner, 2026-11-04, of option B's: "use this weekly calendar
              in C option for eat"): each tile holds its day's fuel as liquid, what was eaten of its target rising
              into it; a day still to come is a dashed outline. The picked tile is lit, ringed in the accent and
              lifted; today has an ink dot, and a dot in protein's colour marks a day protein was hit. */}
          {/* 2px between the tiles and 2px inside the box, so seven of them stand 44px wide on a 390px phone. */}
          <div style={{ padding: `14px ${BOX}px 0` }}>
            <BSEdRaised t={t} data-eat-week="" role="group" aria-label={tr('home:section.thisWeek', { defaultValue: 'This week' })} style={{ padding: '10px 2px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
                {dates.map((date, i) => {
                  const on = i === p.day;
                  const today = i === p.todayIdx;
                  const g = gauges[i];
                  const tile = bsMpTile(t, INK);
                  return (
                    <button key={i} type="button" data-eat-day-btn={i} data-eat-day-state={g.ahead ? 'ahead' : 'gone'} aria-pressed={on} aria-current={today ? 'date' : undefined}
                      aria-label={`${dayFmt(date, { weekday: 'long' })} ${date.getDate()}${on ? `, ${tr('home:aria.selected', { defaultValue: 'selected' })}` : ''}`}
                      onClick={() => p.onDay(i)}
                      style={{ ...tile, borderRadius: 14, position: 'relative', overflow: 'hidden', minWidth: 0, minHeight: 64, padding: '7px 0 6px', cursor: 'pointer', color: t.INK, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, boxSizing: 'border-box',
                        border: on ? `1.5px solid ${t.ACCENT}` : tile.border, transform: on ? 'translateY(-2px)' : 'none', boxShadow: on ? glowShadow(t, t.ACCENT, 16, 0.55) : tile.boxShadow,
                        transition: 'transform 260ms cubic-bezier(.2,.9,.25,1), box-shadow 260ms ease, border-color 260ms ease' }}>
                      {g.ahead ? (
                        <span aria-hidden="true" style={{ position: 'absolute', left: 4, right: 4, bottom: 4, height: '62%', borderRadius: 10, border: `1px dashed ${inkA(t, 0.18)}` }} />
                      ) : (
                        <span aria-hidden="true" data-eat-day-fill={Math.round(g.pct * 100)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.round(g.pct * 100)}%`, background: `linear-gradient(180deg, ${hexA(t.ACCENT, on ? 0.42 : 0.26)}, ${hexA(t.ACCENT, on ? 0.18 : 0.08)})`, borderTop: g.pct > 0 ? `1.5px solid ${hexA(t.ACCENT, 0.8)}` : 0, animation: `bsed-rise 640ms cubic-bezier(.2,.8,.2,1) ${80 + i * 50}ms both` }} />
                      )}
                      <span style={{ position: 'relative', fontFamily: BS_CLEAN_SANS, fontSize: 10.5, fontWeight: 600, color: on ? t.INK : t.INK70 }}>{dayFmt(date, { weekday: 'narrow' })}</span>
                      <span style={{ position: 'relative', fontFamily: BS_CLEAN_HEAD, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{date.getDate()}</span>
                      <span aria-hidden="true" style={{ position: 'relative', display: 'flex', gap: 3, height: 5 }}>
                        {today ? <span data-eat-day-today="" style={{ width: 5, height: 5, borderRadius: 99, background: t.INK }} /> : null}
                        {g.proteinHit ? <span data-eat-day-protein="" style={{ width: 5, height: 5, borderRadius: 99, background: proteinC }} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </BSEdRaised>
          </div>
          {p.notices}

          {/* The orbit on a raised box over a dot grid, the accent's light behind the dial, then the key, what was
              eaten and the three macros, each the door to its own page (they open nothing while the read is out). */}
          <div style={{ padding: `14px ${BOX}px 0` }}>
            <BSEdRaised t={t} grid light data-eat-fuel="" data-eat-fuel-unread={f.unread ? '' : undefined} style={{ padding: 12, animation: 'bsed-in 420ms ease-out both' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span data-eat-fuel-head="" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 600, color: inkA(t, 0.72) }}>
                  <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: t.ACCENT, boxShadow: glowShadow(t, t.ACCENT, 10, 0.9), flex: 'none' }} />
                  <span style={{ overflowWrap: 'anywhere' }}>{fw.head}</span>
                </span>
                <span data-eat-fuel-plan="" style={{ flex: 'none', padding: '3px 9px', borderRadius: 99, border: `1px solid ${inkA(t, 0.12)}`, fontFamily: BS_CLEAN_SANS, fontSize: 11, fontWeight: 600, color: inkA(t, 0.66), whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fw.plan}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <BSEdOrbit t={t} p={p} fw={fw} size={252} />
              </div>
              {/* The orbit's key: a station lit once eaten, ringed for the next, open for one to come; the needle NOW. */}
              <div aria-hidden="true" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 12px', marginTop: 2, ...mono, fontWeight: 600, fontSize: 8, letterSpacing: '0.12em', color: t.INK50 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: t.ACCENT, boxShadow: glowShadow(t, t.ACCENT, 6, 0.9) }} />{tr('nutrition:eat.macro.logged', { defaultValue: 'Logged' })}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, boxSizing: 'border-box', border: `2px solid ${t.ACCENT}` }} />{tr('nutrition:eat.next', { defaultValue: 'NEXT' })}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, boxSizing: 'border-box', border: `1.5px solid ${inkA(t, 0.55)}` }} />{tr('home:week.keyAhead', { defaultValue: 'to come' })}</span>
                {p.day === p.todayIdx ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 1.5, height: 9, background: t.INK }} />{tr('home:slate.now', { defaultValue: 'Now' })}</span> : null}
              </div>
              {fw.eaten ? <div data-eat-eaten="" style={{ marginTop: 6, textAlign: 'center', ...mono, fontWeight: 600, fontSize: 9, letterSpacing: '0.14em', color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>{fw.eaten}</div> : null}
              <div data-eat-macros="" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 10 }}>
                {f.macros.map((m) => {
                  const w = fw.macro(m);
                  return (
                    <button key={m.k} type="button" data-eat-macro={m.k} disabled={f.unread} onClick={() => !f.unread && p.onMacro(m.k)} aria-label={`${m.l} ${w.left} ${w.of}`}
                      style={{ position: 'relative', minWidth: 0, minHeight: 58, padding: '10px 8px 8px', borderRadius: 12, border: `1px solid ${inkA(t, 0.1)}`, background: `linear-gradient(180deg, ${hexA(m.c, t.isLight ? 0.07 : 0.1)}, transparent 60%)`, textAlign: 'left', cursor: f.unread ? 'default' : 'pointer', color: t.INK, overflow: 'hidden' }}>
                      <span aria-hidden="true" style={{ position: 'absolute', left: 8, top: 0, width: 22, height: 2.5, borderRadius: '0 0 3px 3px', background: m.c, boxShadow: glowShadow(t, m.c, 8, 0.9) }} />
                      <span style={{ display: 'block', ...mono, fontSize: 8, letterSpacing: '0.12em', color: m.c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.l}</span>
                      <span style={{ display: 'block', marginTop: 4, fontFamily: BS_GAUGE_FACE, fontSize: 16, fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{w.left}</span>
                      <span style={{ display: 'block', marginTop: 3, fontFamily: BS_DECK_MONO, fontSize: 9, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{w.of}</span>
                    </button>
                  );
                })}
              </div>
            </BSEdRaised>
          </div>

          {/* The next meal, today only, locked on: a reticle that pulses, the time and status, the meal, the
              arrival as a scale with the needle at NOW, and the two doors (Log it opens the meal, where it is
              logged; Swap opens the swap sheet on it). */}
          {nx ? (
            <div style={{ padding: `12px ${BOX}px 0` }}>
              <section data-eat-next="" style={{ ...pane({ radius: 22 }), position: 'relative', overflow: 'hidden', padding: '14px 14px 12px', border: `1px solid ${hexA(t.ACCENT, 0.45)}`, boxShadow: `${glowShadow(t, t.ACCENT, 22, 0.35)}, inset 0 1px 0 ${t.isLight ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.08)'}`, animation: 'bsed-in 420ms ease-out 100ms both' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <svg aria-hidden="true" width="46" height="46" viewBox="0 0 46 46" style={{ flex: 'none', overflow: 'visible' }}>
                    <circle cx="23" cy="23" r="19" fill="none" stroke={hexA(t.ACCENT, 0.5)} strokeWidth="1.2" strokeDasharray="3 4" />
                    <circle cx="23" cy="23" r="11" fill="none" stroke={t.ACCENT} strokeWidth="1.6" style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'bsed-pulse 2.6s ease-out infinite' }} />
                    <circle cx="23" cy="23" r="4.5" fill={t.ACCENT} style={{ filter: glowFilter(t, t.ACCENT, 6, 1) }} />
                    {[0, 90, 180, 270].map((a) => { const [x0, y0] = pt(23, 23, 15, a); const [x1, y1] = pt(23, 23, 22, a); return <line key={a} x1={f2(x0)} y1={f2(y0)} x2={f2(x1)} y2={f2(y1)} stroke={t.ACCENT} strokeWidth="1.6" strokeLinecap="round" />; })}
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', ...mono, fontSize: 9, letterSpacing: '0.16em', color: t.ACCENT }}>{nx.time ? `${nx.time} · ` : ''}{nx.status}</span>
                    <h2 style={{ margin: '4px 0 0', fontFamily: BS_GAUGE_FACE, fontWeight: 300, fontSize: 30, lineHeight: 1, letterSpacing: '-0.03em', color: t.INK, overflowWrap: 'anywhere' }}>{nx.slot}<span aria-hidden="true" style={{ color: t.ACCENT }}>.</span></h2>
                  </div>
                  {nx.until ? <span style={{ flex: 'none', maxWidth: 92, textAlign: 'right', ...mono, fontSize: 9, letterSpacing: '0.1em', lineHeight: 1.35, color: t.INK70 }}>{nx.until}</span> : null}
                </div>
                <div style={{ marginTop: 8, fontFamily: BS_DECK_MONO, fontSize: 9.5, lineHeight: 1.5, letterSpacing: '0.02em', color: t.INK70 }}>{nx.sub}</div>
                {nx.arrival ? (
                  <div role="img" aria-label={nx.arrival.aria} style={{ position: 'relative', height: 34, marginTop: 12 }}>
                    <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 8, backgroundImage: `repeating-linear-gradient(90deg, ${inkA(t, 0.3)} 0 1px, transparent 1px 8px)` }} />
                    <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 13, height: 2, width: `${nx.arrival.pct}%`, background: `linear-gradient(90deg, transparent, ${t.ACCENT})`, boxShadow: glowShadow(t, t.ACCENT, 8, 0.9), transformOrigin: 'left center', animation: 'bsed-grow-x 600ms ease-out 200ms both' }} />
                    <span aria-hidden="true" style={{ position: 'absolute', left: `${nx.arrival.pct}%`, top: 2, width: 2, height: 22, marginLeft: -1, borderRadius: 2, background: t.ACCENT, boxShadow: glowShadow(t, t.ACCENT, 10, 1) }} />
                    <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 24, maxWidth: '48%', ...mono, fontWeight: 600, fontSize: 8, letterSpacing: '0.1em', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nx.arrival.from}</span>
                    <span aria-hidden="true" style={{ position: 'absolute', right: 0, top: 24, maxWidth: '48%', ...mono, fontWeight: 600, fontSize: 8, letterSpacing: '0.1em', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>{nx.arrival.to}</span>
                  </div>
                ) : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <button type="button" data-eat-log="" onClick={() => p.onOpenMeal(nx.meal.id)} style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, border: `1px solid ${t.ACCENT}`, background: hexA(t.ACCENT, t.isLight ? 0.1 : 0.14), color: t.isLight ? t.INK : t.ACCENT, cursor: 'pointer', ...mono, fontWeight: 800, fontSize: 10, letterSpacing: '0.12em', boxShadow: glowShadow(t, t.ACCENT, 14, 0.5) }}>{nx.log}</button>
                  <button type="button" data-eat-swap="" onClick={() => p.onSwapMeal(nx.meal.id)} style={{ minHeight: 44, padding: '0 14px', borderRadius: 12, border: `1px solid ${inkA(t, 0.16)}`, background: 'transparent', color: t.INK70, cursor: 'pointer', ...mono, fontWeight: 800, fontSize: 10, letterSpacing: '0.12em' }}>{nx.swap}</button>
                </div>
              </section>
            </div>
          ) : null}

          {p.morning}

          {/* The menu as telemetry, on one pane: each meal a ring of its share of the day's energy with its hour
              inside, the meal, a lamp for how it stands (lit once eaten, pulsing for the next). NOW a lit
              scanline over the first meal still ahead. A meal opens; its shop list sits under it. */}
          <section data-tour="hero-eat" style={{ padding: `${t.sectGap}px ${pad}px 0` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', ...mono, fontSize: 9, letterSpacing: '0.2em', color: teal }}>{menu.kicker}</span>
                <span data-eat-menu-title="" style={{ display: 'block', marginTop: 3, fontFamily: BS_GAUGE_FACE, fontSize: 22, fontWeight: 300, letterSpacing: '-0.02em', color: t.INK }}>{menu.title}</span>
              </span>
              <button type="button" data-eat-swap-pick="" onClick={p.onSwapPick} style={{ flex: 'none', minHeight: 44, padding: '0 12px', borderRadius: 12, border: `1px solid ${inkA(t, 0.14)}`, background: 'transparent', cursor: 'pointer', ...mono, fontSize: 9, letterSpacing: '0.14em', color: t.ACCENT, whiteSpace: 'nowrap' }}>{menu.swap}</button>
            </div>
            {p.rows.length ? (
              <div style={{ ...pane({ grid: true, radius: 20 }), margin: `12px ${BOX - pad}px 0`, padding: '4px 12px' }}>
                {p.rows.map((r, i) => {
                  const m = p.meals.find((x) => x.id === r.key) || {};
                  const done = r.state === 'done';
                  const next = r.state === 'next';
                  const share = dayTarget > 0 ? clamp01((Number(m.kcal) || 0) / dayTarget) : 0;
                  const [hh, ap] = String(r.time || '').split(' ');
                  return (
                    <React.Fragment key={r.key}>
                      {i === p.nowIdx ? nowRow(i) : null}
                      <button type="button" data-eat-meal={r.state || 'ahead'} onClick={r.onOpen} aria-label={r.ariaLabel}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 62, padding: '8px 0', border: 0, borderTop: i && i !== p.nowIdx ? `1px solid ${inkA(t, 0.08)}` : 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: t.INK }}>
                        <BSEdRing t={t} pct={share} color={next || done ? t.ACCENT : inkA(t, 0.5)} size={42} stroke={3} glow={next || done} delay={120 + i * 80}>
                          <span style={{ display: 'block', textAlign: 'center', lineHeight: 1 }}>
                            <span style={{ display: 'block', fontFamily: BS_DECK_MONO, fontSize: 9.5, fontWeight: 700, color: next ? t.ACCENT : t.INK, fontVariantNumeric: 'tabular-nums' }}>{hh || '—'}</span>
                            {ap ? <span style={{ display: 'block', marginTop: 1, fontFamily: BS_DECK_MONO, fontSize: 7, fontWeight: 700, color: t.INK50 }}>{ap}</span> : null}
                          </span>
                        </BSEdRing>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em', color: done ? t.INK50 : t.INK, overflowWrap: 'anywhere' }}>{r.title}</span>
                          {r.sub ? <span style={{ display: 'block', marginTop: 3, fontFamily: BS_DECK_MONO, fontSize: 9, color: next ? t.ACCENT : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span> : null}
                          {r.extra || null}
                        </span>
                        <span aria-hidden="true" style={{ position: 'relative', flex: 'none', width: 10, height: 10 }}>
                          {next ? <span style={{ position: 'absolute', inset: 0, borderRadius: 99, border: `1.5px solid ${t.ACCENT}`, animation: 'bsed-pulse 2.4s ease-out infinite' }} /> : null}
                          <span style={{ position: 'absolute', inset: 0, borderRadius: 99, boxSizing: 'border-box', background: done || next ? t.ACCENT : 'transparent', border: done || next ? 0 : `1.5px solid ${inkA(t, 0.4)}`, boxShadow: done || next ? glowShadow(t, t.ACCENT, 8, 0.9) : 'none' }} />
                        </span>
                      </button>
                      {/* `below` sits under the row, outside its button (a control inside a button is not a control). */}
                      {r.below ? <div data-eat-day-shop="" style={{ padding: '0 0 4px 52px' }}>{r.below}</div> : null}
                    </React.Fragment>
                  );
                })}
                {p.nowIdx === p.rows.length ? nowRow(p.rows.length) : null}
              </div>
            ) : null}
            {p.empty}
          </section>
        </BSCleanType>
      </div>
    </>
  );
}
