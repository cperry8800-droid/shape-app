// The installed app connects WHOOP, Strava, Spotify (and Garmin, Oura) and Apple Music through its
// in-app browser. Owner, 2026-10-13: "build the native handoff for whoop strava spotify", "make
// apple music is inlcuded". The authorize routes read the website's cookie session and MusicKit's
// sign-in opens a window; the app's WebView has neither (Capacitor hands a window.open to Safari
// and returns nothing), so the app asks for a ten-minute link and opens it in the in-app browser.
//
//   · src/lib/integration-handoff.ts: the link token, bound to the member and the provider;
//   · POST /api/integrations/handoff: the link, for a signed-in member (Bearer);
//   · /connect/{provider}: names the Shape account, and its Continue is a form POST to authorize;
//   · POST /api/integrations/{provider}/authorize: the link's member, only from a page on this site,
//     so a forwarded link reaches the provider only through the page; GET is unchanged;
//   · the Apple Music routes: the link token in place of a session, for Apple Music only;
//   · the app: connect opens the link with the Browser plugin and reloads when it closes.
// Run: node --test tests/integration-handoff.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const React = require_('react');
const { renderToStaticMarkup } = require_('react-dom/server');
globalThis.React = React;
const nextServer = require_('next/server');

process.env.INTEGRATION_HANDOFF_SECRET = 'test-handoff-secret';
const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const H = await loadRealModule(join(ROOT, 'src/lib/integration-handoff.ts'), { typescript: true });
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
const providers = await loadRealModule(join(ROOT, 'src/lib/integrations/providers.ts'), { typescript: true });
const oauth = await loadRealModule(join(ROOT, 'src/lib/integrations/oauth.ts'), { typescript: true });
const safeRedirect = await import(pathToFileURL(join(ROOT, 'src/lib/safe-redirect.mjs')).href);

// ── The link token ──────────────────────────────────────────────────────────

test('a link token names one member and one provider, for ten minutes, and nothing else reads it', () => {
  const now = Date.UTC(2026, 9, 13, 19, 0, 0);
  const { token, expiresAt } = H.issueHandoff(UID, 'whoop', now);
  assert.equal(expiresAt, now + 600_000);
  assert.equal(H.readHandoff(token, 'whoop', now), UID);
  assert.equal(H.readHandoff(token, 'whoop', now + 599_000), UID);
  assert.equal(H.readHandoff(token, 'whoop', now + 601_000), null, 'expired');
  assert.equal(H.readHandoff(token, 'strava', now), null, 'another provider');
  const [, prov, exp, sig] = token.split('.');
  assert.equal(H.readHandoff(`${OTHER}.${prov}.${exp}.${sig}`, 'whoop', now), null, 'another member under the same signature');
  assert.equal(H.readHandoff(`${UID}.${prov}.${Number(exp) + 3600}.${sig}`, 'whoop', now), null, 'a later expiry under the same signature');
  assert.equal(H.readHandoff(token.slice(0, -1) + (token.endsWith('0') ? '1' : '0'), 'whoop', now), null, 'a changed signature');
  assert.equal(H.readHandoff(token, 'twitter', now), null);
  assert.equal(H.issueHandoff('not-a-uuid', 'whoop', now), null);
  assert.equal(H.issueHandoff(UID, 'twitter', now), null);
  assert.ok(H.issueHandoff(UID, 'apple_music', now), 'Apple Music is a handoff provider');

  const saved = { a: process.env.INTEGRATION_HANDOFF_SECRET, b: process.env.RATE_LIMIT_SECRET, c: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.INTEGRATION_HANDOFF_SECRET; delete process.env.RATE_LIMIT_SECRET; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(H.issueHandoff(UID, 'whoop', now), null, 'no secret, no link');
    assert.equal(H.readHandoff(token, 'whoop', now), null);
  } finally {
    process.env.INTEGRATION_HANDOFF_SECRET = saved.a;
    if (saved.b !== undefined) process.env.RATE_LIMIT_SECRET = saved.b;
    if (saved.c !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.c;
  }
});

test('a Continue post is allowed only from a page on this site, and the account shows as a masked email', () => {
  const post = (headers) => new Request('https://shape.test/api/integrations/whoop/authorize', { method: 'POST', headers });
  assert.equal(H.handoffPostAllowed(post({ origin: 'https://shape.test' })), true);
  assert.equal(H.handoffPostAllowed(post({ origin: 'https://evil.test' })), false, 'another site');
  assert.equal(H.handoffPostAllowed(post({ origin: 'https://evil.test', 'sec-fetch-site': 'same-origin' })), false, 'a named origin decides');
  assert.equal(H.handoffPostAllowed(post({ origin: 'null', 'sec-fetch-site': 'same-origin' })), true, 'a no-referrer page on this site');
  assert.equal(H.handoffPostAllowed(post({ origin: 'null', 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(H.handoffPostAllowed(post({ origin: 'null' })), false);
  assert.equal(H.handoffPostAllowed(post({})), false, 'a post that names nothing');
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://theshapecommunity.com';
  try {
    assert.equal(H.handoffPostAllowed(post({ origin: 'https://theshapecommunity.com' })), true, 'the site behind a proxy');
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = saved;
  }
  assert.equal(H.maskEmail('chris@gmail.com'), 'c•••@gmail.com');
  assert.equal(H.maskEmail(''), '');
  assert.equal(H.maskEmail('@x.com'), '');
});

// ── POST /api/integrations/handoff ──────────────────────────────────────────

async function handoffRoute(user) {
  return loadRealModule(join(ROOT, 'src/app/api/integrations/handoff/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/integrations/providers', providers],
      ['@/lib/integration-handoff', H],
    ]),
  });
}
const postHandoff = async (route, body) => {
  const r = await route.POST(new Request('https://shape.test/api/integrations/handoff', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify(body) }));
  return { status: r.status, cache: r.headers.get('cache-control'), body: await r.json() };
};

test('handoff route: a member gets a link to /connect/{provider}; no one else, and no provider that is not set up', async () => {
  assert.equal((await postHandoff(await handoffRoute(null), { provider: 'whoop' })).status, 401);
  const route = await handoffRoute({ id: UID });
  assert.equal((await postHandoff(route, { provider: 'twitter' })).status, 400);
  delete process.env.WHOOP_CLIENT_ID; delete process.env.WHOOP_CLIENT_SECRET;
  const unset = await postHandoff(route, { provider: 'whoop' });
  assert.deepEqual([unset.status, unset.body.error], [503, "WHOOP isn't available yet."]);
  process.env.WHOOP_CLIENT_ID = 'id'; process.env.WHOOP_CLIENT_SECRET = 'secret';
  const ok = await postHandoff(route, { provider: 'whoop' });
  assert.equal(ok.status, 200);
  assert.equal(ok.cache, 'no-store');
  const url = new URL(ok.body.url);
  assert.equal(`${url.origin}${url.pathname}`, 'https://shape.test/connect/whoop');
  assert.equal(H.readHandoff(url.searchParams.get('handoff'), 'whoop'), UID);
  const apple = await postHandoff(route, { provider: 'apple_music' });
  assert.equal(new URL(apple.body.url).pathname, '/connect/apple_music', 'Apple Music needs no OAuth credentials here');
});

// ── /api/integrations/{provider}/authorize ──────────────────────────────────

function cookieJar(initial = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, { value: v }]));
  const sets = [];
  return {
    sets,
    store,
    get: (name) => store.get(name),
    set: (name, value, opts) => { sets.push({ name, value, opts }); store.set(name, { value }); },
  };
}
async function authorizeRoute(jar, cookieUser = null) {
  return loadRealModule(join(ROOT, 'src/app/api/integrations/[provider]/authorize/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['next/headers', { cookies: async () => jar }],
      ['@/lib/supabase/server', { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: cookieUser } }) } }) }],
      ['@/lib/integrations/providers', providers],
      ['@/lib/integrations/oauth', oauth],
      ['@/lib/safe-redirect.mjs', safeRedirect],
      ['@/lib/integration-handoff', H],
    ]),
  });
}
const authorize = async (route, query, provider = 'whoop') => {
  const r = await route.GET(new Request(`https://shape.test/api/integrations/${provider}/authorize${query}`), { params: Promise.resolve({ provider }) });
  return { status: r.status, location: r.headers.get('location') || '' };
};
const continuePost = async (route, handoff, { provider = 'whoop', origin = 'https://shape.test' } = {}) => {
  const body = new URLSearchParams(handoff === undefined ? {} : { handoff });
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (origin) headers.origin = origin;
  const r = await route.POST(new Request(`https://shape.test/api/integrations/${provider}/authorize`, { method: 'POST', headers, body }), { params: Promise.resolve({ provider }) });
  return { status: r.status, location: r.headers.get('location') || '' };
};

test('authorize POST: the page\'s Continue goes to the provider as the link\'s member, by GET', async () => {
  process.env.WHOOP_CLIENT_ID = 'id'; process.env.WHOOP_CLIENT_SECRET = 'secret';
  const { token } = H.issueHandoff(UID, 'whoop');
  const jar = cookieJar();
  // A browser signed in to the website as someone else still connects the app's member.
  const r = await continuePost(await authorizeRoute(jar, { id: OTHER }), token);
  assert.equal(r.status, 303, 'a 307 would post the form on to the provider');
  assert.equal(r.location.startsWith(providers.PROVIDERS.whoop.authorizeUrl), true, r.location);
  const set = Object.fromEntries(jar.sets.map((s) => [s.name, s.value]));
  assert.equal(set.shape_oauth_user_whoop, UID);
  assert.equal(set.shape_oauth_return_whoop, '/connect/done');
  assert.equal(new URL(r.location).searchParams.get('state'), set.shape_oauth_state_whoop);
});

test('authorize POST: from another site, out of date, for another provider or with no link, goes nowhere', async () => {
  process.env.WHOOP_CLIENT_ID = 'id'; process.env.WHOOP_CLIENT_SECRET = 'secret';
  const { token } = H.issueHandoff(UID, 'whoop');
  const cross = cookieJar();
  const refused = await continuePost(await authorizeRoute(cross, { id: OTHER }), token, { origin: 'https://evil.test' });
  assert.equal(refused.status, 403, 'a page elsewhere cannot press Continue');
  assert.equal(cross.sets.length, 0);
  const unnamed = await continuePost(await authorizeRoute(cookieJar(), null), token, { origin: '' });
  assert.equal(unnamed.status, 403);

  const cases = [
    ['out of date', H.issueHandoff(UID, 'whoop', Date.now() - 11 * 60_000).token],
    ['another provider\'s link', H.issueHandoff(UID, 'strava').token],
    ['not a token', 'nope'],
    ['no link', undefined],
  ];
  for (const [why, t] of cases) {
    const jar = cookieJar();
    const r = await continuePost(await authorizeRoute(jar, { id: OTHER }), t);
    assert.deepEqual([r.status, r.location], [303, 'https://shape.test/connect/done?integration=whoop&status=expired'], why);
    assert.equal(jar.sets.length, 0, `${why}: no OAuth state`);
  }
});

test('authorize GET: a link in the address goes nowhere; the website\'s cookie session works as before', async () => {
  process.env.WHOOP_CLIENT_ID = 'id'; process.env.WHOOP_CLIENT_SECRET = 'secret';
  const { token } = H.issueHandoff(UID, 'whoop');
  const linkOnly = cookieJar();
  const skipped = await authorize(await authorizeRoute(linkOnly, null), `?handoff=${encodeURIComponent(token)}`);
  assert.match(skipped.location, /status=signin_required/, 'a forwarded link cannot skip the page');
  assert.equal(linkOnly.sets.length, 0);

  const jar = cookieJar();
  const r = await authorize(await authorizeRoute(jar, { id: OTHER }), `?return=%2Fnewdesign%2FGetApp.html&handoff=${encodeURIComponent(token)}`);
  assert.equal(r.status, 307);
  assert.equal(r.location.startsWith(providers.PROVIDERS.whoop.authorizeUrl), true);
  const set = Object.fromEntries(jar.sets.map((s) => [s.name, s.value]));
  assert.deepEqual([set.shape_oauth_user_whoop, set.shape_oauth_return_whoop], [OTHER, '/newdesign/GetApp.html'], 'the session\'s member, never the link\'s');
});

// ── /connect/{provider}: the page and its Continue ──────────────────────────

async function connectPage(admin) {
  return loadRealModule(join(ROOT, 'src/app/connect/[provider]/page.tsx'), {
    typescript: true,
    registry: new Map([
      ['next/navigation', { notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }],
      ['@/lib/supabase/admin', { createAdminClient: () => admin }],
      ['@/lib/integration-handoff', H],
      ['./AppleMusicConnect', { __esModule: true, default: ({ handoff }) => React.createElement('div', { 'data-apple-music': handoff }) }],
    ]),
  });
}
const adminFor = ({ email = 'chris@gmail.com', fullName = 'Chris Perry', authError = null } = {}) => ({
  auth: { admin: { getUserById: async (id) => ({ data: authError ? null : { user: { id, email } }, error: authError }) } },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: fullName }, error: null }) }) }) }),
});
const renderPage = async (mod, provider, handoff) => {
  const el = await mod.default({ params: Promise.resolve({ provider }), searchParams: Promise.resolve({ handoff }) });
  return renderToStaticMarkup(el);
};
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<\/?strong[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('the page names the account the link connects, and only then offers Continue', async () => {
  const mod = await connectPage(adminFor());
  const { token } = H.issueHandoff(UID, 'whoop');
  const html = await renderPage(mod, 'whoop', token);
  assert.match(textOf(html), /This connects WHOOP to the Shape account of Chris P\. \(c•••@gmail\.com\)\. If that isn't your account, close this page\./);
  assert.match(html, /<form action="\/api\/integrations\/whoop\/authorize" method="post">/);
  assert.match(html, /<button type="submit"[^>]*>Continue to WHOOP<\/button>/);
  assert.match(html, new RegExp(`name="handoff" value="${token}"`));

  const expired = await renderPage(mod, 'whoop', H.issueHandoff(UID, 'whoop', Date.now() - 11 * 60_000).token);
  assert.match(textOf(expired), /This link has run out/);
  assert.doesNotMatch(expired, /<form|Continue to/);
  assert.match(textOf(await renderPage(mod, 'strava', token)), /This link has run out/, 'a WHOOP link opens no Strava page');

  const unread = await renderPage(await connectPage(adminFor({ authError: { message: 'boom' } })), 'whoop', token);
  assert.match(textOf(unread), /couldn't check this link/);
  assert.doesNotMatch(unread, /<form|Continue to/, 'no Continue without a name to show');

  const apple = H.issueHandoff(UID, 'apple_music').token;
  const appleHtml = await renderPage(mod, 'apple_music', apple);
  assert.match(textOf(appleHtml), /This connects Apple Music to the Shape account of Chris P\./);
  assert.match(appleHtml, new RegExp(`data-apple-music="${apple}"`));
  assert.doesNotMatch(appleHtml, /<form/, 'Apple Music connects on the page itself');

  await assert.rejects(() => renderPage(mod, 'twitter', token), /NEXT_NOT_FOUND/);
});

test('the done page says what happened and to close it', async () => {
  const mod = await loadRealModule(join(ROOT, 'src/app/connect/done/page.tsx'), { typescript: true, registry: new Map([['@/lib/integration-handoff', H]]) });
  const show = async (q) => textOf(renderToStaticMarkup(await mod.default({ searchParams: Promise.resolve(q) })));
  assert.equal(await show({ integration: 'strava', status: 'ok' }), 'Shape · Connect ✓ Strava is connected. Close this page to go back to the Shape app.');
  assert.match(await show({ integration: 'whoop', status: 'expired' }), /This link has run out\. Close this page to go back to the Shape app, then tap Connect to try again\./);
  assert.match(await show({ integration: 'spotify', status: 'error' }), /Spotify didn't connect\./);
  assert.match(await show({ integration: '<script>', status: 'ok' }), /The app is connected\./, 'an unknown name is never echoed');
});

// ── Apple Music's routes take the page's link token ─────────────────────────

test('Apple Music: the developer token and the connect route take an Apple Music link, and no other', async () => {
  const devToken = await loadRealModule(join(ROOT, 'src/app/api/integrations/apple-music/developer-token/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/request-auth', { currentUser: async () => null }], ['@/lib/integration-handoff', H]]),
  });
  delete process.env.APPLE_MUSIC_TEAM_ID;
  const tokenCall = (h) => devToken.GET(new Request('https://shape.test/api/integrations/apple-music/developer-token', { headers: h }));
  assert.equal((await tokenCall({})).status, 401);
  assert.equal((await tokenCall({ 'x-shape-handoff': H.issueHandoff(UID, 'whoop').token })).status, 401, 'a WHOOP link is not an Apple Music one');
  // Past the sign-in check: what stops it now is the missing Apple key.
  assert.equal((await tokenCall({ 'x-shape-handoff': H.issueHandoff(UID, 'apple_music').token })).status, 500);

  const rows = [];
  const connect = await loadRealModule(join(ROOT, 'src/app/api/integrations/apple-music/connect/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/supabase-js', { createClient: () => { throw new Error('no Bearer here'); } }],
      ['@/lib/supabase/server', { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }],
      ['@/lib/supabase/admin', { createAdminClient: () => ({ from: () => ({ upsert: async (row) => { rows.push(row); return { error: null }; } }) }) }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/integration-handoff', H],
    ]),
  });
  const post = (h) => connect.POST(new Request('https://shape.test/api/integrations/apple-music/connect', {
    method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify({ musicUserToken: 'mut', storefront: 'us' }),
  }));
  assert.equal((await post({ 'x-shape-handoff': H.issueHandoff(UID, 'strava').token })).status, 401);
  assert.equal(rows.length, 0);
  const ok = await post({ 'x-shape-handoff': H.issueHandoff(UID, 'apple_music').token });
  assert.equal(ok.status, 200);
  assert.deepEqual([rows[0].user_id, rows[0].provider, rows[0].access_token], [UID, 'apple_music', 'mut']);
});

// ── The app ─────────────────────────────────────────────────────────────────

const SITE = 'https://theshapecommunity.com';
function backendSlice(from, to, scope) {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const start = src.indexOf(from);
  const end = src.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `${from} must stay where this test reads it`);
  const keys = Object.keys(scope);
  return new Function(...keys, `${src.slice(start, end)}\nreturn { openIntegrationHandoff: typeof openIntegrationHandoff === 'function' ? openIntegrationHandoff : null, connectProvider: typeof connectProvider === 'function' ? connectProvider : null, connectAppleMusic: typeof connectAppleMusic === 'function' ? connectAppleMusic : null };`)(...keys.map((k) => scope[k]));
}
function appWorld({ status = 200, body = { url: `${SITE}/connect/whoop?handoff=t` }, native = true } = {}) {
  const log = [];
  const listeners = {};
  const events = [];
  const win = {
    Capacitor: { Plugins: { Browser: {
      open: async (opts) => { log.push(['open', opts]); },
      addListener: async (name, fn) => { listeners[name] = fn; return { remove: () => log.push(['removed', name]) }; },
    } } },
    location: { assign: (u) => log.push(['assign', u]) },
    dispatchEvent: (e) => events.push(e.type),
  };
  const scope = {
    apiBaseUrl: SITE,
    _isNative: native,
    state: { session: { access_token: 'a', refresh_token: 'r' } },
    bridgeSessionToApi: async () => { log.push(['bridge']); return { bridged: true }; },
    window: win,
    fetch: async (url, opts) => { log.push(['fetch', url, opts]); return { ok: status < 400, status, json: async () => body }; },
  };
  return { scope, log, listeners, events };
}

test('app: connecting in the installed app opens the handoff link in the in-app browser, and its close reloads the page', async () => {
  const w = appWorld();
  const { connectProvider } = backendSlice('async function openIntegrationHandoff(', 'async function connectWhoop(', w.scope);
  assert.deepEqual(await connectProvider('WHOOP'), { handoff: true });
  const fetchCall = w.log.find((e) => e[0] === 'fetch');
  assert.equal(fetchCall[1], `${SITE}/api/integrations/handoff`);
  assert.equal(fetchCall[2].method, 'POST');
  assert.equal(fetchCall[2].headers.Authorization, 'Bearer a');
  assert.deepEqual(JSON.parse(fetchCall[2].body), { provider: 'whoop' });
  assert.deepEqual(w.log.find((e) => e[0] === 'open'), ['open', { url: `${SITE}/connect/whoop?handoff=t` }]);
  assert.equal(w.log.some((e) => e[0] === 'bridge' || e[0] === 'assign'), false, 'no cookie bridge, no WebView navigation');
  w.listeners.browserFinished();
  assert.deepEqual(w.events, ['shape:integrations-changed']);
  assert.equal(w.log.some((e) => e[0] === 'removed'), true, 'the listener goes with it');

  const refused = appWorld({ status: 503, body: { error: "WHOOP isn't available yet." } });
  const { connectProvider: c2 } = backendSlice('async function openIntegrationHandoff(', 'async function connectWhoop(', refused.scope);
  await assert.rejects(() => c2('whoop'), /WHOOP isn't available yet\./);
  assert.equal(refused.log.some((e) => e[0] === 'open'), false);

  const web = appWorld({ native: false });
  const { connectProvider: c3 } = backendSlice('async function openIntegrationHandoff(', 'async function connectWhoop(', web.scope);
  assert.deepEqual(await c3('strava'), { redirected: true });
  assert.deepEqual(web.log.map((e) => e[0]), ['bridge', 'assign'], 'the website and /m/ go straight to authorize, as before');
});

test('app: Apple Music in the installed app goes through the same handoff', async () => {
  const opened = [];
  const { connectAppleMusic } = backendSlice('async function connectAppleMusic(', 'async function disconnectAppleMusic(', {
    apiBaseUrl: SITE, _isNative: true, state: { session: { access_token: 'a' } },
    openIntegrationHandoff: async (p) => { opened.push(p); return { handoff: true }; },
    fetch: async () => { throw new Error('no MusicKit in the WebView'); }, sessionsAuthHeaders: () => ({}), loadMusicKit: async () => { throw new Error('no'); },
  });
  assert.deepEqual(await connectAppleMusic(), { handoff: true });
  assert.deepEqual(opened, ['apple_music']);
});

test('app: the Integrations page reloads when the browser closes and does not call a handoff "connected"', () => {
  const page = read('mobile-app/src/broadsheet/BSIntegrationsPage.jsx');
  assert.match(page, /window\.addEventListener\('shape:integrations-changed', reload\);\n\s+return \(\) => window\.removeEventListener\('shape:integrations-changed', reload\);/);
  assert.match(page, /const result = await action\(\);\n(?:\s*\/\/.*\n)*\s+if \(result && \(result\.handoff \|\| result\.redirected\)\) return;\n\s+setSummary/);
  for (const [key, call] of [['whoop', 'connectWhoop()'], ['strava', 'connectStrava()'], ['spotify', 'connectSpotify()'], ['garmin', "connectProvider('garmin')"], ['oura', "connectProvider('oura')"]]) {
    assert.ok(page.includes(`runAction('${key}-connect', ${key}.label, toastConnected(${key}.label), () => window.ShapeIntegrations.${call})`), `${key}: its connect goes through runAction, so an error is shown`);
  }
  assert.match(page, /runAction\('apple-connect', [^\n]+window\.ShapeIntegrations\.connectAppleMusic\(\)\)/);
});
