import React from 'react';
import { bsWsRed } from './bsMagazine.mjs';

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

// A member's or coach's own words pulled out, as the Wall pulls out a coach's line: the magazine's red quote
// mark, the words in the headline face, and who said it in mono under them. Not a button (BSWallStoryQuote
// opens a post).
export function BSTPullQuote({ INK, text, cite, size = 19 }) {
  const t = window.useBS();
  if (!text) return null;
  return (
    <figure data-bst-quote="" style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', columnGap: 6, margin: 0 }}>
      <span aria-hidden style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 700, lineHeight: 0.7, color: bsWsRed(t) }}>“</span>
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

// A coach profile's Message / Work-with dock gets out of the way (owner, 2026-10-24: "why isnt this going away
// when i scroll down, the message and work with maya"): it slides off while the page scrolls down and back on
// as it scrolls up, so it never sits over the text being read. It fades as it slides, since the floating tab
// bar below it would show it through its frost. On solid paper over a hairline, so nothing shows through it;
// hidden, it is inert, so a keyboard can't reach the buttons it hides. Its actions are square, as the page's:
// an ink outline for Message, ink for Work with.
export function BSCoachProfileDock({ INK, BG, onMessage, onWorkWith, messageLabel, workLabel }) {
  const ref = React.useRef(null);
  const hidden = useBSHideOnScrollDown(ref);
  const label = { cursor: 'pointer', fontFamily: MONO, fontSize: 11, textTransform: 'uppercase', fontWeight: 800 };
  return (
    <div ref={ref} data-coach-dock="" inert={hidden} style={{ position: 'sticky', bottom: 0, flex: '0 0 auto', padding: '12px 18px calc(14px + env(safe-area-inset-bottom, 0px))', background: BG, borderTop: `1px solid ${inkA(INK, 0.12)}`, transform: hidden ? 'translateY(40%)' : 'none', opacity: hidden ? 0 : 1, transition: reducedMotion() ? 'none' : 'transform 220ms cubic-bezier(.4,0,.2,1), opacity 180ms ease' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onMessage} style={{ ...label, flex: 1, minHeight: 48, borderRadius: 0, background: 'transparent', color: INK, border: `1px solid ${INK}`, letterSpacing: '0.14em' }}>{messageLabel}</button>
        <button onClick={onWorkWith} style={{ ...label, flex: 1.4, minHeight: 48, borderRadius: 0, background: INK, color: BG, border: 0, letterSpacing: '0.12em' }}>{workLabel} →</button>
      </div>
    </div>
  );
}
