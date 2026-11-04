// The Wall's magazine look: its accent and its headline face. The Wall's stories, the chat page, the
// profiles and the app's chrome (the tab bar) all read them here, so one colour runs through the app (owner,
// 2026-10-24: the chat page "to match the new feed wall look", then the header's corner and the tab bar).
// The accent is Shape's teal, not the magazine's red it was (owner, 2026-10-27: "Those should be shape
// colors"): on light paper the deeper teal that small text needs (#0a7a72, 4.6:1 on cream where the
// brand's #0a8f87 is 3.5:1), on dark the bright one, the pair Settings uses for its small teal text.
// The headline face is the app's own (Saira, t.DISPLAY), as on every other page (owner, 2026-10-24: "Font
// needs to be same on whole app", "The font on Chat page needs to not be so tall"): Oswald is gone.
export const bsWsAccent = (t) => (t.isLight ? '#0a7a72' : '#34d6c5');
export const bsWsHead = (t) => t.DISPLAY;

// The Wall's lit chip (the owner's C for the top of the Wall, 2026-11-04): a dark inset slot in a hairline
// frame, the one shown framed and lettered in the accent and glowing on dark paper (no glow on light paper,
// where the inset is a faint ink wash). The Wall's lens, its count of who is online and its type chips wear it.
export const bsWsHexA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
export const bsWsLed = (t, on) => {
  const accent = bsWsAccent(t);
  return {
    borderRadius: 8,
    background: t.isLight ? bsWsHexA(t.INK, 0.05) : 'rgba(0,0,0,0.45)',
    border: `1px solid ${on ? accent : bsWsHexA(t.INK, 0.12)}`,
    boxShadow: t.isLight ? 'inset 0 1px 2px rgba(0,0,0,0.08)' : 'inset 0 1px 3px rgba(0,0,0,0.6)',
    color: on ? accent : t.INK70,
    textShadow: on && !t.isLight ? `0 0 8px ${bsWsHexA(accent, 0.8)}` : 'none',
  };
};
