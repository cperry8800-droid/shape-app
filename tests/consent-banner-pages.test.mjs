// Every page that holds something for the visitor's consent can ask for it (Codex on #2530).
// The banner lived inside pageShell.jsx, so a page without the shell gated its page views
// (/consent-insights.js), its tap counts (/click-capture.js) or the remembered first link
// (/signup-source.js, which /supabase.js loads too) on a choice it gave no way to make: an EEA or
// UK visitor who landed on help, contact, the 404 or a legal page was never asked, and neither
// were the Next app's pages. The banner is its own file now, /consent-banner.js: the shell loads
// it, the pages without the shell load it themselves, and so does the Next layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const ROOT = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const BANNER = read('public/consent-banner.js');
const SHELL = read('public/newdesign/pageShell.jsx');

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? (name === 'm' || name === 'nd' ? [] : htmlFiles(p)) : name.endsWith('.html') ? [p] : [];
  });
}

// What a page runs that waits on the choice: the three gated scripts, or /supabase.js, which loads
// the sign-up capture on any page without it.
const GATED = /src="\/(?:consent-insights|click-capture|signup-source)\.js"|src="(?:\/|\.\.\/)?supabase\.js(?:\?[^"]*)?"/;
const SHELL_TAG = /src="[^"]*pageShell\.jsx/;
const BANNER_TAG = '<script defer src="/consent-banner.js"></script>';
// Superseded addresses that send the visitor on at once, before anything is drawn: a banner there
// would never be seen, and the page they land on has one.
const REDIRECTS = ['public/newdesign/TrainerPublic.html', 'public/newdesign/NutritionistPublic.html'];

test('every website page that runs something the choice gates can show the banner', () => {
  const pages = htmlFiles(join(ROOT, 'public')).map((p) => p.slice(ROOT.length));
  const missing = [];
  let direct = 0;
  for (const rel of pages) {
    const html = read(rel);
    if (!GATED.test(html) && !SHELL_TAG.test(html)) continue;
    if (REDIRECTS.includes(rel)) continue;
    if (html.includes(BANNER_TAG)) { direct += 1; continue; }
    if (!SHELL_TAG.test(html)) missing.push(rel);
  }
  assert.deepEqual(missing, [], 'these pages wait on a choice they never ask for');
  assert.ok(direct >= 13, 'only ' + direct + ' pages without the shell load the banner');
  for (const rel of REDIRECTS) {
    assert.match(read(rel), /location\.replace\(/, rel + ' no longer redirects at once, so it needs the banner');
  }
});

test('the shell loads the banner once, and the banner runs once however often it is loaded', async () => {
  assert.ok(!SHELL.includes('"Cookie consent"'), 'a second copy of the banner is back in pageShell.jsx');
  const a = SHELL.indexOf('(function shapeConsentLoader() {');
  const b = SHELL.indexOf('\n})();\n', a);
  assert.ok(a > 0 && b > a, 'the shell no longer loads the banner');
  const loader = SHELL.slice(a, b + '\n})();\n'.length);
  const tags = (doc) => [...doc.querySelectorAll('script')].filter((s) => s.getAttribute('src') === '/consent-banner.js').length;

  const fresh = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'outside-only' }).window;
  fresh.eval(loader); fresh.eval(loader);
  assert.equal(tags(fresh.document), 1, 'the shell added the banner twice');
  const tagged = new JSDOM('<!doctype html><html><head><script src="/consent-banner.js"></script></head><body></body></html>', { runScripts: 'outside-only' }).window;
  tagged.eval(loader);
  assert.equal(tags(tagged.document), 1, 'a page that loads it itself got a second');
  const shown = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'outside-only' }).window;
  shown.__shapeConsentBanner = true;
  shown.eval(loader);
  assert.equal(tags(shown.document), 0, 'loaded after the banner ran');

  // Run twice on a page in a UK time zone (the shell's copy and a page's own, say): one bar.
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://shape.test/help.html', runScripts: 'outside-only' });
  const win = dom.window;
  win.Intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Europe/London' }) }) };
  win.eval(BANNER); win.eval(BANNER);
  if (win.document.readyState === 'loading') await new Promise((r) => win.addEventListener('DOMContentLoaded', r));
  assert.equal(win.document.querySelectorAll('[aria-label="Cookie consent"]').length, 1);
  assert.equal(win.document.querySelectorAll('#shape-consent-lift').length, 1);
});

test('the Next app shows the banner, off the /connect pages, and its chat button stands on it too', async (t) => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  let path = '/';
  const mod = await loadRealModule(join(ROOT, 'src/components/ConsentAnalytics.tsx'), {
    typescript: true,
    registry: new Map([
      ['@vercel/analytics/next', { Analytics: () => null }],
      ['@/lib/signup-source.mjs', await import('../src/lib/signup-source.mjs')],
      ['next/script', { __esModule: true, default: (props) => React.createElement('script', { 'data-src': props.src, 'data-strategy': props.strategy }) }],
      ['next/navigation', { usePathname: () => path, useParams: () => ({}) }],
      ['@vercel/analytics', { computeRoute: (p) => p, pageview: () => {} }],
    ]),
  });
  // The component is compiled with the classic JSX runtime, which reads React from the global.
  const savedReact = globalThis.React;
  globalThis.React = React;
  const html = (p) => { path = p; return renderToStaticMarkup(React.createElement(mod.default)); };
  t.after(() => { globalThis.React = savedReact; });
  for (const p of ['/login', '/trainers/12', '/dashboard', '/purchase', '/connected', '/dashboard/connect']) {
    assert.match(html(p), /<script data-src="\/consent-banner\.js" data-strategy="afterInteractive"><\/script>/, p + ' has no banner');
  }
  for (const p of ['/connect', '/connect/spotify', '/connect/done']) {
    assert.doesNotMatch(html(p), /consent-banner/, p + ' (the app\'s in-app browser) shows the banner');
  }
  assert.match(read('src/app/layout.tsx'), /<ConsentAnalytics \/>/);
  // The banner lifts the website's launcher and panel by id; the Next ones carry the same ids.
  const chat = read('src/components/GlobalChatButton.tsx');
  assert.match(chat, /<section\n\s+id="shape-global-chat-panel"\n\s+aria-label="Shape chat"/);
  assert.match(chat, /<button\n\s+id="shape-global-chat-button"\n\s+type="button"\n\s+onClick=\{\(\) => setOpen\(true\)\}\n\s+aria-label="Ask Nora"/);
  assert.match(BANNER, /html\.shape-consent-open #shape-global-chat-button\{bottom:/);
});
