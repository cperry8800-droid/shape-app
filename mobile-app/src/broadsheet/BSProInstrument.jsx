import React from 'react';
import { BS_CLEAN_SANS } from './bsCleanType.jsx';
// ─── THE COACH PAGES' INSTRUMENT KIT ────────────────────────────────────────────────────────────
// Direction A, "Instrument" (owner, 2026-11-03, of the two redesigns drawn for coach Today, Clients and
// Programs: "A"). Each page opens on a DECK, an ink band carrying the page's gauges: Today's week as bar
// meters with the day's sessions as a segment bar, the roster's three figures, the programs' Nora line.
// Under it the page is paper again: a PLATE for what is live (Up next) and numbered LEDGERS.
//
// The deck is dark on every paper: the paper's own ink on a light paper, the raised paper on a dark
// one. It hands its theme to what it holds (BSContext, as BSCleanType does), so a child set in t.INK
// reads on it. Figures are set in Saira light; words keep the clean faces.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx).

export const BS_GAUGE_FACE = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";
export const BS_DECK_MONO = "'JetBrains Mono', ui-monospace, monospace";
// The deck's own accents: the deck is dark whatever the paper, so these are the bright ones.
export const BS_DECK_TEAL = '#34d6c5';
export function bsProDeckHeat(role) { return role === 'nutritionist' ? '#d8b25a' : '#e0654b'; }

function rgbOf(c) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  const n = parseInt(hex, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

// ⚠ GLASS ON A DARK PAPER (owner, 2026-11-04: "i dont love the gray", "very similar color as the rest of
// page but glassy", "do D1", "apply that to all the boxes that had the grey coloring"). A box that sat on
// the raised grey (PAPER2) is the page's own colour under a glass sheen: a soft light-to-clear gradient,
// a lit top edge and a deep shadow, as the website's login card. On a light paper nothing changes.
export function bsGlassFill(t) {
  const rgb = t.inkRGB || rgbOf(t.INK) || '242,237,228';
  return {
    background: `linear-gradient(180deg, rgba(${rgb},0.075) 0%, rgba(${rgb},0.025) 55%, rgba(${rgb},0.015) 100%), ${t.PAPER}`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 18px 40px -24px rgba(0,0,0,0.9)',
  };
}
export const bsGlassBorder = (t) => `1px solid rgba(${t.inkRGB || rgbOf(t.INK) || '242,237,228'},0.12)`;
// The teal edge along a glass box's top, fading at both ends.
export function BSGlassEdge() {
  return <span aria-hidden="true" data-glass-edge="" style={{ position: 'absolute', top: -1, left: 28, right: 28, height: 1, background: `linear-gradient(90deg, transparent, ${BS_DECK_TEAL} 30%, ${BS_DECK_TEAL} 70%, transparent)`, opacity: 0.8, pointerEvents: 'none' }} />;
}

// The deck's theme: dark on every paper. On a light paper it is that paper's ink with the paper as its
// words; on a dark paper the page's own colour, under glass (bsGlassFill), with the paper's own ink.
export function bsProDeckTheme(t) {
  const bg = t.isLight ? t.INK : t.PAPER;
  const fg = t.isLight ? t.PAPER : t.INK;
  const rgb = rgbOf(fg) || '245,240,230';
  const a = (x) => `rgba(${rgb},${x})`;
  return {
    ...t, isLight: false, PAPER: bg, PAPER_BG: bg, PAPER2: a(0.08), PAPER3: a(0.14),
    INK: fg, INK85: a(0.85), INK70: a(0.72), INK50: a(0.56), INK30: a(0.3), RULE: a(0.22), HAIR: a(0.12), inkRGB: rgb,
  };
}

// A mono eyebrow on the deck (the date, "＋ ADD", the published count).
export const bsDeckEyebrow = (color) => ({ fontFamily: BS_DECK_MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color, whiteSpace: 'nowrap' });

// The band: the title in Saira light with the role's full stop, an aside on its baseline, what the page
// puts in it, and a hairline from ink to teal along its foot. A step tighter (owner, 2026-11-04: "condense
// these boxes slightly"): 12px over and 14px under (16 and 18 before), the title 30px (34), the week's days
// 54px tall (64), the gauges 28px (32).
export function BSProDeck({ t, role, title, aside, tour, label, children, stopColor }) {
  const d = bsProDeckTheme(t);
  // The full stop: the role's heat, or what the page asks (the member's calendar takes teal).
  const heat = stopColor || bsProDeckHeat(role);
  const Ctx = typeof window !== 'undefined' ? window.BSContext : null;
  const band = (
    <section data-pro-deck="" data-glass={t.isLight ? undefined : ''} aria-label={label || (typeof title === 'string' ? title : undefined)} style={{ position: 'relative', background: d.PAPER, color: d.INK, padding: '12px 0 14px', marginTop: 4, ...(t.isLight ? null : { ...bsGlassFill(t), borderTop: bsGlassBorder(t), borderBottom: bsGlassBorder(t) }) }}>
      {t.isLight ? null : <BSGlassEdge />}
      <div style={{ padding: `0 ${t.padX}px`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        {/* The title keeps its width (up to most of the row) and the aside wraps beside it, so a long line
            ("4 published · 40 clients on them") never cuts the title to "Pla…". */}
        <h1 data-tour={tour} style={{ margin: 0, flexShrink: 0, maxWidth: '72%', fontFamily: BS_GAUGE_FACE, fontSize: 30, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.05, color: d.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}<span aria-hidden="true" style={{ color: heat }}>.</span>
        </h1>
        {aside ? <div data-deck-aside="" style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', justifyContent: 'flex-end', textAlign: 'right' }}>{aside}</div> : null}
      </div>
      {children}
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: `linear-gradient(90deg, ${d.INK}, ${BS_DECK_TEAL})`, opacity: 0.9 }} />
    </section>
  );
  return Ctx ? <Ctx.Provider value={d}>{band}</Ctx.Provider> : band;
}

// The week on the deck: seven day buttons, each with its sessions as up to three rising bars. The
// picked day is the cream tile with bars in the role's heat; today, when not picked, is ringed; days
// gone by sit back. `counts` is the number of bookings each weekday holds (0=Mon).
export function BSProDeckWeek({ t, role, dates, todayIdx, selDay, onSelectDay, counts, dayWord, label, monthLabel, onMonth, todayAria }) {
  const d = bsProDeckTheme(t);
  const heat = bsProDeckHeat(role);
  return (
    <div data-deck-week="" role="group" aria-label={label} style={{ padding: `6px ${t.padX - 6}px 0` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 6px' }}>
        <span style={bsDeckEyebrow(d.INK70)}>{label}</span>
        {onMonth && <button type="button" onClick={onMonth} style={{ minHeight: 40, padding: '0 2px', border: 0, background: 'transparent', cursor: 'pointer', ...bsDeckEyebrow(BS_DECK_TEAL) }}>{monthLabel}</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {dates.map((day, idx) => {
          const on = day.getDate() === selDay;
          const today = idx === todayIdx;
          const past = idx < todayIdx;
          // One bar for a light day (one or two), two for three or four, three for five and more.
          const c = Math.max(0, Number((counts && counts[idx]) || 0));
          const n = c === 0 ? 0 : c <= 2 ? 1 : c <= 4 ? 2 : 3;
          return (
            <button key={idx} type="button" aria-pressed={on} onClick={() => onSelectDay(day.getDate())}
              aria-label={`${dayWord(day, { weekday: 'long', month: 'long', day: 'numeric' })}${today ? `, ${todayAria}` : ''}`}
              style={{ minWidth: 0, height: 54, boxSizing: 'border-box', border: today && !on ? `1.5px solid ${d.RULE}` : 0, borderRadius: 9, background: on ? d.INK : 'transparent', color: on ? d.PAPER : d.INK, opacity: past && !on ? 0.6 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 0, cursor: 'pointer' }}>
              <span style={{ maxWidth: '100%', overflow: 'hidden', fontFamily: BS_DECK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: on ? d.PAPER : d.INK70, whiteSpace: 'nowrap' }}>{dayWord(day, { weekday: 'short' })}</span>
              <span style={{ fontFamily: BS_GAUGE_FACE, fontSize: 17, fontWeight: 400, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{day.getDate()}</span>
              <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 12 }}>
                {n === 0
                  ? <span style={{ width: 4, height: 2, borderRadius: 1, background: on ? `${d.PAPER}55` : d.RULE }} />
                  : [5, 8, 12].slice(0, n).map((h, k) => <span key={k} style={{ width: 4, height: h, borderRadius: 1, background: on ? heat : d.INK50 }} />)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The day as a segment bar: one segment a session (twelve at most, then in proportion), the done ones
// in teal, with what it reads on either side under it.
export function BSProDeckSegments({ t, done, total, left, right }) {
  const d = bsProDeckTheme(t);
  const segs = Math.min(12, Math.max(1, total));
  const filled = total > 12 ? Math.round((done / total) * 12) : done;
  return (
    <div data-deck-segments="" style={{ padding: `10px ${t.padX}px 0` }}>
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: `repeat(${segs}, minmax(0, 1fr))`, gap: 3 }}>
        {Array.from({ length: segs }).map((_, i) => <span key={i} style={{ height: 6, borderRadius: 1, background: i < filled ? BS_DECK_TEAL : d.RULE }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 5 }}>
        <span style={bsDeckEyebrow(d.INK70)}>{left}</span>
        {right ? <span style={bsDeckEyebrow(d.INK70)}>{right}</span> : null}
      </div>
    </div>
  );
}

// The roster's figures as gauges: a big Saira-light number over its mono label, ruled between.
export function BSProDeckGauges({ t, items }) {
  const d = bsProDeckTheme(t);
  return (
    <div data-deck-gauges="" style={{ margin: `10px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((g, i) => (
        <div key={g.key || i} data-gauge={g.key || ''} style={{ minWidth: 0, padding: i ? '2px 0 0 12px' : '2px 0 0', borderLeft: i ? `1px solid ${d.RULE}` : 0 }}>
          <span style={{ display: 'block', fontFamily: BS_GAUGE_FACE, fontSize: 28, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em', color: g.color || d.INK, fontVariantNumeric: 'tabular-nums' }}>{g.value}</span>
          <span style={{ display: 'block', marginTop: 3, ...bsDeckEyebrow(d.INK70), fontSize: 9, letterSpacing: '0.14em', whiteSpace: 'normal', lineHeight: 1.35 }}>{g.label}</span>
        </div>
      ))}
    </div>
  );
}

// A figure as a ten-tick meter (a tick a tenth): filled ticks in `hue`, the rest on the rule.
export function BSProMeter({ t, pct, hue, ticks = 10 }) {
  const on = Math.max(0, Math.min(ticks, Math.round((Number(pct) || 0) / (100 / ticks))));
  return (
    <span aria-hidden="true" data-meter={on} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 2, height: 16 }}>
      {Array.from({ length: ticks }).map((_, i) => <span key={i} style={{ width: 3, height: i < on ? 16 : 8, borderRadius: 1, background: i < on ? hue : t.RULE }} />)}
    </span>
  );
}

// The plate: a raised paper card with the role's rule down its left and its top-right corner cut.
export const bsProPlate = (t, heat) => ({ position: 'relative', ...(t.isLight ? { background: t.PAPER2 } : bsGlassFill(t)), borderLeft: `3px solid ${heat}`, clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)' });

// A ledger: a 2px ink rule over hairline rows, each led by its number.
export const bsProLedgerTop = (t) => ({ borderTop: `2px solid ${t.INK}` });
export const bsProLedgerNo = (t) => ({ flexShrink: 0, width: 22, fontFamily: BS_DECK_MONO, fontSize: 10.5, fontWeight: 600, color: t.INK50, fontVariantNumeric: 'tabular-nums' });
export const bsProNo = (i) => String(i + 1).padStart(2, '0');

export { BS_CLEAN_SANS as BS_INSTRUMENT_SANS };
