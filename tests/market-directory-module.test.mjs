// The member's Coaches tab: the marketplace directory in the "Browse list" look (owner, 2026-11-09, of
// three placements and three looks: "place-1", a sixth tab between Eat and Chat, in "look-B"; then
// option 1 of three filter treatments), drawn by BSMarketDirectory.jsx, carved out of
// iosAppBroadsheetMarketplace.jsx as BSGoals.jsx and BSLeaderboard.jsx were out of the client module.
//
// What it pins:
//   · THE SEAM. The view draws and the marketplace decides: the module imports only React, the portal
//     and its look siblings, reads no window global while it evaluates (React #130 otherwise), names its
//     globals on each component's first line, carries its own translator, and the marketplace renders it
//     once, handing it each coach as its own rules read them (the rating's honesty, the price and its
//     unit, the next open time, the face).
//   · THE PAGE, driven through the real marketplace screen on its example roster: "Coaches." and no
//     ← Back on the tab, Your team, the search with the filters (BSMktFilters, the one component), the
//     picks, the list's head and sort, compact rows labelled Example, What's hot and the one Apply line.
//   · THE CONTROLS: every one a 44px target, Book intro beside the row's button and never inside it,
//     faces a photo in the role's ring or the initials on it.
//   · THE MAPPING: a live listing says only what it states (no 4.8, no Remote, no session count or match).
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
const COMPONENTS = ['BSMarketDirectory', 'MktDirFace', 'MktDirHead', 'MktDirSelect', 'MktDirTeam', 'BSMktFilters', 'MktDirFilterSheet', 'MktDirRating', 'MktDirMeta', 'MktDirExample', 'MktDirRow', 'MktDirPick', 'MktDirPlanRow', 'MktDirSwitch', 'MktDirApply'];
// What the redesigns retired: the old directory's cards and the 2026-11-04 look's feature, tiles, chips
// and Apply tiles. Declaring one again is the old directory coming back.
const RETIRED = ['MktSectionHead', 'MktTrackRow', 'MktRow', 'MktComboCard'];
const RETIRED_VIEW = ['MktDirFeature', 'MktDirTile', 'MktDirChip', 'MktDirSection', 'MktDirFull', 'MktDirScore', 'MktDirPrice', 'MktDirSearch'];

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
  for (const n of RETIRED_VIEW) assert.doesNotMatch(view, new RegExp(`^function ${n}\\(`, 'm'), `${n} is back: the 2026-11-04 directory is returning`);
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
    mod = await loadRealModule(path.resolve(NEW), REG());
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

test('the module carries its own translator and imports only React, the portal and its look siblings', () => {
  assert.match(view, /^function useShapeTr\(\) \{/m);
  assert.equal((view.match(/window\.ShapeI18n/g) || []).length, 1, 'window.ShapeI18n must be read only inside useShapeTr()');
  const imports = [...view.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['react', 'react-dom', './BSDash.jsx', './bsCleanType.jsx', '../services/dialogBack.mjs']);
  assert.ok(!imports.some((s) => /iosAppBroadsheet/.test(s)), 'the module imports a host module back');
  // The clean type the coach pages use: the page swaps its faces (useBSClean) and hands them down.
  assert.match(view, /const t = useBSClean\(\);/);
  assert.match(view, /<BSCleanType t=\{t\}>/);
  // No mono capitals: no kicker is set in the mono face or in capitals.
  assert.doesNotMatch(view, /t\.MONO|textTransform: 'uppercase'/, 'a mono or capitalised kicker is back');
});

test('the marketplace renders the view once and hands it each coach as its own rules read them', () => {
  assert.match(market, /^import \{ BSMarketDirectory \} from '\.\/BSMarketDirectory\.jsx';/m);
  assert.equal((market.match(/<BSMarketDirectory\b/g) || []).length, 1);
  // The masthead's corner is the module's one copy (bsMktCorner), handed in.
  assert.match(market, /<BSMarketDirectory\n\s+onBack=\{onBack\} corner=\{bsMktCorner\(t\.INK\)\}/);
  const card = market.slice(market.indexOf('const mktDirCard = (c, n = null) => {'), market.indexOf('const inRole = (c) =>'));
  assert.match(card, /score: getCoachRating10\(c\) \|\| null,/, 'the rating is a coach\'s reviews, or New');
  assert.match(card, /price: bsmPriceOf\(c\),/, 'the price with its unit');
  assert.match(card, /const times = bsmOpenTimes\(c, now\);/, 'the next open time, real or an example\'s');
  assert.match(card, /example: bsmIsDemoCoach\(c\),/, 'an example coach is labelled');
  assert.match(card, /photo: mktValidPhoto\(coachPhoto\(c\)\),/, 'the face is the portrait ladder, checked');
  assert.match(card, /onOpen: \(\) => \{ setOpenNo\(n\); setOpenIntro\(false\); setOpen\(c\); \}/, 'a row opens its coach at its place (LISTING Nº)');
  assert.match(card, /onIntro: \(\) => \{ setOpenNo\(n\); setOpenIntro\(true\); setOpen\(c\); \}/, 'Book intro opens them at their open times');
  // Sample plans are the signed-out preview only.
  assert.match(market, /const allPlans = livePlans\.length \? livePlans : \(_bsmSignedIn \? \[\] : BSM_DEMO_PLANS\);/);
});

// ── Driven: the real marketplace screen on its example roster, through the real view ─────────────

const { BSMarketplaceScreen, mapSupabaseProvider, bsmPriceOf } = await loadRealModule(join(ROOT, MKT), { ...REG(), appendExports: 'exports.BSMarketplaceScreen = BSMarketplaceScreen; exports.mapSupabaseProvider = mapSupabaseProvider; exports.bsmPriceOf = bsmPriceOf;' });
const { BSMarketDirectory } = await loadRealModule(join(ROOT, NEW), REG());
// The screen's open branch hands a coach to the profile; a named stub shows who it got.
globalThis.BSPublicProfile = function BSPublicProfile() { return null; };

// Drive the screen and read the directory it renders (the screen returns the view's element). The
// marketplace compiled its own copy of the view, so the page is drawn by the type it rendered.
const screen = (props = {}) => {
  const d = drive(BSMarketplaceScreen, { onProfile() {}, ...props });
  const dir = () => d.nodes()[0];
  return { d, dir, page: () => drive(dir().type, dir().props) };
};
const drawn = (el) => drive(el.type, el.props);

test('the tab: "Coaches.", no Back of its own, Your team, the filters, the picks, the list and the one Apply line', () => {
  delete globalThis.ShapeAuth;
  const { dir, page } = screen();
  assert.equal(dir().type.name, 'BSMarketDirectory');
  const p = page();
  assert.equal(p.nodes().filter(fnNamed('BSBackRow')).length, 0, 'the tab is a root: no ← Back');
  const h1 = p.nodes().find((n) => n.type === 'h1');
  assert.equal(textOf(h1), 'Coaches.', 'the title is "Coaches." with its teal full stop');
  assert.doesNotMatch(p.text, /The classifieds|Find your/);
  // The signed-out preview's team: the sample's two coaches, as Home names them.
  assert.deepEqual(dir().props.team.map((c) => [c.name, c.nutri]), [['Jordan Chen', false], ['Dr. Maya Patel', true]]);
  assert.equal(ofType(p, 'MktDirTeam').length, 1);
  // The order: team, the filters, the picks, then the rows.
  const order = p.nodes().filter((n) => typeof n.type === 'function' && /^(MktDir|BSMkt)/.test(n.type.name)).map((n) => n.type.name);
  assert.deepEqual([...new Set(order)].slice(0, 5), ['MktDirTeam', 'MktDirHead', 'BSMktFilters', 'MktDirPick', 'MktDirRow']);
  // Every coach of the example roster, each a row labelled Example; the head says what they are.
  assert.equal(ofType(p, 'MktDirRow').length, 23);
  assert.ok(ofType(p, 'MktDirRow').every((n) => n.props.card.example === true), 'every example coach is labelled');
  assert.equal(dir().props.listKind, 'example');
  assert.ok(ofType(p, 'MktDirHead').some((n) => n.props.title === '23 example coaches'), 'the head counts example coaches, never coaches you can book');
  assert.match(p.text, /Coaches marked Example are example profiles\./);
  // The picks: the example roster's best rated, at most six.
  assert.ok(dir().props.picks.length > 0 && dir().props.picks.length <= 6);
  // What's hot (the signed-out sample programs) and the one Apply line.
  assert.equal(ofType(p, 'MktDirPlanRow').length, 3);
  assert.equal(ofType(p, 'MktDirApply').length, 1);
});

test('a pushed page keeps its ← Back through the shared row', () => {
  let back = 0;
  const { page } = screen({ onBack: () => { back += 1; } });
  const p = page();
  const rows = p.nodes().filter(fnNamed('BSBackRow'));
  assert.equal(rows.length, 1);
  rows[0].props.onBack();
  assert.equal(back, 1);
});

test('a signed-in member sees no sample plans, no sample team, and the example coaches labelled', () => {
  globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-1' } }) };
  try {
    const { dir, page } = screen();
    assert.deepEqual(dir().props.plans, []);
    assert.deepEqual(dir().props.team, [], 'a member with no coach has no team block');
    const p = page();
    assert.equal(ofType(p, 'MktDirTeam').length, 0);
    assert.match(p.text, /No programs listed yet — check back soon\./);
    assert.ok(dir().props.list.every((c) => c.example), 'with no live rows, the example coaches stay labelled Example');
    assert.ok(!dir().props.list.some((c) => /YOUR COACH/.test(JSON.stringify(c))), 'no relationship badge is implied');
  } finally { delete globalThis.ShapeAuth; }
});

test('the role: Both by default, Trainers from "Find a trainer", Nutritionists from Eat; each with its count', () => {
  const both = screen();
  assert.equal(both.dir().props.filters.role, 'Both');
  assert.deepEqual(both.dir().props.filters.roles.map((r) => [r.key, r.count]), [['Both', 23], ['Trainers', 13], ['Nutritionists', 10]]);
  const tr = screen({ initialRole: 'trainer' });
  assert.equal(tr.dir().props.filters.role, 'Trainers', 'a trainer link opens on Trainers, not All');
  assert.equal(tr.dir().props.list.length, 13);
  assert.ok(tr.dir().props.list.every((c) => !c.nutri));
  const nu = screen({ initialRole: 'nutritionist' });
  assert.equal(nu.dir().props.filters.role, 'Nutritionists');
  assert.ok(nu.dir().props.list.every((c) => c.nutri));
  // Picking a role from the chip narrows the list, and the Apply line follows it.
  globalThis.BSProviderApplicationScreen = function BSProviderApplicationScreen() { return null; };
  try {
    both.dir().props.filters.onRole('Nutritionists');
    both.d.render();
    assert.equal(both.dir().props.list.length, 10);
    both.dir().props.onApply();
    both.d.render();
    assert.equal(both.d.nodes()[0].type.name, 'BSProviderApplicationScreen');
    assert.equal(both.d.nodes()[0].props.initialRole, 'nutritionist', 'the application opens on the role picked');
  } finally { delete globalThis.BSProviderApplicationScreen; }
});

test('the search finds coaches only; a miss says so; the sort orders the list', () => {
  const { d, dir, page } = screen();
  dir().props.onQuery('kettlebell');
  d.render();
  assert.deepEqual(dir().props.list.map((c) => c.name), ['Sana Bhatt']);
  dir().props.onQuery('zzzz');
  d.render();
  const p = page();
  assert.equal(ofType(p, 'MktDirRow').length, 0);
  assert.match(p.text, /No coaches match that — try a different filter\./);
  assert.equal(ofType(p, 'MktDirApply').length, 1, 'the Apply line stays while searching');
  dir().props.onQuery('');
  d.render();
  assert.deepEqual(dir().props.sorts, ['best', 'rated', 'price', 'years']);
  dir().props.onSort('price');
  d.render();
  const prices = dir().props.list.map((c) => (c.price.per === 'session' ? c.price.amount : 10000 + c.price.amount));
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'per session first, each low to high');
  dir().props.onSort('years');
  d.render();
  const ex = screen();
  assert.equal(ex.dir().props.sort, 'best');
});

test('a row opens its coach on the profile; Book intro opens it at its open times; the deep-link miss is said', () => {
  const { d, dir } = screen({ initialRole: 'nutritionist' });
  const third = dir().props.list[2];
  third.onOpen();
  d.render();
  let profile = d.nodes()[0];
  assert.equal(profile.type.name, 'BSPublicProfile', 'a coach opens on the coach profile');
  assert.equal(profile.props.person.who, third.name);
  assert.equal(profile.props.person.kind, 'NUTRI');
  assert.equal(profile.props.person.openAt, undefined);
  profile.props.onBack();
  d.render();
  dir().props.list[0].onIntro();
  d.render();
  profile = d.nodes()[0];
  assert.equal(profile.props.person.openAt, 'book', 'Book intro opens the page at Book');
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

const CARD = (over = {}) => ({ key: 't9', n: 4, name: 'Jordan Park', nutri: false, verified: true, example: false, spec: ['Mobility', 'Return-to-lift'], score: 9.8, price: { amount: 110, per: 'session' }, next: { text: 'Tomorrow 7:00 AM', full: false }, atCapacity: false, photo: null, onOpen() {}, onIntro() {}, ...over });
const minH = (n) => Number(n.props.style.minHeight || n.props.style.height || 0);
const Row = ofType(drive(BSMarketDirectory, { list: [CARD()] }), 'MktDirRow')[0].type;

test('a row: the face, the name with ✓, role · specialty in the role\'s colour, ★ rating · price · next open, and Book intro beside it', () => {
  let opened = 0; let intro = 0;
  const d = drive(Row, { card: CARD({ onOpen: () => { opened += 1; }, onIntro: () => { intro += 1; } }) });
  const wrap = d.nodes()[0];
  assert.equal(wrap.type, 'div', 'the row is a box holding two buttons, not a button holding one');
  const [main, book] = wrap.props.children;
  assert.equal(main.type, 'button');
  assert.equal(book.type, 'button');
  assert.ok(!d.nodes().filter((n) => n.type === 'button').some((b) => b !== main && main.props.children && flattenHas(main, b)), 'no button inside the row\'s button');
  assert.ok(minH(main) >= 44 && minH(book) >= 44);
  assert.equal(book.props.style.position, 'absolute');
  main.props.onClick();
  book.props.onClick();
  assert.deepEqual([opened, intro], [1, 1]);
  assert.equal(textOf(book).trim(), 'Book intro');
  assert.equal(book.props['aria-label'], 'Book an intro with Jordan Park');
  assert.ok(d.nodes().some((n) => n.props['data-mkt-verified'] != null), 'the teal ✓ for a verified coach');
  const spec = d.nodes().find((n) => n.props['data-mkt-spec'] != null);
  assert.equal(textOf(spec), 'Trainer · Mobility · Return-to-lift');
  assert.equal(spec.props.style.color, '#c0533b', 'a trainer\'s line is rust');
  const meta = drawn(ofType(d, 'MktDirMeta')[0]);
  assert.equal(meta.text, ' · $110/session · Tomorrow 7:00 AM', 'the rating, then the price and the next open time');
  assert.equal(drawn(ofType(meta, 'MktDirRating')[0]).text, '★ 9.8');
  const face = ofType(d, 'MktDirFace')[0];
  assert.deepEqual([face.props.name, face.props.nutri, face.props.photo], ['Jordan Park', false, null]);
  // No ✓ for one who is not verified, and Example on a sample.
  const plain = drive(Row, { card: CARD({ verified: false, example: true }) });
  assert.ok(!plain.nodes().some((n) => n.props['data-mkt-verified'] != null));
  assert.equal(ofType(drawn(ofType(plain, 'MktDirMeta')[0]), 'MktDirExample').length, 1, 'Example leads the line under the name');
});
function flattenHas(root, target) {
  const stack = [root.props.children];
  while (stack.length) {
    const n = stack.pop();
    if (n == null || n === false) continue;
    if (Array.isArray(n)) { stack.push(...n); continue; }
    if (n === target) return true;
    if (typeof n === 'object' && n.props) stack.push(n.props.children);
  }
  return false;
}

test('a nutritionist reads per month in gold; a coach nobody has reviewed reads New, never a number', () => {
  const d = drive(Row, { card: CARD({ nutri: true, score: null, price: { amount: 140, per: 'month' }, next: null }) });
  const meta = drawn(ofType(d, 'MktDirMeta')[0]);
  const rating = drawn(ofType(meta, 'MktDirRating')[0]);
  assert.equal(rating.text, 'New');
  assert.equal(rating.nodes()[0].props['aria-label'], 'New · no reviews yet');
  assert.doesNotMatch(meta.text.replace('New', ''), /★|\d\.\d/, 'no rating is printed');
  assert.match(meta.text, /\$140\/month/);
  assert.equal(d.nodes().find((n) => n.props['data-mkt-spec'] != null).props.style.color, '#a07a2e', 'gold on a light paper');
});

test('a coach who is full reads At capacity, and the corner reads Waiting list', () => {
  const d = drive(Row, { card: CARD({ atCapacity: true, next: { text: 'At capacity', full: true } }) });
  const book = d.nodes()[0].props.children[1];
  assert.equal(textOf(book).trim(), 'Waiting list');
  assert.match(drawn(ofType(d, 'MktDirMeta')[0]).text, /At capacity$/);
});

test('a pick is one button: the face, the name, the role (Example on a sample), the rating and the price', () => {
  const Pick = ofType(drive(BSMarketDirectory, { picks: [CARD()] }), 'MktDirPick')[0].type;
  const d = drive(Pick, { card: CARD({ example: true }) });
  const btn = d.nodes()[0];
  assert.equal(btn.type, 'button');
  assert.ok(minH(btn) >= 44);
  assert.match(textOf(btn), /Jordan ParkTrainer · Example/);
  assert.match(textOf(btn), /\$110\/session/);
});

test('a face: the photo in the role\'s ring, the initials on it without one, and the initials when the photo fails', () => {
  const Face = ofType(drive(Row, { card: CARD() }), 'MktDirFace')[0].type;
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
  assert.equal(initials.text, 'KP', 'a "Dr." is left off');
  assert.equal(initials.nodes()[0].props.style.border, '2px solid #a07a2e', 'a nutritionist\'s ring is gold on a light paper');
});

test('Your team: each coach a row with Message, its unread count said', () => {
  let msg = 0;
  const Team = ofType(drive(BSMarketDirectory, { team: [{ key: 'a', name: 'Jordan Chen', nutri: false, photo: null, unread: 0, onMessage() {} }] }), 'MktDirTeam')[0].type;
  const d = drive(Team, { team: [{ key: 'a', name: 'Jordan Chen', nutri: false, photo: null, unread: 2, onMessage: () => { msg += 1; } }, { key: 'b', name: null, nutri: true, photo: null, unread: 0, onMessage() {} }] });
  const buttons = d.nodes().filter((n) => n.type === 'button');
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every((b) => minH(b) >= 44));
  assert.equal(buttons[0].props['aria-label'], 'Message Jordan Chen, 2 new');
  buttons[0].props.onClick();
  assert.equal(msg, 1);
  const head = ofType(d, 'MktDirHead')[0];
  assert.equal(head.props.title, 'Your team');
  assert.equal(textOf({ props: { children: head.props.aside } }), '2 coaches');
  assert.match(d.text, /Nutritionist/, 'a coach whose name could not be read is named by their role');
});

test('the Apply line, What\'s hot\'s switch and the sort: each a 44px target', () => {
  let applied = 0;
  const p = drive(BSMarketDirectory, { onApply: () => { applied += 1; }, list: [CARD()], sort: 'best', onSort() {} });
  const Apply = ofType(p, 'MktDirApply')[0];
  const a = drawn(Apply);
  const go = a.nodes().find((n) => n.type === 'button');
  assert.ok(minH(go) >= 44);
  assert.equal(textOf(go).trim(), 'Apply →');
  assert.match(a.text, /^Coaching on Shape\?/);
  go.props.onClick();
  assert.equal(applied, 1);
  const sw = drawn(ofType(p, 'MktDirSwitch')[0]);
  assert.ok(sw.nodes().filter((n) => n.type === 'button').every((k) => minH(k) >= 44));
  const listHead = ofType(p, 'MktDirHead').find((n) => n.props.aside && n.props.aside.type && n.props.aside.type.name === 'MktDirSelect');
  const sort = listHead && listHead.props.aside;
  assert.ok(sort, 'the sort sits on the list\'s head');
  assert.deepEqual(sort.props.options.map(([, l]) => l), ['Best match', 'Highest rated', 'Price low to high', 'Most experience']);
  const s = drawn(sort);
  assert.ok(minH(s.nodes()[0]) >= 44);
  assert.equal(s.nodes().find((n) => n.type === 'select').props.style.fontSize, 16, 'no zoom on focus');
});

// ── The mapping: a live listing says only what it states ───────────────────────────────────────────

test('a live listing: rated by its reviews or New, no place, no format, no session count or match, its price with its unit', () => {
  const trainer = mapSupabaseProvider({ id: 7, name: 'Leah Kim', owner_id: 'u-leah', rating: 4.8, session_price: 95, price: 260, experience: '', subscribers: 40, tags: ['HIIT'] }, 'Trainer');
  assert.equal(trainer.rating, null);
  assert.equal(trainer.ratingLive, true);
  assert.equal(trainer.loc, null, 'no made-up Remote');
  assert.equal(trainer.format, null);
  assert.equal(trainer.years, null, 'no year nobody stated');
  assert.ok(!('sessionCount' in trainer) && !('match' in trainer), 'no invented session count or match');
  assert.equal(trainer.clients, 40, 'an account\'s real subscriber count');
  assert.deepEqual(bsmPriceOf(trainer), { amount: 95, per: 'session' });
  const monthlyTrainer = mapSupabaseProvider({ id: 8, name: 'Ari', owner_id: 'u-ari', price: 240 }, 'Trainer');
  assert.deepEqual(bsmPriceOf(monthlyTrainer), { amount: 240, per: 'month' }, 'a trainer with no session price is priced per month');
  const seeded = mapSupabaseProvider({ id: 9, name: 'Rae Lindqvist', owner_id: null, rating: 4.9, price: 140, meal_plan_price: 35, subscribers: 320 }, 'Nutritionist');
  assert.equal(seeded.rating, null, 'a seeded listing is not 9.8 by a column nobody writes');
  assert.equal(seeded.clients, 0, 'a seeded listing\'s subscriber count is nobody');
  assert.deepEqual(bsmPriceOf(seeded), { amount: 140, per: 'month' }, 'a nutritionist is priced per month');
  assert.equal(seeded.rate, 35, 'the listing\'s one-time price stays its rate (THE LISTING\'s Book now)');
  assert.equal(bsmPriceOf(mapSupabaseProvider({ id: 10, name: 'X' }, 'Trainer')), null, 'no price, none printed');
});
