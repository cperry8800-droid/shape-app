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
    if (style === 'classified') return;
    const id = setTimeout(onDone, 1600);
    return () => clearTimeout(id);
  }, [style]);

  // ── 1. MASTHEAD (default): rule-bound vol/no, big stacked title, footer
  if (style === 'masthead' || !style) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '54px 20px 40px' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${t.INK}`, paddingBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><BSLogo size={22} color={t.INK} /> Vol. 6 · No. 38</span>
          <span>Tue · Apr 21 · 2026</span>
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
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${t.RULE}`, paddingBottom: 6 }}>
            <span>Vol. 6 · No. 38</span><span>Apr 21 · 2026</span><span>$0 · Daily</span>
          </div>
          <div style={{ borderBottom: `3px double ${t.INK}`, padding: '12px 0 14px', display: 'flex', justifyContent: 'center' }}>
            <BSWordmark size={42} full color={t.INK} />
          </div>
          <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center', padding: '4px 0' }}>
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
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.AMBER, fontWeight: 700, marginBottom: 6 }}>▍ Today's edition</div>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 30, lineHeight: 0.92, letterSpacing: '-0.035em' }}>Pull day. Peak week. Tempo wins.</div>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginTop: 8 }}>By Jordan Chen · Coach</div>
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
    const TEAL = '#1ec0a8';
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
    const items = [
      { tag: 'SHP-01',  title: 'Shape Radio · launch',  meta: 'Reactive FX overlays · live',   col: 1 },
      { tag: 'NWS-04',  title: 'Zone 2 returns',        meta: 'NYT · cardio renaissance',     col: 1 },
      { tag: 'SHP-12',  title: 'Marketplace v2',        meta: '+38 coaches this week',        col: 1 },
      { tag: 'MND-09',  title: 'Therapy on the rise',   meta: 'WHO · 1 in 4 adults, 2026',    col: 1 },
      { tag: 'SHP-22',  title: 'Block 3 unlocked',      meta: 'Hypertrophy · 4 weeks',        col: 1 },
      { tag: 'NWS-18',  title: 'GLP-1 + lifting',       meta: 'Lancet · muscle preservation', col: 2 },
      { tag: 'SHP-07',  title: 'Calendar redesign',     meta: 'Tap any day → drill in',       col: 2 },
      { tag: 'WLB-03',  title: 'Sleep is the new gym',  meta: 'Stanford · HRV + recovery',    col: 2 },
      { tag: 'SHP-31',  title: 'Grocery auto-sync',     meta: 'Plans → list, every Sun',      col: 2 },
      { tag: 'MND-14',  title: 'Walking lowers anxiety',meta: 'JAMA Psychiatry · 30m/day',    col: 2 },
    ];
    const _bgRGB = bgColor && bgColor !== 'auto' ? _hexToRGBmain(bgColor) : null;
    const inkRgbCl = _bgRGB || t.inkRGB || (t.isLight ? '15,14,12' : '244,237,224');
    return (
      <div style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, padding: '50px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        <SplashBackdrop bg="plain" inkRgb={inkRgbCl} t={t} />

        <div style={{ position: 'relative', zIndex: 1, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, display: 'flex', justifyContent: 'space-between', borderBottom: `2px solid ${t.INK}`, paddingBottom: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BSLogo size={16} color={t.INK} /> Classifieds</span>
          <span>Sec. C · 04</span>
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
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, marginTop: 18 }}>Today's edition · 6 sections</div>
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
                      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: tagColor, fontWeight: 700, marginBottom: 3 }}>{it.tag}</div>
                      <div style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 15, letterSpacing: '-0.012em', color: t.INK, lineHeight: 1.15 }}>{it.title}</div>
                      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', color: t.INK50, marginTop: 3, textTransform: 'uppercase' }}>{it.meta}</div>
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

        <div style={{ position: 'relative', zIndex: 1, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center' }}>
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

function BSLogin({ onLogin, onBrowse, role, setRole, initialMode }) {
  const t = useBS();
  const [mode, setMode] = useStateBSM(initialMode || 'signin'); // 'signin' | 'create'
  const [fullName, setFullName] = useStateBSM('');
  const [email, setEmail] = useStateBSM('');
  const [password, setPassword] = useStateBSM('');
  const [authError, setAuthError] = useStateBSM('');
  const [busy, setBusy] = useStateBSM(false);
  const isCreate = mode === 'create';
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
  return (
    <div style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, padding: '40px 20px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${t.INK}`, paddingBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BSLogo size={16} color={t.INK} /> Vol. 6 · {isCreate ? 'New subscriber' : 'Subscribe'}</span>
        <span>{isCreate ? 'Time to Shape' : '$5 / mo'}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, transform: 'translateY(-56px)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <BSLogo size={40} color={t.INK} />
          <div style={{ fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 500, fontSize: 50, lineHeight: 0.88, letterSpacing: '-0.055em', color: t.INK, textAlign: 'center' }}>
            {isCreate ? (
              <>Join the<br/><span style={{ fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.065em' }}>community.</span></>
            ) : (
              <>Welcome<br/>to <span style={{ display: 'inline-block', fontFamily: `'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif`, fontWeight: 300, fontStyle: 'normal', fontSize: 50, letterSpacing: '0.16em', textTransform: 'uppercase', transform: 'translateY(2px)' }}>SHAPE</span>.</>
            )}
          </div>
        </div>

        {/* Sign in / Create account toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${t.INK}` }}>
          {[['signin','Sign in'],['create','Join Shape']].map(([k, l]) => {
            const on = mode === k;
            return <button key={k} onClick={() => setMode(k)} style={{ borderRadius: t.RADIUS_SM,
              padding: '11px 4px', border: 0, background: on ? t.INK : 'transparent',
              color: on ? t.PAPER : t.INK, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 700,
              letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
            }}>{l}</button>;
          })}
        </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 2 }}>
        {isCreate && (
          <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} style={{ borderRadius: t.RADIUS_SM, background: 'transparent', border: 0, borderBottom: `1px solid ${t.INK}`, padding: '12px 0', fontFamily: t.DISPLAY, fontSize: 16, color: t.INK, outline: 'none' }} />
        )}
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={{ borderRadius: t.RADIUS_SM, background: 'transparent', border: 0, borderBottom: `1px solid ${t.INK}`, padding: '12px 0', fontFamily: t.DISPLAY, fontSize: 16, color: t.INK, outline: 'none' }} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isCreate ? 'new-password' : 'current-password'} style={{ borderRadius: t.RADIUS_SM, background: 'transparent', border: 0, borderBottom: `1px solid ${t.INK}`, padding: '12px 0', fontFamily: t.DISPLAY, fontSize: 16, color: t.INK, outline: 'none' }} />
        {authError && (
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.RUST, lineHeight: 1.35 }}>
            {authError}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 }}>I am a…</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {[['client','Client'],['trainer','Trainer'],['nutritionist','Nutri'],['shape_radio','Radio']].map(([k, l]) => {
            const on = role === k;
            return <button key={k} onClick={() => setRole(k)} style={{ borderRadius: t.RADIUS_SM, padding: 12, border: `1px solid ${t.INK}`, background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>{l}</button>;
          })}
        </div>
      </div>

      {isCreate ? (
        <button onClick={submitAuth} disabled={busy} style={{ borderRadius: t.RADIUS_SM, marginTop: 8, padding: 16, background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, fontFamily: t.MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1 }}>{busy ? 'Creating...' : 'Time to Shape →'}</button>
      ) : (
        <>
          <button onClick={submitAuth} disabled={busy} style={{ borderRadius: t.RADIUS_SM, marginTop: 8, padding: 16, background: t.INK, color: t.PAPER, border: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1 }}>{busy ? 'Signing in...' : 'Sign in →'}</button>

          {/* Curious-reader path for non-members */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <div style={{ flex: 1, height: 1, background: t.RULE }} />
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.28em', textTransform: 'uppercase', color: t.INK50 }}>or</div>
            <div style={{ flex: 1, height: 1, background: t.RULE }} />
          </div>

          <div style={{ textAlign: 'center', marginTop: -2 }}>
            <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, color: t.INK, lineHeight: 1.25 }}>
              Not yet a member, but curious?
            </div>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginTop: 3 }}>
              Take a look around — no account needed.
            </div>
          </div>

          <button onClick={onBrowse} style={{ borderRadius: t.RADIUS_SM, padding: '14px 16px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: 'pointer' }}>Browse today's edition →</button>
        </>
      )}
      </div>

      <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center', borderTop: `1px solid ${t.RULE}`, paddingTop: 12 }}>
        {isCreate ? 'Already a subscriber · Forgot password · Help' : 'New reader · Forgot password · Help'}
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
        fontFamily: t.MONO, fontSize: 8, fontWeight: 800,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        padding: '3px 5px',
      }}>Preview</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 11.5, letterSpacing: '-0.005em', color: t.INK, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Browsing without an account
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 7.4, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, marginTop: 2, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Stats &amp; activity are AI-generated for preview · Marketplace data is live.
        </div>
        {onSignIn && (
          <button onClick={onSignIn} style={{ borderRadius: t.RADIUS_SM,
            marginTop: 3, padding: '3px 7px', cursor: 'pointer',
            background: 'transparent', color: t.INK,
            border: `1px solid ${t.INK}`,
            fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700,
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
        <div style={{ fontFamily: t.MONO, fontSize: 7.2, letterSpacing: '0.13em', textTransform: 'uppercase', color: fgMuted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          $5 / mo · cancel anytime
        </div>
      </div>
      <button onClick={onJoin} style={{ borderRadius: t.RADIUS_SM,
        padding: '6px 10px', background: btnBg, color: btnFg, border: 0,
        fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.15em',
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
  const r = useBSRadio();
  if (r.showPrompt) return null;
  return (
    <>
      {!bannerDismissed && <BSSubscribeBanner onJoin={onJoin} onClose={onCloseBanner} />}
    </>
  );
}

function BSAppShell({ tweaks, setTweak }) {
  const authConfigured = Boolean(window.ShapeAuth?.configured);
  const [stage, setStage] = useStateBSM(tweaks.startLoggedIn && !authConfigured ? 'app' : 'splash');
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
        {stage === 'splash' && <BSSplash style={tweaks.splashStyle} bg={tweaks.splashBg || 'plain'} bgColor={tweaks.splashBgColor || 'auto'} onDone={() => setStage(tweaks.startLoggedIn && !authConfigured ? 'app' : 'login')} />}
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
    splashStyle: 'masthead', splashBg: 'plain', splashBgColor: 'auto',
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
