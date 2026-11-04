// The marketplace directory ("Find your coach.") redesigned in the look of Goals, Home's Team and the
// coach pages (owner, 2026-11-04: "and these", "the marketplace"), and carved out of
// iosAppBroadsheetMarketplace.jsx into BSMarketDirectory.jsx, as BSGoals.jsx and BSLeaderboard.jsx were
// out of the client module (the WORKLOG rule: a PR that touches a self-contained screen moves it).
//
// What it pins:
//   · THE SEAM. The view draws and the marketplace decides: the module imports only React and its two
//     look siblings, reads no window global while it evaluates (React #130 otherwise), names its globals
//     on each component's first line, carries its own translator, and the marketplace renders it once,
//     handing it each coach as its own rules read them (the rating's honesty, the standing, the face).
//   · THE PAGE, driven through the real marketplace screen on its demo roster: the masthead and ← Back,
//     the search and the role switch first, a role's filters as chips with the sort on the list's head,
//     Clear filters only when one is set, the feature card with its three stat tiles, This week's tiles,
//     the numbered rows with faces, the plans rail (signed out only) and the Apply doors.
//   · THE CONTROLS: every one a 44px target, faces a photo in the role's ring or the initials on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { stripComments } from './helpers/strip-comments.mjs';
import { drive, textOf, SHIM, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const NEW = 'mobile-app/src/broadsheet/BSMarketDirectory.jsx';
const MKT = 'mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx';
const view = stripComments(fs.readFileSync(NEW, 'utf8'));
const market = stripComments(fs.readFileSync(MKT, 'utf8'));

// Every component in the module: each names its window globals first.
const COMPONENTS = ['BSMarketDirectory', 'MktDirFace', 'MktDirPrice', 'MktDirSearch', 'MktDirSwitch', 'MktDirChip', 'MktDirSection', 'MktDirMeta', 'MktDirScore', 'MktDirFeature', 'MktDirTile', 'MktDirRow', 'MktDirPlanRow', 'MktDirApply'];
// What the redesign retired from the marketplace module (the old section head, track row, listing row
// and combo card): declaring one there again is the old directory coming back.
const RETIRED = ['MktSectionHead', 'MktTrackRow', 'MktRow', 'MktComboCard'];

// The app's translator with no catalog: each string its English default, formatted as ICU.
globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };

const REG = () => ({ registry: new Map([['react', SHIM], ['react-dom', { createPortal: (n) => n }]]) });
const fnNamed = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
const ofType = (d, name) => d.nodes().filter(fnNamed(name));

test('the module exports the page alone, and the marketplace declares none of what it draws', () => {
  assert.match(view, /^export function BSMarketDirectory\(\{$/m);
  assert.deepEqual([...view.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]), ['BSMarketDirectory']);
  for (const n of COMPONENTS) {
    assert.match(view, new RegExp(`^(?:export )?function ${n}\\(`, 'm'), `${n} is not in the module`);
    assert.doesNotMatch(market, new RegExp(`^function ${n}\\(`, 'm'), `${n} is declared in the marketplace module too`);
  }
  for (const n of RETIRED) assert.doesNotMatch(market, new RegExp(`^function ${n}\\(`, 'm'), `${n} is back in the marketplace module: the old directory is returning`);
});

// Pinned by EVALUATING the module under a window that records every read (the goals module's lesson:
// a top-level read spelled any other way passes a regex).
test('evaluating the module by itself reads NO window global, whatever the spelling', async () => {
  const reads = [];
  const recorder = new Proxy({}, {
    get: (_t, prop) => { reads.push(String(prop)); return undefined; },
    has: (_t, prop) => { reads.push(String(prop)); return false; },
  });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
  let mod;
  try {
    mod = await loadRealModule(path.resolve(NEW));
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
  assert.deepEqual(Object.keys(mod), ['BSMarketDirectory']);
  assert.deepEqual(reads, [], `the module read window.${reads.join(', window.')} while it was being evaluated (React #130 on first open)`);
});

test('each component opens by naming the window globals it uses, at call time', () => {
  for (const n of COMPONENTS) {
    const m = new RegExp(`^(?:export )?function ${n}\\((?:.*\\) \\{|\\{\\n[\\s\\S]*?\\n\\}\\) \\{)\\n  const \\{ ([^}]+) \\} = window;`, 'm').exec(view);
    assert.ok(m, `${n} does not read its window globals on its first line`);
    assert.ok(m[1].split(',').map((s) => s.trim()).includes('useBS'), `${n} must take the theme hook from window at call time`);
  }
  // The masthead inset is the chrome's, read at call time with the chrome's own fallback.
  assert.match(view, /const BS_MAST_TOP_CSS = 'max\(44px, calc\(env\(safe-area-inset-top, 0px\) \+ 12px\), var\(--bs-notch-floor, 0px\)\)';/);
  assert.match(view, /const mastTop = window\.BS_MAST_TOP_CSS \|\| BS_MAST_TOP_CSS;/);
});

test('the module carries its own translator and imports only React and the two look siblings', () => {
  assert.match(view, /^function useShapeTr\(\) \{/m);
  assert.equal((view.match(/window\.ShapeI18n/g) || []).length, 1, 'window.ShapeI18n must be read only inside useShapeTr()');
  const imports = [...view.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['react', './BSProInstrument.jsx', './BSDash.jsx']);
  assert.ok(!imports.some((s) => /iosAppBroadsheet/.test(s)), 'the module imports a host module back');
  // Theme tokens only: no paper or ink of its own (the role marks are the house's literal pairs).
  assert.doesNotMatch(view, /'#fff(?:fff)?'|'#000(?:000)?'|'white'|'black'/i, 'a hardcoded paper or ink');
});

test('the marketplace renders the view once and hands it each coach as its own rules read them', () => {
  assert.match(market, /^import \{ BSMarketDirectory \} from '\.\/BSMarketDirectory\.jsx';/m);
  assert.equal((market.match(/<BSMarketDirectory\b/g) || []).length, 1);
  // The masthead's corner is the module's one copy (bsMktCorner), handed in.
  assert.match(market, /<BSMarketDirectory\n\s+onBack=\{onBack\} corner=\{bsMktCorner\(t\.INK\)\}/);
  const card = market.slice(market.indexOf('const mktDirCard = (c, n = null) => {'), market.indexOf('const feature = cotw && cotwProfile'));
  assert.match(card, /rating: formatCoachRating10\(c, tr\), score: getCoachRating10\(c\)/, 'the rating is a live coach\'s reviews, or New');
  assert.match(card, /tier: mktCoachTier\(c\)\.name \|\| null/, 'the standing is their Shape Score, or nothing');
  assert.match(card, /photo: mktValidPhoto\(coachPhoto\(c\)\), cover: mktListingMedia\(c\)\.cover/, 'the face is the portrait ladder, checked');
  assert.match(card, /onOpen: \(\) => \{ setOpenNo\(n\); setOpen\(c\); \}/, 'a row opens its coach at its place (LISTING Nº)');
  // Sample plans are the signed-out preview only.
  assert.match(market, /const allPlans = livePlans\.length \? livePlans : \(_bsmSignedIn \? \[\] : BSM_DEMO_PLANS\);/);
});

// ── Driven: the real marketplace screen on its demo roster, through the real view ────────────────

const { BSMarketplaceScreen } = await loadRealModule(join(ROOT, MKT), { ...REG(), appendExports: 'exports.BSMarketplaceScreen = BSMarketplaceScreen;' });
const { BSMarketDirectory } = await loadRealModule(join(ROOT, NEW), REG());
// The screen's open branch hands a coach to the profile; a named stub shows who it got.
globalThis.BSPublicProfile = function BSPublicProfile() { return null; };

// Drive the screen and read the directory it renders (the screen returns the view's element). The
// marketplace compiled its own copy of the view, so the page is drawn by the type it rendered.
const screen = (props = {}) => {
  const d = drive(BSMarketplaceScreen, { onBack() {}, ...props });
  const dir = () => d.nodes()[0];
  return { d, dir, page: () => drive(dir().type, dir().props) };
};

test('All: the search and the role switch lead, then the coach of the week, This week, the plans and the doors', () => {
  delete globalThis.ShapeAuth;
  const { dir, page } = screen();
  assert.equal(dir().type.name, 'BSMarketDirectory');
  const p = page();
  // The masthead and ← Back through the shared row, the eyebrow at its right.
  const back = p.nodes().filter((n) => typeof n.type === 'function' && n.type.name === 'BSBackRow');
  assert.equal(back.length, 1, 'one ← Back, through BSBackRow');
  assert.equal(textOf({ props: { children: back[0].props.trailing } }), 'The classifieds');
  assert.match(p.text, /Vol\. 1 · No\. 1/);
  assert.match(p.text, /Find your coach\./);
  // Search and the switch, before any coach.
  const order = p.nodes().filter((n) => typeof n.type === 'function' && /^MktDir/.test(n.type.name)).map((n) => n.type.name);
  assert.deepEqual(order.slice(0, 2), ['MktDirSearch', 'MktDirSwitch']);
  const sw = ofType(p, 'MktDirSwitch')[0];
  assert.equal(sw.props.tabs, true);
  assert.deepEqual(sw.props.options, [['All', 'All'], ['Trainers', 'Trainers'], ['Nutritionists', 'Nutritionists']]);
  assert.equal(sw.props.value, 'All');
  // No filters on All; the feature, four tiles, the plans rail and two doors.
  assert.equal(dir().props.filters, null);
  assert.equal(ofType(p, 'MktDirChip').length, 0);
  const feature = ofType(p, 'MktDirFeature')[0].props.feature;
  assert.equal(feature.name, 'Jordan Chen', 'the tagged, top-ranked coach');
  assert.equal(feature.rating, '★ 9.8/10', 'a demo row\'s five-point rating, doubled');
  assert.equal(feature.score, 9.8);
  assert.match(feature.photo, /^https:\/\/images\.unsplash\.com\//, 'the demo portrait, through the ladder');
  assert.deepEqual(feature.offers.map((o) => [o.name, o.monthly, o.price]), [['Single workout', false, '$36'], ['Program', false, '$195'], ['Monthly - custom', true, '$320']]);
  assert.equal(ofType(p, 'MktDirTile').length, 4);
  assert.ok(!ofType(p, 'MktDirTile').some((n) => n.props.card.name === 'Jordan Chen'), 'the feature is not also a tile');
  assert.equal(ofType(p, 'MktDirPlanRow').length, 3, 'the signed-out preview shows the sample programs');
  assert.deepEqual(ofType(p, 'MktDirApply').map((n) => n.props.nutri), [false, true]);
  assert.equal(ofType(p, 'MktDirRow').length, 0, 'the numbered list waits for a role, a search or See all');
});

test('a signed-in member sees no sample plans, only the honest empty rail', () => {
  globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-1' } }) };
  try {
    const { dir, page } = screen();
    assert.deepEqual(dir().props.plans, []);
    assert.match(page().text, /No programs listed yet — check back soon\./);
  } finally { delete globalThis.ShapeAuth; }
});

test('a role: its filters as chips, the sort on the list\'s head, Clear filters only once one is set', () => {
  const { d, dir, page } = screen();
  dir().props.onPill('Trainers');
  d.render();
  let f = dir().props.filters;
  assert.ok(f, 'a role has filters');
  assert.equal(f.format, 'All formats', 'a trainer is filtered by format');
  let p = page();
  const chips = () => ofType(p, 'MktDirChip');
  // Category, format and location in the row; the sort on the list's own head.
  assert.equal(chips().length, 3);
  const section = ofType(p, 'MktDirSection')[0];
  assert.equal(section.props.title, '13 on the books');
  assert.equal(section.props.kicker, 'Trainers');
  assert.equal(section.props.aside.type.name, 'MktDirChip', 'the sort chip sits on the list\'s head');
  assert.equal(section.props.aside.props.glyph, '↕');
  assert.equal(section.props.aside.props.label, 'Sort: Most Popular');
  assert.equal(ofType(p, 'MktDirRow').length, 13);
  assert.deepEqual(ofType(p, 'MktDirRow').slice(0, 3).map((n) => n.props.card.n), [1, 2, 3], 'numbered');
  assert.ok(!p.nodes().some((n) => n.type === 'button' && n.props['data-mkt-clear'] != null), 'nothing to clear yet');
  // A category narrows the list and offers Clear filters, which resets it.
  f.onCat('Hyrox');
  d.render();
  p = page();
  assert.equal(ofType(p, 'MktDirRow').length, 1);
  assert.equal(ofType(p, 'MktDirRow')[0].props.card.name, 'Ari Morgan');
  assert.equal(ofType(p, 'MktDirSection')[0].props.kicker, 'Hyrox', 'the kicker names the category');
  const clear = p.nodes().find((n) => n.type === 'button' && n.props['data-mkt-clear'] != null);
  assert.ok(clear, 'Clear filters appears once a filter is set');
  assert.equal(textOf(clear).trim(), 'Clear filters');
  clear.props.onClick();
  d.render();
  assert.equal(ofType(page(), 'MktDirRow').length, 13);
  // The sort orders the list.
  dir().props.filters.onSort('Lowest Price');
  d.render();
  const rates = ofType(page(), 'MktDirRow').map((n) => n.props.card.rate);
  assert.deepEqual(rates, [...rates].sort((a, b) => a - b));
  // A nutritionist has no format filter.
  dir().props.onPill('Nutritionists');
  d.render();
  f = dir().props.filters;
  assert.equal(f.format, null);
  assert.equal(ofType(page(), 'MktDirChip').length, 2, 'category and location (the sort rides the list\'s head)');
  assert.equal(ofType(page(), 'MktDirSection')[0].props.aside.props.value, 'Lowest Price', 'the sort holds across roles');
});

test('the search lists every match, numbered; a miss says so; See all lights no tab', () => {
  const { d, dir, page } = screen();
  dir().props.onQuery('kettlebell');
  d.render();
  let p = page();
  assert.deepEqual(ofType(p, 'MktDirRow').map((n) => n.props.card.name), ['Sana Bhatt']);
  dir().props.onQuery('zzzz');
  d.render();
  p = page();
  assert.equal(ofType(p, 'MktDirRow').length, 0);
  assert.match(p.text, /No coaches match that — try a different filter\./);
  dir().props.onQuery('');
  d.render();
  dir().props.onSeeAll();
  d.render();
  p = page();
  assert.equal(ofType(p, 'MktDirRow').length, 23, 'everyone');
  assert.equal(ofType(p, 'MktDirSwitch')[0].props.value, null, 'See all lights no tab; All goes back');
  assert.equal(ofType(p, 'MktDirSection')[0].props.kicker, 'Everyone');
});

test('a row opens its coach on the profile, and the deep-link miss is said and dismissed', () => {
  const { d, dir, page } = screen();
  dir().props.onPill('Nutritionists');
  d.render();
  const third = ofType(page(), 'MktDirRow')[2].props.card;
  third.onOpen();
  d.render();
  const profile = d.nodes()[0];
  assert.equal(profile.type.name, 'BSPublicProfile', 'a coach opens on the coach profile');
  assert.equal(profile.props.person.who, third.name);
  assert.equal(profile.props.person.kind, 'NUTRI');
  profile.props.onBack();
  d.render();
  assert.equal(dir().type.name, 'BSMarketDirectory', 'back on the directory');
  // The miss: the view says it, and its × dismisses it.
  let dismissed = 0;
  const miss = drive(dir().type, { ...dir().props, deepMiss: true, onDeepMissDismiss: () => { dismissed += 1; } });
  const status = miss.nodes().find((n) => n.props && n.props.role === 'status');
  assert.match(textOf(status), /That coach's listing isn't open yet\./);
  const x = status.props.children.find((c) => c && c.type === 'button');
  assert.equal(x.props['aria-label'], 'Dismiss');
  assert.equal(x.props.style.width, 44);
  assert.equal(x.props.style.height, 44);
  x.props.onClick();
  assert.equal(dismissed, 1);
});

// ── The controls, each drawn ─────────────────────────────────────────────────────────────────────

const CARD = (over = {}) => ({ key: 'n9', n: 4, name: 'Dr. Kevin Park', nutri: true, cred: 'CNS', loc: 'Remote', tier: 'Pro', rating: '★ 9.6/10', score: 9.6, rate: 55, verified: true, photo: null, cover: null, onOpen() {}, ...over });
const PER_MONTH = ['', '/mo'];
const minH = (n) => Number(n.props.style.minHeight || n.props.style.height || 0);

test('a row: its place, a face, the name over role · credential and place · standing · vetted, the rate over the rating, one 72px button', () => {
  let opened = 0;
  const d = drive(ofType(drive(BSMarketDirectory, { list: [CARD()], browsing: true }), 'MktDirRow')[0].type, { card: CARD({ onOpen: () => { opened += 1; } }), perMonth: PER_MONTH, first: true });
  const btn = d.nodes()[0];
  assert.equal(btn.type, 'button');
  assert.ok(minH(btn) >= 72);
  btn.props.onClick();
  assert.equal(opened, 1);
  assert.equal(d.nodes().find((n) => n.props['data-mkt-rank'] != null).props.children, '04');
  const face = ofType(d, 'MktDirFace')[0];
  assert.deepEqual([face.props.name, face.props.nutri, face.props.photo, face.props.size], ['Dr. Kevin Park', true, null, 44]);
  const metas = ofType(d, 'MktDirMeta');
  assert.deepEqual(metas.map((m) => [m.props.parts, m.props.roleWord || null]), [[['CNS'], 'Nutritionist'], [['Remote', 'Pro', '✓ Vetted'], null]]);
  assert.equal(drive(metas[0].type, metas[0].props).text, 'Nutritionist · CNS', 'the role is named in words, never colour alone');
  assert.equal(drive(metas[1].type, metas[1].props).text, 'Remote · Pro · ✓ Vetted');
  const price = ofType(d, 'MktDirPrice')[0];
  assert.equal(drive(price.type, price.props).text, '$55/mo');
  assert.match(textOf(btn), /★ 9\.6\/10$/);
});

test('a face: the photo in the role\'s ring, the initials on it without one, and the initials when the photo fails', () => {
  const Face = ofType(drive(ofType(drive(BSMarketDirectory, { list: [CARD()], browsing: true }), 'MktDirRow')[0].type, { card: CARD(), perMonth: PER_MONTH }), 'MktDirFace')[0].type;
  const withPhoto = drive(Face, { photo: 'https://x.test/p.jpg', name: 'Jordan Chen', nutri: false, size: 44 });
  const img = withPhoto.nodes()[0];
  assert.equal(img.type, 'img');
  assert.equal(img.props['data-mkt-face'], 'photo');
  assert.equal(img.props.alt, '');
  assert.equal(img.props.style.border, '2px solid #c0533b', 'a trainer\'s ring is rust');
  img.props.onError();
  withPhoto.render();
  assert.equal(withPhoto.nodes()[0].props['data-mkt-face'], 'initials');
  assert.equal(withPhoto.text, 'JC');
  const initials = drive(Face, { photo: null, name: 'Dr. Kevin Park', nutri: true, size: 44 });
  assert.equal(initials.nodes()[0].props['data-mkt-face'], 'initials');
  assert.equal(initials.text, 'KP', 'a "Dr." is left off');
  assert.equal(initials.nodes()[0].props.style.border, '2px solid #a07a2e', 'a nutritionist\'s ring is gold on a light paper');
});

test('the feature: Rating, Clients and Years as tiles (a dash for none), the offers, and See the profile', () => {
  let opened = 0;
  const feature = { ...CARD({ onOpen: () => { opened += 1; } }), quote: 'Plans that fit a real week.', clients: 0, years: 12, offers: [{ key: 'a', name: 'Single meal plan', monthly: false, perks: 4, price: '$28' }, { key: 'b', name: 'Monthly - custom', monthly: true, perks: 4, price: '$170' }] };
  const Feature = ofType(drive(BSMarketDirectory, { feature }), 'MktDirFeature')[0].type;
  const d = drive(Feature, { feature });
  const stats = d.nodes().filter((n) => n.props['data-mkt-stat']);
  assert.deepEqual(stats.map((n) => n.props['data-mkt-stat']), ['rating', 'clients', 'years']);
  assert.equal(textOf(stats[1]), 'Clients—', 'no clients reads a dash, never "0+"');
  assert.equal(textOf(stats[2]), 'Years12');
  const score = ofType(d, 'MktDirScore')[0];
  assert.equal(drive(score.type, score.props).text, '★ 9.6/10');
  assert.equal(drive(score.type, { score: null, label: 'New' }).text, 'New', 'an unreviewed live coach reads New');
  assert.match(d.text, /“Plans that fit a real week\.”/);
  assert.match(d.text, /Single meal plan.*One-time · 4 included\$28/);
  assert.match(d.text, /Monthly - customMonthly · 4 included\$170/);
  // One button: See the profile, which opens the coach without the card's own tap firing twice.
  const buttons = d.nodes().filter((n) => n.type === 'button');
  assert.equal(buttons.length, 1);
  assert.equal(textOf(buttons[0]).trim(), 'See the profile →');
  assert.ok(minH(buttons[0]) >= 48);
  let stopped = 0;
  buttons[0].props.onClick({ stopPropagation: () => { stopped += 1; } });
  assert.deepEqual([opened, stopped], [1, 1]);
  d.nodes()[0].props.onClick();
  assert.equal(opened, 2, 'a tap anywhere on the card opens them too');
});

test('a tile: the cover when there is one, the face over it, the rate; the whole tile one button', () => {
  const Tile = ofType(drive(BSMarketDirectory, { roster: [CARD()] }), 'MktDirTile')[0].type;
  const bare = drive(Tile, { card: CARD(), perMonth: PER_MONTH });
  assert.equal(bare.nodes()[0].type, 'button');
  assert.ok(minH(bare.nodes()[0]) >= 44);
  assert.equal(bare.nodes().filter((n) => n.props['data-mkt-cover'] != null).length, 0);
  const covered = drive(Tile, { card: CARD({ cover: 'https://x.test/c.jpg' }), perMonth: PER_MONTH });
  const cover = covered.nodes().find((n) => n.props['data-mkt-cover'] != null);
  assert.match(cover.props.style.background, /url\("https:\/\/x\.test\/c\.jpg"\)/);
  assert.equal(cover.props['aria-hidden'], 'true');
});

test('a filter chip: the native picker over its pill, inked once it is not the "all", its words read aloud', () => {
  const Chip = ofType(drive(BSMarketDirectory, { browsing: true, filters: { cat: 'All Categories', cats: ['All Categories', 'HIIT'], loc: 'Anywhere', locs: ['Anywhere', 'Remote only'], sort: 'Most Popular', sorts: ['Most Popular'], format: null, onCat() {}, onLoc() {}, onSort() {}, onClear() {} } }), 'MktDirChip')[0].type;
  let picked = null;
  const off = drive(Chip, { value: 'Anywhere', options: [['Anywhere', 'Anywhere'], ['Remote only', 'Remote only']], onChange: (v) => { picked = v; }, label: 'Location' });
  const wrap = off.nodes()[0];
  assert.equal(wrap.props['data-mkt-chip'], 'off');
  assert.ok(minH(wrap) >= 44, 'a 44px target');
  const select = off.nodes().find((n) => n.type === 'select');
  assert.equal(select.props.value, 'Anywhere');
  assert.equal(select.props['aria-label'], 'Location');
  assert.equal(select.props.style.position, 'absolute', 'the picker covers the whole chip');
  assert.equal(select.props.style.fontSize, 16, 'no zoom on focus');
  select.props.onChange({ target: { value: 'Remote only' } });
  assert.equal(picked, 'Remote only');
  const on = drive(Chip, { value: 'Remote only', options: [['Anywhere', 'Anywhere'], ['Remote only', 'Remote only']], onChange() {} });
  assert.equal(on.nodes()[0].props['data-mkt-chip'], 'on');
  assert.match(on.text, /Remote only/);
});

test('every control the page draws itself is a 44px target', () => {
  const p = drive(BSMarketDirectory, { query: 'x', browsing: true, deepMiss: true, onQuery() {}, onPill() {}, onDeepMissDismiss() {}, list: [CARD()], filters: { cat: 'HIIT', cats: ['All Categories', 'HIIT'], loc: 'Anywhere', locs: ['Anywhere'], sort: 'Most Popular', sorts: ['Most Popular'], format: null, onCat() {}, onLoc() {}, onSort() {}, onClear() {} } });
  const own = p.nodes().filter((n) => n.type === 'button');
  assert.ok(own.length >= 2, 'the clear-filters and dismiss buttons');
  for (const b of own) assert.ok(minH(b) >= 44, `${textOf(b)} is under 44px`);
  // The parts: the search's ×, the switch's keys, a section's action.
  const search = drive(ofType(p, 'MktDirSearch')[0].type, { value: 'x', onChange() {} });
  const x = search.nodes().find((n) => n.type === 'button');
  assert.deepEqual([x.props.style.width, x.props.style.height, x.props['aria-label']], [44, 44, 'Clear search']);
  assert.equal(search.nodes().find((n) => n.type === 'input').props.style.fontSize, 16, 'no zoom on focus');
  const sw = drive(ofType(p, 'MktDirSwitch')[0].type, ofType(p, 'MktDirSwitch')[0].props);
  const keys = sw.nodes().filter((n) => n.type === 'button');
  assert.equal(keys.length, 3);
  assert.ok(keys.every((k) => minH(k) >= 44 && k.props.role === 'tab'));
  assert.deepEqual(keys.map((k) => k.props['aria-selected']), [true, false, false], 'All, by default');
  const seeAll = drive(BSMarketDirectory, { browsing: true, forceList: true, pill: 'All' });
  assert.equal(ofType(seeAll, 'MktDirSwitch')[0].props.value, null, 'See all lights no tab');
  const section = drive(ofType(drive(BSMarketDirectory, { roster: [] }), 'MktDirSection')[0].type, { kicker: 'K', title: 'T', action: 'See all', onAction() {} });
  assert.ok(minH(section.nodes().find((n) => n.type === 'button')) >= 44);
});
