// The member's Coaches tab (owner, 2026-11-09): "place-1", a sixth tab between Eat and Chat; "look-B",
// the Browse list; filters "option 1", the one sheet behind a Filters button. Driven through the real
// marketplace screen, with its effects run, on live listings read from a fake database, as well as on
// the example roster.
//
// What it pins:
//   · THE NAV: six tabs in one order, Home · Train · Eat · Coaches · Chat · Me, the tab bar's and the
//     swipe's (BS_MEMBER_TABS); a deep link with a role (shape:openMarket { role }) opens on that role;
//     Goals sends its role as detail.role, the way the shell reads it.
//   · HONESTY (the website's rules): a listing nobody has reviewed reads New and no rating; a trainer is
//     priced per session and a nutritionist per month; a live listing claims no city and no way of
//     meeting, so neither filter offers a match; open times are the coach's own calendar.
//   · THE FILTERS: each one on is a chip that takes it off; Clear all clears them; the Filters button
//     counts them; the role is the row's first chip.
//   · THE DOORS: "Coaching on Shape? Apply →" on every role and while searching; Settings' Coach on Shape
//     row, In review for a pending application; an approved dietitian's coach app in Profile mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IntlMessageFormat } from 'intl-messageformat';
import { drive, textOf, SHIM, ROOT, loadBroadsheet, loadCarved } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };

const DIR = join(ROOT, 'mobile-app/src/broadsheet');
const read = (f) => fs.readFileSync(join(DIR, f), 'utf8');
const fnNamed = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
const ofType = (d, name) => d.nodes().filter(fnNamed(name));
const drawn = (el) => drive(el.type, el.props);
const minH = (n) => Number(n.props.style.minHeight || n.props.style.height || 0);

// The hook shim with its effects KEPT: each render queues them, and flush() runs them, waits for what
// they started, and renders again (the shared harness drops effects, which would skip the live read).
let EFFECTS = [];
const SHIM_FX = { ...SHIM, useEffect(fn) { EFFECTS.push(fn); } };
const REG = (react) => ({ registry: new Map([['react', react], ['react-dom', { createPortal: (n) => n }]]) });
const MKT = join(DIR, 'iosAppBroadsheetMarketplace.jsx');
const { BSMarketplaceScreen, mapSupabaseProvider, bsmPriceOf, getCoachRating10, bsmMergeReviewSummaries } = await loadRealModule(MKT, {
  ...REG(SHIM_FX),
  appendExports: 'exports.BSMarketplaceScreen = BSMarketplaceScreen; exports.mapSupabaseProvider = mapSupabaseProvider; exports.bsmPriceOf = bsmPriceOf; exports.getCoachRating10 = getCoachRating10; exports.bsmMergeReviewSummaries = bsmMergeReviewSummaries;',
});
const { BSMarketDirectory } = await loadRealModule(join(DIR, 'BSMarketDirectory.jsx'), REG(SHIM));
globalThis.BSPublicProfile = function BSPublicProfile() { return null; };

const screen = (props = {}) => {
  EFFECTS = [];
  const d = drive(BSMarketplaceScreen, { onProfile() {}, ...props });
  const dir = () => d.nodes()[0];
  const flush = async () => {
    for (let i = 0; i < 4; i += 1) {
      const run = EFFECTS.splice(0);
      for (const f of run) { try { f(); } catch (e) { /* an effect's own failure is its own */ } }
      await new Promise((r) => setTimeout(r, 15));
      d.render();
    }
  };
  return { d, dir, page: () => drawn(dir()), flush };
};

// ── The nav ──────────────────────────────────────────────────────────────────────────────────────

test('the nav: six tabs, Coaches between Eat and Chat, in the tab bar\'s order and the swipe\'s', async () => {
  const { BS_MEMBER_TABS, bsNavStepTab } = await import(pathToFileURL(join(DIR, 'bsNavShell.js')).href);
  assert.deepEqual([...BS_MEMBER_TABS], ['home', 'train', 'eat', 'market', 'chat', 'me']);
  assert.equal(bsNavStepTab(BS_MEMBER_TABS, 'eat', 'next-tab'), 'market', 'a swipe from Eat lands on Coaches');
  assert.equal(bsNavStepTab(BS_MEMBER_TABS, 'market', 'next-tab'), 'chat');
  assert.equal(bsNavStepTab(BS_MEMBER_TABS, 'market', 'prev-tab'), 'eat');
  const client = read('iosAppBroadsheetClient.jsx');
  // The bar is built from the one list, Coaches labelled by common:nav.coaches; the swipe steps the same list.
  assert.match(client, /tabs=\{BS_MEMBER_TABS\.map\(\(key\) => \(\{/);
  assert.match(client, /market: \{ key: 'market', label: tr\('common:nav\.coaches', \{ defaultValue: 'Coaches' \}\) \},/);
  assert.match(client, /const next = bsNavStepTab\(BS_MEMBER_TABS, tab, intent\);/);
  // Tapping Coaches opens it on Both; the tab is a root, so it draws no ← Back.
  // The bar and the swipes enter a tab one way (enterTab): Coaches from elsewhere opens on Both.
  assert.match(client, /onChange=\{enterTab\}/);
  assert.match(client, /if \(k === 'market' && tab !== 'market'\) \{ setMarketRole\(null\); setMarketCoach\(null\); \}/);
  assert.match(client, /market: {2}<BSMarketplaceScreen initialRole=\{marketRole\} initialCoach=\{marketCoach\} onCoachConsumed=\{\(\) => setMarketCoach\(null\)\} onProfile=\{goSettings\} goChat=\{goChat\} \/>,/);
  // The chrome draws Coaches as its own icon, a megaphone in the other icons' line, filled when lit (owner,
  // 2026-11-10: "go with 6"; it was a whistle).
  const chrome = read('iosAppBroadsheet.jsx');
  assert.match(chrome, /const BS_TAB_ICON_KEYS = new Set\(\['home', 'train', 'eat', 'market', 'chat',/);
  assert.equal((chrome.match(/case 'market': return <svg \{\.\.\.p\}>/g) || []).length, 2, 'a line icon and a filled one');
  assert.match(chrome, /case 'market': return <svg \{\.\.\.p\}><path \{\.\.\.F\} d="M3\.6 9\.6h3\.6L16\.6 4\.8v14l-9\.4-4\.4H3\.6z" \/>/, 'the filled megaphone');
  assert.match(chrome, /case 'market': return <svg \{\.\.\.p\}><path d="M3\.8 9\.8h3\.4L16\.5 5v13\.6l-9\.3-4\.4H3\.8z" \/>/, 'the line megaphone');
  assert.doesNotMatch(chrome, /A5\.5 5\.5 0 1 0 14\.4 12\.8Z/, 'no whistle left');
  // Six tabs fit a 320px phone at 44px each: the capsule's ends come in to 4px.
  assert.match(chrome, /const PAD = n >= 6 \? 4 : 9;/);
  assert.ok((320 - 2 * 24 - 2 * 4) / 6 >= 44);
});

test('a deep link with a role opens the tab on that role; Goals sends its role the way the shell reads it', () => {
  const client = read('iosAppBroadsheetClient.jsx');
  assert.match(client, /setMarketRole\(typeof e\?\.detail\?\.role === 'string' \? e\.detail\.role : null\);/);
  const goals = read('BSGoals.jsx');
  assert.match(goals, /new CustomEvent\('shape:openMarket', \{ detail: \{ role: 'trainer' \} \}\)/);
  assert.match(goals, /new CustomEvent\('shape:openMarket', \{ detail: \{ role: 'nutritionist' \} \}\)/);
  assert.doesNotMatch(goals, /detail: '(trainer|nutritionist)'/, 'a bare string is lost: the shell reads detail.role');
  // shape:openMarket { role: 'trainer' } sets the shell's role, which the screen opens on.
  delete globalThis.ShapeAuth;
  const t = screen({ initialRole: 'trainer' });
  assert.equal(t.dir().props.filters.role, 'Trainers', 'not All, as it used to open');
  assert.ok(t.dir().props.list.length > 0 && t.dir().props.list.every((c) => !c.nutri));
  assert.equal(screen({ initialRole: 'nutritionist' }).dir().props.filters.role, 'Nutritionists');
  assert.equal(screen().dir().props.filters.role, 'Both');
});

// ── Honesty, on live listings ────────────────────────────────────────────────────────────────────

// A fake database: two listings, a trainer with an account (reviewed, priced per session, open
// tomorrow) and Shape's seeded nutritionist (no account, no reviews, priced per month, featured).
function liveWorld() {
  const tomorrow = new Date(Date.now() + 86400000);
  const rows = {
    trainers: [{ id: 7, name: 'Leah Kim', owner_id: 'u-leah', specialty: 'Strength training', tags: ['Strength', 'Hypertrophy'], session_price: 95, price: 260, rating: 4.8, verified: true, listing_media: null }],
    nutritionists: [{ id: 52, name: 'Rae Lindqvist', owner_id: null, specialty: 'Sports nutrition', tags: ['Endurance'], price: 140, meal_plan_price: 35, rating: 4.9, featured: true, listing_media: null }],
  };
  const from = (table) => {
    const q = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: rows[table] || [], error: null }) };
    return q;
  };
  globalThis.ShapeAuth = { client: { from }, getCachedState: () => ({ user: { id: 'member-1' } }) };
  globalThis.ShapeCoachReviews = { summaries: async () => ({ owners: { 'u-leah': { avg: 9.2, count: 4 } } }) };
  globalThis.ShapeCoachAvailability = {
    get: async (role, id) => (role === 'trainer' && String(id) === '7'
      ? { slots: [{ weekday: tomorrow.getUTCDay(), start_minute: 15 * 60, duration_min: 120 }], booked: [], busy: [], rules: null, timezone: 'UTC', atCapacity: false }
      : null),
  };
  globalThis.ShapePlan = { get: async () => ({ ok: true, training: { hasPlan: false, coaching: null }, meals: { hasPlan: false, coaching: null } }) };
}
function liveWorldDone() {
  for (const k of ['ShapeAuth', 'ShapeCoachReviews', 'ShapeCoachAvailability', 'ShapePlan']) delete globalThis[k];
}

test('filters chosen over the example roster are held to what the live listings carry once they land (Codex on #2667)', async () => {
  liveWorld();
  try {
    const s = screen();
    // While the directory is read, the example roster shows, with its cities and ways of meeting.
    const f0 = s.dir().props.filters;
    const city = f0.city && f0.city.options.find((c) => c !== 'Anywhere');
    assert.ok(city, 'the example roster offers a city');
    f0.city.onChange(city); s.d.render();
    s.dir().props.filters.meet.onChange('inperson'); s.d.render();
    assert.deepEqual(s.dir().props.filters.applied.map((a) => a.key).sort(), ['city', 'meet']);
    // The live listings land; they state no city and no way of meeting.
    await s.flush();
    const f = s.dir().props.filters;
    assert.equal(f.applied.length, 0, 'a city or way of meeting the live listings do not carry stayed on');
    // Remote, chosen over the examples, stays on: every live coach meets remotely.
    f.meet.onChange('remote'); s.d.render();
    assert.equal(s.dir().props.list.length, 2, 'Remote hid a live coach');
    assert.equal(s.dir().props.list.length, 2, 'and hid every live coach');
  } finally { liveWorldDone(); }
});

test('a live listing: its reviews or New, its price with its unit, its own open times, and no place or format claimed', async () => {
  liveWorld();
  try {
    const s = screen();
    await s.flush();
    const { list, picks, filters, listKind } = s.dir().props;
    assert.deepEqual(list.map((c) => c.name).sort(), ['Leah Kim', 'Rae Lindqvist']);
    const leah = list.find((c) => c.name === 'Leah Kim');
    const rae = list.find((c) => c.name === 'Rae Lindqvist');
    // Reviews or New: never the column's 4.8 / 4.9.
    assert.equal(leah.score, 9.2, 'her four reviews\' average');
    assert.equal(rae.score, null, 'a listing nobody has reviewed has no rating');
    assert.equal(rae.example, false);
    // Per session for the trainer, per month for the nutritionist.
    assert.deepEqual(leah.price, { amount: 95, per: 'session' });
    assert.deepEqual(rae.price, { amount: 140, per: 'month' });
    // The next open intro from her own calendar; none for a listing with no account behind it.
    assert.ok(leah.next && !leah.next.full && /\d/.test(leah.next.text), 'Leah\'s next open time');
    assert.equal(rae.next, null);
    // No listing states a city, so City offers no match ("Not listed yet"). How you meet is there: every coach
    // meets remotely (owner, 2026-11-11), so Remote keeps both live listings and In person keeps none (Codex on
    // #2715: the control went with the live roster).
    assert.equal(filters.city, null);
    assert.ok(filters.meet, 'How you meet is gone once the live listings land');
    filters.meet.onChange('remote'); s.d.render();
    assert.deepEqual(s.dir().props.list.map((c) => c.name).sort(), [leah.name, rae.name].sort(), 'Remote left out a live coach');
    s.dir().props.filters.meet.onChange('inperson'); s.d.render();
    assert.equal(s.dir().props.list.length, 0, 'a live listing that states no format passed In person');
    s.dir().props.filters.meet.onChange('either'); s.d.render();
    assert.equal(filters.openWeek.count, 1, 'only Leah has an open intro this week');
    // The head claims bookable coaches only when every one has an account.
    assert.equal(listKind, 'listed');
    // Editors' picks: what Shape features, nothing else.
    assert.deepEqual(picks.map((c) => c.name), ['Rae Lindqvist']);
    // The row prints New, never a number, and each price with its unit.
    const Row = ofType(drawn(s.dir()), 'MktDirRow')[0].type;
    const raeRow = drive(Row, { card: rae });
    const meta = drawn(ofType(raeRow, 'MktDirMeta')[0]);
    assert.equal(drawn(ofType(meta, 'MktDirRating')[0]).text, 'New');
    assert.match(meta.text, /\$140\/month/);
    assert.doesNotMatch(meta.text, /★/);
    const leahMeta = drawn(ofType(drive(Row, { card: leah }), 'MktDirMeta')[0]);
    assert.match(leahMeta.text, /\$95\/session/);
    // Open intro this week leaves her alone.
    s.dir().props.filters.openWeek.onToggle();
    s.d.render();
    assert.deepEqual(s.dir().props.list.map((c) => c.name), ['Leah Kim']);
  } finally { liveWorldDone(); }
});

test('the mapping and the merge: no review, no rating; a failed summary read invents none', () => {
  const rows = [mapSupabaseProvider({ id: 3, name: 'Kai', owner_id: 'u-kai', rating: 4.8, session_price: 80 }, 'Trainer'), mapSupabaseProvider({ id: 4, name: 'Mo', owner_id: null, rating: 5, price: 150 }, 'Nutritionist')];
  bsmMergeReviewSummaries(rows, null);
  assert.deepEqual(rows.map((c) => getCoachRating10(c)), [null, null]);
  assert.deepEqual(rows.map((c) => bsmPriceOf(c)), [{ amount: 80, per: 'session' }, { amount: 150, per: 'month' }]);
});

// ── The filters ──────────────────────────────────────────────────────────────────────────────────

test('the filters: each one on is a chip that takes it off, the button counts them, Clear all clears them', () => {
  delete globalThis.ShapeAuth;
  const s = screen();
  const f = () => s.dir().props.filters;
  const all = s.dir().props.list.length;
  assert.equal(f().applied.length, 0);
  // Strength, from the sheet's goals (its count is the coaches it would leave).
  const strength = f().goals.find((g) => g.key === 'strength');
  assert.ok(strength.count > 0 && strength.count < all);
  strength.onToggle();
  s.d.render();
  assert.equal(s.dir().props.list.length, strength.count);
  assert.deepEqual(f().applied.map((a) => a.label), ['Strength']);
  // Open intro this week, and a way to meet.
  f().openWeek.onToggle();
  s.d.render();
  f().meet.onChange('inperson');
  s.d.render();
  assert.deepEqual(f().applied.map((a) => a.label), ['Strength', 'Open intro this week', 'In person']);
  // The row under the search: the role first, then each one on, a tap takes it off; the button's count.
  const filters = drawn(ofType(drawn(s.dir()), 'BSMktFilters')[0]);
  const chips = filters.nodes().filter((n) => n.type === 'button' && n.props['data-mkt-applied']);
  assert.deepEqual(chips.map((b) => textOf(b)), ['Strength×', 'Open intro this week×', 'In person×']);
  assert.ok(chips.every((b) => minH(b) >= 44));
  assert.equal(chips[0].props['aria-label'], 'Remove Strength');
  const roleChip = ofType(filters, 'MktDirSelect')[0];
  assert.equal(roleChip.props.value, 'Both');
  assert.deepEqual(roleChip.props.options.map(([k]) => k), ['Both', 'Trainers', 'Nutritionists']);
  const badge = filters.nodes().find((n) => n.props['data-mkt-filters-count'] != null);
  assert.equal(textOf(badge), '3', 'the badge counts the filters on, beyond the role');
  assert.equal(filters.nodes().find((n) => n.props['data-mkt-filters-open'] != null).props['aria-label'], 'Filters, 3 on');
  // × takes one off.
  chips[2].props.onClick();
  s.d.render();
  assert.deepEqual(f().applied.map((a) => a.label), ['Strength', 'Open intro this week']);
  // The sheet: open, Clear all, and Show n coaches.
  f().onOpen();
  s.d.render();
  const opened = drawn(ofType(drawn(s.dir()), 'BSMktFilters')[0]);
  const sheet = ofType(opened, 'MktDirFilterSheet')[0];
  assert.ok(sheet, 'the sheet is open');
  const sh = drawn(sheet);
  assert.equal(textOf(sh.nodes().find((n) => n.props['data-mkt-show'] != null)), `Show ${s.dir().props.list.length} coaches`);
  sh.nodes().find((n) => n.props['data-mkt-clear-all'] != null).props.onClick();
  s.d.render();
  assert.equal(f().applied.length, 0, 'Clear all clears every filter');
  assert.equal(s.dir().props.list.length, all);
  const after = drawn(ofType(drawn(s.dir()), 'BSMktFilters')[0]);
  assert.ok(!after.nodes().some((n) => n.props['data-mkt-filters-count'] != null), 'no count with nothing on');
  // Show n coaches closes it.
  drawn(ofType(after, 'MktDirFilterSheet')[0]).nodes().find((n) => n.props['data-mkt-show'] != null).props.onClick();
  s.d.render();
  assert.equal(f().open, false);
});

test('every goal the website has (owner: "make sure all goals are here"): the same ids and patterns, a role\'s own only', () => {
  // The same goals, filed by the same patterns, as the website's matcher (public/newdesign/marketplace.jsx).
  const web = fs.readFileSync(join(ROOT, 'public/newdesign/marketplace.jsx'), 'utf8');
  const app = read('iosAppBroadsheetMarketplace.jsx');
  const ids = (src, open) => [...src.slice(src.indexOf(open), src.indexOf('];', src.indexOf(open))).matchAll(/id: ["'](\w+)["']/g)].map((m) => m[1]);
  const webIds = ids(web, 'const MK_GOALS = [');
  assert.ok(webIds.length >= 21, 'the website lists its goals');
  assert.deepEqual(ids(app, 'const BSM_GOALS = ['), webIds);
  const rx = (src, open) => Object.fromEntries([...src.slice(src.indexOf(open), src.indexOf('};', src.indexOf(open))).matchAll(/^\s+(\w+): (\/.+\/i),$/gm)].map((m) => [m[1], m[2]]));
  assert.deepEqual(rx(app, 'const BSM_GOAL_RX = {'), rx(web, 'const MK_GOAL_RX = {'));
  // The categories a listing files under are the keyword table's, the list the website's test reads.
  const cats = /const BSM_MARKETPLACE_CATEGORIES = \{([\s\S]*?)\n\};/.exec(app);
  const table = /const BSM_CAT_KEYWORDS = \{([\s\S]*?)\n\};/.exec(app);
  assert.ok(cats && table);
  for (const side of ['Trainer', 'Nutritionist']) {
    const listed = [...new RegExp(`${side}: \\[([^\\]]*)\\]`).exec(cats[1])[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    const body = table[1].split(/\n {2}Nutritionist: \[/)[side === 'Trainer' ? 0 : 1];
    const keyed = [...body.matchAll(/^\s+\['([^']+)', \[/gm)].map((m) => m[1]).sort();
    assert.deepEqual(listed, keyed, side);
  }
  delete globalThis.ShapeAuth;
  // Both: the six, and every other goal an example coach is filed under, each with its count.
  const both = screen().dir().props.filters;
  const CARDS = ['strength', 'fatloss', 'endurance', 'mobility', 'nutrition', 'general'];
  for (const k of CARDS) assert.ok(both.goals.some((g) => g.key === k), k);
  assert.ok(both.goals.length > CARDS.length, 'the role-specific goals show once a coach is filed under them');
  for (const g of both.goals) {
    if (!CARDS.includes(g.key)) assert.ok(g.count > 0, `${g.key} shows with no coach under it`);
    assert.notEqual(g.label, g.key, `${g.key} has words`);
  }
  // A trainer's goals only on Trainers, a nutritionist's only on Nutritionists.
  const NU = ['nutrition', 'weight', 'muscle', 'gut', 'plant', 'prenatal', 'mealprep', 'medical', 'longevity'];
  const TR = ['running', 'hyrox', 'hiit', 'bodybuilding', 'functional', 'home', 'women'];
  const trainers = screen({ initialRole: 'trainer' }).dir().props.filters;
  assert.ok(!trainers.goals.some((g) => NU.includes(g.key)), 'a nutritionist\'s goal on Trainers');
  const nutri = screen({ initialRole: 'nutritionist' }).dir().props.filters;
  assert.ok(!nutri.goals.some((g) => TR.includes(g.key)), 'a trainer\'s goal on Nutritionists');
  // A role leaves behind the goals it can't hold.
  const s = screen();
  const nuGoal = s.dir().props.filters.goals.find((g) => NU.includes(g.key));
  const trGoal = s.dir().props.filters.goals.find((g) => TR.includes(g.key));
  assert.ok(nuGoal && trGoal, 'the example roster files coaches under both kinds');
  nuGoal.onToggle(); s.d.render();
  s.dir().props.filters.goals.find((g) => g.key === trGoal.key).onToggle(); s.d.render();
  s.dir().props.filters.onRole('Trainers'); s.d.render();
  assert.deepEqual(s.dir().props.filters.applied.map((a) => a.key), [`goal:${trGoal.key}`]);
});

test('a role switch drops a city its coaches are not in, and keeps one they are (Codex on #2667)', () => {
  delete globalThis.ShapeAuth;
  const cityOpts = (role) => screen({ initialRole: role }).dir().props.filters.city?.options || [];
  const tr = cityOpts('trainer');
  const nu = new Set(cityOpts('nutritionist'));
  const only = tr.find((c) => c !== 'Anywhere' && !nu.has(c));
  const shared = tr.find((c) => c !== 'Anywhere' && nu.has(c));
  assert.ok(only, 'the example roster has a trainers-only city');
  const s = screen({ initialRole: 'trainer' });
  s.dir().props.filters.city.onChange(only); s.d.render();
  assert.deepEqual(s.dir().props.filters.applied.map((a) => a.key), ['city']);
  s.dir().props.filters.onRole('Nutritionists'); s.d.render();
  assert.equal(s.dir().props.filters.applied.length, 0, 'the trainers-only city stayed on and hid every nutritionist elsewhere');
  assert.ok(s.dir().props.list.length > 0);
  if (shared) {
    const k = screen({ initialRole: 'trainer' });
    k.dir().props.filters.city.onChange(shared); k.d.render();
    k.dir().props.filters.onRole('Nutritionists'); k.d.render();
    assert.equal(k.dir().props.filters.city.value, shared, 'a city both roles are in stays');
  }
});

test('a jump that lands on the open tab with a role drops the filters that role can\'t hold, as the picker does (Codex on #2667)', () => {
  delete globalThis.ShapeAuth;
  const NU = ['nutrition', 'weight', 'muscle', 'gut', 'plant', 'prenatal', 'mealprep', 'medical', 'longevity'];
  const cityOpts = (role) => screen({ initialRole: role }).dir().props.filters.city?.options || [];
  const nu = new Set(cityOpts('nutritionist'));
  const only = cityOpts('trainer').find((c) => c !== 'Anywhere' && !nu.has(c));
  // On Both: a nutritionist's goal, a trainers-only city and a session budget; then a jump lands on the
  // open tab with a role (the shell hands the mounted tab a new initialRole).
  EFFECTS = [];
  const props = { onProfile() {} };
  const d = drive(BSMarketplaceScreen, props);
  const s = { d, dir: () => d.nodes()[0] };
  const land = (role) => {
    props.initialRole = role;
    EFFECTS = [];
    d.render();
    for (const fx of EFFECTS.splice(0)) { try { fx(); } catch (e) { /* an effect's own failure is its own */ } }
    d.render();
  };
  const nuGoal = s.dir().props.filters.goals.find((g) => NU.includes(g.key));
  nuGoal.onToggle(); s.d.render();
  s.dir().props.filters.city.onChange(only); s.d.render();
  s.dir().props.filters.budget.session?.onChange(s.dir().props.filters.budget.session.min + 5); s.d.render();
  land('trainer');
  const f = s.dir().props.filters;
  assert.equal(f.role, 'Trainers');
  assert.ok(!f.applied.some((a) => a.key === `goal:${nuGoal.key}`), 'a nutritionist\'s goal stayed on Trainers');
  assert.ok(f.applied.some((a) => a.key === 'city'), 'a city the trainers are in stays');
  land('nutritionist');
  const g = s.dir().props.filters;
  assert.equal(g.role, 'Nutritionists');
  assert.ok(!g.applied.some((a) => a.key === 'city' || a.key === 'maxSession'), 'the trainers-only city and the session budget went');
  assert.ok(s.dir().props.list.length > 0, 'and the list is not emptied by them');
  // The picker and the jump share the one rule.
  const src = read('iosAppBroadsheetMarketplace.jsx');
  assert.equal((src.match(/bsmFiltersForRole\(prev, r, /g) || []).length, 2);
});

test('the sheet: goals with counts, a city picker, a budget per unit, how you meet, open intro; "Not listed yet" where nothing is', () => {
  delete globalThis.ShapeAuth;
  const s = screen({ initialRole: 'trainer' });
  const f = s.dir().props.filters;
  assert.ok(f.city && f.city.options[0] === 'Anywhere' && f.city.options.length > 1, 'only the cities the coaches are in');
  assert.ok(f.budget.session && !f.budget.month, 'a trainer\'s budget is per session');
  assert.ok(!f.goals.some((g) => g.key === 'nutrition'), 'Sports nutrition is a nutritionist\'s goal');
  f.budget.session.onChange(150);
  s.d.render();
  assert.ok(s.dir().props.list.every((c) => c.price.amount <= 150));
  assert.deepEqual(s.dir().props.filters.applied.map((a) => a.label), ['Up to $150/session']);
  const nu = screen({ initialRole: 'nutritionist' }).dir().props.filters;
  assert.ok(nu.budget.month && !nu.budget.session, 'a nutritionist\'s budget is per month');
  // Drawn: every control a 44px target; a section with nothing to offer says so.
  const Sheet = ofType(drawn(ofType(drive(BSMarketDirectory, { filters: { ...f, open: true } }), 'BSMktFilters')[0]), 'MktDirFilterSheet')[0].type;
  const full = drive(Sheet, { f: { ...f, open: true } });
  assert.ok(full.nodes().filter((n) => n.type === 'button').every((b) => minH(b) >= 44), 'a target under 44px');
  assert.equal(full.nodes().filter((n) => n.props['data-mkt-goal']).length, f.goals.length);
  assert.ok(full.nodes().some((n) => n.type === 'input' && n.props.type === 'range'), 'the budget is a slider');
  assert.equal(full.nodes().filter((n) => n.props['data-mkt-not-listed'] != null).length, 0);
  const bare = drive(Sheet, { f: { ...f, open: true, city: null, meet: null, budget: { session: null, month: null } } });
  assert.equal(bare.nodes().filter((n) => n.props['data-mkt-not-listed'] != null).length, 3, 'City, Budget and How you meet say Not listed yet');
  assert.match(bare.text, /Not listed yet/);
});

// ── The doors ────────────────────────────────────────────────────────────────────────────────────

test('the Apply line: on every role and while searching, opening the application on the role picked', () => {
  delete globalThis.ShapeAuth;
  const s = screen();
  s.dir().props.onQuery('zzzz');
  s.d.render();
  assert.equal(s.dir().props.list.length, 0);
  const p = drawn(s.dir());
  const line = ofType(p, 'MktDirApply');
  assert.equal(line.length, 1, 'the Apply line stays while searching');
  assert.match(drawn(line[0]).text, /Coaching on Shape\?Apply →/);
  globalThis.BSProviderApplicationScreen = function BSProviderApplicationScreen() { return null; };
  try {
    s.dir().props.onApply();
    s.d.render();
    assert.equal(s.d.nodes()[0].props.initialRole, 'trainer', 'a trainer\'s on Both');
  } finally { delete globalThis.BSProviderApplicationScreen; }
  const old = read('BSMarketDirectory.jsx');
  assert.doesNotMatch(old, /Apply to be a/, 'the two Apply tiles are gone');
});

// The client module, once, for Settings' pure parts.
const client = await loadBroadsheet(['bsCoachApplyRow', 'bsAccountRoles']);
const tr = (k, o = {}) => new IntlMessageFormat(String(o.defaultValue ?? k), 'en').format(o);

test('Settings › Coach on Shape: the door, or the stage the route says, with what was sent', async () => {
  const door = client.bsCoachApplyRow(null, { tr });
  assert.deepEqual(door, { title: 'Coach on Shape', summary: 'Apply as a trainer or nutritionist', detail: 'coachapply' });
  // While the status is read: not the door, and its tap waits.
  const reading = client.bsCoachApplyRow(undefined, { tr });
  assert.equal(reading.summary, 'Checking your application…');
  assert.equal(reading.wait, true);
  assert.equal(reading.tag, undefined);
  assert.deepEqual(client.bsCoachApplyRow({ role: 'trainer', stage: 'withdrawn', submittedAt: '2026-11-01T10:00:00Z' }, { tr }).summary, 'Apply as a trainer or nutritionist', 'a withdrawn application is the door again');
  // ⚠ A failed read is not "no application": it says so, and offers no fresh Apply over one it could not see.
  const unread = client.bsCoachApplyRow({ unavailable: true }, { tr });
  assert.equal(unread.summary, 'Couldn’t check your application · tap to try again');
  assert.equal(unread.tag, undefined);
  assert.equal(unread.retry, true, 'its tap reads again (Codex on #2667), never a fresh application');
  assert.equal(door.retry, undefined);
  const sent = client.bsCoachApplyRow({ role: 'nutritionist', stage: 'submitted', submittedAt: '2026-11-07T10:00:00Z', decidedAt: null }, { tr, amber: '#d8a23a', locale: 'en-US' });
  assert.equal(sent.title, 'Coach on Shape');
  assert.deepEqual(sent.tag, { text: 'Submitted', color: '#d8a23a' });
  // ⚠ An application under way is status only (Codex on #2667): its tap reads the status again.
  assert.equal(sent.retry, true);
  assert.equal(sent.summary, 'Nutritionist application · sent Nov 7 · usually 2–3 business days');
  // A reviewer opening it is In review; Background check only once the reviewer has asked for one.
  const pending = client.bsCoachApplyRow({ role: 'trainer', stage: 'in_review', submittedAt: null }, { tr, amber: '#d8a23a' });
  assert.deepEqual(pending.tag, { text: 'In review', color: '#d8a23a' });
  assert.equal(pending.summary, 'Trainer application · usually 2–3 business days');
  assert.equal(client.bsCoachApplyRow({ role: 'trainer', stage: 'background_check', submittedAt: null }, { tr }).tag.text, 'Background check');
  const approved = client.bsCoachApplyRow({ role: 'trainer', stage: 'approved', submittedAt: '2026-11-02T10:00:00Z' }, { tr, locale: 'en-US' });
  assert.equal(approved.tag.text, 'Approved');
  assert.equal(approved.summary, 'Trainer application · sent Nov 2', 'no wait is promised once it is decided');
  assert.equal(client.bsCoachApplyRow({ role: 'trainer', stage: 'not_approved' }, { tr }).tag.lit, false);
  assert.equal(client.bsCoachApplyRow({ role: 'trainer', stage: 'not_approved' }, { tr }).retry, undefined, 'not approved may apply again');
  assert.equal(approved.retry, true, 'approved is status only');
  for (const stage of ['in_review', 'background_check']) assert.equal(client.bsCoachApplyRow({ role: 'trainer', stage }, { tr }).retry, true, stage);
  // A dietitian's application is named as one (it rides the nutritionist rails, Codex on #2667).
  assert.match(client.bsCoachApplyRow({ role: 'dietitian', stage: 'submitted', submittedAt: null }, { tr }).summary, /^Dietitian application \(RD\/RDN\)/);
  // Drawn by the Settings root: the tag in its lit slot beside the row.
  const { BSSettingsRoot } = await loadCarved('BSSettingsRoot.jsx');
  const root = drive(BSSettingsRoot, { also: [pending] });
  const row = root.nodes().find((n) => n.type === 'button' && n.props['data-settings-door'] === 'coachapply');
  assert.ok(row);
  assert.ok(minH(row) >= 44);
  assert.match(textOf(row), /Coach on Shape.*In review/);
  // The client: hidden for a coach, read from /api/me/application, the screen full screen over Settings.
  const src = read('iosAppBroadsheetClient.jsx');
  assert.match(src, /const coachAppRow = \(isCoachRole \|\| accountIsCoach\) \? null/);
  // Any coach role the account holds hides it, not only the primary one: an approved member keeps
  // profiles.role 'client' with the coach role in roles[] (Codex on #2667).
  assert.match(src, /\|\| accountRoles\.some\(\(x\) => x === 'trainer' \|\| x === 'nutritionist' \|\| x === 'dietitian'\);/);
  assert.ok(src.indexOf('const accountRoles = bsAccountRoles(') < src.indexOf('const accountIsCoach = ('), 'the roles are read before the guard');
  assert.match(src, /if \(d === 'coachapply'\) \{\n\s+if \(coachAppRow && coachAppRow\.wait\) return;\n\s+if \(coachAppRow && coachAppRow\.retry\) setCoachAppReads\(\(n\) => n \+ 1\);\n\s+else setShowApply\(true\);\n\s+return;\n\s+\}/, 'a row still reading waits, a failed read retries; only a read row opens the application');
  // ⚠ Unread is not "none" (Codex on #2667): the state starts undefined, each read sets it back, and a
  // missing reader is none.
  assert.match(src, /const \[coachApp, setCoachApp\] = useStateBSC\(undefined\);/);
  assert.match(src, /if \(!window\.ShapeApplications\?\.myStatus\) \{ setCoachApp\(null\); return undefined; \}\n\s+let live = true;\n\s+setCoachApp\(undefined\);/);
  // One way into a root tab for the bar and the swipes: entering Coaches from elsewhere opens it on Both.
  assert.match(src, /const enterTab = \(k\) => \{\n\s+if \(k === 'market' && tab !== 'market'\) \{ setMarketRole\(null\); setMarketCoach\(null\); \}\n(?:\s+\/\/[^\n]*\n)*\s+if \(k === 'chat' && tab !== 'chat'\) setChatRequest\(null\);\n\s+setTab\(k\);\n\s+\};/);
  assert.match(src, /navSlide\(intent === 'next-tab' \? 'l' : 'r'\);\n\s+enterTab\(next\);/, 'a swipe into Coaches kept a jump\'s role');
  assert.match(src, /onChange=\{enterTab\}/);
  assert.match(src, /if \(showApply && window\.BSProviderApplicationScreen\) \{/);
  const backend = fs.readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  assert.match(backend, /const res = await shapeApiFetch\('\/api\/me\/application'\);\n\s+if \(!res\.ok\) return \{ unavailable: true \};/, 'a refusal or failure is unavailable, never "none"');
  assert.match(backend, /\} catch \(e\) \{\n\s+return \{ unavailable: true \};\n\s+\}\n\}/, 'a network failure too');
  assert.match(src, /\(\) => \{ if \(live\) setCoachApp\(\{ unavailable: true \}\); \}/, 'a rejected read is unavailable on the row');
  assert.match(backend, /window\.ShapeApplications = \{\n\s+submitProviderApplication,\n\s+myStatus: getMyApplicationStatus,\n\};/);
});

test('Profile mode: an approved dietitian is offered the coach app (the nutrition one), named Dietitian', () => {
  assert.deepEqual(client.bsAccountRoles({ roles: ['client', 'dietitian'] }), ['client', 'dietitian']);
  assert.deepEqual(client.bsAccountRoles({ role: 'dietitian', roles: ['client'] }), ['client', 'dietitian'], 'the profile\'s own role counts too');
  assert.deepEqual(client.bsAccountRoles({ roles: ['client', 'nutritionist', 'dietitian'] }), ['client', 'nutritionist'], 'one entry for one app');
  assert.deepEqual(client.bsAccountRoles({ roles: ['client', 'Nutrition', 'trainer', 'admin'] }), ['client', 'nutritionist', 'trainer']);
  assert.deepEqual(client.bsAccountRoles(null), []);
  const src = read('iosAppBroadsheetClient.jsx');
  assert.match(src, /dietitian: tr\('coach:role\.dietitian', \{ defaultValue: 'Dietitian' \}\) \};/);
  assert.match(src, /const accountRoles = bsAccountRoles\(window\.ShapeAuth\?\.getCachedState\?\.\(\)\?\.profile\);/);
  // Picking it sets the role the shell routes to the nutrition coach app.
  assert.match(read('iosAppBroadsheetMain.jsx'), /dietitian: window\.BSNutritionistApp/);
});
