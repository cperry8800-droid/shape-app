import React from 'react';
// ─── SHORTCUTS: THE TILE GRID AT THE FOOT OF HOME ───────────────────────────────────────────────
// Owner, 2026-10-25, of the Home mockups: the coach's Today ends on "Shortcuts", a two-column grid
// of tiles (an icon, a name and one short line), and the member's Home ends on the same grid.
// A tile's line is a real figure or plain words: never a sample number on a signed-in screen.
// `dark` inverts one tile (Shape Radio on the coach's Today).
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx).

// Stroke icons, drawn in the tile's own ink so they follow every paper.
const BS_SHORTCUT_PATHS = {
  clients: <><circle cx="9.5" cy="8" r="3.5" /><path d="M3 19.5v-1A4.5 4.5 0 0 1 7.5 14h4A4.5 4.5 0 0 1 16 18.5v1M15.5 4.6a3.5 3.5 0 0 1 0 6.8M21 19.5v-1a4.5 4.5 0 0 0-3-4.2" /></>,
  programs: <><rect x="5" y="4.5" width="14" height="16.5" rx="2" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4.5" /></>,
  review: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></>,
  grocery: <><path d="M3 4h2.5l2.2 11h10.6l2-8H6.6" /><circle cx="9" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></>,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
  habits: <><circle cx="12" cy="12" r="8.5" /><path d="M8 12.2l2.7 2.7L16.2 9.4" /></>,
  progress: <path d="M4 19.5h16M6.5 16l4-5 3.5 3 4.5-6.5" />,
  mornings: <><circle cx="12" cy="14" r="4" /><path d="M12 4v2.5M4.5 14H2.5M21.5 14h-2M6.3 8.3l1.5 1.5M17.7 8.3l-1.5 1.5M3 20h18" /></>,
  score: <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" />,
  coach: <><circle cx="10.5" cy="10.5" r="6" /><path d="M20 20l-5.2-5.2M10.5 8v5M8 10.5h5" /></>,
  devices: <><rect x="7" y="6" width="10" height="12" rx="3" /><path d="M9.5 6V3.5h5V6M9.5 18v2.5h5V18M12 9.5V12l1.5 1.5" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4 6.5l1 1 2-2M4 12l1 1 2-2M4 17.5l1 1 2-2" /></>,
};

export function BSShortcutIcon({ name, color, size = 22 }) {
  if (name === 'radio') {
    return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill={color} /></svg>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {BS_SHORTCUT_PATHS[name] || BS_SHORTCUT_PATHS.programs}
    </svg>
  );
}

// The section: a heading and the two-column grid its tiles fill. `head` swaps the heading for the
// page's own (the member's Home passes its BSFocusTitle, so the grid reads as part of that page).
export function BSShortcuts({ title, head, children }) {
  const t = window.useBS();
  if (head) {
    return (
      <section aria-label={title}>
        {head}
        <div style={{ padding: `12px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>{children}</div>
      </section>
    );
  }
  return (
    <section aria-label={title} style={{ padding: `${(t.sectGap || 22) + 4}px ${t.padX}px 0` }}>
      <h2 style={{ margin: '0 0 10px', fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2, color: t.INK }}>{title}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>{children}</div>
    </section>
  );
}

// One tile. The whole tile is the button (≥ 88px tall); `tour` is the onboarding tour's anchor.
// `color` gives the tile the member Home's link grammar: a left bar and the icon in that colour.
// `wide` spans both columns (an odd last tile).
export function BSShortcutTile({ icon, label, sub, onOpen, tour, dark = false, color, wide = false, subColor, ariaLabel }) {
  const t = window.useBS();
  const fg = dark ? t.PAPER : t.INK;
  return (
    <button type="button" onClick={onOpen} data-tour={tour || undefined} aria-label={ariaLabel || [label, sub].filter(Boolean).join(', ')}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, minWidth: 0, minHeight: 88, padding: color ? '14px 14px 14px 12px' : 14, boxSizing: 'border-box', borderRadius: color ? 6 : 12, border: 0, borderLeft: color ? `3px solid ${color}` : 0, background: dark ? t.INK : t.PAPER2, color: fg, textAlign: 'left', cursor: 'pointer', gridColumn: wide ? 'span 2' : undefined }}>
      <BSShortcutIcon name={icon} color={color || fg} />
      <span style={{ maxWidth: '100%', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {sub ? <span style={{ maxWidth: '100%', fontFamily: t.DISPLAY, fontSize: 13, fontWeight: subColor ? 600 : 400, lineHeight: 1.3, color: subColor || (dark ? t.PAPER : t.INK70), opacity: dark && !subColor ? 0.82 : 1 }}>{sub}</span> : null}
    </button>
  );
}
