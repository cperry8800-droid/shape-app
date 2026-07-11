import React from 'react';
import * as ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { initI18n, applyDir, i18n as bsI18n } from '../i18n/index.js';
import BSLanguagePicker from './BSLanguagePicker.jsx';
import { bsLaunchRoute, bsDailyStamp, bsAfterBeat, bsWireLines } from '../services/dailyWire.mjs';
// iosAppBroadsheetMain.jsx — App entry: splash, login, role-dispatched app, Tweaks panel.

initI18n(); // idempotent — sets the initial locale + text direction from the stored
            // preference / device language before the first render.

const { useState: useStateBSM, useEffect: useEffectBSM } = React;
const {
  useBS, BSProvider, BSPhone, BSLogo,
  BSRadioProvider, useBSRadio,
} = window;

let _clientBundlePromise = null;
let _prosBundlePromise = null;

// A failed dynamic import is almost always a STALE CHUNK after a redeploy: the
// hashed filename baked into the cached index.html no longer exists on the
// server (it was replaced by a new hash), so the fetch 404s. Reload once — the
// fresh index.html references the new chunk hashes. The sessionStorage flag
// (persists across the reload, reset only by a new tab or the manual Reload
// button) caps it at one auto-reload per session, so a genuine repeated failure
// surfaces as an error instead of looping.
function _bsChunkRecover(err) {
  const msg = String((err && err.message) || err || '');
  const stale = /dynamically imported module|failed to fetch|module script failed|error loading dynamically|importing a module script/i.test(msg);
  if (stale && typeof window !== 'undefined') {
    try {
      if (!window.sessionStorage.getItem('bs-chunk-reloaded')) {
        window.sessionStorage.setItem('bs-chunk-reloaded', '1');
        window.location.reload();
        return new Promise(() => {}); // never settles — the page is reloading
      }
    } catch (e) { /* sessionStorage blocked — fall through to surface the error */ }
  }
  throw err;
}

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
  ]).then(() => import('./iosAppBroadsheetClient.jsx')).then(() => true)
    .catch((err) => { _clientBundlePromise = null; return _bsChunkRecover(err); });
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
  ]).then(() => import('./iosAppBroadsheetPros.jsx')).then(() => true)
    .catch((err) => { _prosBundlePromise = null; return _bsChunkRecover(err); });
  return _prosBundlePromise;
}

async function ensureRoleBundle(role) {
  // dietitian (RD/RDN) rides the nutritionist coach surfaces (nutrition discipline).
  if (role === 'trainer' || role === 'nutritionist' || role === 'dietitian') {
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
  @keyframes bsMarkPulse { 0%,100%{ transform:translateY(0) scale(1); } 50%{ transform:translateY(-10px) scale(1.085); } }
  .bs-shape-mark { animation: bsMarkPulse 2.1s ease-in-out infinite; filter:drop-shadow(0 0 32px rgba(10,197,168,0.85)) drop-shadow(0 0 14px rgba(46,224,196,0.8)); will-change: transform; }
  .bs-shape-mark-calm { animation: bsMarkPulse 2.6s ease-in-out infinite; filter:drop-shadow(0 0 16px rgba(10,197,168,0.4)) drop-shadow(0 0 7px rgba(46,224,196,0.35)); will-change: transform; }
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
  @media (prefers-reduced-motion: reduce) { .bs-sky-tw,.bs-aurora,.bs-shoot,.bs-shape-mark,.bs-shape-mark-calm,.bs-mark-edge{ animation:none!important; } }
  .bs-hide-scroll { scrollbar-width: none; -ms-overflow-style: none; }
  .bs-hide-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
  .bs-no-spin::-webkit-inner-spin-button, .bs-no-spin::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .bs-no-spin { -moz-appearance: textfield; appearance: textfield; }
  .bs-field:focus, .bs-field:focus-visible { border-color: var(--bs-accent, #34d6c5); box-shadow: inset 0 0 0 1px var(--bs-accent, #34d6c5); }
  .bs-uline { border: 0; border-bottom: 1px solid var(--bs-uline-ink, rgba(127,127,127,0.35)); background: transparent; border-radius: 0; }
  .bs-uline:focus, .bs-uline:focus-visible { outline: none; border-bottom-color: var(--bs-accent, #34d6c5); box-shadow: 0 1px 0 var(--bs-accent, #34d6c5); }
  .bs-uline-row:focus-within { border-bottom-color: var(--bs-accent, #34d6c5); box-shadow: 0 1px 0 var(--bs-accent, #34d6c5); }
  `;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}

// Reduced-motion check (JS side — so the telegram's auto-advance timer is
// suppressed, not just the CSS animation).
function bsPrefersReducedMotion() {
  try { return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

// The wire launch grammar: a drifting dispatch ticker (the beat + the wall
// ground), the telegram's one-shot line entrances, and the 5s draining rule.
let _bsWireStyled = false;
function ensureWireStyles() {
  if (_bsWireStyled || typeof document === 'undefined') return;
  _bsWireStyled = true;
  const css = `
  @keyframes bsWireDrift { 0%{ transform:translateX(4%); } 100%{ transform:translateX(-30%); } }
  .bs-wire-row { white-space:nowrap; animation: bsWireDrift var(--wd,16s) linear infinite alternate; }
  @keyframes bsWireRise { 0%{ opacity:0; transform:translateY(8px); } 100%{ opacity:1; transform:translateY(0); } }
  .bs-wire-line { opacity:0; animation: bsWireRise 0.34s cubic-bezier(0.2,0.7,0.3,1) forwards; }
  @keyframes bsWireDrain { from{ transform:scaleX(1); } to{ transform:scaleX(0); } }
  .bs-wire-drain { transform-origin:left center; animation: bsWireDrain var(--dur,5s) linear forwards; }
  @keyframes bsWireFill { 0%{ transform:scaleX(0); } 100%{ transform:scaleX(1); } }
  .bs-wire-fill { transform-origin:left center; animation: bsWireFill 3.4s cubic-bezier(0.3,0.5,0.35,1) forwards; will-change: transform; }
  @keyframes bsWireTune { 0%,12%{ left:18%; } 38%,58%{ left:63%; } 84%,100%{ left:18%; } }
  .bs-wire-needle { position:absolute; top:-4px; bottom:4px; left:63%; width:1.5px; background:linear-gradient(180deg, #34d6c5, rgba(52,214,197,0.15)); box-shadow:0 0 7px rgba(46,224,196,0.6); animation: bsWireTune 13s ease-in-out infinite; }
  @keyframes bsWireFloat { 0%, 100%{ transform:translateY(4px); } 50%{ transform:translateY(-5px); } }
  .bs-wire-mark-float { position:relative; animation: bsWireFloat 6.5s ease-in-out infinite; will-change: transform; }
  @keyframes bsWireHalo { 0%, 100%{ opacity:0.3; } 50%{ opacity:0.8; } }
  .bs-wire-mark-halo { position:absolute; inset:-55%; border-radius:50%; background:radial-gradient(circle, rgba(52,214,197,0.2), transparent 62%); animation: bsWireHalo 4.5s ease-in-out infinite; pointer-events:none; will-change: opacity; }
  .bs-wire-enter { outline:none; }
  .bs-wire-enter:focus-visible { outline:2px solid #34d6c5; outline-offset:3px; }
  .bs-wire-frow { display:flex; align-items:center; gap:10px; border-bottom:1px dotted rgba(242,237,228,0.34); padding:7px 0 6px; }
  .bs-wire-frow:focus-within { border-bottom-color:#34d6c5; border-bottom-style:solid; }
  .bs-wire-input { flex:1 1 auto; min-width:0; background:transparent; border:0; outline:none; color-scheme:dark; caret-color:#34d6c5; }
  .bs-wire-input::placeholder { color:rgba(242,237,228,0.28); }
  .bs-wire-input:-webkit-autofill,
  .bs-wire-input:-webkit-autofill:hover,
  .bs-wire-input:-webkit-autofill:focus {
    -webkit-box-shadow: inset 0 0 0 1000px #0c161c;
    -webkit-text-fill-color:#f2ede4;
    caret-color:#f2ede4;
    transition: background-color 999999s ease-out 0s;
  }
  .bs-wire-input::-webkit-calendar-picker-indicator { filter:invert(0.85); opacity:0.55; }
  @media (prefers-reduced-motion: reduce) {
    .bs-wire-row{ animation:none!important; transform:none!important; }
    .bs-wire-line{ animation:none!important; opacity:1!important; transform:none!important; }
    .bs-wire-drain{ animation:none!important; transform:none!important; }
    .bs-wire-fill{ animation:none!important; transform:scaleX(1)!important; }
    .bs-wire-needle{ animation:none!important; }
    .bs-wire-mark-float{ animation:none!important; transform:none!important; }
    .bs-wire-mark-halo{ animation:none!important; opacity:0.5!important; }
  }`;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}

// The drifting dispatch-ticker ground — abstract dash rows only. Decorative
// (aria-hidden); `dim` fades it further for surfaces that carry copy
// (wall / auth).
function BSWireGround({ dim }) {
  ensureWireStyles();
  const INKF = 'rgba(242,237,228,0.26)';
  const dash = '— ——— — ———— —— — ——— ————— — —— ——— — ———— —— — ——— —————';
  const rows = [
    { d: 15, off: 0 }, { d: 19, off: -4 }, { d: 13, off: -8 },
    { d: 17, off: -5 }, { d: 21, off: -2 }, { d: 14, off: -7 }, { d: 18, off: -3 },
  ];
  // Rows distribute evenly over the full height (never a clump behind the mark)
  // and fade out at the screen edges instead of hard-clipping mid-dash.
  const edgeFade = 'linear-gradient(90deg, transparent 0, #000 10%, #000 90%, transparent 100%)';
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '104px 0 120px', opacity: dim ? 0.22 : 0.45, pointerEvents: 'none', WebkitMaskImage: edgeFade, maskImage: edgeFade }}>
      {rows.map((r, i) => (
        <div key={i} className="bs-wire-row" style={{ '--wd': r.d + 's', animationDelay: r.off + 's', fontFamily: `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`, fontSize: 8, letterSpacing: '0.28em', color: INKF, paddingLeft: 12 }}>{dash}</div>
      ))}
    </div>
  );
}

// The launch's loading readout — a hairline track whose teal fill loads 0→100%
// (paced to the beat's ~3.5s dwell; it parks full if the membership check runs
// long) + a mono LOADING label. Reduced-motion renders the bar full.
function BSWireLoading({ top = 72 }) {
  ensureWireStyles();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: top }}>
      <div style={{ width: 148, height: 2, background: 'rgba(242,237,228,0.14)', overflow: 'hidden' }} aria-hidden="true">
        <div className="bs-wire-fill" style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, #0ac5a8, #34d6c5)', boxShadow: '0 0 8px rgba(46,224,196,0.5)' }} />
      </div>
      <div style={{ fontFamily: `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`, fontSize: 8, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(242,237,228,0.55)' }}>Loading</div>
    </div>
  );
}

// The tuning dial — "ON AIR" (owner pick from the background board,
// 2026-07-11): a frequency ruler with a teal needle gliding between stations
// while the app tunes in — Shape Radio's presence on the launch, at whisper
// volume. Decorative (aria-hidden); reduced motion parks the needle on the
// station (the class's resting `left`).
function BSWireDial() {
  ensureWireStyles();
  const dialMono = `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`;
  const ticks = [];
  for (let i = 0; i <= 48; i++) {
    const major = i % 6 === 0;
    const x = (i / 48) * 100;
    ticks.push(<line key={i} x1={x} y1={major ? 8 : 14} x2={x} y2={22} stroke={`rgba(242,237,228,${major ? 0.22 : 0.1})`} strokeWidth={major ? 0.7 : 0.45} />);
  }
  return (
    <div aria-hidden="true" style={{ position: 'relative', zIndex: 1, margin: '0 46px 26px' }}>
      <div style={{ position: 'relative', height: 26 }}>
        <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
          <line x1="0" y1="22" x2="100" y2="22" stroke="rgba(242,237,228,0.16)" strokeWidth="0.5" />
          {ticks}
        </svg>
        <div className="bs-wire-needle" />
      </div>
      <div style={{ marginTop: 9, textAlign: 'center', fontFamily: dialMono, fontSize: 7, fontWeight: 700, letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(52,214,197,0.55)' }}>On air</div>
    </div>
  );
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

function BSShapeMark({ size = 104, calm }) {
  ensureSkyStyles();
  return (
    <svg className={calm ? 'bs-shape-mark-calm' : 'bs-shape-mark'} width={size} height={size} viewBox="0 0 100 100" aria-hidden focusable="false" style={{ display: 'block' }}>
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

// Share the cosmic background + mark with the role bundles (home, radio) and
// the wire ground with the provider-application screen (same launch grammar).
if (typeof window !== 'undefined') {
  window.BSNightSky = BSNightSky;
  window.BSShapeMark = BSShapeMark;
  window.BSWireGround = BSWireGround;
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

// ── "The Shape Daily" launch digest — real member data ───────────────────────
// Wires the launch splash to the member's actual day. Every fetch is fully
// guarded (returns null on signed-out / non-member / error), so the splash
// always renders and "Step inside" always works. shapeBackend.js (imported at
// boot by main.jsx, before this bundle) provides window.ShapeAuth + the
// window.Shape* data services; the heavy client bundle is NOT loaded at this
// stage, so we only use those boot-level services + raw authed fetches for the
// two endpoints with no service wrapper (score, dashboard streak).
async function bsSplashGet(path, auth) {
  try {
    const st = auth || (window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState()) || {};
    if (!st.user || !st.user.id) return null;
    const token = st.session && st.session.access_token;
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(base + path, { headers, credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}
// The member's LOCAL calendar day ("YYYY-MM-DD", en-CA) — the warm-relaunch
// seen-stamp basis, so the briefing rolls over at the member's own midnight.
function bsLocalDay() {
  try { return new Date().toLocaleDateString('en-CA'); } catch (e) { return ''; }
}
function bsDigestFirstName(auth) {
  try {
    const m = (auth && auth.user && auth.user.user_metadata) || {};
    const full = (auth && auth.profile && auth.profile.full_name) || m.full_name || m.name || '';
    const first = String(full).trim().split(/\s+/)[0];
    return first || null;
  } catch (e) { return null; }
}
function bsDigestRelTime(iso) {
  try {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (!then) return '';
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.round(hrs / 24) + 'd ago';
  } catch (e) { return ''; }
}
function bsDigestTime12(hhmm) {
  try {
    const mm = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
    if (!mm) return hhmm;
    let h = parseInt(mm[1], 10); const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + mm[2] + ' ' + ap;
  } catch (e) { return hhmm; }
}
function bsDigestClamp(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
}
async function bsDigestScore(auth) {
  const d = await bsSplashGet('/api/client/score', auth);
  if (!d || typeof d.points_total !== 'number') return null;
  return { score: d.points_total, tier: (d.current_tier && d.current_tier.name) || 'Raw', delta: d.week_gain || 0 };
}
async function bsDigestTraining() {
  try {
    const plan = (window.ShapePlan && window.ShapePlan.get) ? await window.ShapePlan.get() : null;
    if (!plan || !plan.training || !plan.training.hasPlan) return null;
    const workouts = plan.training.workouts || [];
    const coach = plan.training.coach || null;
    const now = new Date();
    const iso = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const w = workouts.find((x) => x.scheduledDate === iso) || workouts.find((x) => !x.scheduledDate) || workouts[0];
    if (!w) return { coach: coach, hasWorkout: false };
    return { title: w.title || 'Workout', time: w.time || null, durationMin: w.durationMin || null, moveCount: (w.exercises || []).length, coach: coach, hasWorkout: true };
  } catch (e) { return null; }
}
async function bsDigestCoach() {
  try {
    const res = (window.ShapeMessages && window.ShapeMessages.listDirectCoachThreads) ? await window.ShapeMessages.listDirectCoachThreads() : null;
    const threads = (res && res.data) || [];
    const norm = threads.map((th) => {
      const cm = (th.messages || []).filter((m) => m.coach);
      const last = cm.length ? cm[cm.length - 1] : null;
      return { who: th.who, role: th.provider_role, text: (last && last.t) || th.last || null, at: th.updatedAt || null };
    }).filter((th) => th.text);
    norm.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return norm[0] || null;
  } catch (e) { return null; }
}
async function bsDigestNutrition() {
  try {
    const r = await Promise.all([
      (window.ShapeProgress && window.ShapeProgress.nutrition) ? window.ShapeProgress.nutrition() : null,
      (window.ShapeProgress && window.ShapeProgress.analytics) ? window.ShapeProgress.analytics() : null,
    ]);
    const today = (r[0] && r[0].today) || null;
    const ticker = (r[1] && r[1].ticker) || null;
    const cal = (today && today.calories != null) ? today.calories : ((ticker && ticker.cal != null) ? ticker.cal : null);
    const protein = (today && today.protein != null) ? today.protein : ((ticker && ticker.protein_g != null) ? ticker.protein_g : null);
    if (cal == null && protein == null) return null;
    return { cal: cal, calTarget: (ticker && ticker.cal_target != null) ? ticker.cal_target : null, protein: protein, proteinTarget: (ticker && ticker.protein_target != null) ? ticker.protein_target : null };
  } catch (e) { return null; }
}
async function bsDigestStreakChallenge(auth) {
  let streak = 0, challenge = null;
  try {
    const r = await Promise.all([
      (window.ShapeCommit && window.ShapeCommit.get) ? window.ShapeCommit.get() : null,
      (window.ShapeCommit && window.ShapeCommit.progress) ? window.ShapeCommit.progress() : null,
    ]);
    const commitment = r[0], progress = r[1] || {};
    if (commitment && commitment.targets) {
      const tg = commitment.targets;
      challenge = {
        workouts: tg.workouts ? { done: progress.workouts || 0, target: tg.workouts } : null,
        habits: tg.habits ? { done: progress.habits || 0, target: tg.habits } : null,
        checkin: tg.checkin ? { done: !!progress.checkin } : null,
      };
    }
  } catch (e) {}
  try {
    const dash = await bsSplashGet('/api/client/dashboard', auth);
    streak = (dash && dash.kpis && dash.kpis.streak) || 0;
  } catch (e) {}
  return { streak: streak, challenge: challenge };
}
// The engine directive (the SAME two-call path + gate the Home lead uses), as
// a BOUNDED leg: raced against a ~1.5s timeout so a slow/hung ShapeSignals can
// never delay the telegram render — the digest's other legs stay authoritative
// for timing, and a null directive simply omits the wire's teal line.
async function bsDigestDirective() {
  try {
    const S = window.ShapeSignals;
    if (!S || !S.selfRecord || !S.directive) return null;
    const evaluate = (async () => {
      const rec = await S.selfRecord();
      if (!rec) return null;
      return S.directive(rec) || null;
    })();
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 1500));
    return await Promise.race([evaluate, timeout]);
  } catch (e) { return null; }
}
async function bsBuildDailyDigest() {
  let auth = {};
  try { if (window.ShapeAuth && window.ShapeAuth.getCurrentSession) await window.ShapeAuth.getCurrentSession(); } catch (e) {}
  try { auth = (window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState()) || {}; } catch (e) { auth = {}; }
  const name = bsDigestFirstName(auth);
  if (!auth || !auth.user || !auth.user.id) return { signedIn: false, name: name };
  const r = await Promise.all([bsDigestScore(auth), bsDigestTraining(), bsDigestCoach(), bsDigestNutrition(), bsDigestStreakChallenge(auth), bsDigestDirective()]);
  return { signedIn: true, name: name, score: r[0], training: r[1], coach: r[2], nutrition: r[3], streak: r[4].streak, challenge: r[4].challenge, directive: r[5] };
}

function BSSplash({ onDone, style, bg = 'plain', bgColor }) {
  const t = useBS();
  const SPLASH_FACE = "'Saira', 'Arial Narrow', 'Helvetica Neue', sans-serif";
  // Classified (the telegram/invite) and the wire beat manage their own timing:
  // classified self-advances or waits on a tap; the beat is held by the shell
  // until membership resolves. Neither uses this generic auto-advance.
  useEffectBSM(() => {
    if (style === 'classified' || style === 'wire-beat') return;
    const id = setTimeout(onDone, (style === 'cosmos' || !style) ? 4000 : 1600);
    return () => clearTimeout(id);
  }, [style]);

  // The Daily digest: when the "classified" (daily) splash mounts, fetch the
  // member's real day. Fully guarded; null = still loading. Tap-to-advance works
  // the whole time regardless of fetch state.
  const [bsDigest, setBsDigest] = useStateBSM(null);
  useEffectBSM(() => {
    if (style !== 'classified') return undefined;
    let alive = true;
    let tries = 0;
    // The session restores asynchronously during the splash, so the first build
    // can come back "signed-out" for a member whose auth hasn't resolved yet.
    // Retry a few times before falling back to the signed-out preview — and stay
    // on the loading line while retrying, so a member never flashes the preview.
    const run = () => {
      bsBuildDailyDigest().then((dd) => {
        if (!alive) return;
        if (dd && dd.signedIn) { setBsDigest(dd); return; }   // member: show their day
        if (tries >= 3) { setBsDigest(dd || { signedIn: false, name: null }); return; } // give up → preview
        tries += 1; setTimeout(run, 500 * tries);             // auth may still be resolving
      }).catch(() => {
        if (!alive) return;
        if (tries >= 3) { setBsDigest({ signedIn: false, name: null }); return; }
        tries += 1; setTimeout(run, 500 * tries);
      });
    };
    run();
    return () => { alive = false; };
  }, [style]);

  // The telegram self-advances 5s AFTER the member's digest resolves — a slow
  // fetch never burns reading time (the loading state carries no timer). Under
  // reduced motion there's NO auto-advance (the member taps ENTER); the
  // signed-out invite edition stays tap-only (never auto-advances). onDone is
  // memoized by the shell, so this fires exactly once per resolved member day.
  const bsTeleReady = style === 'classified' && bsDigest && bsDigest.signedIn === true;
  useEffectBSM(() => {
    if (!bsTeleReady || bsPrefersReducedMotion()) return undefined;
    const id = setTimeout(onDone, 5000);
    return () => clearTimeout(id);
  }, [bsTeleReady]);

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

  // ── WIRE BEAT: the brand overture. The membership check resolves behind it
  // (the shell holds the stage until authReady + membership + min dwell, then
  // routes), so no "Checking membership…" screen ever renders. Composition
  // (owner picks, 2026-07-11): the community plate rides the TOP, the mark
  // floats haloed in the center (no copy), the ON AIR tuning dial sits above
  // the loading readout — all over the dim ticker.
  if (style === 'wire-beat') {
    const beatMono = `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`;
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'radial-gradient(135% 90% at 50% -8%, rgba(52,214,197,0.13), transparent 52%), linear-gradient(176deg, #0b161c 0%, #070b11 48%, #03050b 100%)', display: 'flex', flexDirection: 'column' }}>
        <BSWireGround />
        <div style={{ position: 'relative', zIndex: 1, margin: '0 26px', padding: 'max(54px, calc(16px + env(safe-area-inset-top, 0px))) 0 10px', borderBottom: '1px solid rgba(242,237,228,0.2)', display: 'flex', justifyContent: 'space-between', fontFamily: beatMono, fontSize: 8, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(242,237,228,0.45)' }}>
          <span>The Shape Community</span><span>Vol. 1 · No. 1</span>
        </div>
        <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 26px' }}>
          <div className="bs-wire-mark-float">
            <span className="bs-wire-mark-halo" aria-hidden="true" />
            <BSShapeMark size={112} calm />
          </div>
        </div>
        <BSWireDial />
        {/* The loading readout anchors low (boot-screen style) so the mark owns
            the center of the dash field — owner call. */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center', paddingBottom: 'max(44px, calc(30px + env(safe-area-inset-bottom, 0px)))' }}>
          <BSWireLoading top={0} />
        </div>
      </div>
    );
  }

  // ── 1. MASTHEAD: rule-bound vol/no, big stacked title, footer
  if (style === 'masthead') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '54px 20px 40px' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${t.INK}`, paddingBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BSLogo size={22} color={t.INK} /> Vol. 1 · No. 1</span>
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

  // ── 5. THE DAILY: a personalized morning briefing built on real member data ──
  if (style === 'classified') {
    // Today's editorial date (the wire topbar).
    const today = new Date();
    const wkday = today.toLocaleDateString([], { weekday: 'short' });
    const month = today.toLocaleDateString([], { month: 'short' });
    const day   = today.getDate();
    const dateShort = `${wkday} · ${month} ${day}`;

    // FIXED night-sky palette — the background is a hardcoded dark cosmos
    // gradient, so the ink must NOT follow the paper theme.
    const INKF = '#f2ede4', INKF70 = 'rgba(242,237,228,0.7)', INKF50 = 'rgba(242,237,228,0.55)', ACCF = '#34d6c5';

    const dg = bsDigest;                 // null while loading
    const loading = dg === null;
    const name = dg && dg.name;          // bsWireLines reads the rest of the digest

    // The telegram lines assemble ONLY from the member's real digest (+ the
    // bounded directive). Non-null exactly for a signed-in member; the
    // signed-out invite edition falls through below, verbatim.
    ensureWireStyles();
    const wireLines = bsWireLines(dg, dg && dg.directive);
    const reduced = bsPrefersReducedMotion();
    const wireGround = 'radial-gradient(135% 90% at 50% -8%, rgba(52,214,197,0.14), transparent 50%), radial-gradient(120% 70% at 50% 112%, rgba(52,214,197,0.05), transparent 60%), linear-gradient(176deg, #0b161c 0%, #070b11 48%, #03050b 100%)';
    // The full-screen enter control is a real keyboard button (role/tabIndex/
    // focus outline + Enter/Space) — for the telegram AND the invite edition.
    const kbEnter = { role: 'button', tabIndex: 0, 'aria-label': 'Enter the app', onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDone(); } } };
    const mono = `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`;

    // ── THE TELEGRAM (member) ── (owner call: no STOP/END tokens — the line
    // breaks + staggered entrances carry the wire cadence on their own)
    if (wireLines) {
      return (
        <div className="bs-wire-enter" {...kbEnter} onClick={onDone} style={{ position: 'absolute', inset: 0, background: wireGround, color: INKF, padding: '52px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', cursor: 'pointer' }}>
          {/* topbar */}
          <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: INKF70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${INKF}`, paddingBottom: 8 }}>
            <span>Shape Wire</span>
            <span style={{ color: INKF }}>{dateShort}</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: INKF50 }}>To: {name || 'Member'} · Priority</div>
          {/* the wire */}
          <div className="bs-hide-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
            {wireLines.map((ln, i) => (
              <div key={i} className="bs-wire-line" style={{ animationDelay: (reduced ? 0 : 0.12 + i * 0.11) + 's', fontFamily: mono, fontSize: 11, fontWeight: ln.hot ? 700 : 500, lineHeight: 2.05, letterSpacing: '0.08em', textTransform: 'uppercase', color: ln.hot ? ACCF : INKF, textShadow: ln.hot ? '0 0 10px rgba(46,224,196,0.3)' : 'none' }}>
                {ln.text}
              </div>
            ))}
          </div>
          {/* foot — self-advancing drain (or a static ENTER under reduced motion) */}
          <div>
            {reduced ? (
              <div style={{ height: 2, background: `linear-gradient(90deg, #0ac5a8, ${ACCF})` }} />
            ) : (
              <div style={{ height: 2, background: 'rgba(242,237,228,0.14)', overflow: 'hidden' }}>
                <div className="bs-wire-drain" style={{ '--dur': '5s', height: '100%', background: `linear-gradient(90deg, #0ac5a8, ${ACCF})` }} />
              </div>
            )}
            <div style={{ marginTop: 9, display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: INKF50 }}>
              <span>{reduced ? 'Your day' : 'Entering…'}</span>
              <span style={{ color: ACCF }}>{reduced ? 'Enter →' : 'Tap to skip'}</span>
            </div>
          </div>
        </div>
      );
    }

    // Invite edition (signed-out preview) + the shared loading shell — re-set in
    // the wire grammar (owner call 2026-07-10) so the whole signed-out cold open
    // speaks one language. Content unchanged: the pitch (now wire lines), Inside
    // Shape, In the world, and the tap-gated Step inside (the real keyboard
    // control — the root stays a convenience tap so it never wraps the nested
    // links/button in a role=button). Never auto-advances, never stamps.
    return (
      <div onClick={onDone} style={{ position: 'absolute', inset: 0, background: wireGround, color: INKF, padding: '52px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', cursor: 'pointer' }}>

        {/* topbar */}
        <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: INKF70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${INKF}`, paddingBottom: 8 }}>
          <span>Shape Wire</span>
          <span style={{ color: INKF }}>{dateShort}</span>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: INKF50 }}>Putting today together…</div>
        ) : (
          // Signed-out preview only — the invite edition (members render the
          // telegram above): one clean wire dispatch, centered (the owner cut
          // the Inside Shape / In the world catalog columns — the pitch IS the
          // page). Tap-only "Step inside"; never auto-advances.
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: INKF50 }}>To: You · Invitation</div>
            {/* the pitch, on the wire */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { text: 'The Shape Wire lands every morning' },
                { text: 'Your training · your nutrition · your numbers · a note from your coach' },
                { text: 'Step inside to make it yours', hot: true },
              ].map((ln, i) => (
                <div key={i} className="bs-wire-line" style={{ animationDelay: (reduced ? 0 : 0.12 + i * 0.11) + 's', fontFamily: mono, fontSize: 12.5, fontWeight: ln.hot ? 700 : 500, lineHeight: 1.95, letterSpacing: '0.08em', textTransform: 'uppercase', color: ln.hot ? ACCF : INKF, textShadow: ln.hot ? '0 0 10px rgba(46,224,196,0.3)' : 'none' }}>
                  {ln.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA — tap to enter the app (the whole screen is also tappable).
            Clipped solid teal: the page's one action, matching the wall's JOIN. */}
        <button onClick={onDone} className="bs-wire-enter" style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)', margin: '4px auto 0', width: 'fit-content', padding: '12px 30px', background: ACCF, color: '#05080c', border: 0, fontFamily: mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
          <span>Step inside</span>
          <span style={{ letterSpacing: 0 }}>→</span>
        </button>
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

function BSLogin({ onLogin, onBrowse, onApply, onBack, role, setRole, initialMode }) {
  const t = useBS();
  const [mode, setMode] = useStateBSM(initialMode || 'signin'); // 'signin' | 'create'
  const [authMethod, setAuthMethod] = useStateBSM('email'); // 'email' | 'phone'
  // The email create form files in two short steps: 1 identity → 2 credentials.
  const [createStep, setCreateStep] = useStateBSM(1);
  const [fullName, setFullName] = useStateBSM('');
  const [dob, setDob] = useStateBSM('');
  const [username, setUsername] = useStateBSM('');
  const [unameOk, setUnameOk] = useStateBSM(null); // null = unchecked/checking · true · false
  const [email, setEmail] = useStateBSM('');
  const [password, setPassword] = useStateBSM('');
  const [phone, setPhone] = useStateBSM('');
  const [otpCode, setOtpCode] = useStateBSM('');
  const [otpSent, setOtpSent] = useStateBSM(false);
  const [authError, setAuthError] = useStateBSM('');
  const [busy, setBusy] = useStateBSM(false);
  const [verifyEmail, setVerifyEmail] = useStateBSM(''); // set → show the "check your email" screen
  const [isDietitian, setIsDietitian] = useStateBSM(false); // within the nutritionist signup: RD/RDN
  // Cloudflare Turnstile (CAPTCHA) — bot protection on the auth requests. No-op
  // until a site key is set (window.SHAPE_TURNSTILE_SITEKEY via turnstile.js).
  // We block submit until a token exists, then hand it to Supabase Auth (which
  // verifies it server-side once Auth CAPTCHA is enabled in the dashboard).
  const [captchaToken, setCaptchaToken] = useStateBSM('');
  const captchaRef = React.useRef(null);
  const captchaIdRef = React.useRef(null);
  const captchaOn = typeof window !== 'undefined' && !!(window.ShapeTurnstile && window.ShapeTurnstile.enabled());
  // Which container the Turnstile widget currently lives in: the auth form, the
  // verify-email screen (so Resend can solve a fresh challenge), or nowhere (the
  // phone code-entry step needs no token). When the slot changes, tear the spent
  // single-use widget down and render a fresh one in the newly-mounted container —
  // this also covers returning from the OTP step, which previously kept the stale
  // widget id and re-submitted a consumed token.
  const captchaSlot = !captchaOn ? null
    : verifyEmail ? 'verify'
    : (authMethod === 'phone' && otpSent) ? null
    : (mode === 'create' && authMethod !== 'phone' && createStep === 1) ? null // the identity step makes no auth request
    : 'form';
  React.useEffect(() => {
    if (captchaIdRef.current != null) {
      window.ShapeTurnstile.remove?.(captchaIdRef.current);
      captchaIdRef.current = null;
    }
    setCaptchaToken('');
    if (!captchaSlot) return;
    const el = captchaRef.current;
    if (!el) return;
    window.ShapeTurnstile.render(el, setCaptchaToken).then((id) => { captchaIdRef.current = id; });
  }, [captchaSlot]);
  const resetCaptcha = () => { setCaptchaToken(''); if (captchaIdRef.current != null) window.ShapeTurnstile.reset(captchaIdRef.current); };
  const isCreate = mode === 'create';
  const isPhone = authMethod === 'phone';
  // A nutritionist applicant who is a Registered Dietitian signs up as 'dietitian'
  // (same nutrition discipline + surfaces; credentialed label). Profile role wins after.
  const signupRole = (role === 'nutritionist' && isDietitian) ? 'dietitian' : role;
  // Clear the RD/RDN toggle if the role changes away from nutritionist, so a
  // stale checkbox can't carry a dietitian signup into another role.
  React.useEffect(() => { if (role !== 'nutritionist') setIsDietitian(false); }, [role]);
  React.useEffect(() => { setCreateStep(1); }, [mode]);
  // Live username availability while creating an account (debounced).
  React.useEffect(() => {
    if (!isCreate || !username) { setUnameOk(null); return; }
    if (!/^[a-z0-9][a-z0-9._]{2,19}$/.test(username)) { setUnameOk(false); return; }
    let dead = false;
    setUnameOk(null);
    const id = setTimeout(() => {
      const check = window.ShapeAuth?.checkUsername;
      if (!check) { if (!dead) setUnameOk(true); return; } // pre-migration / demo: don't block signup
      check(username).then(ok => { if (!dead) setUnameOk(ok === null ? true : ok); }).catch(() => { if (!dead) setUnameOk(true); });
    }, 300);
    return () => { dead = true; clearTimeout(id); };
  }, [username, isCreate]);
  const submitAuth = async () => {
    setAuthError('');
    const auth = window.ShapeAuth;
    const trimmedEmail = email.trim();
    if (auth?.configured && (!trimmedEmail || !password)) {
      setAuthError('Enter your email and password.');
      return;
    }
    if (auth?.configured && isCreate && (!username || unameOk === false)) {
      setCreateStep(1); // identity-step problem — surface it on its own step
      setAuthError(!username ? 'Pick a username — it becomes your Shape handle.' : 'That username is taken or invalid — try another.');
      return;
    }
    // 18+ age gate at account creation.
    if (auth?.configured && isCreate) {
      if (!dob) { setCreateStep(1); setAuthError('Enter your date of birth — Shape is for adults 18 and over.'); return; }
      const d = new Date(dob); const eighteen = new Date(); eighteen.setFullYear(eighteen.getFullYear() - 18);
      if (isNaN(d.getTime()) || d > eighteen) { setCreateStep(1); setAuthError('You must be 18 or older to use Shape.'); return; }
    }
    if (captchaOn && !captchaToken) { setAuthError("Just a moment — confirming you're human…"); return; }
    setBusy(true);
    try {
      const result = isCreate
        ? await auth.signUp({ email: trimmedEmail, password, fullName: fullName.trim(), role: signupRole, username, captchaToken, dob })
        : await auth.signIn({ email: trimmedEmail, password, role, captchaToken });
      // New account needs email confirmation → show the verify screen, don't enter the app.
      if (result?.needsEmailConfirmation) { setVerifyEmail(result.email || trimmedEmail); return; }
      const nextRole = result?.profile?.role;
      if (nextRole && nextRole !== role) setRole(nextRole);
      // New accounts must take the $5/mo membership — go straight to Stripe
      // checkout. On a successful redirect we never return here; if checkout
      // can't start, fall through into the app (the gate shows the paywall so
      // they can still Activate). Coaches are members by role — skip checkout.
      if (isCreate && role !== 'trainer' && role !== 'nutritionist') {
        await bsmStartCheckout();
      }
      onLogin(result);
    } catch (error) {
      if (captchaOn) resetCaptcha();
      setAuthError(error?.message || 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };
  // Step 1 → 2 of the create dispatch: validate the identity fields before
  // asking for credentials (submitAuth re-checks everything at transmit).
  const advanceIdentity = () => {
    setAuthError('');
    const auth = window.ShapeAuth;
    if (auth?.configured) {
      if (!username || unameOk === false) {
        setAuthError(!username ? 'Pick a username — it becomes your Shape handle.' : 'That username is taken or invalid — try another.');
        return;
      }
      if (!dob) { setAuthError('Enter your date of birth — Shape is for adults 18 and over.'); return; }
      const d = new Date(dob); const eighteen = new Date(); eighteen.setFullYear(eighteen.getFullYear() - 18);
      if (isNaN(d.getTime()) || d > eighteen) { setAuthError('You must be 18 or older to use Shape.'); return; }
    }
    setCreateStep(2);
  };
  const resendVerify = async () => {
    // Resend hits Supabase Auth, so it needs its own captcha token once Auth
    // CAPTCHA is on (the signup token is already spent). The verify screen renders
    // its own widget; require + forward that token, then reset it for a re-resend.
    if (captchaOn && !captchaToken) { window.__bsToast?.("One moment — confirming you're human…", 'err'); return; }
    try {
      await window.ShapeAuth?.resendConfirmation?.(verifyEmail, captchaOn ? captchaToken : undefined);
      window.__bsToast?.('Verification email re-sent', 'ok');
    } catch (e) {
      window.__bsToast?.(e?.message || 'Could not resend the email.', 'err');
    } finally {
      if (captchaOn) resetCaptcha();
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
    // 18+ age gate — phone signup creates an account too (shouldCreateUser), so it
    // must enforce the same gate as email signup, not just the email path.
    if (isCreate) {
      if (!dob) { setAuthError('Enter your date of birth — Shape is for adults 18 and over.'); return; }
      const d = new Date(dob); const eighteen = new Date(); eighteen.setFullYear(eighteen.getFullYear() - 18);
      if (isNaN(d.getTime()) || d > eighteen) { setAuthError('You must be 18 or older to use Shape.'); return; }
    }
    if (captchaOn && !captchaToken) { setAuthError("Just a moment — confirming you're human…"); return; }
    setPhone(e164);
    setBusy(true);
    try {
      await auth.signInWithPhone({ phone: e164, fullName: fullName.trim(), role: signupRole, captchaToken, dob: isCreate ? dob : undefined, isCreate });
      setOtpSent(true);
    } catch (error) {
      if (captchaOn) resetCaptcha();
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
      const result = await auth.verifyPhoneOtp({ phone: _bsNormalizePhone(phone), token: otpCode.trim(), fullName: fullName.trim(), role: signupRole, dob: isCreate ? dob : undefined });
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
    setCreateStep(1);
  };
  // Fixed-dark wire palette (the launch surfaces never follow the paper theme).
  ensureWireStyles();
  const CREAM = '#f2ede4';
  const C70 = 'rgba(242,237,228,0.72)';
  const C50 = 'rgba(242,237,228,0.5)';
  const LINE = 'rgba(242,237,228,0.18)';
  const LINE2 = 'rgba(242,237,228,0.34)';
  const WIRE_BG = 'radial-gradient(135% 90% at 50% -8%, rgba(52,214,197,0.13), transparent 52%), linear-gradient(176deg, #0b161c 0%, #070b11 48%, #03050b 100%)';
  const labelStyle = { fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: C50, marginBottom: 4 };
  const linkBtn = { background: 'transparent', border: 0, color: C50, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '2px 0' };
  const roleLabel = { client: 'Client', trainer: 'Trainer', nutritionist: 'Nutritionist', dietitian: 'Dietitian (RD/RDN)' }[signupRole] || 'Client';
  const shortRole = roleLabel.replace(' (RD/RDN)', '');
  const stepped = isCreate && !isPhone; // the email create dispatch runs the 2-step split
  // The wire-form grammar: mono label column + a dot-leader entry line per field.
  const rowLabel = { flex: '0 0 84px', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C50 };
  const rowInput = { fontFamily: t.DISPLAY, fontSize: 14, color: CREAM, padding: '1px 0' };
  const subNote = { fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 };
  const stepLine = { fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C50 };
  const wireField = (label, inputEl, note) => (
    <div>
      <div className="bs-wire-frow">
        <div style={rowLabel}>{label}</div>
        {inputEl}
      </div>
      {note || null}
    </div>
  );
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
      <div style={{ position: 'absolute', inset: 0, color: CREAM, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: WIRE_BG }}>
        <BSWireGround dim />
        <div className="bs-hide-scroll" style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'max(40px, calc(env(safe-area-inset-top, 0px) + 24px)) 24px calc(28px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
          <img src={`${import.meta.env.BASE_URL}shape-logo.png?v=2`} alt="Shape" style={{ width: 110, height: 'auto', aspectRatio: '3696 / 1782', alignSelf: 'flex-start', marginLeft: -12 }} />
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#2ee0c4', fontWeight: 700 }}>Verify email</div>
          <div style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 500, fontSize: 38, lineHeight: 0.95, letterSpacing: '-0.05em', color: CREAM }}>Check your<br/><span style={{ fontStyle: 'italic', color: '#2ee0c4' }}>inbox.</span></div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.5, color: 'rgba(244,239,230,0.8)' }}>
            We sent a verification link to <span style={{ color: CREAM, fontWeight: 700 }}>{verifyEmail}</span>. Tap it to finish creating your account, then come back and sign in.
          </div>
          {captchaOn && (
            <div ref={captchaRef} style={{ minHeight: 65, display: 'flex', justifyContent: 'center' }} />
          )}
          <button onClick={resendVerify} style={{ width: '100%', minHeight: 44, borderRadius: 0, padding: '12px 16px', background: 'transparent', color: C70, border: `1px solid ${LINE2}`, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Resend email</button>
          <button onClick={() => { setVerifyEmail(''); setMode('signin'); setPassword(''); }} style={{ alignSelf: 'center', background: 'transparent', border: 0, color: C50, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '4px 0' }}>← Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, color: CREAM, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: WIRE_BG }}>
      <BSWireGround dim />
      {onBack && (
        <button onClick={onBack} style={{ position: 'absolute', zIndex: 3, top: 'max(16px, calc(env(safe-area-inset-top, 0px) + 10px))', left: 18, background: 'transparent', border: 0, color: C70, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '6px 4px' }}>← Back</button>
      )}
      <div className="bs-hide-scroll" style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'max(52px, calc(env(safe-area-inset-top, 0px) + 40px)) 22px calc(20px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* Logo lockup — top-left. marginTop:auto (+ the footer's marginBottom:auto)
            centers the column when it's short and top-aligns it when the create
            form overflows — a plain justify-content:center clips the top. */}
        <img src={`${import.meta.env.BASE_URL}shape-logo.png?v=2`} alt="Shape" style={{ width: 132, height: 'auto', aspectRatio: '3696 / 1782', display: 'block', marginLeft: -13, marginTop: 'auto', filter: 'brightness(1.3) contrast(1.12) drop-shadow(0 0 12px rgba(46,224,196,0.4))' }} />

        {/* Eyebrow + heading */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#2ee0c4', fontWeight: 700 }}>
            {isCreate ? 'Join Shape' : 'Sign in'}
          </div>
          <div style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 500, fontSize: 37, lineHeight: 0.94, letterSpacing: '-0.045em', color: CREAM, marginTop: 4 }}>
            {isCreate ? (
              <>Join the<br/><span style={{ fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.065em', color: '#2ee0c4' }}>community.</span></>
            ) : (
              <>Welcome<br/><span style={{ fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.065em', color: '#2ee0c4' }}>back.</span></>
            )}
          </div>
        </div>

        {/* Step register — the create dispatch files in two short parts */}
        {stepped && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `2px solid ${LINE2}`, paddingBottom: 6, margin: '12px 0 2px' }}>
            <span style={stepLine}>Step {createStep} of 2</span>
            <span style={{ ...stepLine, color: '#2ee0c4' }}>{createStep === 1 ? 'Identity' : 'Credentials'}</span>
          </div>
        )}

        {/* Role — sign-in always · create step 1 (identity) */}
        {(!stepped || createStep === 1) && (
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>I'm a</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, border: `1px solid ${LINE2}`, borderRadius: 6, padding: 4 }}>
            {[['client','Client'],['trainer','Trainer'],['nutritionist','Nutritionist']].map(([k, l]) => {
              const on = role === k;
              return <button key={k} onClick={() => setRole(k)} style={{
                padding: '7px 4px', borderRadius: 3, border: 0,
                background: on ? '#34d6c5' : 'transparent', color: on ? '#05080c' : CREAM,
                fontFamily: t.MONO, fontSize: 9, fontWeight: on ? 800 : 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{l}</button>;
            })}
          </div>
          {/* Within the nutritionist application: declare RD/RDN (same discipline, credentialed). */}
          {isCreate && role === 'nutritionist' && (
            <button onClick={() => setIsDietitian(v => !v)} style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'transparent', border: `1px solid ${LINE2}`, borderRadius: 4, padding: '9px 12px', cursor: 'pointer' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 600, color: CREAM }}>I'm a Registered Dietitian (RD/RDN)</div>
                <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: C50, marginTop: 2 }}>Same nutrition tools · credentialed badge</div>
              </div>
              <span style={{ width: 40, height: 23, borderRadius: 999, border: `1px solid ${isDietitian ? '#0ac5a8' : LINE2}`, background: isDietitian ? '#0ac5a8' : 'transparent', position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: isDietitian ? 19 : 2, width: 17, height: 17, borderRadius: 999, background: isDietitian ? '#031f1c' : C50 }} />
              </span>
            </button>
          )}
        </div>
        )}

        {/* Fields — the dispatch form: mono label column + dot-leader entry lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {isCreate && (!stepped || createStep === 1) && wireField('Name',
            <input className="bs-wire-input" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" style={rowInput} />
          )}
          {isCreate && (!stepped || createStep === 1) && wireField('DOB · 18+',
            <input className="bs-wire-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} aria-label="Date of birth" style={rowInput} />
          )}
          {stepped && createStep === 1 && wireField('Handle',
            <input className="bs-wire-input" placeholder="your.handle" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20))} autoComplete="username" autoCapitalize="none" style={rowInput} />,
            <div style={{ ...subNote, color: username ? (unameOk === false ? '#ff9b7a' : unameOk ? '#2ee0c4' : C50) : C50 }}>
              {!username ? 'Your Shape handle — letters · numbers · . _' : unameOk === false ? 'Taken or invalid — 3–20 chars, starts with a letter or number' : unameOk ? `@${username} is yours` : 'Checking…'}
            </div>
          )}
          {stepped && createStep === 2 && (
            <>
              <button type="button" onClick={() => { setCreateStep(1); setAuthError(''); }} style={{ alignSelf: 'flex-start', background: 'transparent', border: 0, color: '#2ee0c4', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '0 0 2px' }}>← Step 1 · Identity</button>
              <div style={{ ...subNote, marginTop: 0, color: C50 }}>Filed: {fullName.trim() || '—'} · @{username || '—'}{isDietitian ? ' · RD/RDN' : ''}</div>
              {wireField('Email',
                <input className="bs-wire-input" placeholder="you@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" style={rowInput} />
              )}
              {wireField('Password',
                <input className="bs-wire-input" placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={rowInput} />
              )}
            </>
          )}
          {isPhone ? (
            <>
              <button type="button" onClick={() => switchMethod('email')} style={{ alignSelf: 'flex-start', background: 'transparent', border: 0, color: '#2ee0c4', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '0 0 2px' }}>← Back to email</button>
              {wireField('Phone',
                <input className="bs-wire-input" placeholder="+1 555 123 4567" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" disabled={otpSent} style={{ ...rowInput, color: otpSent ? C50 : CREAM }} />
              )}
              {otpSent && wireField('Code',
                <input className="bs-wire-input" placeholder="6-digit code" type="tel" inputMode="numeric" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} autoComplete="one-time-code" style={{ ...rowInput, fontSize: 20, letterSpacing: '0.3em' }} />
              )}
              {otpSent && (
                <button onClick={() => { setOtpSent(false); setOtpCode(''); setAuthError(''); }} style={{ alignSelf: 'flex-start', ...linkBtn }}>← Change number</button>
              )}
            </>
          ) : (!isCreate && (
            <>
              {wireField('Account',
                <input className="bs-wire-input" placeholder="Email or @handle" type="text" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" style={rowInput} />
              )}
              {wireField('Password',
                <input className="bs-wire-input" placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={rowInput} />
              )}
            </>
          ))}
          {authError && (
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ff9b7a', lineHeight: 1.35 }}>
              {authError}
            </div>
          )}
          {!isCreate && !isPhone && (
            <button onClick={forgotPassword} style={{ alignSelf: 'flex-end', background: 'transparent', border: 0, color: '#2ee0c4', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', padding: '2px 0' }}>Forgot password →</button>
          )}
        </div>

        {/* Turnstile bot challenge — mounts whenever this screen can fire an auth
            request (interaction-only: invisible unless Cloudflare needs a click). */}
        {captchaSlot === 'form' && (
          <div ref={captchaRef} style={{ display: 'flex', justifyContent: 'center' }} />
        )}

        {/* Primary action — TRANSMIT, the launch's clipped solid-teal CTA */}
        <button
          onClick={isPhone ? (otpSent ? verifyPhoneCode : sendPhoneCode) : (stepped && createStep === 1 ? advanceIdentity : submitAuth)}
          disabled={busy}
          className="bs-wire-enter"
          style={{ width: '100%', marginTop: 6, clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)', padding: '13px 14px', background: '#34d6c5', color: '#05080c', border: 0, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy
            ? (isCreate ? 'Transmitting…' : 'Signing in…')
            : isPhone
              ? (otpSent ? (isCreate ? 'Transmit · Verify & join →' : 'Transmit · Verify & sign in →') : 'Transmit · Text me a code →')
              : stepped
                ? (createStep === 1 ? 'Next · Credentials →' : `Transmit · Join as ${shortRole} →`)
                : `Transmit · Sign in as ${shortRole} →`}
        </button>

        {/* Create account / apply — role-aware: clients create an account,
            trainers & nutritionists route to the Apply to Shape application. */}
        {!isCreate && (
          <button onClick={() => {
            setAuthError('');
            if (role === 'trainer' || role === 'nutritionist' || role === 'dietitian') { if (onApply) onApply(signupRole); else setMode('create'); }
            else { setMode('create'); }
          }} style={{ width: '100%', minHeight: 44, borderRadius: 0, padding: '11px 14px', background: 'transparent', color: C70, border: `1px solid ${LINE2}`, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
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
          <button onClick={() => switchMethod('phone')} style={{ width: '100%', minHeight: 44, borderRadius: 0, padding: '11px 14px', background: 'rgba(255,255,255,0.03)', color: C70, border: `1px solid ${LINE2}`, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
            Continue with phone number
          </button>
        )}

        {/* Secondary links */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '24px 18px', marginTop: 40, marginBottom: 'auto' }}>
          <button onClick={() => { setMode(isCreate ? 'signin' : 'create'); setAuthError(''); }} style={{ ...linkBtn, fontSize: 11, fontWeight: 800 }}>{isCreate ? 'Have an account? Sign in' : 'New here? Join Shape'}</button>
          {isPhone && <button onClick={() => switchMethod('email')} style={{ ...linkBtn, fontSize: 11, fontWeight: 800 }}>Use email instead</button>}
        </div>
      </div>
    </div>
  );
}

// Start the $5/mo platform checkout (Stripe-hosted). Bearer when available,
// cookie otherwise; redirects to the returned checkout URL.
async function bsmStartCheckout() {
  try {
    const token = window.ShapeAuth?.getCachedState?.()?.session?.access_token;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch('/api/stripe/platform-checkout', { method: 'POST', headers, credentials: 'same-origin', body: '{}' });
    const d = await res.json().catch(() => ({}));
    if (d && d.url) { window.location.assign(d.url); return; }
    window.__bsToast?.(d?.error || 'Could not start checkout — try again.', 'err');
  } catch (e) { window.__bsToast?.('Could not start checkout — try again.', 'err'); }
}

// The membership-resolving hold — the wire ground, no "Checking membership…"
// copy (the check rides the launch, never gets its own labelled screen). Used
// as the stage-'app'/'gate' safety-net loading state.
function BSWireHold() {
  const holdMono = `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`;
  // Mirrors the beat's composition (plate top · floating haloed mark · ON AIR
  // dial · loading low) so a beat→hold transition never visibly jumps.
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'radial-gradient(135% 90% at 50% -8%, rgba(52,214,197,0.13), transparent 52%), linear-gradient(176deg, #0b161c 0%, #070b11 48%, #03050b 100%)', display: 'flex', flexDirection: 'column' }}>
      <BSWireGround />
      <div style={{ position: 'relative', zIndex: 1, margin: '0 26px', padding: 'max(54px, calc(16px + env(safe-area-inset-top, 0px))) 0 10px', borderBottom: '1px solid rgba(242,237,228,0.2)', display: 'flex', justifyContent: 'space-between', fontFamily: holdMono, fontSize: 8, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(242,237,228,0.45)' }}>
        <span>The Shape Community</span><span>Vol. 1 · No. 1</span>
      </div>
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="bs-wire-mark-float">
          <span className="bs-wire-mark-halo" aria-hidden="true" />
          <BSShapeMark size={112} calm />
        </div>
      </div>
      <BSWireDial />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center', paddingBottom: 'max(44px, calc(30px + env(safe-area-inset-bottom, 0px)))' }}>
        <BSWireLoading top={0} />
      </div>
    </div>
  );
}

// Full-screen membership wall for non-members. Offers Join (checkout / create
// account), Sign in, and a "Preview the app" path so prospects can look around.
// The members wall — the app's only conversion gate. Logic verbatim (Join /
// Preview / Sign in / Sign out + the paywall_viewed analytics), re-set in the
// launch's wire grammar: the drifting ticker behind it (the wire is live, you're
// just not on it yet), the feature list as one dot-separated wire line, and a
// clipped solid-teal JOIN as the one commerce action. Fixed-dark (a launch
// surface), so it does NOT follow the paper theme — matching the beat/telegram.
function BSPaywall({ signedIn, onJoin, onSignIn, onPreview, onLogout }) {
  ensureWireStyles();
  const INKF = '#f2ede4', INKF70 = 'rgba(242,237,228,0.7)', INKF50 = 'rgba(242,237,228,0.55)', RULEF = 'rgba(242,237,228,0.2)', teal = '#34d6c5';
  const mono = `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`;
  React.useEffect(() => { try { window.ShapeAnalytics?.track?.('paywall_viewed'); } catch (e) {} }, []);
  // Owner call: no STOP/END tokens — house middle-dot separators carry the line.
  const feat = ['Training', 'Nutrition', 'Coaches', 'Radio', 'The Score', 'Or build your own workouts'];
  const cta = { width: '100%', padding: '13px', clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)', border: 0, background: teal, color: '#05080c', fontFamily: mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' };
  const ghost = { width: '100%', minHeight: 44, padding: '11px', border: `1px solid ${RULEF}`, background: 'transparent', color: INKF70, fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' };
  const textAction = { minHeight: 44, padding: '9px 24px', border: 0, background: 'transparent', color: teal, fontFamily: mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' };
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: 'radial-gradient(135% 90% at 50% -8%, rgba(52,214,197,0.13), transparent 52%), linear-gradient(176deg, #0b161c 0%, #070b11 48%, #03050b 100%)', color: INKF }}>
      <BSWireGround dim />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding: '52px 26px 34px' }}>
        <img src={`${import.meta.env.BASE_URL}shape-logo.png?v=2`} alt="Shape" style={{ width: 124, height: 'auto', aspectRatio: '3696 / 1782', alignSelf: 'flex-start', marginLeft: -2, marginTop: 10, filter: 'brightness(1.25) contrast(1.1) drop-shadow(0 0 10px rgba(46,224,196,0.32))' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 8 }}>
          <h1 style={{ fontFamily: `'Newsreader', Georgia, serif`, fontSize: 40, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 0.98, margin: '4px 0 0' }}>Shape is for <span style={{ fontStyle: 'italic', color: teal }}>members.</span></h1>
          <div style={{ margin: '18px 0 0', fontFamily: mono, fontSize: 9.5, fontWeight: 500, lineHeight: 2.15, letterSpacing: '0.1em', textTransform: 'uppercase', color: INKF }}>
            {feat.join(' · ')}
          </div>
          <button onClick={onJoin} style={{ ...cta, marginTop: 26 }}>{signedIn ? 'Join · $5/mo →' : 'Create account & join · $5/mo →'}</button>
          <button onClick={onPreview} style={{ ...ghost, marginTop: 11 }}>Preview the app first →</button>
          {signedIn ? (
            <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center' }}>
              <button onClick={onLogout} style={textAction}>Sign out</button>
            </div>
          ) : (
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: INKF50 }}>I already have an account</div>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
                <button onClick={onSignIn} style={textAction}>Sign in →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Persistent "you're previewing" banner shown over the app for non-members who
// chose to look around — keeps the Join CTA present without blocking the view.
function BSPreviewBanner({ t, onJoin }) {
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [dismissed, setDismissed] = useStateBSM(false);
  if (dismissed) return null;
  return (
    <div style={{ position: 'absolute', left: 12, right: 12, bottom: 78, zIndex: 150, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 10px 14px', borderRadius: 14, background: t.INK, color: t.PAPER, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: teal }}>Preview · demo data</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, marginTop: 1, lineHeight: 1.3 }}>These numbers are an example of a live account — not real tracking. Switch profile type in Settings.</div>
      </div>
      <button onClick={onJoin} style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 999, border: 0, background: t.PAPER, color: t.INK, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>$5/mo →</button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 999, border: 0, background: 'transparent', color: t.PAPER, opacity: 0.7, cursor: 'pointer', fontFamily: t.MONO, fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✕</button>
    </div>
  );
}

// The preview banner shouldn't sit on top of the full-screen Radio prompt (the
// "Want music while you move?" overlay) — hold it until that's answered and the
// user is actually in the app. Reads the radio context, so it must render inside
// BSRadioProvider (it does — it's rendered alongside <App>).
function BSPreviewBannerGated({ t, onJoin }) {
  const r = useBSRadio();
  if (r?.showPrompt) return null;
  return <BSPreviewBanner t={t} onJoin={onJoin} />;
}

function BSAppShell({ tweaks, setTweak }) {
  const authConfigured = Boolean(window.ShapeAuth?.configured);
  // Boot decision (synchronous): a known member who already saw today's briefing
  // skips straight to the app (warm relaunch — the briefing is a morning ritual,
  // not a toll). Everyone else opens on the wire beat, which holds until the
  // membership check resolves behind it, then routes (lang / daily / gate). The
  // stage-'app' gate stays the safety net if the restore later disagrees.
  const [stage, setStage] = useStateBSM(() => {
    try {
      // The auth `state` is empty until getCurrentSession() hydrates it (async),
      // so the live uid isn't available synchronously at boot. Use the persisted
      // 'shape.lastUid' (written when membership resolves, cleared on logout) so
      // the uid-scoped warm-skip still works on a fresh JS context.
      const uid = localStorage.getItem('shape.lastUid');
      const stamp = localStorage.getItem('shape.dailySeen');
      const memberCached = (window.ShapeMembership && window.ShapeMembership.active === true) || localStorage.getItem('shape.member') === '1';
      return bsLaunchRoute({ stamp, uid, todayLocal: bsLocalDay(), memberCached });
    } catch (e) { return 'beat'; }
  });
  // Seed from the signed-in profile's role first (so a trainer/nutritionist lands
  // on their own app, not the client one) before the persisted/demo role.
  const [role, setRole] = useStateBSM(() => {
    const cachedRole = window.ShapeAuth?.getCachedState?.()?.profile?.role;
    return cachedRole || tweaks.role || 'client';
  });
  const [authState, setAuthState] = useStateBSM(() => window.ShapeAuth?.getCachedState?.() || {});
  const [browseMode, setBrowseMode] = useStateBSM(false);
  const [bannerDismissed, setBannerDismissed] = useStateBSM(false);
  const [noticeDismissed, setNoticeDismissed] = useStateBSM(false);
  const [loginMode, setLoginMode] = useStateBSM('signin'); // initial tab on next login mount
  const [applyRole, setApplyRole] = useStateBSM(null); // pro role applying for → opens the application screen
  const [bundleLoading, setBundleLoading] = useStateBSM(false);
  const [bundleError, setBundleError] = useStateBSM('');
  // App-wide membership gate. Shape is members-only: full access requires an
  // active $5/mo subscription OR an approved coach account (role from the
  // profile). Seeded from window.ShapeMembership so members don't flash the
  // paywall on reload.
  const [membership, setMembership] = useStateBSM(() => {
    // Seed from the last-known status so a confirmed member never flashes the
    // paywall on reload. window cache first, then a persisted localStorage hint.
    try {
      if (window.ShapeMembership && typeof window.ShapeMembership.active === 'boolean') return { loading: false, active: window.ShapeMembership.active };
      const ls = localStorage.getItem('shape.member');
      if (ls === '1') return { loading: false, active: true };
      if (ls === '0') return { loading: false, active: false };
    } catch (e) {}
    return { loading: true, active: false };
  });
  // Whether auth has resolved (session restore complete). Until it has, we hold
  // on the "Checking membership…" state instead of deciding — so a returning
  // member OR coach never flashes the paywall before their session + role are
  // restored. (getCurrentSession runs during the splash, so this is resolved by
  // the time we reach the app stage.)
  const [authReady, setAuthReady] = useStateBSM(() => !authConfigured);
  // Non-members can choose "Preview the app" from the paywall to look around
  // (see features + overall function) behind a persistent Join banner.
  const [previewMode, setPreviewMode] = useStateBSM(false);
  const t = useBS();

  useEffectBSM(() => {
    // Prefer the signed-in profile's role so a coach isn't downgraded to client
    // when the persisted tweak is empty.
    const cachedRole = window.ShapeAuth?.getCachedState?.()?.profile?.role;
    setRole(tweaks.role || cachedRole || 'client');
  }, [tweaks.role]);

  // i18n: keep i18next + text direction in sync with the locale preference (the
  // Settings switcher and the first-launch picker both write through ShapeLocale).
  useEffectBSM(() => window.ShapeLocale?.subscribe?.((code) => {
    try { bsI18n.changeLanguage(code); } catch (e) {}
    applyDir(code);
  }), []);

  // i18n: on login, the account's stored locale wins (and back-fills this device).
  // If we're still on the first-launch picker, the account already answered — skip it.
  useEffectBSM(() => {
    const uid = authState?.user?.id;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const goals = await window.shapeDb?.getUserGoals?.('app_locale');
        const accountLocale = goals?.locale || null;
        const resolved = await window.ShapeLocale?._hydrateFromAccount?.(accountLocale);
        if (!cancelled && accountLocale && resolved) setStage((s) => (s === 'lang' ? 'gate' : s));
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [authState?.user?.id]);

  // Follow the signed-in account's role whenever a session resolves (login OR
  // restore). The account's role wins so a trainer/nutritionist lands in their
  // OWN app instead of the client default — fixing "log in as trainer → client
  // profile". The Tweaks-panel override still works (it sets tweaks.role, which
  // the effect above applies and this one — keyed on the profile — won't undo).
  useEffectBSM(() => {
    const profileRole = authState?.profile?.role;
    if (profileRole) setRole(profileRole);
  }, [authState?.profile?.role]);

  // Apply the saved units preference (Imperial / Metric) at startup so weight
  // & distance readouts format correctly before Settings is ever opened.
  useEffectBSM(() => {
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    let alive = true;
    window.shapeDb.getUserGoals('client_settings')
      .then(s => { if (alive && s && s.units) window.ShapeUnits?.set(s.units); })
      .catch(() => {});
    return () => { alive = false; };
  }, [authState?.user?.id]);

  // Replay splash on demand from Tweaks panel
  useEffectBSM(() => {
    function onReplay() { setBeatMinElapsed(false); setStage('beat'); }
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

  // Resolve membership whenever the signed-in user changes. Coaches bypass at
  // the gate (by role), so this only matters for clients. Signed-out → inactive.
  // Re-verifies in the background (no loading flash when we already have a value).
  useEffectBSM(() => {
    if (!authReady) return () => {}; // wait for session restore before deciding
    let cancelled = false;
    const uid = authState?.user?.id;
    if (!uid) {
      try { window.ShapeMembership = { active: false }; localStorage.removeItem('shape.member'); localStorage.removeItem('shape.lastUid'); } catch (e) {}
      setMembership({ loading: false, active: false });
      return () => {};
    }
    // Persist the signed-in uid so the next cold boot can make the uid-scoped
    // warm-skip decision synchronously (the auth state hydrates async).
    try { localStorage.setItem('shape.lastUid', uid); } catch (e) {}
    fetch('/api/stripe/subscription', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('unreachable'))))
      .then(d => {
        const active = !!(d && d.active === true);
        try { window.ShapeMembership = { active }; localStorage.setItem('shape.member', active ? '1' : '0'); } catch (e) {}
        if (!cancelled) setMembership({ loading: false, active });
      })
      .catch(() => {
        // Couldn't verify — fail-closed, but never lock out a previously-confirmed
        // member: fall back to the last-known status (window/localStorage cache).
        let cached = false;
        try { cached = (window.ShapeMembership && window.ShapeMembership.active === true) || localStorage.getItem('shape.member') === '1'; } catch (e) {}
        if (!cancelled) setMembership({ loading: false, active: cached });
      });
    return () => { cancelled = true; };
  }, [authState?.user?.id, authReady]);

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
    dietitian: window.BSNutritionistApp, // RD/RDN → the nutrition coach surfaces
    shape_radio: window.BSClientApp,
  };
  // Don't silently fall back to the client app for coach roles — if their app
  // module isn't loaded yet, render nothing (the loader below shows) until it is.
  const isCoachRole = role === 'trainer' || role === 'nutritionist' || role === 'dietitian';
  const App = appByRole[role] || (isCoachRole ? null : window.BSClientApp);
  const appProps = role === 'shape_radio' ? { initialTab: 'radio' } : {};

  // ── App-wide member gate ──────────────────────────────────────────────────
  // Approved coaches (authoritative profile role) get in free; everyone else
  // needs an active subscription. Non-members can still "Preview the app" from
  // the paywall to look around behind a persistent Join banner.
  const realRole = authState?.profile?.role;
  const isApprovedCoach = realRole === 'trainer' || realRole === 'nutritionist';
  // Members-only, enforced at SIGNUP: account creation routes through $5/mo
  // checkout (see submitAuth), so every signed-in account is a paying member.
  // Therefore a signed-in user always gets in — the paywall is only for
  // signed-OUT visitors. (We keep the coach + active-subscription checks so the
  // gate still resolves before auth restores, and paid features remain enforced
  // server-side per endpoint.) This fixes the paywall re-appearing after login
  // when the subscription re-check is slow/unavailable for a real member.
  const signedIn = !!(authState?.user?.id);
  const memberAllowed = isApprovedCoach || signedIn || membership.active === true;
  const memberGateLoading = !isApprovedCoach && !signedIn && (!authReady || membership.loading);

  // The membership wall ('gate') sits between the wire beat and the "Shape
  // Daily" telegram: non-members see the paywall here; members auto-advance
  // past it to the telegram, then the app.
  useEffectBSM(() => {
    if (stage === 'gate' && !memberGateLoading && memberAllowed) setStage('daily');
  }, [stage, memberGateLoading, memberAllowed]);

  // The wire beat holds for a minimum dwell (~3.5s — owner call 2026-07-10:
  // let the overture breathe) while the membership check resolves BEHIND it
  // (memberGateLoading false), then routes on — language picker on first run,
  // else the telegram (members) or the gate/wall (non-members). No "Checking
  // membership…" screen ever renders.
  const [beatMinElapsed, setBeatMinElapsed] = useStateBSM(false);
  useEffectBSM(() => {
    if (stage !== 'beat') return undefined;
    const id = setTimeout(() => setBeatMinElapsed(true), 3500);
    return () => clearTimeout(id);
  }, [stage]);
  useEffectBSM(() => {
    if (stage !== 'beat' || !beatMinElapsed || memberGateLoading) return;
    let hasLocale = false; try { hasLocale = !!localStorage.getItem('shape.locale'); } catch (e) {}
    setStage(bsAfterBeat({ allowed: memberAllowed, hasLocale }));
  }, [stage, beatMinElapsed, memberGateLoading, memberAllowed]);

  // Expose "can this user actually send messages" (member access incl. coaches)
  // so the chat composer can lock for non-members previewing the app.
  useEffectBSM(() => {
    try { window.ShapeCanChat = memberAllowed; window.dispatchEvent(new Event('shape:canchat')); } catch (e) {}
  }, [memberAllowed]);
  // Let a deep "Join to send" CTA (e.g. the locked chat composer) exit preview
  // back to the paywall.
  useEffectBSM(() => {
    const exit = () => setPreviewMode(false);
    window.addEventListener('shape:exitPreview', exit);
    return () => window.removeEventListener('shape:exitPreview', exit);
  }, []);

  useEffectBSM(() => {
    let cancelled = false;
    if (!authConfigured) { setAuthReady(true); return () => {}; }
    window.ShapeAuth.getCurrentSession()
      .then((next) => {
        if (cancelled) return;
        setAuthState(next);
        if (next?.profile?.role && next.profile.role !== role) setRole(next.profile.role);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAuthReady(true); });
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
    const st = nextAuthState || window.ShapeAuth?.getCachedState?.() || {};
    setAuthState(st);
    // Land in the account's own app, and sync the role tweak so a stale dev
    // override (e.g. a previous "client" pick) can't pull a coach back to client.
    const r = st?.profile?.role;
    if (r) { setRole(r); setTweak('role', r); }
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
    setPreviewMode(false);
    try { window.ShapeMembership = { active: false }; localStorage.removeItem('shape.member'); localStorage.removeItem('shape.lastUid'); localStorage.removeItem('shape.dailySeen'); } catch (e) {}
    // Land on the membership wall (the gate), not the bare login screen.
    setStage('app');
  };

  // BSRadioProvider hoisted ABOVE the stage switch so radio state
  // (radioOn, askedPrompt, fxMode) survives logout → re-login. Without
  // hoisting, BSRadioProvider remounts on login and re-fires its 600ms
  // auto-prompt, causing a brief Home flash before the overlay covers it.
  return (
    <BSRadioProvider>
      <BSPhone>
        {stage === 'beat' && <BSSplash style="wire-beat" onDone={() => {}} />}
        {stage === 'lang' && <BSLanguagePicker onDone={() => setStage('gate')} />}
        {stage === 'gate' && (
          // Membership wall — shown BEFORE the "Shape Daily" telegram. Members
          // auto-advance (effect above); non-members see the paywall and choose
          // Join / Sign in / Preview (preview → the daily invite edition → app).
          memberGateLoading || memberAllowed ? (
            <BSWireHold />
          ) : (
            <BSPaywall
              signedIn={!!authUserId}
              onJoin={() => { if (authUserId) bsmStartCheckout(); else { setBrowseMode(false); setLoginMode('create'); setStage('login'); } }}
              onSignIn={() => { setBrowseMode(false); setLoginMode('signin'); setStage('login'); }}
              onPreview={() => { setPreviewMode(true); setStage('daily'); }}
              onLogout={handleLogout}
            />
          )
        )}
        {stage === 'daily' && <BSSplash style="classified" bg={tweaks.splashBg || 'plain'} bgColor={tweaks.splashBgColor || 'auto'} onDone={() => {
          // A real signed-in member entering their telegram stamps today's
          // seen-marker (warm relaunch skips the rest of the day). The signed-out
          // preview/invite path never stamps.
          if (authUserId && !previewMode) { try { localStorage.setItem('shape.dailySeen', bsDailyStamp(authUserId, bsLocalDay())); } catch (e) {} }
          setStage('app');
        }} />}
        {stage === 'login'  && <BSLogin
          key={loginMode}
          initialMode={loginMode}
          role={role}
          setRole={(r) => { setRole(r); setTweak('role', r); }}
          onLogin={handleLogin}
          onBack={() => setStage('gate')}
          onBrowse={() => { setBrowseMode(true); setBannerDismissed(false); setNoticeDismissed(false); setLoginMode('signin'); setStage('app'); }}
          onApply={(r) => { setApplyRole(r); loadClientBundle().then(() => setStage('apply')); }}
        />}
        {stage === 'apply' && (window.BSProviderApplicationScreen
          ? <window.BSProviderApplicationScreen initialRole={applyRole || 'trainer'} onBack={() => setStage('login')} />
          : <div style={{ margin: 18, padding: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Loading application…</div>)}
        {stage === 'app' && (
          // Gate order matters: show the paywall to non-members FIRST (it doesn't
          // need the role bundle), so the membership page lands right after the
          // splash. Members + previewers fall through to the real app.
          memberGateLoading ? (
            <BSWireHold />
          ) : (!memberAllowed && !previewMode) ? (
            <BSPaywall
              signedIn={!!authUserId}
              onJoin={() => { if (authUserId) bsmStartCheckout(); else { setBrowseMode(false); setLoginMode('create'); setStage('login'); } }}
              onSignIn={() => { setBrowseMode(false); setLoginMode('signin'); setStage('login'); }}
              onPreview={() => setPreviewMode(true)}
              onLogout={handleLogout}
            />
          ) : bundleError ? (
            <div style={{ margin: 18, padding: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              <div style={{ lineHeight: 1.5 }}>A new version is available. Reload to continue.</div>
              <button
                onClick={() => { try { window.sessionStorage.removeItem('bs-chunk-reloaded'); } catch (e) {} window.location.reload(); }}
                style={{ marginTop: 12, padding: '10px 16px', borderRadius: 999, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}
              >Reload →</button>
              <div style={{ marginTop: 10, fontSize: 8.5, color: t.INK50, letterSpacing: '0.06em', textTransform: 'none', wordBreak: 'break-all' }}>{bundleError}</div>
            </div>
          ) : !App ? (
            <div style={{ margin: 18, padding: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              Loading app...
            </div>
          ) : !memberAllowed ? (
            // Preview mode renders the real app behind a dismissible banner that
            // says the numbers are DEMO data — an example of a live account —
            // so a browsing prospect never mistakes them for real tracking.
            <>
              <App onLogout={handleLogout} authState={authState} tweaks={tweaks} setTweak={setTweak} {...appProps} />
              <BSPreviewBannerGated t={t} onJoin={() => { if (authUserId) bsmStartCheckout(); else { setPreviewMode(false); setLoginMode('create'); setStage('login'); } }} />
            </>
          ) : (
            <App onLogout={handleLogout} authState={authState} tweaks={tweaks} setTweak={setTweak} {...appProps} />
          )
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
          {[['light','Cream'],['white','White'],['dark','Black'],['teal','Teal'],['manila','Manila'],['blueprint','Blueprint'],['carbon','Carbon'],['steel','Steel'],['bone','Bone'],['oxblood','Oxblood'],['sage','Sage'],['forest','Forest'],['slate','Slate'],['plum','Plum']].map(([k,l]) => (
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

      <Section label="Text size">
        <div style={{ display: 'flex', gap: 4 }}>
          {[['small','S'],['medium','M'],['large','L']].map(([k, l]) => <Btn key={k} on={(tweaks.textScaleKey || 'medium') === k} onClick={() => setTweak('textScaleKey', k)}>{l}</Btn>)}
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
// ── Appearance-tweaks persistence ───────────────────────────────────
// Settings changed while signed in must stay put — survive reloads (localStorage)
// AND follow the account across devices/logins (user_goals('app_tweaks')). 'role'
// is never persisted here (it's derived from the signed-in profile).
const BS_TWEAKS_LOCAL_KEY = 'shape.tweaks';
const BS_TWEAKS_CLOUD_KIND = 'app_tweaks';
const BS_TWEAKS_NO_PERSIST = new Set(['role']);
function bsTweaksForCloud(t) { const o = { ...(t || {}) }; BS_TWEAKS_NO_PERSIST.forEach((k) => { delete o[k]; }); return o; }
function bsReadLocalTweaks() { try { return JSON.parse(window.localStorage.getItem(BS_TWEAKS_LOCAL_KEY) || '{}') || {}; } catch (e) { return {}; } }
function bsWriteLocalTweaks(t) { try { window.localStorage.setItem(BS_TWEAKS_LOCAL_KEY, JSON.stringify(bsTweaksForCloud(t))); } catch (e) {} }
let _bsTweakCloudTimer = null;
function bsSaveTweaksCloud(t) {
  if (_bsTweakCloudTimer) clearTimeout(_bsTweakCloudTimer);
  const snapshot = bsTweaksForCloud(t);
  _bsTweakCloudTimer = setTimeout(() => {
    try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals(BS_TWEAKS_CLOUD_KIND, snapshot); } catch (e) {}
  }, 600);
}

function BSApp() {
  const initial = window.__TWEAKS || {};
  // Seed appearance from the last device choice (localStorage) over the static
  // defaults, so a reload never flashes back to defaults. The account's saved
  // appearance (cloud) is loaded on login below and takes precedence.
  const [tweaks, setTweaks] = useStateBSM(() => ({
    role: 'client', paperMode: 'dark', accentKey: 'blue',
    weightKey: 'bold', textScaleKey: 'medium', borderKey: 'hairlines', textureKey: 'none', textureColor: 'auto',
    splashStyle: 'cosmos', splashBg: 'plain', splashBgColor: 'auto',
    fxGrain: false, fxHalftone: false, fxSepia: false, fxVignette: false, fxScanlines: false, fxInkBleed: false,
    startLoggedIn: true, ...initial, ...bsReadLocalTweaks(),
  }));
  const [tweaksOn, setTweaksOn] = useStateBSM(false);

  function setTweak(k, v) {
    setTweaks(s => {
      const next = { ...s, [k]: v };
      // Persist every change: localStorage (this device) + cloud (this account),
      // so it survives reloads and follows the user across logins/devices.
      bsWriteLocalTweaks(next);
      if (!BS_TWEAKS_NO_PERSIST.has(k)) bsSaveTweaksCloud(next);
      return next;
    });
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

  // Follow the account: when a user is (or becomes) signed in, load THEIR saved
  // appearance from the cloud and apply it — so settings restore on every login,
  // on any device, and an account switch loads the other account's look. Logging
  // out resets the marker so the next login reloads. Runs for all profiles.
  useEffectBSM(() => {
    let lastUid = null;
    const tryLoad = async () => {
      let uid = null;
      try { uid = (window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user && window.ShapeAuth.getCachedState().user.id) || null; } catch (e) {}
      if (uid && uid !== lastUid) {
        lastUid = uid;
        try {
          const cloud = await (window.shapeDb && window.shapeDb.getUserGoals ? window.shapeDb.getUserGoals(BS_TWEAKS_CLOUD_KIND) : null);
          const merged = cloud ? bsTweaksForCloud(cloud) : {};
          if (merged && Object.keys(merged).length) {
            setTweaks(s => ({ ...s, ...merged }));
            bsWriteLocalTweaks({ ...bsReadLocalTweaks(), ...merged });
          }
        } catch (e) {}
      } else if (!uid) {
        lastUid = null;
      }
    };
    tryLoad();
    const iv = setInterval(tryLoad, 1500);
    return () => clearInterval(iv);
  }, []);

  return (
    <I18nextProvider i18n={bsI18n}>
      <BSProvider paperMode={tweaks.paperMode} accentKey={tweaks.accentKey} densityKey="dense" borderKey={tweaks.borderKey} weightKey={tweaks.weightKey} textScaleKey={tweaks.textScaleKey} textureKey={tweaks.textureKey} textureColor={tweaks.textureColor} inkOverride={tweaks.inkOverride}>
        <div style={{ width: '100vw', minHeight: '100dvh', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, background: '#ffffff' }}>
          <BSAppShell tweaks={tweaks} setTweak={setTweak} />
          {tweaksOn && <BSTweaksPanel tweaks={tweaks} setTweak={setTweak} onClose={() => { setTweaksOn(false); window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); }} />}
        </div>
      </BSProvider>
    </I18nextProvider>
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
