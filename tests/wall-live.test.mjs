// tests/wall-live.test.mjs
//
// The Wall's live story (owner, 2026-10-22, off the Wall mockup: "do photos and training now first";
// drawn as the magazine's live story since 2026-10-23, "use oswald"). Who is training right now opens
// the Wall: the first as a headline with their live set when its row is readable and a boost, the
// next three named on one line, each a door to their own boost. The cards are mounted on jsdom with the real English catalog behind
// the real ICU translator, and the live row is read as the live boost sheet reads it (useBSLiveRow):
// a realtime event wins over a first read that lands after it, and an expired row is absence.
import test, { mock } from 'node:test';
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
dom.window.useBS = () => ({ MONO: 'mono', DISPLAY: 'display', HEADLINE: 'oswald', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', RULE: '#ccc', HAIR: '#ddd', RUST: '#9a3b1b', padX: 18, isLight: true });

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

test('nobody training: nothing drawn; cooking is not training; one leads and three more are named', async () => {
  env();
  let m = await mount({ people: [{ name: 'Sofia Park', activity: 'cooking', userId: 'u0' }] });
  try { assert.ok(!m.host.querySelector('[data-bs-wall-live]'), 'nobody training drew a section'); } finally { await m.unmount(); }
  const people = ['Ana Lee', 'Ben Ode', 'Cy Ray', 'Dee Fox', 'Eve Kim'].map((name, i) => ({ name, activity: 'workout', userId: `u${i}` }));
  const boosted = [];
  m = await mount({ people, onBoost: (p) => boosted.push(p.name) });
  try {
    assert.equal(m.host.querySelectorAll('[data-bs-wall-live-card]').length, 1, 'one story');
    assert.match(m.text(), /^Live now/);
    assert.match(m.text(), /Ana is training/);
    const also = m.host.querySelector('[data-bs-wall-live-also]');
    assert.ok(also, 'the others are named under the story');
    assert.equal(also.textContent, 'Also training:Ben,Cy,Dee', 'three more at most');
    for (const b of also.querySelectorAll('button')) await React.act(async () => { b.click(); });
    assert.deepEqual(boosted, ['Ben Ode', 'Cy Ray', 'Dee Fox'], 'each name opens their own boost');
  } finally { await m.unmount(); }
});

test('a readable live row is the headline: the set under way, a segment per set, the sets so far; it boosts and opens the profile', async () => {
  env({ rows: { u1: { payload: PAYLOAD, expires_at: soon() } }, started: { u1: new Date(Date.now() - 12 * 60000).toISOString() } });
  const boosted = []; const opened = [];
  const devon = { name: 'Devon Wells', activity: 'workout', userId: 'u1' };
  const m = await mount({ people: [devon], onBoost: (p) => boosted.push(p), onOpenProfile: (p) => opened.push(p), avatar: () => React.createElement('span', { 'data-avatar': '' }) });
  try {
    const h = m.host.querySelector('h3');
    assert.equal(h.textContent, 'Devon is on set 3 of 5', 'two of five done: the third is under way');
    assert.equal(h.style.fontFamily, 'oswald', 'the headline is the theme\'s headline face');
    assert.equal(h.style.textTransform, 'uppercase');
    assert.match(m.text(), /Live now· 12 min in/);
    assert.match(m.text(), /Devon Wells · Back squat/);
    assert.match(m.text(), /2\/8 sets/);
    const segs = [...m.host.querySelectorAll('[data-seg]')].map((n) => n.getAttribute('data-seg'));
    assert.deepEqual(segs, ['done', 'done', 'now', 'left', 'left']);
    assert.ok(m.host.querySelector('[data-avatar]'), 'the client\'s avatar is drawn');
    assert.equal(m.host.querySelector('[data-bs-wall-live-boost]').textContent, 'Send a boost →');
    await React.act(async () => { m.host.querySelector('[data-bs-wall-live-boost]').click(); });
    await React.act(async () => { m.host.querySelector('[data-bs-wall-live-card] button').click(); });
    assert.deepEqual(boosted, [devon]);
    assert.deepEqual(opened, [devon]);
  } finally { await m.unmount(); }
});

test('the set bar: a segment per set, the one under way, and no more than twelve', () => {
  assert.deepEqual(LIVE.bsWallSetSegments(2, 5), ['done', 'done', 'now', 'left', 'left']);
  assert.deepEqual(LIVE.bsWallSetSegments(5, 5), ['done', 'done', 'done', 'done', 'done']);
  assert.deepEqual(LIVE.bsWallSetSegments(0, 0), []);
  const long = LIVE.bsWallSetSegments(10, 20);
  assert.equal(long.length, 12);
  assert.equal(long.filter((k) => k === 'done').length, 6, 'filled in proportion');
  assert.equal(long[6], 'now');
});

test('"N min in" keeps counting while the card stays on the Wall', async () => {
  // The card stays mounted through the rail's refreshes, so the minutes must move on their own (review: Codex).
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.parse('2026-10-23T08:00:00Z') });
  try {
    env({ started: { u1: new Date(Date.now() - 12 * 60000).toISOString() } });
    const m = await mount({ people: [{ name: 'Devon Wells', activity: 'workout', userId: 'u1' }] });
    try {
      assert.match(m.text(), /12 min in/);
      await React.act(async () => { mock.timers.tick(3 * 60000); });
      assert.match(m.text(), /15 min in/);
      await React.act(async () => { mock.timers.tick(6 * 60 * 60000); });
      assert.doesNotMatch(m.text(), /min in/, 'past six hours the line goes, as on arrival');
    } finally { await m.unmount(); }
  } finally { mock.timers.reset(); }
});

test('an expired row, a cooking row or no row says nothing about a set', async () => {
  env({ rows: {
    u1: { payload: PAYLOAD, expires_at: new Date(Date.now() - 1000).toISOString() },
    u2: { payload: { v: 1, kind: 'cooking', title: 'Chicken bowl' }, expires_at: soon() },
  } });
  for (const lead of [{ name: 'A One', userId: 'u1' }, { name: 'B Two', userId: 'u2' }, { name: 'C Three', userId: 'u3' }]) {
    const m = await mount({ people: [{ ...lead, activity: 'workout' }] });
    try {
      assert.ok(!m.host.querySelector('[data-bs-wall-live-set]'), `${lead.name}: a set was drawn`);
      assert.doesNotMatch(m.text(), /Back squat|Chicken bowl/);
      assert.equal(m.host.querySelector('h3').textContent, `${lead.name.split(' ')[0]} is training`);
      assert.ok(m.host.querySelector('[data-bs-wall-live-boost]'), 'they can still be boosted');
    } finally { await m.unmount(); }
  }
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

test('the signed-out preview shows its one sample set on the lead; demo people read nothing', async () => {
  let reads = 0;
  env();
  const get = dom.window.ShapeLiveProgress.get;
  dom.window.ShapeLiveProgress.get = (uid) => { reads += 1; return get(uid); };
  const m = await mount({ demo: true, people: [{ name: 'Priya Shah', activity: 'workout' }, { name: 'Casey Morgan', activity: 'workout' }] });
  try {
    assert.equal(m.host.querySelectorAll('[data-bs-wall-live-set]').length, 1);
    assert.equal(m.host.querySelector('h3').textContent, 'Priya is on set 4 of 5');
    assert.match(m.text(), /Priya Shah · Bench press/);
    assert.match(m.text(), /31 min in/);
    assert.match(m.text(), /Resting/);
    assert.equal(m.host.querySelector('[data-bs-wall-live-also]').textContent, 'Also training:Casey');
    assert.equal(reads, 0, 'a demo person has no id to read');
  } finally { await m.unmount(); }
});
