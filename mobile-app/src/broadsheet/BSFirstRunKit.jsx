// THE FIRST-RUN KIT: the parts every screen before the app is drawn from (owner, 2026-11-13, picking
// "B · Dock"; then "center this on screen and logo", "for all of them", "make sure all other pages i
// missed during account creation match this"). The screens that use them: the welcome, join, sign in and
// check-your-email (BSFirstRun.jsx), the language picker, the date-of-birth gate, the goal and coaching
// steps (BSFirstRunSteps.jsx), the health screening's first-run gate (BSHealthIntake.jsx) and the coach
// application on the sign-in route.
//
//   FRScreen  — the launch's fixed-dark ground, a top bar with ← (and, where it belongs, the coach's
//               "Apply to coach" pill), ONE group (the header, then the panel) and a footer link.
//   FRHead / FRHeader — the centred 3D mark over the headline and an optional line under it.
//   FRPanel   — the glass panel the fields and buttons sit in, labels left-aligned inside it.
//   FRField / FRButton / FRTabs / FRSeg / FRError / FRIcon — the parts inside.
//
// React only: no i18n, no client import, so a screen in any bundle (and the tests' harness, which
// compiles siblings on their own) can import it. Window globals (the mark, the back button, the
// back-slot top) are read at call time. The launch surfaces stay fixed-dark (they never followed the
// paper theme: the beat, the telegram and the welcome are one launch).
import React from 'react';

export const FR_HEAD = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";
export const FR_MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";
export const FR = Object.freeze({
  bg: 'radial-gradient(135% 90% at 50% -8%, rgba(52,214,197,0.14), transparent 52%), linear-gradient(176deg, #0b161c 0%, #070b11 48%, #03050b 100%)',
  head: 'rgba(11,22,28,0.97)',
  ink: '#f2ede4', ink2: 'rgba(242,237,228,0.74)', ink3: 'rgba(242,237,228,0.56)',
  line: 'rgba(242,237,228,0.12)', line2: 'rgba(242,237,228,0.26)',
  well: 'rgba(0,0,0,0.34)', glass: 'linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.025))', glassEdge: 'rgba(242,237,228,0.14)',
  teal: '#34d6c5', onTeal: '#04201d', tealSoft: 'rgba(52,214,197,0.09)', err: '#ffb39c', errBg: 'rgba(255,155,122,0.08)', ok: '#2ee0c4',
  glow: '0 0 26px rgba(52,214,197,0.28)', tabOn: 'rgba(255,255,255,0.1)', tabWell: 'rgba(0,0,0,0.3)',
});

// ── Buttons and links ───────────────────────────────────────────────────────
export function frButton(kind, extra) {
  return {
    width: '100%', minHeight: 52, borderRadius: 14, padding: '14px 16px', cursor: 'pointer', boxSizing: 'border-box',
    fontFamily: FR_HEAD, fontSize: 16.5, fontWeight: 600, letterSpacing: '0.005em',
    ...(kind === 'primary' ? { background: FR.teal, color: FR.onTeal, border: 0, boxShadow: FR.glow }
      : kind === 'outline' ? { background: 'transparent', color: FR.ink, border: `1px solid ${FR.line2}` }
      : { background: 'transparent', color: FR.ink2, border: 0, minHeight: 44, padding: '10px 4px', fontSize: 15, fontWeight: 500 }),
    ...(extra || {}),
  };
}
export function frLink(extra) {
  return { background: 'transparent', border: 0, padding: '10px 2px', minHeight: 44, cursor: 'pointer', fontFamily: FR_HEAD, fontSize: 15, fontWeight: 500, color: FR.ink2, textAlign: 'left', ...(extra || {}) };
}
export function FRButton({ kind = 'primary', style, ...rest }) {
  return <button type="button" {...rest} style={frButton(kind, style)} />;
}

// ── Fields ──────────────────────────────────────────────────────────────────
export function frInput(extra) {
  return { flex: 1, minWidth: 0, width: '100%', background: 'transparent', border: 0, outline: 'none', color: FR.ink, fontFamily: FR_HEAD, fontSize: 16.5, fontWeight: 500, padding: '12px 0', colorScheme: 'dark', ...(extra || {}) };
}
// A label over a rounded well (.bs-lf-well glows teal while typed in), an optional aside on the label's
// row (Forgot password, Change number), and an optional note under it.
export function FRField({ label, aside, note, noteTone, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
        <span style={{ fontFamily: FR_HEAD, fontSize: 13.5, fontWeight: 600, color: FR.ink2 }}>{label}</span>
        {aside || null}
      </span>
      <span className="bs-lf-well" style={{ display: 'flex', alignItems: 'center', minHeight: 52, borderRadius: 13, border: `1px solid ${FR.line2}`, background: FR.well, padding: '0 14px', boxSizing: 'border-box' }}>{children}</span>
      {note ? <span style={{ display: 'block', marginTop: 6, fontFamily: FR_HEAD, fontSize: 13, lineHeight: 1.4, color: noteTone === 'bad' ? FR.err : noteTone === 'ok' ? FR.ok : FR.ink3 }}>{note}</span> : null}
    </label>
  );
}
export function FRError({ text }) {
  if (!text) return null;
  return <div role="alert" style={{ borderRadius: 12, border: '1px solid rgba(255,155,122,0.42)', background: FR.errBg, padding: '11px 14px', fontFamily: FR_HEAD, fontSize: 14, lineHeight: 1.4, color: FR.err }}>{text}</div>;
}
// Placeholders follow the ground (an inline style cannot reach ::placeholder).
export function FRCss() {
  return <style>{'[data-fr] .bs-lf-input::placeholder{color:rgba(242,237,228,0.38)}'}</style>;
}

// Email | Phone, where both ways in are open.
export function FRTabs({ value, options, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 4, padding: 4, borderRadius: 12, background: FR.tabWell, border: `1px solid ${FR.line}` }}>
      {options.map(([k, l]) => {
        const on = k === value;
        return <button key={k} type="button" role="tab" aria-selected={on} data-fr-tab={k} onClick={() => { if (!on) onChange(k); }} style={{ minWidth: 0, minHeight: 40, borderRadius: 9, border: 0, cursor: 'pointer', fontFamily: FR_HEAD, fontSize: 14.5, fontWeight: 600, background: on ? FR.tabOn : 'transparent', color: on ? FR.ink : FR.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</button>;
      })}
    </div>
  );
}

// A segmented answer (No | Yes, No | Yes | N/A): the panel's own control for a one-of-few choice. The
// chosen one is lit teal; `null` is unanswered, every segment plain.
export function FRSeg({ value, options, onChange, label, accent }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 4, padding: 4, borderRadius: 12, background: FR.tabWell, border: `1px solid ${FR.line}` }}>
      {options.map(([v, l]) => {
        const on = v === value;
        const c = (on && accent && accent(v)) || FR.teal;
        return <button key={String(v)} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)} style={{ minWidth: 0, minHeight: 42, borderRadius: 9, border: on ? `1px solid ${c}` : '1px solid transparent', cursor: 'pointer', fontFamily: FR_HEAD, fontSize: 15, fontWeight: 600, background: on ? 'rgba(52,214,197,0.12)' : 'transparent', color: on ? c : FR.ink2 }}>{l}</button>;
      })}
    </div>
  );
}

// ── Icons: line drawings in the theme's teal (no coloured emoji) ────────────
export function FRIcon({ name, color = FR.teal, size = 22 }) {
  const p = { fill: 'none', stroke: color, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const d = {
    train: <path {...p} d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />,
    eat: <path {...p} d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M17 21V3c-2 1.5-3 4-3 7s1 4 3 4" />,
    coach: <><circle {...p} cx="9" cy="8" r="3.2" /><path {...p} d="M3.5 20c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5M16 6.5l1.6 1.6L21 4.7" /></>,
    people: <><circle {...p} cx="8" cy="9" r="3" /><circle {...p} cx="16.5" cy="10" r="2.5" /><path {...p} d="M2.5 19.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M14 15.2c.8-.4 1.6-.6 2.5-.6 2.2 0 3.9 1.3 4.5 4" /></>,
    music: <><path {...p} d="M9 18V5.5l11-2V16" /><circle {...p} cx="6.5" cy="18" r="2.5" /><circle {...p} cx="17.5" cy="16" r="2.5" /></>,
    eye: <><path {...p} d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle {...p} cx="12" cy="12" r="2.8" /></>,
    eyeOff: <><path {...p} d="M3 3l18 18M10.6 5.6c.5-.1.9-.1 1.4-.1 6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.2 3.9M6.6 6.6A16.6 16.6 0 0 0 2 12s3.6 6.5 10 6.5c1.6 0 3-.4 4.3-1" /><path {...p} d="M9.9 9.9a2.8 2.8 0 0 0 4.2 4.2" /></>,
  }[name];
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{d}</svg>;
}

// ── The mark, centred by what it paints ─────────────────────────────────────
// ⚠ "CENTER THE LOGO" MEANS THE GLASS, NOT ITS BOX (owner, 2026-11-13). Measured on the shots at 84 and
// 100px, over the mark's turn: the painted prisms sit about 1.5px LEFT of the box's middle, so the box is
// nudged right by that share of its size. What read as "right of centre" before was the mark centred
// beside a headline set flush left; the headline is centred now too (FRHeader).
export const FR_MARK_NUDGE = 0.018;
export function FRMark({ size = 92 }) {
  const Mark = typeof window !== 'undefined' ? window.BSShapeMark : null;
  if (!Mark) return null;
  return (
    <div data-fr-mark="" aria-hidden="true" style={{ alignSelf: 'center', display: 'flex', justifyContent: 'center', transform: `translateX(${Math.round(size * FR_MARK_NUDGE)}px)` }}>
      <Mark size={size} calm />
    </div>
  );
}

// ── The header every first-run screen shares ────────────────────────────────
// The mark, the headline (its accent word teal; a key that carries the period keeps it), and one
// optional line under it: a sentence, or the step meter. Centred, all of it; the form below is not.
export function FRSteps({ n, of = 2, label }) {
  return (
    <div data-fr-steps="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <div aria-hidden="true" style={{ display: 'flex', gap: 5 }}>
        {Array.from({ length: of }).map((_, i) => <span key={i} style={{ width: 26, height: 4, borderRadius: 2, background: i < n ? FR.teal : FR.line2 }} />)}
      </div>
      <span style={{ fontFamily: FR_HEAD, fontSize: 13.5, fontWeight: 500, color: FR.ink3 }}>{label}</span>
    </div>
  );
}
// The headline's and the line under it's styles, for a screen that writes its header as children.
export function frTitle(size = 36) {
  return { margin: 0, fontFamily: FR_HEAD, fontWeight: 300, fontSize: size, lineHeight: 1.06, letterSpacing: '-0.03em', color: FR.ink };
}
export const frAccent = { fontWeight: 400, color: FR.teal };
export const frSub = { margin: '10px 0 0', maxWidth: 310, fontFamily: FR_HEAD, fontSize: 15.5, lineHeight: 1.45, color: FR.ink2 };

// THE header block: the centred mark over whatever the screen writes under it. FRHeader is this with
// the headline built from props; a screen whose words the tests' shallow harness has to read
// (tests/helpers/broadsheet-mount.mjs walks children only) writes them as FRHead's children instead.
// One block either way, so no screen's header can drift from another's.
// `compact`: the long forms (join's first step, joining by phone) take a smaller mark, so the first
// view ends on a whole line rather than mid-way through the footer (coordinator's review).
// `flush`: no side padding of its own, for a screen whose column already has it (the welcome).
export function FRHead({ children, mark = true, markSize = 84, compact = false, flush = false }) {
  return (
    <div data-fr-header="" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: flush ? 0 : '0 24px' }}>
      {mark ? <div style={{ marginBottom: compact ? 10 : 16 }}><FRMark size={compact ? 52 : markSize} /></div> : null}
      {children}
    </div>
  );
}
export function FRHeader({ pre, accent, sub, step, markSize = 84, mark = true, size = 36, compact = false, flush = false }) {
  return (
    <FRHead mark={mark} markSize={markSize} compact={compact} flush={flush}>
      <h1 style={frTitle(compact ? 30 : size)}>
        {pre}{pre && accent ? ' ' : ''}{accent ? <span style={frAccent}>{accent}</span> : null}
      </h1>
      {sub ? <p style={frSub}>{sub}</p> : null}
      {step ? <div style={{ marginTop: compact ? 8 : 12 }}>{step}</div> : null}
    </FRHead>
  );
}

export function FRPanel({ children, style, ...rest }) {
  return (
    <div data-fr-panel="" {...rest} style={{ flexShrink: 0, margin: '0 10px', padding: '16px 16px 14px', borderRadius: 24, border: `1px solid ${FR.glassEdge}`, background: FR.glass, boxShadow: '0 -10px 40px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 14, ...(style || {}) }}>
      {children}
    </div>
  );
}

// The top bar: ← where every page keeps it (the masthead row's top, BS_BACK_SLOT_TOP_CSS, which clears
// the notch), on a bar of its own that content scrolls under. `right` is the coach's pill, or nothing.
// ⚠ CONTENT NEVER SCROLLS UNDER THE NOTCH (coordinator's review: a long screen's headline sat in the
// Dynamic Island once scrolled). A screen with no ← keeps a band of its own: sticky, as tall as the safe
// area (or the desktop frame's notch floor), in the page's colour and fading out below, so what scrolls
// up disappears beneath it.
export const FR_NOTCH = 'max(24px, env(safe-area-inset-top, 0px), var(--bs-notch-floor, 0px))';
export function FRTopBar({ onBack, right }) {
  const BackButton = typeof window !== 'undefined' ? window.BSBackButton : null;
  if (!onBack && !right) {
    return <div data-fr-topband="" aria-hidden="true" style={{ position: 'sticky', top: 0, zIndex: 3, flexShrink: 0, height: `calc(${FR_NOTCH} + 18px)`, marginBottom: -6, background: `linear-gradient(180deg, ${FR.head} 0%, ${FR.head} 70%, transparent 100%)` }} />;
  }
  return (
    <div data-fr-topbar="" style={{ position: 'sticky', top: 0, zIndex: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, boxSizing: 'border-box', padding: `${(typeof window !== 'undefined' && window.BS_BACK_SLOT_TOP_CSS) || 'max(12px, env(safe-area-inset-top, 0px))'} 18px 8px`, background: `linear-gradient(180deg, ${FR.head} 0%, ${FR.head} 62%, transparent 100%)` }}>
      <span data-fr-back="">{onBack && BackButton ? <BackButton compact onClick={onBack} ink={FR.ink2} /> : null}</span>
      {right || null}
    </div>
  );
}

// A whole first-run screen: the ground, the top bar, ONE group (the header, then the panel, a fixed
// FR_GROUP_GAP apart) and the footer link at the bottom (owner, 2026-11-13: "center these a little more.
// Move a little higher on screen"). On a short screen the group is centred in the space between the
// top bar and the footer, a little high: the free space splits 2 : 3 above and below it, which puts the
// group's middle at about 45% of that space. A long form (`tight`: join's first step, joining by phone)
// starts at the top and scrolls, with the same gap.
// ⚠ THE FOCUSED FIELD STAYS IN VIEW WITH THE KEYBOARD UP. The group is in the scroller, so it can always
// scroll; once the keyboard has opened (about 300ms), the field that took the focus is scrolled to the
// middle of what is left, so the group never hides it.
export const FR_GROUP_GAP = 30;
export function FRScreen({ onBack, right, header, children, footer, dataAttr, tight = false }) {
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    let tid = null;
    let touch = false;
    try { touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (err) { touch = false; }
    if (!touch) return undefined;
    const onFocus = (e) => {
      const f = e.target;
      if (!f || !/^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) return;
      clearTimeout(tid);
      tid = setTimeout(() => { try { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {} }, 300);
    };
    el.addEventListener('focusin', onFocus);
    return () => { clearTimeout(tid); el.removeEventListener('focusin', onFocus); };
  }, []);
  return (
    <div data-fr="" {...(dataAttr || {})} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: FR.bg, color: FR.ink, overflow: 'hidden' }}>
      <FRCss />
      <div ref={scrollRef} className="bs-hide-scroll" data-fr-scroll="" style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column' }}>
        <FRTopBar onBack={onBack} right={right} />
        <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}>
          <div aria-hidden="true" style={tight ? { flex: '0 0 8px' } : { flex: '2 1 0px', minHeight: 12 }} />
          <div data-fr-group="" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: FR_GROUP_GAP }}>
            {header || null}
            {children}
          </div>
          <div aria-hidden="true" style={tight ? { flex: '1 0 16px' } : { flex: '3 1 0px', minHeight: 16 }} />
        </div>
        <div data-fr-footer="" style={{ flexShrink: 0, textAlign: 'center', padding: '4px 22px calc(18px + env(safe-area-inset-bottom, 0px))' }}>{footer || null}</div>
      </div>
    </div>
  );
}

if (typeof window !== 'undefined') {
  window.BSFirstRun = { FR, FR_HEAD, FR_MONO, FR_NOTCH, FRScreen, FRHead, FRHeader, FRPanel, FRField, FRButton, FRTabs, FRSeg, FRError, FRIcon, FRMark, FRSteps, FRTopBar, frButton, frInput, frLink, frTitle, frAccent, frSub };
}
