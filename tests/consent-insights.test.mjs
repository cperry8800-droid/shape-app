// The website's page views (Vercel Web Analytics) wait for consent, as the banner says they do.
// The banner (/consent-banner.js) tells an EEA or UK visitor their choice controls "Shape's first-party
// usage stats on this site"; every page loaded /_vercel/insights/script.js outright, so a page view
// was counted before an answer, after a Reject and under GPC (War Room: "The website's usage stats
// don't wait for the consent banner in the EEA and UK"). The gate, public/consent-insights.js, runs
// here as written, in jsdom, with the device's time zone and GPC set per case.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const ROOT = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const GATE = read('public/consent-insights.js');

// A fresh page with the gate run on it: its time zone, GPC and stored choice as given.
function page({ tz = 'America/New_York', gpc = false, consent = null } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://shape.test/newdesign/Community.html' });
  const win = dom.window;
  if (consent) win.localStorage.setItem('shape.consent.v1', consent);
  Object.defineProperty(win.navigator, 'globalPrivacyControl', { value: gpc, configurable: true });
  const fakeIntl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: tz }) }) };
  new Function('window', 'Intl', GATE)(win, fakeIntl);
  const scripts = () => [...win.document.querySelectorAll('script')].filter((s) => s.src.endsWith('/_vercel/insights/script.js'));
  return { win, scripts };
}

test('outside the EEA and the UK, with no choice, page views load', () => {
  const { win, scripts } = page({ tz: 'America/New_York' });
  assert.equal(scripts().length, 1);
  assert.equal(scripts()[0].defer, true);
  // beforeSend is queued for Vercel's script, and passes events while consent allows.
  const queued = (win.vaq || []).map((args) => [...args]);
  const before = queued.find((a) => a[0] === 'beforeSend');
  assert.ok(before, 'no beforeSend queued');
  assert.deepEqual(before[1]({ type: 'pageview' }), { type: 'pageview' });
});

test('in the EEA and the UK, with no choice, nothing loads until the banner is accepted', () => {
  for (const tz of ['Europe/London', 'Europe/Berlin', 'Atlantic/Canary', 'Asia/Nicosia']) {
    const { win, scripts } = page({ tz });
    assert.equal(scripts().length, 0, tz + ': loaded before the banner was answered');
    // The banner's Accept: it stores the choice, then says so.
    win.localStorage.setItem('shape.consent.v1', 'accept');
    win.dispatchEvent(new win.CustomEvent('shape:consent', { detail: 'accept' }));
    assert.equal(scripts().length, 1, tz + ': an Accept did not load it');
    win.dispatchEvent(new win.CustomEvent('shape:consent', { detail: 'accept' }));
    assert.equal(scripts().length, 1, tz + ': loaded twice');
  }
});

test('a Reject never loads it, there or anywhere', () => {
  for (const tz of ['Europe/Paris', 'America/Los_Angeles']) {
    const { win, scripts } = page({ tz, consent: 'reject' });
    assert.equal(scripts().length, 0, tz);
    win.dispatchEvent(new win.CustomEvent('shape:consent', { detail: 'reject' }));
    assert.equal(scripts().length, 0, tz);
  }
  const eea = page({ tz: 'Europe/Madrid' });
  eea.win.localStorage.setItem('shape.consent.v1', 'reject');
  eea.win.dispatchEvent(new eea.win.CustomEvent('shape:consent', { detail: 'reject' }));
  assert.equal(eea.scripts().length, 0, 'the banner\'s Reject');
});

test('Global Privacy Control stops it everywhere, even over a stored Accept', () => {
  for (const tz of ['America/Chicago', 'Europe/Dublin']) {
    const { scripts } = page({ tz, gpc: true, consent: 'accept' });
    assert.equal(scripts().length, 0, tz);
  }
});

test('an Accept made in another tab loads it here too', () => {
  const { win, scripts } = page({ tz: 'Europe/Rome' });
  assert.equal(scripts().length, 0);
  win.localStorage.setItem('shape.consent.v1', 'accept');
  win.dispatchEvent(new win.StorageEvent('storage', { key: 'shape.consent.v1', newValue: 'accept' }));
  assert.equal(scripts().length, 1);
});

test('once loaded, a later Reject drops every event that follows', () => {
  const { win } = page({ tz: 'America/Denver' });
  const before = (win.vaq || []).map((a) => [...a]).find((a) => a[0] === 'beforeSend')[1];
  assert.ok(before({ type: 'pageview' }));
  win.localStorage.setItem('shape.consent.v1', 'reject');
  assert.equal(before({ type: 'pageview' }), null);
});

// ── Where it is used ────────────────────────────────────────────────────────
function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? (name === 'm' || name === 'nd' ? [] : htmlFiles(p)) : name.endsWith('.html') ? [p] : [];
  });
}

test('no page loads Vercel\'s script outright, and every page that counted views loads the gate', () => {
  const pages = htmlFiles(join(ROOT, 'public'));
  const direct = pages.filter((p) => readFileSync(p, 'utf8').includes('/_vercel/insights/script.js'));
  assert.deepEqual(direct.map((p) => p.slice(ROOT.length)), [], 'pages load Vercel\'s script without the gate');
  const gated = pages.filter((p) => readFileSync(p, 'utf8').includes('<script defer src="/consent-insights.js"></script>'));
  assert.ok(gated.length >= 70, 'only ' + gated.length + ' pages load the gate');
});

test('the banner says when it is answered, and the Next app checks every event', () => {
  assert.match(read('public/consent-banner.js'), /window\.dispatchEvent\(new CustomEvent\("shape:consent", \{ detail: choice \}\)\)/);
  const layout = read('src/app/layout.tsx');
  assert.match(layout, /<ConsentAnalytics \/>/);
  assert.doesNotMatch(layout, /<Analytics\b/, 'the layout renders Vercel\'s Analytics without the consent check');
  const wrapper = read('src/components/ConsentAnalytics.tsx');
  assert.match(wrapper, /<Analytics beforeSend=\{consentBeforeSend\} \/>/);
  assert.match(wrapper, /\{consentBannerHidden\(pathname\) \? null : <Script src="\/consent-banner\.js" strategy="afterInteractive" \/>\}/, 'and the banner that makes the choice');
  assert.match(wrapper, /return allowedOn\(window\) \? event : null;/);
});

test('the Next app\'s check is the same rule, read at each event', async () => {
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const signup = await import('../src/lib/signup-source.mjs');
  const mod = await loadRealModule(join(ROOT, 'src/components/ConsentAnalytics.tsx'), {
    typescript: true,
    registry: new Map([
      ['@vercel/analytics/next', { Analytics: () => null }],
      ['@/lib/signup-source.mjs', signup],
      ['next/script', { __esModule: true, default: () => null }],
      ['next/navigation', { usePathname: () => '/', useParams: () => ({}) }],
      ['@vercel/analytics', { computeRoute: (p) => p, pageview: () => {} }],
    ]),
  });
  const store = new Map();
  const win = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null) }, navigator: { globalPrivacyControl: false } };
  const saved = globalThis.window;
  globalThis.window = win;
  try {
    const ev = { type: 'pageview', url: 'https://shape.test/dashboard' };
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const eea = signup.CONSENT_REGION_RE.test(zone);
    // No choice: the time zone decides (this machine's), as for the website.
    assert.equal(mod.consentBeforeSend(ev), eea ? null : ev, 'no choice in ' + (zone || '(none)'));
    store.set('shape.consent.v1', 'accept');
    assert.equal(mod.consentBeforeSend(ev), ev, 'an Accept');
    store.set('shape.consent.v1', 'reject');
    assert.equal(mod.consentBeforeSend(ev), null, 'a Reject');
    store.set('shape.consent.v1', 'accept');
    win.navigator.globalPrivacyControl = true;
    assert.equal(mod.consentBeforeSend(ev), null, 'GPC over an Accept');
  } finally {
    globalThis.window = saved;
  }
});

// ── The banner can be answered on a desktop ─────────────────────────────────
// ⚠ The chat launcher (z-index 2147483000, bottom-right) lay across both of the banner's buttons
// at desktop widths, so a click on Reject non-essential or Accept reached the chat. While the bar
// is up the launcher and its panel stand on it; answering puts them back. The banner's own code
// runs here as written (/consent-banner.js), on a page in a UK time zone.
async function bannerPage(tz = 'Europe/London') {
  const src = read('public/consent-banner.js');
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://shape.test/newdesign/Pricing.html', runScripts: 'outside-only' });
  const win = dom.window;
  win.Intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: tz }) }) };
  const heard = [];
  win.addEventListener('shape:consent', (e) => heard.push(e.detail));
  win.eval(src);
  // The banner starts on DOMContentLoaded while the page is still loading, as in a browser.
  if (win.document.readyState === 'loading') await new Promise((r) => win.addEventListener('DOMContentLoaded', r));
  return { win, heard };
}

test('while the banner is up the chat launcher stands on it, and an answer puts it back', async () => {
  const { win, heard } = await bannerPage();
  const doc = win.document;
  const bar = doc.querySelector('[aria-label="Cookie consent"]');
  assert.ok(bar, 'no banner in a UK time zone');
  assert.ok(doc.documentElement.classList.contains('shape-consent-open'));
  const css = doc.getElementById('shape-consent-lift');
  assert.ok(css, 'no lift rule');
  assert.match(css.textContent, /html\.shape-consent-open #shape-global-chat-button\{bottom:calc\(var\(--shape-consent-h,0px\) \+ 16px\) !important\}/);
  // A dragged panel's inline top would win over the bottom, so it is let go too (Codex on #2530).
  assert.match(css.textContent, /html\.shape-consent-open #shape-global-chat-panel\{top:auto !important;bottom:calc\(var\(--shape-consent-h,0px\) \+ 70px\) !important;max-height:calc\(100vh - var\(--shape-consent-h,0px\) - 94px\) !important\}/);
  assert.match(doc.documentElement.style.getPropertyValue('--shape-consent-h'), /^\d+px$/, 'the bar\'s height is not set');
  const accept = [...bar.querySelectorAll('button')].find((x) => x.textContent === 'Accept');
  accept.click();
  assert.ok(!doc.querySelector('[aria-label="Cookie consent"]'), 'the bar stayed');
  assert.ok(!doc.documentElement.classList.contains('shape-consent-open'), 'the launcher stayed lifted');
  assert.ok(!doc.getElementById('shape-consent-lift'), 'the lift rule stayed');
  assert.equal(doc.documentElement.style.getPropertyValue('--shape-consent-h'), '');
  assert.equal(win.localStorage.getItem('shape.consent.v1'), 'accept');
  assert.deepEqual(heard, ['accept'], 'the page was not told');
});

test('a Reject puts the launcher back too, and outside the EEA and the UK nothing is lifted', async () => {
  const { win, heard } = await bannerPage('Europe/Paris');
  const reject = [...win.document.querySelectorAll('[aria-label="Cookie consent"] button')].find((x) => x.textContent === 'Reject non-essential');
  reject.click();
  assert.ok(!win.document.documentElement.classList.contains('shape-consent-open'));
  assert.deepEqual(heard, ['reject']);
  const us = await bannerPage('America/New_York');
  assert.ok(!us.win.document.querySelector('[aria-label="Cookie consent"]'), 'a banner outside the EEA and the UK');
  assert.ok(!us.win.document.documentElement.classList.contains('shape-consent-open'));
});

// ── The Next page where the banner is accepted is counted (Codex on #2530) ───
// <Analytics> sends a page's view as it opens; with no answer yet in the EEA or the UK the check
// drops it. A page whose view was dropped sends it once the banner is accepted, as the website's
// gate does by loading Vercel's script on the Accept.
async function loadWrapper(state) {
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const analytics = require('@vercel/analytics');
  return loadRealModule(join(ROOT, 'src/components/ConsentAnalytics.tsx'), {
    typescript: true,
    registry: new Map([
      ['@vercel/analytics/next', { Analytics: () => null }],
      ['@vercel/analytics', { computeRoute: analytics.computeRoute, pageview: (v) => state.views.push(v) }],
      ['@/lib/signup-source.mjs', { allowedOn: () => state.allowed }],
      ['next/script', { __esModule: true, default: () => null }],
      ['next/navigation', { usePathname: () => state.path, useParams: () => state.params }],
    ]),
  });
}

test('recountOnAccept: a dropped view is sent once, on an answer that allows it', () => {
  const run = async () => {
    const { recountOnAccept } = await loadWrapper({ views: [] });
    const win = new JSDOM('<!doctype html><p></p>', { url: 'https://shape.test/' }).window;
    let allowed = false;
    let sent = 0;
    const stop = recountOnAccept(win, () => allowed, () => { sent += 1; });
    win.dispatchEvent(new win.CustomEvent('shape:consent', { detail: 'reject' }));
    assert.equal(sent, 0, 'sent on a Reject');
    allowed = true;
    win.dispatchEvent(new win.StorageEvent('storage', { key: 'some.other.key' }));
    assert.equal(sent, 0, 'sent on another key');
    win.dispatchEvent(new win.CustomEvent('shape:consent', { detail: 'accept' }));
    assert.equal(sent, 1, 'not sent on the Accept');
    win.dispatchEvent(new win.CustomEvent('shape:consent', { detail: 'accept' }));
    win.dispatchEvent(new win.StorageEvent('storage', { key: 'shape.consent.v1' }));
    assert.equal(sent, 1, 'sent twice');
    stop();
    // Another tab's Accept.
    let other = 0;
    allowed = false;
    const stop2 = recountOnAccept(win, () => allowed, () => { other += 1; });
    allowed = true;
    win.dispatchEvent(new win.StorageEvent('storage', { key: 'shape.consent.v1' }));
    assert.equal(other, 1);
    stop2();
    // Removed on cleanup.
    let late = 0;
    allowed = false;
    recountOnAccept(win, () => allowed, () => { late += 1; })();
    allowed = true;
    win.dispatchEvent(new win.CustomEvent('shape:consent', { detail: 'accept' }));
    assert.equal(late, 0, 'still listening after cleanup');
    // A view that went through: nothing to send again.
    let again = 0;
    recountOnAccept(win, () => true, () => { again += 1; });
    win.dispatchEvent(new win.CustomEvent('shape:consent', { detail: 'accept' }));
    assert.equal(again, 0, 'a counted view sent again');
  };
  return run();
});

test('the Next wrapper, mounted, sends the page\'s view on the Accept, under its route', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://shape.test/trainers/12' });
  const saved = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const savedReact = globalThis.React;
  try {
    const React = require('react');
    globalThis.React = React;
    const { createRoot } = require('react-dom/client');
    const state = { views: [], allowed: false, path: '/trainers/12', params: { id: '12' } };
    const mod = await loadWrapper(state);
    const root = createRoot(dom.window.document.getElementById('root'));
    await React.act(async () => { root.render(React.createElement(mod.default)); });
    assert.deepEqual(state.views, [], 'sent before an answer');
    state.allowed = true;
    await React.act(async () => { dom.window.dispatchEvent(new dom.window.CustomEvent('shape:consent', { detail: 'accept' })); });
    assert.deepEqual(state.views, [{ route: '/trainers/[id]', path: '/trainers/12' }]);
    await React.act(async () => { dom.window.dispatchEvent(new dom.window.CustomEvent('shape:consent', { detail: 'accept' })); });
    assert.equal(state.views.length, 1, 'sent twice');
    await React.act(async () => { root.unmount(); });
  } finally {
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act;
    globalThis.React = savedReact;
  }
});
