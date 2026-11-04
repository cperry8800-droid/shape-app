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
// The deck's teal by paper: the bright one on a dark paper, its darker pair on a light one.
export const bsDeckTeal = (t) => (t && t.isLight ? '#0a8f87' : BS_DECK_TEAL);
export function bsProDeckHeat(role) { return role === 'nutritionist' ? '#d8b25a' : '#e0654b'; }

function rgbOf(c) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  const n = parseInt(hex, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

// ⚠ GLASS IN THE PAPER'S OWN COLOUR (owner, 2026-11-04: "i dont love the gray", "very similar color as the
// rest of page but glassy", "do D1", "apply that to all the boxes that had the grey coloring", then of the
// calendar on bone: "make sure the glassy look matches the print color"). A box is the page's own colour
// under a glass sheen, on either paper: a soft light-to-clear gradient, a lit top edge and a shadow, as
// the website's login card, with the paper's own ink for its words.
export function bsGlassFill(t) {
  const rgb = t.inkRGB || rgbOf(t.INK) || (t.isLight ? '20,18,15' : '242,237,228');
  // On a light paper the sheen is white light over the paper; on a dark one the paper's ink, faintly.
  return t.isLight ? {
    background: `linear-gradient(180deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.26) 55%, rgba(255,255,255,0.12) 100%), ${t.PAPER}`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 16px 34px -24px rgba(${rgb},0.45)`,
  } : {
    background: `linear-gradient(180deg, rgba(${rgb},0.075) 0%, rgba(${rgb},0.025) 55%, rgba(${rgb},0.015) 100%), ${t.PAPER}`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 18px 40px -24px rgba(0,0,0,0.9)',
  };
}
export const bsGlassBorder = (t) => `1px solid rgba(${t.inkRGB || rgbOf(t.INK) || '242,237,228'},0.12)`;
// The teal edge along a glass box's top, fading at both ends.
export function BSGlassEdge({ t } = {}) {
  const teal = bsDeckTeal(t);
  return <span aria-hidden="true" data-glass-edge="" style={{ position: 'absolute', top: -1, left: 28, right: 28, height: 1, background: `linear-gradient(90deg, transparent, ${teal} 30%, ${teal} 70%, transparent)`, opacity: 0.8, pointerEvents: 'none' }} />;
}

// The deck's theme: the paper's own, under glass (bsGlassFill). Its words are the paper's ink in measured
// tones, and its teal is the paper's (bsDeckTeal). It was the paper's ink as a dark band on a light paper.
export function bsProDeckTheme(t) {
  const fg = t.INK;
  const rgb = rgbOf(fg) || (t.isLight ? '20,18,15' : '245,240,230');
  const a = (x) => `rgba(${rgb},${x})`;
  return {
    ...t, PAPER: t.PAPER, PAPER_BG: t.PAPER, PAPER2: a(t.isLight ? 0.05 : 0.08), PAPER3: a(t.isLight ? 0.09 : 0.14),
    INK: fg, INK85: a(0.85), INK70: a(0.72), INK50: a(0.56), INK30: a(0.3), RULE: a(t.isLight ? 0.2 : 0.22), HAIR: a(t.isLight ? 0.1 : 0.12), inkRGB: rgb,
    TEAL: bsDeckTeal(t),
  };
}

// A mono eyebrow on the deck (the date, "＋ ADD", the published count).
export const bsDeckEyebrow = (color) => ({ fontFamily: BS_DECK_MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color, whiteSpace: 'nowrap' });

// The deck: a round, raised box in the paper's colour (bsRaised) inset from the page's edges, its teal edge
// along the top, the title in Saira light with the role's full stop, an aside on its baseline, and what the
// page puts in it. A step tighter (owner, 2026-11-04: "condense
// these boxes slightly"): 12px over and 14px under (16 and 18 before), the title 30px (34), the week's days
// 54px tall (64), the gauges 28px (32). `dense` is a step tighter again, for coach Home's Today (owner,
// 2026-11-04, of Today and Up next: "can we make these a little more condensed on home page with a tad more
// spacing [from] shape radio"): 10px over and 12px under, the title 26px, and 16px clear of what is above.
export function BSProDeck({ t, role, title, aside, tour, label, children, stopColor, dense = false }) {
  const d = bsProDeckTheme(t);
  // The full stop: the role's heat, or what the page asks (the member's calendar takes teal).
  const heat = stopColor || bsProDeckHeat(role);
  const Ctx = typeof window !== 'undefined' ? window.BSContext : null;
  const band = (
    <section data-pro-deck="" data-glass="" aria-label={label || (typeof title === 'string' ? title : undefined)} style={{ color: d.INK, padding: dense ? '8px 0 10px' : '12px 0 14px', margin: dense ? '16px 10px 0' : '6px 10px 0', ...bsRaised(t) }}>
      <BSGlassEdge t={t} />
      <div style={{ padding: `0 ${t.padX}px`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        {/* The title keeps its width (up to most of the row) and the aside wraps beside it, so a long line
            ("4 published · 40 clients on them") never cuts the title to "Pla…". */}
        <h1 data-tour={tour} style={{ margin: 0, flexShrink: 0, maxWidth: '72%', fontFamily: BS_GAUGE_FACE, fontSize: dense ? 23 : 30, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.05, color: d.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}<span aria-hidden="true" style={{ color: heat }}>.</span>
        </h1>
        {aside ? <div data-deck-aside="" style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', justifyContent: 'flex-end', textAlign: 'right' }}>{aside}</div> : null}
      </div>
      {children}
    </section>
  );
  return Ctx ? <Ctx.Provider value={d}>{band}</Ctx.Provider> : band;
}

// The week on the deck: seven day buttons, each with its sessions as up to three rising bars. The
// picked day is the cream tile with bars in the role's heat; today, when not picked, is ringed; days
// gone by sit back. `counts` is the number of bookings each weekday holds (0=Mon). `dense` (coach Home's
// Today): the days 46px tall, their bars 10px.
export function BSProDeckWeek({ t, role, dates, todayIdx, selDay, onSelectDay, counts, dayWord, label, monthLabel, onMonth, todayAria, dense = false }) {
  const d = bsProDeckTheme(t);
  const heat = bsProDeckHeat(role);
  return (
    <div data-deck-week="" role="group" aria-label={label} style={{ padding: `${dense ? 2 : 6}px ${t.padX - 6}px 0` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 6px' }}>
        <span style={bsDeckEyebrow(d.INK70)}>{label}</span>
        {onMonth && <button type="button" onClick={onMonth} style={{ minHeight: 40, padding: '0 2px', border: 0, background: 'transparent', cursor: 'pointer', ...bsDeckEyebrow(d.TEAL) }}>{monthLabel}</button>}
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
              style={{ minWidth: 0, height: dense ? 44 : 54, boxSizing: 'border-box', border: today && !on ? `1.5px solid ${d.RULE}` : 0, borderRadius: 9, background: on ? d.INK : 'transparent', color: on ? d.PAPER : d.INK, opacity: past && !on ? 0.6 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 0, cursor: 'pointer' }}>
              <span style={{ maxWidth: '100%', overflow: 'hidden', fontFamily: BS_DECK_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: on ? d.PAPER : d.INK70, whiteSpace: 'nowrap' }}>{dayWord(day, { weekday: 'short' })}</span>
              <span style={{ fontFamily: BS_GAUGE_FACE, fontSize: dense ? 15 : 17, fontWeight: 400, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{day.getDate()}</span>
              <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: dense ? 9 : 12 }}>
                {n === 0
                  ? <span style={{ width: 4, height: 2, borderRadius: 1, background: on ? `${d.PAPER}55` : d.RULE }} />
                  : (dense ? [3, 6, 9] : [5, 8, 12]).slice(0, n).map((h, k) => <span key={k} style={{ width: 4, height: h, borderRadius: 1, background: on ? heat : d.INK50 }} />)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The day as a segment bar: one segment a session (twelve at most, then in proportion), the done ones
// in teal, with what it reads on either side under it. `dense` (coach Home's Today): 8px over it, not 10.
export function BSProDeckSegments({ t, done, total, left, right, dense = false }) {
  const d = bsProDeckTheme(t);
  const segs = Math.min(12, Math.max(1, total));
  const filled = total > 12 ? Math.round((done / total) * 12) : done;
  return (
    <div data-deck-segments="" style={{ padding: `${dense ? 8 : 10}px ${t.padX}px 0` }}>
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: `repeat(${segs}, minmax(0, 1fr))`, gap: 3 }}>
        {Array.from({ length: segs }).map((_, i) => <span key={i} style={{ height: 6, borderRadius: 1, background: i < filled ? d.TEAL : d.RULE }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: dense ? 4 : 5 }}>
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

// ⚠ ROUND AND RAISED (owner, 2026-11-04: "round out this box. dont love the look of it. maybe it round and
// popping, almost 3d", then of the Today band over it: "this doesnt go together now"). Every box on these
// pages shares it: a 20px round in the paper's own colour, lit from the top (a light-to-clear sheen with a
// bright top edge and a darker lower lip), with a layered shadow that lifts it off the page. `glow` (the
// role's heat on Up next) warms its top-left corner.
export function bsRaised(t, glow = null) {
  const rgb = t.inkRGB || rgbOf(t.INK) || (t.isLight ? '20,18,15' : '242,237,228');
  const lit = t.isLight
    ? 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 60%, rgba(255,255,255,0.32) 100%)'
    : `linear-gradient(180deg, rgba(${rgb},0.12) 0%, rgba(${rgb},0.05) 60%, rgba(${rgb},0.025) 100%)`;
  return {
    position: 'relative', borderRadius: 20, overflow: 'hidden',
    background: `${glow ? `radial-gradient(120% 90% at 0% 0%, ${glow}30 0%, transparent 55%), ` : ''}${lit}, ${t.PAPER}`,
    border: `1px solid rgba(${rgb},${t.isLight ? 0.1 : 0.14})`,
    boxShadow: t.isLight
      ? `inset 0 1px 0 rgba(255,255,255,1), inset 0 -3px 0 rgba(${rgb},0.06), 0 2px 4px rgba(${rgb},0.08), 0 20px 36px -16px rgba(${rgb},0.38)`
      : 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -3px 0 rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.35), 0 22px 40px -14px rgba(0,0,0,0.85)',
  };
}
// The plate (Up next): raised, its corner warmed by the role's heat.
export const bsProPlate = (t, heat) => bsRaised(t, heat);

// A ledger: a 2px ink rule over hairline rows, each led by its number.
export const bsProLedgerTop = (t) => ({ borderTop: `2px solid ${t.INK}` });
export const bsProLedgerNo = (t) => ({ flexShrink: 0, width: 22, fontFamily: BS_DECK_MONO, fontSize: 10.5, fontWeight: 600, color: t.INK50, fontVariantNumeric: 'tabular-nums' });
export const bsProNo = (i) => String(i + 1).padStart(2, '0');

export { BS_CLEAN_SANS as BS_INSTRUMENT_SANS };
