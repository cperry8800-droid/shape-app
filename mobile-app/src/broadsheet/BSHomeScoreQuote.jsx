// THE SCORE LINE — under Home's masthead, member Home and coach Today (owner, 2026-11-09: "thinking of
// removing this ticker, what else can we have"; of the ideas drawn, the Shape Score as a quote, then a
// box beside its tier ring, then "actually i dont love the box", "it doesnt go well with shape radio",
// and of three ways to sit with Shape Radio, "B1": no box).
//
// One slim line on the page's own paper, so Shape Radio is the only box up top: a small ring in the
// tier's colour filled to how far the score is through its tier, the Shape Score (counted up the first
// time it shows in a session), the week's gain, and at the right the tier and how far to the next rung.
// The line opens the Score page.
//
// ⚠ ONLY A REAL FIGURE: signed out it is the preview's sample, signed in only the member's or coach's
// own score once read (services/scoreStanding.mjs's bsScoreQuoteShown); nothing draws while it reads.
// Self-contained: window globals read at call time, its own translator, never an import from the client.
import React from 'react';
import { BS_DECK_MONO } from './BSProInstrument.jsx';
import { BS_CLEAN_HEAD } from './bsCleanType.jsx';
import { bsScoreQuote, bsScoreQuoteShown } from '../services/scoreStanding.mjs';

function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = typeof window !== 'undefined' ? window.ShapeLocale?.subscribe?.(() => force((n) => n + 1)) : null;
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = typeof window !== 'undefined' ? window.ShapeI18n?.t?.(key, opts) : undefined;
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

const mono = (size, extra) => ({ fontFamily: BS_DECK_MONO, fontSize: size, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, ...extra });
const tierColor = (name) => (typeof window !== 'undefined' && typeof window.bsTierColor === 'function' ? window.bsTierColor(name) : '#d8a23a');
// A tier's colour as it reads on the paper: on a light paper a pale one (Peak's and Master's ice) is
// mixed toward the ink until it holds up as text and as the ring.
export function bsQuoteInk(hex, isLight) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m || !isLight) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  if (L <= 0.45) return hex;
  const ink = [26, 24, 20];
  const mix = c.map((v, i) => Math.round(v * 0.45 + ink[i] * 0.55));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
const fmt = (n, locale) => { try { return Number(n).toLocaleString(locale || undefined); } catch (e) { return String(n); } };

// A translated line with two figures styled apart: the catalog's words around them stay in their own
// order, whatever the language. Each figure goes in as a marker and comes back out as its element.
function rich(text, parts) {
  const out = [];
  String(text).split(/(\u0001|\u0002)/).forEach((s, i) => {
    if (s === '\u0001') out.push(<React.Fragment key={i}>{parts[0]}</React.Fragment>);
    else if (s === '\u0002') out.push(<React.Fragment key={i}>{parts[1]}</React.Fragment>);
    else if (s) out.push(s);
  });
  return out;
}

// The count up runs once a session, the first time the figure shows; a figure that changes after that
// (a habit ticked, a check-in) is printed as it is. The element always holds the real figure: the count
// writes React's own text node in place (never replacing it, so React's next update still lands) and
// ends on the latest figure, so a screen reader, a test or reduced motion read the number. It starts in a
// layout effect, before the first paint, so the finished figure never shows and then jumps back to zero
// (Codex P2 on #2649).
let bsQuoteCounted = false;
function useCountUp(ref, total, locale) {
  const latest = React.useRef(total);
  latest.current = total;
  const on = total > 0;
  React.useLayoutEffect(() => {
    const node = ref.current && ref.current.firstChild;
    if (!on || bsQuoteCounted || !node || node.nodeType !== 3) return undefined;
    bsQuoteCounted = true;
    let reduce = false;
    try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    if (reduce || typeof requestAnimationFrame !== 'function') return undefined;
    node.nodeValue = fmt(0, locale);
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 800);
      node.nodeValue = fmt(Math.round(latest.current * (1 - Math.pow(1 - p, 3))), locale);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); node.nodeValue = fmt(latest.current, locale); };
  }, [ref, on, locale]);
}

export function BSHomeScoreQuote({ score, tiers, signedIn, onOpen, locale }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const numRef = React.useRef(null);
  const shown = bsScoreQuoteShown(score, { signedIn });
  const q = shown ? bsScoreQuote(score, tiers) : null;
  useCountUp(numRef, q ? q.total : 0, locale);
  if (!q) return null;
  const rgb = t.inkRGB || (t.isLight ? '15,14,12' : '244,237,224');
  const ink50 = `rgba(${rgb},0.56)`;
  const green = t.isLight ? '#2f8a3a' : '#a3e09a';
  const rust = t.isLight ? '#b4452f' : '#e98a73';
  const color = bsQuoteInk(tierColor(q.tier), t.isLight);
  const { st } = q;
  // The ring: three quarters of a circle, open at the bottom, filled to the score's place in its tier.
  const R = 8.7;
  const C = 2 * Math.PI * R;
  const ARC = 0.75;
  const ahead = st.topTier
    ? tr('score:quote.topTier', { defaultValue: 'Top tier' })
    : rich(tr('score:quote.toNext', { defaultValue: '{toNext} to {next}', toNext: '\u0001', next: '\u0002' }), [
      <span key="n" style={{ color: t.INK }}>{fmt(st.toNext, locale)}</span>,
      <span key="t">{st.nextName}</span>,
    ]);
  const aria = tr('score:quote.aria', { defaultValue: 'Shape Score {total}, {tier}. Open your score.', total: fmt(q.total, locale), tier: q.tier });
  const up = q.weekN != null && q.weekN > 0;
  return (
    // A 44px tap that draws as a slim line: the negative margins give the space back to the masthead above
    // and Shape Radio's own margin below, so the line sits as tight as the ticker did.
    <button type="button" data-bs-score-quote="" onClick={onOpen} aria-label={aria} style={{
      display: 'flex', alignItems: 'center', gap: 9, width: '100%', minHeight: 44, margin: '-8px 0 -10px',
      padding: `0 ${t.padX}px`, border: 0, background: 'transparent', color: t.INK,
      textAlign: 'left', font: 'inherit', cursor: 'pointer', position: 'relative',
    }}>
      <svg aria-hidden data-bs-score-ring="" width="20" height="20" viewBox="0 0 20 20" style={{ display: 'block', flex: '0 0 auto', transform: 'rotate(135deg)', overflow: 'visible' }}>
        <circle cx="10" cy="10" r={R} fill="none" stroke={`rgba(${rgb},0.14)`} strokeWidth="2.6" strokeLinecap="round" strokeDasharray={`${C * ARC} ${C}`} />
        {st.frac > 0 ? <circle data-bs-score-arc="" cx="10" cy="10" r={R} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeDasharray={`${C * ARC * st.frac} ${C}`} style={{ filter: `drop-shadow(0 0 2px ${color})` }} /> : null}
      </svg>
      <span style={mono(8.5, { color: ink50, flex: '0 0 auto' })}>{tr('score:quote.label', { defaultValue: 'Score' })}</span>
      <span ref={numRef} data-bs-score-total="" style={{ flex: '0 0 auto', fontFamily: BS_CLEAN_HEAD, fontSize: 16, fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(q.total, locale)}</span>
      {q.weekN != null ? (
        <span data-bs-score-week="" style={mono(8.5, { flex: '0 0 auto', letterSpacing: '0.06em', color: up ? green : rust })}>{up ? '▲' : '▼'} {fmt(Math.abs(q.weekN), locale)}</span>
      ) : null}
      <span data-bs-score-next="" style={mono(8.5, { flex: '1 1 auto', minWidth: 0, textAlign: 'right', color: ink50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}>
        <span data-bs-score-tier="" style={{ color }}>{q.tier}</span> · {ahead}{st.topTier ? null : ' →'}
      </span>
    </button>
  );
}
