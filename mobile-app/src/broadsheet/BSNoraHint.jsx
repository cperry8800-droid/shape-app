import React from 'react';
// ─── NORA'S FIRST HINT (the member's Home) ──────────────────────────────────
// The masthead's ✦ opens Nora on every screen, but nothing said so (owner, 2026-10-29: "Users may
// not know that's how to get to Nora"; option C of the mocks, with the ✦ itself left a bare glyph).
// Home shows this note once, in teal under the ✦: who she is and what to ask her. It goes for good
// on this device when the member taps Got it, or opens Nora by any door (the ✦, a link, a sheet).
//
// It hangs from a zero-height box placed after Home's masthead, and is put under the ✦ by
// measuring it, so it scrolls away with the page, and any sheet (portaled above the page) covers
// it. Until it has measured, it is laid out but not shown, so it never appears in the wrong place.
//
// Carved as its own module (docs/WORKLOG.md: a new self-contained piece of the member app gets
// its own ES module). It reads no window globals at load: Home hands it its theme.

// The i18n translator for this module, the same self-contained copy every feature module carries
// (see BSIntegrationsPage.jsx), so this file does not depend on another module's copy.
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

export const BS_NORA_HINT_KEY = 'shape.noraHint.seen';

function deviceStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (e) { return null; }
}

/** Has this device seen the hint? Storage that can't be read counts as yes: a note that can't be
 * put away for good would come back on every launch. */
export function bsNoraHintSeen(storage) {
  try { return !storage || storage.getItem(BS_NORA_HINT_KEY) === '1'; } catch (e) { return true; }
}

export function bsMarkNoraHintSeen(storage) {
  try { if (storage) storage.setItem(BS_NORA_HINT_KEY, '1'); } catch (e) {}
}

/** Opening Nora by any door puts the note away for good, wherever the member is when they do it
 * (Codex P2 on #2500): only the active tab is mounted, so the note's own listener goes with Home,
 * and Nora opened from another tab's ✦ would leave the note to come back. This listener lives as
 * long as the app; it is wired once, when the module loads. The try/catch is for the render-test
 * harness, whose window stub has no addEventListener. */
export function bsWireNoraHintSeen(win) {
  if (!win || win.__bsNoraHintWired) return;
  try {
    win.addEventListener('shape:openNora', () => {
      let storage = null;
      try { storage = win.localStorage; } catch (e) {}
      bsMarkNoraHintSeen(storage);
    });
    win.__bsNoraHintWired = true;
  } catch (e) {}
}
if (typeof window !== 'undefined') bsWireNoraHintSeen(window);

/** Where the note goes, from the ✦'s box and the box the note hangs from (viewport rects of the
 * same scroller, so the page's scroll cancels out): its top 8px under the ✦, and how far its
 * arrow sits from the note's right edge (which is at the page's gutter) to point at the ✦'s
 * centre. null while the ✦ isn't laid out. */
export function bsNoraHintPlace(star, box, padX) {
  if (!star || !box || !(star.width > 0)) return null;
  const ARROW = 12;
  return {
    top: Math.round(star.bottom - box.top + 8),
    arrowRight: Math.max(10, Math.round(box.right - padX - (star.left + star.width / 2) - ARROW / 2)),
  };
}

export function BSNoraHint({ t }) {
  const tr = useShapeTr();
  const [shown, setShown] = React.useState(() => !bsNoraHintSeen(deviceStorage()));
  const [place, setPlace] = React.useState(null);
  const boxRef = React.useRef(null);
  const close = React.useCallback(() => {
    bsMarkNoraHintSeen(deviceStorage());
    setShown(false);
  }, []);

  React.useEffect(() => {
    if (!shown) return undefined;
    window.addEventListener('shape:openNora', close);
    return () => window.removeEventListener('shape:openNora', close);
  }, [shown, close]);

  React.useLayoutEffect(() => {
    if (!shown) return undefined;
    let alive = true;
    const measure = () => {
      const box = boxRef.current;
      const scroller = box && box.closest('.bs-scroll');
      // The page's own masthead's ✦. The pinned bar's sits outside the scroller.
      const star = scroller && scroller.querySelector('[data-nora-corner]');
      if (alive) setPlace(star ? bsNoraHintPlace(star.getBoundingClientRect(), box.getBoundingClientRect(), t.padX) : null);
    };
    measure();
    window.addEventListener('resize', measure);
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure); } catch (e) {}
    return () => { alive = false; window.removeEventListener('resize', measure); };
  }, [shown, t.padX]);

  if (!shown) return null;
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const ink = t.isLight ? '#ffffff' : '#04201d';
  return (
    <div ref={boxRef} data-nora-hint="" style={{ position: 'relative', height: 0, zIndex: 5 }}>
      <div role="note" style={{
        position: 'absolute', top: place ? place.top : 0, right: t.padX,
        width: `min(264px, calc(100% - ${t.padX * 2}px))`, boxSizing: 'border-box',
        visibility: place ? 'visible' : 'hidden',
        padding: '12px 14px 4px', borderRadius: 10, background: teal, color: ink,
        fontFamily: t.BODY, fontSize: 14, lineHeight: 1.35, textAlign: 'left',
        boxShadow: '0 10px 28px rgba(0,0,0,0.32)',
      }}>
        <span aria-hidden style={{ position: 'absolute', top: -6, right: place ? place.arrowRight : 10, width: 12, height: 12, borderRadius: 2, background: teal, transform: 'rotate(45deg)' }} />
        <span style={{ fontWeight: 700 }}>{tr('home:noraHint.title', { defaultValue: 'Meet Nora.' })}</span>
        {' '}{tr('home:noraHint.body', { defaultValue: 'Tap ✦ any time to ask her about your plan, your food or the app.' })}
        <div>
          <button type="button" onClick={close} style={{
            minHeight: 40, margin: '2px 0 0 -10px', padding: '0 10px', border: 0, background: 'transparent',
            color: ink, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800,
            letterSpacing: '0.16em', textTransform: 'uppercase',
          }}>{tr('home:noraHint.gotIt', { defaultValue: 'Got it' })}</button>
        </div>
      </div>
    </div>
  );
}
