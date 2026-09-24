import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { AsyncLocalStorage } from 'node:async_hooks';
// Next's testing runtime uses the same async context global as its server.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { default: nextTesting } = await import('next/experimental/testing/server.js');
const doesProxyMatch = nextTesting.unstable_doesProxyMatch || nextTesting.unstable_doesMiddlewareMatch;

const source = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const response = (data) => ({ ok: true, json: async () => data });
const account = (id) => ({ user: { id, role: 'trainer', roles: ['client', 'trainer'] } });

function sessionHarness(fetch) {
  const events = {};
  let authEvent;
  let now = 0;
  const window = { addEventListener: (key, fn) => { events[key] = fn; },
    shapeDb: { client: { auth: { onAuthStateChange: fn => { authEvent = fn; } } } } };
  vm.runInNewContext(source('public/newdesign/portalSession.js'), { window, fetch, Date: { now: () => now } });
  return { ...window.ShapePortalSession, events, auth: (...args) => authEvent(...args), tick: n => { now += n; } };
}

test('gate, header and both chat readers share one request; tab remount reuses it', async () => {
  let calls = 0;
  const gate = deferred();
  const api = sessionHarness(() => { calls++; return gate.promise; });
  const readers = Array.from({ length: 4 }, () => api.read());
  assert.equal(calls, 1);
  gate.resolve(response(account('a')));
  assert.deepEqual(await Promise.all(readers), Array(4).fill(account('a')));
  assert.deepEqual(api.peek(), account('a'));
  await api.read();
  assert.equal(calls, 1);
  api.tick(15001);
  await api.read();
  assert.equal(calls, 2, 'refresh after TTL');
});

test('auth failures stay unknown and neither failures nor signed-out responses are cached', async () => {
  const replies = [{ ok: false }, response({ user: null }), response(account('b'))];
  const api = sessionHarness(async () => replies.shift());
  assert.equal(await api.read(), null);
  assert.deepEqual(await api.read(), { user: null });
  assert.deepEqual(await api.read(), account('b'));
});

test('network failure can retry, and a refresh failure preserves the last displayed account', async () => {
  let fail = true;
  const api = sessionHarness(async () => { if (fail) throw Error('offline'); return response(account('a')); });
  await assert.rejects(api.read(), /offline/);
  fail = false;
  await api.read();
  api.tick(15001);
  fail = true;
  await assert.rejects(api.read(), /offline/);
  assert.deepEqual(api.peek(), account('a'));
});

test('invalidating an in-flight read cannot restore the previous account', async () => {
  const old = deferred();
  let calls = 0;
  const api = sessionHarness(() => ++calls === 1 ? old.promise : Promise.resolve(response(account('b'))));
  const before = api.read();
  api.clear();
  const after = api.read();
  old.resolve(response(account('a')));
  assert.deepEqual(await after, account('b'));
  assert.deepEqual(await before, account('b'));
  assert.deepEqual(api.peek(), account('b'));
  assert.equal(calls, 2);
});

test('sign-out, account changes, back/forward restoration and cross-tab sign-out clear display state', async () => {
  const api = sessionHarness(async () => response(account('a')));
  for (const clear of [
    () => api.auth('SIGNED_OUT', null),
    () => api.auth('SIGNED_IN', { user: { id: 'b' } }),
    () => api.auth('USER_UPDATED', { user: { id: 'a' } }),
    () => api.events.pageshow({ persisted: true }),
    () => api.events.storage({ key: 'shape.signedOutAt' }),
    () => api.events.storage({ key: 'shape.auth' }),
  ]) {
    await api.read();
    clear();
    assert.equal(api.peek(), null);
  }
});

test('initial SDK event and same-account token refresh do not discard the cookie account reading', async () => {
  let calls = 0;
  const api = sessionHarness(async () => { calls++; return response(account('a')); });
  await api.read();
  api.auth('INITIAL_SESSION', null);
  api.auth('TOKEN_REFRESHED', { user: { id: 'a' } });
  api.auth('SIGNED_IN', { user: { id: 'a' } });
  await api.read();
  assert.equal(calls, 1);
});

function dashboardHarness(fetch) {
  const text = source('public/newdesign/dashData.jsx');
  const block = text.slice(text.indexOf('const DASH_CACHE_TTL'), text.indexOf('// Run tasks'));
  return new Function('fetch', block + '\nreturn { read: _dashJson, cache: _dashCache };')(fetch);
}

test('concurrent sidebar and dashboard reads send one request', async () => {
  let calls = 0;
  const wait = deferred();
  const api = dashboardHarness(() => { calls++; return wait.promise; });
  const a = api.read('/api/trainer/dashboard'), b = api.read('/api/trainer/dashboard');
  assert.equal(calls, 1);
  wait.resolve(response({ clients: 3 }));
  assert.deepEqual(await a, await b);
  await api.read('/api/trainer/dashboard');
  assert.equal(calls, 1);
});

test('invalidated dashboard reads cannot overwrite a newer refresh', async () => {
  const old = deferred();
  let calls = 0;
  const api = dashboardHarness(() => ++calls === 1 ? old.promise : Promise.resolve(response({ version: 2 })));
  const a = api.read('/api/client/dashboard');
  api.cache.delete('/api/client/dashboard');
  assert.deepEqual(await api.read('/api/client/dashboard'), { version: 2 });
  old.resolve(response({ version: 1 }));
  await a;
  assert.deepEqual(await api.read('/api/client/dashboard'), { version: 2 });
});

test('failed dashboard reads release the in-flight entry for retry', async () => {
  let calls = 0;
  const api = dashboardHarness(async () => ++calls === 1 ? { ok: false, status: 503 } : response({ ok: true }));
  await assert.rejects(api.read('/api/client/dashboard'), /503/);
  assert.deepEqual(await api.read('/api/client/dashboard'), { ok: true });
});

const proxySource = source('src/proxy.ts');
const config = new Function(proxySource.slice(proxySource.indexOf('export const config')).replace('export const config', 'const config') + ';return config;')();
test('public website assets skip session middleware while dashboard HTML and APIs remain gated', () => {
  for (const url of ['/newdesign/nd/pageShell.js?v=abc', '/newdesign/dash.css', '/newdesign/portalSession.js', '/newdesign/settingsSync.mjs', '/newdesign/pageShell.jsx', '/vendor/supabase-js-2.108.2.umd.js', '/supabase.js?v=123']) {
    assert.equal(doesProxyMatch({ config, nextConfig: {}, url }), false, url);
  }
  for (const url of ['/newdesign/ClientApp.html', '/newdesign/TrainerApp.html', '/newdesign/NutritionistApp.html', '/dashboard', '/api/me', '/api/me/role', '/api/client/plan', '/api/messages/file.js', '/api/clients/file.css/shared-overview', '/api/newdesign/file.js']) {
    assert.equal(doesProxyMatch({ config, nextConfig: {}, url }), true, url);
  }
});

test('role switches validate ownership and go directly to each dashboard shell', async () => {
  const js = ts.transpileModule(source('src/app/api/me/role/route.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const role of ['client', 'trainer', 'nutritionist']) {
    let owns = true, updated = false;
    const db = { auth: { getUser: async () => ({ data: { user: { id: 'a' } } }) }, from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { roles: owns ? [role] : [] } }) }) }),
      update: () => ({ eq: async () => { updated = true; return { error: null }; } }),
    }) };
    const exports = {};
    const require = name => name === 'next/server' ? { NextResponse: { json: (data, init) => ({ data, status: init?.status || 200 }) } }
      : name.includes('request-utils') ? { readJson: async () => ({ ok: true, data: { role } }) }
      : { createClient: async () => db };
    new Function('exports', 'require', js)(exports, require);
    const result = await exports.POST({});
    assert.equal(result.status, 200);
    assert.ok(updated);
    assert.equal(result.data.dashboard, '/newdesign/' + role[0].toUpperCase() + role.slice(1) + 'App.html');
    owns = false; updated = false;
    assert.equal((await exports.POST({})).status, 403);
    assert.equal(updated, false);
  }
});
