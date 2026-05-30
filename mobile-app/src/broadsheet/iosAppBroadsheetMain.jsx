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
  _clientBundlePromise = Promise.all([
    import('./iosAppBroadsheetCalendar.jsx'),
    import('./iosAppBroadsheetProviderApply.jsx'),
    import('./iosAppBroadsheetMarketplace.jsx'),
    import('./iosAppBroadsheetWidgets.jsx'),
    import('./iosAppBroadsheetHabits.jsx'),
    import('./iosAppBroadsheetClient.jsx'),
  ]).then(() => true);
  return _clientBundlePromise;
}

function loadProsBundle() {
  if (_prosBundlePromise) return _prosBundlePromise;
  _prosBundlePromise = import('./iosAppBroadsheetPros.jsx').then(() => true);
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
  @keyframes bsMarkPulse { 0%,100%{ transform:translateY(0) scale(1); filter:drop-shadow(0 0 12px rgba(10,197,168,0.45)); } 50%{ transform:translateY(-7px) scale(1.035); filter:drop-shadow(0 0 26px rgba(10,197,168,0.65)); } }
  .bs-shape-mark { animation: bsMarkPulse 3.8s ease-in-out infinite; }
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
    // Cosmos + classified are tap-only so the intro is always seen, even when
    // a native OS splash covers the first moments after mount.
    if (style === 'classified' || style === 'cosmos' || !style) return;
    const id = setTimeout(onDone, 1600);
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
        <div style={{ position: 'absolute', bottom: 'calc(34px + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, textAlign: 'center', zIndex: 1, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(244,239,230,0.42)' }}>
          Tap to enter
        </div>
      </div>
    );
  }

  // ── 1. MASTHEAD: rule-bound vol/no, big stacked title, footer
  if (style === 'masthead') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '54px 20px 40px' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${t.INK}`, paddingBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><BSLogo size={22} color={t.INK} /> Vol. 6 · No. 38</span>
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
          Loading · Vol. 6
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
            <span>Vol. 6 · No. 38</span><span>May 21 · 2026</span><span>$0 · Daily</span>
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
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase', color: t.PAPER, opacity: 0.7 }}>Vol. 6 · No. 38</div>
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
      <div onClick={onDone} style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, padding: '50px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', cursor: 'pointer' }}>
        <SplashBackdrop bg="plain" inkRgb={inkRgbCl} t={t} />

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
          <span style={{ opacity: 0.6 }}>Vol. 6</span>
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

function BSLogin({ onLogin, onBrowse, role, setRole, initialMode }) {
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
      const nextRole = result?.profile?.role;
      if (nextRole && nextRole !== role) setRole(nextRole);
      onLogin(result);
    } catch (error) {
      setAuthError(error?.message || 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
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
  const inputStyle = { borderRadius: t.RADIUS_SM, background: FIELD, border: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE2}`, padding: '12px 12px', fontFamily: t.DISPLAY, fontSize: 16, color: CREAM, outline: 'none' };
  return (
    <div style={{ position: 'absolute', inset: 0, color: CREAM, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <BSNightSky />
      <div className="bs-hide-scroll" style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'max(52px, calc(env(safe-area-inset-top, 0px) + 26px)) 20px calc(28px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${LINE2}`, paddingBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BSLogo size={16} color={CREAM} /> Vol. 6 · {isCreate ? 'New subscriber' : 'Subscribe'}</span>
          <span>{isCreate ? 'Time to Shape' : '$5 / mo'}</span>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <BSShapeMark size={64} />
            <div style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 500, fontSize: 48, lineHeight: 0.9, letterSpacing: '-0.055em', color: CREAM, textAlign: 'center' }}>
              {isCreate ? (
                <>Join the<br/><span style={{ fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.065em', ...SHAPE_GRAD }}>community.</span></>
              ) : (
                <>Welcome<br/>to <span style={{ display: 'inline-block', fontFamily: `'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif`, fontWeight: 300, fontStyle: 'normal', fontSize: 48, letterSpacing: '0.16em', textTransform: 'uppercase', transform: 'translateY(2px)', color: '#ffffff' }}>SHAPE</span>.</>
              )}
            </div>
          </div>

          {/* Sign in / Create account toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${LINE2}`, borderRadius: t.RADIUS_SM, overflow: 'hidden' }}>
            {[['signin','Sign in'],['create','Join Shape']].map(([k, l]) => {
              const on = mode === k;
              return <button key={k} onClick={() => setMode(k)} style={{
                padding: '11px 4px', border: 0, background: on ? '#0ac5a8' : 'transparent',
                color: on ? '#031f1c' : CREAM, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 700,
                letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
              }}>{l}</button>;
            })}
          </div>

          {/* Email / Phone method switch */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 2 }}>
            {[['email', 'Email'], ['phone', 'Phone']].map(([k, l]) => {
              const on = authMethod === k;
              return <button key={k} onClick={() => switchMethod(k)} style={{ borderRadius: t.RADIUS_SM,
                padding: '9px 4px', border: `1px solid ${on ? '#0ac5a8' : LINE}`,
                background: on ? 'rgba(10,197,168,0.14)' : 'transparent',
                color: CREAM, fontFamily: t.MONO, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer',
              }}>{l}</button>;
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 2 }}>
            {isCreate && (
              <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
            )}
            {isPhone ? (
              <>
                <input placeholder="Phone (+1 555 123 4567)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" disabled={otpSent} style={{ ...inputStyle, color: otpSent ? C50 : CREAM }} />
                {otpSent && (
                  <input placeholder="6-digit code" type="tel" inputMode="numeric" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} autoComplete="one-time-code" style={{ ...inputStyle, fontSize: 22, letterSpacing: '0.3em' }} />
                )}
                {otpSent && (
                  <button onClick={() => { setOtpSent(false); setOtpCode(''); setAuthError(''); }} style={{ alignSelf: 'flex-start', background: 'transparent', border: 0, color: C50, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '2px 0' }}>← Change number</button>
                )}
              </>
            ) : (
              <>
                <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />
                <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isCreate ? 'new-password' : 'current-password'} style={inputStyle} />
              </>
            )}
            {authError && (
              <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ff9b7a', lineHeight: 1.35 }}>
                {authError}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: C50, marginBottom: 8 }}>I am a…</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {[['client','Client'],['trainer','Trainer'],['nutritionist','Nutri'],['shape_radio','Radio']].map(([k, l]) => {
                const on = role === k;
                return <button key={k} onClick={() => setRole(k)} style={{ borderRadius: t.RADIUS_SM, padding: 12, border: `1px solid ${on ? '#0ac5a8' : LINE2}`, background: on ? '#0ac5a8' : 'transparent', color: on ? '#031f1c' : CREAM, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>{l}</button>;
              })}
            </div>
          </div>

          {isCreate ? (
            isPhone ? (
              <button onClick={otpSent ? verifyPhoneCode : sendPhoneCode} disabled={busy} style={{ borderRadius: t.RADIUS_SM, marginTop: 8, padding: 16, background: '#0ac5a8', color: '#031f1c', border: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1 }}>{busy ? 'Working...' : otpSent ? 'Verify & join →' : 'Text me a code →'}</button>
            ) : (
              <button onClick={submitAuth} disabled={busy} style={{ borderRadius: t.RADIUS_SM, marginTop: 8, padding: 16, background: '#0ac5a8', color: '#031f1c', border: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1 }}>{busy ? 'Creating...' : 'Time to Shape →'}</button>
            )
          ) : (
            <>
              {isPhone ? (
                <button onClick={otpSent ? verifyPhoneCode : sendPhoneCode} disabled={busy} style={{ borderRadius: t.RADIUS_SM, marginTop: 8, padding: 16, background: '#0ac5a8', color: '#031f1c', border: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1 }}>{busy ? 'Working...' : otpSent ? 'Verify & sign in →' : 'Text me a code →'}</button>
              ) : (
                <button onClick={submitAuth} disabled={busy} style={{ borderRadius: t.RADIUS_SM, marginTop: 8, padding: 16, background: '#0ac5a8', color: '#031f1c', border: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1 }}>{busy ? 'Signing in...' : 'Sign in →'}</button>
              )}

              {/* Curious-reader path for non-members */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <div style={{ flex: 1, height: 1, background: LINE }} />
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: C50 }}>or</div>
                <div style={{ flex: 1, height: 1, background: LINE }} />
              </div>

              <div style={{ textAlign: 'center', marginTop: -2 }}>
                <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, color: CREAM, lineHeight: 1.25 }}>
                  Not yet a member, but curious?
                </div>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C50, marginTop: 3 }}>
                  Take a look around — no account needed.
                </div>
              </div>

              <button onClick={onBrowse} style={{ borderRadius: t.RADIUS_SM, padding: '14px 16px', background: 'transparent', color: CREAM, border: `1px solid ${LINE2}`, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: 'pointer' }}>Browse today's edition →</button>
            </>
          )}
        </div>

        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: C50, textAlign: 'center', borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
          {isCreate ? 'Already a subscriber · Forgot password · Help' : 'New reader · Forgot password · Help'}
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
        {stage === 'splash' && <BSSplash style="cosmos" bg={tweaks.splashBg || 'plain'} bgColor={tweaks.splashBgColor || 'auto'} onDone={() => setStage(tweaks.startLoggedIn && !authConfigured ? 'app' : 'login')} />}
        {stage === 'login'  && <BSLogin
          key={loginMode}
          initialMode={loginMode}
          role={role}
          setRole={(r) => { setRole(r); setTweak('role', r); }}
          onLogin={handleLogin}
          onBrowse={() => { setBrowseMode(true); setBannerDismissed(false); setNoticeDismissed(false); setLoginMode('signin'); setStage('app'); }}
        />}
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
      <div style={{ width: '100vw', minHeight: '100vh', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, background: '#ffffff' }}>
        <BSAppShell tweaks={tweaks} setTweak={setTweak} />
        {tweaksOn && <BSTweaksPanel tweaks={tweaks} setTweak={setTweak} onClose={() => { setTweaksOn(false); window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); }} />}
      </div>
    </BSProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<BSApp />);
