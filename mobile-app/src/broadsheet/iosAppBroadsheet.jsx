import React from 'react';
// iosAppBroadsheet.jsx — Shared tokens, primitives, theme context for the
// Broadsheet redesign of the Shape iOS app.
//
// Reads tweak state from a TweakContext so light/dark, accent, density, weight,
// and border style can flow through the whole app from one Tweaks panel.
//
// Type system:
//   DISPLAY_BS = Space Grotesk (headers, mastheads, section labels)
//   BODY_BS    = native system stack (body copy, controls, rows)
//   MONO_BS    = JetBrains Mono (eyebrows, times, tags)
//   No serifs. No script. This is the contract.

const {
  useState: useStateBS,
  useContext: useContextBS,
  useEffect: useEffectBS,
  useRef: useRefBS,
  createContext: createContextBS,
} = React;

// ─── Type stacks ───────────────────────────────────────────
const DISPLAY_BS = "'Space Grotesk', -apple-system, system-ui, sans-serif";
const BODY_BS    = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO_BS    = "'JetBrains Mono', ui-monospace, monospace";

// Inject web fonts once (only the families this design uses)
(function injectBSFonts() {
  // Fonts are bundled through src/fonts.css for offline app-store builds.
})();

// ─── Theme palette generator ───────────────────────────────
// "paper" mode swaps cream<->near-black; everything derives from it.
// Convert "#rgb" / "#rrggbb" → "r,g,b" string for use in rgba()
function _hexToRGB(h) {
  if (!h || typeof h !== 'string') return null;
  let s = h.trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  if (s.length !== 6 || /[^0-9a-f]/i.test(s)) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

function makePalette({ paperMode = 'dark', accentKey = 'blue', inkOverride = null } = {}) {
  // Six paper modes — light/dark are the originals; teal/manila/blueprint/carbon
  // are tuned colored stocks. Each picks PAPER (base), PAPER2 (raised surface),
  // PAPER3 (pressed/active), INK (text), and the rgb tuple used for alpha rules.
  // Manila is light-on-tan (isLight-shaped); the others are dark-on-color.
  const PAPERS = {
    light:     { paper: '#f5f0e6', paper2: '#ede6d6', paper3: '#e3dac4', ink: '#0f0e0c', inkRGB: '15,14,12',    light: true  },
    dark:      { paper: '#0f0e0c', paper2: '#181612', paper3: '#221d18', ink: '#f5f0e6', inkRGB: '245,240,230', light: false },
    teal:      { paper: '#063d34', paper2: '#0a4f43', paper3: '#106456', ink: '#f1ece0', inkRGB: '241,236,224', light: false },
    manila:    { paper: '#d9c089', paper2: '#cfb47a', paper3: '#c2a466', ink: '#221806', inkRGB: '34,24,6',     light: true  },
    blueprint: { paper: '#0a2a52', paper2: '#0f3461', paper3: '#163f72', ink: '#dbe7ff', inkRGB: '219,231,255', light: false },
    carbon:    { paper: '#000000', paper2: '#1c1f24', paper3: '#2a2e35', ink: '#c9cfd6', inkRGB: '201,207,214', light: false },
    steel:     { paper: '#a9aeb4', paper2: '#9da2a9', paper3: '#8c9199', ink: '#15181c', inkRGB: '21,24,28',    light: true,  metallic: true },
    bone:      { paper: '#ece4d3', paper2: '#e2d8c2', paper3: '#d4c8ad', ink: '#1a160e', inkRGB: '26,22,14',    light: true  },
    oxblood:   { paper: '#3a1418', paper2: '#481a1f', paper3: '#5a2128', ink: '#f0dfd2', inkRGB: '240,223,210', light: false },
  };
  const P = PAPERS[paperMode] || PAPERS.dark;
  const isLight = P.light;
  const PAPER  = P.paper;
  const PAPER2 = P.paper2;
  const PAPER3 = P.paper3;
  // Optional ink override — user-chosen text/foreground color from Tweaks.
  // Only applied when it parses cleanly; otherwise fall back to paper default.
  const _override = inkOverride && inkOverride !== 'default' ? _hexToRGB(inkOverride) : null;
  const INK    = _override ? inkOverride : P.ink;
  const inkRGB = _override || P.inkRGB;
  const INK85  = `rgba(${inkRGB},0.85)`;
  const INK70  = `rgba(${inkRGB},0.70)`;
  const INK50  = `rgba(${inkRGB},0.50)`;
  const INK30  = `rgba(${inkRGB},0.28)`;
  const RULE   = `rgba(${inkRGB},${isLight ? 0.18 : 0.20})`;
  const HAIR   = `rgba(${inkRGB},${isLight ? 0.08 : 0.10})`;

  // PAPER_BG — full CSS background string. Equal to PAPER for flat papers;
  // for Steel, paints a brushed-metal sheen (vertical brush lines + horizontal
  // highlight band) so the surface reads as cool metal instead of flat gray.
  let PAPER_BG = PAPER;
  if (P.metallic) {
    PAPER_BG = `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 24%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0.18) 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, rgba(0,0,0,0.025) 1px, rgba(0,0,0,0.025) 2px), ${PAPER}`;
  }

  // Accent palette — slightly different hex pairs in light vs dark for contrast
  const accents = {
    blue:  { light: '#1c4ed8', dark: '#5b8df9' },
    amber: { light: '#c8881a', dark: '#e3a544' },
    rust:  { light: '#a8331b', dark: '#e06547' },
    green: { light: '#2f6b3a', dark: '#5fb16e' },
    teal:  { light: '#0a8f87', dark: '#34d6c5' },
    white: { light: '#ffffff', dark: '#ffffff' },
    black: { light: '#000000', dark: '#000000' },
  };
  const ACCENT = accents[accentKey] ? accents[accentKey][isLight ? 'light' : 'dark'] : accents.blue.light;

  // Companion accents (always available regardless of "primary" choice)
  const BLUE  = accents.blue [isLight ? 'light' : 'dark'];
  const AMBER = accents.amber[isLight ? 'light' : 'dark'];
  const RUST  = accents.rust [isLight ? 'light' : 'dark'];
  const GREEN = accents.green[isLight ? 'light' : 'dark'];
  const surfaceAlpha = isLight ? 0.045 : 0.055;
  const surfaceStrongAlpha = isLight ? 0.075 : 0.085;
  const surfaceBorderAlpha = isLight ? 0.12 : 0.14;
  const shadowColor = isLight ? 'rgba(15,14,12,0.10)' : 'rgba(0,0,0,0.28)';

  return {
    isLight, paperMode, accentKey, inkRGB,
    PAPER, PAPER2, PAPER3, PAPER_BG, INK, INK85, INK70, INK50, INK30, RULE, HAIR,
    ACCENT, BLUE, AMBER, RUST, GREEN,
    SURFACE: `rgba(${inkRGB},${surfaceAlpha})`,
    SURFACE_STRONG: `rgba(${inkRGB},${surfaceStrongAlpha})`,
    SURFACE_BORDER: `rgba(${inkRGB},${surfaceBorderAlpha})`,
    ELEVATION: `0 18px 42px ${shadowColor}`,
    ELEVATION_SOFT: `0 10px 24px ${shadowColor}`,
    GLASS: isLight ? 'rgba(255,255,255,0.36)' : 'rgba(255,255,255,0.045)',
    // ─── Rounded-edge tokens (medium softening, still editorial) ───
    RADIUS: 14,    // primary card/cell/sheet radius
    RADIUS_SM: 10, // inner inputs, small chips, beakers
    RADIUS_LG: 22, // large surfaces
  };
}

// ─── Density tokens ────────────────────────────────────────
function makeDensity(densityKey = 'standard') {
  const map = {
    relaxed:  { padX: 24, rowY: 14, sectGap: 28, headlineHero: 92, headlineLead: 44, body: 16 },
    standard: { padX: 20, rowY: 11, sectGap: 22, headlineHero: 84, headlineLead: 38, body: 15 },
    dense:    { padX: 16, rowY: 8,  sectGap: 16, headlineHero: 74, headlineLead: 32, body: 14 },
  };
  return map[densityKey] || map.standard;
}

// ─── Border style ──────────────────────────────────────────
function makeBorders(borderKey = 'hairlines', P) {
  const map = {
    hairlines:  { thin: `1px solid ${P.HAIR}`, rule: `1px solid ${P.RULE}`, slab: `1px solid ${P.INK}` },
    'thick rules': { thin: `1px solid ${P.RULE}`, rule: `2px solid ${P.INK}`, slab: `3px solid ${P.INK}` },
    'no rules': { thin: 'none', rule: 'none', slab: 'none' },
  };
  return map[borderKey] || map.hairlines;
}

// ─── Texture / pattern overlay ─────────────────────────────
// Returns a CSS background string layered ABOVE the page color.
// All textures use the ink RGB tuple so they tint correctly on any paper.
function makeTexture(textureKey = 'none', inkRGB = '15,14,12', isLight = true) {
  const a = (n) => `rgba(${inkRGB},${n})`;
  switch (textureKey) {
    case 'newsprint':
      // dual-frequency dot field — fake halftone grain
      return `radial-gradient(${a(isLight ? 0.14 : 0.18)} 0.7px, transparent 0.9px) 0 0/3px 3px,
              radial-gradient(${a(isLight ? 0.10 : 0.14)} 0.7px, transparent 0.9px) 1px 1px/5px 5px`;
    case 'ledger':
      // horizontal rule lines every 28px
      return `repeating-linear-gradient(180deg, transparent 0 27px, ${a(isLight ? 0.22 : 0.26)} 27px 28px)`;
    case 'grid':
      // engineer grid — major every 40px, minor every 8px
      return `repeating-linear-gradient(0deg,   ${a(isLight ? 0.14 : 0.20)} 0 1px, transparent 1px 40px),
              repeating-linear-gradient(90deg,  ${a(isLight ? 0.14 : 0.20)} 0 1px, transparent 1px 40px),
              repeating-linear-gradient(0deg,   ${a(isLight ? 0.06 : 0.09)} 0 1px, transparent 1px 8px),
              repeating-linear-gradient(90deg,  ${a(isLight ? 0.06 : 0.09)} 0 1px, transparent 1px 8px)`;
    case 'dotgrid':
      return `radial-gradient(${a(isLight ? 0.32 : 0.38)} 1.2px, transparent 1.6px) 0 0/16px 16px`;
    case 'foxed':
      // uneven aging spots — multiple offset radial gradients
      return `radial-gradient(ellipse 180px 140px at 18% 12%,  ${a(0.14)}, transparent 60%),
              radial-gradient(ellipse 120px 160px at 82% 28%,  ${a(0.12)}, transparent 60%),
              radial-gradient(ellipse 200px 120px at 30% 78%,  ${a(0.10)}, transparent 60%),
              radial-gradient(ellipse 140px 140px at 88% 92%,  ${a(0.14)}, transparent 60%),
              radial-gradient(ellipse 90px 90px  at 60% 50%,   ${a(0.08)}, transparent 60%)`;
    case 'vignette':
      return `radial-gradient(ellipse 110% 85% at 50% 50%, transparent 40%, ${a(isLight ? 0.28 : 0.40)} 100%)`;
    case 'watermark': {
      // Repeating diagonal "SHAPE" wordmark, very faint
      const op = isLight ? 0.10 : 0.14;
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'><g transform='rotate(-22 160 160)' fill='rgba(${inkRGB},${op})' font-family='Georgia,serif' font-weight='700' font-size='56' font-style='italic' text-anchor='middle'><text x='160' y='180'>SHAPE</text></g></svg>`;
      const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
      return `${url} 0 0/320px 320px`;
    }
    case 'linen':
      // Subtle woven-fabric crosshatch — perpendicular hairlines at 2px pitch
      return `repeating-linear-gradient(0deg,  ${a(isLight ? 0.05 : 0.07)} 0 1px, transparent 1px 2px),
              repeating-linear-gradient(90deg, ${a(isLight ? 0.05 : 0.07)} 0 1px, transparent 1px 2px),
              radial-gradient(${a(isLight ? 0.04 : 0.06)} 0.5px, transparent 0.8px) 0 0/4px 4px`;
    case 'crosshatch':
      // Etching-style diagonal hatch, both directions
      return `repeating-linear-gradient(45deg,  ${a(isLight ? 0.10 : 0.14)} 0 1px, transparent 1px 6px),
              repeating-linear-gradient(-45deg, ${a(isLight ? 0.08 : 0.12)} 0 1px, transparent 1px 6px)`;
    case 'pinstripe':
      // Tailoring pinstripe — narrow vertical lines
      return `repeating-linear-gradient(90deg, ${a(isLight ? 0.16 : 0.20)} 0 1px, transparent 1px 6px)`;
    case 'halftone':
      // Big halftone dots, classic comic / risograph
      return `radial-gradient(${a(isLight ? 0.28 : 0.34)} 1.6px, transparent 2.0px) 0 0/9px 9px,
              radial-gradient(${a(isLight ? 0.18 : 0.24)} 1.2px, transparent 1.6px) 4.5px 4.5px/9px 9px`;
    case 'kraft':
      // Brown-paper fibre — irregular small specks
      return `radial-gradient(${a(isLight ? 0.18 : 0.22)} 0.6px, transparent 1px) 0 0/7px 7px,
              radial-gradient(${a(isLight ? 0.10 : 0.14)} 0.6px, transparent 1px) 3px 5px/11px 11px,
              radial-gradient(${a(isLight ? 0.06 : 0.09)} 0.4px, transparent 0.8px) 6px 2px/13px 9px`;
    case 'blueprint': {
      // Cyan blueprint: tinted page wash + fine grid
      const cyan = isLight ? 'rgba(40,90,140,0.06)' : 'rgba(120,180,220,0.10)';
      const cyanLine = isLight ? 'rgba(40,90,140,0.18)' : 'rgba(140,200,240,0.22)';
      return `${cyan},
              repeating-linear-gradient(0deg,  ${cyanLine} 0 1px, transparent 1px 24px),
              repeating-linear-gradient(90deg, ${cyanLine} 0 1px, transparent 1px 24px)`;
    }
    case 'graph': {
      // Engineering graph paper — minor 6px, major 30px, slight green-blue
      const minor = isLight ? 'rgba(40,80,140,0.06)' : 'rgba(120,170,220,0.08)';
      const major = isLight ? 'rgba(40,80,140,0.16)' : 'rgba(120,170,220,0.20)';
      return `repeating-linear-gradient(0deg,  ${major} 0 1px, transparent 1px 30px),
              repeating-linear-gradient(90deg, ${major} 0 1px, transparent 1px 30px),
              repeating-linear-gradient(0deg,  ${minor} 0 1px, transparent 1px 6px),
              repeating-linear-gradient(90deg, ${minor} 0 1px, transparent 1px 6px)`;
    }
    case 'stains':
      // Coffee-ring + ink-bleed marks scattered
      return `radial-gradient(circle 60px at 14% 22%, transparent 38px, ${a(isLight ? 0.14 : 0.16)} 39px, ${a(isLight ? 0.10 : 0.12)} 41px, transparent 46px),
              radial-gradient(circle 90px at 78% 64%, transparent 60px, ${a(isLight ? 0.10 : 0.12)} 61px, transparent 70px),
              radial-gradient(ellipse 80px 60px at 52% 88%, ${a(isLight ? 0.12 : 0.14)}, transparent 70%),
              radial-gradient(ellipse 50px 40px at 88% 12%, ${a(isLight ? 0.10 : 0.12)}, transparent 70%)`;
    case 'cardboard':
      // Corrugated cardboard — wider horizontal banding + fibre flecks
      return `repeating-linear-gradient(180deg, transparent 0 11px, ${a(isLight ? 0.12 : 0.14)} 11px 12px, transparent 12px 22px, ${a(isLight ? 0.06 : 0.08)} 22px 23px),
              radial-gradient(${a(isLight ? 0.10 : 0.12)} 0.5px, transparent 0.9px) 0 0/8px 8px`;
    case 'concrete': {
      // Mid-grey concrete wash — stippled stains + fine grain
      const cool = isLight ? 'rgba(60,60,68,0.06)' : 'rgba(180,180,190,0.06)';
      return `${cool},
              radial-gradient(${a(isLight ? 0.10 : 0.14)} 0.7px, transparent 1.1px) 0 0/5px 5px,
              radial-gradient(ellipse 140px 100px at 22% 30%, ${a(isLight ? 0.10 : 0.12)}, transparent 70%),
              radial-gradient(ellipse 180px 120px at 78% 72%, ${a(isLight ? 0.08 : 0.10)}, transparent 70%)`;
    }
    case 'risograph': {
      // Two-colour riso misregistration — magenta + cyan halftone offset
      const mag = isLight ? 'rgba(220,60,120,0.18)' : 'rgba(255,120,170,0.22)';
      const cy  = isLight ? 'rgba(40,140,200,0.18)' : 'rgba(120,200,240,0.22)';
      return `radial-gradient(${mag} 1.0px, transparent 1.4px) 0 0/8px 8px,
              radial-gradient(${cy}  1.0px, transparent 1.4px) 4px 4px/8px 8px`;
    }
    case 'parchment': {
      // Warm parchment — uneven gold/brown tints + age marks
      const warm = isLight ? 'rgba(180,140,80,0.08)' : 'rgba(220,180,120,0.10)';
      return `radial-gradient(ellipse 220px 160px at 14% 18%, ${warm}, transparent 70%),
              radial-gradient(ellipse 260px 180px at 84% 76%, ${warm}, transparent 70%),
              radial-gradient(ellipse 60px 50px at 40% 82%, ${a(0.10)}, transparent 70%),
              radial-gradient(${a(isLight ? 0.06 : 0.08)} 0.5px, transparent 0.9px) 0 0/6px 6px`;
    }
    case 'dotmap': {
      // Stippled topographic / dot-map — variable density radial
      return `radial-gradient(${a(isLight ? 0.22 : 0.28)} 1.2px, transparent 1.6px) 0 0/14px 14px,
              radial-gradient(${a(isLight ? 0.16 : 0.20)} 0.9px, transparent 1.3px) 7px 7px/14px 14px,
              radial-gradient(ellipse 200px 140px at 30% 30%, ${a(0.06)}, transparent 70%),
              radial-gradient(ellipse 200px 140px at 70% 70%, ${a(0.06)}, transparent 70%)`;
    }
    case 'none':
    default:
      return null;
  }
}

// ─── Display weight ────────────────────────────────────────
function makeWeights(weightKey = 'bold') {
  return weightKey === 'regular'
    ? { display: 300, displayHeavy: 400, eyebrow: 400 }
    : { display: 700, displayHeavy: 700, eyebrow: 600 };
}

// ─── Theme context ─────────────────────────────────────────
const BSContext = createContextBS(null);

function BSProvider({ children, paperMode, accentKey, densityKey, borderKey, weightKey, textureKey, textureColor, inkOverride }) {
  const P = makePalette({ paperMode, accentKey, inkOverride });
  const D = makeDensity(densityKey);
  const B = makeBorders(borderKey, P);
  const W = makeWeights(weightKey);
  // Texture tint: explicit textureColor (hex) wins over the auto-from-paper ink RGB.
  const _txOverride = textureColor && textureColor !== 'auto' ? _hexToRGB(textureColor) : null;
  const _txRGB = _txOverride || P.inkRGB || '15,14,12';
  const TEXTURE = makeTexture(textureKey, _txRGB, P.isLight);
  const value = { ...P, ...D, B, W, TEXTURE, textureKey, textureColor,
    DISPLAY: DISPLAY_BS, BODY: BODY_BS, MONO: MONO_BS,
    densityKey, borderKey, weightKey,
  };
  return (
    <BSContext.Provider value={value}>
      <div className={`${P.isLight ? 'bs-light' : 'bs-dark'}${textureKey && textureKey !== 'none' ? ' bs-grain-on' : ''}`} style={{ display: 'contents' }}>
        {children}
      </div>
    </BSContext.Provider>
  );
}

function useBS() {
  const v = useContextBS(BSContext);
  if (!v) throw new Error('useBS must be inside BSProvider');
  return v;
}

function isNativeBSApp() {
  return document.documentElement.classList.contains('is-native-app') ||
    !!window.Capacitor?.isNativePlatform?.();
}

function getTargetScroller(eventTarget) {
  const targetScroller = eventTarget?.closest?.('.bs-scroll');
  if (targetScroller) return targetScroller;
  return document.querySelector('.bs-scroll');
}

// ═══════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════

// Page wrapper — sets paper background and provides scroll
function BSPage({ children, tabBarHeight = 80 }) {
  const t = useBS();
  const scrollerRef = useRefBS(null);

  useEffectBS(() => {
    const el = scrollerRef.current;
    if (!el || !isNativeBSApp()) return undefined;

    let lastY = 0;
    let active = false;
    let moved = false;

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      if (event.target?.closest?.('input, textarea, select')) return;
      active = true;
      moved = false;
      lastY = event.touches[0].clientY;
    };

    const onTouchMove = (event) => {
      if (event.defaultPrevented) return;
      if (!active || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const delta = lastY - y;
      if (Math.abs(delta) < 2 && !moved) return;
      moved = true;
      lastY = y;
      el.scrollTop += delta;
      event.preventDefault();
    };

    const onTouchEnd = () => {
      active = false;
      moved = false;
    };

    const onWheel = (event) => {
      el.scrollTop += event.deltaY;
      event.preventDefault();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div ref={scrollerRef} className="bs-scroll" style={{
      position: 'absolute', inset: 0,
      height: '100%',
      overflowX: 'hidden',
      overflowY: 'scroll',
      WebkitOverflowScrolling: 'touch',
      touchAction: 'pan-y',
      overscrollBehaviorY: 'contain',
      background: t.TEXTURE ? `${t.TEXTURE}, ${t.PAPER_BG}` : t.PAPER_BG,
      color: t.INK,
      paddingBottom: `calc(${tabBarHeight + 28}px + env(safe-area-inset-bottom, 0px))`,
      fontFamily: t.BODY,
      scrollbarWidth: 'none', msOverflowStyle: 'none',
    }}>
      {children}
    </div>
  );
}

// Logo — two triangles, right + left pointing toward each other with vertical
// offset (right-triangle sits low, left-triangle sits high). Brand mark.
function BSLogo({ size = 18, color }) {
  const c = color || 'currentColor';
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 99 113"
      width={size}
      height={size * (113/99)}
      style={{
        display: 'inline-block',
        flex: '0 0 auto',
        verticalAlign: 'middle',
      }}
    >
      <polygon points="43,39 82,15 82,63" fill={c} />
      <polygon points="17,49 56,73 17,97" fill={c} />
    </svg>
  );
}

function BSLogoMask({ size = 18, color }) {
  const c = color || 'currentColor';
  const mask = 'url("/assets/shape-logo-triangles-transparent.png")';
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size * (113/99),
      background: c,
      WebkitMaskImage: mask,
      maskImage: mask,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }} />
  );
}

// Wordmark — SHAPE set in a thin, wide geometric sans (matches the brand
// wordmark — triangular A, light weight, generous tracking).
// `full` = "THE SHAPE DAILY"; default = "SHAPE".
function BSWordmark({ size = 18, color, full = false, vertical = false, align = 'left' }) {
  const t = useBS();
  const c = color || t.INK;
  const fontSize = Math.max(11, size * 0.78);
  const labelMain = full ? 'THE SHAPE DAILY' : 'SHAPE';
  // Wordmark font — Saira at very thin weight, wide tracking, uppercase.
  // Matches the Shape brand wordmark (geometric, hairline, triangular A).
  const wordFont = `'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif`;
  const wordStyle = {
    fontFamily: wordFont,
    fontWeight: 200,
    fontSize,
    letterSpacing: '0.18em',
    lineHeight: 1,
    textTransform: 'uppercase',
    color: c,
  };
  if (vertical) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', gap: size * 0.5 }}>
        <BSLogo size={size} color={c} />
        <span style={wordStyle}>{labelMain}</span>
      </div>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.45 }}>
      <BSLogo size={size} color={c} />
      <span style={wordStyle}>{labelMain}</span>
    </span>
  );
}

// Masthead — newspaper-style header with vol/no, optional title block
function BSMasthead({ vol = 'Vol. 6', no = 'No. 38', title, leftKicker, rightKicker, trailing, showDotTexture = true }) {
  const t = useBS();
  const inkRgb = t.inkRGB || (t.isLight ? '15,14,12' : '244,237,224');
  // Hero background — only when there's a title (i.e. home pages).
  // Layered: subtle halftone dot wash + faint pinstripes + side vignette + double rule.
  const dotsBg = `radial-gradient(rgba(${inkRgb},0.22) 0.8px, transparent 1.3px)`;
  const stripesBg = `repeating-linear-gradient(135deg,
      rgba(${inkRgb},0.03) 0, rgba(${inkRgb},0.03) 1px,
      transparent 1px, transparent 7px)`;
  return (
    <div style={{
      padding: `54px ${t.padX}px ${title ? 18 : 14}px`,
      borderBottom: title ? `3px solid ${t.INK}` : `2px solid ${t.INK}`,
      position: 'relative', overflow: 'hidden',
      backgroundColor: title ? `rgba(${inkRgb},0.012)` : 'transparent',
    }}>
      {/* Hero bg layer — only on title mastheads */}
      {title && (
        <>
          {/* Diagonal pinstripes — engraving feel */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: stripesBg,
            WebkitMaskImage: 'linear-gradient(180deg, black 0%, rgba(0,0,0,0.5) 65%, transparent 100%)',
            maskImage: 'linear-gradient(180deg, black 0%, rgba(0,0,0,0.5) 65%, transparent 100%)',
          }} />
          {/* Halftone dot wash — soft, fades top → bottom */}
          {showDotTexture && (
            <div aria-hidden style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: dotsBg, backgroundSize: '7px 7px',
              WebkitMaskImage: 'linear-gradient(180deg, black 0%, rgba(0,0,0,0.55) 50%, transparent 100%)',
              maskImage: 'linear-gradient(180deg, black 0%, rgba(0,0,0,0.55) 50%, transparent 100%)',
            }} />
          )}
          {/* Side vignette — light, just darkens edges a touch */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(ellipse 80% 90% at 50% 50%, transparent 35%, rgba(${inkRgb},0.05) 100%)`,
          }} />
          {/* Top hairline — single thin rule */}
          <div aria-hidden style={{
            position: 'absolute', left: 0, right: 0, top: 44, height: 1,
            background: `rgba(${inkRgb},0.5)`,
          }} />
          {/* Bottom double-rule strip */}
          <div aria-hidden style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 4,
            borderTop: `1px solid ${t.INK}`, borderBottom: `1px solid ${t.INK}`,
            background: t.PAPER_BG,
          }} />
        </>
      )}

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: title ? 10 : 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BSLogo size={18} color={t.INK} />
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70 }}>
            {vol} · {no}
          </div>
        </div>
        {trailing}
      </div>

      {title && (
        <div style={{
          fontFamily: t.DISPLAY, fontWeight: t.W.display,
          fontSize: 44, lineHeight: 0.92, letterSpacing: '-0.035em',
          color: t.INK, position: 'relative', zIndex: 1,
        }}>{title}</div>
      )}

      <div style={{
        marginTop: title ? 14 : 8, paddingTop: 10, borderTop: `1px solid ${t.RULE}`,
        display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1,
        fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70,
      }}>
        <span>{leftKicker}</span>
        <span>{rightKicker}</span>
      </div>
    </div>
  );
}

// Compact page header (non-masthead, for inner tabs)
function BSPageHeader({ vol = 'Vol. 6', no = 'No. 38', kicker, title, trailing }) {
  const t = useBS();
  return (
    <div style={{ padding: `54px ${t.padX}px 14px`, borderBottom: `2px solid ${t.INK}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BSLogo size={16} color={t.INK} />
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70 }}>
            {vol} · {no}
          </div>
        </div>
        {trailing}
      </div>
      {kicker && (
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 600 }}>
          {kicker}
        </div>
      )}
      {title && (
        <div style={{
          fontFamily: t.DISPLAY, fontWeight: t.W.display,
          fontSize: 44, lineHeight: 0.92, letterSpacing: '-0.035em',
          color: t.INK, marginTop: 8,
        }}>{title}</div>
      )}
    </div>
  );
}

// Avatar — softly-rounded square, mono initial
function BSAvatar({ init = 'A', size = 32, fill, ink, onClick }) {
  const t = useBS();
  return (
    <button onClick={onClick} style={{
      width: size, height: size,
      background: fill || t.INK, color: ink || t.PAPER,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: t.MONO, fontSize: size * 0.42, fontWeight: 700,
      border: 0, padding: 0, cursor: onClick ? 'pointer' : 'default',
      letterSpacing: '-0.02em',
      borderRadius: t.RADIUS_SM,
    }}>{init}</button>
  );
}

// Eyebrow — mono uppercase tracked label
function BSEyebrow({ children, color, weight = 600 }) {
  const t = useBS();
  return (
    <span style={{
      fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em',
      textTransform: 'uppercase', color: color || t.INK70, fontWeight: weight,
    }}>{children}</span>
  );
}

// Section header bar — "▍ TITLE" + right-side meta
function BSSection({ title, meta, kicker, color }) {
  const t = useBS();
  return (
    <div style={{
      padding: `${t.sectGap}px ${t.padX}px 10px`,
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 11, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: color || t.INK,
      }}>
        ▍ {title}
      </span>
      {kicker && (
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          {kicker}
        </span>
      )}
      {meta && (
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.16em', textTransform: 'uppercase', marginLeft: 'auto' }}>
          {meta}
        </span>
      )}
    </div>
  );
}

// Slab — full-bleed block with top/bottom rules, used for headline content
function BSSlab({ children, tinted, accent, padded = true }) {
  const t = useBS();
  return (
    <div style={{
      padding: padded ? `14px ${t.padX}px 18px` : 0,
      background: accent ? accent : (tinted ? t.SURFACE_STRONG : t.SURFACE),
      borderTop: `1px solid ${t.SURFACE_BORDER}`,
      borderBottom: `1px solid ${t.SURFACE_BORDER}`,
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
    }}>{children}</div>
  );
}

// Cell — bordered rectangle, like a box advert
function BSCell({ children, dark, accent, onClick, style }) {
  const t = useBS();
  const bg = dark ? t.INK : (accent || t.SURFACE);
  const fg = dark ? t.PAPER : t.INK;
  return (
    <div onClick={onClick} style={{
      padding: 14, border: `1px solid ${dark ? t.INK : t.SURFACE_BORDER}`,
      background: bg, color: fg, cursor: onClick ? 'pointer' : 'default',
      borderRadius: t.RADIUS_LG,
      boxShadow: dark ? 'none' : t.ELEVATION_SOFT,
      backdropFilter: dark ? 'none' : 'blur(14px)',
      WebkitBackdropFilter: dark ? 'none' : 'blur(14px)',
      ...style,
    }}>{children}</div>
  );
}

// Tag — mono pill (filled rectangle, not rounded)
function BSTag({ children, color, dark }) {
  const t = useBS();
  const bg = color || t.INK;
  return (
    <span style={{
      fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em',
      color: t.PAPER, background: bg, padding: '4px 7px', textTransform: 'uppercase', fontWeight: 700,
      display: 'inline-block', lineHeight: 1.3,
      borderRadius: 999,
    }}>{children}</span>
  );
}

// Tabular row inside a "stock listing"
function BSRow({ time, tag, tagColor, title, sub, state, onClick, last }) {
  const t = useBS();
  const done = state === 'done';
  const next = state === 'next';
  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '52px 40px 1fr',
      alignItems: 'center', gap: 10, padding: `${t.rowY}px 0`,
      borderBottom: last ? 0 : `1px solid ${t.HAIR}`,
      opacity: done ? 0.4 : 1,
      background: next ? `${t.ACCENT}10` : 'transparent',
      marginLeft: next ? -8 : 0, marginRight: next ? -8 : 0,
      paddingLeft: next ? 8 : 0, paddingRight: next ? 8 : 0,
      borderRadius: next ? t.RADIUS_SM : 0,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <span style={{
        fontFamily: t.MONO, fontSize: 12, color: next ? t.ACCENT : t.INK,
        letterSpacing: '-0.01em', fontWeight: next ? 700 : 500,
        fontVariantNumeric: 'tabular-nums',
      }}>{time}</span>
      {tag && (
        <span style={{
          fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em',
          color: t.PAPER, background: tagColor || t.INK,
          padding: '2px 4px', textTransform: 'uppercase', fontWeight: 700,
          textAlign: 'center', justifySelf: 'start',
          borderRadius: t.RADIUS_SM,
        }}>{tag}</span>
      )}
      {!tag && <span />}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: t.BODY, fontSize: 14, fontWeight: next ? 700 : 500, color: t.INK,
          letterSpacing: '-0.01em', lineHeight: 1.15,
          textDecoration: done ? 'line-through' : 'none', textDecorationThickness: '1.5px',
        }}>{title}</div>
        {sub && (
          <div style={{
            fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 2,
            letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

// Big numeric headline ("LEAD")
function BSHeadlineNumber({ sign = '', value, unit, color, size }) {
  const t = useBS();
  const n = size || t.headlineHero;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
      {sign && (
        <span style={{ fontFamily: t.DISPLAY, fontSize: n * 0.18, fontWeight: 600, color: t.INK50, marginTop: n * 0.13 }}>
          {sign}
        </span>
      )}
      <span style={{
        fontFamily: t.DISPLAY, fontSize: n, fontWeight: t.W.display,
        lineHeight: 0.85, letterSpacing: '-0.06em', color: color || t.INK,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
      {unit && (
        <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK70, letterSpacing: '0.12em', marginTop: n * 0.085, marginLeft: 4 }}>
          {unit}
        </span>
      )}
    </div>
  );
}

// Ticker — black bar with scrolling content
function BSTicker({ items, speedSec = 30, fg = '#7ed4ff' }) {
  const t = useBS();
  return (
    <div style={{
      background: t.INK, color: t.PAPER,
      padding: '8px 0', overflow: 'hidden', whiteSpace: 'nowrap',
      fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.12em',
    }}>
      <div style={{ display: 'inline-block', animation: `bsticker ${speedSec}s linear infinite`, paddingLeft: '100%' }}>
        {Array(2).fill(null).map((_, n) => (
          <span key={n}>
            {items.map((it, i) => (
              <span key={i}>
                {it.label} <span style={{ color: it.color || fg }}>{it.value}</span>
                {it.note && <span style={{ opacity: 0.7 }}> · {it.note}</span>}
                &nbsp;&nbsp;·&nbsp;&nbsp;
              </span>
            ))}
            ◆ &nbsp;&nbsp;
          </span>
        ))}
      </div>
      <style>{`@keyframes bsticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

// Halftone "image placeholder" — duotone CSS pattern, no real photo needed
function BSHalftone({ height = 180, accent, pattern = 'dots' }) {
  const t = useBS();
  const c1 = t.INK;
  const c2 = accent || t.ACCENT;
  const bg = pattern === 'dots'
    ? `radial-gradient(circle at 25% 25%, ${c1} 0%, ${c1} 22%, transparent 23%),
       radial-gradient(circle at 75% 75%, ${c1} 0%, ${c1} 22%, transparent 23%),
       radial-gradient(circle at 75% 25%, ${c1} 0%, ${c1} 12%, transparent 13%),
       radial-gradient(circle at 25% 75%, ${c1} 0%, ${c1} 12%, transparent 13%),
       linear-gradient(135deg, ${c2} 0%, ${c2} 100%)`
    : `repeating-linear-gradient(45deg, ${c1} 0 2px, transparent 2px 6px), linear-gradient(${c2}, ${c2})`;
  return (
    <div style={{
      height,
      backgroundImage: bg,
      backgroundSize: pattern === 'dots' ? '12px 12px, 12px 12px, 12px 12px, 12px 12px, 100% 100%' : 'auto',
      border: `1px solid ${t.INK}`,
    }} />
  );
}

// Tab bar — Broadsheet style: thick top rule, mono labels, accent active
function BSTabBar({ tabs, active, onChange }) {
  const t = useBS();
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 55,
      height: 88, padding: '10px 10px calc(16px + env(safe-area-inset-bottom, 0px))',
      background: `linear-gradient(180deg, rgba(${t.inkRGB},0.03), ${t.PAPER} 78%)`,
      color: t.INK,
      borderTop: `1px solid ${t.SURFACE_BORDER}`,
      display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, gap: 4,
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      boxShadow: `0 -16px 40px ${t.isLight ? 'rgba(15,14,12,0.08)' : 'rgba(0,0,0,0.26)'}`,
    }}>
      {tabs.map((tab, i) => {
        const on = tab.key === active;
        return (
          <button key={tab.key} onClick={() => onChange(tab.key)} style={{ borderRadius: 14,
            border: on ? `1px solid ${t.SURFACE_BORDER}` : '1px solid transparent',
            background: on ? t.INK : 'transparent',
            cursor: 'pointer', padding: '8px 0',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            color: on ? t.PAPER : t.INK70, position: 'relative',
            boxShadow: on ? t.ELEVATION_SOFT : 'none',
          }}>
            <span style={{
              fontFamily: t.MONO, fontWeight: 700, fontSize: 10.5, letterSpacing: '-0.01em',
              fontVariantNumeric: 'tabular-nums',
            }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{
              fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600,
            }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Footer masthead — closes a page like a paper footer
function BSFooter({ left = 'The Shape Daily', right }) {
  const t = useBS();
  return (
    <div style={{
      padding: `14px ${t.padX}px 20px`, borderTop: `2px solid ${t.INK}`,
      display: 'flex', justifyContent: 'space-between',
      fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50,
    }}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

// Phone bezel — light/dark sensitive
function BSPhone({ children }) {
  const t = useBS();
  const isNativeApp = isNativeBSApp();
  // Inject the weight-shift CSS once. When data-bs-weight="regular" is set on the
  // phone surface, every nested element's font-weight gets a step lighter via
  // CSS attribute selectors (300/400 instead of 600/700/800).
  useEffectBS(() => {
    if (document.getElementById('bs-weight-css')) return;
    const s = document.createElement('style');
    s.id = 'bs-weight-css';
    s.textContent = `
      [data-bs-weight="regular"] *,
      [data-bs-weight="regular"] {
        font-weight: 300 !important;
      }
      [data-bs-weight="regular"] [style*="font-weight: 800"],
      [data-bs-weight="regular"] [style*="fontWeight: 800"] { font-weight: 500 !important; }
      [data-bs-weight="regular"] [style*="font-weight: 700"],
      [data-bs-weight="regular"] [style*="fontWeight: 700"] { font-weight: 400 !important; }
      [data-bs-weight="regular"] [style*="font-weight: 600"],
      [data-bs-weight="regular"] [style*="fontWeight: 600"] { font-weight: 400 !important; }
      [data-bs-weight="regular"] [style*="font-weight: 500"],
      [data-bs-weight="regular"] [style*="fontWeight: 500"] { font-weight: 300 !important; }
      [data-bs-weight="regular"] [style*="font-weight: 400"],
      [data-bs-weight="regular"] [style*="fontWeight: 400"] { font-weight: 300 !important; }
      [data-bs-weight="regular"] .bs-splash-title,
      [data-bs-weight="regular"] .bs-splash-title *,
      [data-bs-weight="regular"] .bs-daily-title,
      [data-bs-weight="regular"] .bs-daily-title * {
        font-family: 'Newsreader', Georgia, serif !important;
      }
      [data-bs-weight="regular"] .bs-splash-title .bs-splash-the,
      [data-bs-weight="regular"] .bs-daily-title .bs-daily-the {
        font-weight: 700 !important;
      }
      [data-bs-weight="regular"] .bs-splash-title .bs-splash-shape,
      [data-bs-weight="regular"] .bs-daily-title .bs-daily-shape {
        font-family: 'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif !important;
        font-style: normal !important;
        font-weight: 300 !important;
        letter-spacing: 0.18em !important;
        text-transform: uppercase !important;
      }
      [data-bs-weight="regular"] .bs-splash-title .bs-splash-daily,
      [data-bs-weight="regular"] .bs-daily-title .bs-daily-daily {
        font-weight: 700 !important;
      }
    `;
    document.head.appendChild(s);
  }, []);

  useEffectBS(() => {
    if (!isNativeApp) return undefined;

    let activeScroller = null;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let dragging = false;

    const resetGesture = () => {
      activeScroller = null;
      startX = 0;
      startY = 0;
      lastY = 0;
      dragging = false;
    };

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;

      const scroller = getTargetScroller(event.target);
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 2) return;

      const touch = event.touches[0];
      activeScroller = scroller;
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = touch.clientY;
      dragging = false;
    };

    const onTouchMove = (event) => {
      if (!activeScroller || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!dragging) {
        if (Math.abs(dy) < 6) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          resetGesture();
          return;
        }
        dragging = true;
      }

      const delta = lastY - touch.clientY;
      lastY = touch.clientY;
      const max = Math.max(0, activeScroller.scrollHeight - activeScroller.clientHeight);
      activeScroller.scrollTop = Math.max(0, Math.min(max, activeScroller.scrollTop + delta));
      event.preventDefault();
    };

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', resetGesture, { capture: true, passive: true });
    document.addEventListener('touchcancel', resetGesture, { capture: true, passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', resetGesture, true);
      document.removeEventListener('touchcancel', resetGesture, true);
    };
  }, [isNativeApp]);

  if (isNativeApp) {
    return (
      <div data-bs-weight={t.weightKey || 'bold'} style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
        background: t.PAPER_BG,
        overflow: 'hidden',
        touchAction: 'auto',
        fontFamily: t.BODY,
      }}>
        <div className="bs-paper-grain" style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          background: t.PAPER_BG,
        }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div data-bs-weight={t.weightKey || 'bold'} style={{
      width: 'min(390px, calc(100vw - 16px))',
      height: 'min(844px, calc(100vh - 16px))',
      borderRadius: 54, padding: 12,
      background: t.isLight
        ? (t.paperMode === 'manila' ? '#3d2d12'
          : t.paperMode === 'steel' ? '#2a2d33'
          : t.paperMode === 'bone' ? '#2a2418'
          : '#1a1612')
        : (t.paperMode === 'teal' ? '#021f1a'
          : t.paperMode === 'blueprint' ? '#04132b'
          : t.paperMode === 'carbon' ? '#000000'
          : t.paperMode === 'oxblood' ? '#1a0608'
          : '#0a0907'),
      boxShadow: '0 30px 80px rgba(0,0,0,0.35), inset 0 0 0 2px rgba(255,255,255,0.04)',
      position: 'relative',
      fontFamily: t.BODY,
    }}>
      <div className="bs-paper-grain" style={{
        width: '100%', height: '100%', borderRadius: 42, overflow: 'hidden',
        position: 'relative', background: t.PAPER_BG,
      }}>
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          width: 110, height: 32, borderRadius: 16, background: '#000', zIndex: 100,
        }} />
        {children}
      </div>
    </div>
  );
}

// Expose
Object.assign(window, {
  BSContext, BSProvider, useBS,
  BSPage, BSMasthead, BSPageHeader, BSAvatar, BSEyebrow, BSSection, BSSlab, BSCell, BSTag, BSRow,
  BSHeadlineNumber, BSTicker, BSHalftone, BSTabBar, BSFooter, BSPhone, BSLogo, BSWordmark,
  DISPLAY_BS, BODY_BS, MONO_BS, makePalette,
});
