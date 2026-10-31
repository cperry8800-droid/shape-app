// /api/consent/banner and the banner's use of it, driven (Codex on #2530).
// The banner writes a signed-in visitor's answer to consent_log through window.shapeDb, which only
// /supabase.js provides; on every Next page and the website's pages without it the answer was kept
// on the device with no receipt. The banner now asks this route there, and the route writes the
// row with the request's own session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const nextServer = require('next/server');
const { JSDOM } = require('jsdom');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const ROUTE = 'src/app/api/consent/banner/route.ts';
const BANNER = read('public/consent-banner.js');
const BANNER_COPY = /var BANNER_COPY = "([^"]+)";/.exec(BANNER)[1];
const GPC_TEXT = /var GPC_TEXT = "([^"]+)";/.exec(BANNER)[1];

// The real readJson: a stub would invent its contract (see recipe-parse-route.test.mjs).
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), {
  typescript: true, registry: new Map([['next/server', nextServer]]),
});

// The request's own client, as clientForRequest gives it: it records what the route asks.
function fakeDb({ existing = [], selectError = null, insertError = null } = {}) {
  const calls = { inserts: [], selects: [] };
  const db = {
    from(table) {
      return {
        select(cols) {
          const q = { table, cols, eq: [] };
          calls.selects.push(q);
          const chain = {
            eq(col, val) { q.eq.push([col, val]); return chain; },
            limit(n) { q.limit = n; return Promise.resolve({ data: selectError ? null : existing, error: selectError }); },
          };
          return chain;
        },
        insert(row) { calls.inserts.push({ table, row }); return Promise.resolve({ error: insertError }); },
      };
    },
  };
  return { db, calls };
}

async function loadRoute({ user = { id: 'u1' }, ...dbOpts } = {}) {
  const { db, calls } = fakeDb(dbOpts);
  calls.clientFor = [];
  const mod = await loadRealModule(join(ROOT, ROUTE), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/request-auth', {
        currentUser: async () => user,
        clientForRequest: async (req) => { calls.clientFor.push(req); return db; },
      }],
    ]),
  });
  return { mod, calls };
}

const post = (body, type = 'application/json') => new Request('https://shape.test/api/consent/banner', {
  method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const receipt = (over = {}) => ({ kind: 'cookies', granted: true, policy_version: '2026-06-22', consent_text: BANNER_COPY, ...over });

test('a signed-in answer is written for the caller, with the words shown, through the request\'s own session', async () => {
  for (const granted of [true, false]) {
    const { mod, calls } = await loadRoute();
    const req = post(receipt({ granted }));
    const res = await mod.POST(req);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { logged: true });
    assert.deepEqual(calls.inserts, [{ table: 'consent_log', row: {
      user_id: 'u1', kind: 'cookies', granted, policy_version: '2026-06-22', consent_text: BANNER_COPY, source: 'banner',
    } }]);
    assert.equal(calls.clientFor.length, 1);
    assert.ok(calls.clientFor[0] === req, 'the row is not written with the request\'s own session');
  }
  // Never an admin client: the table's own rule (a row for the caller only) has to hold here too.
  assert.doesNotMatch(read(ROUTE), /supabase\/admin|createAdminClient/);
});

test('a visitor who isn\'t signed in has nothing logged', async () => {
  const { mod, calls } = await loadRoute({ user: null });
  const res = await mod.POST(post(receipt()));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { logged: false });
  assert.equal(calls.inserts.length, 0);
});

test('only the banner\'s receipts, as JSON, are taken', async () => {
  const bad = [
    receipt({ kind: 'health' }), receipt({ kind: 'marketing' }), receipt({ kind: undefined }),
    receipt({ granted: 'yes' }), receipt({ granted: undefined }),
    receipt({ policy_version: 'latest' }), receipt({ policy_version: 20260622 }),
    receipt({ consent_text: '' }), receipt({ consent_text: '   ' }), receipt({ consent_text: 'x'.repeat(2001) }), receipt({ consent_text: 5 }),
    [], 'null',
  ];
  for (const body of bad) {
    const { mod, calls } = await loadRoute();
    const res = await mod.POST(post(body));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(calls.inserts.length, 0);
  }
  {
    const { mod, calls } = await loadRoute();
    const res = await mod.POST(post(receipt(), 'text/plain'));
    assert.equal(res.status, 415, 'a body that isn\'t JSON (a form on another site, say)');
    assert.equal(calls.inserts.length, 0);
  }
  {
    const { mod, calls } = await loadRoute();
    const res = await mod.POST(post(receipt({ consent_text: 'x'.repeat(2000) })));
    assert.equal(res.status, 200, 'the longest text taken');
    assert.equal(calls.inserts.length, 1);
  }
});

test('the GPC opt-out is logged once per account', async () => {
  const first = await loadRoute();
  const res = await first.mod.POST(post(receipt({ kind: 'gpc_optout', consent_text: GPC_TEXT })));
  assert.equal(res.status, 200);
  assert.deepEqual(first.calls.selects[0].eq, [['user_id', 'u1'], ['kind', 'gpc_optout']]);
  assert.equal(first.calls.inserts.length, 1);
  assert.equal(first.calls.inserts[0].row.kind, 'gpc_optout');
  const again = await loadRoute({ existing: [{ id: 'r1' }] });
  const res2 = await again.mod.POST(post(receipt({ kind: 'gpc_optout', consent_text: GPC_TEXT })));
  assert.equal(res2.status, 200);
  assert.deepEqual(await res2.json(), { logged: true });
  assert.equal(again.calls.inserts.length, 0, 'logged a second time');
  // An Accept or a Reject is a receipt every time it is given.
  const cookies = await loadRoute({ existing: [{ id: 'r1' }] });
  await cookies.mod.POST(post(receipt()));
  assert.equal(cookies.calls.selects.length, 0);
  assert.equal(cookies.calls.inserts.length, 1);
});

test('a failed write says so', async () => {
  for (const opts of [{ insertError: { message: 'down' } }, { selectError: { message: 'down' } }]) {
    const { mod } = await loadRoute(opts);
    const kind = opts.selectError ? 'gpc_optout' : 'cookies';
    const res = await mod.POST(post(receipt({ kind })));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { logged: false });
  }
});

test('the route is registered in the War Room', async () => {
  const warroom = await loadRealModule(join(ROOT, 'src/lib/warroom.ts'), {
    typescript: true,
    appendExports: 'export const __RAW_ROUTES = RAW_ROUTES;',
    registry: new Map([
      ['fs/promises', { readdir: async () => [], stat: async () => ({}) }],
      ['fs', { existsSync: () => false }],
      ['path', require('path')],
      ['./funnel.mjs', { buildFunnel: () => ({}) }],
      ['./supabase/admin', { createAdminClient: () => null }],
    ]),
  });
  const entries = warroom.__RAW_ROUTES.filter(([p]) => p === '/api/consent/banner');
  assert.deepEqual(entries.map(([p, m]) => [p, m]), [['/api/consent/banner', 'POST']]);
});

// ── The banner asks the route where it has no browser client ─────────────────
async function bannerPage({ tz = 'Europe/London', gpc = false, shapeDb = null, status = 200 } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://shape.test/dashboard', runScripts: 'outside-only' });
  const win = dom.window;
  win.Intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: tz }) }) };
  if (gpc) Object.defineProperty(win.navigator, 'globalPrivacyControl', { value: true, configurable: true });
  if (shapeDb) win.shapeDb = shapeDb;
  const posts = [];
  win.fetch = (url, init) => { posts.push({ url, init, body: JSON.parse(init.body) }); return Promise.resolve({ ok: status === 200, status }); };
  win.eval(BANNER);
  if (win.document.readyState === 'loading') await new Promise((r) => win.addEventListener('DOMContentLoaded', r));
  const answer = (label) => [...win.document.querySelectorAll('[aria-label="Cookie consent"] button')].find((b) => b.textContent === label).click();
  return { win, posts, answer };
}

test('on a page without the browser client, an answer is sent to the route in the words shown', async () => {
  for (const [label, granted] of [['Accept', true], ['Reject non-essential', false]]) {
    const { posts, answer } = await bannerPage();
    assert.equal(posts.length, 0, 'sent before an answer');
    answer(label);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, '/api/consent/banner');
    assert.equal(posts[0].init.method, 'POST');
    assert.equal(posts[0].init.credentials, 'same-origin');
    assert.equal(posts[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(posts[0].body, { kind: 'cookies', granted, policy_version: '2026-06-22', consent_text: BANNER_COPY });
  }
});

test('with the browser client the banner writes the row itself, and asks the route nothing', async () => {
  const rows = [];
  const shapeDb = { client: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u9' } } }) },
    from: () => ({ insert: (row) => { rows.push(row); return Promise.resolve({ error: null }); } }),
  } };
  const { posts, answer } = await bannerPage({ shapeDb });
  answer('Accept');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(posts.length, 0);
  // The row is built in the page's own realm, so it is compared as data.
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [{ user_id: 'u9', kind: 'cookies', granted: true, policy_version: '2026-06-22', source: 'banner', consent_text: BANNER_COPY }]);
});

test('GPC without the browser client: every page asks, and the route keeps it to one receipt an account', async () => {
  const first = await bannerPage({ gpc: true });
  assert.ok(!first.win.document.querySelector('[aria-label="Cookie consent"]'), 'a banner under GPC');
  assert.equal(first.win.localStorage.getItem('shape.consent.v1'), 'reject');
  assert.deepEqual(first.posts.map((p) => p.body), [{ kind: 'gpc_optout', granted: true, policy_version: '2026-06-22', consent_text: GPC_TEXT }]);
  // Nothing is remembered in the page (Codex on #2530): it can't tell whose session it has, so a
  // marker stopped a visitor who signed in later, or a second account, from ever being logged.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(first.win.sessionStorage.length, 0, 'the page kept a marker');
  for (const status of [200, 401, 503]) {
    const next = await bannerPage({ gpc: true, status });
    assert.equal(next.posts.length, 1, 'a page did not ask (' + status + ')');
  }
  assert.doesNotMatch(BANNER, /shape\.gpc\.(?:asked|logged\.route)/);
});
