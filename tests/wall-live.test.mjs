// tests/wall-live.test.mjs
//
// The Wall's Training now (owner, 2026-10-22, off the Wall mockup: "do photos and training now
// first"). Who is training right now opens the Wall: three at most, each with their live set when its
// row is readable, and a boost. The cards are mounted on jsdom with the real English catalog behind
// the real ICU translator, and the live row is read as the live boost sheet reads it (useBSLiveRow):
// a realtime event wins over a first read that lands after it, and an expired row is absence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const LIVE = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSWallLive.jsx'), { registry: new Map([['react', React]]) });

const appRequire = createRequire(join(ROOT, 'mobile-app/package.json'));
const i18next = appRequire('i18next');
const ICU = appRequire('i18next-icu');
const i18n = i18next.createInstance();
await i18n.use(ICU.default || ICU).init({
  lng: 'en', fallbackLng: 'en', ns: ['feed'], defaultNS: 'feed', keySeparator: false,
  interpolation: { escapeValue: false },
  resources: { en: { feed: JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/feed.json'), 'utf8')) } },
});
dom.window.ShapeI18n = { t: (key, opts) => i18n.t(key, opts) };
dom.window.useBS = () => ({ MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', RULE: '#ccc', HAIR: '#ddd', RUST: '#9a3b1b', padX: 18, isLight: true });

const PAYLOAD = { v: 1, exercises: [{ n: 'Back squat', done: 2, total: 5 }, { n: 'RDL', done: 0, total: 3 }], curIdx: 0, resting: false, setsDone: 2, setsTotal: 8 };
const soon = () => new Date(Date.now() + 10 * 60000).toISOString();

// window.ShapeLiveProgress / ShapePresence for one test: rows by user id, and a hand on the realtime feed.
function env({ rows = {}, started = {}, slowGet = false } = {}) {
  const subs = {};
  const pending = [];
  dom.window.ShapeLiveProgress = {
    get: (uid) => new Promise((resolve) => { const go = () => resolve(rows[uid] || null); if (slowGet) pending.push(go); else go(); }),
    subscribe: (uid, cb) => { subs[uid] = cb; return () => { delete subs[uid]; }; },
  };
  dom.window.ShapePresence = { activityDetail: async (uid) => (started[uid] ? { kind: 'workout', startedAt: started[uid] } : null) };
  return { subs, releaseGets: () => pending.splice(0).forEach((go) => go()) };
}

async function mount(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await React.act(async () => { root.render(React.createElement(LIVE.BSWallTrainingNow, props)); });
  await flush();
  return {
    host, flush,
    text: () => host.textContent,
    unmount: async () => { await React.act(async () => { root.unmount(); }); host.remove(); },
  };
}

test('nobody training: nothing drawn; cooking is not training, and three at most show', async () => {
  env();
  let m = await mount({ people: [{ name: 'Sofia Park', activity: 'cooking', userId: 'u0' }] });
  try { assert.ok(!m.host.querySelector('[data-bs-wall-live]'), 'nobody training drew a section'); } finally { await m.unmount(); }
  m = await mount({ people: ['a', 'b', 'c', 'd'].map((x, i) => ({ name: `Member ${x}`, activity: 'workout', userId: `u${i}` })) });
  try {
    assert.equal(m.host.querySelectorAll('[data-bs-wall-live-card]').length, 3);
    assert.match(m.text(), /^Training now/);
  } finally { await m.unmount(); }
});

test('a readable live row shows the move, the set and the sets so far; the card boosts and opens the profile', async () => {
  env({ rows: { u1: { payload: PAYLOAD, expires_at: soon() } }, started: { u1: new Date(Date.now() - 12 * 60000).toISOString() } });
  const boosted = []; const opened = [];
  const devon = { name: 'Devon Wells', activity: 'workout', userId: 'u1' };
  const m = await mount({ people: [devon], onBoost: (p) => boosted.push(p), onOpenProfile: (p) => opened.push(p), avatar: () => React.createElement('span', { 'data-avatar': '' }) });
  try {
    assert.match(m.text(), /Devon is training/);
    assert.match(m.text(), /12 min in/);
    assert.match(m.text(), /Back squatset 3 of 5/);
    assert.match(m.text(), /2\/8 sets/);
    assert.ok(m.host.querySelector('[data-avatar]'), 'the client\'s avatar is drawn');
    await React.act(async () => { m.host.querySelector('[data-bs-wall-live-boost]').click(); });
    await React.act(async () => { m.host.querySelector('[data-bs-wall-live-card] button').click(); });
    assert.deepEqual(boosted, [devon]);
    assert.deepEqual(opened, [devon]);
  } finally { await m.unmount(); }
});

test('an expired row, a cooking row or no row says nothing about a set', async () => {
  env({ rows: {
    u1: { payload: PAYLOAD, expires_at: new Date(Date.now() - 1000).toISOString() },
    u2: { payload: { v: 1, kind: 'cooking', title: 'Chicken bowl' }, expires_at: soon() },
  } });
  const m = await mount({ people: [{ name: 'A One', activity: 'workout', userId: 'u1' }, { name: 'B Two', activity: 'workout', userId: 'u2' }, { name: 'C Three', activity: 'workout', userId: 'u3' }] });
  try {
    assert.equal(m.host.querySelectorAll('[data-bs-wall-live-set]').length, 0);
    assert.doesNotMatch(m.text(), /Back squat|Chicken bowl/);
    assert.equal(m.host.querySelectorAll('[data-bs-wall-live-boost]').length, 3, 'each can still be boosted');
  } finally { await m.unmount(); }
});

test('a realtime event wins over a first read that lands after it', async () => {
  const e = env({ rows: { u1: { payload: PAYLOAD, expires_at: soon() } }, slowGet: true });
  const m = await mount({ people: [{ name: 'Devon Wells', activity: 'workout', userId: 'u1' }] });
  try {
    // The session ends (a DELETE arrives as null) before the first read answers with the old row.
    await React.act(async () => { e.subs.u1(null); });
    await React.act(async () => { e.releaseGets(); });
    await m.flush();
    assert.ok(!m.host.querySelector('[data-bs-wall-live-set]'), 'the stale first read brought the ended set back');
  } finally { await m.unmount(); }
});

test('the signed-out preview shows its one sample set on the first card only; demo people read nothing', async () => {
  let reads = 0;
  env();
  const get = dom.window.ShapeLiveProgress.get;
  dom.window.ShapeLiveProgress.get = (uid) => { reads += 1; return get(uid); };
  const m = await mount({ demo: true, people: [{ name: 'Priya Shah', activity: 'workout' }, { name: 'Casey Morgan', activity: 'workout' }] });
  try {
    assert.equal(m.host.querySelectorAll('[data-bs-wall-live-set]').length, 1);
    assert.match(m.text(), /Bench pressset 4 of 5/);
    assert.match(m.text(), /Resting/);
    assert.equal(reads, 0, 'a demo person has no id to read');
  } finally { await m.unmount(); }
});
