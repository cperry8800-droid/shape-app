// The installed app calls /api cross-origin (capacitor://localhost on iOS, https://localhost
// on Android), so every signed-in call is preflighted. Until #2251 no /api route answered a
// preflight or named an allowed origin, and the WebView refused them all (Codex, #2249).
// Driven through the REAL proxy with the session middleware stubbed, so a test reads the
// headers the app's WebView would read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const cors = await loadRealModule(join(ROOT, 'src/lib/native-cors.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });

async function loadProxy(answer) {
  const calls = [];
  const proxy = await loadRealModule(join(ROOT, 'src/proxy.ts'), { typescript: true, registry: new Map([
    ['next/server', nextServer],
    ['@/lib/native-cors', cors],
    ['@/lib/supabase/middleware', { updateSession: async (req) => { calls.push(req.method); return answer(req); } }],
  ]) });
  return { proxy: proxy.proxy, calls };
}
const req = (path, { method = 'GET', origin = null, headers = {} } = {}) => {
  const r = new nextServer.NextRequest(`https://www.theshapecommunity.com${path}`, { method, headers: { ...(origin ? { Origin: origin } : {}), ...headers } });
  return r;
};

test('only the app\'s own two origins, only on /api, and never a route that answers CORS itself', () => {
  assert.deepEqual([...cors.NATIVE_APP_ORIGINS], ['capacitor://localhost', 'https://localhost']);
  assert.equal(cors.nativeCorsOrigin('/api/support/chat', 'capacitor://localhost'), 'capacitor://localhost');
  assert.equal(cors.nativeCorsOrigin('/api/ai/transcribe', 'https://localhost'), 'https://localhost');
  for (const bad of ['https://evil.example', 'http://localhost', 'https://localhost:8443', 'https://localhost.evil.example', 'null', '*', 'capacitor://evil']) {
    assert.equal(cors.nativeCorsOrigin('/api/support/chat', bad), null, bad);
  }
  assert.equal(cors.nativeCorsOrigin('/newdesign/index.html', 'capacitor://localhost'), null, 'pages are not opened to the app');
  assert.equal(cors.nativeCorsOrigin('/api/support/chat', null), null, 'a same-origin call carries no Origin and needs nothing');
  assert.equal(cors.nativeCorsOrigin('/api/apply', 'capacitor://localhost'), null, '/api/apply answers CORS itself');
  assert.equal(cors.nativeCorsOrigin('/api/applyx', 'capacitor://localhost'), 'capacitor://localhost', 'the skip is the route, not a prefix of a name');
});

test('⚠ the app\'s preflight is answered before the session and the gates ever run', async () => {
  const { proxy, calls } = await loadProxy(() => nextServer.NextResponse.json({ error: 'Authentication required.' }, { status: 401 }));
  const res = await proxy(req('/api/ai/transcribe', { method: 'OPTIONS', origin: 'capacitor://localhost', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } }));
  assert.equal(res.status, 204);
  assert.equal(calls.length, 0, 'a preflight carries no Authorization; the member gate would have refused it');
  assert.equal(res.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.match(res.headers.get('access-control-allow-methods'), /\bPOST\b.*\bPATCH\b.*\bDELETE\b/);
  assert.match(res.headers.get('access-control-allow-headers'), /Authorization/);
  assert.match(res.headers.get('access-control-allow-headers'), /Content-Type/);
  assert.equal(res.headers.get('vary'), 'Origin');
});

test('⚠ every response the app gets names its origin, early refusals included, and never allows credentials', async () => {
  for (const [status, body, extra] of [[200, { reply: 'ok' }, {}], [401, { error: 'Authentication required.' }, {}], [429, { error: 'slow' }, { 'Retry-After': '30' }], [402, { code: 'membership_required' }, {}]]) {
    const { proxy, calls } = await loadProxy(() => nextServer.NextResponse.json(body, { status, headers: extra }));
    const res = await proxy(req('/api/support/chat', { method: 'POST', origin: 'https://localhost', headers: { Authorization: 'Bearer t' } }));
    assert.equal(calls.length, 1);
    assert.equal(res.status, status);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://localhost', `HTTP ${status}`);
    assert.equal(res.headers.get('access-control-allow-credentials'), null, 'no cookie ever rides these calls');
    assert.match(res.headers.get('vary') || '', /Origin/);
    assert.match(res.headers.get('access-control-expose-headers') || '', /Retry-After/);
  }
});

test('the website and anyone else are untouched: no Origin, a foreign Origin, a page, an OPTIONS from elsewhere', async () => {
  const plain = () => nextServer.NextResponse.json({ ok: true });
  for (const [path, opts] of [
    ['/api/support/chat', { method: 'POST' }],
    ['/api/support/chat', { method: 'POST', origin: 'https://evil.example' }],
    ['/newdesign/index.html', { origin: 'capacitor://localhost' }],
  ]) {
    const { proxy, calls } = await loadProxy(plain);
    const res = await proxy(req(path, opts));
    assert.equal(calls.length, 1, 'the session runs as before');
    assert.equal(res.headers.get('access-control-allow-origin'), null, `${path} ${opts.origin || 'no origin'}`);
  }
  const { proxy, calls } = await loadProxy(plain);
  const res = await proxy(req('/api/support/chat', { method: 'OPTIONS', origin: 'https://evil.example' }));
  assert.equal(calls.length, 1, 'a preflight from elsewhere is not short-circuited');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('a Vary the route already set keeps its value and gains Origin once', () => {
  const r = cors.withNativeCors(new Response('x', { headers: { Vary: 'Accept-Encoding' } }), 'capacitor://localhost');
  assert.equal(r.headers.get('vary'), 'Accept-Encoding, Origin');
  const twice = cors.withNativeCors(cors.withNativeCors(new Response('x'), 'https://localhost'), 'https://localhost');
  assert.equal(twice.headers.get('vary'), 'Origin');
});

test('the app\'s native build points at these origins: iOS default scheme, Android https', () => {
  const cap = readFileSync(join(ROOT, 'mobile-app/capacitor.config.ts'), 'utf8');
  assert.match(cap, /androidScheme: 'https'/, 'Android serves the app from https://localhost');
  assert.doesNotMatch(cap, /iosScheme/, 'iOS keeps the default capacitor:// scheme');
  assert.doesNotMatch(cap, /hostname:/, 'both keep the default localhost host');
});
