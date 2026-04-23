// iOS App concept for Shape
// Login → role-dispatched app shell (Client / Trainer / Nutritionist)
// Native iOS 18 look: SF Pro, large titles, blur tab bar, 44pt hit targets

const { useState, useEffect, useRef } = React;

// ─────────────────────────────────────────────────────────────
// Shape brand tokens (iOS app palette — warmer, more vibrant than marketing site)
// ─────────────────────────────────────────────────────────────
// Shape brand palette
//   PAPER = #1a1612 (warm near-black) · INK = #f2ede4 (cream) · TEAL = #1ec0a8
// Light mode in the app = cream paper on dark ink text.
// Dark mode = true Shape Paper (#1a1612) background.
const SHAPE = {
  // brand
  accent: '#1ec0a8',      // Shape teal
  accentBright: '#2ee0c4',
  accentDark: '#168f7f',
  paper: '#1a1612',       // warm near-black
  ink: '#f2ede4',         // cream
  coral: '#ff6b4a',
  gold: '#e8c87a',
  plum: '#6b4a7a',
  // Light mode = cream tones (Shape's day palette)
  bg: '#f5f0e6',          // slightly warmer than pure cream for grouped bg
  card: '#fbf7ef',        // cream card
  ink: '#1a1612',         // primary text (alias of paper so SHAPE.ink works everywhere)
  inkMain: '#1a1612',
  inkSec: 'rgba(26,22,18,0.58)',
  inkTer: 'rgba(26,22,18,0.3)',
  sep: 'rgba(26,22,18,0.1)',
  fill1: 'rgba(26,22,18,0.05)',
  fill2: 'rgba(26,22,18,0.1)',
  // Dark mode = Shape Paper
  bgD: '#1a1612',
  cardD: '#251e17',       // slightly lifted card
  inkD: '#f2ede4',
  inkSecD: 'rgba(242,237,228,0.58)',
  inkTerD: 'rgba(242,237,228,0.3)',
  sepD: 'rgba(242,237,228,0.1)',
  fill1D: 'rgba(242,237,228,0.06)',
};

const FONT = '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';

// ─────────────────────────────────────────────────────────────
// Icons — SF Symbol-style line icons (stroke-based)
// ─────────────────────────────────────────────────────────────
function Icon({ name, size = 24, color = 'currentColor', filled = false }) {
  const s = size;
  const c = color;
  const sw = 2;
  const common = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const fillProps = filled ? { fill: c, stroke: 'none' } : {};

  switch (name) {
    case 'house':
      return <svg {...common} {...fillProps}><path d="M3 11l9-8 9 8v10a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2V11z"/></svg>;
    case 'magnifier':
      return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case 'dumbbell':
      return <svg {...common}><path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/></svg>;
    case 'fork':
      return <svg {...common}><path d="M6 3v8a2 2 0 002 2h0v8M6 3l0 5M10 3l0 5M14 7c0-3 2-4 4-4v18h-4V7z"/></svg>;
    case 'person':
      return <svg {...common} {...fillProps}><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0114 0v1"/></svg>;
    case 'calendar':
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>;
    case 'people':
      return <svg {...common}><circle cx="9" cy="8" r="3.5"/><path d="M2 20v-.5a6 6 0 0114 0V20M16 11a3 3 0 100-6M22 20v-.5a5 5 0 00-4-4.9"/></svg>;
    case 'doc':
      return <svg {...common}><path d="M6 3h8l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>;
    case 'bubble':
      return <svg {...common}><path d="M4 12a8 8 0 0116 0 8 8 0 01-11 7.4L4 21l1.5-4.5A7.9 7.9 0 014 12z"/></svg>;
    case 'chevron':
      return <svg {...common}><path d="M9 6l6 6-6 6"/></svg>;
    case 'chevronL':
      return <svg {...common}><path d="M15 6l-6 6 6 6"/></svg>;
    case 'play':
      return <svg {...common} fill={c} stroke="none"><path d="M7 4v16l13-8L7 4z"/></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'flame':
      return <svg {...common} {...fillProps}><path d="M12 2s5 4 5 9a5 5 0 01-10 0c0-2 1-3 2-4-1 3 1 4 2 4s1-3-1-5c3 0 2-4 2-4z"/></svg>;
    case 'bell':
      return <svg {...common}><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9zM10 21a2 2 0 004 0"/></svg>;
    case 'heart':
      return <svg {...common} {...fillProps}><path d="M12 21s-8-5-8-11a5 5 0 019-3 5 5 0 019 3c0 6-8 11-8 11z"/></svg>;
    case 'check':
      return <svg {...common}><path d="M5 13l4 4L19 7"/></svg>;
    case 'x':
      return <svg {...common}><path d="M6 6l12 12M18 6l-12 12"/></svg>;
    case 'trophy':
      return <svg {...common}><path d="M8 4h8v5a4 4 0 01-8 0V4zM6 5H3a4 4 0 004 4M18 5h3a4 4 0 01-4 4M9 14h6l-1 4h-4l-1-4zM8 21h8"/></svg>;
    case 'timer':
      return <svg {...common}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M10 2h4M9 5l3-2 3 2"/></svg>;
    case 'lightning':
      return <svg {...common} {...fillProps}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>;
    case 'moon':
      return <svg {...common}><path d="M21 13a9 9 0 01-11-11 9 9 0 1011 11z"/></svg>;
    case 'water':
      return <svg {...common}><path d="M12 3s-6 7-6 12a6 6 0 0012 0c0-5-6-12-6-12z"/></svg>;
    case 'apple':
      return <svg {...common}><path d="M12 6c0-2 2-3 3-3 0 2-1 3-3 3zM7 10a5 5 0 015-1 5 5 0 015 1c2 2 1 8-2 10-1 1-2 0-3 0s-2 1-3 0c-3-2-4-8-2-10z"/></svg>;
    case 'star':
      return <svg {...common} {...fillProps}><path d="M12 3l2.5 6 6.5.5-5 4.5 1.5 6.5L12 17l-5.5 3.5 1.5-6.5-5-4.5 6.5-.5L12 3z"/></svg>;
    case 'bolt':
      return <svg {...common}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>;
    case 'camera':
      return <svg {...common}><path d="M3 8a2 2 0 012-2h2l2-3h6l2 3h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/><circle cx="12" cy="13" r="4"/></svg>;
    case 'gear':
      return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>;
    case 'card':
      return <svg {...common}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>;
    case 'cart':
      return <svg {...common}><path d="M3 4h2l2.5 12h11l2-8H7"/><circle cx="9" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/></svg>;
    case 'tag':
      return <svg {...common}><path d="M12 2H4v8l10 10 8-8L12 2z"/><circle cx="8" cy="6" r="1.5"/></svg>;
    case 'wave':
      return <svg {...common}><path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/></svg>;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function StatusBar({ dark, time = '9:41' }) {
  const c = dark ? '#fff' : '#000';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 32px 10px', fontFamily: FONT, position: 'relative', zIndex: 20,
    }}>
      <span style={{ fontWeight: 600, fontSize: 17, color: c, letterSpacing: -0.3 }}>{time}</span>
      <div style={{ width: 126 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="7" width="3" height="5" rx=".7" fill={c}/><rect x="4.5" y="5" width="3" height="7" rx=".7" fill={c}/><rect x="9" y="2.5" width="3" height="9.5" rx=".7" fill={c}/><rect x="13.5" y="0" width="3" height="12" rx=".7" fill={c}/></svg>
        <svg width="16" height="11" viewBox="0 0 16 11"><path d="M8 2.8c2.1 0 4.1.8 5.6 2.2l1-1C12.8 2.3 10.5 1.3 8 1.3S3.2 2.3 1.4 4l1 1C3.9 3.6 5.9 2.8 8 2.8z" fill={c}/><path d="M8 6.3c1.3 0 2.4.5 3.2 1.3l1-1C11.1 5.4 9.6 4.7 8 4.7s-3.1.7-4.2 1.9l1 1C5.6 6.8 6.7 6.3 8 6.3z" fill={c}/><circle cx="8" cy="9.7" r="1.4" fill={c}/></svg>
        <svg width="25" height="12" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke={c} strokeOpacity="0.35" fill="none"/><rect x="2" y="2" width="18" height="8" rx="1.5" fill={c}/><path d="M23 4.2V7.8c.7-.2 1.3-1 1.3-1.8s-.6-1.6-1.3-1.8z" fill={c} fillOpacity="0.4"/></svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Home indicator
// ─────────────────────────────────────────────────────────────
function HomeIndicator({ dark }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60,
      height: 34, display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
      paddingBottom: 8, pointerEvents: 'none',
    }}>
      <div style={{
        width: 139, height: 5, borderRadius: 100,
        background: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.85)',
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dynamic island
// ─────────────────────────────────────────────────────────────
function DynamicIsland() {
  return (
    <div style={{
      position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
      width: 126, height: 37, borderRadius: 24, background: '#000', zIndex: 50,
      pointerEvents: 'none',
    }} />
  );
}

// ─────────────────────────────────────────────────────────────
// Device frame — holds everything
// ─────────────────────────────────────────────────────────────
function Phone({ children, dark = true }) {
  // The app is dark-first editorial. "Light" mode is achieved via a global
  // invert+hue-rotate filter — imperfect but a fast way to preview a cream look.
  const lightFilter = dark ? 'none' : 'invert(1) hue-rotate(180deg)';
  return (
    <div style={{
      width: 402, height: 874, borderRadius: 55, overflow: 'hidden',
      position: 'relative',
      background: dark ? SHAPE.bgD : '#e8ddcf',
      boxShadow: '0 50px 100px rgba(0,0,0,0.25), 0 0 0 11px #0a0a0a, 0 0 0 12px rgba(255,255,255,0.08)',
      fontFamily: FONT, WebkitFontSmoothing: 'antialiased',
      color: dark ? SHAPE.inkD : SHAPE.ink,
    }}>
      {/* Chrome (status bar + dynamic island) never inverts — they sit above */}
      <DynamicIsland />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <StatusBar dark={dark} />
      </div>

      {/* Content: optionally inverted for light mode */}
      <div style={{ position: 'absolute', inset: 0, filter: lightFilter, willChange: lightFilter === 'none' ? 'auto' : 'filter' }}>
        {children}
      </div>

      <HomeIndicator dark={dark} />
    </div>
  );
}

Object.assign(window, { SHAPE, FONT, Icon, Phone, StatusBar, HomeIndicator, DynamicIsland });
