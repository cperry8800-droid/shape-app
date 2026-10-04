// The website's cooking page (/newdesign/Cook.html → cookPage.jsx), owner 2026-10-04: "remove
// the box that this is in on website and just have it be on the screen", "improve look of"
// the All recipes link, and remove "Open cooking full screen". Plus why Nora was silent
// there: the cook layer it frames is the app, which kept its own sign-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const page = read('public/newdesign/cookPage.jsx');
const host = read('public/newdesign/Cook.html');
const BONE = '#ece4d3';

test('the cook layer fills the screen under the header: no frame, no seam, no intro', () => {
  const frame = page.match(/<iframe\b[^>]*>/);
  assert.ok(frame, 'no iframe');
  assert.match(frame[0], /className="ck-frame"/);
  assert.doesNotMatch(frame[0], /style=/, 'an inline style can bring the border back');
  assert.match(page, /\.ck \.ck-frame \{[^}]*border: 0;/);
  assert.match(page, /height: calc\(100dvh - \$\{KC_HEADER_H\}px\)/, 'the stage must be the screen under the header');
  assert.match(page, /padding: 0 !important/, "pageShell pads every phone <main> by 18px; the stage must not be inset");
  // The page wears the cook layer's own paper (cookingWeb.jsx: paperMode "bone").
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), new RegExp(`bone:\\s*\\{ paper: '${BONE}'`));
  assert.match(page, new RegExp(`const KC_PAPER = '${BONE}'`));
  assert.match(host, new RegExp(`html, body \\{[^}]*background: ${BONE}`));
  assert.match(read('mobile-app/src/main.jsx'), new RegExp(`get\\('cooking'\\) === '1'\\) \\{[\\s\\S]{0,400}'${BONE}'`), 'the frame flashes the app paper while it loads');
  assert.doesNotMatch(page, /maxWidth: 1040|1px solid rgba\(30,42,38/);
});

test('"Open cooking full screen" is gone and All recipes is a styled, focusable link', () => {
  assert.doesNotMatch(page, /full screen/i);
  const back = page.match(/<a href="\/recipes" className="ck-back">[\s\S]*?<\/a>/);
  assert.ok(back, 'no All recipes link');
  assert.match(back[0], /<svg[^>]*aria-hidden="true"/, 'the arrow is a drawn mark, hidden from screen readers');
  assert.match(back[0], /<span>All recipes<\/span>/);
  assert.match(page, /\.ck \.ck-back \{[^}]*min-height: 44px/);
  assert.match(page, /\.ck \.ck-back:focus-visible \{ outline: 2px solid/);
  assert.match(page, /\.ck \.ck-back:hover/);
});

test('the floating chat launcher stays off the cook controls, and the date-of-birth gate stays on', () => {
  assert.match(page, /#shape-global-chat-button, #shape-global-chat-panel \{ display: none !important; \}/);
  // build-newdesign.mjs injects dobGate.js against this tag.
  assert.match(host, /<script src="globalChatButton\.js" defer><\/script>/);
});

test('on the website the cook layer signs in with the website session', () => {
  const backend = read('mobile-app/src/services/shapeBackend.js');
  const site = read('public/supabase.js');
  const key = site.match(/storageKey: '([^']+)'/);
  assert.ok(key, 'the website client lost its storage key');
  assert.match(backend, /const _webCooking = !_isNative && typeof window !== 'undefined' && \(\(\) => \{\s*try \{ return new URLSearchParams\(window\.location\.search\)\.get\('cooking'\) === '1'; \}/);
  assert.ok(backend.includes(`...(_webCooking ? { storageKey: '${key[1]}' } : {}),`), 'the cook layer and the website read different sessions');
  // Native builds and the app at /m/ keep their own key: only the cooking route shares.
  assert.equal((backend.match(/storageKey:/g) || []).length, 1);
});

test('a signed-out visitor on the website is not shown Nora as on', () => {
  const web = read('mobile-app/src/broadsheet/cookingWeb.jsx');
  const session = web.indexOf('await window.ShapeAuth?.getCurrentSession?.()');
  const flag = web.indexOf('window.ShapeCanChat = !!window.ShapeAuth?.getCachedState?.()?.user?.id;');
  const render = web.indexOf('createRoot(');
  assert.ok(session > 0 && flag > session && flag < render, 'ShapeCanChat must be set from the session before the first render');
});
