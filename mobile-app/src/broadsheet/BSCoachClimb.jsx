import React from 'react';
import { createPortal } from 'react-dom';
import { createMobileVideoComponents } from '../services/videoComponents.mjs';

const { ShapeVideoPlayer } = createMobileVideoComponents(React);

// ─── THE CLIMB: A COACH'S PAGE IN THE APP ────────────────────────────────────────────────────
// Owner, 2026-11-09 ("for coaches profile lets complete full buildout of 'the climb'", round one's
// layout from the 5 Nov review): one layout for every coach, trainer and nutritionist, dark
// throughout, in the look of the Coaches page. The coach's practice is drawn as a climb over their
// own wall photo: a route up to the summit, which holds their rating; the prism portrait; the name
// set huge; their headline stats as Saira plates; the wire of what is new; and the booking console
// docked above the tab capsule. Under the hero the page's sections are the route's camps, a spine
// down the left with a diamond at each, and the camps pin under the condensed masthead as a tab row
// that fills as you climb. A program opens as a dark sheet: its peaks (one a week), its plates, the
// climb by block, then Ask and Start.
//
// This module draws; it reads nothing. BSTrainerProfile.jsx reads the coach (listing, week, plans,
// posts, reviews, their profile doc), keeps every sheet and action it had (Work with, Book, Ask, the
// program and recipe sheets, Make it yours), and hands this page what to show: the figures, the
// camps that have something in them (a visitor's empty camp is left out; the coach's own page keeps
// it, with what to add), and the actions, which are the profile's own paths, so booking and buying
// run exactly as they did.
//
// Nothing here is invented. The summit holds the rating only with reviews; a pin on the route is a
// figure the page already has (years coaching, programs, recipes); a plate is a headline stat the
// coach picked, or whether they are taking clients as their listing says; a wire item is a real
// event (the next open time, a post, a program). Peaks are a drawing: one a week of the program's
// own length, rising to its top.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (useBS, BSMastBackSlot, BS_TABBAR_CSS …): this module is a
// static import of BSTrainerProfile.jsx, which is itself imported before the client module's body
// has put them on window.

function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}
const hexA = (hex, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
function sheetHost() {
  return typeof document !== 'undefined' ? (document.getElementById('bs-phone-surface') || document.body) : null;
}
export function bsClimbReduced() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}

// The Climb's own palette: dark throughout (the Coaches page's), whatever the app's paper. Text on
// BG holds 4.5:1 or better: MUTED is 7.4:1, DIM 4.9:1.
export const CLIMB = Object.freeze({
  BG: '#0a0e11', BG2: '#10161b', PANEL: '#121a20', LINE: 'rgba(226,236,240,0.13)', LINE2: 'rgba(226,236,240,0.22)',
  INK: '#eef3f5', MUTED: 'rgba(226,236,240,0.74)', DIM: 'rgba(226,236,240,0.58)',
  TEAL: '#34d6c5', RUST: '#c0533b', GOLD: '#d8a23a',
  DISPLAY: "'Anybody', 'Saira', system-ui, sans-serif",
  BODY: "'Schibsted Grotesk', -apple-system, system-ui, sans-serif",
  MONO: "'JetBrains Mono', ui-monospace, monospace",
  // The measured figures (rating, stats, prices, times), as the chat feed sets its figures: Saira 700,
  // tight, even-width numerals (owner, 9 Nov: "make it the attached from chat feed page").
  FIG: "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif",
});
// The coach's accent (Make it yours → Colours, profile_custom.look.accent, a key bsProfileLook let
// through) as the Climb draws with it: the dark row of coachProfileKit.mjs's BS_COACH_ACCENTS (the
// app's makePalette values, as bsCoachPalette paints them on a dark stock; tests/coach-climb.test.mjs
// holds the two to the same hexes), black flipped to white as on any dark paper. The role's own key
// (teal for a trainer, amber for a nutritionist, which the editor and the samples seed) is no pick: the
// Climb keeps its teal or gold. A pick that would not show on the Climb's ground (contrast under 1.6)
// is none either. It tints the drawing only (the route, the contours, the summit's ring, the pins, the
// spine and its diamonds, the full stops after the name and the camps' titles): text and controls keep
// the role's colour, so their contrast never rests on the coach's pick.
export const CLIMB_ACCENTS = Object.freeze({
  blue: '#5b8df9', amber: '#e3a544', rust: '#e06547', green: '#5fb16e', teal: '#34d6c5', violet: '#a78bfa', rose: '#f2749f', white: '#ffffff', black: '#ffffff',
});
const climbLum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** The contrast of two #rrggbb colours (WCAG). */
export function bsClimbContrast(a, b) {
  const x = climbLum(a), y = climbLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/**
 * The hex the Climb draws with for a look's accent key, or null: none set, not one of Shape's, the
 * role's own (teal for a trainer, amber for a nutritionist), or one that would not show on the Climb.
 */
export function bsClimbAccent(key, role = 'trainer') {
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(CLIMB_ACCENTS, key)) return null;
  if (key === (role === 'nutritionist' ? 'amber' : 'teal')) return null;
  const hex = CLIMB_ACCENTS[key];
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return bsClimbContrast(hex, '#0a0e11') >= 1.6 ? hex : null;
}
const numFace = (size, color = CLIMB.INK) => ({ fontFamily: CLIMB.FIG, fontWeight: 700, fontSize: size, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.035em' });
const mono = (size = 10, color = CLIMB.DIM) => ({ fontFamily: CLIMB.MONO, fontSize: size, letterSpacing: '0.14em', textTransform: 'uppercase', color });
const display = (size, weight = 800) => ({ fontFamily: CLIMB.DISPLAY, fontWeight: weight, fontSize: size, fontVariationSettings: "'wdth' 118", letterSpacing: '-0.01em' });
// The cut corner every plate and card has (top right), as on the Coaches page.
const cut = (px = 12) => `polygon(0 0, calc(100% - ${px}px) 0, 100% ${px}px, 100% 100%, 0 100%)`;
// A program's colour on the range: one each, in order (a drawing, never data).
export const CLIMB_PEAK_COLORS = ['#c0533b', '#d8a23a', '#8f6fe0', '#3fb98a', '#4f8fe0'];

// ── Pure drawing helpers (tests/coach-climb.test.mjs) ───────────────────────────────────────────
/**
 * One peak a week of a program's own length, rising to its top: [{ x, y }] for each peak (x and y in
 * 0..1, y down), the valleys between them lower than the peaks either side. `weeks` that isn't a
 * whole number from 1 to 52 draws nothing.
 */
export function bsClimbPeaks(weeks) {
  const n = weeks;
  if (!Number.isInteger(n) || n < 1 || n > 52) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const rise = n === 1 ? 1 : i / (n - 1);
    // A saw with a rise: each week higher than the last bar a small step back every other week.
    const h = 0.34 + 0.56 * rise - (i % 2 && i < n - 1 ? 0.05 : 0);
    out.push({ x: (i + 0.5) / n, y: 1 - Math.max(0.12, Math.min(0.94, h)) });
  }
  return out;
}
/** The polygon of a range of peaks over a w×h box: valleys between the peaks, closed along the floor. */
export function bsClimbPeaksPath(peaks, w, h) {
  if (!peaks.length) return '';
  const pts = [[0, h]];
  peaks.forEach((p, i) => {
    const valleyY = i === 0 ? h * 0.92 : Math.max(p.y, peaks[i - 1].y) * h + (h - Math.max(p.y, peaks[i - 1].y) * h) * 0.55;
    const step = w / peaks.length;
    pts.push([i * step, valleyY]);
    pts.push([p.x * w, p.y * h]);
  });
  pts.push([w, Math.min(h, peaks[peaks.length - 1].y * h + h * 0.08)]);
  pts.push([w, h]);
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
}
/**
 * The climb by block: the program's weeks as up to three spans of its own length, the first opening
 * on week one (whose days the preview shows) and the rest locked until it is bought. [{ from, to }].
 */
export function bsClimbBlocks(weeks) {
  const n = weeks;
  if (!Number.isInteger(n) || n < 1 || n > 52) return [];
  if (n === 1) return [{ from: 1, to: 1 }];
  const size = Math.ceil(n / Math.min(3, n));
  const out = [];
  for (let from = 1; from <= n; from += size) out.push({ from, to: Math.min(n, from + size - 1) });
  return out;
}

// ── The route and its terrain, drawn over the coach's photo ─────────────────────────────────────
// x and y in percent of the terrain's box. The summit is the route's highest point.
const ROUTE = [[-2, 100], [8, 93], [15, 95], [23, 86], [30, 88], [38, 79], [45, 75], [51, 66], [56, 63], [61, 56], [66, 53], [74, 45], [83, 37], [89, 45], [96, 51], [102, 55]];
const SUMMIT = ROUTE[12];
const PINS = [ROUTE[8], ROUTE[10]];
function Terrain({ accent, reduced }) {
  const beam = `climb-beam-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const route = ROUTE.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  // Contour lines: the same ridge, lower and softer each time.
  const contours = Array.from({ length: 9 }, (_, k) => {
    const off = 6 + k * 5.5;
    return ROUTE.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${Math.min(104, y + off + Math.sin((x + k * 11) / 9) * 2.2)}`).join(' ');
  });
  return (
    <svg aria-hidden="true" data-climb-terrain="" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        <linearGradient id={beam} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={accent} stopOpacity="0.32" /><stop offset="1" stopColor={accent} stopOpacity="0" /></linearGradient>
      </defs>
      {contours.map((d, k) => <path key={k} data-climb-contour="" d={d} fill="none" stroke={accent} strokeOpacity={0.26 - k * 0.022} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      <rect x={SUMMIT[0] - 1.6} y={SUMMIT[1]} width="3.2" height={100 - SUMMIT[1]} fill={`url(#${beam})`} />
      <path d={route} data-climb-route-glow="" fill="none" stroke={accent} strokeOpacity="0.35" strokeWidth="6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <path d={route} fill="none" stroke="#ffffff" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {reduced ? null : <path d={route} fill="none" stroke={accent} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="4 120" strokeLinecap="round"><animate attributeName="stroke-dashoffset" from="124" to="0" dur="5s" repeatCount="indefinite" /></path>}
    </svg>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────
// Props, all from BSTrainerProfile.jsx's TrainerPage:
//   who        { name, first, initials, avatar, onAvatarError, online, eyebrow, pronouns, quote, how, tier, verified, years, where }
//   wall       the wall photo's url or null; focus its focus point
//   mast       the masthead row and ← Back (the profile's own: BSMastBackSlot ahead of the logo)
//   onPickPhoto / onAddWall   the coach's own photo and wall (null for a visitor)
//   rating     { avg, count } with reviews, else null; ratingNew: true when read and there are none
//   milestones [{ key, label }] (at most two), plates [{ key, value, label, unit? }], status { open: bool } | null
//   wire       [{ key, text }], camps [{ key, label, eyebrow, title, sub, body }]
//   actions    the action row (Message · Work with · Follow, or Make it yours · Your hours)
//   lead       what follows the quote in the hero (sample note, socials, Score row, own-read error …)
//   console    { kind: 'visitor'|'self', introMin, nextOpen, closed, onBook, bookLabel, onMake, onHours, makeReady } | null
//   footer     the credential line
//   accent     the coach's own accent as a #rrggbb (bsClimbAccent), or null: the drawing only
export function BSCoachClimb({ nutri = false, isSelf = false, isPrivate = false, who, accent = null, detailTitle = null, wall = null, wallAlt = '', focus = 'center 50%', mast = null, onPickPhoto = null, onAddWall = null,
  rating = null, ratingNew = false, onRating = null, milestones = [], plates = [], platesEmpty = null, status = null, wire = [], camps = [], actions = null, lead = null, console: dock = null, footer = '', privateNote = null }) {
  const W = window;
  const tr = useShapeTr();
  const reduced = bsClimbReduced();
  const ACC = nutri ? CLIMB.GOLD : CLIMB.TEAL;
  // What the drawing takes: the coach's accent when it is a real #rrggbb, else the role's colour.
  const DRAW = /^#[0-9a-f]{6}$/i.test(String(accent || '')) ? accent : ACC;
  const pinnedTop = W.useBSPinnedMastTop ? W.useBSPinnedMastTop() : 0;
  const gutter = 18;
  const rootRef = React.useRef(null);
  // The condensed masthead reads ← and the name once the name has scrolled under it (BSPage); a page with
  // no Back (the coach app's own tab) keeps the plain bar.
  const titleRef = W.useBSDetailBar ? W.useBSDetailBar(detailTitle == null ? who.name : detailTitle, null) : null;

  // ── The camps: which one you are at, and how far up the route ──
  const headRefs = React.useRef({});
  const navRef = React.useRef(null);
  const [at, setAt] = React.useState({ key: camps[0] ? camps[0].key : null, fill: 0 });
  const campKey = camps.map((c) => c.key).join('|');
  const ROW_H = 46;
  React.useEffect(() => {
    const root = rootRef.current;
    const sc = root && root.closest ? root.closest('.bs-scroll') : null;
    if (!sc || !camps.length) return undefined;
    let raf = null;
    const read = () => {
      raf = null;
      const top = sc.getBoundingClientRect().top + pinnedTop + ROW_H + 64;
      let idx = -1, frac = 0;
      camps.forEach((c, i) => {
        const el = headRefs.current[c.key];
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= top) {
          idx = i;
          const next = camps[i + 1] && headRefs.current[camps[i + 1].key];
          const span = next ? next.getBoundingClientRect().top - r.top : Math.max(1, sc.scrollHeight - sc.scrollTop);
          frac = span > 0 ? Math.max(0, Math.min(1, (top - r.top) / span)) : 0;
        }
      });
      const key = idx >= 0 ? camps[idx].key : camps[0].key;
      const fill = idx < 0 ? 0 : Math.max(0, Math.min(1, (idx + frac) / Math.max(1, camps.length - 1)));
      setAt((a) => (a.key === key && Math.abs(a.fill - fill) < 0.004 ? a : { key, fill }));
    };
    const on = () => { if (raf == null) raf = (W.requestAnimationFrame || setTimeout)(read); };
    sc.addEventListener('scroll', on, { passive: true });
    read();
    return () => { sc.removeEventListener('scroll', on); if (raf != null && W.cancelAnimationFrame) W.cancelAnimationFrame(raf); };
  }, [campKey, pinnedTop]);
  // The row keeps the camp you are at in view.
  React.useEffect(() => {
    const nav = navRef.current;
    const b = nav && nav.querySelector(`[data-climb-camp-tab="${at.key}"]`);
    if (!nav || !b || !nav.clientWidth) return;
    const l = b.offsetLeft, r = l + b.offsetWidth;
    if (l < nav.scrollLeft + 8) nav.scrollLeft = Math.max(0, l - 24);
    else if (r > nav.scrollLeft + nav.clientWidth - 8) nav.scrollLeft = r - nav.clientWidth + 24;
  }, [at.key]);
  const goTo = (key) => {
    setAt((a) => ({ ...a, key }));
    const el = headRefs.current[key];
    const root = rootRef.current;
    const sc = root && root.closest ? root.closest('.bs-scroll') : null;
    if (!el || !sc) return;
    const y = sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - (pinnedTop + ROW_H + 6);
    try { sc.scrollTo({ top: Math.max(0, y), behavior: reduced ? 'auto' : 'smooth' }); } catch (e) { sc.scrollTop = Math.max(0, y); }
  };

  const nameSize = (() => {
    const longest = Math.max(4, ...String(who.name || '').split(/\s+/).map((w) => w.length));
    return Math.max(34, Math.min(60, Math.floor(340 / (longest * 0.74))));
  })();
  const ratingFig = rating ? (Math.round(Math.min(10, rating.avg) * 10) / 10).toFixed(1) : null;
  const tabbar = W.BS_TABBAR_CSS || '70px';

  return (
    <div ref={rootRef} data-trainer-profile="" data-climb="" data-climb-role={nutri ? 'nutritionist' : 'trainer'} style={{ position: 'relative', minHeight: '100%', background: CLIMB.BG, color: CLIMB.INK, fontFamily: CLIMB.BODY, WebkitFontSmoothing: 'antialiased' }}>
      {/* ── The terrain: the coach's photo, darkened, the contours and the route to the summit ── */}
      <section data-climb-hero="" style={{ position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 600, background: wall ? '#05080a' : `radial-gradient(120% 80% at 80% 30%, ${hexA(DRAW, 0.18)}, ${CLIMB.BG} 70%)` }}>
          {wall ? <img src={wall} alt={wallAlt} data-climb-wall="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus, filter: 'grayscale(1) brightness(0.42) contrast(1.05)' }} /> : null}
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(10,14,17,0.55) 0%, rgba(10,14,17,0.1) 30%, rgba(10,14,17,0.35) 62%, ${CLIMB.BG} 100%)` }} />
          {/* The route and its contours fade out above the name, so they never run through the name,
              the chips or the quote (review, 9 Nov: the line crossed them on a phone). */}
          <div style={{ position: 'absolute', inset: 0, WebkitMaskImage: 'linear-gradient(180deg, #000 0, #000 370px, transparent 425px)', maskImage: 'linear-gradient(180deg, #000 0, #000 370px, transparent 425px)' }}>
            <Terrain accent={DRAW} reduced={reduced} />
          </div>
        </div>
        <div style={{ position: 'relative' }}>{mast}</div>
        {onAddWall && !wall ? (
          <button type="button" data-climb-add-wall="" onClick={onAddWall} style={{ position: 'absolute', right: gutter, top: 'calc(var(--bs-mast-top, 12px) + 96px)', zIndex: 2, minHeight: 44, padding: '0 12px', border: `1px solid ${CLIMB.LINE2}`, borderRadius: 99, background: 'rgba(0,0,0,0.35)', color: CLIMB.INK, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>＋ {tr('profile:trainer.addWall', { defaultValue: 'Add a wall photo' })}</button>
        ) : null}
        {/* The summit and the pins stand on the route, in the terrain's own 600px box. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 600, pointerEvents: 'none' }}>
          {/* The summit: the rating, only with reviews to stand on. */}
          {rating ? (
            <button type="button" data-climb-summit="" onClick={onRating || undefined} aria-label={tr('profile:climb.ratingAria', { defaultValue: 'Rated {rating} out of 10 from {count, plural, one {# review} other {# reviews}}', rating: ratingFig, count: rating.count })}
              style={{ position: 'absolute', right: gutter - 4, top: SUMMIT[1] * 6 - 112, minWidth: 44, minHeight: 44, padding: 0, border: 0, background: 'transparent', color: CLIMB.INK, cursor: onRating ? 'pointer' : 'default', textAlign: 'right', pointerEvents: 'auto' }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '12px 14px 10px', background: 'rgba(10,14,17,0.78)', border: `1px solid ${hexA(DRAW, 0.55)}`, clipPath: cut(10), boxShadow: `0 0 24px ${hexA(DRAW, 0.25)}` }} data-climb-summit-ring="">
                <span data-climb-rating="" style={numFace(40)}>{ratingFig}</span>
                <span style={{ ...mono(12, CLIMB.MUTED), letterSpacing: 0 }}>/10</span>
              </span>
              <span style={{ display: 'block', marginTop: 6, ...mono(9, ACC) }}>{tr('profile:climb.rating', { defaultValue: 'Rating' })} · {tr('profile:climb.reviewCount', { defaultValue: '{count, plural, one {# review} other {# reviews}}', count: rating.count })}</span>
            </button>
          ) : ratingNew ? (
            <span data-climb-summit-new="" style={{ position: 'absolute', right: gutter, top: SUMMIT[1] * 6 - 44, padding: '6px 10px', background: 'rgba(10,14,17,0.7)', border: `1px solid ${CLIMB.LINE2}`, ...mono(9.5, CLIMB.MUTED) }}>{tr('profile:trainer.newCoach', { defaultValue: 'New on Shape' })}</span>
          ) : null}
          {/* Milestones on the way: figures the page already has. */}
          {milestones.slice(0, 2).map((m, i) => {
            const [x, y] = PINS[i];
            return (
              <span key={m.key} data-climb-pin={m.key} style={{ position: 'absolute', left: `${x}%`, top: y * 6, transform: 'translate(-6px, -6px)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" data-climb-pin-ring="" style={{ width: 12, height: 12, borderRadius: 99, border: `2px solid ${DRAW}`, background: CLIMB.BG, boxSizing: 'border-box' }} />
                <span style={{ padding: '3px 6px', background: 'rgba(10,14,17,0.72)', ...mono(8.5, CLIMB.INK), letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>{m.label}</span>
              </span>
            );
          })}
        </div>
        {/* The portrait's box: the prism, on the terrain's left. */}
        <div style={{ position: 'relative', height: 336, margin: '6px 0 0' }}>
          <Prism who={who} ACC={ACC} nutri={nutri} onPick={onPickPhoto} tr={tr} />
        </div>

        {/* Who: the eyebrow, the name set huge with Shape's full stop, the chips, their words */}
        <div style={{ position: 'relative', padding: `0 ${gutter}px` }}>
          {who.eyebrow ? <div data-climb-eyebrow="" style={{ ...mono(10, ACC), lineHeight: 1.5 }}>{who.eyebrow}</div> : null}
          <h1 ref={titleRef || undefined} data-climb-name="" style={{ margin: '4px 0 0', ...display(nameSize, 850), lineHeight: 0.92, color: '#ffffff', overflowWrap: 'anywhere', textShadow: '0 2px 18px rgba(0,0,0,0.5)' }}>
            {who.name}<span aria-hidden="true" data-climb-stop="" style={{ color: DRAW }}>.</span>
          </h1>
          {isPrivate ? null : (
            <div data-climb-chips="" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
              {who.verified ? <Chip on={ACC}><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5" fill={ACC} /><path d="M4.6 8.2l2.2 2.1 4.6-4.6" fill="none" stroke={CLIMB.BG} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>{tr('profile:climb.verified', { defaultValue: 'Verified by Shape' })}</Chip> : null}
              {who.tier ? <Chip><svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0.5L9.5 5 5 9.5 0.5 5Z" fill={CLIMB.GOLD} /></svg>{who.tier}</Chip> : null}
              {who.how ? <Chip>{who.how}</Chip> : null}
              {who.pronouns ? <Chip>{who.pronouns}</Chip> : null}
            </div>
          )}
          {privateNote}
          {!isPrivate && who.quote ? <p data-climb-quote="" style={{ margin: '14px 0 0', fontSize: 16.5, lineHeight: 1.5, color: CLIMB.INK, overflowWrap: 'anywhere' }}>“{who.quote}”</p> : null}
          {lead}
          {/* The plates: the coach's headline stats in Saira, then whether they take clients */}
          {!isPrivate && (plates.length || status || platesEmpty) ? (
            <div data-climb-plates="" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {plates.length ? (
                <div data-coach-stats="" role="list" aria-label={tr('profile:mine.statsTitle', { defaultValue: 'Headline stats' })} style={{ display: 'contents' }}>
                  {plates.map((s) => (
                    <div key={s.key} role="listitem" data-coach-stat={s.key} style={plateBox()}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><span style={numFace(30)}>{s.value}</span>{s.unit ? <span style={{ ...mono(10, CLIMB.MUTED), letterSpacing: 0 }}>{s.unit}</span> : null}</div>
                      <div style={{ marginTop: 8, ...mono(9, CLIMB.MUTED), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
                      <Ticks c={CLIMB.LINE2} />
                    </div>
                  ))}
                </div>
              ) : null}
              {/* Whether they take clients, as their listing says: a plate of its own, not a stat they picked. */}
              {status ? (
                <div data-climb-open={status.open ? 'open' : 'full'} style={{ ...plateBox(), border: `1px solid ${status.open ? hexA(ACC, 0.6) : CLIMB.LINE}` }}>
                  <div aria-hidden="true" style={numFace(30, status.open ? ACC : CLIMB.MUTED)}>{status.open ? '✓' : '×'}</div>
                  <div style={{ marginTop: 8, ...mono(9, status.open ? ACC : CLIMB.MUTED), whiteSpace: 'normal', lineHeight: 1.35 }}>{status.open ? tr('profile:climb.taking', { defaultValue: 'Taking new clients' }) : tr('profile:climb.full', { defaultValue: 'Full · waiting list' })}</div>
                  <Ticks c={status.open ? hexA(ACC, 0.5) : CLIMB.LINE2} />
                </div>
              ) : null}
              {platesEmpty ? <div data-climb-plates-empty="" style={{ ...plateBox(), gridColumn: plates.length || status ? 'auto' : '1 / -1', borderStyle: 'dashed' }}>{platesEmpty}</div> : null}
            </div>
          ) : null}
          {actions}
        </div>

        {/* The wire: what is new, from real events only */}
        {!isPrivate && wire.length ? <Wire items={wire} ACC={ACC} reduced={reduced} tr={tr} /> : null}
      </section>

      {/* ── The camps ── */}
      {camps.length ? (
        <>
          {camps.length > 1 ? (
            <nav ref={navRef} data-profile-tabs="" data-climb-camps="" aria-label={tr('profile:climb.campsAria', { defaultValue: 'Camps on the route' })} className="bs-hide-scroll"
              style={{ position: 'sticky', top: pinnedTop, zIndex: 5, marginTop: 18, background: 'rgba(10,14,17,0.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: `1px solid ${CLIMB.LINE}`, overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
              <div style={{ position: 'relative', display: 'flex', minWidth: 'max-content', padding: '0 8px' }}>
                {camps.map((c) => {
                  const on = c.key === at.key;
                  return (
                    <button key={c.key} type="button" data-profile-tab={c.key} data-climb-camp-tab={c.key} aria-current={on ? 'location' : undefined} onClick={() => goTo(c.key)}
                      style={{ flex: 'none', minHeight: ROW_H, padding: '0 10px', border: 0, background: 'transparent', color: on ? ACC : CLIMB.MUTED, ...mono(10.5, on ? ACC : CLIMB.MUTED), fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>{c.label}</button>
                  );
                })}
                {/* The route under the row, filled as far as you have climbed, a diamond at each camp */}
                <span aria-hidden="true" style={{ position: 'absolute', left: 18, right: 18, bottom: 5, height: 1, backgroundImage: `linear-gradient(90deg, ${CLIMB.LINE2} 50%, transparent 50%)`, backgroundSize: '6px 1px' }} />
                <span aria-hidden="true" data-climb-fill="" style={{ position: 'absolute', left: 18, bottom: 5, height: 1, width: `calc((100% - 36px) * ${at.fill.toFixed(3)})`, background: DRAW, transition: reduced ? 'none' : 'width 160ms linear' }} />
              </div>
            </nav>
          ) : null}
          <div data-climb-route="" style={{ position: 'relative', padding: '6px 0 0' }}>
            <span aria-hidden="true" data-climb-spine="" style={{ position: 'absolute', left: 21, top: 0, bottom: 0, width: 1.5, background: `linear-gradient(180deg, ${DRAW}, ${hexA(DRAW, 0.25)})` }} />
            {camps.map((c, i) => (
              <section key={c.key} data-climb-camp={c.key} aria-labelledby={`climb-camp-${c.key}`} style={{ position: 'relative', paddingTop: i ? 34 : 22 }}>
                <div ref={(el) => { headRefs.current[c.key] = el; }} style={{ position: 'relative', padding: `0 ${gutter}px 0 44px` }}>
                  <span aria-hidden="true" data-climb-diamond="" style={{ position: 'absolute', left: 14, top: 2, width: 15, height: 15, transform: 'rotate(45deg)', border: `1.5px solid ${DRAW}`, background: c.key === at.key ? DRAW : CLIMB.BG, boxShadow: `0 0 12px ${hexA(DRAW, 0.45)}` }} />
                  <div style={mono(9.5, ACC)}>{c.eyebrow}</div>
                  <h2 id={`climb-camp-${c.key}`} style={{ margin: '6px 0 0', ...display(30, 820), lineHeight: 1.02, color: CLIMB.INK }}>{c.title}<span aria-hidden="true" data-climb-camp-stop="" style={{ color: DRAW }}>.</span></h2>
                  {c.sub ? <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.45, color: CLIMB.MUTED }}>{c.sub}</p> : null}
                </div>
                <div data-climb-camp-body={c.key} style={{ paddingLeft: c.full ? 30 : 30 }}>{c.body}</div>
              </section>
            ))}
          </div>
        </>
      ) : null}

      <footer style={{ padding: `22px ${gutter}px 30px 44px`, ...mono(9, CLIMB.DIM) }}>{footer}</footer>

      {/* ── The booking console, docked above the tab capsule ── */}
      {dock ? <Console dock={dock} who={who} ACC={ACC} nutri={nutri} tr={tr} tabbar={tabbar} /> : null}
    </div>
  );
}
const plateBox = () => ({ position: 'relative', minWidth: 0, padding: '14px 12px 16px', background: 'rgba(14,20,25,0.86)', border: `1px solid ${CLIMB.LINE}`, clipPath: cut(12), boxSizing: 'border-box' });
function Ticks({ c }) {
  return <span aria-hidden="true" style={{ position: 'absolute', left: 12, right: 12, bottom: 7, height: 4, backgroundImage: `repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px 4px)` }} />;
}
function Chip({ children, on = null }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 11px', borderRadius: 8, border: `1px solid ${on ? hexA(on, 0.65) : CLIMB.LINE2}`, background: on ? hexA(on, 0.12) : 'rgba(255,255,255,0.04)', color: on || CLIMB.INK, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</span>
  );
}

// The prism portrait: their photo cut on two corners, in a frame from the accent to the trainer's rust.
function Prism({ who, ACC, nutri, onPick, tr }) {
  const shape = 'polygon(0 0, 80% 0, 100% 13%, 100% 100%, 16% 100%, 0 91%)';
  const inner = (
    <>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, clipPath: shape, background: `linear-gradient(160deg, ${ACC}, ${nutri ? '#a07a2e' : CLIMB.RUST})` }} />
      <span style={{ position: 'absolute', inset: 2, clipPath: shape, background: '#1a2228', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
        {who.avatar ? <img src={who.avatar} alt="" onError={who.onAvatarError} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 22%' }} />
          : <span data-initials="" style={{ ...display(44, 800), color: CLIMB.INK }}>{who.initials}</span>}
        {who.where || who.years ? (
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 12px 12px 18px', background: 'linear-gradient(180deg, transparent, rgba(5,8,10,0.86))', textAlign: 'left' }}>
            {who.where ? <span style={{ display: 'block', ...mono(8.5, ACC) }}>{tr('profile:climb.baseCamp', { defaultValue: 'Base camp' })} · {who.where}</span> : null}
            {who.years ? <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, fontWeight: 600, color: CLIMB.INK }}>{tr('profile:about.years', { defaultValue: '{count, plural, one {Coaching for # year} other {Coaching for # years}}', count: who.years })}</span> : null}
          </span>
        ) : null}
      </span>
      {who.online ? <span aria-label={tr('profile:trainer.online', { defaultValue: 'Online now' })} style={{ position: 'absolute', right: 6, bottom: 8, width: 16, height: 16, borderRadius: 99, background: CLIMB.TEAL, border: `3px solid ${CLIMB.BG}`, boxSizing: 'border-box' }} /> : null}
    </>
  );
  const box = { position: 'absolute', left: 18, top: 0, width: 'min(44%, 168px)', height: 214, padding: 0, border: 0, background: 'transparent', display: 'block' };
  return onPick
    ? <button type="button" data-climb-prism="" onClick={onPick} aria-label={tr('profile:trainer.changePhoto', { defaultValue: 'Change your photo' })} style={{ ...box, cursor: 'pointer' }}>{inner}</button>
    : <div data-climb-prism="" role="img" aria-label={who.name} style={box}>{inner}</div>;
}

// The wire: a ticker of what is new. It runs only when motion is allowed; otherwise it is a row to swipe.
function Wire({ items, ACC, reduced, tr }) {
  const run = !reduced && items.length > 1;
  const row = (dup) => items.map((w) => (
    <span key={(dup ? 'b' : 'a') + w.key} data-climb-wire-item={dup ? undefined : w.key} aria-hidden={dup || undefined} style={{ flex: 'none', paddingRight: 28, fontSize: 13.5, color: CLIMB.INK, whiteSpace: 'nowrap' }}>{w.text}</span>
  ));
  return (
    <div data-climb-wire="" style={{ marginTop: 18, borderTop: `1px solid ${CLIMB.LINE}`, borderBottom: `1px solid ${CLIMB.LINE}`, background: 'rgba(10,14,17,0.82)', display: 'flex', alignItems: 'center', minHeight: 44 }}>
      <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px 0 18px', ...mono(9.5, ACC) }}>
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 0.5L7.5 4 4 7.5 0.5 4Z" fill={ACC} /></svg>{tr('profile:climb.wire', { defaultValue: 'The wire' })}
      </span>
      <div className="bs-hide-scroll" style={{ flex: 1, minWidth: 0, overflowX: run ? 'hidden' : 'auto', maskImage: 'linear-gradient(90deg, transparent, #000 16px, #000 calc(100% - 24px), transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 16px, #000 calc(100% - 24px), transparent)' }}>
        <div style={{ display: 'flex', width: 'max-content', animation: run ? `bsClimbWire ${Math.max(18, items.length * 7)}s linear infinite` : 'none' }}>
          {row(false)}{run ? row(true) : null}
        </div>
      </div>
      {run ? <style>{'@keyframes bsClimbWire { from { transform: translateX(0); } to { transform: translateX(-50%); } }'}</style> : null}
    </div>
  );
}

// The console: the intro and the next open time, Book; on the coach's own page, their own two doors.
function Console({ dock, who, ACC, nutri, tr, tabbar }) {
  const cta = nutri ? CLIMB.GOLD : CLIMB.RUST;
  const onCta = nutri ? '#14100a' : '#ffffff';
  return (
    <div data-climb-console="" style={{ position: 'sticky', bottom: `calc(${tabbar} + 8px)`, zIndex: 6, margin: '0 10px', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 14px', borderRadius: 16, background: 'rgba(14,20,25,0.94)', border: `1px solid ${hexA(ACC, 0.35)}`, boxShadow: '0 14px 34px rgba(0,0,0,0.5)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
        {dock.kind === 'self' ? (
          <>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.35, color: CLIMB.MUTED }}>{tr('profile:climb.selfConsole', { defaultValue: 'Members book you from here.' })}</span>
            <button type="button" data-climb-hours="" onClick={dock.onHours} style={{ flex: 'none', minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${CLIMB.LINE2}`, background: 'transparent', color: CLIMB.INK, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{tr('profile:trainer.yourHours', { defaultValue: 'Your hours' })}</button>
            <button type="button" data-climb-make="" onClick={dock.onMake} disabled={!dock.makeReady} style={{ flex: 'none', minHeight: 44, padding: '0 14px', borderRadius: 10, border: 0, background: cta, color: onCta, fontSize: 14, fontWeight: 700, cursor: dock.makeReady ? 'pointer' : 'default', opacity: dock.makeReady ? 1 : 0.55 }}>{tr('profile:trainer.makeItYours', { defaultValue: 'Make it yours' })}</button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: CLIMB.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('profile:climb.freeIntro', { defaultValue: 'Free intro · {minutes} min', minutes: dock.introMin || 15 })}</span>
              {dock.nextOpen ? (
                <span data-climb-next="" style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, fontSize: 12.5, color: ACC, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <span>{tr('profile:climb.nextOpen', { defaultValue: 'Next open' })}</span><span style={{ ...numFace(13.5, CLIMB.INK), fontWeight: 700 }}>{dock.nextOpen}</span>
                </span>
              ) : dock.note ? <span style={{ fontSize: 12.5, color: CLIMB.MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dock.note}</span> : null}
            </span>
            {dock.onBook ? <button type="button" data-climb-book="" onClick={dock.onBook} style={{ flex: 'none', minHeight: 46, padding: '0 16px', borderRadius: 11, border: 0, background: cta, color: onCta, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: `0 6px 18px ${hexA(cta, 0.35)}` }}>{dock.bookLabel}</button> : null}
          </>
        )}
      </div>
    </div>
  );
}

// ── The range: a program a card, its peaks over its photo ──────────────────────────────────────
// programs [{ key, id, name, price, paid, weeks, perWeek, forSaid, poster, pr }]; onOpen(pr); onStart(pr)
// (only where Start buys: a paid program on a visitor's page, never a sample's).
export function BSClimbRange({ programs, nutri = false, onOpen, onStart = null, isSelf = false, openLabel = null }) {
  const tr = useShapeTr();
  return (
    <div data-climb-range="" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 18px 0 14px' }}>
      {programs.map((p, i) => {
        const color = CLIMB_PEAK_COLORS[(i + (nutri ? 1 : 0)) % CLIMB_PEAK_COLORS.length];
        const facts = [
          p.weeks ? tr('profile:trainer.programWeeks', { defaultValue: '{count, plural, one {# week} other {# weeks}}', count: p.weeks }) : null,
          p.perWeek ? tr('profile:trainer.programDays', { defaultValue: '{count, plural, one {# day a week} other {# days a week}}', count: p.perWeek }) : null,
        ].filter(Boolean).join(' · ');
        return (
          <article key={p.key} data-program="" data-climb-program={p.id} style={{ position: 'relative', background: CLIMB.PANEL, borderLeft: `3px solid ${color}`, clipPath: cut(14), overflow: 'hidden' }}>
            <div style={{ position: 'relative', height: 132, background: p.poster ? '#000' : `linear-gradient(180deg, #17212a, ${CLIMB.PANEL})` }}>
              {p.poster ? <img src={p.poster} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.55) saturate(0.8)' }} /> : null}
              <Peaks weeks={p.weeks} color={color} />
              {p.forSaid ? <span data-studio-for="" style={{ position: 'absolute', left: 10, top: 10, padding: '4px 8px', borderRadius: 5, background: 'rgba(10,14,17,0.8)', border: `1px solid ${hexA(color, 0.7)}`, ...mono(8.5, CLIMB.INK) }}>{p.forSaid}</span> : null}
              {p.weeks ? <span style={{ position: 'absolute', right: 10, top: 10, padding: '5px 8px', background: 'rgba(10,14,17,0.8)', display: 'inline-flex', alignItems: 'baseline', gap: 5 }}><span style={numFace(16)}>{p.weeks}</span><span style={mono(8, CLIMB.MUTED)}>{tr('profile:climb.weeks', { defaultValue: 'Weeks' })}</span></span> : null}
            </div>
            <div style={{ padding: '12px 14px 14px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 12, alignItems: 'end' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', ...display(19, 800), lineHeight: 1.1, color: CLIMB.INK, overflowWrap: 'anywhere' }}>{p.name}</span>
                {facts ? <span style={{ display: 'block', marginTop: 4, fontSize: 13, color: CLIMB.MUTED }}>{facts}</span> : null}
                {p.desc ? <span data-studio-desc="" style={{ display: '-webkit-box', marginTop: 6, fontSize: 13.5, lineHeight: 1.4, color: CLIMB.INK, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.desc}</span> : null}
              </span>
              {p.price ? <span data-climb-price="" style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.35)', ...numFace(17) }}>{p.price}</span> : <span />}
            </div>
            {/* The card opens the program; Start sits beside it, never inside the same button. */}
            <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px' }}>
              <button type="button" data-program-open="" onClick={() => onOpen(p.pr)} style={{ flex: 1, minHeight: 44, borderRadius: 9, border: `1px solid ${CLIMB.LINE2}`, background: 'transparent', color: CLIMB.INK, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{openLabel || tr('profile:climb.seeClimb', { defaultValue: 'See the climb' })}</button>
              {!isSelf && onStart && p.paid ? <button type="button" data-climb-start="" onClick={() => onStart(p.pr)} style={{ flex: 'none', minHeight: 44, padding: '0 16px', borderRadius: 9, border: 0, background: nutri ? CLIMB.GOLD : CLIMB.RUST, color: nutri ? '#14100a' : '#ffffff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{tr('profile:climb.start', { defaultValue: 'Start' })}</button> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
function Peaks({ weeks, color, height = 132 }) {
  const peaks = bsClimbPeaks(weeks);
  if (!peaks.length) return null;
  const w = 300, h = 100;
  const d = bsClimbPeaksPath(peaks, w, h);
  const top = peaks.map((p) => `${(p.x * w).toFixed(1)},${(p.y * h).toFixed(1)}`).join(' ');
  const last = peaks[peaks.length - 1];
  return (
    <svg aria-hidden="true" data-climb-peaks={peaks.length} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: Math.round(height * 0.78) }}>
      <path d={d} fill={color} fillOpacity="0.82" />
      <polyline points={top} fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.4" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x * w} cy={last.y * h} r="3" fill="#ffffff" />
    </svg>
  );
}

// ── The program sheet: dark, its peaks, its plates, the climb by block, then Ask and Start ─────────
// pr: the program (bsCoachPrograms); item: its studio row (the coach's line, who it is for); days: the
// first week's days with their moves. onAsk: the profile's Message (or Work with when it has none);
// onBuy: the profile's own checkout (ShapeCoachPlans.buy), only for a paid program; onWork: Work with.
export function BSClimbProgramSheet({ pr, nutri = false, item = null, days = [], first, isSelf = false, color = null, onClose, onBuy, onWork, onAsk = null }) {
  const tr = useShapeTr();
  const ACC = nutri ? CLIMB.GOLD : CLIMB.TEAL;
  const cta = nutri ? CLIMB.GOLD : CLIMB.RUST;
  const tint = color || cta;
  const p = pr.preview || { units: [], kind: null };
  const units = Array.isArray(p.units) ? p.units.filter((u) => u && !u.locked && !u.rest) : [];
  const desc = (item && item.desc) || p.note || '';
  const forSaid = item && item.forSaid ? item.forSaid : '';
  const sessions = pr.weeks && pr.perWeek ? pr.weeks * pr.perWeek : null;
  const blocks = bsClimbBlocks(pr.weeks);
  const [open, setOpen] = React.useState(() => (days[0] ? days[0].key : null));
  const facts = [
    pr.weeks ? tr('profile:trainer.programWeeks', { defaultValue: '{count, plural, one {# week} other {# weeks}}', count: pr.weeks }) : null,
    pr.perWeek ? tr('profile:trainer.programDays', { defaultValue: '{count, plural, one {# day a week} other {# days a week}}', count: pr.perWeek }) : null,
  ].filter(Boolean).join(' · ');
  const plates = [
    pr.weeks ? ['weeks', pr.weeks, tr('profile:climb.weeks', { defaultValue: 'Weeks' })] : null,
    pr.perWeek ? ['perWeek', pr.perWeek, tr('profile:climb.daysAWeek', { defaultValue: 'Days a week' })] : null,
    sessions ? ['sessions', sessions, tr('profile:climb.sessions', { defaultValue: 'Sessions' })] : null,
  ].filter(Boolean);
  const host = sheetHost();
  const el = (
    <div role="dialog" aria-label={pr.name} data-program-sheet="" data-climb-sheet="" style={{ position: 'absolute', inset: 0, zIndex: 230, background: CLIMB.BG, color: CLIMB.INK, overflowY: 'auto', overflowX: 'hidden', fontFamily: CLIMB.BODY, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ position: 'relative', height: 'calc(210px + env(safe-area-inset-top))', background: pr.poster ? '#000' : `linear-gradient(180deg, #17212a, ${CLIMB.BG})`, overflow: 'hidden' }}>
        {pr.poster ? <img src={pr.poster} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.6) saturate(0.85)' }} /> : null}
        <Peaks weeks={pr.weeks} color={tint} height={210} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: 'calc(10px + env(safe-area-inset-top)) 8px 0 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ padding: '4px 8px', background: 'rgba(10,14,17,0.8)', border: `1px solid ${hexA(tint, 0.7)}`, ...mono(9, CLIMB.INK) }}>{[tr('profile:trainer.program', { defaultValue: 'Program' }), forSaid].filter(Boolean).join(' · ')}</span>
          <button type="button" onClick={onClose} aria-label={tr('profile:trainer.close', { defaultValue: 'Close' })} style={{ width: 44, height: 44, border: 0, borderRadius: 99, background: 'rgba(10,14,17,0.6)', color: CLIMB.INK, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
      </div>
      <div style={{ padding: '16px 18px 0' }}>
        <h2 style={{ margin: 0, ...display(30, 830), lineHeight: 1.04 }}>{pr.name}<span style={{ color: ACC }}>.</span></h2>
        {facts ? <p style={{ margin: '6px 0 0', fontSize: 14.5, color: CLIMB.MUTED }}>{facts}</p> : null}
        {desc ? <p data-program-desc="" style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.5 }}>{desc}</p> : null}
        {forSaid ? <p data-program-for="" style={{ margin: '8px 0 0', display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 14, fontWeight: 600 }}><span style={mono(9.5, CLIMB.DIM)}>{tr('profile:work.forLabel', { defaultValue: 'For' })}</span>{forSaid}</p> : null}
        {plates.length ? (
          <div data-climb-sheet-plates="" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: `repeat(${plates.length}, minmax(0, 1fr))`, gap: 8 }}>
            {plates.map(([k, v, label], i) => (
              <div key={k} data-climb-sheet-plate={k} style={{ ...plateBox(), border: `1px solid ${i === plates.length - 1 ? hexA(ACC, 0.55) : CLIMB.LINE}` }}>
                <div style={numFace(26, i === plates.length - 1 ? ACC : CLIMB.INK)}>{v}</div>
                <div style={{ marginTop: 8, ...mono(8.5, CLIMB.MUTED), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                <Ticks c={CLIMB.LINE2} />
              </div>
            ))}
          </div>
        ) : null}
        {pr.video ? <div data-program-video="" style={{ marginTop: 16 }}><ShapeVideoPlayer value={pr.video} title={pr.name} expanded /></div> : null}
      </div>

      {/* The climb by block: week one's days (the preview's), then the rest of the route, locked */}
      {days.length || units.length ? (
        <div data-program-days="" style={{ margin: '20px 18px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={mono(9.5, CLIMB.DIM)}>{tr('profile:climb.byBlock', { defaultValue: 'The climb by block' })}</span>
            {days.length ? <span style={{ fontSize: 12.5, color: CLIMB.DIM }}>{tr('profile:work.tapDay', { defaultValue: 'Tap a day for its moves' })}</span> : null}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr)', columnGap: 10, marginTop: 8, paddingTop: 10, borderTop: `1px solid ${CLIMB.LINE}` }}>
            <span style={{ ...mono(9.5, ACC), paddingTop: 4 }}>{blocks.length && blocks[0].to > 1 ? tr('profile:climb.weekOne', { defaultValue: 'Week 1' }) : (p.kind === 'program' || p.kind === 'split' ? tr('profile:climb.weekOne', { defaultValue: 'Week 1' }) : tr('profile:trainer.theMoves', { defaultValue: 'The moves' }))}</span>
            <div>
              {days.length ? days.map((d) => {
                const on = open === d.key;
                return (
                  <div key={d.key} data-program-day="" style={{ borderBottom: `1px solid ${CLIMB.LINE}` }}>
                    <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : d.key)} style={{ width: '100%', minHeight: 48, padding: '8px 0', border: 0, background: 'transparent', color: CLIMB.INK, textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) 14px', columnGap: 6, alignItems: 'baseline', fontFamily: 'inherit' }}>
                      <span style={mono(9.5, CLIMB.MUTED)}>{d.label}</span>
                      <span><span style={{ display: 'block', fontSize: 15, fontWeight: 650 }}>{d.title}</span><span style={{ display: 'block', fontSize: 12.5, color: CLIMB.MUTED }}>{tr('profile:trainer.movesCount', { defaultValue: '{count, plural, one {# move} other {# moves}}', count: d.moves.length + (d.more || 0) })}</span></span>
                      <span aria-hidden="true" style={{ color: CLIMB.DIM, transform: on ? 'rotate(90deg)' : 'none' }}>›</span>
                    </button>
                    {on ? (
                      <div data-program-moves="" style={{ paddingLeft: 46, paddingBottom: 10 }}>
                        {d.desc ? <p style={{ margin: '0 0 6px', fontSize: 13.5, lineHeight: 1.45 }}>{d.desc}</p> : null}
                        {d.moves.map((m, k) => (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, minHeight: 30, alignItems: 'center', borderTop: `1px solid ${CLIMB.LINE}`, fontSize: 13.5 }}>
                            <span>{m.name}</span>{m.muscle ? <span style={{ fontSize: 12.5, color: CLIMB.MUTED }}>{m.muscle}</span> : null}
                          </div>
                        ))}
                        {d.more ? <div style={{ minHeight: 30, display: 'flex', alignItems: 'center', borderTop: `1px solid ${CLIMB.LINE}`, fontSize: 12.5, color: CLIMB.MUTED }}>＋{d.more}</div> : null}
                      </div>
                    ) : null}
                  </div>
                );
              }) : units.slice(0, 14).map((u, k) => (
                <div key={k} data-program-day="" style={{ padding: '9px 0', borderBottom: `1px solid ${CLIMB.LINE}` }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    {u.label ? <span style={{ flexShrink: 0, minWidth: 36, ...mono(9.5, CLIMB.MUTED) }}>{u.label}</span> : null}
                    <span style={{ fontSize: 15 }}>{u.title}</span>
                  </div>
                  {Array.isArray(u.moves) && u.moves.length ? <div style={{ marginTop: 3, paddingLeft: u.label ? 46 : 0, fontSize: 13, lineHeight: 1.45, color: CLIMB.MUTED }}>{u.moves.concat(u.more > 0 ? [`＋${u.more}`] : []).join(' · ')}</div> : null}
                </div>
              ))}
            </div>
          </div>
          {blocks.slice(blocks[0] && blocks[0].from === 1 && blocks[0].to === 1 ? 1 : 0).filter((b) => b.to > 1).map((b) => {
            const from = Math.max(2, b.from);
            return (
              <div key={b.from} data-climb-block={`${from}-${b.to}`} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr)', columnGap: 10, padding: '12px 0', borderBottom: `1px solid ${CLIMB.LINE}` }}>
                <span style={mono(9.5, ACC)}>{from === b.to ? tr('profile:climb.weekN', { defaultValue: 'Week {n}', n: from }) : tr('profile:climb.weeksSpan', { defaultValue: 'Weeks {from}–{to}', from, to: b.to })}</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.45, color: CLIMB.MUTED }}>{tr('profile:climb.blockLocked', { defaultValue: 'Higher up the route. It opens when you start.' })}</span>
              </div>
            );
          })}
        </div>
      ) : null}
      {p.namesOnly ? <p style={{ margin: '12px 18px 0', fontSize: 13, lineHeight: 1.45, color: CLIMB.MUTED }}>{tr('marketplace:preview.namesOnly', { defaultValue: 'Sets, loads, cues and exercise videos unlock when you buy' })}</p> : null}

      <div style={{ position: 'sticky', bottom: 0, marginTop: 20, padding: '12px 18px calc(16px + env(safe-area-inset-bottom))', background: `linear-gradient(180deg, ${hexA(CLIMB.BG, 0)}, ${CLIMB.BG} 22%)` }}>
        {pr.price && pr.paid && !isSelf ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ padding: '7px 9px', background: CLIMB.PANEL, border: `1px solid ${CLIMB.LINE}`, ...numFace(20) }}>{pr.price}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.35, color: CLIMB.MUTED }}>{tr('profile:climb.oneOff', { defaultValue: 'One-off · runs in the Shape app' })}</span>
          </div>
        ) : null}
        {isSelf ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: CLIMB.MUTED }}>{tr('profile:trainer.programSelf', { defaultValue: 'This is what members see before they buy.' })}</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: onAsk ? '1fr 1.3fr' : '1fr', gap: 8 }}>
            {onAsk ? <button type="button" data-climb-ask="" onClick={onAsk} style={{ minHeight: 50, borderRadius: 11, border: `1px solid ${CLIMB.LINE2}`, background: CLIMB.PANEL, color: CLIMB.INK, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{tr('profile:climb.ask', { defaultValue: 'Ask {name}', name: first })}</button> : null}
            {pr.sample || !pr.paid
              ? <button type="button" onClick={onWork} style={{ minHeight: 50, borderRadius: 11, border: 0, background: cta, color: nutri ? '#14100a' : '#ffffff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{tr('profile:trainer.workTitle', { defaultValue: 'Work with {name}', name: first })}</button>
              : <button type="button" data-program-buy="" onClick={onBuy} style={{ minHeight: 50, borderRadius: 11, border: 0, background: cta, color: nutri ? '#14100a' : '#ffffff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{tr('profile:climb.startPrice', { defaultValue: 'Start · {price}', price: pr.price })}</button>}
          </div>
        )}
      </div>
    </div>
  );
  return host ? createPortal(el, host) : el;
}

// ── Camps the Climb draws itself ───────────────────────────────────────────────────────────────
// Start here: the highlight the coach pinned, their intro film, and their workout videos as a row, then
// their newest posts with a photo (each opens the Posts camp, where the post is).
export function BSClimbStart({ highlight = null, film = null, videos = [], photos = [], onPhoto = null, kindLabel = '', onVideo, allPosts = null, empty = null, nutri = false }) {
  const tr = useShapeTr();
  const ACC = nutri ? CLIMB.GOLD : CLIMB.TEAL;
  return (
    <div data-coach-spotlight="" style={{ padding: '14px 18px 0 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {film ? (
        <figure data-coach-film="" style={{ margin: 0, position: 'relative', background: '#000', clipPath: cut(14), overflow: 'hidden' }}>
          {/* #t=0.1 draws the first frame before it plays, where a phone shows black otherwise. */}
          <video src={`${film.url}#t=0.1`} controls playsInline preload="metadata" aria-label={tr('profile:film.headCoach', { defaultValue: 'Intro film' })} style={{ display: 'block', width: '100%', maxHeight: 440, background: '#000' }} />
          <figcaption style={{ padding: '10px 14px 12px', background: CLIMB.PANEL }}>
            <span style={{ display: 'block', ...mono(9, ACC) }}>{tr('profile:extras.pinned', { defaultValue: 'Pinned' })} · {tr('profile:film.headCoach', { defaultValue: 'Intro film' })}</span>
            {film.caption ? <span style={{ display: 'block', marginTop: 4, fontSize: 14.5, lineHeight: 1.4, color: CLIMB.INK, overflowWrap: 'anywhere' }}>{film.caption}</span> : null}
          </figcaption>
        </figure>
      ) : null}
      {highlight ? (
        <div data-coach-highlight="" style={{ position: 'relative', padding: '14px 14px 15px', background: CLIMB.PANEL, border: `1px solid ${CLIMB.LINE}`, clipPath: cut(12) }}>
          <div style={mono(9, ACC)}>{tr('profile:extras.pinned', { defaultValue: 'Pinned' })} · {kindLabel || tr('profile:extras.highlight', { defaultValue: 'Highlight' })}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 8 }}>
            <p style={{ flex: 1, minWidth: 0, margin: 0, ...display(18, 750), lineHeight: 1.25, color: CLIMB.INK, overflowWrap: 'anywhere' }}>{highlight.title}</p>
            {highlight.metric ? <span data-coach-highlight-metric="" style={{ flex: 'none', maxWidth: '48%', ...numFace(26, ACC), lineHeight: 1.1, textAlign: 'right', overflowWrap: 'anywhere' }}>{highlight.metric}</span> : null}
          </div>
          {highlight.note ? <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.45, color: CLIMB.MUTED, overflowWrap: 'anywhere' }}>{highlight.note}</p> : null}
        </div>
      ) : null}
      {videos.length || photos.length ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={mono(9, CLIMB.DIM)}>{tr('profile:climb.highlights', { defaultValue: 'Highlights' })}</span>
            {allPosts ? <button type="button" data-climb-all-posts="" onClick={allPosts.onClick} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: nutri ? CLIMB.GOLD : '#e0785f', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{allPosts.label} →</button> : null}
          </div>
          <div className="bs-hide-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {videos.map((v) => (
              <button key={v.key} type="button" data-climb-video="" onClick={() => onVideo(v)} style={{ flex: 'none', width: 118, padding: 0, border: 0, background: 'transparent', color: CLIMB.INK, textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ position: 'relative', display: 'block', width: 118, height: 148, background: `linear-gradient(150deg, #1b252c, ${hexA(ACC, 0.4)})`, clipPath: cut(12), overflow: 'hidden', border: `1px solid ${CLIMB.LINE}` }}>
                  {v.thumb ? <video src={`${v.thumb}#t=0.1`} muted playsInline preload="metadata" tabIndex={-1} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} /> : null}
                  <span aria-hidden="true" style={{ position: 'absolute', left: 8, bottom: 8, width: 26, height: 26, transform: 'rotate(45deg)', background: 'rgba(255,255,255,0.9)', display: 'grid', placeItems: 'center' }}><span style={{ transform: 'rotate(-45deg)', color: '#0a0e11', fontSize: 10 }}>▶</span></span>
                </span>
                <span style={{ display: 'block', marginTop: 6, fontSize: 13, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</span>
              </button>
            ))}
            {photos.map((ph) => (
              <button key={ph.key} type="button" data-climb-photo-post="" aria-label={ph.title ? undefined : tr('profile:climb.posts', { defaultValue: 'Posts' })} onClick={() => onPhoto && onPhoto(ph)} style={{ flex: 'none', width: 118, padding: 0, border: 0, background: 'transparent', color: CLIMB.INK, textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ position: 'relative', display: 'block', width: 118, height: 148, background: '#1b252c', clipPath: cut(12), overflow: 'hidden', border: `1px solid ${CLIMB.LINE}` }}>
                  <img src={ph.photo} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                </span>
                <span style={{ display: 'block', marginTop: 6, fontSize: 13, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ph.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {empty}
    </div>
  );
}

// A read that failed: says so, with Try again (null is unread, never a sample).
export function BSClimbReadError({ text, onRetry = null, nutri = false }) {
  const tr = useShapeTr();
  const ACC = nutri ? CLIMB.GOLD : CLIMB.TEAL;
  return (
    <div role="status" data-climb-read-error="" style={{ margin: '14px 18px 0 14px', padding: '12px 14px', border: `1px solid ${CLIMB.LINE2}`, background: 'rgba(255,255,255,0.02)' }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: CLIMB.MUTED }}>{text}</p>
      {onRetry ? <button type="button" data-climb-retry="" onClick={onRetry} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: ACC, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{tr('profile:trainer.retry', { defaultValue: 'Try again' })}</button> : null}
    </div>
  );
}

// Proof: the wins the coach pinned, each a review a member wrote and the server let this reader see.
export function BSClimbProof({ wins, nutri = false, empty = null }) {
  const tr = useShapeTr();
  const ACC = nutri ? CLIMB.GOLD : CLIMB.TEAL;
  return (
    <div data-climb-proof="" style={{ padding: '14px 18px 0 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {wins.map((r) => (
        <figure key={r.id || r.text} data-climb-win="" data-review-pinned="" style={{ margin: 0, padding: '14px 14px 14px 16px', background: `linear-gradient(135deg, ${hexA(ACC, 0.1)}, ${CLIMB.PANEL} 55%)`, borderLeft: `2px solid ${ACC}`, clipPath: cut(12) }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={numFace(24, ACC)}>{Math.round(Number(r.rating) || 0)}</span><span style={{ ...mono(9, CLIMB.MUTED), letterSpacing: 0 }}>/10</span>
            <span style={{ marginLeft: 'auto', ...mono(8.5, CLIMB.DIM) }}>{tr('profile:climb.win', { defaultValue: 'Client win' })}</span>
          </span>
          <blockquote style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.5, color: CLIMB.INK }}>{r.text}</blockquote>
          <figcaption style={{ marginTop: 8, fontSize: 12.5, color: CLIMB.MUTED }}>{r.author || tr('profile:role.member', { defaultValue: 'Member' })}</figcaption>
        </figure>
      ))}
      {empty}
    </div>
  );
}

// Words: the rating and how it spreads, then what clients say (members), or the way in.
export function BSClimbWords({ rating = null, list = [], spread = [], locked = false, onAll, onJoin, nutri = false, first = '', empty = null }) {
  const tr = useShapeTr();
  const ACC = nutri ? CLIMB.GOLD : CLIMB.TEAL;
  // The spread, from the reviews the reader can see (a member's list): how many at each band.
  const bands = [[9, 10], [7, 8], [5, 6], [1, 4]];
  const counts = bands.map(([lo, hi]) => spread.filter((r) => { const v = Math.round(Number(r.rating) || 0); return v >= lo && v <= hi; }).length);
  const most = Math.max(1, ...counts);
  // The spread is of the reviews this reader was sent, the newest: when that is fewer than the count, it
  // says so and draws the shares without counts that would not add up to the total.
  const partial = !!(rating && spread.length < rating.count);
  const fig = rating ? (Math.round(Math.min(10, rating.avg) * 10) / 10).toFixed(1) : null;
  return (
    <section data-reviews-strip="" data-reviews-locked={locked ? '' : undefined} aria-label={tr('profile:trainer.reviews', { defaultValue: 'Reviews' })} style={{ padding: '14px 18px 0 14px' }}>
      {rating ? (
        <div style={{ display: 'grid', gridTemplateColumns: spread.length ? 'auto minmax(0, 1fr)' : '1fr', gap: 16, alignItems: 'center', padding: '14px', background: CLIMB.PANEL, border: `1px solid ${CLIMB.LINE}`, clipPath: cut(12) }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}><span style={numFace(40)}>{fig}</span><span style={{ ...mono(11, CLIMB.MUTED), letterSpacing: 0 }}>/10</span></div>
            <div style={{ marginTop: 6, ...mono(9, ACC) }}>{tr('profile:climb.reviewCount', { defaultValue: '{count, plural, one {# review} other {# reviews}}', count: rating.count })}</div>
          </div>
          {spread.length ? (
            <div data-climb-spread="" role="img" aria-label={tr('profile:climb.spreadAria', { defaultValue: 'How {name}\'s clients rate them', name: first })} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {bands.map(([lo, hi], i) => (
                <div key={lo} style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr) 22px', gap: 6, alignItems: 'center' }}>
                  <span style={{ ...mono(8.5, CLIMB.DIM), letterSpacing: '0.04em' }}>{lo === hi ? lo : `${lo}–${hi}`}</span>
                  <span style={{ height: 6, background: 'rgba(255,255,255,0.06)' }}><span style={{ display: 'block', height: '100%', width: `${(counts[i] / most) * 100}%`, background: ACC }} /></span>
                  <span style={{ ...mono(8.5, CLIMB.MUTED), letterSpacing: 0, textAlign: 'right' }}>{partial ? '' : counts[i]}</span>
                </div>
              ))}
              {partial ? <span data-climb-spread-latest="" style={{ ...mono(8, CLIMB.DIM), letterSpacing: '0.08em' }}>{tr('profile:climb.spreadLatest', { defaultValue: 'The latest {count}', count: spread.length })}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {locked ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>{tr('marketplace:listing.reviewsMembers', { defaultValue: 'Members read the reviews.' })}</p>
          <button type="button" data-reviews-join="" onClick={onJoin} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: ACC, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{rating ? tr('profile:climb.joinRead', { defaultValue: 'Join Shape to read all {count}', count: rating.count }) : tr('marketplace:listing.reviewsJoinCta', { defaultValue: 'Join to read them' })} →</button>
        </div>
      ) : list.length || spread.length ? (
        <>
          {list.length ? <div className="bs-hide-scroll" style={{ marginTop: 10, display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 2 }}>
            {list.slice(0, 6).map((r) => (
              <figure key={r.id || r.text} data-review-card="" data-review-pinned={r.pinned ? '' : undefined} style={{ margin: 0, flex: list.length > 1 ? '0 0 82%' : '1 1 auto', scrollSnapAlign: 'start', boxSizing: 'border-box', padding: '12px 14px', background: CLIMB.PANEL, borderTop: `2px solid ${ACC}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ ...mono(9.5, ACC), letterSpacing: '0.06em' }}>{Math.round(Number(r.rating) || 0)}/10{r.pinned ? ` · ${tr('profile:extras.pinned', { defaultValue: 'Pinned' })}` : ''}</span>
                <blockquote style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: CLIMB.INK, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.text}</blockquote>
                <figcaption style={{ fontSize: 12.5, color: CLIMB.MUTED }}>{r.author || tr('profile:role.member', { defaultValue: 'Member' })}</figcaption>
              </figure>
            ))}
          </div> : null}
          <button type="button" data-all-reviews="" onClick={onAll} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: ACC, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{tr('profile:trainer.allReviews', { defaultValue: 'All reviews' })} →</button>
        </>
      ) : null}
      {empty}
    </section>
  );
}

// The summit: the way to work together, at the top of the route.
export function BSClimbSummit({ children }) {
  return <div data-climb-summit-camp="" style={{ padding: '14px 18px 0 14px' }}>{children}</div>;
}

// A coach's empty camp on their own page: what to add, and the door to add it.
export function BSClimbEmpty({ text, action = null, nutri = false }) {
  const ACC = nutri ? CLIMB.GOLD : CLIMB.TEAL;
  return (
    <div data-climb-empty="" style={{ padding: '12px 14px', border: `1px dashed ${CLIMB.LINE2}`, background: 'rgba(255,255,255,0.02)' }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: CLIMB.MUTED }}>{text}</p>
      {action ? <button type="button" onClick={action.onClick} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: ACC, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{action.label} →</button> : null}
    </div>
  );
}
