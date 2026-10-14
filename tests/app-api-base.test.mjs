// ⚠ A ROOT-RELATIVE '/api/…' FETCH REACHES NOTHING IN THE INSTALLED APP (client-onboarding
// review H2, 2026-10-14). The WebView's own origin (capacitor://localhost, https://localhost)
// serves no API. 27 such calls sat across the app, among them the $5 checkout, the membership
// check and the age check; #2332 gave native builds their API base, but only the calls that
// already used it were helped. Every app call to Shape's server now goes through
// ShapeApi.fetch (shapeBackend.js): the API base in front and the live sign-in token.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'mobile-app', 'src');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(m?js|jsx)$/.test(name) ? [p] : [];
  });
}

// A bare `fetch(` (not `x.fetch(`) whose first argument is a literal starting with /api.
const ROOT_RELATIVE = /(?<![.\w$])fetch\(\s*[`'"]\/api/g;

test('nothing in the app fetches a root-relative /api path', () => {
  const offenders = [];
  for (const file of walk(APP)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(ROOT_RELATIVE)) {
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${relative(ROOT, file)}:${line}`);
    }
  }
  assert.deepEqual(offenders, [], 'call bsApi.fetch(\'/api/…\') (or window.ShapeApi.fetch) instead');
});

test('the rule sees what it is meant to see', () => {
  const hits = (s) => [...s.matchAll(ROOT_RELATIVE)].length;
  assert.equal(hits("fetch('/api/x')"), 1);
  assert.equal(hits('fetch(`/api/x?y=${z}`)'), 1);
  assert.equal(hits('await fetch( "/api/x", {})'), 1);
  assert.equal(hits("bsApi.fetch('/api/x')"), 0, 'the helper is the allowed form');
  assert.equal(hits('fetch(`${apiBaseUrl}/api/x`)'), 0, 'an absolute URL is not root-relative');
  assert.equal(hits("prefetch('/api/x')"), 0);
});

test('each screen module routes through the backend helper, read at call time', () => {
  const HELPER = "const bsApi = { fetch: (path, init) => (window.ShapeApi ? window.ShapeApi.fetch(path, init) : fetch(path, init)) };";
  for (const rel of [
    'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx',
    'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx',
    'mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx',
    'mobile-app/src/broadsheet/BSDobGate.jsx',
  ]) {
    const src = read(rel);
    assert.ok(src.includes(HELPER), `${rel} defines the helper`);
    assert.ok(/bsApi\.fetch\(\s*[`'"]\/api/.test(src), `${rel} uses it`);
  }
});

// shapeApiFetch, lifted from the shipping file and run against a recording fetch.
function liftApiFetch({ apiBaseUrl, token }) {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const start = src.indexOf('async function shapeApiFetch(');
  assert.ok(start > 0, 'shapeApiFetch exists');
  const end = src.indexOf('\n}\n', start) + 2;
  const calls = [];
  const fn = new Function('apiBaseUrl', 'liveAccessToken', 'fetch', 'Headers', `${src.slice(start, end)}; return shapeApiFetch;`)(
    apiBaseUrl, async () => token, async (url, init) => { calls.push({ url, init }); return { ok: true }; }, Headers,
  );
  return { fn, calls };
}

test('ShapeApi.fetch puts the API base in front and the live token on, and lets a caller override', async () => {
  const native = liftApiFetch({ apiBaseUrl: 'https://www.theshapecommunity.com', token: 'tok_live' });
  await native.fn('/api/me/membership', { cache: 'no-store' });
  assert.equal(native.calls[0].url, 'https://www.theshapecommunity.com/api/me/membership');
  assert.equal(native.calls[0].init.headers.get('Authorization'), 'Bearer tok_live');
  assert.equal(native.calls[0].init.cache, 'no-store');
  assert.equal(native.calls[0].init.credentials, 'same-origin', 'the hosted /m/ build still sends its cookie');

  await native.fn('/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer other' } });
  assert.equal(native.calls[1].init.headers.get('Authorization'), 'Bearer other', 'an explicit token is kept');
  assert.equal(native.calls[1].init.headers.get('Content-Type'), 'application/json');
  assert.equal(native.calls[1].init.method, 'POST');

  const signedOut = liftApiFetch({ apiBaseUrl: '', token: null });
  await signedOut.fn('/api/recipes/reviews?slug=a');
  assert.equal(signedOut.calls[0].url, '/api/recipes/reviews?slug=a', 'the hosted build without a base stays same-origin');
  assert.equal(signedOut.calls[0].init.headers.has('Authorization'), false, 'no token, no header');

  const form = liftApiFetch({ apiBaseUrl: 'https://b.test', token: 't' });
  await form.fn('/api/nutrition/meal-note', { method: 'POST', body: 'FORMDATA' });
  assert.equal(form.calls[0].init.headers.has('Content-Type'), false, 'a FormData upload keeps the browser\'s multipart boundary');
});

test('the backend exposes it', () => {
  const src = read('mobile-app/src/services/shapeBackend.js');
  assert.match(src, /window\.ShapeApi = \{ fetch: shapeApiFetch, url: \(path\) => `\$\{apiBaseUrl \|\| ''\}\$\{path\}` \};/);
});
