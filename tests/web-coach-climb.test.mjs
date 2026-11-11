// The Climb: the website's coach profile (public/newdesign/coachProfileWeb.jsx), mounted in jsdom and
// read as a visitor and as the coach see it. tests/web-coach-profile.test.mjs pins the parts the Climb
// kept from today's page (the storefront, the sheets, the reads that fail); this file pins the Climb's
// own rules:
//   · a real coach's page is that coach's data and never a sample: the stage, the plates, the summit,
//     the wire and the milestones are read figures, and a figure there is none of is left out;
//   · null is unread: nothing is claimed while a read is on its way (no summit, no open-times plate);
//   · a camp with nothing in it is hidden from a visitor and shown to the coach with what to add;
//   · the booking console and the range's Start go through today's paths (the booking page at a time,
//     the coach's chat, lvBuyPlan from the program's sheet);
//   · review words are for members: a visitor sees the rating, how many, and "Join Shape to read all N";
//   · the house rules: no coloured emoji, no ● in a pill, reduced motion stills the wire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const React = require('react');
const { JSDOM, VirtualConsole } = require('jsdom');
const { parse } = require('@babel/parser');
const K = await import('../public/newdesign/coachProfileKit.mjs');

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { if (!/navigation/i.test(String(e && e.message))) console.error(e); });
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/MemberProfile.html?u=coach-1&role=trainer', virtualConsole: vc });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;
globalThis.ReactDOM = require('react-dom');
let WIDE = true;
window.matchMedia = (q) => ({ get matches() { return /reduced-motion/.test(q) ? false : WIDE; }, addEventListener() {}, removeEventListener() {} });
window.Element.prototype.scrollIntoView = function () {};
window.ShapeCoachKit = K;
window.ShapeProfileLib = await import('../public/newdesign/profileCustom.mjs');
window.ShapeListingLib = await import('../public/newdesign/listingMedia.mjs');
window.BookingSlots = require('../public/newdesign/bookingSlots.js');
const { createRoot } = require('react-dom/client');
const SHARED = join(ROOT, 'public/newdesign/livingShared.jsx');
const sharedNames = parse(readFileSync(SHARED, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }).program.body
  .flatMap((n) => (n.type === 'FunctionDeclaration' ? [n.id.name] : n.type === 'VariableDeclaration' ? n.declarations.map((x) => x.id && x.id.name).filter(Boolean) : []));
Object.assign(globalThis, await loadRealModule(SHARED, { appendExports: `Object.assign(exports, { ${sharedNames.join(', ')} });` }));
const { WebCoachProfile } = await loadRealModule(join(ROOT, 'public/newdesign/coachProfileWeb.jsx'), { appendExports: 'exports.WebCoachProfile = WebCoachProfile;' });

const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const LISTING = { id: 7, name: 'Maya Okafor', specialty: 'Strength', price: 180, credential: 'NSCA-CSCS', verified: true, at_capacity: false, capacity_resume_at: null, listing_ready: true, monthly_offer: { includes: ['A program written for your week'] }, listing_media: null, owner_id: 'coach-1' };
const PLAN = { id: 'p1', kind: 'program', name: 'Strength Block 3', price: 59, category: 'strength', provider_id: 7, provider_role: 'trainer',
  detail: { preview: true, weeks: 12, media: [], blocks: [{ week: 0, day: 0, dayName: 'Squat', name: 'Back squat', equipment: 'Barbell', muscle: 'Quads' }] } };
const POST = { id: 41, title: 'Tempo week', note: 'Three down, one up.', metrics: { kind: 'photo' }, privacy: 'public', photo_url: 'https://cdn.test/tempo.jpg', created_at: new Date(Date.now() - 864e5).toISOString() };
const tomorrow = new Date(Date.now() + 864e5);
// One backend for the page: `reviews` is the reviews route's answer (or a function of nothing that
// returns a never-settling promise, for "on its way"); `posts`, `plans`, `listing` are the rows read.
function backend({ reviews = { reviews: [], avg: 9.9, count: 284, locked: true }, posts = [POST], plans = [PLAN], listing = LISTING, hours = true, holdWeek = false, postsGate = null } = {}) {
  const calls = [];
  const q = (table) => {
    const rows = table === 'trainers' || table === 'nutritionists' ? (listing ? [listing] : []) : table === 'community_posts' ? posts : [];
    // `postsGate`: a promise the posts read waits on, for a read that lands late.
    const ready = table === 'community_posts' && postsGate ? postsGate : Promise.resolve();
    const o = { select: () => o, eq: () => o, in: () => o, order: () => o, limit: () => o, maybeSingle: async () => ({ data: rows[0] || null, error: null }), then: (r, j) => ready.then(() => ({ data: rows, error: null })).then(r, j) };
    return o;
  };
  window.shapeDb = {
    getUser: async () => null,
    client: { from: q, rpc: async (fn) => (fn === 'get_coach_sale_plans_by_user' ? { data: plans, error: null } : { data: [], error: null }), auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getUser: async () => ({ data: { user: null } }) } },
  };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    const u = String(url);
    const j = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (u.startsWith('/api/availability')) {
      if (holdWeek) return new Promise(() => {});
      return j(200, { slots: hours ? [{ weekday: tomorrow.getDay(), start_minute: 600, duration_min: 60 }] : [], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, busy: [], booked: [], rules: { consultMin: 20 }, atCapacity: false });
    }
    if (u.startsWith('/api/coaches/reviews')) return typeof reviews === 'function' ? reviews() : j(200, reviews);
    if (u.startsWith('/api/stripe/checkout-session')) return j(200, { url: 'https://checkout.stripe.test/session' });
    if (u.startsWith('/api/waitlist/mine')) return j(200, { entries: [], clientOf: [] });
    return j(404, {});
  };
  return calls;
}
const ROW = { role: 'trainer', full_name: 'Maya Okafor', points: 2400, is_public: true, can_view: true, pronouns: 'she/her',
  goal: 'I rebuilt my programming around tempo work.', custom: { about: { story: 'Nine years on the floor.', years: 9, how: 'both' }, prompts: [{ q: 'form_check', a: 'Three seconds down, one paused.' }] } };
const LIVE = { mode: 'live', role: 'trainer', uid: 'coach-1', row: ROW, verified: true };
async function mount(props) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(WebCoachProfile, { chrome: false, follow: { followers: 3, following: 2, canFollow: true }, onFollow() {}, onMessage() {}, ...props })));
  await settle(); await settle();
  return { unmount: () => React.act(async () => root.unmount()) };
}
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
// What the page says, without its stylesheet.
const text = () => { const c = $('[data-coach-profile]').cloneNode(true); c.querySelectorAll('style').forEach((x) => x.remove()); return c.textContent; };
const camps = () => $$('[data-camp]').map((c) => c.getAttribute('data-camp'));
// The camp shown: one at a time, the others mounted and hidden (owner, 2026-11-11: "have it open its own page").
const shown = () => $$('[data-camp]').filter((c) => !c.hidden).map((c) => c.getAttribute('data-camp'));
const before = (a, b) => !!(a.compareDocumentPosition(b) & window.Node.DOCUMENT_POSITION_FOLLOWING);

test('a real coach\'s Climb is their own data, never the sample', async () => {
  WIDE = true; backend();
  const p = await mount(LIVE);
  assert.equal($('[data-coach-profile]').getAttribute('data-mode'), 'live');
  assert.ok($('[data-climb]'), 'the Climb layout');
  assert.ok(!$('[data-sample-note]'), 'no sample note on a real coach');
  // Nothing from the sample trainer (bsTrainerDemo) reaches a real coach's page.
  const demo = K.bsTrainerDemo({ media: '/newdesign/demo/' });
  for (const r of demo.reviews.list) assert.ok(!text().includes(r.text), 'a sample review: ' + r.text);
  assert.ok(!text().includes(demo.live.goal), 'the sample\'s line');
  assert.doesNotMatch(text(), /Sample|Example/i);
  // The stage: their name and quote, the summit holds their rating and count, the prism their years.
  assert.equal($('[data-who] h1').textContent, 'Maya Okafor.');
  assert.match($('[data-bio]').textContent, /tempo work/);
  assert.match($('[data-summit]').textContent, /^9\.9\/10Rating · 284 reviews$/);
  assert.match($('[data-prism]').textContent, /Coaching for 9 years/);
  assert.deepEqual($$('[data-chips] [data-chip]').map((c) => c.getAttribute('data-chip')), ['verified', 'tier', 'how', 'pronouns']);
  assert.match($('[data-chip="how"]').textContent, /In person \+ remote/);
  // The plates: figures the page read (no "sessions coached", no "active clients": nothing counts them).
  const plates = $$('[data-coach-stat]').map((s) => s.getAttribute('data-coach-stat'));
  assert.deepEqual(plates, ['reviews', 'years', 'programs', 'open']);
  assert.doesNotMatch(text(), /sessions coached|active clients|first client/i);
  // The milestones on the route: their years and their programs, nothing invented.
  assert.deepEqual($$('[data-milestone]').map((m) => m.textContent), ['9 years coaching', '1 program']);
  // The wire: the next open time, their post, their program. Only real events.
  const wire = $$('[data-wire-item]').map((w) => w.textContent);
  assert.equal(wire.length, 3);
  assert.match(wire[0], /^Next open /);
  assert.match(wire[1], /^New: Tempo week · 1d ago$/);
  assert.match(wire[2], /^Strength Block 3 12 weeks/);
  // The range: a card a program, no peaks drawn on it (owner, 9 Nov: "remove the graph design part").
  const card = $('[data-camp="range"] [data-program]');
  assert.match(card.textContent, /Strength Block 3/);
  assert.match(card.textContent, /\$59/);
  assert.equal(!!card.querySelector('svg'), false, 'no drawing on the card');
  await p.unmount();
});

test('null is unread: nothing is claimed while a read is on its way', async () => {
  WIDE = true; backend({ reviews: () => new Promise(() => {}), holdWeek: true });
  const p = await mount(LIVE);
  assert.ok(!$('[data-summit]'), 'no rating, and no "no reviews yet", while the reviews are read');
  assert.ok(!$('[data-coach-stat="open"]'), 'no open-times plate while the week is read');
  assert.ok(!$('[data-dock-book]'), 'and nothing to book yet');
  assert.ok(!$$('[data-wire-item]').some((w) => /Next open/.test(w.textContent)));
  assert.doesNotMatch(text(), /New on Shape|No reviews yet/);
  await p.unmount();
  // Read, and none: the summit says so (0 is measured).
  backend({ reviews: { reviews: [], avg: 0, count: 0 } });
  const q = await mount(LIVE);
  assert.match($('[data-summit]').textContent, /New.*No reviews yet/);
  await q.unmount();
});

test('a camp with nothing in it is hidden from a visitor and shown to the coach with what to add', async () => {
  WIDE = true; backend({ posts: [], plans: [], reviews: { reviews: [], avg: 0, count: 0 } });
  const bare = { ...LIVE, row: { ...ROW, custom: null, goal: '' } };
  let p = await mount(bare);
  // The range stays for its one real offer, the listing's monthly coaching.
  assert.deepEqual(camps(), ['day', 'range', 'summit'], 'a visitor: the day, the coaching they sell and the summit');
  assert.ok(!$('[data-camp="range"] [data-program]') && $('[data-camp="range"] [data-coaching-card]'));
  assert.deepEqual($$('[data-wire-item]').map((w) => w.textContent.split(' ').slice(0, 2).join(' ')), ['Next open'], 'the wire: their open time and nothing else');
  assert.ok(!$('[data-milestone]'));
  await p.unmount();
  p = await mount({ ...bare, isSelf: true });
  assert.deepEqual(camps(), ['base', 'day', 'range', 'replays', 'proof', 'words', 'about', 'find', 'posts', 'summit'], 'the coach sees every camp, in the app\'s order');
  assert.match($('[data-camp="proof"]').textContent, /Pin up to three of your members' reviews/, 'Proof says where to pin them');
  assert.match($('[data-camp="base"]').textContent, /Make it yours → Spotlight/);
  assert.match($('[data-camp="range"]').textContent, /Publish a program/);
  assert.match($('[data-camp="find"]').textContent, /Tell members where to find you/);
  assert.ok(!$('[data-dock]'), 'no booking console on their own page');
  await p.unmount();
});

test('the booking console and the range go through today\'s paths', async () => {
  WIDE = true; const calls = backend();
  const opened = [];
  window.__openChat = (o) => opened.push(o);
  const p = await mount(LIVE);
  const dock = $('[data-dock]');
  assert.match(dock.textContent, /Free intro20 min/, 'the coach\'s own intro length');
  assert.ok(dock.querySelector('[data-dock-next]'));
  // Book: the booking page at the first open time (the Day camp's "Take it" link).
  const book = dock.querySelector('a[data-dock-book]');
  assert.match(book.getAttribute('href'), /^\/newdesign\/consultation\.html\?type=trainer&id=7&name=Maya%20Okafor&at=/);
  assert.equal(book.getAttribute('href').split('&at=')[1], $('a[data-open-time]') ? $('a[data-open-time]').getAttribute('href').split('&at=')[1] : book.getAttribute('href').split('&at=')[1]);
  // Message: the coach's chat, with their listing.
  await React.act(async () => dock.querySelector('[data-message]').click());
  assert.deepEqual(opened[0], { who: 'Maya Okafor', providerRole: 'trainer', providerId: 7, role: 'Trainer' });
  // Start on the range opens the program's sheet; its Start is lvBuyPlan's checkout with the plan.
  await React.act(async () => $('[data-camp="range"] [data-program-open]').click());
  const sheet = $('[data-program-sheet]');
  assert.ok(!sheet.querySelector('[data-program-peaks]') && !!sheet.querySelector('[data-program-ask]'), 'no peaks drawn in the sheet, and Ask');
  assert.match(sheet.querySelector('[data-program-buy]').textContent, /Start · \$59/);
  await React.act(async () => sheet.querySelector('[data-program-buy]').click());
  await settle();
  const post = calls.find((c) => c.url === '/api/stripe/checkout-session');
  assert.equal(post.body.item.planId, 'p1');
  assert.deepEqual(post.body.coach, { provider_id: 7, provider_role: 'trainer' });
  // Follow is the follow graph's own.
  let followed = 0;
  await p.unmount();
  const q = await mount({ ...LIVE, onFollow: () => { followed++; } });
  await React.act(async () => $('[data-follow]').click());
  assert.equal(followed, 1);
  await q.unmount();
  delete window.__openChat;
});

test('when the coach is full, the console offers the waiting list, never a time', async () => {
  WIDE = true; backend({ listing: { ...LISTING, at_capacity: true } });
  const p = await mount(LIVE);
  const book = $('[data-dock-book]');
  assert.equal(book.tagName, 'BUTTON');
  assert.equal(book.textContent, 'Join the waiting list');
  assert.match($('[data-status]').textContent, /Full · waiting list/);
  assert.match($('[data-coach-stat="open"]').textContent, /Full/);
  await p.unmount();
});

test('review words are for members: a visitor sees the rating, how many, and the way in', async () => {
  WIDE = true; backend({ reviews: { reviews: [], avg: 9.9, count: 284, locked: true } });
  const p = await mount(LIVE);
  const words = $('[data-camp="words"]');
  assert.ok(words.querySelector('[data-reviews-locked]'));
  assert.match(words.textContent, /9\.9\/10Rating · 284 reviews/);
  assert.match(words.querySelector('[data-reviews-join]').textContent, /Join Shape to read all 284/);
  assert.ok(!$('[data-review-card]'), 'no review words');
  await React.act(async () => $('[data-summit]').click());
  assert.ok($('[data-reviews-sheet] [data-reviews-locked]'), 'the summit opens the reviews, locked too');
  await p.unmount();
  // A member reads them.
  backend({ reviews: { reviews: [{ id: 'r1', author: 'Priya S.', rating: 10, text: 'Best coach I have had.' }], avg: 10, count: 1 } });
  const q = await mount(LIVE);
  assert.match($('[data-camp="words"] [data-review-card]').textContent, /Best coach I have had\./);
  await q.unmount();
});

test('a coach with no account stays the sample, said so, booking nothing', async () => {
  WIDE = true; const calls = backend();
  const p = await mount({ mode: 'sample', role: 'trainer', name: 'Jordan Reyes', sampleKey: 'Jordan Reyes', follow: null });
  assert.match($('[data-sample-note]').textContent, /hasn't set up a Shape account yet/);
  assert.ok(!$('[data-dock-book]') && !$('a[data-open-time]'), 'times shown, never taken');
  assert.ok($('[data-dock] [data-work-with]'), 'Work with in its place');
  assert.ok(!$('[data-status]'), 'no "taking new clients" claim');
  assert.ok(!calls.some((c) => c.url.startsWith('/api/availability')));
  await p.unmount();
});

test('a nutritionist climbs in gold, with Meal plans, the kitchen and plate notes as camps', async () => {
  WIDE = true; backend({ listing: null, plans: [] });
  const p = await mount({ mode: 'sample', role: 'nutritionist', name: 'Rae Lindqvist', sampleKey: 'Rae Lindqvist', follow: null });
  assert.equal($('[data-coach-profile]').getAttribute('data-role'), 'nutritionist');
  assert.ok(['range', 'kitchen', 'plates'].every((k) => camps().includes(k)), camps().join(','));
  assert.match($('.cpw-h1').innerHTML, /#d8a23a|rgb\(216, 162, 58\)/);
  assert.match($('[data-dock] [data-work-with]').getAttribute('style'), /#d8a23a|rgb\(216, 162, 58\)/, 'the booking colour is gold');
  await p.unmount();
});

// Owner, 2026-11-11, of the Kitchen and Plate notes camps: "we also need to really improve these sections and
// that data/information that is shown on them".
test('the kitchen shows all of itself at once, its recipes from the website\'s catalog; plate notes open each day with its totals, notes and recipes', async () => {
  WIDE = true; backend({ listing: null, plans: [] });
  // The website's catalog as recipes.jsx publishes it; a page that has it skips the fetch.
  window.findRecipeBySlug = (slug) => ({ title: slug.replace(/-/g, ' '), time: '1 hr 5 min', servings: 2, kcal: 500, macros: { p: 30, c: 50, f: 20 },
    ingredients: ['7 oz extra-firm tofu, cubed (170 kcal)', '1 tbsp cornstarch'], steps: ['Press it.', 'Cook it.'] });
  const p = await mount({ mode: 'sample', role: 'nutritionist', name: 'Rae Lindqvist', sampleKey: 'Rae Lindqvist', follow: null });
  await settle();
  await React.act(async () => $('[data-camp-tab="kitchen"]').click());
  assert.deepEqual($$('[data-kitchen-part]').map((x) => x.getAttribute('data-kitchen-part')), ['plate', 'recipes', 'staples'], 'every part at once, none behind a switch');
  assert.ok(!$('[data-kitchen-section]'), 'no part switch');
  assert.match($('[data-kitchen-plate-art]').getAttribute('aria-label'), /^The plate: \d+% veg, \d+% protein, \d+% carbs$/, 'the plate drawn with its shares');
  assert.ok($$('[data-plate-rules] li').length >= 3, 'the portion rules, numbered');
  const cards = $$('[data-kitchen-recipes] [data-recipe]');
  assert.equal(cards.length, 6, 'the sample kitchen\'s six recipes, from the catalog');
  assert.equal(cards[0].querySelector('[data-recipe-facts]').textContent, '65min500kcal30g protein2servings', 'time, energy, protein, servings');
  assert.match(cards[0].querySelector('[data-energy-split]').textContent, /30 g protein50 g carbs20 g fat/);
  assert.ok(cards[0].querySelector('[data-recipe-note]').textContent.length > 10, 'the coach\'s note on it');
  // A recipe with no photo shows its initial on the paper's second tone, in the page's heading colour
  // (the ink on a light paper, white on a dark one): never a fixed white (Codex on #2706).
  const initial = cards[0].querySelector('[data-recipe-initial]');
  assert.ok(initial, 'a recipe with no photo shows its initial');
  assert.equal(initial.style.color, 'var(--cpw-head)', 'the initial takes the page\'s heading colour');
  await React.act(async () => cards[0].click());
  const sheet = $('[data-recipe-sheet]').textContent;
  assert.deepEqual($$('[data-recipe-sheet] [data-recipe-ing]').map((g) => [...g.children].map((c) => c.textContent)), [['7 oz', 'extra-firm tofu, cubed'], ['1 tbsp', 'cornstarch']],
    'each ingredient its amount, then its name (the item\'s n and m), the catalog\'s kcal note dropped');
  assert.match(sheet, /Press it\..*Cook it\./);
  assert.ok($$('[data-staple-group]').length >= 2);
  // Plate notes: each day open, with what it adds up to.
  await React.act(async () => $('[data-camp-tab="plates"]').click());
  const days = $$('[data-plate-day]');
  assert.equal(days.length, 2, 'the two days shared');
  assert.match($('[data-plates-summary]').textContent, /^2days shared[\d,]+kcal a day\d+g protein a day\d+meals$/);
  assert.match(days[0].querySelector('[data-plate-day-totals]').textContent, /^[\d,]+kcal\d+g protein\d+g carbs\d+g fat$/, 'a day\'s energy, protein, carbs and fat');
  assert.ok(days[0].querySelector('[data-energy-split]'), 'and where its energy came from');
  const meals = $$('[data-plate-meal]');
  assert.ok(meals.length >= 5 && meals.every((m) => m.querySelector('[data-plate-note]')), 'each meal with the coach\'s note');
  const links = $$('[data-plate-recipe]').map((a) => a.getAttribute('href'));
  assert.ok(links.length >= 3 && links.every((h) => /^\/recipes\/[a-z0-9]+(-[a-z0-9]+)*$/.test(h)), 'a meal made from a recipe links to its page: ' + links.join(', '));
  const third = meals[2].querySelector('[data-plate-open]');
  await React.act(async () => third.click());
  assert.match($('[data-plate-step]').textContent, new RegExp(third.textContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), 'a meal opens the day at that meal');
  await p.unmount();
  delete window.findRecipeBySlug;
});

// Owner, 2026-11-09: "need a new way to organize these on coaches profile, no side scrolling".
test('on a phone the camps pin as one bar naming the camp shown; a tap opens them all as a grid, and a camp opens on its own', async () => {
  WIDE = false; backend();
  const p = await mount(LIVE);
  const nav = $('[data-camp-nav]');
  const pick = nav.querySelector('[data-camp-pick]');
  const grid = nav.querySelector('[data-camp-grid]');
  assert.ok(!$('[data-camp-tabs]'), 'not the desktop tabs as well');
  assert.ok(before($('.cpw-stage'), nav) && before(nav, $('.cpw-camps')), 'under the stage and the wire, over the camps, as the desktop tabs (owner, 2026-11-11)');
  assert.deepEqual(shown(), [camps()[0]], 'the first camp shows on landing, alone');
  assert.equal($('[data-camp-here]').textContent, 'Base', 'the bar names it');
  assert.equal(grid.hidden, true, 'the camps are closed at first');
  assert.equal(pick.getAttribute('aria-expanded'), 'false');
  assert.doesNotMatch(pick.textContent, /\d+ \/ \d+/, 'no count beside the camp: Base is not a numbered camp, so it read one ahead');
  const links = $$('[data-camp-nav] [data-camp-link]').map((b) => b.getAttribute('data-camp-link'));
  assert.deepEqual(links, camps());
  const src = read('public/newdesign/coachProfileWeb.jsx');
  assert.doesNotMatch(src, /\.cpw-campnav\{[^}]*overflow-x/, 'the bar never scrolls sideways');
  assert.match(src, /\.cpw-campnav-grid\{position:absolute;[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'three to a row, over the page');
  assert.match(src, /\.cpw-campnav-grid button\{[^}]*min-height:44px/, 'a 44px target');
  await React.act(async () => pick.click());
  assert.equal(grid.hidden, false, 'a tap opens them');
  assert.equal(pick.getAttribute('aria-expanded'), 'true');
  $('[data-camp-link="words"]').focus();
  await React.act(async () => $('[data-camp-link="words"]').click());
  assert.equal(document.activeElement === pick, true, 'focus is back on the bar (Codex, #2664)');
  assert.deepEqual(shown(), ['words'], 'Words opens on its own');
  assert.equal($('[data-camp-link="words"]').getAttribute('aria-current'), 'true');
  assert.match($('[data-camp-here]').textContent, /Words/, 'the bar names it');
  assert.equal(grid.hidden, true, 'a camp closes the grid');
  await React.act(async () => pick.click());
  $('[data-camp-link="about"]').focus();
  await React.act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(grid.hidden, true, 'Escape closes it');
  assert.equal(document.activeElement === pick, true, 'and hands focus back to the bar');
  assert.deepEqual(shown(), ['words'], 'and opens nothing');
  await React.act(async () => pick.click());
  await React.act(async () => { document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true })); });
  assert.equal(grid.hidden, true, 'a tap off the bar closes it');
  await p.unmount();
  WIDE = true;
});

// Owner, 2026-11-11: "can we make each of these sections appear as tabs towards the top so users dont have
// to scroll so far down to get to certain sections of trainer profile", then "move this nav bar" to the gap
// under the wire, and "don't, have each section just scroll down, have it open its own page ... Similar to
// the app".
test('on a desktop every camp is a tab under the wire: each opens its camp as its own page, the tab selected', async () => {
  WIDE = true; backend();
  const p = await mount(LIVE);
  const nav = $('[data-camp-tabs]');
  assert.ok(nav, 'the tabs are there');
  assert.ok(!$('[data-camp-nav]'), 'not the phone bar as well');
  assert.ok(before($('.cpw-stage'), nav) && before(nav, $('.cpw-camps')), 'under the stage and the wire, over the camps');
  const tabs = $$('[data-camp-tab]');
  assert.deepEqual(tabs.map((b) => b.getAttribute('data-camp-tab')), camps(), 'a tab for every camp, in its order');
  assert.equal(nav.querySelector('[role="tablist"]').contains(tabs[0]), true);
  assert.ok(tabs.every((b) => b.getAttribute('role') === 'tab' && b.getAttribute('aria-controls') === 'camp-' + b.getAttribute('data-camp-tab')));
  const selected = () => $$('[data-camp-tab][aria-selected="true"]').map((b) => b.getAttribute('data-camp-tab'));
  assert.deepEqual(selected(), [camps()[0]], 'the first camp is open on landing');
  assert.deepEqual(shown(), [camps()[0]], 'and shows alone');
  assert.equal($(`[data-camp="${camps()[0]}"]`).getAttribute('role'), 'tabpanel');
  await React.act(async () => $('[data-camp-tab="words"]').click());
  assert.deepEqual(selected(), ['words'], 'a click selects its tab alone');
  assert.deepEqual(shown(), ['words'], 'and opens its camp in place of the last');
  assert.ok($('[data-camp="base"]').hidden && $('[data-camp="base"]').textContent.length > 0, 'the others stay mounted, hidden');
  // The arrows move between the tabs, each opening its camp.
  const i = camps().indexOf('words');
  await React.act(async () => { $('[data-camp-tab="words"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
  assert.deepEqual(shown(), [camps()[i + 1]], 'ArrowRight opens the next camp');
  assert.ok(document.activeElement === $(`[data-camp-tab="${camps()[i + 1]}"]`), 'and focuses its tab');
  await React.act(async () => { document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true })); });
  assert.deepEqual(shown(), [camps()[0]], 'Home opens the first');
  // A link to another camp opens it: the Base's "All N posts".
  await React.act(async () => $('[data-all-posts]').click());
  assert.deepEqual(shown(), ['posts'], 'All posts opens Posts');
  const src = read('public/newdesign/coachProfileWeb.jsx');
  const rules = [...src.matchAll(/\.cpw-camptabs[^{]*\{[^}]*\}/g)].map((m) => m[0]).join('\n');
  assert.match(src, /\.cpw-camptabs\{position:sticky;/, 'it pins under the header');
  assert.match(rules, /\.cpw-camptabs-row\{[^}]*flex-wrap:wrap/, 'a narrow dashboard wraps it');
  assert.doesNotMatch(rules, /overflow-x/, 'it never scrolls sideways');
  assert.match(rules, /\.cpw-camptabs button\{[^}]*min-height:48px/, 'a 44px target at least');
  assert.match(src, /\.cpw-camp\[hidden\]\{display:none\}/, 'a hidden camp is hidden (.cpw-camp is a grid)');
  assert.match(src, /\.cpw-camp-mark\{position:sticky;top:\$\{headH \+ pinH \+ 28\}px/, 'the spine mark pins under the tabs');
  assert.match(src, /stickyTop=\{headH \+ pinH\}/, 'and so does the studio row');
  await p.unmount();
  // A private profile is one camp: no tabs, and it shows.
  const q = await mount({ ...LIVE, row: { ...ROW, is_public: false, can_view: false } });
  assert.ok(!$('[data-camp-tabs]'));
  assert.deepEqual(shown(), camps());
  await q.unmount();
});

// Codex P2 on #2700: a camp left behind stays mounted, hidden, so the intro film or the profile song would
// play on out of sight. Leaving a camp stops what it was playing.
test('leaving a camp stops its film and its song', async () => {
  WIDE = true; backend();
  const film = { url: 'https://zznufekgjngecelwxndw.supabase.co/storage/v1/object/public/coach-media/coach-1/intro.mp4', caption: 'Hi' };
  const song = { url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', label: 'Warm-up' };
  const proto = window.HTMLMediaElement.prototype;
  const was = { pause: Object.getOwnPropertyDescriptor(proto, 'pause'), paused: Object.getOwnPropertyDescriptor(proto, 'paused') };
  let paused = 0;
  Object.defineProperty(proto, 'paused', { configurable: true, get() { return false; } });
  Object.defineProperty(proto, 'pause', { configurable: true, writable: true, value() { paused++; } });
  try {
    const p = await mount({ ...LIVE, row: { ...ROW, custom: { ...ROW.custom, film, song } } });
    assert.deepEqual(shown(), ['base']);
    assert.ok($('[data-camp="base"] video'), 'the intro film is in Base');
    const frame = $('[data-camp="about"] iframe');
    assert.ok(frame, 'the profile song is in About');
    let reloads = 0;
    const set = frame.setAttribute.bind(frame);
    frame.setAttribute = (n, v) => { if (n === 'src') reloads++; return set(n, v); };
    await React.act(async () => $('[data-camp-tab="about"]').click());
    assert.equal(paused, 1, 'leaving Base pauses its film');
    assert.equal(reloads, 0, 'the song plays on in About');
    await React.act(async () => $('[data-camp-tab="about"]').click());
    assert.equal(reloads, 0, 'the open tab again stops nothing');
    await React.act(async () => $('[data-camp-tab="day"]').click());
    assert.equal(reloads, 1, 'leaving About stops the song');
    assert.equal(frame.getAttribute('src'), 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC', 'its player loads again, stopped');
    assert.equal(paused, 1);
    await p.unmount();
  } finally {
    for (const [k, d] of Object.entries(was)) { if (d) Object.defineProperty(proto, k, d); else delete proto[k]; }
  }
});

// Codex P2 on #2700: a read that lands late can add a camp ahead of the one shown (a photo post brings Base
// ahead of Book); once the visitor has scrolled into the page, the camp they are reading stays.
test('a late read that adds Base never swaps the camp a visitor is reading', async () => {
  WIDE = true;
  const row = { ...ROW, goal: '', custom: { about: ROW.custom.about } };
  let open = null;
  backend({ postsGate: new Promise((r) => { open = r; }) });
  const p = await mount({ ...LIVE, row });
  assert.ok(!camps().includes('base'), 'no Base while the posts are on their way');
  assert.deepEqual(shown(), ['day'], 'the page lands on Book');
  await React.act(async () => window.dispatchEvent(new window.Event('scroll')));
  await React.act(async () => { open(); });
  await settle(); await settle();
  assert.equal(camps()[0], 'base', 'the photo post brings Base, first');
  assert.deepEqual(shown(), ['day'], 'the visitor stays on Book');
  await p.unmount();
  // Before the visitor does anything, the page lands on the first camp the reads give it.
  backend({ postsGate: new Promise((r) => { open = r; }) });
  const q = await mount({ ...LIVE, row });
  await React.act(async () => { open(); });
  await settle(); await settle();
  assert.deepEqual(shown(), ['base']);
  await q.unmount();
});

// Owner, 2026-11-11, with a screenshot of the meal plan cards: "when you open these meal plans, it shouldn't
// bring you down to bottom of the page, it should open up a preview of some of these meal plans in separate pop up".
test('a meal plan opens its preview: the weeks, the meals a day, a day\'s first meals and how many more; Start buys it', async () => {
  WIDE = true;
  const MEAL = { id: 'm1', kind: 'meal_plan', name: 'Train-day fuel', price: 49, category: 'meal', provider_id: 7, provider_role: 'nutritionist', description: 'Fuel around four lifting days.',
    detail: { preview: true, perDay: false, blocksCount: 4, weeks: 4, blocks: ['Breakfast: Greek yogurt power bowl · 480 kcal', 'Lunch: One-pan chicken and rice · 640 kcal'] } };
  const calls = backend({ plans: [MEAL] });
  const p = await mount({ mode: 'live', role: 'nutritionist', uid: 'coach-1', row: { ...ROW, role: 'nutritionist' }, verified: true });
  await React.act(async () => $('[data-camp-tab="range"]').click());
  assert.deepEqual(shown(), ['range']);
  await React.act(async () => $('[data-camp="range"] [data-program-open]').click());
  assert.deepEqual(shown(), ['range'], 'the page stays on the meal plans: no trip to the storefront');
  const sheet = $('[data-meal-plan-sheet]');
  assert.ok(sheet, 'the preview opens');
  assert.match(sheet.querySelector('[data-meal-plan-plates]').textContent, /4Weeks4Meals a day/);
  assert.deepEqual([...sheet.querySelectorAll('[data-meal-plan-meal]')].map((m) => m.textContent), ['BREAKFASTGreek yogurt power bowl480 kcal', 'LUNCHOne-pan chicken and rice640 kcal']);
  assert.match(sheet.querySelector('[data-meal-plan-locked]').textContent, /＋2 more meals · unlocked when you buy/);
  assert.match(sheet.querySelector('[data-meal-plan-desc]').textContent, /Fuel around four lifting days\./);
  assert.ok(sheet.querySelector('[data-meal-plan-ask]'), 'Ask the coach');
  assert.match(sheet.querySelector('[data-meal-plan-buy]').textContent, /Start · \$49/);
  await React.act(async () => sheet.querySelector('[data-meal-plan-buy]').click());
  await settle();
  const post = calls.find((c) => c.url === '/api/stripe/checkout-session');
  assert.equal(post.body.item.planId, 'm1');
  assert.deepEqual(post.body.coach, { provider_id: 7, provider_role: 'nutritionist' });
  await p.unmount();
  // A sample's plans have a day to show, and sell nothing: Work with in place of Start.
  backend({ listing: null, plans: [] });
  const q = await mount({ mode: 'sample', role: 'nutritionist', name: 'Rae Lindqvist', sampleKey: 'Rae Lindqvist', follow: null });
  await React.act(async () => $('[data-camp="range"] [data-program-open]').click());
  const s2 = $('[data-meal-plan-sheet]');
  assert.equal(s2.querySelectorAll('[data-meal-plan-meal]').length, 2, 'two of the day\'s meals');
  assert.match(s2.querySelector('[data-meal-plan-locked]').textContent, /more meals? in the plan$/, 'a sample sells nothing, so no "when you buy"');
  assert.ok(!s2.querySelector('[data-meal-plan-buy]') && s2.querySelector('[data-meal-plan-work]'));
  await q.unmount();
  // A free plan has no checkout: the sheet offers Work with, and the more meals aren't "when you buy".
  backend({ plans: [{ ...MEAL, id: 'm2', price: 0 }] });
  const f = await mount({ mode: 'live', role: 'nutritionist', uid: 'coach-1', row: { ...ROW, role: 'nutritionist' }, verified: true });
  await React.act(async () => $('[data-camp-tab="range"]').click());
  await React.act(async () => $('[data-camp="range"] [data-program-open]').click());
  const s3 = $('[data-meal-plan-sheet]');
  assert.match(s3.querySelector('[data-meal-plan-locked]').textContent, /＋2 more meals in the plan$/, 'no checkout, so no "when you buy"');
  assert.ok(!s3.querySelector('[data-meal-plan-buy]') && s3.querySelector('[data-meal-plan-work]'));
  await f.unmount();
});

test('the house rules: no coloured emoji, no ● in a pill, the wire still for reduced motion, Saira for figures', () => {
  const src = read('public/newdesign/coachProfileWeb.jsx');
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{FE0F}]/u, 'no coloured emoji (typographic ✓ ♡ ★ ⚠ stay)');
  assert.doesNotMatch(src, /●/, 'no dot glyphs');
  assert.match(src, /@media \(prefers-reduced-motion: reduce\)\{\n\s+\.cpw-wire-run\{animation:none\}/);
  // The figures as the chat feed sets them (owner, 9 Nov): Saira 700, tight, even-width numerals; no Doto left.
  assert.match(src, /const CPW_FIG = "'Saira', /);
  assert.match(src, /\.cpw-fig\{font-family:\$\{CPW_FIG\};font-weight:700;letter-spacing:-\.035em;[^}]*font-variant-numeric:tabular-nums\}/);
  assert.doesNotMatch(src, /Doto|ROND/, 'no Doto on the coach profile');
  assert.doesNotMatch(src, /\bconfirm\(/, 'destructive steps go through ShapeConfirm');
});

// My review of the Climb (9 Nov): Message stays in reach for every visitor, as today's page had it.
test('Message is in the docked console on a phone too, and a private coach keeps Message alone', async () => {
  const src = read('public/newdesign/coachProfileWeb.jsx');
  // The phone console hides its cells and status, never Message (today's page had "Message {name}" on a phone).
  const phone = /@media \(max-width:760px\)\{([\s\S]*?)\n    \}/.exec(src)[1];
  assert.doesNotMatch(phone, /\.cpw-dock-msg[^{]*\{[^}]*display:none/, 'Message is hidden on a phone');
  // A private profile: the console docks with Message, and nothing to book or buy.
  WIDE = false; backend();
  const p = await mount({ ...LIVE, row: { ...ROW, is_public: false, can_view: false } });
  assert.ok($('[data-dock]'), 'a private profile docks the console');
  assert.ok($('[data-dock] [data-message]'), 'Message on a private profile');
  assert.ok(!$('[data-dock] [data-dock-book]') && !$('[data-dock] [data-work-with]'), 'nothing to book or buy on a private profile');
  assert.ok(!$('[data-dock-next]'), 'no open times on a private profile');
  // It is the page's own Message (the coach's chat once their listing is read), as on the stage before.
  assert.match(read('public/newdesign/coachProfileWeb.jsx'), /book=\{dockBook\} onMessage=\{message\}/);
  await p.unmount();
});

// PARITY (9 Nov): one camp list on the website and in the app, in the app's order, under the app's
// names; Proof is the coach's pinned reviews, members only like all review words.
const PIN = '22222222-2222-4222-8222-222222222222';
function withPinned(answer) {
  const base = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).startsWith('/api/coaches/reviews?ids=')
    ? { ok: true, status: 200, json: async () => answer }
    : base(url, init));
  return () => { globalThis.fetch = base; };
}
test('the camps are the app\'s, in its order: Base, Book, the range, Proof, Words, About, Find me, Posts, Summit', async () => {
  WIDE = true;
  backend({ reviews: { reviews: [{ id: PIN, author: 'Dana K.', rating: 10, text: 'An old favourite.', ownerId: 'coach-1', authorId: 'm-1' }, { id: 'r2', author: 'Lee P.', rating: 9, text: 'Patient and exact.' }], avg: 9.5, count: 2 } });
  const undo = withPinned({ reviews: [{ id: PIN, author: 'Dana K.', rating: 10, text: 'An old favourite.', ownerId: 'coach-1', authorId: 'm-1' }] });
  const custom = { ...ROW.custom, pinnedReviews: [PIN], links: { instagram: '@maya.lifts' } };
  const p = await mount({ ...LIVE, row: { ...ROW, custom } });
  assert.deepEqual(camps(), ['base', 'day', 'range', 'proof', 'words', 'about', 'find', 'posts', 'summit']);
  // The tab names (the desktop's tabs, the phone's grid) are the app's; the spine numbers the camps between Base and Summit.
  assert.deepEqual($$('.cpw-camp-label').map((l) => l.textContent),
    ['Base · Start here', 'Camp 1 · Book', 'Camp 2 · Programs', 'Camp 3 · Proof', 'Camp 4 · Words', 'Camp 5 · About', 'Camp 6 · Find me', 'Camp 7 · Posts', 'Summit · Work with her']);
  assert.equal($('#camp-h-day').textContent, 'Her day.', 'the day keeps its title (words.day)');
  assert.equal($('#camp-h-words').textContent, 'What clients say.');
  // Proof holds the pinned review; Words the rating and the rest, never the pinned one twice.
  assert.match($('[data-camp="proof"] [data-proof-card]').textContent, /10\/10 · Pinned.*An old favourite\..*Dana K\./);
  const wordsText = $('[data-camp="words"]').textContent;
  assert.match(wordsText, /9\.5\/10Rating · 2 reviews/);
  assert.match(wordsText, /Patient and exact\./);
  assert.doesNotMatch(wordsText, /An old favourite/);
  // About holds no links, practice or photos; Find me holds the socials.
  assert.ok(!$('[data-camp="about"] [data-about-link]') && !$('[data-camp="about"] [data-about="practice"]') && !$('[data-camp="about"] [data-about-photos]'));
  assert.ok($('[data-camp="find"] [data-about-link="instagram"]'));
  await p.unmount();
  undo();
  // A reader who may not read review words: the route answers the pins with none, so no Proof camp,
  // and the Words are the rating and the way in.
  backend({ reviews: { reviews: [], avg: 9.9, count: 284, locked: true } });
  const undo2 = withPinned({ reviews: [], locked: true });
  const q = await mount({ ...LIVE, row: { ...ROW, custom } });
  assert.ok(!camps().includes('proof'), 'no Proof for a locked reader: ' + camps().join(','));
  assert.ok(!$('[data-proof-card]'));
  assert.doesNotMatch(text(), /An old favourite/);
  assert.ok($('[data-camp="words"] [data-reviews-locked]'));
  await q.unmount();
  undo2();
});

// PARITY §2: the coach's accent tints the drawing, never the text or a button.
// The labels take the picked accent at the step that reads on the page (the kit's bsCoachPagePalette,
// owner 2026-11-11: "coaches should be able to customize how their page appears publicly"); the booking
// keeps the role's colour.
test('the coach\'s accent tints the route, the contours, the summit ring and the full stop, and the labels at a readable step; Book keeps the role\'s colours', async () => {
  const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  const stop = () => $('[data-name-stop]').style.color;
  const routeStroke = () => [...$('[data-terrain] svg').querySelectorAll('path')].map((x) => x.getAttribute('stroke')).filter((c) => c && c !== '#effffc');
  WIDE = true; backend();
  // Violet, picked in Make it yours.
  let p = await mount({ ...LIVE, row: { ...ROW, custom: { ...ROW.custom, look: { paper: 'dark', accent: 'violet' } } } });
  const violet = K.BS_COACH_ACCENTS.violet.dark;
  assert.equal($('[data-coach-profile]').getAttribute('data-accent'), violet);
  assert.equal(stop(), rgb(violet), 'the name\'s full stop');
  assert.ok(routeStroke().length && routeStroke().every((c) => c === violet), 'the route and the contours');
  assert.match($('[data-summit-ring]').style.borderColor, /167, 139, 250/, 'the summit\'s ring');
  assert.match($('[data-camp="day"] .cpw-diamond').style.borderColor, /167, 139, 250/, 'the spine\'s diamonds');
  const violetText = K.bsCoachPagePalette({ paper: 'dark', accent: 'violet' }, 'trainer').ACCENT;
  assert.equal($('.cpw-eyebrow').style.color, rgb(violetText), 'a label takes the picked accent');
  assert.equal($('.cpw-camp-label').style.color, rgb(violetText));
  assert.equal($('[data-dock-book]').style.background, rgb('#c0533b'), 'Book keeps the rust');
  await p.unmount();
  // The old customizer's hex, when there is no look accent.
  p = await mount({ ...LIVE, row: { ...ROW, custom: { ...ROW.custom, accent: '#ff7a1a' } } });
  assert.equal(stop(), rgb('#ff7a1a'));
  await p.unmount();
  // None (or the role's own, which the editor seeds, or one that would vanish on the dark page): teal.
  for (const custom of [ROW.custom, { ...ROW.custom, look: { accent: 'teal' } }, { ...ROW.custom, accent: '#050505' }, { ...ROW.custom, accent: 'red' }]) {
    p = await mount({ ...LIVE, row: { ...ROW, custom } });
    assert.equal(stop(), rgb('#34d6c5'), JSON.stringify(custom));
    assert.ok(routeStroke().every((c) => c === '#34d6c5'));
    await p.unmount();
  }
  // A nutritionist with none is gold; their pick tints the drawing and never the gold booking colour.
  backend();
  const NROW = { ...ROW, role: 'nutritionist', full_name: 'Rae Lindqvist' };
  p = await mount({ ...LIVE, role: 'nutritionist', row: NROW });
  assert.equal(stop(), rgb('#d8a23a'));
  await p.unmount();
  p = await mount({ ...LIVE, role: 'nutritionist', row: { ...NROW, custom: { look: { accent: 'rose' } } } });
  assert.equal(stop(), rgb(K.BS_COACH_ACCENTS.rose.dark));
  assert.equal($('.cpw-eyebrow').style.color, rgb(K.bsCoachPagePalette({ accent: 'rose' }, 'nutritionist').ACCENT), 'the label takes the rose');
  assert.match($('[data-dock]').innerHTML, /216, 162, 58|#d8a23a/, 'the booking colour stays gold');
  await p.unmount();
});

// Owner, 2026-11-11: "coaches should be able to customize how their page appears publicly. So the edits
// need to work." The paper picked in Edit profile → Appearance paints the whole page through the
// stylesheet's --cpw-* properties (the kit's bsCoachPagePalette); the climb background is a wash over it.
test('a picked paper paints the whole page, ground, text and stylesheet; the climb background washes over it; no pick is the Climb', async () => {
  const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  const root = () => $('[data-coach-profile]');
  const vars = (name) => root().style.getPropertyValue(name);
  WIDE = true; backend();
  const look = { paper: 'light', accent: 'blue' };
  const pal = K.bsCoachPagePalette(look, 'trainer');
  let p = await mount({ ...LIVE, row: { ...ROW, custom: { ...ROW.custom, look, climbBg: 'dusk' } } });
  assert.equal(root().getAttribute('data-paper'), 'light');
  assert.ok(root().hasAttribute('data-light'));
  assert.equal(vars('--cpw-bg'), pal.BG);
  assert.equal(vars('--cpw-ink'), pal.INK);
  assert.equal(vars('--cpw-ink-rgb'), pal.inkRGB);
  assert.equal(vars('--cpw-head'), pal.INK, 'headings take the ink on a light paper');
  assert.equal(vars('--cpw-deep'), pal.DEEP);
  assert.equal(root().style.color, rgb(pal.INK));
  assert.match(root().getAttribute('style'), /rgba\(138, ?92, ?246/, 'the dusk wash');
  assert.match(root().getAttribute('style'), /rgb\(245, 240, 230\)|#f5f0e6/, 'over the paper');
  assert.equal($('.cpw-eyebrow').style.color, rgb(pal.ACCENT), 'labels take the accent');
  assert.equal($('[data-dock-book]').style.background, rgb('#a8331b'), 'Book keeps the rust, its darker step');
  // The stylesheet draws in the properties, never the Climb's fixed ink.
  const css = $('[data-coach-profile] style').textContent;
  assert.match(css, /var\(--cpw-ink-rgb\)/);
  assert.doesNotMatch(css, /rgba\(238,243,240,/, 'a fixed light ink left in the stylesheet');
  // The route reads on the light ground.
  const strokes = [...$('[data-terrain] svg').querySelectorAll('path')].map((x) => x.getAttribute('stroke')).filter(Boolean);
  assert.ok(strokes.includes(pal.INK), 'the route is drawn in the ink on a light paper');
  await p.unmount();
  // No pick: the Climb's own dark page, no wash, no paper named.
  for (const custom of [ROW.custom, { ...ROW.custom, look: { paper: 'dark', accent: 'teal' } }, { ...ROW.custom, climbBg: 'nope' }]) {
    p = await mount({ ...LIVE, row: { ...ROW, custom } });
    assert.ok(!root().hasAttribute('data-paper'), JSON.stringify(custom));
    assert.equal(vars('--cpw-bg'), '#06090f');
    assert.equal(vars('--cpw-head'), '#fff');
    assert.doesNotMatch(root().getAttribute('style'), /linear-gradient/, 'a wash with no pick');
    await p.unmount();
  }
  // An accent alone keeps the dark ground and names no paper.
  p = await mount({ ...LIVE, row: { ...ROW, custom: { ...ROW.custom, look: { accent: 'violet' } } } });
  assert.equal(root().getAttribute('data-paper'), 'climb');
  assert.equal(vars('--cpw-bg'), '#06090f');
  await p.unmount();
});

test('under 375px the dock drops the avatar and lets the booking action shrink and wrap (Codex P2 on #2652)', () => {
  // Measured at 320–390px in Chromium: below 375 the 44px avatar ran under Message and "Join the
  // waiting list" past the dock's padding. jsdom has no layout, so the rule is pinned here.
  const src = read('public/newdesign/coachProfileWeb.jsx');
  const m = src.match(/@media \(max-width:374px\)\{([^}]*\}[^}]*\}[^}]*\}[^}]*\})/);
  assert.ok(m, 'a 374px rule for the dock');
  assert.match(m[1], /\.cpw-dock-who\{display:none\}/);
  assert.match(m[1], /\.cpw-dock-acts\{flex:1;min-width:0\}/);
  assert.match(m[1], /\.cpw-dock-acts \.cpw-cta\{[^}]*white-space:normal/);
  assert.match(m[1], /\.cpw-dock-acts \.cpw-cta:last-child\{flex:1;min-width:0\}/);
});

// Owner, 9 Nov: "use programs own photo", then "remove the graph design part, looks stupid". A program with a
// photo shows it, bright, with nothing drawn over it; one with none is a short band in its colour.
test('a program card is the program\'s own photo with nothing drawn over it; without one, a band in its colour', async () => {
  WIDE = true;
  const WITH = { ...PLAN, id: 'p1', name: 'Strength Block 3', detail: { ...PLAN.detail, media: [{ type: 'video', url: 'https://cdn.test/intro.mp4' }, { type: 'image', url: 'https://cdn.test/cover.jpg' }] } };
  const WITHOUT = { ...PLAN, id: 'p2', name: 'Barbell basics', detail: { ...PLAN.detail, weeks: 6, media: [] } };
  backend({ plans: [WITH, WITHOUT] });
  const p = await mount(LIVE);
  const [a, b] = $$('[data-camp="range"] [data-program]');
  const img = a.querySelector('.cpw-range-art img');
  assert.equal(img ? img.getAttribute('src') : null, 'https://cdn.test/cover.jpg', 'the program\'s own photo');
  assert.equal(a.querySelector('.cpw-range-art').classList.contains('bare'), false);
  assert.equal(b.querySelector('.cpw-range-art').classList.contains('bare'), true, 'no photo: a short band in its colour');
  assert.equal(!!b.querySelector('.cpw-range-art img'), false);
  assert.equal(!!$('[data-camp="range"] svg'), false, 'no peaks drawn on any card');
  const src = read('public/newdesign/coachProfileWeb.jsx');
  assert.match(src, /\.cpw-range-art img\{[^}]*filter:brightness\(\.78\)\}/, 'the photo shows, not greyed to half');
  assert.match(src, /\.cpw-range-art\.bare\{height:64px\}/);
  assert.doesNotMatch(src, /data-program-peaks|cpwPeaks/, 'the program sheet draws none either');
  await p.unmount();
});

// ── The coach dashboard's Profile tab (owner, 2026-11-10: "profile should take up full width of page and
// formatting looks bad. Everything looks huge. I want it to look like what the preview design was", the
// Coach Cockpit preview). Scoped to the dashboard (chrome off) and to a wide screen; the public page keeps
// its centred 1440 and its own sizes.
test('in the dashboard the Climb takes the page\'s width at the preview\'s scale; the public page keeps its own', async () => {
  WIDE = true; backend();
  const dash = await mount(LIVE);
  assert.equal($('[data-coach-profile]').getAttribute('data-in-dash'), '', 'the dashboard page is not marked');
  await dash.unmount();
  backend();
  const pub = await mount({ ...LIVE, chrome: true });
  assert.equal($('[data-coach-profile]').hasAttribute('data-in-dash'), false, 'the public page is marked as the dashboard\'s');
  await pub.unmount();
  const src = read('public/newdesign/coachProfileWeb.jsx');
  const at = src.indexOf('.cpw[data-in-dash] .cpw-wrap');
  assert.ok(at > 0, 'the dashboard block is gone');
  const block = src.slice(src.lastIndexOf('@media (min-width:1000px){', at), src.indexOf('\n    }\n', at));
  assert.match(block, /^@media \(min-width:1000px\)\{/, 'the dashboard sizes reach phones');
  assert.match(block, /\.cpw\[data-in-dash\] \.cpw-wrap\{max-width:none;padding:0 32px\}/, 'the dashboard page is capped again');
  // The name is sized to its own column: 100vw counted the rail, so it ran 106px at a 1916px window.
  assert.match(block, /\.cpw-stage-text\{[^}]*container-type:inline-size/);
  assert.match(block, /\.cpw\[data-in-dash\] \.cpw-h1\{[^}]*min\(78px,calc\(min\(620px,100cqi\)/);
  assert.doesNotMatch(block, /100vw/, 'a dashboard size reads the window, rail and all');
  assert.match(block, /\.cpw-stage\.cpw-has-wire\{border-radius:18px 18px 0 0/, 'the wire is not joined to the stage');
  assert.match(src, /className=\{"cpw-stage" \+ \(wire\.length \? " cpw-has-wire" : ""\)\}/, 'a stage with no wire under it loses its rounded foot');
  // The public page's rules are untouched.
  assert.match(src, /\.cpw-wrap\{max-width:1440px;margin:0 auto;padding:0 32px\}/);
  // And the coach's own setup below it follows the profile's width.
  assert.match(read('public/newdesign/dashProfileExtras.jsx'), /<section className="px-setup" aria-labelledby="px-setup-title" style=\{\{ padding: "36px 32px 34px", boxSizing: "border-box" \}\}>/);
});

// Owner, 2026-11-11: "the followers and following should be somewhere on main profile". They sat in the bar
// above the stage, and were hidden on a phone (.cpw-counts{display:none}).
test('followers and following are on the stage under the name, public even on a private profile, and open their lists', async () => {
  WIDE = true; backend();
  const opened = [];
  const follow = { followers: 1234, following: 2, canFollow: true, openList: (k) => opened.push(k) };
  const p = await mount({ ...LIVE, follow });
  const row = $('[data-follow-counts]');
  assert.ok(row, 'no follower counts on the page');
  assert.ok(row.closest('.cpw-stage-text'), 'the counts are not on the stage');
  assert.ok(!row.closest('[data-crumbs]'), 'the counts are still in the bar');
  assert.equal($$('[data-crumbs] [data-follow-count]').length, 0);
  assert.equal(row.querySelector('[data-follow-count="followers"]').textContent, '1,234Followers');
  assert.equal(row.querySelector('[data-follow-count="following"]').textContent, '2Following');
  // Under the name and its chips, before the quote.
  const order = $$('.cpw-stage-text [data-chips], .cpw-stage-text [data-follow-counts], .cpw-stage-text [data-bio]').map((e) => Object.keys(e.dataset)[0]);
  assert.deepEqual(order, ['chips', 'followCounts', 'bio']);
  await React.act(async () => row.querySelector('[data-follow-count="following"]').click());
  await React.act(async () => row.querySelector('[data-follow-count="followers"]').click());
  assert.deepEqual(opened, ['following', 'followers']);
  // Follow and Share stay in the bar.
  assert.ok($('[data-crumbs] [data-follow]'));
  await p.unmount();
  // A private profile keeps its counts, as a member's page does.
  const q = await mount({ ...LIVE, follow, row: { ...ROW, is_public: false, can_view: false } });
  assert.ok($('.cpw-stage-text [data-follow-counts]'), 'a private coach lost their counts');
  await q.unmount();
  // Nothing hides them on a phone.
  const src = read('public/newdesign/coachProfileWeb.jsx');
  assert.doesNotMatch(src, /\.cpw-counts|\.cpw-follow\{[^}]*display:none/);
});
