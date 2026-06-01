import React from 'react';
import * as ReactDOM from 'react-dom/client';
// iosAppBroadsheetMain.jsx — App entry: splash, login, role-dispatched app, Tweaks panel.

const { useState: useStateBSM, useEffect: useEffectBSM } = React;
const {
  useBS, BSProvider, BSPhone, BSLogo,
  BSRadioProvider, useBSRadio,
} = window;

let _clientBundlePromise = null;
let _prosBundlePromise = null;

function loadClientBundle() {
  if (_clientBundlePromise) return _clientBundlePromise;
  // Load the feature modules FIRST so their window globals (BSSheetProvider,
  // BSCalendarScreen, BSMarketplaceScreen, …) exist before the client module
  // evaluates and destructures them at module-load. Otherwise the client can
  // evaluate first, capture `undefined`, and crash with React #130.
  _clientBundlePromise = Promise.all([
    import('./iosAppBroadsheetCalendar.jsx'),
    import('./iosAppBroadsheetProviderApply.jsx'),
    import('./iosAppBroadsheetMarketplace.jsx'),
    import('./iosAppBroadsheetWidgets.jsx'),
    import('./iosAppBroadsheetHabits.jsx'),
  ]).then(() => import('./iosAppBroadsheetClient.jsx')).then(() => true);
  return _clientBundlePromise;
}

function loadProsBundle() {
  if (_prosBundlePromise) return _prosBundlePromise;
  // Same as the client bundle: feature modules first (they define the window
  // globals pros destructures at load — BSSheetProvider, BSCalendarScreen, …),
  // then the pros module last.
  _prosBundlePromise = Promise.all([
    import('./iosAppBroadsheetCalendar.jsx'),
    import('./iosAppBroadsheetProviderApply.jsx'),
    import('./iosAppBroadsheetMarketplace.jsx'),
    import('./iosAppBroadsheetWidgets.jsx'),
    import('./iosAppBroadsheetHabits.jsx'),
  ]).then(() => import('./iosAppBroadsheetPros.jsx')).then(() => true);
  return _prosBundlePromise;
}

async function ensureRoleBundle(role) {
  if (role === 'trainer' || role === 'nutritionist') {
    await loadProsBundle();
    return;
  }
  await loadClientBundle();
}

// Hex → "r,g,b" string for rgba(), local copy so this file can use it
// without a window roundtrip. Returns null on bad input.
function _hexToRGBmain(h) {
  if (!h || typeof h !== 'string') return null;
  let s = h.trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  if (s.length !== 6 || /[^0-9a-f]/i.test(s)) return null;
  const n = parseInt(s, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

// ── Cosmic intro background + floating Shape mark (mirrors the marketing
// index page, dialed up with more color). Shared by the splash + login. ──
let _bsSkyStyled = false;
function ensureSkyStyles() {
  if (_bsSkyStyled || typeof document === 'undefined') return;
  _bsSkyStyled = true;
  const css = `
  @keyframes bsSkyTwinkle { 0%,100%{opacity:0.2} 50%{opacity:1} }
  .bs-sky-tw { animation: bsSkyTwinkle var(--tw,3s) ease-in-out infinite; }
  @keyframes bsAuroraA { 0%,100%{ transform:translate(-6%,-4%) scale(1); } 50%{ transform:translate(8%,6%) scale(1.18); } }
  @keyframes bsAuroraB { 0%,100%{ transform:translate(6%,4%) scale(1.1); } 50%{ transform:translate(-8%,-6%) scale(1); } }
  @keyframes bsAuroraC { 0%,100%{ transform:translate(0,0) scale(1); } 50%{ transform:translate(-6%,8%) scale(1.2); } }
  .bs-aurora { position:absolute; border-radius:50%; filter:blur(46px); opacity:0.55; will-change:transform; }
  @keyframes bsShoot1 { 0%{transform:translate(0,0) rotate(18deg);opacity:0} 6%{opacity:1} 28%{opacity:0} 100%{transform:translate(380px,124px) rotate(18deg);opacity:0} }
  @keyframes bsShoot2 { 0%{transform:translate(0,0) rotate(9deg);opacity:0} 6%{opacity:1} 28%{opacity:0} 100%{transform:translate(420px,66px) rotate(9deg);opacity:0} }
  @keyframes bsShoot3 { 0%{transform:translate(0,0) rotate(24deg);opacity:0} 6%{opacity:1} 28%{opacity:0} 100%{transform:translate(340px,150px) rotate(24deg);opacity:0} }
  .bs-shoot { position:absolute; width:150px; height:1.4px; border-radius:999px; transform-origin:left center;
    background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.9)); }
  .bs-shoot.s1 { top:14%; left:-160px; animation: bsShoot1 9s linear infinite; }
  .bs-shoot.s2 { top:40%; left:-160px; animation: bsShoot2 12s linear infinite 3.5s; }
  .bs-shoot.s3 { top:9%;  left:-160px; animation: bsShoot3 11s linear infinite 6.5s; }
  @keyframes bsMarkPulse { 0%,100%{ transform:translateY(0) scale(1); filter:drop-shadow(0 0 24px rgba(10,197,168,0.75)) drop-shadow(0 0 10px rgba(46,224,196,0.65)); } 50%{ transform:translateY(-10px) scale(1.085); filter:drop-shadow(0 0 78px rgba(10,197,168,1)) drop-shadow(0 0 38px rgba(46,224,196,1)) drop-shadow(0 0 16px rgba(255,255,255,0.6)); } }
  .bs-shape-mark { animation: bsMarkPulse 2.1s ease-in-out infinite; }
  .bs-splash-zoom { transition: transform 0.7s cubic-bezier(0.5,0,0.7,0.25); transform-origin: center center; will-change: transform; }
  .bs-splash-zoom.zooming { transform: scale(7); }
  .bs-splash-zoom.zooming .bs-shape-mark { animation: none !important; transform: none !important; filter: drop-shadow(0 0 36px rgba(10,197,168,0.98)) drop-shadow(0 0 16px rgba(46,224,196,0.95)); }
  /* The mark charges, then FIRES from its centre: a radial burst pops at the
     triangle and a bright beam shoots out of it, expanding to fill (→ login). */
  .bs-splash-burst { position:absolute; left:50%; top:50%; width:170px; height:170px; transform:translate(-50%,-50%) scale(0); border-radius:50%; opacity:0; pointer-events:none; z-index:4; background:radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(46,224,196,0.9) 26%, rgba(10,197,168,0) 70%); }
  .bs-splash-burst.fire { animation: bsSplashBurst 0.55s ease-out 0.26s forwards; }
  @keyframes bsSplashBurst { 0%{ transform:translate(-50%,-50%) scale(0); opacity:0.95; } 100%{ transform:translate(-50%,-50%) scale(3.6); opacity:0; } }
  .bs-splash-beam { position:absolute; left:0; right:0; top:50%; height:5px; transform:translateY(-50%) scaleX(0) scaleY(1); transform-origin:center center; opacity:0; pointer-events:none; z-index:5; background:linear-gradient(90deg, transparent 0%, #0ac5a8 28%, #ffffff 50%, #0ac5a8 72%, transparent 100%); box-shadow:0 0 26px 6px rgba(46,224,196,0.85), 0 0 80px 26px rgba(10,197,168,0.55); }
  .bs-splash-beam.fire { animation: bsSplashBeam 0.78s cubic-bezier(0.72,0,0.84,0) 0.3s forwards; }
  @keyframes bsSplashBeam { 0%{ transform:translateY(-50%) scaleX(0) scaleY(1); opacity:0; } 18%{ opacity:1; } 38%{ transform:translateY(-50%) scaleX(1) scaleY(1); opacity:1; } 56%{ transform:translateY(-50%) scaleX(1) scaleY(1.4); opacity:1; } 100%{ transform:translateY(-50%) scaleX(1) scaleY(260); opacity:1; } }
  .bs-mark-edge { stroke-dasharray:38 97; animation: bsMarkEdge 3.2s linear infinite; }
  .bs-mark-edge.e2 { animation-delay:-1.6s; }
  @keyframes bsMarkEdge { to { stroke-dashoffset:-135; } }
  @media (prefers-reduced-motion: reduce) { .bs-sky-tw,.bs-aurora,.bs-shoot,.bs-shape-mark,.bs-mark-edge{ animation:none!important; } }
  .bs-hide-scroll { scrollbar-width: none; -ms-overflow-style: none; }
  .bs-hide-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
  `;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}

function BSNightSky() {
  ensureSkyStyles();
  const stars = React.useMemo(() => {
    const rand = (s) => { const x = Math.sin(s) * 10000; return x - Math.floor(x); };
    const arr = [];
    for (let i = 0; i < 170; i++) {
      arr.push({
        cx: (rand(i * 1.3) * 100).toFixed(2),
        cy: (rand(i * 2.7 + 1) * 100).toFixed(2),
        r: (rand(i * 3.1 + 2) * 0.7 + 0.3).toFixed(2),
        o: (0.3 + rand(i * 4.1) * 0.4).toFixed(2),
        bright: i % 6 === 0,
        tw: i % 7 === 0,
        dur: (2.4 + rand(i * 17) * 2.6).toFixed(2),
      });
    }
    return arr;
  }, []);
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', background: '#02030a' }}>
      {/* base sky + moon glow */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 130% 95% at 50% 0%, #1a2747 0%, #0b1226 38%, #060a16 70%, #02030a 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle 360px at 76% 12%, rgba(232,238,255,0.20) 0%, rgba(232,238,255,0.08) 32%, transparent 70%)' }} />
      {/* colourful drifting aurora blobs */}
      <span className="bs-aurora" style={{ width: 360, height: 360, top: '44%', left: '-14%', background: 'radial-gradient(circle, rgba(10,197,168,0.55), transparent 70%)', animation: 'bsAuroraA 22s ease-in-out infinite' }} />
      <span className="bs-aurora" style={{ width: 400, height: 400, top: '52%', right: '-18%', background: 'radial-gradient(circle, rgba(138,92,246,0.5), transparent 70%)', animation: 'bsAuroraB 27s ease-in-out infinite' }} />
      <span className="bs-aurora" style={{ width: 300, height: 300, top: '-8%', left: '40%', background: 'radial-gradient(circle, rgba(236,72,153,0.4), transparent 70%)', animation: 'bsAuroraC 31s ease-in-out infinite' }} />
      <span className="bs-aurora" style={{ width: 280, height: 280, bottom: '-12%', left: '18%', background: 'radial-gradient(circle, rgba(245,158,11,0.32), transparent 70%)', animation: 'bsAuroraA 35s ease-in-out infinite' }} />
      {/* stars */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
        {stars.map((s, i) => (
          <circle key={i} cx={s.cx + '%'} cy={s.cy + '%'} r={s.r} fill={s.bright ? '#ffffff' : '#e8eeff'} opacity={s.o}
            className={s.tw ? 'bs-sky-tw' : undefined} style={s.tw ? { '--tw': s.dur + 's' } : undefined} />
        ))}
      </svg>
      {/* shooting stars */}
      <span className="bs-shoot s1" /><span className="bs-shoot s2" /><span className="bs-shoot s3" />
    </div>
  );
}

function BSShapeMark({ size = 104 }) {
  ensureSkyStyles();
  return (
    <svg className="bs-shape-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden focusable="false" style={{ display: 'block' }}>
      <polygon points="20,40 20,88 56,64" fill="#0ac5a8" />
      <polygon points="80,12 80,60 44,36" fill="#ffffff" />
      <polygon className="bs-mark-edge e1" points="20,40 20,88 56,64" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon className="bs-mark-edge e2" points="80,12 80,60 44,36" fill="none" stroke="#0ac5a8" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

// The SHAPE Daily. wordmark in light, for use over the night sky.
function BSCosmicWordmark({ scale = 1 }) {
  return (
    <div className="bs-splash-title" style={{ textAlign: 'center', lineHeight: 1, whiteSpace: 'nowrap', color: '#f4efe6' }}>
      <span className="bs-splash-the" style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 700, fontSize: 31 * scale, letterSpacing: '-0.055em' }}>The</span>
      <span className="bs-splash-shape" style={{ display: 'inline-block', marginLeft: 8 * scale, marginRight: 10 * scale, fontFamily: `'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif`, fontWeight: 300, fontSize: 37 * scale, letterSpacing: '0.18em', textTransform: 'uppercase', transform: 'translateY(1px)', color: '#ffffff' }}>SHAPE</span>
      <span className="bs-splash-daily" style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 700, fontSize: 31 * scale, letterSpacing: '-0.055em' }}>Daily.</span>
    </div>
  );
}

// Share the cosmic background + mark with the role bundles (home, radio).
if (typeof window !== 'undefined') {
  window.BSNightSky = BSNightSky;
  window.BSShapeMark = BSShapeMark;
}

// Switchable decorative background for the Classified splash.
// Options: plain | newsprint | watermark | engraved | halftone | grid
function SplashBackdrop({ bg = 'newsprint', inkRgb, t }) {
  if (bg === 'plain') return null;

  if (bg === 'watermark') {
    return (
      <>
        <div aria-hidden style={{
          position: 'absolute', left: 0, right: 0, top: '40%', textAlign: 'center', pointerEvents: 'none',
          transform: 'translateY(-50%)',
          fontFamily: `'Italiana', 'DM Serif Display', serif`,
          fontSize: 240, lineHeight: 0.78, letterSpacing: '-0.04em', fontStyle: 'italic',
          color: `rgba(${inkRgb},0.07)`, userSelect: 'none', whiteSpace: 'nowrap',
        }}>Shape</div>
        <div aria-hidden style={{ position: 'absolute', top: 38, left: 14, right: 14, height: 1, background: `rgba(${inkRgb},0.4)`, pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: 14, left: 14, right: 14, height: 1, background: `rgba(${inkRgb},0.25)`, pointerEvents: 'none' }} />
      </>
    );
  }

  if (bg === 'engraved') {
    const stripes = `repeating-linear-gradient(135deg, rgba(${inkRgb},0.085) 0, rgba(${inkRgb},0.085) 1px, transparent 1px, transparent 6px)`;
    return (
      <>
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: stripes,
        }} />
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 70% 55% at 50% 40%, ${t.PAPER} 0%, transparent 75%)`,
        }} />
      </>
    );
  }

  if (bg === 'halftone') {
    const dots = `radial-gradient(rgba(${inkRgb},0.30) 1.2px, transparent 1.6px)`;
    return (
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: dots, backgroundSize: '8px 8px',
        WebkitMaskImage: `radial-gradient(ellipse 90% 80% at 50% 100%, black 0%, rgba(0,0,0,0.7) 35%, transparent 80%)`,
        maskImage: `radial-gradient(ellipse 90% 80% at 50% 100%, black 0%, rgba(0,0,0,0.7) 35%, transparent 80%)`,
      }} />
    );
  }

  if (bg === 'grid') {
    const grid = `repeating-linear-gradient(0deg, rgba(${inkRgb},0.10) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, rgba(${inkRgb},0.10) 0 1px, transparent 1px 32px)`;
    return (
      <>
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: grid }} />
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 60% 50% at 50% 35%, ${t.PAPER} 0%, transparent 70%)`,
        }} />
      </>
    );
  }

  // Default: newsprint — dots + stripes + watermark + corner rules
  const dots = `radial-gradient(rgba(${inkRgb},0.16) 1px, transparent 1.4px)`;
  const stripes = `repeating-linear-gradient(135deg, rgba(${inkRgb},0.05) 0, rgba(${inkRgb},0.05) 1px, transparent 1px, transparent 8px)`;
  return (
    <>
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: stripes }} />
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: dots, backgroundSize: '7px 7px',
        WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 35%, transparent 0%, transparent 35%, black 90%)',
        maskImage: 'radial-gradient(ellipse 75% 65% at 50% 35%, transparent 0%, transparent 35%, black 90%)',
      }} />
      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, bottom: 92, textAlign: 'center', pointerEvents: 'none',
        fontFamily: `'Italiana', 'DM Serif Display', serif`,
        fontSize: 200, lineHeight: 0.78, letterSpacing: '-0.04em', fontStyle: 'italic',
        color: `rgba(${inkRgb},0.045)`, userSelect: 'none', whiteSpace: 'nowrap',
      }}>Shape</div>
      <div aria-hidden style={{ position: 'absolute', top: 38, left: 14, right: 14, height: 1, background: `rgba(${inkRgb},0.4)`, pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: 14, left: 14, right: 14, height: 1, background: `rgba(${inkRgb},0.25)`, pointerEvents: 'none' }} />
    </>
  );
}

function BSSplash({ onDone, style, bg = 'plain', bgColor }) {
  const t = useBS();
  const SPLASH_FACE = "'Saira', 'Arial Narrow', 'Helvetica Neue', sans-serif";
  // Classified is interactive: user must tap "Step inside" — no auto-advance.
  useEffectBSM(() => {
    if (style === 'classified') return; // classified is tap-only
    const id = setTimeout(onDone, style === 'classified' ? 4200 : (style === 'cosmos' || !style) ? 2600 : 1600);
    return () => clearTimeout(id);
  }, [style]);

  // ── 0. COSMOS (default): colourful night sky + floating Shape mark ──
  if (style === 'cosmos' || !style) {
    return (
      <div onClick={onDone} style={{ position: 'absolute', inset: 0, color: '#f4efe6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}>
        <BSNightSky />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BSShapeMark size={132} />
        </div>
      </div>
    );
  }

  // ── 1. MASTHEAD: rule-bound vol/no, big stacked title, footer
  if (style === 'masthead') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '54px 20px 40px' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${t.INK}`, paddingBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><BSLogo size={22} color={t.INK} /> Vol. 1 · No. 1</span>
          <span>Thu · May 21 · 2026</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="bs-splash-title" style={{ textAlign: 'center', lineHeight: 1, width: '100%', margin: '0 auto', paddingBottom: 16, borderBottom: `3px solid ${t.INK}` }}>
            <span style={{ display: 'block', textAlign: 'center', lineHeight: 1, whiteSpace: 'nowrap' }}>
              <span className="bs-splash-the" style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>The</span>
              <span className="bs-splash-shape" style={{ display: 'inline-block', marginLeft: 8, marginRight: 10, fontFamily: `'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif`, fontWeight: 300, fontStyle: 'normal', fontSize: 37, letterSpacing: '0.18em', textTransform: 'uppercase', transform: 'translateY(1px)' }}>SHAPE</span>
              <span className="bs-splash-daily" style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>Daily.</span>
            </span>
          </div>
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center', borderTop: `1px solid ${t.RULE}`, paddingTop: 14 }}>
          Loading edition…
        </div>
      </div>
    );
  }

  // ── 2. DROPCAP: massive S, small column type beside it
  if (style === 'dropcap') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column', padding: '54px 20px 40px' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, display: 'flex', justifyContent: 'space-between', borderBottom: `2px solid ${t.INK}`, paddingBottom: 10 }}>
          <span>The Shape Daily</span><span>Edition · 2026</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 320, lineHeight: 0.78, letterSpacing: '-0.07em', color: t.INK }}>S</div>
          <div style={{ position: 'absolute', right: 16, bottom: 60, textAlign: 'right' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, fontWeight: 700 }}>The Shape</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 28, letterSpacing: '-0.03em', color: t.INK, marginTop: 4 }}>Daily</div>
          </div>
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, textAlign: 'left', borderTop: `1px solid ${t.RULE}`, paddingTop: 14 }}>
          Loading · Vol. 1
        </div>
      </div>
    );
  }

  // ── 3. FRONTPAGE: full mock cover — masthead, halftone block, headline, bylines, ticker
  if (style === 'frontpage') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '50px 18px 8px' }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${t.RULE}`, paddingBottom: 6 }}>
            <span>Vol. 1 · No. 1</span><span>May 21 · 2026</span><span>$0 · Daily</span>
          </div>
          <div style={{ borderBottom: `3px double ${t.INK}`, padding: '12px 0 14px', display: 'flex', justifyContent: 'center' }}>
            <BSWordmark size={42} full color={t.INK} />
          </div>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center', padding: '4px 0' }}>
            Train · Eat · Recover · Repeat
          </div>
        </div>

        {/* Mini halftone hero */}
        <div style={{ margin: '4px 18px 0', height: 130, background: t.INK, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(${t.PAPER} 22%, transparent 23%), radial-gradient(${t.PAPER} 22%, transparent 23%)`,
            backgroundSize: '7px 7px',
            backgroundPosition: '0 0, 3.5px 3.5px',
            opacity: 0.85,
          }} />
        </div>

        {/* Headline */}
        <div style={{ padding: '14px 18px 6px' }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.AMBER, fontWeight: 700, marginBottom: 6 }}>▍ Today's edition</div>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 30, lineHeight: 0.92, letterSpacing: '-0.035em' }}>Pull day. Peak week. Tempo wins.</div>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginTop: 8 }}>By Jordan Chen · Coach</div>
        </div>

        {/* Footer ticker */}
        <div style={{ marginTop: 'auto', background: t.INK, color: t.PAPER, padding: '10px 14px', display: 'flex', gap: 14, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          <span style={{ color: t.AMBER, fontWeight: 700 }}>Loading…</span>
          <span style={{ opacity: 0.6 }}>CAL 1568/2100</span>
          <span style={{ opacity: 0.6 }}>SLP 7H24M</span>
        </div>
      </div>
    );
  }

  // ── 4. VAULT: ink background with hairline frame, monogram
  if (style === 'vault') {
    const TEAL = '#0ac5a8';
    return (
      <div style={{ position: 'absolute', inset: 0, background: t.INK, color: t.PAPER, padding: 18 }}>
        <div style={{ position: 'absolute', inset: 18, border: `1px solid ${t.PAPER}`, opacity: 0.35 }} />
        <div style={{ position: 'absolute', inset: 24, border: `1px solid ${t.PAPER}`, opacity: 0.6 }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <BSLogo size={64} color={TEAL} />
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.32em', textTransform: 'uppercase', color: TEAL, fontWeight: 700, marginTop: 14 }}>The Shape Daily</div>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 120, lineHeight: 0.86, letterSpacing: '-0.06em', color: t.PAPER, marginTop: 10, marginBottom: 14, textAlign: 'center' }}>
            SD
          </div>
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase', color: t.PAPER, opacity: 0.7 }}>Vol. 1 · No. 1</div>
          <div style={{ marginTop: 24, width: 90, height: 1, background: t.PAPER, opacity: 0.4 }} />
          <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.PAPER, opacity: 0.5 }}>Loading edition…</div>
        </div>
      </div>
    );
  }

  // ── 5. CLASSIFIED: dense newspaper classifieds, wordmark as featured listing
  if (style === 'classified') {
    const STATIC_INSIDE = [
      { tag: 'SHP-01',  title: 'Shape Score 2.0',         meta: 'Tiers + rewards, live now',         col: 1 },
      { tag: 'SHP-04',  title: 'Coach chat, instant',     meta: 'Reactions · voice notes · video',   col: 1 },
      { tag: 'SHP-12',  title: 'Marketplace · 410 coaches', meta: '+38 verified this week',          col: 1 },
      { tag: 'SHP-19',  title: 'Personal challenges',     meta: 'Your coach writes them, you run',   col: 1 },
      { tag: 'SHP-22',  title: 'Block 3 unlocked',        meta: 'Hypertrophy · 4 weeks',             col: 1 },
    ];
    const STATIC_WORLD = [
      { tag: 'NWS-18',  title: 'GLP-1 + lifting',         meta: 'Lancet · muscle preservation',      col: 2 },
      { tag: 'NWS-22',  title: 'Protein floor is 1g/lb',  meta: 'Schoenfeld meta-analysis, May',     col: 2 },
      { tag: 'WLB-03',  title: 'Sleep is the new gym',    meta: 'Stanford · HRV + recovery',         col: 2 },
      { tag: 'WLB-09',  title: 'Cold plunge ≠ recovery',  meta: 'JPhysiol · blunts hypertrophy',     col: 2 },
      { tag: 'MND-14',  title: 'Walking lowers anxiety',  meta: 'JAMA Psychiatry · 30m/day',         col: 2 },
    ];

    // Today's editorial date — "Thu · May 28 · 2026"
    const today = new Date();
    const wkday = today.toLocaleDateString([], { weekday: 'short' });
    const month = today.toLocaleDateString([], { month: 'short' });
    const day   = today.getDate();
    const year  = today.getFullYear();
    const dateLine = `${wkday} · ${month} ${day} · ${year}`;
    const dateShort = `${wkday} · ${month} ${day}`;

    // Hydrate "Inside Shape" with recent community posts when available
    // (the feed endpoint allows anon reads). Falls back to the static
    // editorial blurbs when the feed is empty or unreachable.
    const [insideItems, setInsideItems] = React.useState(STATIC_INSIDE);
    React.useEffect(() => {
      let alive = true;
      fetch('/api/community/feed', { credentials: 'same-origin', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!alive || !d || !Array.isArray(d.posts) || !d.posts.length) return;
          const ago = (iso) => {
            const ms = Date.now() - new Date(iso).getTime();
            if (ms < 60_000) return 'just now';
            if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
            if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
            return `${Math.floor(ms / 86_400_000)}d ago`;
          };
          const tagFor = (a) => {
            const t = String(a || '').toLowerCase();
            if (t === 'pr' || t === 'strength' || t === 'workout') return 'STR';
            if (t === 'run' || t === 'race') return 'RUN';
            if (t === 'meal' || t === 'nutrition') return 'EAT';
            return 'SHP';
          };
          const hydrated = d.posts.slice(0, 5).map((p, i) => ({
            tag: `${tagFor(p.activity_type)}-${String(i + 1).padStart(2, '0')}`,
            title: p.title || p.note || 'Update',
            meta: `${p.author_name || 'Member'} · ${ago(p.created_at)}`,
            col: 1,
          }));
          setInsideItems(hydrated);
        })
        .catch(() => {});
      return () => { alive = false; };
    }, []);

    const items = [...insideItems, ...STATIC_WORLD];
    const _bgRGB = bgColor && bgColor !== 'auto' ? _hexToRGBmain(bgColor) : null;
    const inkRgbCl = _bgRGB || t.inkRGB || (t.isLight ? '15,14,12' : '244,237,224');
    return (
      <div onClick={onDone} style={{ position: 'absolute', inset: 0, background: '#02030a', color: t.INK, padding: '50px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', cursor: 'pointer' }}>
        <BSNightSky />

        <div style={{ position: 'relative', zIndex: 1, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, display: 'flex', justifyContent: 'space-between', borderBottom: `2px solid ${t.INK}`, paddingBottom: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BSLogo size={16} color={t.INK} /> Classifieds</span>
          <span style={{ fontWeight: 700, color: t.INK }}>{dateShort}</span>
        </div>

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', paddingTop: 6 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.32em', color: t.INK50, textTransform: 'uppercase' }}>★ Featured</div>
          <div style={{ marginTop: 8, paddingTop: 12, paddingBottom: 12, borderTop: `1px solid ${t.INK}`, borderBottom: `1px solid ${t.INK}` }}>
            <div className="bs-splash-title" style={{ lineHeight: 1, width: '100%', margin: '0 auto', textAlign: 'center', paddingBottom: 12, borderBottom: `3px solid ${t.INK}` }}>
              <span style={{ display: 'block', whiteSpace: 'nowrap', width: '100%', lineHeight: 1 }}>
                <span className="bs-splash-the" style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>The</span>
                <span className="bs-splash-shape" style={{ display: 'inline-block', marginLeft: 8, marginRight: 10, fontFamily: `'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif`, fontWeight: 300, fontStyle: 'normal', fontSize: 37, letterSpacing: '0.18em', textTransform: 'uppercase', transform: 'translateY(1px)' }}>SHAPE</span>
                <span className="bs-splash-daily" style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 700, fontSize: 31, letterSpacing: '-0.055em' }}>Daily.</span>
              </span>
            </div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, marginTop: 18 }}>Today's edition · <span style={{ fontWeight: 700, color: t.INK }}>{dateLine}</span></div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 0, flex: 1, marginTop: 4 }}>
          {[1, 2].map(col => (
            <React.Fragment key={col}>
              {col === 2 && <div style={{ background: t.RULE }} />}
              <div style={{ paddingRight: col === 1 ? 10 : 0, paddingLeft: col === 2 ? 10 : 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.24em', color: t.INK, textTransform: 'uppercase', borderBottom: `2px solid ${t.INK}`, paddingBottom: 5 }}>
                  {col === 1 ? 'Inside Shape' : 'In the world'}
                </div>
                {items.filter(i => i.col === col).map((it, i) => {
                  const tagColor = it.tag.startsWith('SHP') ? t.ACCENT
                                  : it.tag.startsWith('MND') ? '#a86bc4'
                                  : it.tag.startsWith('WLB') ? '#7ed4ff'
                                  : t.INK;
                  return (
                    <div key={i}>
                      <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', color: tagColor, fontWeight: 700, marginBottom: 3 }}>{it.tag}</div>
                      <div style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 15, letterSpacing: '-0.012em', color: t.INK, lineHeight: 1.15 }}>{it.title}</div>
                      <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', color: t.INK50, marginTop: 3, textTransform: 'uppercase' }}>{it.meta}</div>
                    </div>
                  );
                })}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* CTA — actual intro page, user must tap to advance */}
        <button onClick={onDone} style={{ borderRadius: t.RADIUS_SM,
          marginTop: 4,
          padding: '14px 16px', position: 'relative', zIndex: 1,
          background: t.INK, color: t.PAPER, border: 0,
          fontFamily: t.MONO, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.28em', textTransform: 'uppercase',
          cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14,
        }}>
          <span>Step inside</span>
          <span style={{ letterSpacing: 0 }}>→</span>
        </button>

        <div style={{ position: 'relative', zIndex: 1, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center' }}>
          ★ A daily for the body & mind ★
        </div>
      </div>
    );
  }

  // ── 6. TICKER: market-paper aesthetic, scrolling tape + tabular metrics
  if (style === 'ticker') {
    const tape = ['CAL 1568/2100', 'PRO 118G', 'SLP 7H24M', 'HRV 62MS', 'RHR 54', 'WGT 178.2', 'STREAK 14D', 'SCORE 78'];
    const rows = [
      { sym: 'TRN', val: '52m',    chg: '+8m',   up: true  },
      { sym: 'EAT', val: '1568k',  chg: '−25%',  up: true  },
      { sym: 'SLP', val: '7:24',   chg: '+:28',  up: true  },
      { sym: 'RHR', val: '54bpm',  chg: '+2',    up: false },
      { sym: 'WGT', val: '178.2',  chg: '−0.4',  up: true  },
    ];
    return (
      <div style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column' }}>
        {/* Top tape */}
        <div style={{ background: t.INK, color: t.PAPER, padding: '54px 0 0' }}>
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', padding: '8px 0', borderTop: `1px solid ${t.PAPER}`, borderBottom: `1px solid ${t.PAPER}`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            <div style={{ display: 'inline-block', animation: 'bs-tape 18s linear infinite' }}>
              {[...tape, ...tape].map((s, i) => (
                <span key={i} style={{ marginRight: 24 }}>
                  <span style={{ color: t.AMBER, fontWeight: 700, marginRight: 6 }}>▲</span>{s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Headline block */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <BSLogo size={20} color={t.INK} />
            <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.INK70, fontWeight: 700 }}>Daily Index · 04:21</span>
          </div>
          <div style={{ lineHeight: 0.92 }}>
            <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 60, letterSpacing: '-0.035em', display: 'block' }}>The</span>
            <span style={{
              fontFamily: `'Italiana', 'DM Serif Display', serif`,
              fontWeight: 400, fontSize: 100, letterSpacing: '-0.02em',
              display: 'block', marginTop: 2, marginBottom: 2,
              lineHeight: 1.0,
            }}>Shape</span>
            <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 60, letterSpacing: '-0.035em', display: 'block' }}>Daily.</span>
          </div>

          {/* Tabular metrics */}
          <div style={{ marginTop: 22, borderTop: `2px solid ${t.INK}` }}>
            {rows.map((r, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '50px 1fr auto',
                padding: '7px 0', borderBottom: `1px solid ${t.RULE}`,
                fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.08em',
              }}>
                <span style={{ color: t.INK70, fontWeight: 700, letterSpacing: '0.18em' }}>{r.sym}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: t.INK }}>{r.val}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: r.up ? t.GREEN : t.RUST, fontWeight: 700 }}>{r.up ? '▲' : '▼'} {r.chg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom strip */}
        <div style={{ background: t.INK, color: t.PAPER, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          <span style={{ color: t.AMBER, fontWeight: 700 }}>● Live</span>
          <span style={{ opacity: 0.6 }}>Loading edition…</span>
          <span style={{ opacity: 0.6 }}>Vol. 1</span>
        </div>

        <style>{`@keyframes bs-tape { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      </div>
    );
  }

  return null;
}

// Coerce user input to E.164 (+15551234567). A bare 10-digit US number gets a
// +1; anything already starting with + is left alone; other digit strings get
// a leading +. Supabase / Twilio require E.164.
function _bsNormalizePhone(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/[^\d]/g, '');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length === 10) return '+1' + digits;
  return '+' + digits;
}

function BSLogin({ onLogin, onBrowse, onApply, role, setRole, initialMode }) {
  const t = useBS();
  const [mode, setMode] = useStateBSM(initialMode || 'signin'); // 'signin' | 'create'
  const [authMethod, setAuthMethod] = useStateBSM('email'); // 'email' | 'phone'
  const [fullName, setFullName] = useStateBSM('');
  const [email, setEmail] = useStateBSM('');
  const [password, setPassword] = useStateBSM('');
  const [phone, setPhone] = useStateBSM('');
  const [otpCode, setOtpCode] = useStateBSM('');
  const [otpSent, setOtpSent] = useStateBSM(false);
  const [authError, setAuthError] = useStateBSM('');
  const [busy, setBusy] = useStateBSM(false);
  const [verifyEmail, setVerifyEmail] = useStateBSM(''); // set → show the "check your email" screen
  const isCreate = mode === 'create';
  const isPhone = authMethod === 'phone';
  const submitAuth = async () => {
    setAuthError('');
    const auth = window.ShapeAuth;
    const trimmedEmail = email.trim();
    if (auth?.configured && (!trimmedEmail || !password)) {
      setAuthError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const result = isCreate
        ? await auth.signUp({ email: trimmedEmail, password, fullName: fullName.trim(), role })
        : await auth.signIn({ email: trimmedEmail, password, role });
      // New account needs email confirmation → show the verify screen, don't enter the app.
      if (result?.needsEmailConfirmation) { setVerifyEmail(result.email || trimmedEmail); return; }
      const nextRole = result?.profile?.role;
      if (nextRole && nextRole !== role) setRole(nextRole);
      onLogin(result);
    } catch (error) {
      setAuthError(error?.message || 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };
  const resendVerify = async () => {
    try { await window.ShapeAuth?.resendConfirmation?.(verifyEmail); window.__bsToast?.('Verification email re-sent', 'ok'); }
    catch (e) { window.__bsToast?.(e?.message || 'Could not resend the email.', 'err'); }
  };
  // Phone — step 1: text the code.
  const sendPhoneCode = async () => {
    setAuthError('');
    const auth = window.ShapeAuth;
    const e164 = _bsNormalizePhone(phone);
    if (!e164 || e164.length < 8) {
      setAuthError('Enter a valid phone number, e.g. +1 555 123 4567.');
      return;
    }
    setPhone(e164);
    setBusy(true);
    try {
      await auth.signInWithPhone({ phone: e164, fullName: fullName.trim(), role });
      setOtpSent(true);
    } catch (error) {
      setAuthError(error?.message || 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };
  // Phone — step 2: verify the code and sign in.
  const verifyPhoneCode = async () => {
    setAuthError('');
    const auth = window.ShapeAuth;
    if (!otpCode.trim()) {
      setAuthError('Enter the code we texted you.');
      return;
    }
    setBusy(true);
    try {
      const result = await auth.verifyPhoneOtp({ phone: _bsNormalizePhone(phone), token: otpCode.trim(), fullName: fullName.trim(), role });
      const nextRole = result?.profile?.role;
      if (nextRole && nextRole !== role) setRole(nextRole);
      onLogin(result);
    } catch (error) {
      setAuthError(error?.message || 'That code did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const switchMethod = (m) => {
    setAuthMethod(m);
    setAuthError('');
    setOtpSent(false);
    setOtpCode('');
  };
  // Light-on-night-sky palette (mirrors the marketing index page).
  const CREAM = '#f4efe6';
  const C70 = 'rgba(244,239,230,0.72)';
  const C50 = 'rgba(244,239,230,0.5)';
  const LINE = 'rgba(244,239,230,0.18)';
  const LINE2 = 'rgba(244,239,230,0.34)';
  const FIELD = 'rgba(255,255,255,0.05)';
  const SHAPE_GRAD = { background: 'linear-gradient(90deg, #2ee0c4, #8a5cf6 70%, #ec4899)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' };
  const inputStyle = { width: '100%', boxSizing: 'border-box', borderRadius: t.RADIUS_SM, background: FIELD, border: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE2}`, padding: '8px 11px', fontFamily: t.DISPLAY, fontSize: 14, color: CREAM, outline: 'none' };
  const labelStyle = { fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C50, marginBottom: 7 };
  const linkBtn = { background: 'transparent', border: 0, color: C50, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '2px 0' };
  const roleLabel = { client: 'Client', trainer: 'Trainer', nutritionist: 'Nutritionist' }[role] || 'Client';
  // Forgot password — best effort via the auth layer; degrades to a neutral notice.
  const forgotPassword = async () => {
    setAuthError('');
    const auth = window.ShapeAuth;
    const e = email.trim();
    if (!e) { setAuthError('Enter your email first, then tap forgot password.'); return; }
    try {
      if (auth?.resetPassword) { await auth.resetPassword(e); }
      window.__bsToast?.('If that account exists, a reset link is on its way.', 'ok');
    } catch (err) { setAuthError(err?.message || 'Could not send the reset email.'); }
  };
  // Continue with Apple — uses the auth layer if wired, else a graceful notice.
  const continueWithApple = async () => {
    setAuthError('');
    const auth = window.ShapeAuth;
    try {
      if (auth?.signInWithApple) { const result = await auth.signInWithApple({ role }); onLogin(result); }
      else if (auth?.signInWithOAuth) { await auth.signInWithOAuth('apple', { role }); }
      else { window.__bsToast?.('Apple sign-in is coming soon.', 'info'); }
    } catch (err) { setAuthError(err?.message || 'Apple sign-in failed.'); }
  };

  // "Check your email" — shown after a new account needs email verification.
  if (verifyEmail) {
    return (
      <div style={{ position: 'absolute', inset: 0, color: CREAM, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <BSNightSky />
        <div className="bs-hide-scroll" style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'max(40px, calc(env(safe-area-inset-top, 0px) + 24px)) 24px calc(28px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
          <img src={`${import.meta.env.BASE_URL}shape-logo.png`} alt="Shape" style={{ width: 110, height: 'auto', alignSelf: 'flex-start', marginLeft: -12 }} />
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#2ee0c4', fontWeight: 700 }}>Verify email</div>
          <div style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 500, fontSize: 38, lineHeight: 0.95, letterSpacing: '-0.05em', color: CREAM }}>Check your<br/><span style={{ fontStyle: 'italic', color: '#2ee0c4' }}>inbox.</span></div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.5, color: 'rgba(244,239,230,0.8)' }}>
            We sent a verification link to <span style={{ color: CREAM, fontWeight: 700 }}>{verifyEmail}</span>. Tap it to finish creating your account, then come back and sign in.
          </div>
          <button onClick={resendVerify} style={{ width: '100%', borderRadius: 12, padding: '12px 16px', background: 'transparent', color: CREAM, border: `1px solid ${LINE2}`, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Resend email</button>
          <button onClick={() => { setVerifyEmail(''); setMode('signin'); setPassword(''); }} style={{ alignSelf: 'center', background: 'transparent', border: 0, color: C50, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '4px 0' }}>← Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, color: CREAM, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <BSNightSky />
      <div className="bs-hide-scroll" style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'max(20px, calc(env(safe-area-inset-top, 0px) + 12px)) 22px calc(20px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 7 }}>
        {/* Logo lockup — top-left */}
        <img src={`${import.meta.env.BASE_URL}shape-logo.png`} alt="Shape" style={{ width: 120, height: 'auto', display: 'block', marginLeft: -13, marginTop: -50 }} />

        {/* Eyebrow + heading */}
        <div style={{ marginTop: 48 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#2ee0c4', fontWeight: 700 }}>
            {isCreate ? 'Join Shape' : 'Sign in'}
          </div>
          <div style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 500, fontSize: 32, lineHeight: 0.94, letterSpacing: '-0.045em', color: CREAM, marginTop: 4 }}>
            {isCreate ? (
              <>Join the<br/><span style={{ fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.065em', color: '#2ee0c4' }}>community.</span></>
            ) : (
              <>Welcome<br/><span style={{ fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.065em', color: '#2ee0c4' }}>back.</span></>
            )}
          </div>
        </div>

        {/* Role */}
        <div>
          <div style={labelStyle}>I'm a</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, border: `1px solid ${LINE2}`, borderRadius: 999, padding: 4 }}>
            {[['client','Client'],['trainer','Trainer'],['nutritionist','Nutritionist']].map(([k, l]) => {
              const on = role === k;
              return <button key={k} onClick={() => setRole(k)} style={{
                padding: '7px 4px', borderRadius: 999, border: 0,
                background: on ? '#0ac5a8' : 'transparent', color: on ? '#031f1c' : CREAM,
                fontFamily: t.DISPLAY, fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{l}</button>;
            })}
          </div>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isCreate && (
            <div><div style={labelStyle}>Full name</div>
              <input placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
            </div>
          )}
          {isPhone ? (
            <>
              <button type="button" onClick={() => switchMethod('email')} style={{ alignSelf: 'flex-start', background: 'transparent', border: 0, color: '#2ee0c4', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '0 0 2px' }}>← Back to email</button>
              <div><div style={labelStyle}>Phone</div>
                <input placeholder="+1 555 123 4567" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" disabled={otpSent} style={{ ...inputStyle, color: otpSent ? C50 : CREAM }} />
              </div>
              {otpSent && (
                <div><div style={labelStyle}>Code</div>
                  <input placeholder="6-digit code" type="tel" inputMode="numeric" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} autoComplete="one-time-code" style={{ ...inputStyle, fontSize: 20, letterSpacing: '0.3em' }} />
                </div>
              )}
              {otpSent && (
                <button onClick={() => { setOtpSent(false); setOtpCode(''); setAuthError(''); }} style={{ alignSelf: 'flex-start', ...linkBtn }}>← Change number</button>
              )}
            </>
          ) : (
            <>
              <div><div style={labelStyle}>Email</div>
                <input placeholder="you@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />
              </div>
              <div><div style={labelStyle}>Password</div>
                <input placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isCreate ? 'new-password' : 'current-password'} style={inputStyle} />
              </div>
            </>
          )}
          {authError && (
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ff9b7a', lineHeight: 1.35 }}>
              {authError}
            </div>
          )}
          {!isCreate && !isPhone && (
            <button onClick={forgotPassword} style={{ alignSelf: 'flex-end', background: 'transparent', border: 0, color: '#2ee0c4', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', padding: '2px 0' }}>Forgot password →</button>
          )}
        </div>

        {/* Primary action — cream button */}
        <button
          onClick={isPhone ? (otpSent ? verifyPhoneCode : sendPhoneCode) : submitAuth}
          disabled={busy}
          style={{ width: '100%', borderRadius: 12, padding: '10px 16px', background: '#0ac5a8', color: '#031f1c', border: 0, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy
            ? (isCreate ? 'Creating…' : 'Signing in…')
            : isPhone
              ? (otpSent ? (isCreate ? 'Verify & join →' : 'Verify & sign in →') : 'Text me a code →')
              : (isCreate ? `Join as ${roleLabel} →` : `Sign in as ${roleLabel} →`)}
        </button>

        {/* Create account / apply — role-aware: clients create an account,
            trainers & nutritionists route to the Apply to Shape application. */}
        {!isCreate && (
          <button onClick={() => {
            setAuthError('');
            if (role === 'trainer' || role === 'nutritionist') { if (onApply) onApply(role); else setMode('create'); }
            else { setMode('create'); }
          }} style={{ width: '100%', borderRadius: 12, padding: '10px 16px', background: 'transparent', color: CREAM, border: `1px solid ${CREAM}`, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            {role === 'client' ? 'Create account →' : `Apply as a ${roleLabel} →`}
          </button>
        )}

        {/* OR */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: LINE }} />
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: C50 }}>or</div>
          <div style={{ flex: 1, height: 1, background: LINE }} />
        </div>

        {/* Continue with phone — switches to the SMS one-time-code flow */}
        {!isPhone && (
          <button onClick={() => switchMethod('phone')} style={{ width: '100%', borderRadius: 12, padding: 9, background: 'rgba(255,255,255,0.04)', color: CREAM, border: `1px solid ${LINE2}`, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            Continue with phone number
          </button>
        )}

        {/* Secondary links */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px 16px', marginTop: 26 }}>
          <button onClick={() => { setMode(isCreate ? 'signin' : 'create'); setAuthError(''); }} style={linkBtn}>{isCreate ? 'Have an account? Sign in' : 'New here? Join Shape'}</button>
          {isPhone && <button onClick={() => switchMethod('email')} style={linkBtn}>Use email instead</button>}
          <button onClick={onBrowse} style={{ background: 'rgba(46,224,196,0.12)', border: '1px solid #2ee0c4', borderRadius: 999, color: '#2ee0c4', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '8px 16px' }}>No account? Browse the app →</button>
        </div>
      </div>
    </div>
  );
}

function BSPreviewNotice({ onClose, onSignIn }) {
  const t = useBS();
  return (
    <div style={{ borderRadius: t.RADIUS_SM,
      position: 'absolute',
      top: 24, left: 18, right: 18,
      zIndex: 60,
      background: t.PAPER,
      color: t.INK,
      border: `1.5px solid ${t.INK}`,
      boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
      padding: '7px 9px',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{
        flex: '0 0 auto',
        background: t.ACCENT, color: t.INK,
        fontFamily: t.MONO, fontSize: 9, fontWeight: 800,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        padding: '3px 5px',
      }}>Preview</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 11.5, letterSpacing: '-0.005em', color: t.INK, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Browsing without an account
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, marginTop: 2, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Stats &amp; activity are AI-generated for preview · Marketplace data is live.
        </div>
        {onSignIn && (
          <button onClick={onSignIn} style={{ borderRadius: t.RADIUS_SM,
            marginTop: 3, padding: '3px 7px', cursor: 'pointer',
            background: 'transparent', color: t.INK,
            border: `1px solid ${t.INK}`,
            fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700,
          }}>Sign in →</button>
        )}
      </div>

      <button onClick={onClose} aria-label="Dismiss" style={{ borderRadius: t.RADIUS_SM,
        flex: '0 0 auto',
        background: 'transparent', border: 0, color: t.INK50,
        fontFamily: t.MONO, fontSize: 14, lineHeight: 1, cursor: 'pointer', padding: '2px 2px',
      }}>×</button>
    </div>
  );
}

function BSSubscribeBanner({ onJoin, onClose }) {
  const t = useBS();
  // Always sit "opposite" the paper for contrast: dark surface on light paper, paper surface on dark paper.
  const isDark = !t.isLight;
  const surface = isDark ? 'rgba(245,240,230,0.86)' : 'rgba(20,18,14,0.72)';
  const fg      = isDark ? t.INK : t.PAPER;     // text color on the banner
  const fgMuted = isDark ? 'rgba(15,14,12,0.55)' : 'rgba(242,237,228,0.55)';
  const borderC = isDark ? 'rgba(15,14,12,0.18)' : 'rgba(242,237,228,0.18)';
  const btnBg   = isDark ? t.INK   : t.PAPER;
  const btnFg   = isDark ? t.PAPER : t.INK;
  return (
    <div style={{ borderRadius: t.RADIUS_SM,
      position: 'absolute',
      // Sit above the tab bar (~58–66px tall depending on safe-area).
      left: 18, right: 18, bottom: 92,
      zIndex: 60,
      background: surface,
      WebkitBackdropFilter: 'blur(14px) saturate(140%)',
      backdropFilter: 'blur(14px) saturate(140%)',
      color: fg,
      border: `1px solid ${borderC}`,
      boxShadow: '0 6px 18px rgba(0,0,0,0.16)',
      padding: '7px 9px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 11.5, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.05, color: fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Join the Shape community
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.13em', textTransform: 'uppercase', color: fgMuted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          $5 / mo · cancel anytime
        </div>
      </div>
      <button onClick={onJoin} style={{ borderRadius: t.RADIUS_SM,
        padding: '6px 10px', background: btnBg, color: btnFg, border: 0,
        fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
        textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap',
      }}>Join →</button>
      <button onClick={onClose} aria-label="Dismiss" style={{ borderRadius: t.RADIUS_SM,
        background: 'transparent', border: 0, color: fgMuted,
        fontFamily: t.MONO, fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: '2px 2px',
      }}>×</button>
    </div>
  );
}

// Browse-mode chrome — gated on radio prompt visibility so it doesn't flash
// over the "Music while you move?" overlay on first entry.
function BSBrowseChrome({ noticeDismissed, bannerDismissed, onCloseNotice, onCloseBanner, onJoin, onSignIn }) {
  // Mobile app hotfix: disable browse overlays so chat composer and thread UI
  // are never occluded by preview chrome.
  return null;
}

function BSAppShell({ tweaks, setTweak }) {
  const authConfigured = Boolean(window.ShapeAuth?.configured);
  // Always open on the splash so the intro is seen on every launch; onDone
  // routes to the app (demo) or login as before.
  const [stage, setStage] = useStateBSM('splash');
  const [role, setRole] = useStateBSM(tweaks.role || 'client');
  const [authState, setAuthState] = useStateBSM(() => window.ShapeAuth?.getCachedState?.() || {});
  const [browseMode, setBrowseMode] = useStateBSM(false);
  const [bannerDismissed, setBannerDismissed] = useStateBSM(false);
  const [noticeDismissed, setNoticeDismissed] = useStateBSM(false);
  const [loginMode, setLoginMode] = useStateBSM('signin'); // initial tab on next login mount
  const [applyRole, setApplyRole] = useStateBSM(null); // pro role applying for → opens the application screen
  const [bundleLoading, setBundleLoading] = useStateBSM(false);
  const [bundleError, setBundleError] = useStateBSM('');
  const t = useBS();

  useEffectBSM(() => { setRole(tweaks.role || 'client'); }, [tweaks.role]);

  // Replay splash on demand from Tweaks panel
  useEffectBSM(() => {
    function onReplay() { setStage('splash'); }
    window.addEventListener('bs-replay-splash', onReplay);
    return () => window.removeEventListener('bs-replay-splash', onReplay);
  }, []);

  useEffectBSM(() => {
    let cancelled = false;
    setBundleError('');
    setBundleLoading(true);
    ensureRoleBundle(role)
      .catch((err) => {
        if (!cancelled) setBundleError(err?.message || 'Failed loading app module.');
      })
      .finally(() => {
        if (!cancelled) setBundleLoading(false);
      });
    return () => { cancelled = true; };
  }, [role]);

  // Account gate for browse / no-account users. Deep screens call
  // window.bsRequireAccount('book a session') before any committing action;
  // if there's no signed-in user it nudges them to create an account.
  useEffectBSM(() => {
    window.__bsGoAuth = (mode) => {
      setBrowseMode(false); setNoticeDismissed(false); setBannerDismissed(false);
      setLoginMode(mode === 'signin' ? 'signin' : 'create'); setStage('login');
    };
    window.bsRequireAccount = (label) => {
      const u = window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user;
      if (u) return true;
      try { window.__bsToast && window.__bsToast(label ? `Create a free account to ${label}.` : 'Create a free account to continue.', 'info'); } catch (e) {}
      if (window.__bsGoAuth) window.__bsGoAuth('create');
      return false;
    };
    return () => { try { delete window.__bsGoAuth; delete window.bsRequireAccount; } catch (e) {} };
  }, []);

  const appByRole = {
    client: window.BSClientApp,
    trainer: window.BSTrainerApp,
    nutritionist: window.BSNutritionistApp,
    shape_radio: window.BSClientApp,
  };
  const App = appByRole[role] || window.BSClientApp;
  const appProps = role === 'shape_radio' ? { initialTab: 'radio' } : {};

  useEffectBSM(() => {
    let cancelled = false;
    if (!authConfigured) return () => {};
    window.ShapeAuth.getCurrentSession()
      .then((next) => {
        if (cancelled) return;
        setAuthState(next);
        if (next?.profile?.role && next.profile.role !== role) setRole(next.profile.role);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authConfigured]);

  // Global live notifications — toast the moment a new one lands, anywhere in
  // the app, so updates "appear" without opening the notifications feed.
  const authUserId = authState?.user?.id || null;
  useEffectBSM(() => {
    if (!authUserId || !window.ShapeNotifications?.subscribe) return () => {};
    const unsub = window.ShapeNotifications.subscribe((n) => {
      if (n && n.title) window.__bsToast?.(n.title, 'ok');
    });
    return () => { try { unsub(); } catch (e) {} };
  }, [authUserId]);

  // Register for native push once signed in (no-op off native / until the
  // @capacitor/push-notifications plugin + Firebase are configured).
  useEffectBSM(() => {
    if (!authUserId) return undefined;
    window.ShapePush?.register?.();
    return undefined;
  }, [authUserId]);

  const handleLogin = (nextAuthState) => {
    setAuthState(nextAuthState || window.ShapeAuth?.getCachedState?.() || {});
    setBrowseMode(false);
    setBannerDismissed(false);
    setNoticeDismissed(false);
    setLoginMode('signin');
    setStage('app');
  };

  const handleLogout = async () => {
    await window.ShapeAuth?.signOut?.();
    setAuthState({});
    setBrowseMode(false);
    setStage('login');
  };

  // BSRadioProvider hoisted ABOVE the stage switch so radio state
  // (radioOn, askedPrompt, fxMode) survives logout → re-login. Without
  // hoisting, BSRadioProvider remounts on login and re-fires its 600ms
  // auto-prompt, causing a brief Home flash before the overlay covers it.
  return (
    <BSRadioProvider>
      <BSPhone>
        {stage === 'splash' && <BSSplash style="cosmos" bg={tweaks.splashBg || 'plain'} bgColor={tweaks.splashBgColor || 'auto'} onDone={() => setStage('daily')} />}
        {stage === 'daily' && <BSSplash style="classified" bg={tweaks.splashBg || 'plain'} bgColor={tweaks.splashBgColor || 'auto'} onDone={() => setStage('login')} />}
        {stage === 'login'  && <BSLogin
          key={loginMode}
          initialMode={loginMode}
          role={role}
          setRole={(r) => { setRole(r); setTweak('role', r); }}
          onLogin={handleLogin}
          onBrowse={() => { setBrowseMode(true); setBannerDismissed(false); setNoticeDismissed(false); setLoginMode('signin'); setStage('app'); }}
          onApply={(r) => { setApplyRole(r); loadClientBundle().then(() => setStage('apply')); }}
        />}
        {stage === 'apply' && (window.BSProviderApplicationScreen
          ? <window.BSProviderApplicationScreen initialRole={applyRole || 'trainer'} onBack={() => setStage('login')} />
          : <div style={{ margin: 18, padding: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Loading application…</div>)}
        {stage === 'app' && !!bundleError && (
          <div style={{
            margin: 18,
            padding: 14,
            border: `1px solid ${t.RULE}`,
            background: t.PAPER2,
            color: t.INK,
            fontFamily: t.MONO,
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            {bundleError}
          </div>
        )}
        {stage === 'app' && !bundleError && !App && (
          <div style={{
            margin: 18,
            padding: 14,
            border: `1px solid ${t.RULE}`,
            background: t.PAPER2,
            color: t.INK,
            fontFamily: t.MONO,
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}>
            Loading app...
          </div>
        )}
        {stage === 'app' && !!App && <App onLogout={handleLogout} authState={authState} tweaks={tweaks} setTweak={setTweak} {...appProps} />}

        {/* Browse-mode chrome (preview banner + subscribe CTA) — gated below */}
        {stage === 'app' && !!App && !bundleLoading && browseMode && !tweaks.startLoggedIn && (
          <BSBrowseChrome
            noticeDismissed={noticeDismissed}
            bannerDismissed={bannerDismissed}
            onCloseNotice={() => setNoticeDismissed(true)}
            onCloseBanner={() => setBannerDismissed(true)}
            onJoin={() => { setBrowseMode(false); setLoginMode('create'); setStage('login'); }}
            onSignIn={() => { setBrowseMode(false); setLoginMode('signin'); setStage('login'); }}
          />
        )}
      </BSPhone>
    </BSRadioProvider>
  );
}



// ═══════════════════════════════════════════════════════════
// TWEAKS PANEL — newspaper-styled
// ═══════════════════════════════════════════════════════════
function BSTweaksPanel({ tweaks, setTweak, onClose }) {
  const t = useBS();
  const Section = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
  const Btn = ({ on, onClick, children }) => (
    <button onClick={onClick} style={{ borderRadius: t.RADIUS_SM, flex: 1, padding: '8px 6px', border: `1px solid ${t.INK}`, background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>{children}</button>
  );
  return (
    <div style={{ borderRadius: t.RADIUS_SM, position: 'fixed', top: 20, right: 20, width: 280, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', background: t.PAPER, border: `2px solid ${t.INK}`, padding: 14, zIndex: 9999, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: t.INK }}>
      <div style={{ position: 'sticky', top: -14, background: t.PAPER, marginTop: -14, paddingTop: 14, zIndex: 1, borderBottom: `2px solid ${t.INK}`, paddingBottom: 8, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>Tweaks</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 0, color: t.INK, fontFamily: t.MONO, fontSize: 11, cursor: 'pointer' }}>✕</button>
      </div>

      <Section label="Role">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[['client','Client'],['trainer','Trainer'],['nutritionist','Nutri'],['shape_radio','Radio']].map(([k, l]) => <Btn key={k} on={tweaks.role === k} onClick={() => setTweak('role', k)}>{l}</Btn>)}
        </div>
      </Section>

      <Section label="Paper">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[['light','Cream'],['dark','Black'],['teal','Teal'],['manila','Manila'],['blueprint','Blueprint'],['carbon','Carbon'],['steel','Steel'],['bone','Bone'],['oxblood','Oxblood']].map(([k,l]) => (
            <Btn key={k} on={tweaks.paperMode === k} onClick={() => setTweak('paperMode', k)}>{l}</Btn>
          ))}
        </div>
      </Section>

      <Section label="Accent">
        <div style={{ display: 'flex', gap: 4 }}>
          {['blue','amber','rust','green','teal','white','black'].map(k => <Btn key={k} on={tweaks.accentKey === k} onClick={() => setTweak('accentKey', k)}>{k}</Btn>)}
        </div>
      </Section>

      <Section label="Display weight">
        <div style={{ display: 'flex', gap: 4 }}>
          {['regular','bold'].map(k => <Btn key={k} on={tweaks.weightKey === k} onClick={() => setTweak('weightKey', k)}>{k}</Btn>)}
        </div>
      </Section>

      <Section label="Borders">
        <div style={{ display: 'flex', gap: 4 }}>
          {['hairlines','thick rules','no rules'].map(k => <Btn key={k} on={tweaks.borderKey === k} onClick={() => setTweak('borderKey', k)}>{k.split(' ')[0]}</Btn>)}
        </div>
      </Section>

      <Section label="Texture">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {[
            ['none','None'],['newsprint','Newsprint'],['ledger','Ledger'],
            ['grid','Grid'],['dotgrid','Dot grid'],['foxed','Foxed'],
            ['vignette','Vignette'],['watermark','Watermark'],
            ['linen','Linen'],['crosshatch','Crosshatch'],['pinstripe','Pinstripe'],
            ['halftone','Halftone'],['kraft','Kraft'],['blueprint','Blueprint'],
            ['graph','Graph'],['stains','Stains'],['cardboard','Cardboard'],
            ['concrete','Concrete'],['risograph','Risograph'],['parchment','Parchment'],
            ['dotmap','Dot map'],
          ].map(([k,l]) =>
            <Btn key={k} on={(tweaks.textureKey || 'none') === k} onClick={() => setTweak('textureKey', k)}>{l}</Btn>
          )}
        </div>
        {tweaks.textureKey && tweaks.textureKey !== 'none' && (
          <>
            <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase', marginBottom: 4 }}>
              Tint
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <Btn on={(tweaks.textureColor || 'auto') === 'auto'} onClick={() => setTweak('textureColor', 'auto')}>Auto</Btn>
              {[
                ['#0f0e0c','Ink'], ['#b71c1c','Red'], ['#1565c0','Blue'],
                ['#2e7d32','Green'], ['#e65100','Orange'], ['#6a1b9a','Purple'],
                ['#00838f','Teal'], ['#bf360c','Rust'], ['#f5f0e6','Cream'],
              ].map(([hex, label]) => (
                <button
                  key={hex}
                  title={label}
                  onClick={() => setTweak('textureColor', hex)}
                  style={{
                    width: 22, height: 22, padding: 0, cursor: 'pointer',
                    background: hex,
                    border: tweaks.textureColor === hex ? `2px solid ${t.INK}` : `1px solid ${t.RULE}`,
                    boxShadow: tweaks.textureColor === hex ? `0 0 0 1px ${t.PAPER}` : 'none',
                  }}
                />
              ))}
              <input
                type="color"
                value={tweaks.textureColor && tweaks.textureColor !== 'auto' ? tweaks.textureColor : '#0f0e0c'}
                onChange={e => setTweak('textureColor', e.target.value)}
                title="Custom color"
                style={{ width: 22, height: 22, padding: 0, border: `1px dashed ${t.INK50}`, background: 'transparent', cursor: 'pointer' }}
              />
            </div>
          </>
        )}
      </Section>

      <Section label="Splash">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {[['masthead','Masthead'],['dropcap','Dropcap'],['frontpage','Front page'],['vault','Vault'],['classified','Classified'],['ticker','Ticker']].map(([k, l]) =>
            <Btn key={k} on={tweaks.splashStyle === k} onClick={() => setTweak('splashStyle', k)}>{l}</Btn>
          )}
        </div>
        {tweaks.splashStyle === 'classified' && (
          <>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase', marginTop: 10, marginBottom: 4 }}>
              Background
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              {[
                ['plain',     'Plain'],
                ['newsprint', 'Newsprint'],
                ['watermark', 'Watermark'],
                ['engraved',  'Engraved'],
                ['halftone',  'Halftone'],
                ['grid',      'Grid'],
              ].map(([k, l]) =>
                <Btn key={k} on={(tweaks.splashBg || 'newsprint') === k} onClick={() => setTweak('splashBg', k)}>{l}</Btn>
              )}
            </div>
            <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase', marginBottom: 4 }}>
              Bg tint
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <Btn on={(tweaks.splashBgColor || 'auto') === 'auto'} onClick={() => setTweak('splashBgColor', 'auto')}>Auto</Btn>
              {[
                ['#0f0e0c','Ink'], ['#b71c1c','Red'], ['#1565c0','Blue'],
                ['#2e7d32','Green'], ['#e65100','Orange'], ['#6a1b9a','Purple'],
                ['#00838f','Teal'], ['#bf360c','Rust'], ['#f5f0e6','Cream'],
              ].map(([hex, label]) => (
                <button
                  key={hex}
                  title={label}
                  onClick={() => setTweak('splashBgColor', hex)}
                  style={{
                    width: 22, height: 22, padding: 0, cursor: 'pointer',
                    background: hex,
                    border: tweaks.splashBgColor === hex ? `2px solid ${t.INK}` : `1px solid ${t.RULE}`,
                    boxShadow: tweaks.splashBgColor === hex ? `0 0 0 1px ${t.PAPER}` : 'none',
                  }}
                />
              ))}
              <input
                type="color"
                value={tweaks.splashBgColor && tweaks.splashBgColor !== 'auto' ? tweaks.splashBgColor : '#0f0e0c'}
                onChange={e => setTweak('splashBgColor', e.target.value)}
                title="Custom color"
                style={{ width: 22, height: 22, padding: 0, border: `1px dashed ${t.INK50}`, background: 'transparent', cursor: 'pointer' }}
              />
            </div>
          </>
        )}
        <button onClick={() => window.dispatchEvent(new CustomEvent('bs-replay-splash'))} style={{ borderRadius: t.RADIUS_SM,
          width: '100%', marginTop: 6, padding: 8,
          border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
          fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer',
        }}>↻ Replay splash</button>
      </Section>

      <Section label="Auto-login on open">
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn on={!tweaks.startLoggedIn} onClick={() => setTweak('startLoggedIn', false)}>Off</Btn>
          <Btn on={!!tweaks.startLoggedIn} onClick={() => setTweak('startLoggedIn', true)}>On</Btn>
        </div>
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════
function BSApp() {
  const initial = window.__TWEAKS || {};
  const [tweaks, setTweaks] = useStateBSM({
    role: 'client', paperMode: 'dark', accentKey: 'blue',
    weightKey: 'bold', borderKey: 'hairlines', textureKey: 'none', textureColor: 'auto',
    splashStyle: 'cosmos', splashBg: 'plain', splashBgColor: 'auto',
    fxGrain: false, fxHalftone: false, fxSepia: false, fxVignette: false, fxScanlines: false, fxInkBleed: false,
    startLoggedIn: true, ...initial,
  });
  const [tweaksOn, setTweaksOn] = useStateBSM(false);

  function setTweak(k, v) {
    setTweaks(s => ({ ...s, [k]: v }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  }

  useEffectBSM(() => {
    function onMsg(e) {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setTweaksOn(true);
      if (d.type === '__deactivate_edit_mode') setTweaksOn(false);
    }
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <BSProvider paperMode={tweaks.paperMode} accentKey={tweaks.accentKey} densityKey="dense" borderKey={tweaks.borderKey} weightKey={tweaks.weightKey} textureKey={tweaks.textureKey} textureColor={tweaks.textureColor} inkOverride={tweaks.inkOverride}>
      <div style={{ width: '100vw', minHeight: '100dvh', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, background: '#ffffff' }}>
        <BSAppShell tweaks={tweaks} setTweak={setTweak} />
        {tweaksOn && <BSTweaksPanel tweaks={tweaks} setTweak={setTweak} onClose={() => { setTweaksOn(false); window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); }} />}
      </div>
    </BSProvider>
  );
}

// ── Crash safety net ────────────────────────────────────────────────
// Without this, any uncaught render error unmounts the whole React tree and
// the WKWebView shows a blank/white screen — indistinguishable from a
// "crash". The boundary catches it, shows a recoverable card, and records the
// error so it can be surfaced (and read off-device via window.__BS_LAST_ERROR).
function bsRecordError(err, info) {
  try {
    const rec = {
      when: new Date().toISOString(),
      message: (err && (err.message || String(err))) || 'Unknown error',
      stack: (err && err.stack) || null,
      component: (info && info.componentStack) || null,
    };
    window.__BS_LAST_ERROR = rec;
    const log = JSON.parse(window.localStorage.getItem('shape.errorLog') || '[]');
    log.unshift(rec);
    window.localStorage.setItem('shape.errorLog', JSON.stringify(log.slice(0, 20)));
  } catch (e) {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => bsRecordError(e.error || e.message, null));
  window.addEventListener('unhandledrejection', (e) => bsRecordError(e.reason, null));
}

// ── Opt-in memory HUD ───────────────────────────────────────────────
// Safari reloads a tab (white screen) when its JS heap grows too large. This
// gradual leak can't be seen by reading code — you need live numbers. Enable
// with ?mem=1 in the URL (or localStorage 'shape.memHud'='1') to float a live
// JS-heap readout + a peak marker. Watch which screen/action makes it climb
// and never come back down — that's the leak. Uses performance.memory, which
// is available in the iOS WKWebView/Safari for this purpose.
function bsInstallMemHud() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  let on = false;
  try {
    on = new URLSearchParams(location.search).get('mem') === '1'
      || window.localStorage.getItem('shape.memHud') === '1';
  } catch (e) {}
  if (!on) return;
  try { window.localStorage.setItem('shape.memHud', '1'); } catch (e) {}
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:env(safe-area-inset-top,6px);left:6px;z-index:2147483647;background:rgba(0,0,0,0.82);color:#2ee0c4;font:700 11px/1.35 ui-monospace,Menlo,monospace;padding:5px 8px;border-radius:7px;pointer-events:auto;letter-spacing:0.04em;white-space:pre;';
  el.addEventListener('click', () => { try { window.localStorage.removeItem('shape.memHud'); } catch (e) {} el.remove(); });
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
  if (document.body) document.body.appendChild(el);
  let peak = 0;
  const mb = (b) => (b / 1048576).toFixed(0);
  setInterval(() => {
    const m = performance && performance.memory;
    if (!m) { el.textContent = 'mem: n/a (tap to hide)'; return; }
    const used = m.usedJSHeapSize;
    if (used > peak) peak = used;
    el.textContent = `JS ${mb(used)}MB  peak ${mb(peak)}MB\nlimit ${mb(m.jsHeapSizeLimit)}MB · tap to hide`;
  }, 1000);
}
bsInstallMemHud();

class BSErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { this.setState({ info }); bsRecordError(err, info); }
  render() {
    if (!this.state.err) return this.props.children;
    const err = this.state.err;
    const info = this.state.info;
    // Surface the actual error so it can be read/copied off-device (no console
    // needed). message + first stack frames + the React component stack.
    const detail = [
      (err && (err.message || String(err))) || 'Unknown error',
      err && err.stack ? '\n' + String(err.stack).split('\n').slice(0, 6).join('\n') : '',
      info && info.componentStack ? '\nComponent stack:' + String(info.componentStack).split('\n').slice(0, 6).join('\n') : '',
    ].join('');
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0b0c0c', color: '#f4efe6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', fontFamily: "'Saira', 'Helvetica Neue', sans-serif" }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' }}>Something went wrong</div>
        <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 320, lineHeight: 1.5 }}>The app hit an error and recovered. Details below — tap Copy and send them over.</div>
        <pre style={{ width: '100%', maxWidth: 360, maxHeight: 200, overflow: 'auto', textAlign: 'left', background: '#15110d', border: '1px solid rgba(244,239,230,0.15)', borderRadius: 8, padding: 12, fontSize: 11, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#ff8a7a', fontFamily: "ui-monospace, Menlo, monospace" }}>{detail}</pre>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => { try { navigator.clipboard.writeText(detail); window.__bsToast?.('Error copied', 'ok'); } catch (e) {} }} style={{ padding: '11px 20px', borderRadius: 10, background: 'transparent', color: '#f4efe6', border: '1px solid rgba(244,239,230,0.3)', fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Copy</button>
          <button onClick={() => { this.setState({ err: null, info: null }); }} style={{ padding: '11px 22px', borderRadius: 10, background: '#0ac5a8', color: '#031f1c', border: 0, fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Reload</button>
        </div>
        <button onClick={() => { try { window.location.reload(); } catch (e) {} }} style={{ background: 'transparent', border: 0, color: 'rgba(244,239,230,0.5)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Restart app</button>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BSErrorBoundary><BSApp /></BSErrorBoundary>
);
