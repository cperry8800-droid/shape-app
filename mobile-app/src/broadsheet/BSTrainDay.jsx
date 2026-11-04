import React from 'react';
import { BS_GAUGE_FACE } from './BSProInstrument.jsx';
import { bsMpGlass, bsMpGradText } from './BSMemberBento.jsx';
import { useBSBurnWeek } from './BSTrainBurn.jsx';
import { BS_CLEAN_HEAD } from './bsCleanType.jsx';

// ─── TRAIN · THE DAY, AS INSTRUMENTS ────────────────────────────────────────────────────────────
// The member's Train page under its masthead (owner, 2026-11-04, of three designs: "C for train but
// incorporate this button if you can", then of the page below the program, "and then C for next part").
// Glass panes over a dot grid, lit from the trainer's rust to the app's accent:
//   · the head: the phase and week on a lit readout line, the title, Month view;
//   · the week's burn as a glowing line, drawn on arrival, with the day picker riding under it and a lit
//     cursor sliding to the picked day; the line opens Burned this week day by day (BSTrainBurnPage);
//   · the session as an engine readout: its effort on a gauge, its figures in cells, and design A's round
//     ignition Start (a rust disc whose ring turns and pulses) with Swap beside it;
//   · the program as a lit circuit, a node a move, each opening the move's swap;
//   · On deck as a lit timeline, a node a day (rust for strength, the accent for conditioning or rest);
//   · the page's links (music, the full plan, build, an open session) as lit rows.
// The page (BSClientTrain) owns the data and every handler and hands them in; nothing here reads a plan
// or writes one. Every word is a catalog key the page already had. Motion is CSS and stops under
// prefers-reduced-motion; on a light paper the glows are soft tinted shadows.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx), and this module
// never imports the client module.

const { useState, useEffect, useLayoutEffect } = React;

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

// ── Colour, light and type ──────────────────────────────────────────────────────────────────────

// The trainer's rust is the session's colour; its brighter partner draws lines and light on a dark
// paper, its deeper one on a light paper; its text pair reads at AA on either.
const RUST = '#c0533b';
const rustHi = (t) => (t.isLight ? '#a8331b' : '#e0654b');
const rustText = (t) => (t.isLight ? '#9c3b26' : '#e98a73');

const hexRgb = (hex) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const n = parseInt(s, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [136, 136, 136];
};
const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const mix = (a, b, k) => {
  const A = hexRgb(a), B = hexRgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
};
const accentOf = (t) => (/^#[0-9a-f]{6}$/i.test(String(t.ACCENT || '')) ? t.ACCENT : (t.isLight ? '#0a8f87' : '#34d6c5'));
const inkOf = (t) => (/^#/.test(String(t.INK)) ? t.INK : (t.isLight ? '#14120f' : '#f2ede4'));
// Light given off: a halo on a dark paper, a soft tinted shadow on a light one (no muddy glow on cream).
const glow = (t, c, r = 22, a = 0.5) => (t.isLight ? `0 ${Math.round(r / 2)}px ${r}px -${Math.round(r / 2)}px ${rgba(c, a * 0.7)}` : `0 0 ${r}px ${rgba(c, a)}`);
const dropGlow = (t, c, r = 6, a = 0.7) => (t.isLight ? `drop-shadow(0 1px ${Math.max(1, r / 3)}px ${rgba(c, a * 0.35)})` : `drop-shadow(0 0 ${r}px ${rgba(c, a)})`);
const glass = (t, INK, extra) => ({ ...bsMpGlass(t, INK, { grid: true, radius: 22 }), ...extra });
const mono = (t) => ({ fontFamily: t.MONO, fontWeight: 700, textTransform: 'uppercase' });
const gutterOf = (t) => Math.max(8, (t.padX || 22) - 8);

const locale = () => (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
const num = (n) => { try { return new Intl.NumberFormat(locale()).format(n); } catch (e) { return String(n); } };

// The page's week, Monday first, in the reader's language.
function bstdWeek() {
  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(now.getDate() - todayIdx);
  const fmt = (o) => { try { return new Intl.DateTimeFormat(locale(), o); } catch (e) { return new Intl.DateTimeFormat(undefined, o); } };
  const fs = fmt({ weekday: 'short' }), fn = fmt({ weekday: 'narrow' }), fl = fmt({ weekday: 'long' });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return { i, date: d.getDate(), short: fs.format(d), narrow: fn.format(d), long: fl.format(d), today: i === todayIdx };
  });
}

// ── Reading the day's own strings ───────────────────────────────────────────────────────────────

// "4 × 6-8 · 3 min rest" → sets 4, reps 6-8, tail 3m; a segment ("10 min · easy") keeps its words.
export function bstdScheme(s) {
  const str = String(s || '').trim();
  const rest = (x) => {
    const r = String(x || '').trim();
    const m = /^(\d+)\s*min rest$/.exec(r); if (m) return `${m[1]}m`;
    const q = /^(\d+)\s*s rest$/.exec(r); if (q) return `${q[1]}s`;
    return r;
  };
  const m = /^(\d+)\s*[×x]\s*([^·]+?)\s*(?:·\s*(.+))?$/.exec(str);
  if (m) return { sets: m[1], reps: m[2].trim(), tail: rest(m[3]) };
  const parts = str.split('·').map((x) => x.trim()).filter(Boolean);
  return { sets: null, reps: null, seg: parts[0] || str || '—', tail: parts.slice(1).join(' · ') };
}
const bstdMinutes = (meta) => { const m = /(\d+)/.exec(String(meta || '').split('·')[0]); return m ? Number(m[1]) : null; };
const bstdRpe = (meta) => { const m = /RPE\s*(\d+(?:[.,]\d)?)/i.exec(String(meta || '')); return m ? Number(m[1].replace(',', '.')) : null; };
const bstdLoad = (l) => { const m = /(\d+(?:\.\d+)?)/.exec(String(l || '')); return m ? Number(m[1]) : null; };
const bstdLoadSplit = (l) => {
  const s = String(l || '').trim();
  const m = /^([+]?\d+(?:[.,]\d+)?)\s*(.*)$/.exec(s);
  return m ? { num: m[1], unit: m[2] } : { num: s || '—', unit: '' };
};
// The session's heaviest load as the page writes it ("155 lb"), or a dash.
function bstdTopLoad(moves) {
  let best = null;
  (moves || []).forEach((r) => { const v = bstdLoad(r.l); if (v != null && (!best || v > best.v)) best = { v, l: String(r.l).replace(/^\+/, '') }; });
  return best ? best.l : '—';
}
// A day that conditions rather than lifts: the plan's conditioning tag, or a zone in its line.
const bstdConditioning = (day) => !!day && (day.tag === 'COND' || /\bzone\b|\bZ\d\b/i.test(String(day.meta || '')));

// What the session panel says, in the page's own words.
function bstdFacts(p, tr) {
  const { cur = {}, isRest, moves = [], when, head, until, weekN, day } = p;
  const raw = String(head == null ? '' : head).trim();
  return {
    kicker: `${when} · ${isRest ? tr('session:train.restChip', { defaultValue: 'Rest' }) : tr('home:lead.railHeader', { defaultValue: 'Your move' })}`,
    kickerRight: `${tr('common:unit.weekN', { defaultValue: 'Week {n}', n: weekN })} · ${tr('session:train.dayN', { defaultValue: 'D{n}', n: day + 1 })}`,
    title: raw.replace(/\.\s*$/, ''),
    stop: !/[?!…]$/.test(raw),
    sub: moves.length > 0 ? cur.meta : cur.copy,
    until: until ? (until.h > 0 ? tr('session:train.untilHourMin', { defaultValue: '{h}h {m}m', h: until.h, m: until.m }) : tr('session:train.untilMin', { defaultValue: '{m} min', m: until.m })) : null,
    minutes: isRest ? null : bstdMinutes(cur.meta),
    rpe: isRest ? null : bstdRpe(cur.meta),
    start: tr('session:train.startAria', { defaultValue: 'Start session' }),
    swap: tr('session:train.swap', { defaultValue: 'Swap' }),
    rest: tr('session:train.restChip', { defaultValue: 'Rest' }),
    count: tr('session:train.moveCount', { defaultValue: `${moves.length} move${moves.length === 1 ? '' : 's'}`, count: moves.length }),
  };
}

// ── Motion ──────────────────────────────────────────────────────────────────────────────────────

// Once per document. Under prefers-reduced-motion nothing moves and everything stands where it ends.
const BSTD_CSS = `
@keyframes bstd-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes bstd-ring { 0% { box-shadow: 0 0 0 0 rgba(224,101,75,0.55); } 70% { box-shadow: 0 0 0 18px rgba(224,101,75,0); } 100% { box-shadow: 0 0 0 0 rgba(224,101,75,0); } }
@keyframes bstd-ring-soft { 0% { box-shadow: 0 0 0 0 rgba(192,83,59,0.32); } 70% { box-shadow: 0 0 0 12px rgba(192,83,59,0); } 100% { box-shadow: 0 0 0 0 rgba(192,83,59,0); } }
@keyframes bstd-spin { to { transform: rotate(360deg); } }
@keyframes bstd-beat { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.7); opacity: 0.45; } }
@keyframes bstd-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes bstd-node { 0% { opacity: 0.2; transform: scale(0.6); } 60% { opacity: 1; transform: scale(1.12); } 100% { opacity: 1; transform: none; } }
@keyframes bstd-trace { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes bstd-needle { from { transform: rotate(-90deg); } }
@media (prefers-reduced-motion: reduce) { [data-train-day], [data-train-day] * { animation: none !important; transition: none !important; } }
`;
function useBstdCss() {
  useLayoutEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('bs-train-day-css')) return;
    const s = document.createElement('style');
    s.id = 'bs-train-day-css';
    s.textContent = BSTD_CSS;
    document.head.appendChild(s);
  }, []);
}
const rise = (i = 0, base = 0) => ({ animation: `bstd-rise 460ms cubic-bezier(.2,.7,.2,1) ${base + i * 70}ms both` });

// Line icons in currentColor (no coloured emoji in new work).
const BSTD_ICONS = {
  play: ['M7 4.5v15l12.5-7.5Z'],
  swap: ['M7 7h12', 'm15 3 4 4-4 4', 'M17 17H5', 'm9 21-4-4 4-4'],
};
function BstdIcon({ name, size = 16, stroke = 2, fill = false }) {
  const paths = BSTD_ICONS[name] || BSTD_ICONS.play;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none' }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// A pane's head: a glowing dot, the mono label, an optional chip, and one action on the right.
function BstdPaneHead({ t, INK, c, label, chip, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px', minHeight: 44 }}>
      <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: 99, background: c, boxShadow: glow(t, c, 10, 0.95) }} />
      <span style={{ ...mono(t), fontSize: 9, letterSpacing: '0.16em', color: rgba(INK, 0.72), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {chip != null ? <span style={{ flex: 'none', padding: '2px 8px', borderRadius: 99, border: `1px solid ${rgba(INK, 0.14)}`, ...mono(t), fontSize: 8, letterSpacing: '0.1em', color: rgba(INK, 0.6), whiteSpace: 'nowrap' }}>{chip}</span> : null}
      {action && onAction ? <button type="button" onClick={onAction} style={{ marginLeft: 'auto', flex: 'none', minHeight: 44, minWidth: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', ...mono(t), fontSize: 9, letterSpacing: '0.16em', color: accentOf(t), whiteSpace: 'nowrap' }}>{action}</button> : null}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// The page under its masthead.
//   kicker, title     the phase · week, and "Your training"
//   program, day      the week's seven days (the page's PROGRAM) and the picked one (0 = Monday)
//   cur, moves        the picked day and its moves after the member's swaps; swapped[i] marks a swap
//   isRest, when, head, until, weekN, coach    what the page already worked out for the session
//   onDay, onMonth, onBurn, onStart, onSwap, onMove, onRadio, onEditYours (or null)    the page's doors
//   adjust            the coach's adjust banner, drawn under the week
//   links             [{ glyph, color, label, tag, onOpen }] the page's links, in order
// ═════════════════════════════════════════════════════════════════════════════════════════════════
export function BSTrainDay(p) {
  useBstdCss();
  const t = window.useBS();
  const tr = useShapeTr();
  const INK = inkOf(t);
  const acc = accentOf(t);
  const hi = rustHi(t);
  return (
    <div data-train-day="" style={{ position: 'relative' }}>
      {/* The head: a lit readout line, the title lit from rust to the accent, a glowing rule. */}
      <div style={{ padding: `0 ${t.padX}px`, ...rise(0) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: 99, background: acc, boxShadow: glow(t, acc, 10, 0.95) }} />
          <span style={{ ...mono(t), fontSize: 9, letterSpacing: '0.22em', color: rgba(INK, 0.72), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.kicker}</span>
          <button type="button" onClick={p.onMonth} style={{ marginLeft: 'auto', minHeight: 44, minWidth: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', ...mono(t), fontSize: 9, letterSpacing: '0.16em', color: acc, whiteSpace: 'nowrap' }}>{tr('home:action.monthView', { defaultValue: 'Month view →' })}</button>
        </div>
        <h1 style={{ margin: 0, fontFamily: BS_GAUGE_FACE, fontSize: 38, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingBottom: 2, ...bsMpGradText(t, hi, INK) }}>{p.title}</h1>
        <div aria-hidden="true" style={{ marginTop: 8, height: 1.5, borderRadius: 2, background: `linear-gradient(90deg, ${hi}, ${acc} 55%, transparent)`, boxShadow: glow(t, acc, 8, 0.6) }} />
      </div>

      <BSTrainDayBurn day={p.day} program={p.program} onDay={p.onDay} onBurn={p.onBurn} />

      {p.adjust}

      <BstdSession t={t} p={p} INK={INK} />

      {p.moves && p.moves.length > 0 ? <BstdCircuit t={t} p={p} INK={INK} /> : null}

      <BstdOnDeck t={t} p={p} INK={INK} />

      {Array.isArray(p.links) && p.links.length ? <BstdLinks t={t} links={p.links} INK={INK} /> : null}
    </div>
  );
}

// ── The week's burn, with the day picker ────────────────────────────────────────────────────────

// The burn as a glowing line drawn on arrival (a gap where nothing tracked, never a dip to 0), the days
// under it as the picker, and a lit cursor that slides to the picked day. The head opens the week day by
// day; Retry and Connect sit outside it.
export function BSTrainDayBurn({ day = 0, program = [], onDay = null, onBurn = null }) {
  useBstdCss();
  const t = window.useBS();
  const tr = useShapeTr();
  const w = useBSBurnWeek();
  const INK = inkOf(t);
  const week = bstdWeek();
  const acc = accentOf(t);
  const hi = rustHi(t);
  const max = w.week && w.week.max ? w.week.max : 1;
  const W = 700, H = 150, top = 22, base = 128;
  const x = (i) => (i + 0.5) * (W / 7);
  const y = (k) => base - (k / max) * (base - top);
  const pts = w.days.map((dd, i) => (dd.kcal != null ? { i, x: x(i), y: y(dd.kcal), today: dd.isToday } : null));
  const runs = [];
  pts.forEach((pt, i) => { if (!pt) return; if (i > 0 && pts[i - 1]) runs[runs.length - 1].push(pt); else runs.push([pt]); });
  const gid = 'bstd-scope';
  const sources = w.week ? w.week.sources.map((s) => (s === 'manual' ? tr('session:burn.manual', { defaultValue: 'your log' }) : s)).join(' · ') : '';
  const tail = w.signedIn ? sources : tr('session:burn.sample', { defaultValue: 'Sample week' });
  return (
    <section data-train-day="" data-train-burn="" aria-busy={w.loading || undefined} aria-label={tr('session:burn.title', { defaultValue: 'Burned this week' })}
      style={glass(t, INK, { margin: `14px ${gutterOf(t)}px 0`, padding: '6px 4px 8px', ...rise(1) })}>
      <button type="button" data-train-burn-open="" onClick={onBurn || undefined} disabled={!onBurn}
        style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', border: 0, background: 'transparent', cursor: onBurn ? 'pointer' : 'default', color: INK, textAlign: 'left', font: 'inherit' }}>
        <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: 99, background: hi, boxShadow: glow(t, hi, 10, 0.95) }} />
        <span style={{ ...mono(t), fontSize: 9, letterSpacing: '0.16em', color: rgba(INK, 0.72), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('session:burn.title', { defaultValue: 'Burned this week' })}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: BS_GAUGE_FACE, fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', ...bsMpGradText(t, hi, INK) }}>{w.hasTotal ? num(w.week.total) : '—'}</span>
          <span style={{ ...mono(t), fontSize: 8.5, color: rgba(INK, 0.5), textTransform: 'none' }}>{tr('session:burn.kcalWord', { defaultValue: 'kcal' })}</span>
          <span aria-hidden="true" style={{ marginLeft: 4, color: onBurn ? rgba(INK, 0.45) : 'transparent', fontFamily: t.MONO, fontSize: 15 }}>›</span>
        </span>
      </button>
      <div style={{ position: 'relative' }}>
        {/* The cursor: a lit column at the picked day, sliding to it. */}
        <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 'calc(100% / 7)', transform: `translateX(${day * 100}%)`, transition: 'transform 420ms cubic-bezier(.3,.8,.2,1)', pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', inset: '0 3px', borderRadius: 12, background: `linear-gradient(180deg, ${rgba(acc, 0)}, ${rgba(acc, t.isLight ? 0.1 : 0.14)})`, border: `1px solid ${rgba(acc, t.isLight ? 0.25 : 0.3)}` }} />
          <span style={{ position: 'absolute', top: 4, bottom: 48, left: 'calc(50% - 0.75px)', width: 1.5, background: `linear-gradient(180deg, ${rgba(acc, 0)}, ${acc})`, boxShadow: glow(t, acc, 8, 0.8) }} />
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={tr('session:burn.chartAria', { defaultValue: 'Calories burned each day this week' })} style={{ position: 'relative', display: 'block', height: 'auto', overflow: 'visible' }}>
          <defs>
            <linearGradient id={`${gid}-line`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={hi} /><stop offset="1" stopColor={acc} /></linearGradient>
            <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={hi} stopOpacity={t.isLight ? 0.22 : 0.32} /><stop offset="1" stopColor={hi} stopOpacity="0" /></linearGradient>
          </defs>
          <line x1="12" x2={W - 12} y1={base} y2={base} stroke={rgba(INK, 0.16)} strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
          {runs.map((r, k) => (
            <g key={k}>
              {r.length > 1 ? <path d={`M${r[0].x},${base} ${r.map((pt) => `L${pt.x},${pt.y}`).join(' ')} L${r[r.length - 1].x},${base} Z`} fill={`url(#${gid}-fill)`} style={{ animation: 'bstd-rise 700ms ease-out 500ms both' }} /> : null}
              {r.length > 1 ? <path d={r.map((pt, j) => `${j ? 'L' : 'M'}${pt.x},${pt.y}`).join(' ')} pathLength="1" strokeDasharray="1" fill="none" stroke={`url(#${gid}-line)`} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" style={{ filter: dropGlow(t, hi, 6, 0.85), animation: 'bstd-draw 1100ms cubic-bezier(.4,0,.2,1) 200ms both' }} /> : null}
            </g>
          ))}
          {pts.filter(Boolean).map((pt) => (
            <g key={pt.i} data-train-burn-point={pt.i}>
              {pt.today ? <circle cx={pt.x} cy={pt.y} r="16" fill={rgba(hi, 0.22)} style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'bstd-beat 2.4s ease-in-out infinite' }} /> : null}
              <circle cx={pt.x} cy={pt.y} r={pt.today ? 8 : 6} fill={pt.today ? hi : t.PAPER} stroke={hi} strokeWidth="3" />
            </g>
          ))}
        </svg>
        <div role="group" aria-label={tr('home:section.thisWeek', { defaultValue: 'This week' })} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {week.map((wd) => {
            const on = wd.i === day;
            const rest = (program[wd.i] || {}).tag === 'REST';
            return (
              <button key={wd.i} type="button" data-train-day-pick={wd.i} aria-pressed={on} aria-current={wd.today ? 'date' : undefined}
                aria-label={`${wd.long} ${wd.date}${on ? `, ${tr('home:aria.selected', { defaultValue: 'selected' })}` : ''}`}
                onClick={() => { if (typeof onDay === 'function') onDay(wd.i); }}
                style={{ minWidth: 0, minHeight: 48, padding: '4px 0 6px', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: on ? acc : INK, transition: 'color 260ms ease' }}>
                <span style={{ ...mono(t), fontSize: 8.5, letterSpacing: '0.12em', color: on ? acc : (wd.today ? rustText(t) : rgba(INK, 0.55)), whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>{wd.narrow}</span>
                <span style={{ fontFamily: BS_GAUGE_FACE, fontSize: 17, fontWeight: on ? 600 : 400, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', textShadow: on && !t.isLight ? `0 0 12px ${rgba(acc, 0.8)}` : 'none' }}>{wd.date}</span>
                <span aria-hidden="true" style={{ width: rest ? 6 : 10, height: rest ? 6 : 2, borderRadius: 99, boxSizing: 'border-box', background: rest ? 'transparent' : (on ? acc : rgba(hi, 0.8)), border: rest ? `1px solid ${rgba(INK, 0.35)}` : 0 }} />
              </button>
            );
          })}
        </div>
      </div>
      {w.hasTotal ? (
        <div style={{ padding: '2px 10px 0', ...mono(t), fontSize: 8.5, letterSpacing: '0.1em', color: rgba(INK, 0.55), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tr('session:burn.avg', { defaultValue: '{avg}/day', avg: num(w.week.avg) })}{tail ? ` · ${tail}` : ''}
        </div>
      ) : <BstdBurnNote t={t} w={w} INK={INK} />}
    </section>
  );
}

// Burned this week's quiet states: reading, could not read (Retry), nothing tracked (Connect).
const bstdConnect = () => { try { window.dispatchEvent(new CustomEvent('shape:openIntegrations')); } catch (e) { /* no listener */ } };
function BstdBurnNote({ t, w, INK }) {
  const tr = useShapeTr();
  const link = { flex: 'none', minHeight: 44, minWidth: 44, background: 'transparent', border: 0, padding: '0 2px', cursor: 'pointer', ...mono(t), fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: rustText(t), whiteSpace: 'nowrap' };
  const words = { fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.3, color: rgba(INK, 0.7) };
  const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px' };
  if (w.loading) return <div style={{ ...row, ...words, minHeight: 32 }}>{tr('session:burn.reading', { defaultValue: 'Reading your week…' })}</div>;
  if (w.failed) return <div style={row}><span style={words}>{tr('session:burn.failed', { defaultValue: 'Couldn’t read your activity' })}</span><button type="button" onClick={w.retry} style={link}>{tr('session:burn.retry', { defaultValue: 'Retry' })} ↻</button></div>;
  if (w.week && !w.hasTotal) return <div style={row}><span style={words}>{tr('session:burn.none', { defaultValue: 'Nothing tracked yet this week.' })}</span><button type="button" onClick={bstdConnect} style={link}>{tr('session:burn.connect', { defaultValue: 'Connect' })} →</button></div>;
  return null;
}

// ── The session ─────────────────────────────────────────────────────────────────────────────────

// The session as an engine readout: rust light at its edge, the effort on a gauge beside the title, its
// figures in cells, then who wrote it with Swap, beside the round ignition Start.
function BstdSession({ t, p, INK }) {
  const tr = useShapeTr();
  const f = bstdFacts(p, tr);
  const hi = rustHi(t);
  const cells = [
    { k: 'time', l: tr('session:train.reg.time', { defaultValue: 'Time' }), v: f.minutes != null ? tr('session:train.minutes', { defaultValue: '{min} min', min: f.minutes }) : '—' },
    { k: 'moves', l: tr('session:train.programKicker', { defaultValue: 'The program' }), v: p.moves.length ? f.count : '—' },
    f.until ? { k: 'until', l: tr('session:train.startsIn', { defaultValue: 'Starts in' }), v: f.until } : { k: 'load', l: tr('session:train.col.load', { defaultValue: 'Load' }), v: bstdTopLoad(p.moves) },
  ];
  return (
    <section data-tour="hero-train" data-train-day-hero="" style={glass(t, INK, { margin: `12px ${gutterOf(t)}px 0`, padding: 14, overflow: 'hidden',
      border: `1px solid ${rgba(hi, t.isLight ? 0.3 : 0.45)}`,
      boxShadow: t.isLight ? `0 14px 30px -18px ${rgba(RUST, 0.5)}, inset 0 1px 0 rgba(255,255,255,0.9)` : `0 0 0 1px ${rgba(hi, 0.08)}, 0 0 34px -6px ${rgba(hi, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.08)`,
      ...rise(2) })}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: `radial-gradient(90% 70% at 0% 0%, ${rgba(hi, t.isLight ? 0.1 : 0.2)}, transparent 60%), radial-gradient(60% 50% at 100% 100%, ${rgba(hi, t.isLight ? 0.08 : 0.16)}, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: 99, background: hi, boxShadow: glow(t, hi, 10, 0.95) }} />
        <span style={{ minWidth: 0, flex: 1, ...mono(t), fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: rustText(t), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.kicker}</span>
        <span style={{ flex: 'none', ...mono(t), fontSize: 8.5, letterSpacing: '0.12em', color: rgba(INK, 0.5) }}>{f.kickerRight}</span>
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <BstdGauge t={t} INK={INK} f={f} isRest={p.isRest} />
        <div style={{ minWidth: 0 }}>
          <h2 data-train-day-title="" style={{ margin: 0, fontFamily: BS_GAUGE_FACE, fontSize: f.title.length <= 14 ? 26 : f.title.length <= 24 ? 22 : 19, fontWeight: 500, lineHeight: 1.08, letterSpacing: '-0.02em', color: INK, overflowWrap: 'anywhere' }}>
            {f.title}{f.stop ? <span style={{ color: hi, textShadow: t.isLight ? 'none' : `0 0 10px ${rgba(hi, 0.8)}` }}>.</span> : null}
          </h2>
          {f.sub ? <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 12, lineHeight: 1.4, color: rgba(INK, 0.66) }}>{f.sub}</div> : null}
        </div>
      </div>
      <div style={{ position: 'relative' }}><BstdChips t={t} p={p} /></div>
      {!p.isRest ? (
        <div style={{ position: 'relative', marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderRadius: 14, border: `1px solid ${rgba(INK, 0.1)}`, background: rgba(INK, t.isLight ? 0.03 : 0.04) }}>
          {cells.map((c, i) => (
            <div key={c.k} style={{ minWidth: 0, padding: '8px 10px', borderLeft: i ? `1px solid ${rgba(INK, 0.1)}` : 0 }}>
              <div style={{ ...mono(t), fontSize: 7.5, letterSpacing: '0.14em', color: rgba(INK, 0.5), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.l}</div>
              <div style={{ marginTop: 3, fontFamily: BS_GAUGE_FACE, fontSize: 16, fontWeight: 500, color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.v}</div>
            </div>
          ))}
        </div>
      ) : null}
      {/* The console: who wrote the day with Swap under it, and the ignition beside them. */}
      <div style={{ position: 'relative', marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'end', gap: 12 }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <BstdByline t={t} p={p} INK={INK} />
          {!p.isRest && p.moves.length > 0 ? (
            <button type="button" data-train-day-swap="" onClick={p.onSwap} style={{ ...bsMpGlass(t, INK, { radius: 16 }), minHeight: 48, minWidth: 48, padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: INK, fontFamily: BS_CLEAN_HEAD, fontSize: 14, fontWeight: 700 }}>
              <BstdIcon name="swap" size={15} />{f.swap}
            </button>
          ) : null}
        </div>
        {!p.isRest ? <BstdIgnition t={t} label={f.start} onClick={p.onStart} /> : (
          <span data-train-day-rest="" style={{ width: 92, height: 92, borderRadius: 999, boxSizing: 'border-box', border: `1.5px dashed ${rgba(INK, 0.28)}`, display: 'grid', placeItems: 'center', ...mono(t), fontSize: 9, letterSpacing: '0.16em', color: rgba(INK, 0.55) }}>{f.rest}</span>
        )}
      </div>
    </section>
  );
}

// The round ignition (design A's, as the owner asked): a ring from rust to the accent that turns slowly,
// a pulse off its rim, and a lit rust core with ▶ and its words. 92px across, named for a reader.
function BstdIgnition({ t, label, onClick, size = 92 }) {
  const acc = accentOf(t);
  return (
    <button type="button" data-train-day-start="" onClick={onClick} aria-label={label}
      style={{ position: 'relative', width: size, height: size, minWidth: 44, minHeight: 44, flex: 'none', borderRadius: 999, border: 0, padding: 0, cursor: 'pointer', background: 'transparent' }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 999, background: `conic-gradient(from 200deg, ${RUST}, ${acc}, ${rustHi(t)}, ${RUST})`, boxShadow: glow(t, RUST, 26, 0.55), animation: 'bstd-spin 10s linear infinite' }} />
      <span aria-hidden="true" style={{ position: 'absolute', inset: 3, borderRadius: 999, background: t.PAPER }} />
      <span aria-hidden="true" style={{ position: 'absolute', inset: 9, borderRadius: 999, animation: `${t.isLight ? 'bstd-ring-soft' : 'bstd-ring'} 2.6s ease-out infinite` }} />
      <span style={{ position: 'absolute', inset: 9, borderRadius: 999, display: 'grid', placeItems: 'center', color: '#ffffff', background: `radial-gradient(circle at 34% 28%, #e3805f 0%, ${RUST} 52%, #8a3321 100%)`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -5px 12px rgba(0,0,0,0.28)' }}>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 8px' }}>
          <BstdIcon name="play" size={17} stroke={1.5} fill />
          <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.2, textAlign: 'center', overflowWrap: 'anywhere' }}>{label}</span>
        </span>
      </span>
    </button>
  );
}

// The effort gauge: a half dial from rest to all-out, lit to the session's RPE (its minutes against 90
// when the day names no RPE), with a needle that swings up on arrival.
function BstdGauge({ t, INK, f, isRest }) {
  const tr = useShapeTr();
  const acc = accentOf(t);
  const hi = rustHi(t);
  const byRpe = f.rpe != null;
  const v = isRest ? 0 : byRpe ? Math.max(0, Math.min(1, f.rpe / 10)) : f.minutes != null ? Math.max(0, Math.min(1, f.minutes / 90)) : 0;
  const cx = 60, cy = 60, r = 48;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const gid = 'bstd-gauge';
  const value = isRest ? '—' : byRpe ? String(f.rpe) : f.minutes != null ? String(f.minutes) : '—';
  const unit = byRpe ? tr('session:train.reg.rpe', { defaultValue: 'RPE' }) : tr('session:train.reg.time', { defaultValue: 'Time' });
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: 120, height: 74, flex: 'none' }}>
      <svg viewBox="0 0 120 74" width="120" height="74" style={{ display: 'block', overflow: 'visible' }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={acc} /><stop offset="0.6" stopColor={hi} /><stop offset="1" stopColor={RUST} /></linearGradient></defs>
        <path d={arc} fill="none" stroke={rgba(INK, 0.1)} strokeWidth="9" strokeLinecap="round" />
        {Array.from({ length: 11 }).map((_, k) => {
          const a = Math.PI - (k / 10) * Math.PI;
          const r1 = r + 9, r2 = r + (k % 5 === 0 ? 14 : 12);
          return <line key={k} x1={cx + r1 * Math.cos(a)} y1={cy - r1 * Math.sin(a)} x2={cx + r2 * Math.cos(a)} y2={cy - r2 * Math.sin(a)} stroke={rgba(INK, k / 10 <= v + 1e-6 && v > 0 ? 0.6 : 0.22)} strokeWidth="1.2" strokeLinecap="round" />;
        })}
        {v > 0 ? <path d={arc} pathLength="1" strokeDasharray={`${v} 1`} fill="none" stroke={`url(#${gid})`} strokeWidth="9" strokeLinecap="round" style={{ filter: dropGlow(t, hi, 5, 0.8), animation: 'bstd-draw 900ms cubic-bezier(.3,.7,.2,1) 250ms both' }} /> : null}
        <g style={{ transformBox: 'view-box', transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${-90 + v * 180}deg)`, animation: 'bstd-needle 1000ms cubic-bezier(.3,1.4,.5,1) 250ms both' }}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 12} stroke={INK} strokeWidth="2" strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r="4.5" fill={hi} stroke={t.PAPER} strokeWidth="2" />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 26, textAlign: 'center', pointerEvents: 'none', fontFamily: BS_GAUGE_FACE, fontSize: 22, fontWeight: 500, lineHeight: 1, color: INK, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: -4, textAlign: 'center', ...mono(t), fontSize: 7.5, fontWeight: 800, letterSpacing: '0.16em', color: rgba(INK, 0.55) }}>{unit}</div>
    </div>
  );
}

// The coach's adjust (focus, intensity) and the day's playlist (which opens Shape Radio), as chips. A
// coach-set rest keeps the day's fields but is no session, so it shows no playlist.
function BstdChips({ t, p }) {
  const tr = useShapeTr();
  const cur = p.cur || {};
  const acc = accentOf(t);
  const base = { ...mono(t), fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', borderRadius: 99, padding: '4px 9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', boxSizing: 'border-box' };
  const chips = [];
  if (cur.coachAdjust && cur.coachFocus) chips.push(<span key="f" style={{ ...base, color: acc, border: `1px solid ${rgba(acc, 0.45)}` }}>{cur.coachFocus}</span>);
  if (cur.coachAdjust && cur.intensityLabel) chips.push(<span key="i" style={{ ...base, color: t.INK70, border: `1px solid ${t.RULE}` }}>{tr('session:train.coachIntensity', { defaultValue: 'Coach · {label}', label: cur.intensityLabel })}</span>);
  const list = !p.isRest && cur.playlist && cur.playlist.name ? (
    <button type="button" data-train-day-playlist="" onClick={p.onRadio} style={{ minHeight: 44, minWidth: 44, maxWidth: '100%', display: 'flex', alignItems: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
      <span style={{ ...base, color: acc, border: `1px solid ${rgba(acc, 0.45)}`, background: rgba(acc, 0.08) }}>♪ {cur.playlist.name}{cur.playlist.meta ? ` · ${cur.playlist.meta}` : ''}</span>
    </button>
  ) : null;
  if (!chips.length && !list) return null;
  return <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>{chips}{list}</div>;
}

// Who wrote the day: the member's own program (with Edit · Yours on a repeating day), the trainer, or
// nobody at all when no coach authored it.
function BstdByline({ t, p, INK }) {
  const tr = useShapeTr();
  const cur = p.cur || {};
  const m = { ...mono(t), fontSize: 8.5, letterSpacing: '0.14em', lineHeight: 1.5 };
  if (cur.selfAuthored) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ ...m, color: rgba(INK, 0.72) }}>{cur.program && cur.program.name ? cur.program.name : tr('session:train.programmedByYou', { defaultValue: 'Programmed by you' })}{cur.program && cur.program.week ? ` · ${tr('session:train.yourProgramWeek', { defaultValue: 'Your program · Week {n}', n: cur.program.week })}` : ''}</span>
        {p.onEditYours ? <button type="button" onClick={p.onEditYours} style={{ minHeight: 44, minWidth: 44, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', ...m, fontSize: 8, color: accentOf(t) }}>{tr('session:train.editYours', { defaultValue: 'Edit · Yours' })}</button> : null}
      </div>
    );
  }
  if (!p.coach) return null;
  return <div style={{ ...m, color: rgba(INK, 0.72) }}>{p.coach} · <span style={{ color: rgba(INK, 0.5) }}>{tr('session:train.coachRole', { defaultValue: 'Coach · Trainer' })}</span></div>;
}

// ── The program, On deck and the links ─────────────────────────────────────────────────────────

// The program as a circuit: a lit trace from rust to the accent down the moves, each move a node that
// lights in turn, its load read out at the end of its line. A move opens its swap.
function BstdCircuit({ t, p, INK }) {
  const tr = useShapeTr();
  const f = bstdFacts(p, tr);
  const acc = accentOf(t);
  const hi = rustHi(t);
  const n = p.moves.length;
  return (
    <section data-train-day-program="" style={glass(t, INK, { margin: `12px ${gutterOf(t)}px 0`, padding: '2px 12px 8px', ...rise(3) })}>
      <BstdPaneHead t={t} INK={INK} c={acc} label={tr('session:train.programKicker', { defaultValue: 'The program' })} chip={f.count} action={`${f.swap} →`} onAction={p.onSwap} />
      <div style={{ position: 'relative' }}>
        <span aria-hidden="true" style={{ position: 'absolute', left: 17, top: 28, bottom: 28, width: 2, borderRadius: 2, background: `linear-gradient(180deg, ${hi}, ${acc})`, boxShadow: t.isLight ? 'none' : `0 0 10px ${rgba(hi, 0.6)}`, transformOrigin: 'top', animation: `bstd-trace ${400 + n * 120}ms ease-out 200ms both` }} />
        {p.moves.map((r, i) => {
          const sc = bstdScheme(r.s);
          const lp = bstdLoadSplit(r.l);
          const c = mix(hi, acc, n > 1 ? i / (n - 1) : 0);
          return (
            <button key={i} type="button" data-train-day-move={i} onClick={() => p.onMove(i)}
              style={{ position: 'relative', width: '100%', minHeight: 56, display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '6px 2px 6px 0', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: INK }}>
              <span aria-hidden="true" style={{ position: 'relative', justifySelf: 'center', width: 30, height: 30, borderRadius: 99, boxSizing: 'border-box', display: 'grid', placeItems: 'center', background: t.PAPER, border: `1.5px solid ${c}`, boxShadow: glow(t, c, 12, 0.75), color: c, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, animation: `bstd-node 520ms cubic-bezier(.3,1.3,.5,1) ${260 + i * 130}ms both` }}>{r.n}</span>
              <span style={{ minWidth: 0, position: 'relative' }}>
                <span aria-hidden="true" style={{ position: 'absolute', left: -10, top: '50%', width: 6, height: 1.5, background: rgba(c, 0.7) }} />
                <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.m}</span>
                <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.06em', color: rgba(INK, 0.55), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.swapped && p.swapped[i] ? <span style={{ color: acc, marginRight: 6, letterSpacing: '0.12em', fontWeight: 800 }}>{tr('session:train.swapped', { defaultValue: 'SWAPPED' })}</span> : null}
                  {sc.sets ? `${sc.sets} × ${sc.reps}` : sc.seg}{sc.tail ? ` · ${sc.tail}` : ''}
                </span>
              </span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: 8, border: `1px solid ${rgba(INK, 0.1)}`, background: rgba(INK, t.isLight ? 0.03 : 0.05) }}>
                <span style={{ fontFamily: BS_GAUGE_FACE, fontSize: 16, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{lp.num}</span>
                {lp.unit ? <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, color: rgba(INK, 0.5), marginLeft: 2 }}>{lp.unit}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// On deck: the next three days after today as a lit timeline, a node a day with its weekday, rust for a
// strength day and the accent for conditioning or rest, the day's title, and its minutes, zone or RPE as
// readouts. A day opens on the page (the week above moves to it); Plan opens the calendar.
function BstdOnDeck({ t, p, INK }) {
  const tr = useShapeTr();
  const acc = accentOf(t);
  const hi = rustHi(t);
  const week = bstdWeek();
  const todayIdx = week.findIndex((w) => w.today);
  const rows = [1, 2, 3].map((off) => {
    const idx = ((todayIdx < 0 ? 0 : todayIdx) + off) % 7;
    const d = (p.program || [])[idx] || {};
    const rest = d.tag === 'REST';
    return {
      idx, rest, wd: week[idx],
      c: rest || bstdConditioning(d) ? acc : hi,
      title: rest ? tr('session:train.activeRest', { defaultValue: 'Active rest' }) : (d.headline || d.title || '—'),
      reads: rest ? [tr('session:train.restSub', { defaultValue: 'walk + mobility' })] : String(d.meta || '').split('·').map((x) => x.trim()).filter(Boolean).slice(0, 3),
    };
  });
  return (
    <section data-train-day-ondeck="" style={glass(t, INK, { margin: `${(t.sectGap || 22) - 6}px ${gutterOf(t)}px 0`, padding: '2px 12px 8px', ...rise(4) })}>
      <BstdPaneHead t={t} INK={INK} c={acc} label={tr('home:section.thisWeek', { defaultValue: 'This week' })} action={`${tr('session:train.plan', { defaultValue: 'Plan' })} →`} onAction={p.onMonth} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 2px 6px' }}>
        <h2 style={{ margin: 0, fontFamily: BS_GAUGE_FACE, fontSize: 24, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, color: INK }}>{tr('session:train.onDeck', { defaultValue: 'On deck' })}</h2>
        <span style={{ padding: '2px 8px', borderRadius: 99, border: `1px solid ${rgba(INK, 0.14)}`, ...mono(t), fontSize: 8, letterSpacing: '0.1em', color: rgba(INK, 0.6) }}>{rows.length}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <span aria-hidden="true" style={{ position: 'absolute', left: 21, top: 30, bottom: 30, width: 2, borderRadius: 2, background: `linear-gradient(180deg, ${rows[0].c}, ${rows[rows.length - 1].c})`, boxShadow: t.isLight ? 'none' : `0 0 10px ${rgba(rows[0].c, 0.5)}`, transformOrigin: 'top', animation: 'bstd-trace 700ms ease-out 300ms both' }} />
        {rows.map((r, i) => (
          <button key={r.idx} type="button" data-train-day-next={r.idx} onClick={() => p.onDay(r.idx)}
            aria-label={[r.wd ? `${r.wd.long} ${r.wd.date}` : '', r.title, ...r.reads].filter(Boolean).join(', ')}
            style={{ position: 'relative', width: '100%', minHeight: 60, display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '6px 2px 6px 0', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: INK }}>
            <span aria-hidden="true" style={{ justifySelf: 'center', width: 40, height: 40, borderRadius: 99, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: t.PAPER, border: `1.5px ${r.rest ? 'dashed' : 'solid'} ${r.c}`, boxShadow: r.rest ? 'none' : glow(t, r.c, 12, 0.7), color: r.c, animation: `bstd-node 520ms cubic-bezier(.3,1.3,.5,1) ${420 + i * 150}ms both` }}>
              <span style={{ ...mono(t), fontSize: 7.5, letterSpacing: '0.08em', maxWidth: 34, overflow: 'hidden', whiteSpace: 'nowrap' }}>{r.wd ? r.wd.short : ''}</span>
              <span style={{ fontFamily: BS_GAUGE_FACE, fontSize: 13, fontWeight: 600, lineHeight: 1, color: INK, fontVariantNumeric: 'tabular-nums' }}>{r.wd ? r.wd.date : ''}</span>
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                {r.reads.map((x, k) => <span key={k} style={{ padding: '2px 7px', borderRadius: 6, border: `1px solid ${rgba(k === 0 ? INK : r.c, k === 0 ? 0.12 : 0.4)}`, background: rgba(INK, t.isLight ? 0.03 : 0.05), fontFamily: t.MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.04em', color: k === 0 ? rgba(INK, 0.7) : r.c, whiteSpace: 'nowrap' }}>{x}</span>)}
              </span>
            </span>
            <span aria-hidden="true" style={{ color: rgba(INK, 0.4), fontFamily: t.MONO, fontSize: 15 }}>›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// The page's links, as lit rows: each glyph in a glowing node of its own colour, the label, its tag.
function BstdLinks({ t, links, INK }) {
  return (
    <section data-train-day-links="" style={glass(t, INK, { margin: `12px ${gutterOf(t)}px 0`, padding: '4px 12px', ...rise(5) })}>
      {links.map((l, i) => {
        // A link in a hex colour glows in it; one in an ink tone (the plan, an open session) takes the ink.
        const c = /^#[0-9a-f]{6}$/i.test(String(l.color || '')) ? l.color : INK;
        return (
          <button key={i} type="button" data-train-day-link="" onClick={l.onOpen} aria-label={[l.label, l.tag].filter(Boolean).join(', ')}
            style={{ width: '100%', minHeight: 52, display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '4px 2px', border: 0, borderTop: i ? `1px solid ${rgba(INK, 0.08)}` : 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: INK }}>
            <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 99, boxSizing: 'border-box', display: 'grid', placeItems: 'center', background: rgba(c, 0.1), border: `1px solid ${rgba(c, 0.45)}`, boxShadow: glow(t, c, 10, 0.45), color: c, fontSize: 13, lineHeight: 1 }}>{l.glyph}</span>
            <span style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 9 }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</span>
              {l.tag ? <span style={{ flex: 'none', ...mono(t), fontSize: 7.5, letterSpacing: '0.1em', color: c, whiteSpace: 'nowrap' }}>{l.tag}</span> : null}
            </span>
            <span aria-hidden="true" style={{ color: c, fontSize: 14, fontWeight: 700 }}>→</span>
          </button>
        );
      })}
    </section>
  );
}
