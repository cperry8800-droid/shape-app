import React from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { useTr } from '../i18n/index.js';
import { bsAppVersionPath, bsAppUpdateFrom, bsStoreUrl, BS_UPDATE_RECHECK_MS, BS_UPDATE_DISMISSED_KEY } from '../services/appUpdate.mjs';

// Every call to Shape's server goes through the backend's ShapeApi.fetch: the API base in
// front and the live sign-in token. A root-relative '/api/…' fetch reaches nothing in the
// installed app (client-onboarding review H2, 2026-10-14; tests/app-api-base.test.mjs).
const bsApi = { fetch: (path, init) => (window.ShapeApi ? window.ShapeApi.fetch(path, init) : fetch(path, init)) };

// ═══════════════════════════════════════════════════════════
// PLEASE UPDATE — the installed app asks the server whether it is too old
// ═══════════════════════════════════════════════════════════
// The rule is src/lib/app-version.mjs, answered by GET /api/app/version. 'required' covers the
// whole app with one way on, the store; 'recommended' is a card the member can dismiss, which
// stays away until a newer version is recommended. Native builds only: the hosted /m/ always
// runs the newest bundle. It asks at launch, and again on coming back to the app once the last
// answer is an hour old, so an app left open for days still hears about it.
//
// ⚠ IT SHIPS IN THE BINARY, SO WHAT IT KNOWS HOW TO SHOW IS FIXED PER BUILD. Both answers are
// handled here from the first release on, so the server can start asking for either without a
// build. Anything else reads as nothing to show (services/appUpdate.mjs).

function bsBuildVersion() {
  try { return (typeof __SHAPE_VERSION__ !== 'undefined' && __SHAPE_VERSION__) || ''; } catch (e) { return ''; }
}

export default function BSUpdateGate() {
  const { tr } = useTr('common');
  const [answer, setAnswer] = React.useState(null);
  const [dismissed, setDismissed] = React.useState(() => {
    try { return localStorage.getItem(BS_UPDATE_DISMISSED_KEY) || ''; } catch (e) { return ''; }
  });

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const platform = Capacitor.getPlatform();
    const version = bsBuildVersion();
    if (!version) return undefined;
    let alive = true;
    let askedAt = 0;
    const check = async () => {
      if (Date.now() - askedAt < BS_UPDATE_RECHECK_MS) return;
      askedAt = Date.now();
      try {
        const res = await bsApi.fetch(bsAppVersionPath(platform, version), { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (alive) setAnswer({ ...bsAppUpdateFrom(d), platform });
      } catch (e) {
        // Offline or a server fault: keep what the last answer said, and ask again next time.
        askedAt = 0;
      }
    };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  if (!answer || answer.update === 'none') return null;
  const required = answer.update === 'required';
  if (!required && dismissed === answer.recommendedVersion) return null;

  const storeUrl = bsStoreUrl(answer.platform, answer.storeUrl, import.meta.env.VITE_APP_STORE_ID);
  // A top-level navigation off the app's origin is handed to the system on both platforms
  // (Capacitor's navigation handlers), which opens the App Store or Google Play on the app's
  // page. The in-app browser would show the store's web page instead.
  const openStore = () => { try { window.location.assign(storeUrl); } catch (e) {} };
  const dismiss = () => {
    try { localStorage.setItem(BS_UPDATE_DISMISSED_KEY, answer.recommendedVersion); } catch (e) {}
    setDismissed(answer.recommendedVersion);
  };
  const noStore = answer.platform === 'ios'
    ? tr('update.noStoreIos', { defaultValue: 'Open the App Store and update Shape.' })
    : tr('update.noStoreAndroid', { defaultValue: 'Open Google Play and update Shape.' });

  // The launch surfaces (wire beat, language picker, age check) are fixed-dark, so this matches them.
  const INKF = '#f2ede4', INKF70 = 'rgba(242,237,228,0.7)', INKF50 = 'rgba(242,237,228,0.55)', ACCF = '#34d6c5';
  const mono = `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`;
  const head = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";
  const body = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const cta = { marginTop: 18, borderRadius: 4, padding: '14px', minHeight: 48, border: 0, background: ACCF, color: '#05080c', fontFamily: mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' };
  // Above every sheet (the highest sits at 100000), and portalled beside them for the same reason.
  const surface = document.getElementById('bs-phone-surface') || document.body;

  if (required) {
    return createPortal(
      <div role="alertdialog" aria-modal="true" aria-labelledby="bs-update-title" data-bs-update="required" style={{ position: 'absolute', inset: 0, zIndex: 200000, background: 'radial-gradient(135% 90% at 50% -8%, rgba(52,214,197,0.13), transparent 52%), linear-gradient(176deg, #0b161c 0%, #070b11 48%, #03050b 100%)', color: INKF, display: 'flex', flexDirection: 'column', padding: '52px 20px 24px' }}>
        <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: INKF70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${INKF}`, paddingBottom: 8 }}>
          <span>Shape Wire</span>
          <span style={{ color: INKF }}>{tr('update.eyebrow', { defaultValue: 'Update' })}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', maxWidth: 360, margin: '0 auto' }}>
          <h1 id="bs-update-title" style={{ fontFamily: head, fontSize: 26, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.12, margin: '14px 0 0' }}>{tr('update.requiredTitle', { defaultValue: 'Update Shape to keep going.' })}</h1>
          <div style={{ fontFamily: body, fontSize: 15, lineHeight: 1.55, color: INKF70, marginTop: 12 }}>{tr('update.requiredBody', { defaultValue: 'This version of the app no longer works with Shape. The update is free, and your account and everything you’ve logged stay as they are.' })}</div>
          {storeUrl
            ? <button type="button" onClick={openStore} style={cta}>{tr('update.cta', { defaultValue: 'Update now' })} ↗</button>
            : <div style={{ fontFamily: body, fontSize: 15, lineHeight: 1.55, color: INKF, marginTop: 18 }}>{noStore}</div>}
        </div>
      </div>,
      surface
    );
  }

  return createPortal(
    <div role="status" data-bs-update="recommended" style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', zIndex: 200000, padding: '14px 16px 12px', borderRadius: 6, background: '#0b161c', border: '1px solid rgba(242,237,228,0.16)', borderLeft: `3px solid ${ACCF}`, boxShadow: '0 16px 40px rgba(0,0,0,0.45)', color: INKF }}>
      <div style={{ fontFamily: head, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{tr('update.recommendedTitle', { defaultValue: 'A new version of Shape is out.' })}</div>
      <div style={{ fontFamily: body, fontSize: 13.5, lineHeight: 1.45, color: INKF70, marginTop: 4 }}>{storeUrl ? tr('update.recommendedBody', { defaultValue: 'Update for the latest fixes and features.' }) : noStore}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={dismiss} style={{ minHeight: 44, padding: '0 14px', border: 0, background: 'transparent', color: INKF50, fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('update.later', { defaultValue: 'Not now' })}</button>
        {storeUrl ? <button type="button" onClick={openStore} style={{ ...cta, marginTop: 0, padding: '0 16px', minHeight: 44 }}>{tr('update.cta', { defaultValue: 'Update now' })} ↗</button> : null}
      </div>
    </div>,
    surface
  );
}
