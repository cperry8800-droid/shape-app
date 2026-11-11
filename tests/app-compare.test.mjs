// Compare on the app's Coaches tab (owner, 2026-11-11: "yes i want compare on app", of the website's Compare
// sheet). Driven through the real marketplace screen and directory (the harness of app-coaches-tab.test.mjs):
//   · the rules (public/newdesign/coachCompare.mjs): up to three; how a coach meets (every coach remote);
//     the best of a row only when one coach alone tops it; a price ranked only in one unit;
//   · each row's Compare, under Book intro; the tray (Pick one more, then Compare n; × and Clear);
//   · the sheet: a column a coach, the rows with Best, Only what differs, Book intro and View at each foot;
//     View opens the coach and closes the sheet; a pick a filter hides stays picked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { drive, textOf, SHIM, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsCompareToggle, bsCompareMeets, bsCompareRows, bsComparePriceRank, BS_COMPARE_MAX } from '../mobile-app/src/services/coachCompare.mjs';

globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };

const DIR = join(ROOT, 'mobile-app/src/broadsheet');
const fnNamed = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
const ofType = (d, name) => d.nodes().filter(fnNamed(name));
const drawn = (el) => drive(el.type, el.props);
const REG = (react) => ({ registry: new Map([['react', react], ['react-dom', { createPortal: (n) => n }]]) });
const { BSMarketplaceScreen } = await loadRealModule(join(DIR, 'iosAppBroadsheetMarketplace.jsx'), { ...REG(SHIM), appendExports: 'exports.BSMarketplaceScreen = BSMarketplaceScreen;' });
await loadRealModule(join(DIR, 'BSMarketDirectory.jsx'), REG(SHIM));
globalThis.BSPublicProfile = function BSPublicProfile() { return null; };

const screen = () => {
  delete globalThis.ShapeAuth;
  const d = drive(BSMarketplaceScreen, { onProfile() {} });
  const dir = () => d.nodes()[0];
  return { d, dir };
};

test('the rules: three at most, every coach remote, a best only when one coach alone tops a row', () => {
  assert.equal(BS_COMPARE_MAX, 3);
  assert.deepEqual(bsCompareToggle([], 'a'), ['a']);
  assert.deepEqual(bsCompareToggle(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(bsCompareToggle(['a', 'b', 'c'], 'd'), ['a', 'b', 'c'], 'a fourth was let in');
  assert.equal(bsCompareMeets('In-person'), 'both');
  assert.equal(bsCompareMeets('Hybrid'), 'both');
  assert.equal(bsCompareMeets('Remote'), 'remote');
  assert.equal(bsCompareMeets(null), 'remote');
  const list = [{ y: 8, p: { amount: 105, per: 'session' } }, { y: 7, p: { amount: 95, per: 'session' } }, { y: 8, p: { amount: 70, per: 'session' } }];
  const [price, years, same] = bsCompareRows(list, [
    { key: 'price', text: (c) => '$' + c.p.amount, rank: bsComparePriceRank(list, (c) => c.p) },
    { key: 'years', text: (c) => String(c.y), rank: (c) => c.y },
    { key: 'tier', text: () => 'Elite', rank: () => 1 },
  ]);
  assert.equal(price.best, 2, 'the lowest price is not the best');
  assert.equal(years.best, null, 'a tie at the top marked a best');
  assert.equal(same.same, true);
  assert.equal(same.best, null);
  assert.equal(bsComparePriceRank([{ p: { amount: 1, per: 'session' } }, { p: { amount: 2, per: 'month' } }], (c) => c.p), null, 'a session and a month were ranked together');
});

test('each row has Compare under Book intro; the tray asks for one more, then compares; three at most', () => {
  const s = screen();
  const list = () => s.dir().props.list;
  assert.ok(list().length >= 4);
  const row = drawn(ofType(drawn(s.dir()), 'MktDirRow')[0]);
  const toggle = ofType(row, 'MktDirCompareToggle')[0];
  assert.ok(toggle, 'a row has no Compare');
  assert.equal(drawn(toggle).text, '＋ Compare');
  // Not inside the row's open button.
  const open = row.nodes().find((n) => n.props && n.props['data-mkt-open'] != null);
  assert.ok(!JSON.stringify(open.props.children, (k, v) => (typeof v === 'function' ? v.name : v)).includes('MktDirCompareToggle'), 'Compare sits inside the row\'s button');
  list()[0].compare.onToggle(); s.d.render();
  assert.equal(list()[0].compare.on, true);
  let tray = ofType(drawn(s.dir()), 'MktDirCompareTray')[0];
  assert.ok(tray, 'no tray with a coach picked');
  assert.equal(textOf(drawn(tray).nodes().find((n) => n.props && n.props['data-mkt-compare-open'] != null)), 'Pick one more');
  list()[1].compare.onToggle(); s.d.render();
  list()[2].compare.onToggle(); s.d.render();
  assert.equal(list()[3].compare.can, false, 'a fourth can be picked');
  assert.equal(drawn(ofType(drawn(ofType(drawn(s.dir()), 'MktDirRow')[3]), 'MktDirCompareToggle')[0]).text, 'Compare holds 3');
  tray = drawn(ofType(drawn(s.dir()), 'MktDirCompareTray')[0]);
  assert.equal(textOf(tray.nodes().find((n) => n.props && n.props['data-mkt-compare-open'] != null)), 'Compare 3');
  // Clear takes them all off.
  s.dir().props.compare.onClear(); s.d.render();
  assert.equal(s.dir().props.compare.cards.length, 0);
  assert.equal(ofType(drawn(s.dir()), 'MktDirCompareTray').length, 0);
});

test('the sheet: a column a coach, Best where one tops a row, Only what differs, Book intro and View', () => {
  const s = screen();
  const list = () => s.dir().props.list;
  const [a, b] = list();
  a.compare.onToggle(); s.d.render();
  b.compare.onToggle(); s.d.render();
  s.dir().props.compare.onOpen(); s.d.render();
  const cmp = s.dir().props.compare;
  assert.equal(cmp.open, true);
  assert.deepEqual(cmp.cards.map((c) => c.name), [a.name, b.name]);
  const sheet = drawn(ofType(drawn(s.dir()), 'MktDirCompareSheet')[0]);
  const rows = sheet.nodes().filter((n) => n.props && n.props['data-mkt-compare-row']);
  assert.deepEqual(rows.map((r) => r.props['data-mkt-compare-row']), ['price', 'rating', 'years', 'meet', 'city', 'next', 'intro', 'verified', 'creds']);
  const meet = rows.find((r) => r.props['data-mkt-compare-row'] === 'meet');
  assert.ok(/In person \+ remote|Remote/.test(textOf(meet)), 'how they meet is not listed');
  // The best of the price row is the cheaper coach, when both price the same way.
  if (a.price && b.price && a.price.per === b.price.per && a.price.amount !== b.price.amount) {
    const price = rows.find((r) => r.props['data-mkt-compare-row'] === 'price');
    const cells = price.props.children[1].props.children;
    const bestAt = cells.findIndex((c) => c.props['data-best'] != null);
    assert.equal(bestAt, a.price.amount < b.price.amount ? 0 : 1);
  }
  // Only what differs folds the same rows away.
  const diff = sheet.nodes().find((n) => n.props && n.props['data-mkt-compare-diff'] != null);
  if (diff) {
    const sameKeys = rows.filter((r) => r.props['data-same'] != null).map((r) => r.props['data-mkt-compare-row']);
    assert.ok(sameKeys.length > 0);
    diff.props.onClick(); sheet.render();
    const left = sheet.nodes().filter((n) => n.props && n.props['data-mkt-compare-row']).map((r) => r.props['data-mkt-compare-row']);
    assert.ok(sameKeys.every((k) => !left.includes(k)), 'a row the same for all still shows');
    assert.ok(sheet.nodes().some((n) => n.props && n.props['data-mkt-compare-same'] != null));
  }
  // View opens the coach and closes the sheet; the picks stay.
  sheet.nodes().filter((n) => n.props && n.props['data-mkt-compare-view'] != null)[1].props.onClick(); s.d.render();
  assert.equal(s.d.nodes()[0].props.compare, undefined, 'View did not open the coach');
});

test('a pick a filter hides stays picked, in the tray and the sheet', () => {
  const s = screen();
  const first = s.dir().props.list[0];
  first.compare.onToggle(); s.d.render();
  s.dir().props.onQuery('zzzz-no-such-coach'); s.d.render();
  assert.equal(s.dir().props.list.length, 0);
  assert.deepEqual(s.dir().props.compare.cards.map((c) => c.name), [first.name]);
});

// ── Codex on #2718 ────────────────────────────────────────────────────────────────────────────────
// The live listings, read through the effects (the harness of app-coaches-tab.test.mjs): Leah has a Shape account
// and open times; Rae's listing has no account behind it.
let EFFECTS = [];
const SHIM_FX = { ...SHIM, useEffect(fn) { EFFECTS.push(fn); } };
const { BSMarketplaceScreen: ScreenFx } = await loadRealModule(join(DIR, 'iosAppBroadsheetMarketplace.jsx'), { ...REG(SHIM_FX), appendExports: 'exports.BSMarketplaceScreen = BSMarketplaceScreen;' });
function liveWorld() {
  const tomorrow = new Date(Date.now() + 86400000);
  const rows = {
    trainers: [{ id: 7, name: 'Leah Kim', owner_id: 'u-leah', specialty: 'Strength training', tags: ['Strength'], session_price: 95, price: 260, rating: 4.8, verified: true, listing_media: null }],
    nutritionists: [{ id: 52, name: 'Rae Lindqvist', owner_id: null, specialty: 'Sports nutrition', tags: ['Endurance'], price: 140, meal_plan_price: 35, rating: 4.9, featured: true, listing_media: null }],
  };
  const from = (table) => { const q = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: rows[table] || [], error: null }) }; return q; };
  globalThis.ShapeAuth = { client: { from }, getCachedState: () => ({ user: { id: 'member-1' } }) };
  globalThis.ShapeCoachReviews = { summaries: async () => ({ owners: {} }) };
  globalThis.ShapeCoachAvailability = { get: async (role, id) => (role === 'trainer' && String(id) === '7' ? { slots: [{ weekday: tomorrow.getUTCDay(), start_minute: 15 * 60, duration_min: 120 }], booked: [], busy: [], rules: null, timezone: 'UTC', atCapacity: false } : null) };
  globalThis.ShapePlan = { get: async () => ({ ok: true, training: { hasPlan: false, coaching: null }, meals: { hasPlan: false, coaching: null } }) };
}
const liveWorldDone = () => { for (const k of ['ShapeAuth', 'ShapeCoachReviews', 'ShapeCoachAvailability', 'ShapePlan']) delete globalThis[k]; };
const screenFx = () => {
  EFFECTS = [];
  const d = drive(ScreenFx, { onProfile() {} });
  const flush = async () => { for (let i = 0; i < 4; i += 1) { const run = EFFECTS.splice(0); for (const f of run) { try { f(); } catch (e) {} } await new Promise((r) => setTimeout(r, 15)); d.render(); } };
  return { d, dir: () => d.nodes()[0], flush };
};

test('a listing with no account behind it has no free intro to book: Free intro No, and View alone (Codex on #2718)', async () => {
  liveWorld();
  try {
    const s = screenFx();
    await s.flush();
    const list = () => s.dir().props.list;
    const leah = list().find((c) => c.name === 'Leah Kim');
    const rae = list().find((c) => c.name === 'Rae Lindqvist');
    assert.equal(leah.introOpen, true);
    assert.equal(rae.introOpen, false, 'a listing with no account reads Free intro Yes');
    leah.compare.onToggle(); s.d.render();
    list().find((c) => c.name === 'Rae Lindqvist').compare.onToggle(); s.d.render();
    s.dir().props.compare.onOpen(); s.d.render();
    const cmp = s.dir().props.compare;
    assert.deepEqual(cmp.rows.find((r) => r.key === 'intro').texts, ['Yes', 'No']);
    const sheet = drawn(ofType(drawn(s.dir()), 'MktDirCompareSheet')[0]);
    assert.equal(sheet.nodes().filter((n) => n.props && n.props['data-mkt-compare-intro'] != null).length, 1, 'the listing with no account offers Book intro');
    assert.equal(sheet.nodes().filter((n) => n.props && n.props['data-mkt-compare-view'] != null).length, 2);
  } finally { liveWorldDone(); }
});

test('a pick made on the example roster is cleared when the live listings land, never read as another coach (Codex on #2718)', async () => {
  liveWorld();
  try {
    const s = screenFx();
    // The example roster shows while the directory is read; pick its t7, the id Leah's live listing (trainers
    // row 7) maps to, and one more.
    const ex = s.dir().props.list;
    assert.ok(ex.length >= 2 && ex.every((c) => c.example));
    const t7 = ex.find((c) => c.key === 't7');
    assert.ok(t7, 'the example roster has a t7');
    t7.compare.onToggle(); s.d.render();
    s.dir().props.list.find((c) => c.key !== 't7').compare.onToggle(); s.d.render();
    assert.equal(s.dir().props.compare.cards.length, 2);
    const exName = t7.name;
    await s.flush();
    assert.ok(s.dir().props.list.every((c) => !c.example), 'the live listings did not land');
    assert.ok(exName !== 'Leah Kim');
    assert.deepEqual(s.dir().props.compare.cards.map((c) => c.name), [], 'an example pick stayed on, or turned into a live coach (Leah)');
    assert.equal(s.dir().props.compare.open, false);
  } finally { liveWorldDone(); }
});
