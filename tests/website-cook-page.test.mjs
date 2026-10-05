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

// The page's own boot lines, run as written against a session we release by hand. Every write
// to ShapeCanChat is recorded: `firstPaint` is the one made before the render is asked for,
// `after` the last once the session has settled. Reading the flag after `await` instead sees
// the catch-up write too when the session is already settled, and loses the first one.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
async function bootCanChat({ user, late = false, fails = false }) {
  const web = read('mobile-app/src/broadsheet/cookingWeb.jsx');
  const from = web.indexOf('const signedIn = ');
  const to = web.indexOf('\n});\n', web.indexOf('boot.then(')) + 4;
  assert.ok(from > 0 && to > from && web.indexOf('createRoot(') > to, 'the boot lines moved after the first render');
  let cached = {};
  let release;
  // getCurrentSession caches the user only once its profile reads finish, then resolves.
  const session = new Promise((resolve, reject) => {
    release = () => { cached = fails ? {} : { user }; if (fails) reject(new Error('offline')); else resolve(cached); };
  });
  const events = [];
  const writes = [];
  const window = {
    ShapeAuth: { getCachedState: () => cached, getCurrentSession: () => session },
    dispatchEvent: (e) => events.push(e.type),
    set ShapeCanChat(v) { writes.push(v); },
    get ShapeCanChat() { return writes[writes.length - 1]; },
  };
  let timeUp = null;
  const fakeTimeout = (fn, ms) => { assert.equal(ms, 2500); timeUp = fn; };
  if (!late) release();
  const painted = new AsyncFunction('window', 'setTimeout', 'Event', web.slice(from, to))(window, fakeTimeout, class { constructor(type) { this.type = type; } });
  await new Promise((r) => setImmediate(r));
  if (late) timeUp();
  await painted;
  if (late) release();
  await new Promise((r) => setImmediate(r));
  assert.equal(writes.length, 2, `one write before the render and one when the session settles: ${JSON.stringify(writes)}`);
  return { firstPaint: writes[0], after: writes[1], events };
}

test('a signed-out visitor on the website is not shown Nora as on, and the page never waits long to paint', async () => {
  const member = { id: 'u1' };
  // Loaded within the 2.5 s: the answer is the session's.
  assert.deepEqual(await bootCanChat({ user: member }), { firstPaint: true, after: true, events: ['shape:canchat'] });
  assert.deepEqual(await bootCanChat({ user: null }), { firstPaint: false, after: false, events: ['shape:canchat'] });
  assert.deepEqual(await bootCanChat({ user: member, fails: true }), { firstPaint: false, after: false, events: ['shape:canchat'] });
  // CodeRabbit, on the final head: a session still loading at 2.5 s is not "signed out". It
  // reads as a member until it settles, and only then can it say otherwise.
  assert.deepEqual(await bootCanChat({ user: member, late: true }), { firstPaint: true, after: true, events: ['shape:canchat'] },
    'a member whose session loads slowly is told to sign in');
  assert.deepEqual(await bootCanChat({ user: null, late: true }), { firstPaint: true, after: false, events: ['shape:canchat'] },
    'a session that settles signed out never reaches the switch');
  assert.deepEqual(await bootCanChat({ user: member, late: true, fails: true }), { firstPaint: true, after: false, events: ['shape:canchat'] });
  const web = read('mobile-app/src/broadsheet/cookingWeb.jsx');
  assert.match(web, /const signedIn = \(\) => !!window\.ShapeAuth\?\.getCachedState\?\.\(\)\?\.user\?\.id;/);
});
