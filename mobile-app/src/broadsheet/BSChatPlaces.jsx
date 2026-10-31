import React from 'react';
import { createPortal } from 'react-dom';
import { bsWsAccent, bsWsHead } from './bsMagazine.mjs';
// ─── CHAT · THE TITLE IS THE SWITCH ──────────────────────────────────────────────────────────────
// Owner, 2026-10-26, on the Chat page's tab rows (Feed / Team / Channels over Wall / Client / Community
// over the six types): "still dont love the look of this", "give me 3 new ideas", then "go with B". The
// page's title names the place you are in ("Wall ▾") and opens a sheet of every place: the three feeds,
// then the two message places with their unread counts. Only the Wall's type chips stay on the page.
// Idea A (one contents line of all five) is kept on file in docs/DESIGN-2026-10-26-chat-places.md.
//
// The chat page hands in the places (key, label, a line on what is there, unread) and what a pick does;
// this module never imports the client module back. Window globals are read at call time, as in
// BSLeaderboard.

// The i18n translator for this module (the self-contained copy every feature module carries).
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

const bsChatReduceMotion = () => {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
};

// The page's title: the place's name and the teal ▾ that says it opens. It stays an h1 for the page's
// outline; the button inside it carries the name, so a screen reader hears "Wall, button, collapsed".
export function BSChatPlaceTitle({ label, open, onOpen, buttonRef }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const accent = bsWsAccent(t);
  return (
    <h1 style={{ margin: '4px 0 0', lineHeight: 1 }}>
      <button ref={buttonRef} type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={!!open}
        aria-label={tr('feed:places.switchAria', { defaultValue: '{place}. Choose another place in Chat', place: label })}
        style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 8, maxWidth: '100%', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left',
          fontFamily: bsWsHead(t), fontWeight: 500, fontSize: 36, letterSpacing: '0.005em', lineHeight: 1, color: t.INK }}>
        {/* A long place name in a long language keeps the page's width (Codex on #2535): the chip
            wraps under the name when the two don't fit, and a name wider than the page breaks. */}
        <span style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}>{label}</span>
        {/* The title is a switch, and says so (owner, 2026-10-31: "make it more noticeable that you click
            here to change between pages on chat"): a keyed "Switch" chip in the accent with its chevron,
            where a lone 15px ▾ was. The whole title stays the tap target. */}
        <span aria-hidden data-bs-chat-switch="" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none', height: 28, padding: '0 9px 0 10px', borderRadius: 6,
          border: `1px solid ${accent}`, background: open ? accent : `${accent}1a`, color: open ? t.PAPER : accent,
          fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1, transition: 'background 160ms ease, color 160ms ease' }}>
          {tr('feed:places.switch', { defaultValue: 'Switch' })}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}>
            <path d="M1.5 3.5 L5 7 L8.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </h1>
  );
}

// The sheet the title opens. `places` is [{ key, label, sub, badge, group }] in order, `group` 'feed' or
// 'messages'; the first message place starts the Messages section. `current` is the open place's key.
export function BSChatPlacesSheet({ places = [], current, onPick, onClose }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const accent = bsWsAccent(t);
  const panelRef = React.useRef(null);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    try { panelRef.current?.focus({ preventScroll: true }); } catch (e) {}
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose && onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', onKey, true); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const still = bsChatReduceMotion();
  const mono = (size, extra) => ({ fontFamily: t.MONO, fontSize: size, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', ...extra });
  const firstMessages = places.findIndex((p) => p.group === 'messages');
  const surface = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body;
  return createPortal(
    <div onClick={onClose} data-bs-chat-places="" style={{ position: 'absolute', inset: 0, zIndex: 220, display: 'flex', alignItems: 'flex-end', background: shown ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0)', transition: still ? 'none' : 'background 200ms ease' }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={tr('feed:places.goTo', { defaultValue: 'Go to' })} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="bs-scroll"
        style={{ width: '100%', maxHeight: '82%', overflowY: 'auto', outline: 'none', background: t.PAPER, color: t.INK, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderTop: `1px solid ${t.RULE}`,
          padding: `10px ${t.padX}px calc(28px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -12px 30px rgba(0,0,0,0.22)',
          transform: shown || still ? 'translateY(0)' : 'translateY(100%)', transition: still ? 'none' : 'transform 240ms cubic-bezier(.2,.8,.2,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 30 }}>
          <span aria-hidden style={{ width: 38, height: 4, borderRadius: 2, background: t.RULE }} />
          <button type="button" onClick={onClose} aria-label={tr('feed:places.closeAria', { defaultValue: 'Close' })}
            style={{ position: 'absolute', right: -8, top: -4, width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer', color: t.INK50, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={mono(8.5, { color: accent, marginTop: 4 })}>{tr('feed:masthead.eyebrow', { defaultValue: 'Chat' })} · {tr('feed:places.goTo', { defaultValue: 'Go to' })}</div>
        <div style={{ marginTop: 6 }}>
          {places.map((p, i) => {
            const on = p.key === current;
            return (
              <React.Fragment key={p.key}>
                {i === firstMessages && <div style={mono(8, { color: t.INK50, padding: '18px 0 4px', letterSpacing: '0.2em' })}>{tr('feed:places.messages', { defaultValue: 'Messages' })}</div>}
                <div>
                  <button type="button" onClick={() => onPick && onPick(p.key)} aria-current={on ? 'page' : undefined}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, padding: '12px 0', border: 0, borderBottom: `1px solid ${t.HAIR}`, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: t.INK }}>
                    <span aria-hidden style={{ width: 3, alignSelf: 'stretch', background: on ? accent : 'transparent' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: bsWsHead(t), fontSize: 21, fontWeight: on ? 600 : 500, lineHeight: 1.1 }}>{p.label}</span>
                      {p.sub && <span style={{ display: 'block', marginTop: 3, fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.3, color: t.INK50 }}>{p.sub}</span>}
                    </span>
                    {p.badge > 0
                      ? <span style={mono(9.5, { color: accent, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums', flexShrink: 0 })}>{tr('feed:places.new', { defaultValue: '{count, number} new', count: p.badge })}</span>
                      : on
                        ? <span style={{ color: accent, fontSize: 16, flexShrink: 0 }} aria-label={tr('feed:places.current', { defaultValue: 'You are here' })}>✓</span>
                        : <span aria-hidden style={{ color: t.INK50, flexShrink: 0 }}>→</span>}
                  </button>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>,
    surface,
  );
}
