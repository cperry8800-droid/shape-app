import React from 'react';
// ─── B · THE DASHBOARD LOOK ──────────────────────────────────────────────────────────────────────
// Owner, 2026-10-25, of Your mornings, "we need to make this look less analog", and of Progress, "this
// needs to look more visually appealing also, very boring, monotone". Of three mocked directions, "I like
// B", and it follows the paper: on a dark paper it is the mock (dark cards, glowing rings, gradient bars),
// on a light one the same cards, rings and bars on white.
//
// A metric keeps one colour wherever it is drawn: teal for readiness and weight, violet for sleep, amber
// for energy and body fat, coral for how you woke up and resting heart rate, lime for hunger. Each has a
// MARK shade (bars, rings, lines) and a TEXT shade, darker than the mark on a light paper and lighter on
// a dark one, so words in a metric's colour read at 4.6:1 or better on its card, on a chip tinted in it
// and on a hero's wash, on every paper (tests/dash-look.test.mjs). The marks alone fall to 2.4.
//
// Window globals are read at call time and this module never imports the client module (the
// BSWallStory / BSLeaderboard pattern), so both Progress (in the client module) and Your mornings (its
// own module) can import it.

const LIGHT = {
  teal: ['#0a8f87', '#086d67'], violet: ['#6b5ff0', '#594fc7'], amber: ['#e08a1e', '#8d5713'],
  coral: ['#e0604a', '#a14535'], lime: ['#5cad2e', '#3c701e'],
};
const DARK = {
  teal: ['#34d6c5', '#54ddce'], violet: ['#8b7cff', '#b9b0ff'], amber: ['#ffb547', '#ffb64b'],
  coral: ['#ff6b5b', '#ff9d93'], lime: ['#9be15d', '#9be15d'],
};

// The look's colours on this paper: `mark.*` and `text.*` per metric, and the card's surface.
export function bsDash(t) {
  const L = !!t.isLight;
  const P = L ? LIGHT : DARK;
  const mark = {}; const text = {};
  for (const k of Object.keys(P)) { mark[k] = P[k][0]; text[k] = P[k][1]; }
  const ink = t.inkRGB || (L ? '15,14,12' : '245,240,230');
  return {
    light: L, mark, text,
    card: L ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.045)',
    border: L ? `rgba(${ink},0.07)` : 'rgba(255,255,255,0.07)',
    shadow: L ? `0 1px 2px rgba(${ink},0.05), 0 8px 24px rgba(${ink},0.06)` : 'none',
    track: L ? `rgba(${ink},0.07)` : 'rgba(255,255,255,0.08)',
    // A glow behind a lit mark: only on a dark paper, where the mock has it.
    glow: (c, r = 10) => (L ? 'none' : `drop-shadow(0 0 ${r}px ${c}66)`),
  };
}

// A colour at an alpha, from #rrggbb.
export function bsDashA(hex, a) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// The card every section sits on. `tint` lays a soft wash of a colour into its top-left corner (a hero).
export function BSDashCard({ children, tint = null, style = null, as = 'div', ...rest }) {
  const t = window.useBS();
  const D = bsDash(t);
  const wash = tint ? `radial-gradient(120% 140% at 0% 0%, ${bsDashA(tint, D.light ? 0.1 : 0.16)}, transparent 62%), ` : '';
  return React.createElement(as, {
    'data-bs-dash-card': '',
    ...rest,
    style: {
      background: `${wash}${D.card}`, border: `1px solid ${D.border}`, boxShadow: D.shadow,
      borderRadius: 20, padding: 16, boxSizing: 'border-box', minWidth: 0, ...style,
    },
  }, children);
}

// The small uppercase label over a figure, in its metric's text colour.
export function BSDashEyebrow({ color, children, style = null }) {
  const t = window.useBS();
  return <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: color || t.INK50, ...style }}>{children}</div>;
}

// A ring filled to `pct` (0..1) in a gradient from `from` to `to`, glowing on a dark paper, with its
// middle given. The ring is decoration for a figure printed inside it, so it is hidden from a reader.
export function BSDashRing({ pct, size = 88, stroke = 10, from, to = null, id, children = null }) {
  const t = window.useBS();
  const D = bsDash(t);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, Number(pct) || 0));
  const gid = `bs-dash-ring-${id}`;
  return (
    <div data-bs-dash-ring="" style={{ position: 'relative', width: size, height: size, flex: 'none', filter: D.glow(from, 12) }}>
      <svg aria-hidden="true" width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={from} /><stop offset="1" stopColor={to || from} /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={D.track} strokeWidth={stroke} />
        {p > 0 ? <circle data-bs-dash-ring-fill="" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * p).toFixed(2)} ${c.toFixed(2)}`} /> : null}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

// A small line of a series, for a figure's corner. Fewer than two points draws nothing.
export function BSDashSpark({ values, color, w = 46, h = 20 }) {
  const v = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (v.length < 2) return null;
  const lo = Math.min(...v), hi = Math.max(...v), span = (hi - lo) || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - ((x - lo) / span) * (h - 4)).toFixed(1)}`).join(' ');
  return (
    <svg data-bs-dash-spark="" aria-hidden="true" width={w} height={h} style={{ display: 'block', flex: 'none', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Pills to pick one of a few (7 days | 30 days, Overall | Training | Nutrition), kept small (owner,
// 2026-10-25: "make the overall, training, nutrition more condensed. Don't need those boxes so big"): a
// 34px capsule as wide as its words, the one shown a 28px ink pill. Each key is still a 44px target:
// the button runs 5px past the capsule above and below, and only its pill is drawn.
// `role` 'tab' makes them tabs (aria-selected), else toggle buttons (aria-pressed).
export function BSDashSegment({ options, value, onChange, label, role = null, style = null }) {
  const t = window.useBS();
  const D = bsDash(t);
  return (
    <div role={role === 'tab' ? 'tablist' : 'group'} aria-label={label} data-bs-dash-segment="" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 34, maxWidth: '100%', padding: '0 3px', boxSizing: 'border-box', borderRadius: 999, background: D.track, ...style }}>
      {options.map(([k, l]) => {
        const on = k === value;
        const state = role === 'tab' ? { role: 'tab', 'aria-selected': on } : { 'aria-pressed': on };
        return (
          <button key={k} type="button" {...state} onClick={() => onChange && onChange(k)} style={{ flex: 'none', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
            <span data-bs-dash-pill="" style={{
              display: 'flex', alignItems: 'center', height: 28, padding: '0 13px', borderRadius: 999,
              background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK70,
              fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              transition: 'background .18s ease, color .18s ease',
            }}>{l}</span>
          </button>
        );
      })}
    </div>
  );
}
