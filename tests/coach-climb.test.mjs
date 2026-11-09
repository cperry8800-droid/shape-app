// The Climb (owner, 2026-11-09: "for coaches profile lets complete full buildout of 'the climb'"), MOUNTED:
// mobile-app/src/broadsheet/BSCoachClimb.jsx as BSTrainerProfile.jsx draws it for a trainer and a
// nutritionist, in the real broadsheet chrome, against scripted backends, reading the real English
// catalogs.
//
// What it pins: a real coach's page shows only that coach's own data and never a sample; a camp with
// nothing in it is left out for a visitor and shown to the coach with what to add; null is unread (no
// rating, no next time until the read lands) and a failed read says so with Try again; the console's
// Book, the range's Start and the program sheet's Ask and Start go through the profile's own paths (the
// booking sheet, ShapeCoachPlans.buy, Message); and what a review says stays with members.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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
const liveRoots = [];
async function mount(el) {
  while (liveRoots.length) { const r = liveRoots.pop(); try { await act(async () => r.unmount()); } catch (e) { /* already down */ } }
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  liveRoots.push(root);
  await act(async () => { root.render(el); });
  await flush();
  return { text: () => document.body.textContent.replace(/\s+/g, ' '), unmount: async () => { const i = liveRoots.indexOf(root); if (i >= 0) liveRoots.splice(i, 1); await act(async () => root.unmount()); host.remove(); } };
}
const click = async (el) => { assert.ok(el, 'no such element'); await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const button = (re) => $$('button').find((b) => re.test(b.textContent) || re.test(b.getAttribute('aria-label') || ''));
const camp = (k) => $(`[data-climb-camp="${k}"]`);
const campKeys = () => $$('[data-climb-camp]').map((el) => el.getAttribute('data-climb-camp'));

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
const climbMod = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCoachClimb.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });
const { BSTrainerProfile } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });
const { bsClimbPeaks, bsClimbPeaksPath, bsClimbBlocks } = climbMod;

// ── The world the page reads ─────────────────────────────────────────────────────────────────
const ZONE = 'America/New_York';
const R1 = '11111111-aaaa-4aaa-8aaa-000000000001';
const R2 = '11111111-aaaa-4aaa-8aaa-000000000002';
const REVIEWS = [
  { id: R1, ownerId: 'u-maya', authorId: 'u-a', author: 'Priya S.', rating: 10, text: 'Back squat from 225 to 245 in seven weeks.' },
  { id: R2, ownerId: 'u-maya', authorId: 'u-b', author: 'Jordan M.', rating: 9, text: 'Tempo work fixed my knees.' },
];
const PLAN = { id: 'p1', kind: 'program', name: 'Strength Block 3', price: 59, providerId: 7, providerRole: 'trainer', meta: '12 weeks', detail: {
  preview: true, weeks: 12, note: 'Barbells, machines and cables.',
  firstWeek: [{ week: 0, day: 0, weekday: 0, dayName: 'Lower', moves: 2 }, { week: 0, day: 1, weekday: 3, dayName: 'Upper', moves: 2 }],
  blocks: [{ week: 0, day: 0, name: 'Tempo squat', muscle: 'Quads' }, { week: 0, day: 0, name: 'RDL', muscle: 'Hamstrings' }, { week: 0, day: 1, name: 'Bench', muscle: 'Chest' }, { week: 0, day: 1, name: 'Row', muscle: 'Back' }],
} };
let world;
function reset(over = {}) {
  world = {
    me: 'u-me', pronouns: 'she/her', custom: null, canView: true, points: 6200,
    provider: { id: 7, owner_id: 'u-maya', price: 180, specialty: 'Strength coach', verified: true, credential: 'NSCA-CSCS', listing_media: { cover: null, gallery: [] }, monthly_offer: { includes: ['Custom programming'] }, at_capacity: false },
    slots: [0, 1, 2, 3, 4, 5, 6].map((wd) => ({ weekday: wd, start_minute: 6 * 60, duration_min: 16 * 60 })), atCapacity: false, availFails: false,
    reviews: { reviews: [], avg: 0, count: 0 }, reviewsHold: null, byIds: [], salePlans: [], posts: [],
    booked: null, bought: undefined, asked: null, messaged: [], stored: {},
    ...over,
  };
}
reset();
window.ShapeAuth = { getCachedState: () => ({ user: world.me ? { id: world.me } : null }) };
window.ShapeProfiles = { getPublicProfile: async () => ({ name: 'Maya Okafor', pronouns: world.pronouns, bio: 'Every session gets a note.', points: world.points, custom: world.custom, can_view: world.canView }) };
window.ShapeCoachListing = { publicByOwner: async () => world.provider, publicById: async () => world.byId || null };
window.ShapeCoachAvailability = { get: async () => { if (world.availFails) throw new Error('offline'); return { slots: world.slots, booked: [], busy: [], rules: { consultMin: 20 }, timezone: ZONE, atCapacity: world.atCapacity }; } };
window.ShapeCoachReviews = {
  forOwner: async () => { if (world.reviewsHold) await world.reviewsHold; return world.reviews; },
  byIds: async () => ({ reviews: world.byIds }),
};
window.ShapeCoachPlans = { salePlansByUser: async () => world.salePlans, buy: async (a) => { world.bought = a; return 'https://checkout.stripe.test/c/1'; } };
window.bsOpenCheckout = (u) => { world.checkout = u; };
window.ShapeFollows = { stats: async () => ({ isFollowing: false, isPending: false }), toggle: async () => ({ isFollowing: true }), getCached: () => null };
window.ShapeCommunity = { listByAuthor: async () => ({ data: world.posts }) };
window.shapeDb = { getUserGoals: async () => world.stored, saveUserGoals: async () => ({ ok: true }) };
window.ShapeBookings = { submitConsultationBooking: async (a) => { world.booked = a; return { ok: true }; } };
window.ShapeListingAsks = { ask: async (a) => { world.asked = a; return { already: false }; }, forListing: async () => ({ rows: [], total: 0 }) };
window.bsProfileCardFromPost = (p) => p;
window.useBSCoachCommerce = ({ person }) => ((world.commerceSeen = person.commerce), { commerce: person.commerce, commerceCoach: person.commerce && person.commerce.coach, atCapacity: !!(person.commerce && person.commerce.atCapacity), wl: null });
window.BSCoachCoachingBlock = ({ cm }) => React.createElement('div', { 'data-coaching-block': '' }, cm.commerce.packages.map((p) => `${p.name} ${p.price}`).join(' '));

const maya = { userId: 'u-maya', who: 'Maya Okafor', kind: 'TRAINER' };
const page = (props = {}) => React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
  React.createElement(BSTrainerProfile, { person: maya, onBack: () => {}, onMessage: (p) => world.messaged.push(p.userId), ...props }));
// Every sample string the demo and the seeded-listing sample draw (trainerDemo.mjs): none may reach a
// real coach's page.
const SAMPLE_WORDS = /hasn't set up a Shape account yet|Sample times|Iron & Ordinary|Quinn Harper|Engine 8|Air bike intervals|Rower pacing|\/m\/demo\//;

// ── The drawing ──────────────────────────────────────────────────────────────────────────────
test('peaks: one a week of the program\'s own length, rising to the top; blocks split its weeks', () => {
  for (const n of [1, 4, 6, 8, 12, 52]) {
    const p = bsClimbPeaks(n);
    assert.equal(p.length, n, `${n} weeks, ${n} peaks`);
    assert.ok(p.every((x) => x.x > 0 && x.x < 1 && x.y > 0 && x.y < 1));
    assert.ok(p[p.length - 1].y <= p[0].y, 'the last week is the top');
  }
  for (const bad of [0, -1, 53, 2.5, null, undefined, '12', NaN]) assert.deepEqual(bsClimbPeaks(bad), [], String(bad));
  assert.match(bsClimbPeaksPath(bsClimbPeaks(3), 300, 100), /^M0\.0 100\.0 .* Z$/);
  assert.equal(bsClimbPeaksPath([], 300, 100), '');
  assert.deepEqual(bsClimbBlocks(12), [{ from: 1, to: 4 }, { from: 5, to: 8 }, { from: 9, to: 12 }]);
  assert.deepEqual(bsClimbBlocks(2), [{ from: 1, to: 1 }, { from: 2, to: 2 }]);
  assert.deepEqual(bsClimbBlocks(1), [{ from: 1, to: 1 }]);
  assert.deepEqual(bsClimbBlocks(null), []);
});

// ── A real coach: their own data, never a sample ────────────────────────────────────────────────
test('a real coach\'s page draws only their own data: no sample anywhere, and the wire only real events', async () => {
  reset({
    reviews: { reviews: REVIEWS, avg: 9.5, count: 2 }, salePlans: [PLAN], posts: [{ key: 'n1', title: 'Week 7 notes are up', ago: '6h', statsRow: [] }],
    custom: { about: { years: 9, how: 'both', where: 'Brooklyn' }, heroStats: ['rating', 'years'], pinned: { title: 'Priya\'s back squat PR', metric: '245 lb' } },
  });
  const m = await mount(page());
  assert.doesNotMatch(m.text(), SAMPLE_WORDS, 'nothing of a sample');
  assert.ok(!$('[data-sample-note]'));
  // The summit holds their rating, from their reviews.
  assert.match($('[data-climb-summit]').textContent.replace(/\s+/g, ' '), /9\.5 ?\/10.*Rating · 2 reviews/);
  // Pins: figures the page has (years from About, programs it sells), never a count it does not read.
  assert.deepEqual($$('[data-climb-pin]').map((p) => p.textContent), ['9 years coaching', '1 program']);
  assert.doesNotMatch(m.text(), /sessions coached|active clients|1,000 sessions|first client/i, 'no sessions or clients count is read, so none is drawn');
  // The plates: their own picked stats, then whether the listing takes clients.
  assert.deepEqual($$('[data-coach-stat]').map((s) => s.textContent), ['9.5/10Rating', '9Years coaching']);
  assert.equal($('[data-climb-open]').getAttribute('data-climb-open'), 'open');
  assert.match($('[data-climb-open]').textContent, /Taking new clients/);
  // The chips: verified by Shape, the tier, how they coach, the pronouns they wrote.
  assert.match($('[data-climb-chips]').textContent, /Verified by Shape.*In person \+ remote.*she\/her/);
  // The wire: the next open time, the newest post, the program on sale; nothing labelled an example.
  const wire = $$('[data-climb-wire-item]').map((w) => w.getAttribute('data-climb-wire-item'));
  assert.deepEqual(wire, ['next', 'post', 'p:p1']);
  assert.match($('[data-climb-wire]').textContent, /Next open · .*New post: Week 7 notes are up · 6h.*Strength Block 3 · 12 weeks · \$59/);
  assert.doesNotMatch($('[data-climb-wire]').textContent, /example/i);
  // The range draws a peak a week of the program's own 12.
  assert.equal($('[data-climb-peaks]').getAttribute('data-climb-peaks'), '12');
  await m.unmount();
});

test('null is unread: no rating, no next time and no "New on Shape" until the reads land; 0 reviews is measured', async () => {
  let release;
  reset({ reviews: { reviews: [], avg: 0, count: 0 } });
  world.reviewsHold = new Promise((r) => { release = r; });
  const m = await mount(page());
  assert.ok(!$('[data-climb-summit]') && !$('[data-climb-summit-new]'), 'the reviews are not read yet: the summit holds nothing');
  world.reviewsHold = null;
  release();
  await flush();
  assert.ok(!$('[data-climb-summit]'), 'no rating with no reviews');
  assert.match($('[data-climb-summit-new]').textContent, /New on Shape/, 'read, and none: new on Shape');
  await m.unmount();
});

test('a failed read says so with Try again, and never puts a sample in its place', async () => {
  reset({ availFails: true });
  const m = await mount(page());
  const findMe = camp('findme');
  assert.match(findMe.textContent, /Couldn't read the open times just now\./);
  assert.ok(button(/^Try again$/));
  assert.ok(!$('[data-climb-next]'), 'no next open time when the week could not be read');
  assert.ok(!$('[data-climb-wire-item="next"]'));
  assert.doesNotMatch(m.text(), /Sample times/);
  world.availFails = false;
  await click(button(/^Try again$/));
  assert.ok($('[data-climb-next]'), 'read again, the next open time');
  await m.unmount();
});

// ── Camps: hidden from a visitor when empty, shown to the coach with what to add ───────────────────
test('a visitor sees only the camps with something in them; the coach sees all of them, each with what to add', async () => {
  reset({ provider: { id: 7, owner_id: 'u-maya', price: 0, verified: false, listing_media: { cover: null, gallery: [] } } });
  let m = await mount(page());
  assert.deepEqual(campKeys(), ['findme', 'summit'], 'nothing posted, sold, pinned or reviewed: the day and the way in');
  assert.deepEqual($$('[data-climb-camp-tab]').map((b) => b.textContent), ['Book', 'Summit'], 'the row has those two');
  assert.ok(!$('[data-coach-stats]') && !$('[data-climb-wire-item="post"]'));
  await m.unmount();
  reset({ me: 'u-maya', provider: { id: 7, owner_id: 'u-maya', price: 0, verified: false, listing_media: { cover: null, gallery: [] } } });
  m = await mount(page({ isSelf: true }));
  assert.deepEqual(campKeys(), ['base', 'range', 'replays', 'proof', 'words', 'about', 'findme', 'posts', 'summit']);
  assert.match(camp('base').textContent, /Pin a highlight and add your intro film/);
  assert.match(camp('proof').textContent, /Pin up to three of your reviews/);
  assert.match(camp('words').textContent, /Reviews from your clients show here/);
  assert.match($('[data-climb-plates-empty]').textContent, /Pick up to three headline stats/);
  // The empty base camp opens Make it yours on its Spotlight.
  await click(camp('base').querySelector('[data-climb-empty] button'));
  assert.ok($('[data-make-it-yours]'), 'Make it yours, on Spotlight');
  await m.unmount();
});

// ── Booking and buying: today's paths ────────────────────────────────────────────────────────
test('the console books the next open time through the booking sheet, as a time on the day does', async () => {
  reset();
  const m = await mount(page());
  assert.match($('[data-climb-console]').textContent, /Free intro · 20 min.*Next open/);
  await click($('[data-climb-book]'));
  await click($('[data-book-intro]'));
  assert.ok(world.booked, 'booked through ShapeBookings');
  assert.equal(world.booked.role, 'trainer');
  assert.equal(world.booked.coach.provider_id, 7);
  assert.equal(world.booked.durationMin, 20);
  assert.ok(world.booked.slot.at > Date.now(), 'a time still ahead');
  assert.ok(Number.isFinite(world.booked.slot.at) && /^\d{4}-\d{2}-\d{2}$/.test(world.booked.slot.coachDate), 'a projected slot, as the day books');
  await m.unmount();
});

test('full, the console opens Work with and its waiting list; Message and Work with are the profile\'s own', async () => {
  reset({ atCapacity: true });
  let m = await mount(page());
  assert.match($('[data-climb-console]').textContent, /Full right now/);
  assert.ok(!$('[data-climb-next]'), 'no time to take while full');
  await click($('[data-climb-book]'));
  assert.ok($('[data-coaching-block]'), 'the storefront, with its waiting list');
  await m.unmount();
  reset();
  m = await mount(page());
  await click(button(/^Message Maya$/));
  assert.deepEqual(world.messaged, ['u-maya']);
  await click(button(/^Work with her$/));
  assert.equal($('[data-coaching-block]').textContent, 'Monthly coaching $180', 'useBSCoachCommerce\'s storefront, fed the real listing');
  await m.unmount();
});

test('Start on the range and in the program sheet buys through ShapeCoachPlans.buy; Ask messages the coach', async () => {
  reset({ salePlans: [PLAN] });
  const m = await mount(page());
  await click($('[data-climb-start]'));
  assert.deepEqual(world.bought, { plan: { id: 'p1', name: 'Strength Block 3', price: 59 }, providerRole: 'trainer', providerId: 7 });
  assert.equal(world.checkout, 'https://checkout.stripe.test/c/1');
  world.bought = undefined;
  await click($('[data-program-open]'));
  const sheet = $('[data-program-sheet]');
  assert.equal(sheet.parentElement, document.body, 'portalled out of the page (onto #bs-phone-surface in the app; the body here)');
  assert.match(sheet.textContent, /Strength Block 3\..*12 weeks · 2 days a week.*Barbells, machines and cables\./);
  assert.deepEqual($$('[data-climb-sheet-plate]').map((p) => p.getAttribute('data-climb-sheet-plate')), ['weeks', 'perWeek', 'sessions']);
  assert.match($('[data-climb-sheet-plate="sessions"]').textContent, /24/, '12 weeks × 2 days');
  await click($('[data-program-buy]'));
  assert.deepEqual(world.bought, { plan: { id: 'p1', name: 'Strength Block 3', price: 59 }, providerRole: 'trainer', providerId: 7 });
  await click($('[data-climb-ask]'));
  assert.deepEqual(world.messaged, ['u-maya'], 'Ask Maya is Message');
  assert.ok(!$('[data-program-sheet]'), 'and the sheet closes for the thread');
  await m.unmount();
});

test('a sample coach is a sample, under its note: times asked for, never booked, and nothing sold', async () => {
  const leah = { who: 'Leah Kim', kind: 'TRAINER', providerId: 41, city: 'Remote', specialty: 'HIIT & Conditioning HIIT', rating10: 9.6 };
  reset({ byId: { id: 41, owner_id: null, name: 'Leah Kim', price: 120, specialty: 'HIIT', verified: false, listing_media: { cover: null, gallery: [] } }, slots: [] });
  const m = await mount(page({ person: leah }));
  assert.ok($('[data-sample-note]'));
  assert.match($('[data-climb-book]').textContent, /^Ask for an intro$/);
  await click($('[data-climb-book]'));
  assert.ok(!$('[data-book-intro]'), 'no booking on a sample');
  assert.equal(world.booked, null);
  assert.ok($$('[data-program]').length > 0, 'its sample programs');
  assert.ok(!$('[data-climb-start]') && !$('[data-climb-price]'), 'no Start and no price on a sample');
  await m.unmount();
});

// ── Reviews: what they say is for members ─────────────────────────────────────────────────────
test('a visitor who is not a member sees the rating and how many, and Join Shape to read them; never a word of one', async () => {
  reset({ reviews: { reviews: [], locked: true, avg: 9.4, count: 12 }, byIds: [], custom: { pinnedReviews: [R1, R2] } });
  const m = await mount(page());
  assert.match($('[data-climb-summit]').textContent.replace(/\s+/g, ' '), /9\.4 ?\/10.*12 reviews/);
  assert.ok(!camp('proof'), 'no wins without their words');
  const words = camp('words');
  assert.match(words.textContent, /Members read the reviews\..*Join Shape to read all 12/);
  assert.ok(!$('[data-review-card]') && !$('[data-climb-win]'));
  for (const r of REVIEWS) assert.ok(!m.text().includes(r.text), 'a review\'s words');
  await m.unmount();
  // A member reads them: the wins the coach pinned are Proof, the rest Words, with the spread.
  reset({ reviews: { reviews: REVIEWS, avg: 9.5, count: 2 }, byIds: REVIEWS, custom: { pinnedReviews: [R1] } });
  const m2 = await mount(page());
  assert.equal($$('[data-climb-win]').length, 1);
  assert.match(camp('proof').textContent, /Back squat from 225 to 245/);
  assert.match(camp('words').textContent, /Tempo work fixed my knees/);
  assert.ok($('[data-climb-spread]'));
  await m2.unmount();
});

// ── A nutritionist: the same climb, in gold, with her kitchen, meal plans and plate notes ─────────
test('a nutritionist\'s Climb is gold, with Kitchen, Meal plans and Plate notes as camps', async () => {
  reset({ me: 'u-nadia', provider: { id: 9, owner_id: 'u-nadia', price: 140, verified: true, listing_media: { cover: null, gallery: [] } } });
  const m = await mount(page({ person: { userId: 'u-nadia', who: 'Nadia Rahman', kind: 'NUTRI' }, isSelf: true }));
  assert.equal($('[data-climb]').getAttribute('data-climb-role'), 'nutritionist');
  assert.deepEqual(campKeys(), ['base', 'kitchen', 'plans', 'plates', 'proof', 'words', 'about', 'findme', 'posts', 'summit']);
  assert.ok(!camp('range') && !camp('replays'), 'no trainer camps');
  const probe = document.createElement('div'); probe.style.background = '#d8a23a';
  assert.equal($('[data-climb-make]').style.background, probe.style.background, 'gold');
  await m.unmount();
});

// ── The house rules ──────────────────────────────────────────────────────────────────────────
test('no button inside a button, every camp tab a 44px target, and the wire still when motion is reduced', async () => {
  reset({ reviews: { reviews: REVIEWS, avg: 9.5, count: 2 }, salePlans: [PLAN], posts: [{ key: 'n1', title: 'A note', ago: '1d', statsRow: [] }] });
  const hadMM = window.matchMedia;
  window.matchMedia = (q) => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {} });
  try {
    const m = await mount(page());
    assert.equal($$('button button').length, 0, 'a nested button');
    assert.ok($$('[data-climb-camp-tab]').every((b) => parseFloat(b.style.minHeight) >= 44));
    assert.ok($$('[data-climb-wire] div').every((d) => !/bsClimbWire/.test(d.style.animation || '')), 'the wire does not run');
    assert.ok(!$('[data-climb-terrain] animate'), 'the route does not run');
    assert.doesNotMatch(m.text(), /●/, 'no dot glyph in a pill');
    await m.unmount();
  } finally { window.matchMedia = hadMM; }
});

test('the module stands alone: its own useShapeTr, globals read at call time, sheets on the phone surface, no import back', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSCoachClimb.jsx'), 'utf8');
  const imports = [...src.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((x) => x[1]);
  assert.deepEqual(imports, ['react', 'react-dom', '../services/videoComponents.mjs'], 'nothing from the client module or the profile');
  assert.match(src, /^function useShapeTr\(\) \{/m);
  assert.match(src, /document\.getElementById\('bs-phone-surface'\)/);
  assert.match(src, /W\.useBSPinnedMastTop \? W\.useBSPinnedMastTop\(\) : 0/, 'the camps stick under the pinned masthead');
  assert.doesNotMatch(src, /^const \{[^}]*\} = window;/m, 'a global read when the module loads');
  assert.match(src, /fontVariationSettings: "'ROND' 100"/, 'Doto only with its dots');
  assert.doesNotMatch(src, /\bconfirm\(/);
  const profile = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), 'utf8');
  assert.match(profile, /from '\.\/BSCoachClimb\.jsx';/);
});
