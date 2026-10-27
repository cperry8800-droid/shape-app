// At capacity, a coach takes no NEW clients; a current client keeps booking and buying, and a member
// the coach invited off the list books an intro either way (task #10; Codex on #2375, second round).
//
// Owner, 2026-10-15: "make sure their at capacity toggle works and is routed properly, which
// basically makes it so they cant add new clients, but clients can still be added to waitlist".
// The checkout and /purchase already let a current client buy; every storefront still showed them
// "Join the waiting list", which the coach cannot invite them off. /api/waitlist/mine now names the
// coaches the caller subscribes to, and the storefronts read it. The website profile is mounted and
// driven here; the intro calendar's invite check is lifted and run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const nextServer = require('next/server');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/MemberProfile.html?role=trainer' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');

// ── The route ────────────────────────────────────────────────────────────────────────────────
async function mine({ subs = [], subsError = null, user = { id: 'member-1' } } = {}) {
  const reads = [];
  const supabase = {
    rpc: async (fn) => { reads.push(['rpc', fn]); return { data: [{ id: 'w1', provider_role: 'trainer', provider_id: 9, status: 'waiting', queue_position: 2 }], error: null }; },
    from: (table) => {
      const q = { filters: [] };
      const chain = {
        select: (cols) => { q.cols = cols; return chain; },
        eq: (k, v) => { q.filters.push(['eq', k, v]); return chain; },
        in: (k, v) => { q.filters.push(['in', k, v]); return chain; },
        limit: (n) => { q.limit = n; return chain; },
        then: (res, rej) => { reads.push([table, q]); return Promise.resolve({ data: subsError ? null : subs, error: subsError }).then(res, rej); },
      };
      return chain;
    },
  };
  const route = await loadRealModule(join(ROOT, 'src/app/api/waitlist/mine/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/membership-core', { ACTIVE_SUB: new Set(['active', 'trialing', 'past_due']) }], ['@/lib/waitlist', { resolveRequestClient: async () => (user ? { user, supabase } : null) }]]),
  });
  const errLog = console.error; console.error = () => {};
  try {
    const res = await route.GET(new Request('https://shape.test/api/waitlist/mine'));
    return { status: res.status, body: await res.json(), reads };
  } finally { console.error = errLog; }
}

test('/api/waitlist/mine names the coaches the caller already subscribes to, under their own RLS', async () => {
  const r = await mine({ subs: [{ provider_role: 'trainer', provider_id: 7 }, { provider_role: 'nutritionist', provider_id: 3 }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.clientOf, [{ providerRole: 'trainer', providerId: 7 }, { providerRole: 'nutritionist', providerId: 3 }]);
  assert.equal(r.body.entries[0].id, 'w1', 'the waiting list itself is unchanged');
  const [, q] = r.reads.find(([t]) => t === 'subscriptions');
  assert.equal(q.cols, 'provider_role, provider_id');
  assert.deepEqual(q.filters, [['eq', 'client_id', 'member-1'], ['in', 'status', ['active', 'trialing', 'past_due']]], 'the same read as isActiveClientOf, past due included (Codex on #2375)');
  // A failed read is unknown, never "a client of nobody".
  const failed = await mine({ subsError: { message: 'down' } });
  assert.equal(failed.status, 200);
  assert.equal(failed.body.clientOf, null);
  assert.equal(failed.body.entries.length, 1);
  assert.equal((await mine({ user: null })).status, 401);
});

// ── The website profile, mounted ──────────────────────────────────────────────────────────────
let Blocks = null;
async function profile({ answer, entries = [] }) {
  globalThis.React = React;
  const q = (data) => { const o = { select: () => o, eq: () => o, in: () => o, order: () => o, limit: () => o, maybeSingle: async () => ({ data, error: null }), then: (r) => Promise.resolve({ data: [], error: null }).then(r) }; return o; };
  window.shapeDb = {
    getUser: async () => ({ id: 'member-1' }),
    client: {
      from: (t) => q(t === 'trainers' ? { id: 7, name: 'Tom Trainer', at_capacity: true, capacity_resume_at: null } : null),
      rpc: async () => ({ data: [], error: null }),
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    },
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/waitlist/mine')) {
      if (answer === 'pending') return new Promise(() => {});
      if (answer === 'down') return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ entries, ...answer }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  if (!Blocks) ({ Blocks } = await loadRealModule(join(ROOT, 'public/newdesign/livingShared.jsx'), { appendExports: 'exports.Blocks=LvCoachBlocks;' }));
  const root = createRoot(document.getElementById('root'));
  const d = { uid: 'coach-1', name: 'Tom Trainer', role: 'trainer', offerings: [], reviews: [], certs: [] };
  await React.act(async () => root.render(React.createElement(Blocks, { d, view: 'coaching' })));
  await React.act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  const text = document.getElementById('root').textContent;
  const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent);
  const clientNote = !!document.querySelector('[data-client-at-capacity]');
  await React.act(async () => root.unmount());
  return { text, buttons, clientNote };
}

test('website: a current client at capacity is told so and offered no waiting list', async () => {
  const p = await profile({ answer: { clientOf: [{ providerRole: 'trainer', providerId: 7 }] } });
  assert.match(p.text, /You’re Tom’s client/);
  assert.match(p.text, /anything Tom sells on this page is still yours to buy/);
  assert.equal(p.clientNote, true, 'the Message button');
  assert.ok(!p.buttons.includes('Join the waiting list'), p.buttons.join(' | '));
});

test('website: anyone else, or a list we could not read, still meets the waiting list', async () => {
  for (const [label, answer] of [
    ['a client of another coach', { clientOf: [{ providerRole: 'nutritionist', providerId: 7 }, { providerRole: 'trainer', providerId: 8 }] }],
    ['a client of nobody', { clientOf: [] }],
    ['the subscriptions read failed', { clientOf: null }],
    ['a server without the field', {}],
    ['the list could not be read', 'down'],
  ]) {
    const p = await profile({ answer });
    assert.ok(p.buttons.includes('Join the waiting list'), label + ': ' + p.buttons.join(' | '));
    assert.doesNotMatch(p.text, /Tom’s client/, label);
  }
});

test('website: before the list answers, a signed-in member is shown neither Join nor the client note', async () => {
  const p = await profile({ answer: 'pending' });
  assert.ok(!p.buttons.includes('Join the waiting list'), p.buttons.join(' | '));
  assert.doesNotMatch(p.text, /Tom’s client/);
  assert.match(p.text, /isn’t taking new clients right now/, 'the line that is true in every state stays');
});

test('website: a waiting-list entry still shows itself, so its member can leave the list', async () => {
  const p = await profile({ answer: { clientOf: [{ providerRole: 'trainer', providerId: 7 }] }, entries: [{ id: 'w1', providerRole: 'trainer', providerId: 7, status: 'waiting', position: 2 }] });
  assert.ok(p.buttons.includes('Leave the list'), p.buttons.join(' | '));
});

// ── The app ──────────────────────────────────────────────────────────────────────────────────
test('app listing: a current client sees their way to buy, never Join, and Join waits for the read', () => {
  const src = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  assert.match(src, /setWl\(null\); setClientOf\(undefined\);\n    if \(!atCapacity \|\| !capProviderId \|\| !bsmAuthUid \|\| !window\.ShapeWaitlist\?\.mine\) \{ setClientOf\(null\); return undefined; \}/, 'cleared with the entry; a read that cannot run is unknown, so Join shows');
  assert.match(src, /if \(on\) setClientOf\(Array\.isArray\(r && r\.clientOf\) \? r\.clientOf\.some\(\(c\) => c && String\(c\.providerId\) === String\(capProviderId\) && c\.providerRole === saleProviderRole\) : null\);/);
  assert.match(src, /\} catch \(e\) \{ if \(on\) setClientOf\(null\); \}/, 'a failed read falls back to the waiting list');
  assert.match(src, /<\/>\) : clientOf === true \? \(<>\s*\{\/\*[^*]*\*\/\}\s*<div data-client-at-capacity=""/, 'after the invite and the entry, before Join');
  assert.match(src, /\{bsmAuthUid && clientOf === undefined \? null : <button onClick=\{wlJoin\}/);
});

test('app profile: a current client gets Book now, and the waiting list only for everyone else', () => {
  const src = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  // The profile's storefront is the shared hook and block (useBSCoachCommerce, BSCoachCoachingBlock), which
  // the trainer profile runs too (2026-10-27).
  const prof = src.slice(src.indexOf('function useBSCoachCommerce('), src.indexOf('function BSSignalCoachProfile('));
  // Keyed on the account, cleared before the bail (Codex on #2375): a switch never inherits the last answer.
  assert.match(prof, /React\.useEffect\(\(\) => \{\n    setWl\(null\); setClientOf\(undefined\);\n    if \(isSelf \|\| !atCapacity \|\| !capacityProviderId\) \{ setClientOf\(null\); return undefined; \}/);
  assert.match(prof, /\}, \[isSelf, atCapacity, capacityProviderId, capacityProviderRole, wlAuthUid\]\);/);
  assert.match(prof, /const wlAuthUid = \(typeof window !== 'undefined' && window\.ShapeAuth\?\.getCachedState\?\.\(\)\?\.user\?\.id\) \|\| null;/);
  assert.match(prof, /setClientOf\(Array\.isArray\(r\?\.clientOf\) \? r\.clientOf\.some\(\(cl\) => cl && String\(cl\.providerId\) === String\(capacityProviderId\) && cl\.providerRole === capacityProviderRole\) : null\);/);
  const block = (from) => { const i = prof.indexOf(from); assert.ok(i > 0, from); return prof.slice(i, prof.indexOf('\n          )}', i)); };
  const client = block('{!isSelf && atCapacity && !wl && clientOf === true && (');
  assert.match(client, /<button onClick=\{doBookOneTime\}/, 'the one-time purchase the server lets a current client make');
  assert.doesNotMatch(client, /wlJoin/);
  const join = block('{!isSelf && atCapacity && !wl && clientOf !== true && (');
  assert.match(join, /\{clientOf === undefined \? null : <button onClick=\{wlJoin\}/);
});

test('the app\'s new lines are translated in every language', () => {
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const prof = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/profile.json`));
    const mkt = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/marketplace.json`));
    for (const [cat, k] of [[prof, 'coach.yourClientTitle'], [prof, 'coach.yourClientBody'], [mkt, 'listing.yourClientTitle'], [mkt, 'listing.yourClientBody']]) {
      assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${loc}: ${k}`);
      assert.match(cat[k], /\{name\}/, `${loc}: ${k} names the coach`);
    }
  }
});

// ── The intro calendar ───────────────────────────────────────────────────────────────────────
test('the intro calendar opens to a member the coach invited, as /api/consultation does', async () => {
  const html = read('public/newdesign/consultation.html');
  assert.match(html, /introsClosed = data\.atCapacity === true && !\(data\.rules && data\.rules\.introsAtCapacity === true\);\n[\s\S]{0,600}if \(introsClosed && await consultInvited\(\)\) introsClosed = false;\n        if \(seq !== availSeq\) return;/);
  const at = html.indexOf('async function consultInvited() {');
  const body = html.slice(at, html.indexOf('\n    }\n', at) + 6);
  const run = (answer, { proType = 'trainer', proId = 7 } = {}) => new Function('fetch', 'proType', 'proId', body + '\nreturn consultInvited();')(
    async (url, init) => { assert.equal(url, '/api/waitlist/mine'); assert.equal(init.credentials, 'same-origin'); if (answer instanceof Error) throw answer; return answer; },
    proType, proId,
  );
  const ok = (entries) => ({ ok: true, json: async () => ({ entries }) });
  assert.equal(await run(ok([{ status: 'invited', providerRole: 'trainer', providerId: 7 }])), true);
  assert.equal(await run(ok([{ status: 'waiting', providerRole: 'trainer', providerId: 7 }])), false, 'waiting is not invited');
  assert.equal(await run(ok([{ status: 'invited', providerRole: 'nutritionist', providerId: 7 }])), false, 'the other role');
  assert.equal(await run(ok([{ status: 'invited', providerRole: 'trainer', providerId: 8 }])), false, 'another coach');
  assert.equal(await run({ ok: false, json: async () => ({}) }), false, 'signed out');
  assert.equal(await run(new Error('offline')), false);
});
