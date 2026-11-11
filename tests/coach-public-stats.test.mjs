// A coach's public stats (owner, 2026-11-09: "Yes I want that data but coaches should be able to decide
// what they want public"). The data side: the coach's choice in their profile doc (publicStats), its
// cleaner, the two new headline stat keys, the read both surfaces call (coachPublicStats.mjs over
// get_coach_public_stats), and Make it yours → Spotlight → What's public, MOUNTED in the real broadsheet
// chrome against scripted profile and review backends, reading the real English catalogs (a key missing
// from them fails here). The SQL itself is exercised in tests/coach-public-stats-sql.test.mjs.
//
// What it pins: nothing is public until the coach turns it on; the doc keeps only the four keys, in
// order, and drops the list when it is emptied; a figure the coach keeps private, a failed read and a
// row with nothing in it are null (unread), while a figure made public with nothing to count is 0
// (measured); a headline stat of sessions or clients with no public figure shows nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { BS_PUBLIC_STATS, bsProfilePublicStats, bsNormalizeProfileCustom } from '../mobile-app/src/services/profileCustom.mjs';
import { BS_COACH_STATS, bsCoachStatFigures, bsCoachHeadline, bsCoachHeadlineKeys } from '../mobile-app/src/services/coachWork.mjs';
import * as PS from '../mobile-app/src/services/coachPublicStats.mjs';
import * as PSC from '../public/newdesign/coachPublicStats.mjs';
import * as KIT from '../public/newdesign/coachProfileKit.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const P1 = '0b5a6c1e-1111-4111-8111-111111111111';
const P2 = '0b5a6c1e-2222-4222-8222-222222222222';
const OWNER = '9d3c1f00-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// ── The coach's choice ──────────────────────────────────────────────────────────────────────
test('publicStats: the four keys, in their order, each once; anything else is nothing public', () => {
  assert.deepEqual(BS_PUBLIC_STATS, ['sessions', 'clients', 'since', 'programClients']);
  assert.ok(Object.isFrozen(BS_PUBLIC_STATS));
  assert.deepEqual(bsProfilePublicStats(['since', 'sessions', 'since', 'score', 7, null, 'programClients']), ['sessions', 'since', 'programClients'], 'kept in their own order, each once, unknown keys dropped');
  assert.deepEqual(bsProfilePublicStats(['clients']), ['clients']);
  for (const junk of [undefined, null, 'sessions', { sessions: true }, 42, true]) assert.deepEqual(bsProfilePublicStats(junk), [], String(junk));
  assert.deepEqual(bsProfilePublicStats(['SESSIONS', ' clients']), [], 'a key is exact');
  // A crafted doc's long list: only its first sixteen entries are looked at (the SQL reads as many).
  assert.deepEqual(bsProfilePublicStats([...Array(16).fill('x'), 'sessions']), [], 'past the scan, not read');
  assert.deepEqual(bsProfilePublicStats([...Array(15).fill('x'), 'sessions']), ['sessions']);

  // The doc's normalizer: cleaned in place; emptied drops the key; a doc without it keeps none.
  assert.deepEqual(bsNormalizeProfileCustom({ publicStats: ['since', 'bogus', 'sessions'], bio: 'kept' }, 'u1'), { publicStats: ['sessions', 'since'], bio: 'kept' });
  assert.deepEqual(bsNormalizeProfileCustom({ publicStats: ['bogus'], bio: 'kept' }, 'u1'), { bio: 'kept' }, 'nothing public is no key');
  assert.deepEqual(bsNormalizeProfileCustom({ publicStats: 'sessions' }, 'u1'), {});
  assert.ok(!('publicStats' in bsNormalizeProfileCustom({ bio: 'x' }, 'u1')), 'the default is none');
});

// ── The headline stat keys ──────────────────────────────────────────────────────────────────
test('sessions and clients are headline stats for both roles, shown only with a public figure', () => {
  for (const role of ['trainer', 'nutritionist']) {
    assert.ok(BS_COACH_STATS[role].includes('sessions') && BS_COACH_STATS[role].includes('clients'), role);
    assert.deepEqual(bsCoachHeadlineKeys(['sessions', 'clients', 'rating'], role), ['sessions', 'clients', 'rating'], role);
  }
  assert.deepEqual(bsCoachStatFigures({ sessions: 140, clients: 12 }), { sessions: 140, clients: 12 });
  // null (private or unread) and 0 (public, nothing yet) are both absent from the headline: a figure of none.
  assert.deepEqual(bsCoachStatFigures({ sessions: null, clients: 0 }), {});
  assert.deepEqual(bsCoachStatFigures({}), {}, 'not passed is not public');
  const figs = bsCoachStatFigures({ reviews: { avg: 9.2, count: 5 }, sessions: 140, clients: null });
  assert.deepEqual(bsCoachHeadline(['clients', 'sessions', 'rating'], 'trainer', figs), [{ key: 'sessions', value: 140 }, { key: 'rating', value: 9.2 }], 'a picked key the coach keeps private shows nothing');
  assert.deepEqual(bsCoachHeadline(['sessions'], 'nutritionist', bsCoachStatFigures({ sessions: 3 })), [{ key: 'sessions', value: 3 }]);
});

// ── The read ────────────────────────────────────────────────────────────────────────────────
test('the read: null is private or unread, 0 is measured, and a failure is an error, never figures', async () => {
  const NONE = { sessions: null, clients: null, since: null, programClients: null };
  assert.equal(PS.bsCoachPublicStatsRead, PSC.bsCoachPublicStatsRead, 'the app reads the canonical module');
  assert.match(read('mobile-app/src/services/coachPublicStats.mjs'), /export \* from '\.\.\/\.\.\/\.\.\/public\/newdesign\/coachPublicStats\.mjs'/);
  assert.equal(KIT.bsCoachPublicStatsRead, PSC.bsCoachPublicStatsRead, 'the website reads it through the kit');
  assert.equal(KIT.bsProfilePublicStats, bsProfilePublicStats);

  // A row: the figures as the function returned them.
  assert.deepEqual(PS.bsCoachPublicStatsFromRow([{ sessions_coached: 140, active_clients: 12, coaching_since: 2024, program_clients: { [P1]: 3, [P2]: 0 } }]),
    { state: 'ready', sessions: 140, clients: 12, since: 2024, programClients: { [P1]: 3, [P2]: 0 } });
  // Nothing public: a row of nulls is ready, with every figure null.
  assert.deepEqual(PS.bsCoachPublicStatsFromRow([{ sessions_coached: null, active_clients: null, coaching_since: null, program_clients: null }]), { state: 'ready', ...NONE });
  // Public with nothing to count: 0, and {} for the plans.
  assert.deepEqual(PS.bsCoachPublicStatsFromRow({ sessions_coached: 0, active_clients: 0, coaching_since: 0, program_clients: {} }),
    { state: 'ready', sessions: 0, clients: 0, since: 0, programClients: {} });
  // No row at all is not "nothing public": the function always answers one row.
  for (const d of [[], null, undefined, 'x']) assert.deepEqual(PS.bsCoachPublicStatsFromRow(d), { state: 'error', ...NONE }, JSON.stringify(d));
  // Junk is null, never a figure.
  const junk = PS.bsCoachPublicStatsFromRow({ sessions_coached: -1, active_clients: 2.5, coaching_since: 1066, program_clients: [1] });
  assert.deepEqual(junk, { state: 'ready', ...NONE });
  assert.deepEqual(PS.bsCoachPublicStatsFromRow({ sessions_coached: '7', active_clients: true, coaching_since: '2025' }), { state: 'ready', sessions: 7, clients: null, since: 2025, programClients: null }, 'a numeric string reads as its number; a boolean is no count');
  // The plans: ids of plans only, counts only, own properties, bounded.
  const plans = PS.bsCoachPublicStatsFromRow({ program_clients: JSON.parse(`{"__proto__": 5, "${P1.toUpperCase()}": 2, "not-an-id": 4, "${P2}": -1}`) }).programClients;
  assert.deepEqual(plans, { [P1]: 2 });
  assert.equal(Object.getPrototypeOf(plans), Object.prototype);
  assert.equal(({}).polluted, undefined);
  const many = Object.fromEntries(Array.from({ length: 260 }, (_, i) => [`0b5a6c1e-0000-4000-8000-${String(i).padStart(12, '0')}`, i]));
  assert.equal(Object.keys(PS.bsCoachPublicStatsFromRow({ program_clients: many }).programClients).length, PS.BS_PUBLIC_PLANS_MAX);

  // The call: one rpc, by the coach's account id.
  const calls = [];
  const client = (answer) => ({ rpc: async (name, args) => { calls.push([name, args]); if (answer instanceof Error) throw answer; return answer; } });
  const ok = await PS.bsCoachPublicStatsRead(client({ data: [{ sessions_coached: 5, active_clients: null, coaching_since: null, program_clients: null }], error: null }), OWNER);
  assert.deepEqual(ok, { state: 'ready', sessions: 5, clients: null, since: null, programClients: null });
  assert.deepEqual(calls, [['get_coach_public_stats', { p_owner: OWNER }]]);
  // Unread: an error, a throw, no client, no account id — never a figure, and never a call for a bad id.
  assert.deepEqual(await PS.bsCoachPublicStatsRead(client({ data: [{ sessions_coached: 5 }], error: { message: 'boom' } }), OWNER), { state: 'error', ...NONE }, 'an error with data is still an error');
  assert.deepEqual(await PS.bsCoachPublicStatsRead(client(new Error('offline')), OWNER), { state: 'error', ...NONE });
  assert.deepEqual(await PS.bsCoachPublicStatsRead(null, OWNER), { state: 'error', ...NONE });
  assert.deepEqual(await PS.bsCoachPublicStatsRead({}, OWNER), { state: 'error', ...NONE });
  calls.length = 0;
  for (const id of [null, '', 'u-maya', 42]) assert.deepEqual(await PS.bsCoachPublicStatsRead(client({ data: [{}], error: null }), id), { state: 'error', ...NONE }, String(id));
  assert.deepEqual(calls, [], 'a bad id never reaches the database');

  // The app exposes it as ShapeCoachPublicStats.forOwner, on its own client, read at call time.
  const backend = read('mobile-app/src/services/shapeBackend.js');
  assert.match(backend, /import \{ bsCoachPublicStatsRead \} from '\.\/coachPublicStats\.mjs';/);
  assert.match(backend, /window\.ShapeCoachPublicStats = \{\n(?:\s*\/\/[^\n]*\n)*\s*forOwner: \(ownerId\) => bsCoachPublicStatsRead\(supabase, ownerId\),\n\};/);
});

// ── Make it yours → Spotlight → What's public ──────────────────────────────────────────────
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');

const CATS = {};
const EN = join(ROOT, 'mobile-app/src/i18n/catalogs/en');
for (const f of readdirSync(EN)) if (f.endsWith('.json')) CATS[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(EN, f), 'utf8'));
window.ShapeI18n = {
  t: (key, opts = {}) => {
    const [ns, k] = key.includes(':') ? key.split(/:(.*)/s) : ['common', key];
    assert.ok(CATS[ns] && k in CATS[ns], `${key} is not in the English catalogs`);
    return new IntlMessageFormat(CATS[ns][k], 'en-US').format(opts);
  },
  intlLocale: () => 'en-US',
};
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(el); });
  await flush();
  return { unmount: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const click = async (el) => { assert.ok(el, 'no such element'); await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let world;
const reset = (over = {}) => { world = { me: 'u-maya', stored: {}, saved: null, onSaved: null, ...over }; };
reset();
window.ShapeAuth = { getCachedState: () => ({ user: world.me ? { id: world.me } : null }) };
window.ShapeCoachReviews = { forOwner: async () => ({ reviews: [] }), byIds: async () => ({ reviews: [] }) };
window.shapeDb = {
  getUserGoals: async (k, opts) => (opts && opts.expectedUserId != null && opts.expectedUserId !== world.me ? null : world.stored),
  saveUserGoals: async (k, d, opts) => { world.saved = { k, d, opts }; return { ok: true }; },
};

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
const reg = () => new Map([['react', React], ['react-dom', require_('react-dom')]]);
const { BSMakeItYours, BS_STAT_WORDS, BS_PUBLIC_STAT_WORDS } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSMakeItYours.jsx'), { registry: reg() });
const editor = (props = {}) => React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
  React.createElement(BSMakeItYours, { role: 'trainer', ownerUid: 'u-maya', initial: world.stored, startTab: 'spotlight', who: { name: 'Maya Okafor', first: 'Maya' },
    figures: { sessions: 140 }, onClose: () => {}, onSaved: (doc, changed) => { world.onSaved = { doc, changed }; }, ...props }));
const sw = (k) => $(`[data-public-stat="${k}"]`);
const lit = () => $$('[data-public-stat][aria-checked="true"]').map((b) => b.getAttribute('data-public-stat'));

test('the words: every stat key and every switch has its catalog words', () => {
  const inCatalog = (key) => { const [ns, k] = key.split(/:(.*)/s); return !!CATS[ns] && k in CATS[ns]; };
  for (const role of ['trainer', 'nutritionist']) for (const k of BS_COACH_STATS[role]) assert.ok(BS_STAT_WORDS[k] && inCatalog(BS_STAT_WORDS[k][0]), `${role} ${k}`);
  for (const k of BS_PUBLIC_STATS) assert.ok(BS_PUBLIC_STAT_WORDS[k] && inCatalog(BS_PUBLIC_STAT_WORDS[k][0]) && inCatalog(BS_PUBLIC_STAT_WORDS[k][2]), k);
  // Every locale carries the new words (the catalogs' own parity tests hold the rest).
  const CAT = join(ROOT, 'mobile-app/src/i18n/catalogs');
  const keys = Object.keys(CATS.profile).filter((k) => k.startsWith('mine.public'));
  assert.equal(keys.length, 12);
  const locales = readdirSync(CAT);
  assert.equal(locales.length, 13);
  for (const loc of locales) {
    const c = JSON.parse(readFileSync(join(CAT, loc, 'profile.json'), 'utf8'));
    for (const k of keys) assert.ok(typeof c[k] === 'string' && c[k].trim(), `${loc} ${k}`);
  }
});

test('Make it yours → What\'s public: four switches, all off until the coach turns one on, saved onto the doc as it is', async () => {
  const opened = { heroStats: ['sessions', 'rating'], about: { story: 'Ten years.' }, bio: 'Kept' };
  reset({ stored: opened });
  let m = await mount(editor());
  assert.ok($('[data-spot-public]'), 'What\'s public is in the Spotlight');
  assert.deepEqual($$('[data-public-stat]').map((b) => b.getAttribute('data-public-stat')), BS_PUBLIC_STATS);
  assert.deepEqual(lit(), [], 'nothing public by default');
  assert.deepEqual($$('[data-public-stat]').map((b) => b.getAttribute('role')), ['switch', 'switch', 'switch', 'switch']);
  const texts = $$('[data-public-stat]').map((b) => b.textContent.replace(/\s+/g, ' ').trim());
  assert.deepEqual(texts, [
    'Sessions coachedThe sessions you’ve completed on Shape',
    'Active clientsHow many clients pay you now',
    'Coaching sinceThe year of your first client on Shape',
    'Clients on each programHow many clients are on each of your published programs now',
  ]);
  assert.match($('[data-spot-public]').firstChild.textContent, /What’s public/);
  assert.match($('[data-spot-public]').firstChild.textContent, /0 of 4/);
  assert.match($('[data-spot-public]').textContent, /none shows a client’s name/);
  // The two new headline stats, among a trainer's, with the figure the page has.
  assert.ok(sw('sessions') && $('[data-stat="sessions"]') && $('[data-stat="clients"]'));
  assert.equal($('[data-stat="sessions"] [data-stat-figure]').textContent, '140');
  assert.equal($('[data-stat="clients"] [data-stat-figure]').textContent, 'None yet');
  assert.equal($('[data-stat="sessions"]').getAttribute('aria-pressed'), 'true', 'the doc\'s pick opens ticked');
  assert.ok(!$('[data-save-mine]'), 'opening it changes nothing');

  // On and off again is no change.
  await click(sw('clients'));
  assert.ok($('[data-save-mine]'));
  await click(sw('clients'));
  assert.ok(!$('[data-save-mine]'), 'put back, nothing to save');

  // Turned on out of order: saved in order, onto the doc as it is at save time.
  await click(sw('programClients'));
  await click(sw('since'));
  await click(sw('sessions'));
  assert.deepEqual(lit(), ['sessions', 'since', 'programClients']);
  assert.match($('[data-spot-public]').firstChild.textContent, /3 of 4/);
  world.stored = { ...opened, bio: 'Changed elsewhere' };
  await click($('[data-save-mine]'));
  assert.equal(world.saved.k, 'profile_custom');
  assert.deepEqual(world.saved.opts, { expectedUserId: 'u-maya' });
  assert.deepEqual(world.saved.d.publicStats, ['sessions', 'since', 'programClients']);
  assert.equal(world.saved.d.bio, 'Changed elsewhere', 'a key saved elsewhere since is kept');
  assert.deepEqual(world.saved.d.heroStats, ['sessions', 'rating'], 'the headline stats, not changed here, ride through');
  assert.deepEqual(world.onSaved.doc.publicStats, ['sessions', 'since', 'programClients'], 'the page gets the doc as saved');
  await m.unmount();

  // Opened on a doc that made some public (and junk): the switches read it cleaned; all off drops the key.
  reset({ stored: { publicStats: ['since', 'bogus', 'clients'], bio: 'Kept' } });
  m = await mount(editor());
  assert.deepEqual(lit(), ['clients', 'since']);
  assert.ok(!$('[data-save-mine]'), 'a doc read is not a change');
  await click(sw('clients'));
  await click(sw('since'));
  await click($('[data-save-mine]'));
  assert.ok(!('publicStats' in world.saved.d), 'nothing public is no key');
  assert.equal(world.saved.d.bio, 'Kept');
  await m.unmount();

  // A nutritionist's last switch is their meal plans; their headline stats have the two keys too.
  reset();
  m = await mount(editor({ role: 'nutritionist', figures: {} }));
  assert.match(sw('programClients').textContent, /Clients on each meal plan/);
  assert.match(sw('programClients').textContent, /each of your published meal plans now/);
  assert.deepEqual($$('[data-stat]').map((b) => b.getAttribute('data-stat')), BS_COACH_STATS.nutritionist);
  await m.unmount();

  // Signed out (or another account): Save says so and writes nothing.
  reset({ me: null });
  m = await mount(editor());
  await click(sw('sessions'));
  await click($('[data-save-mine]'));
  assert.equal(world.saved, null);
  await m.unmount();
});

// Compare-and-set (owner, 2026-11-11, on #2707): a save elsewhere that lands between Make it yours' read and
// its write is kept; the switches go over the newer doc (profileCustom.mjs bsProfileCustomWrite).
test('Make it yours: a save elsewhere that lands mid-write is kept, and the switches go over it', async () => {
  reset({ stored: { bio: 'Kept', rev: 2 } });
  let conflicts = 0;
  const db = window.shapeDb;
  window.shapeDb = {
    ...db,
    saveUserGoalsIfRev: async (k, d, expectedRev, uid) => {
      assert.equal(uid, 'u-maya');
      if (!conflicts && world.stored.rev === 2) world.stored = { ...world.stored, line: 'Saved on the website', rev: 3 };
      if (String(world.stored.rev) !== String(expectedRev)) { conflicts += 1; return { conflict: true }; }
      world.saved = { k, d }; world.stored = d;
      return { ok: true };
    },
  };
  try {
    const m = await mount(editor());
    await click(sw('since'));
    await click($('[data-save-mine]'));
    await m.unmount();
  } finally { window.shapeDb = db; }
  assert.equal(conflicts, 1, 'the write did not compare on the rev it read');
  assert.deepEqual(world.saved.d.publicStats, ['since']);
  assert.equal(world.saved.d.line, 'Saved on the website', 'the website\'s save, landed mid-write, was undone');
  assert.equal(world.saved.d.rev, 4);
  assert.deepEqual(world.onSaved.doc, world.saved.d, 'the page was handed another doc than the one saved');
});
