import React from 'react';
import { createPortal } from 'react-dom';
import { bsWsAccent } from './bsMagazine.mjs';

// The profiles' pieces in the Wall's magazine look (owner, 2026-10-24: the Me page "needs to get cleaned
// up", then "Design" for the coach profile to match), carved out of the client module as BSIntegrationsPage
// and BSLeaderboard were: window globals are read at call time inside a component, never at module top (a
// static import evaluates before the client module has published them), and nothing here imports back into
// the client module. Both profiles render these: the member's (Terrain) and the coach's (Signal).

const SERIF = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";
const MONO = "'JetBrains Mono', monospace";
// The client module's bsTHexA, which this module can't import: an ink at an alpha.
const inkA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const reducedMotion = () => { try { return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

// A member's or coach's own words pulled out, as the Wall pulls out a coach's line: the magazine's teal quote
// mark, the words in the headline face, and who said it in mono under them. Not a button (BSWallStoryQuote
// opens a post).
export function BSTPullQuote({ INK, text, cite, size = 19 }) {
  const t = window.useBS();
  if (!text) return null;
  return (
    <figure data-bst-quote="" style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', columnGap: 6, margin: 0 }}>
      <span aria-hidden style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 700, lineHeight: 0.7, color: bsWsAccent(t) }}>“</span>
      <blockquote style={{ margin: 0, fontFamily: SERIF, fontSize: size, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-0.005em', color: INK }}>{text}</blockquote>
      {cite ? <figcaption style={{ gridColumn: 2, marginTop: 6, fontFamily: MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: inkA(INK, 0.5) }}>{cite}</figcaption> : null}
    </figure>
  );
}

// The page's own scroller (BSPage's .bs-scroll) read for its direction: true while the reader scrolls down,
// false the moment they scroll back up, near the top, or at the very end. A small dead band keeps a resting
// thumb from flickering it.
export function useBSHideOnScrollDown(ref, { slack = 8, top = 64 } = {}) {
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    const sc = ref.current && ref.current.closest ? ref.current.closest('.bs-scroll') : null;
    if (!sc) return undefined;
    let last = sc.scrollTop;
    const onScroll = () => {
      const y = sc.scrollTop;
      if (y <= top || y + sc.clientHeight >= sc.scrollHeight - 4) { setHidden(false); last = y; return; }
      if (y - last > slack) { setHidden(true); last = y; } else if (last - y > slack) { setHidden(false); last = y; }
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, [ref, slack, top]);
  return hidden;
}

// A profile's dock gets out of the way (owner, 2026-10-24: "why isnt this going away when i scroll down, the
// message and work with maya", then of a member's "Message Priya": "fix this message box thats appearing"): it
// slides off while the page scrolls down and back on as it scrolls up, so it never sits over the text being
// read. It fades as it slides, since the floating tab bar below it would show it through its frost. On the
// page's own paper over a hairline, so nothing shows through it; hidden, it is inert, so a keyboard can't reach
// the buttons it hides. Its actions are square, as the page's. A coach's dock has two: an ink outline for
// Message, ink for Work with. A member's has Message alone, in the outline, since messaging is no purchase.
// BG is the page's background (PAPER_BG: a gradient on the Steel paper); text on the ink fill takes PAPER, the
// solid colour (Codex, P1 on #2441).
export function BSProfileDock({ INK, BG, PAPER, onMessage, messageLabel, onWorkWith = null, workLabel = '' }) {
  const ref = React.useRef(null);
  const hidden = useBSHideOnScrollDown(ref);
  const label = { cursor: 'pointer', fontFamily: MONO, fontSize: 11, textTransform: 'uppercase', fontWeight: 800 };
  const line = { ...label, flex: 1, minHeight: 48, borderRadius: 0, background: 'transparent', color: INK, border: `1px solid ${INK}`, letterSpacing: '0.14em' };
  return (
    <div ref={ref} data-profile-dock="" inert={hidden} style={{ position: 'sticky', bottom: 0, flex: '0 0 auto', padding: '12px 18px calc(14px + env(safe-area-inset-bottom, 0px))', background: BG, borderTop: `1px solid ${inkA(INK, 0.12)}`, transform: hidden ? 'translateY(40%)' : 'none', opacity: hidden ? 0 : 1, transition: reducedMotion() ? 'none' : 'transform 220ms cubic-bezier(.4,0,.2,1), opacity 180ms ease' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {onWorkWith ? (
          <>
            <button onClick={onMessage} style={line}>{messageLabel}</button>
            <button onClick={onWorkWith} style={{ ...label, flex: 1.4, minHeight: 48, borderRadius: 0, background: INK, color: PAPER, border: 0, letterSpacing: '0.12em' }}>{workLabel} →</button>
          </>
        ) : (
          <button onClick={onMessage} style={line}>{messageLabel} →</button>
        )}
      </div>
    </div>
  );
}

// A Wall shot full size (owner, 2026-10-24: "should be able to click on these pictures and make bigger"): the
// photo whole on a dark ground, its caption in the headline face, "2 / 3" in mono, and the next and last shot
// a swipe, an arrow or a key away. × or Escape closes it, a tap on the ground too, and focus goes back to the
// shot that opened it. It sits over the tab bar, in the phone's own surface as every sheet does. Its words come
// in `labels`, translated by the caller (this module has no translator).
export function BSPhotoViewer({ shots, at, onClose, onStep, labels = {} }) {
  const closeRef = React.useRef(null);
  const swipe = React.useRef(null);
  const live = React.useRef({ onClose, onStep });
  live.current = { onClose, onStep };
  React.useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    if (closeRef.current) closeRef.current.focus();
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); live.current.onClose(); }
      else if (e.key === 'ArrowRight') live.current.onStep(1);
      else if (e.key === 'ArrowLeft') live.current.onStep(-1);
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      if (opener && typeof opener.focus === 'function') { try { opener.focus(); } catch (e) { /* the opener left the page */ } }
    };
  }, []);
  const shot = shots && shots[at];
  if (!shot) return null;
  const many = shots.length > 1;
  const CREAM = '#f4ede0';
  const key = { flex: 'none', width: 44, height: 44, minHeight: 44, padding: 0, border: 0, borderRadius: 0, background: 'transparent', color: CREAM, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 18 };
  const view = (
    <div role="dialog" aria-modal="true" aria-label={shot.caption || labels.title || ''} data-bs-layer="photo-viewer" data-bs-photo-viewer=""
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'absolute', inset: 0, zIndex: 300, background: '#0a0a09', color: CREAM, display: 'flex', flexDirection: 'column', padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 12px calc(env(safe-area-inset-bottom, 0px) + 16px)', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 4px', borderBottom: `1px solid ${inkA(CREAM, 0.22)}` }}>
        <span aria-live="polite" style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: inkA(CREAM, 0.7), fontVariantNumeric: 'tabular-nums' }}>{at + 1} / {shots.length}</span>
        <button ref={closeRef} type="button" data-bs-photo-close="" onClick={onClose} aria-label={labels.close} style={{ ...key, marginLeft: 'auto', marginRight: -10 }}>×</button>
      </div>
      <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onPointerDown={(e) => { swipe.current = e.clientX; }}
        onPointerUp={(e) => { const x0 = swipe.current; swipe.current = null; if (x0 == null || !many) return; const dx = e.clientX - x0; if (Math.abs(dx) > 40) onStep(dx < 0 ? 1 : -1); }}
        style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'pan-y', padding: '12px 0' }}>
        <img src={shot.url} alt={shot.caption || ''} draggable={false} style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, borderTop: `2px solid ${CREAM}`, paddingTop: 10 }}>
        {many ? <button type="button" data-bs-photo-prev="" onClick={() => onStep(-1)} aria-label={labels.prev} style={{ ...key, marginLeft: -10 }}>←</button> : null}
        <p style={{ flex: 1, minWidth: 0, margin: '10px 0 0', fontFamily: SERIF, fontSize: 17, fontWeight: 500, lineHeight: 1.25, letterSpacing: '-0.005em', textAlign: many ? 'center' : 'left' }}>{shot.caption || ''}</p>
        {many ? <button type="button" data-bs-photo-next="" onClick={() => onStep(1)} aria-label={labels.next} style={{ ...key, marginRight: -10 }}>→</button> : null}
      </div>
    </div>
  );
  const host = typeof document !== 'undefined' ? (document.getElementById('bs-phone-surface') || document.body) : null;
  return host ? createPortal(view, host) : view;
}
