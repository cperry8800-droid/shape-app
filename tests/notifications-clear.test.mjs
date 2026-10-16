// "Clear all" on the website bell (owner, 2026-10-16: "add a clear all as well so the
// notifications dont linger").
//
// A clear HIDES what the member was shown and deletes nothing: the prep-reminder cron reads 9
// days of meal_prep rows to remind about a meal once, the waiting-list notice reads who was
// told, and the email cooldown counts the last hour's rows. Deleted rows would make each of
// them send again. These tests run the real route against a fake database and the real bell,
// mounted, against a fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformSync } from '@babel/core';
import presetReact from '@babel/preset-react';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

// ── the route ──────────────────────────────────────────────────────────────────────────────
// A query builder that records every call and answers with the next queued result.
function fakeDb(results) {
  const calls = [];
  const db = {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const b = new Proxy({}, {
        get(_, op) {
          if (op === 'then') {
            const r = results.shift() ?? { data: [], error: null };
            return (res, rej) => Promise.resolve(r).then(res, rej);
          }
          return (...args) => { q.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
  return db;
}
const requestUtils = loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), {
  typescript: true, registry: new Map([['next/server', nextServer]]),
});
const loadRoute = async (db) => loadRealModule(join(ROOT, 'src/app/api/notifications/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer],
    ['@/lib/request-utils', await requestUtils],
    ['@/lib/request-auth', { clientForRequest: async () => db, currentUser: async () => ({ id: 'u1' }) }],
  ]),
});
const post = (body) => new Request('https://shape.test/api/notifications', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const MISSING_COLUMN = { code: '42703', message: 'column notifications.cleared_at does not exist' };

test('the feed leaves cleared notifications out, and reads as before until the migration runs', async () => {
  const row = { id: 'n1', type: 'message', title: 'Tom', body: 'hi', route: 'chat', data: {}, read_at: null, created_at: '2026-10-16T21:00:00.123456+00:00' };
  let db = fakeDb([{ data: [row], error: null }]);
  let res = await (await loadRoute(db)).GET(new Request('https://shape.test/api/notifications'));
  assert.equal(res.status, 200);
  assert.deepEqual(db.calls[0].ops.find((o) => o[0] === 'is'), ['is', 'cleared_at', null], 'cleared rows are read');
  assert.equal((await res.json()).notifications.length, 1);

  // No cleared_at column yet: one retry without the filter, and the bell works as it did.
  db = fakeDb([{ data: null, error: MISSING_COLUMN }, { data: [row], error: null }]);
  res = await (await loadRoute(db)).GET(new Request('https://shape.test/api/notifications'));
  assert.equal(res.status, 200);
  assert.equal(db.calls.length, 2);
  assert.ok(!db.calls[1].ops.some((o) => o[0] === 'is'), 'the retry still filters on the missing column');
  assert.equal((await res.json()).notifications.length, 1);

  // Any other failure is still a failed read, not an empty inbox.
  db = fakeDb([{ data: null, error: { code: '57014', message: 'timeout' } }]);
  res = await (await loadRoute(db)).GET(new Request('https://shape.test/api/notifications'));
  assert.equal(res.status, 502);
  assert.equal(db.calls.length, 1);
});

test('a clear stamps cleared_at up to the newest notification shown, exactly as sent, and deletes nothing', async () => {
  const before = '2026-10-16T21:00:00.123456+00:00';
  const db = fakeDb([{ data: null, error: null }]);
  const res = await (await loadRoute(db)).POST(post({ clear: true, before }));
  assert.equal(res.status, 200);
  const ops = db.calls[0].ops;
  assert.equal(db.calls[0].table, 'notifications');
  assert.ok(!ops.some((o) => o[0] === 'delete'), 'a clear deletes rows the senders read as their record');
  const upd = ops.find((o) => o[0] === 'update');
  assert.deepEqual(Object.keys(upd[1]), ['cleared_at'], 'a clear writes only cleared_at');
  assert.ok(Number.isFinite(Date.parse(upd[1].cleared_at)));
  assert.deepEqual(ops.find((o) => o[0] === 'is'), ['is', 'cleared_at', null], 'an earlier clear is re-stamped');
  // Not re-serialised through a JS Date, which would drop the microseconds and leave the newest
  // row out of its own clear.
  assert.deepEqual(ops.find((o) => o[0] === 'lte'), ['lte', 'created_at', before]);
});

test('a clear without a readable `before` is refused, and before the migration it answers 503', async () => {
  for (const bad of [undefined, '', 'yesterday', 42, 'x'.repeat(65)]) {
    const db = fakeDb([]);
    const res = await (await loadRoute(db)).POST(post({ clear: true, before: bad }));
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(db.calls.length, 0, 'nothing is written without a bound');
  }
  for (const error of [MISSING_COLUMN, { code: 'PGRST204', message: "Could not find the 'cleared_at' column" }]) {
    const db = fakeDb([{ data: null, error }]);
    const res = await (await loadRoute(db)).POST(post({ clear: true, before: '2026-10-16T21:00:00Z' }));
    assert.equal(res.status, 503, error.code);
  }
  const db = fakeDb([{ data: null, error: { code: '57014', message: 'timeout' } }]);
  const errLog = console.error; console.error = () => {};
  try {
    assert.equal((await (await loadRoute(db)).POST(post({ clear: true, before: '2026-10-16T21:00:00Z' }))).status, 500);
  } finally { console.error = errLog; }
});

// ── the bell ───────────────────────────────────────────────────────────────────────────────
const SHELL = readFileSync(join(ROOT, 'public/newdesign/pageShell.jsx'), 'utf8');
const REGION = SHELL.slice(SHELL.indexOf('const DASH_INBOX_TEAL'), SHELL.indexOf('function navGroupsFor('));
assert.ok(REGION.includes('function DashInbox(') && REGION.includes('function useDashInboxFeed('), 'the inbox moved');
const { code } = transformSync(REGION, { presets: [[presetReact, { runtime: 'classic' }]], babelrc: false, configFile: false });

const NEWEST = '2026-10-16T21:00:00.123456+00:00';
const ROWS = [
  { id: 'n2', type: 'message', title: 'Tom replied', body: 'see you at 6', route: null, data: {}, read: false, createdAt: NEWEST },
  { id: 'n1', type: 'session_booked', title: 'Session booked', body: '', route: null, data: {}, read: true, createdAt: '2026-10-15T09:00:00Z' },
];

async function mountBell(fetchImpl) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/ClientApp.html' });
  const saved = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const api = new Function('React', 'window', 'document', 'fetch', 'dashShellHref',
    code + '\nreturn { useDashInboxFeed, DashInbox };')(React, dom.window, dom.window.document, fetchImpl, (h) => h);
  function Bell() {
    const inbox = api.useDashInboxFeed(true);
    return React.createElement(api.DashInbox, { signedIn: true, role: 'client', roles: ['client'], inbox });
  }
  const host = dom.window.document.getElementById('root');
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(Bell)); });
  const buttons = () => [...host.querySelectorAll('button')];
  const button = (text) => buttons().find((b) => b.textContent === text);
  const click = async (el) => { assert.ok(el, 'no such button'); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
  const done = async () => {
    await act(async () => { root.unmount(); });
    globalThis.window = saved.window; globalThis.document = saved.document; globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act;
  };
  return { host, buttons, button, click, done, bell: () => buttons()[0] };
}
const json = (body, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

test('Clear all asks once, then hides every notification shown, up to the newest one exactly', async () => {
  const posts = [], reads = [];
  const fetchImpl = (url, init) => {
    if (init && init.method === 'POST') { posts.push(JSON.parse(init.body)); return json({ ok: true }); }
    reads.push(url);
    return json({ notifications: ROWS, unread: 1 });
  };
  const b = await mountBell(fetchImpl);
  try {
    assert.equal(b.bell().getAttribute('aria-label'), '1 unread notifications');
    await b.click(b.bell());
    assert.ok(reads.length >= 2 && reads.every((u) => u === '/api/notifications?surface=web'),
      'the bell reads the full feed, phone-only reminders included: ' + reads.join(', '));
    assert.ok(b.button('Mark all read'));
    await b.click(b.button('Clear all'));
    assert.equal(posts.length, 0, 'Clear all wrote before it was confirmed');
    assert.ok(b.host.textContent.includes('Clear all?'));
    await b.click(b.button('Cancel'));
    assert.equal(posts.length, 0);
    assert.ok(b.host.textContent.includes('Tom replied'), 'Cancel cleared the list');

    await b.click(b.button('Clear all'));
    await b.click(b.button('Yes'));
    assert.deepEqual(posts, [{ clear: true, before: NEWEST, surface: 'web' }], 'the bound is the newest row, as the server sent it');
    assert.ok(b.host.textContent.includes('Nothing new.'));
    assert.ok(!b.host.textContent.includes('Tom replied'));
    assert.equal(b.bell().getAttribute('aria-label'), 'Notifications', 'the badge outlived the clear');
    assert.equal(b.button('Clear all'), undefined, 'Clear all is offered on an empty list');
  } finally { await b.done(); }
});

test('a clear that fails brings the list back and says so', async () => {
  const fetchImpl = (url, init) => (init && init.method === 'POST' ? json({ error: 'not yet' }, 503) : json({ notifications: ROWS, unread: 1 }));
  const b = await mountBell(fetchImpl);
  try {
    await b.click(b.bell());
    await b.click(b.button('Clear all'));
    await b.click(b.button('Yes'));
    assert.ok(b.host.textContent.includes('Tom replied'), 'the rows were not restored');
    assert.ok(b.host.textContent.includes("Couldn't clear your notifications. Try again."));
    assert.equal(b.bell().getAttribute('aria-label'), '1 unread notifications');
    // Closed and opened again, the panel reads afresh and the old failure is not shown.
    await b.click(b.bell());
    await b.click(b.bell());
    assert.ok(!b.host.textContent.includes("Couldn't clear"), 'a fresh read still shows the old failure');
  } finally { await b.done(); }
});

test("the website's Mark all read leaves phone-only notifications to the app", async () => {
  const posts = [];
  const fetchImpl = (url, init) => {
    if (init && init.method === 'POST') { posts.push(JSON.parse(init.body)); return json({ ok: true }); }
    return json({ notifications: ROWS, unread: 1 });
  };
  const b = await mountBell(fetchImpl);
  try {
    await b.click(b.bell());
    await b.click(b.button('Mark all read'));
    assert.deepEqual(posts, [{ all: true, surface: 'web' }]);
  } finally { await b.done(); }
});

test('a read still in flight when the member clears does not paint the cleared rows back', async () => {
  const pending = [];
  let reads = 0;
  const fetchImpl = (url, init) => {
    if (init && init.method === 'POST') return json({ ok: true });
    reads++;
    // The first read answers; the refresh that opening the panel starts is held.
    if (reads === 1) return json({ notifications: ROWS, unread: 1 });
    return new Promise((resolve) => pending.push(resolve));
  };
  const b = await mountBell(fetchImpl);
  try {
    await b.click(b.bell());
    assert.equal(pending.length, 1, 'opening the panel did not refresh');
    await b.click(b.button('Clear all'));
    await b.click(b.button('Yes'));
    await act(async () => { pending[0]({ ok: true, status: 200, json: async () => ({ notifications: ROWS, unread: 1 }) }); });
    assert.ok(b.host.textContent.includes('Nothing new.'), 'the stale read repainted the cleared rows');
  } finally { await b.done(); }
});

test('the migration adds the column and proves the update policy a clear relies on', () => {
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-10-16-notifications-clear.sql'), 'utf8');
  assert.match(sql, /alter table public\.notifications add column if not exists cleared_at timestamptz;/);
  assert.match(sql, /where cleared_at is null;/);
  assert.match(sql, /policyname = 'notifications_update_own' and cmd = 'UPDATE'/);
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
  assert.ok(!/\bdelete\b/i.test(sql.replace(/--[^\n]*/g, '')), 'the migration deletes');
});
