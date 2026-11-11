// The Climb (owner, 2026-11-09: "for coaches profile lets complete full buildout of 'the climb'"), MOUNTED:
// mobile-app/src/broadsheet/BSCoachClimb.jsx as BSTrainerProfile.jsx draws it for a trainer and a
// nutritionist, in the real broadsheet chrome, against scripted backends, reading the real English
// catalogs.
//
// What it pins: a real coach's page shows only that coach's own data and never a sample; a camp with
// nothing in it is left out for a visitor and shown to the coach with what to add; null is unread (no
// rating, no next time until the read lands) and a failed read says so with Try again; the console's
// Book, a program card's Start and the program sheet's Ask and Start go through the profile's own paths
// (the booking sheet, ShapeCoachPlans.buy, Message); the Summit is the one place to buy (owner,
// 2026-11-11), and every "Work with" climbs to it; and what a review says stays with members.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsCoachPagePalette } from '../mobile-app/src/services/coachPagePalette.mjs';

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
// The Summit's parts, top to bottom (BSTrainerProfile.jsx: coaching, programs or meal plans, workouts).
const summitParts = () => [...camp('summit').querySelectorAll('[data-summit-part]')].map((el) => el.getAttribute('data-summit-part'));
// Where a door climbs to: the page scrolls to the camp whose box it measures, and jsdom lays nothing out,
// so each camp's box notes that it was read.
const watchClimb = () => {
  const read = [];
  assert.ok($('.bs-scroll [data-climb]'), 'the page is in its scroller');
  for (const el of $$('[data-climb-camp]')) el.getBoundingClientRect = () => { read.push(el.getAttribute('data-climb-camp')); return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 }; };
  return read;
};

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
const climbMod = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCoachClimb.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });
const { BSTrainerProfile } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });
const { bsClimbBlocks, bsClimbAccent, CLIMB_ACCENTS } = climbMod;
const { BS_COACH_ACCENTS, bsCoachPalette } = await import(join(ROOT, 'public/newdesign/coachProfileKit.mjs'));

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
window.ShapeProfiles = { getPublicProfile: async () => ({ name: 'Maya Okafor', pronouns: world.pronouns, bio: 'Every session gets a note.', points: world.points, custom: world.custom, can_view: world.canView, location: world.location || null }) };
window.ShapeCoachListing = { publicByOwner: async () => world.provider, publicById: async () => world.byId || null };
window.ShapeCoachAvailability = { get: async () => { if (world.availFails) throw new Error('offline'); return { slots: world.slots, booked: [], busy: [], rules: { consultMin: 20 }, timezone: ZONE, atCapacity: world.atCapacity }; } };
window.ShapeCoachReviews = {
  forOwner: async () => { if (world.reviewsHold) await world.reviewsHold; if (world.revFails) throw new Error('offline'); return world.reviews; },
  byIds: async () => ({ reviews: world.byIds }),
};
window.ShapeCoachPlans = { salePlansByUser: async () => { if (world.plansHold) await world.plansHold; if (world.plansFail) throw new Error('offline'); return world.salePlans; }, buy: async (a) => { world.bought = a; return 'https://checkout.stripe.test/c/1'; } };
window.bsOpenCheckout = (u) => { world.checkout = u; };
window.ShapeFollows = { stats: async () => ({ isFollowing: false, isPending: false }), toggle: async () => ({ isFollowing: true }), getCached: () => null };
window.ShapeCommunity = { listByAuthor: async () => { if (world.postsFail) throw new Error('offline'); return { data: world.posts }; } };
window.shapeDb = { getUserGoals: async () => world.stored, saveUserGoals: async () => ({ ok: true }) };
window.ShapeBookings = { submitConsultationBooking: async (a) => { world.booked = a; return { ok: true }; } };
window.ShapeListingAsks = { ask: async (a) => { world.asked = a; return { already: false }; }, forListing: async () => ({ rows: [], total: 0 }) };
window.bsProfileCardFromPost = (p) => p;
window.useBSCoachCommerce = ({ person }) => ((world.commerceSeen = person.commerce), { commerce: person.commerce, commerceCoach: person.commerce && person.commerce.coach, atCapacity: !!(person.commerce && person.commerce.atCapacity), wl: null });
// The storefront as a probe that keeps the real block's contract (tests/coach-work-sheet.test.mjs): its
// plan list (a row a plan, or the empty line) unless it is handed noPlans.
window.BSCoachCoachingBlock = (props) => {
  const { cm, noPlans, salePlans } = props;
  world.blockProps = props;
  return React.createElement('div', { 'data-coaching-block': '' }, cm.commerce.packages.map((p) => `${p.name} ${p.price}`).join(' '),
    noPlans ? null : (salePlans || []).length ? salePlans.map((pl) => React.createElement('div', { key: pl.id, 'data-offer-row': '' }, pl.name)) : React.createElement('div', { 'data-offer-empty': '' }, 'No plans'));
};

const maya = { userId: 'u-maya', who: 'Maya Okafor', kind: 'TRAINER' };
const page = (props = {}) => React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
  React.createElement(BSTrainerProfile, { person: maya, onBack: () => {}, onMessage: (p) => world.messaged.push(p.userId), ...props }));
// Every sample string the demo and the seeded-listing sample draw (trainerDemo.mjs): none may reach a
// real coach's page.
const SAMPLE_WORDS = /hasn't set up a Shape account yet|Sample times|Iron & Ordinary|Quinn Harper|Engine 8|Air bike intervals|Rower pacing|\/m\/demo\//;

// ── The drawing ──────────────────────────────────────────────────────────────────────────────
test('blocks split a program\'s weeks', () => {
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
  // The range: no peaks drawn on a card (owner, 9 Nov: "remove the graph design part"); a program with no photo
  // is a band in its colour.
  assert.equal(!!$('[data-climb-range] svg'), false, 'no drawing on a card');
  assert.equal($('[data-climb-program-art]').getAttribute('data-climb-program-art'), 'band');
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
  const findMe = camp('day');
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
  assert.deepEqual(campKeys(), ['day', 'summit'], 'nothing posted, sold, pinned or reviewed: the day and the way in');
  assert.deepEqual($$('[data-climb-camp-tab]').map((b) => b.textContent), ['Book', 'Summit'], 'the row has those two');
  assert.ok(!$('[data-coach-stats]') && !$('[data-climb-wire-item="post"]'));
  await m.unmount();
  reset({ me: 'u-maya', provider: { id: 7, owner_id: 'u-maya', price: 0, verified: false, listing_media: { cover: null, gallery: [] } } });
  m = await mount(page({ isSelf: true }));
  assert.deepEqual(campKeys(), ['base', 'day', 'replays', 'proof', 'words', 'about', 'find', 'posts', 'summit']);
  assert.match(camp('base').textContent, /Pin a highlight and add your intro film/);
  // Their programs and workouts are in the Summit, each saying what to add.
  assert.deepEqual(summitParts(), ['coaching', 'programs', 'workouts']);
  assert.match(camp('summit').querySelector('[data-summit-part="coaching"]').textContent, /Members start working with you from here/);
  assert.match(camp('summit').querySelector('[data-summit-part="programs"]').textContent, /Publish a program and it shows here/);
  assert.match(camp('summit').querySelector('[data-summit-part="workouts"]').textContent, /Post a workout video, or publish a program/);
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

test('full, the console climbs to the Summit and its waiting list; Message and Work with are the profile\'s own', async () => {
  reset({ atCapacity: true });
  let m = await mount(page());
  assert.match($('[data-climb-console]').textContent, /Full right now/);
  assert.ok(!$('[data-climb-next]'), 'no time to take while full');
  let climbed = watchClimb();
  await click($('[data-climb-book]'));
  assert.deepEqual(climbed, ['summit'], 'to the Summit');
  assert.ok(camp('summit').querySelector('[data-coaching-block]'), 'the storefront, with its waiting list');
  assert.ok(!$('[role="dialog"]'), 'no Work-with sheet');
  await m.unmount();
  reset();
  m = await mount(page());
  await click(button(/^Message Maya$/));
  assert.deepEqual(world.messaged, ['u-maya']);
  climbed = watchClimb();
  await click(button(/^Work with her$/));
  assert.deepEqual(climbed, ['summit'], 'Work with climbs to the Summit');
  assert.ok(!$('[role="dialog"]'), 'and opens no sheet');
  assert.equal(camp('summit').querySelector('[data-coaching-block]').textContent, 'Monthly coaching $180', 'useBSCoachCommerce\'s storefront, fed the real listing');
  await m.unmount();
});

test('Start on a program card and in the program sheet buys through ShapeCoachPlans.buy; Ask messages the coach', async () => {
  reset({ salePlans: [PLAN] });
  const m = await mount(page());
  await click($('[data-climb-start]'));
  assert.deepEqual(world.bought, { plan: { id: 'p1', name: 'Strength Block 3', price: 59 }, providerRole: 'trainer', providerId: 7 });
  assert.equal(world.checkout, 'https://checkout.stripe.test/c/1');
  world.bought = undefined;
  await click($('[data-program-open]'));
  const sheet = $('[data-program-sheet]');
  assert.ok(sheet.parentElement === document.body, 'portalled out of the page (onto #bs-phone-surface in the app; the body here)');
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

test('a program sells only on a live listing: without one, no Start on its card, and its sheet offers Work with', async () => {
  // An unfinished or suspended listing reads as none (the meal plans' and the storefront's rule; Codex P1 on 196314b).
  reset({ salePlans: [PLAN], provider: null });
  const m = await mount(page());
  const programs = camp('summit').querySelector('[data-summit-part="programs"]');
  assert.ok(programs.querySelector('[data-climb-program="p1"]'), 'the program is still shown');
  assert.ok(!programs.querySelector('[data-climb-start]'), 'no Start without a listing');
  await click(programs.querySelector('[data-program-open]'));
  assert.ok($('[data-program-sheet]'));
  assert.ok(!$('[data-program-buy]'), 'no Start · price in the sheet');
  assert.doesNotMatch($('[data-program-sheet]').textContent, /One-off · runs in the Shape app/, 'nor its price');
  const climbed = watchClimb();
  await click(button(/^Work with Maya$/));
  assert.ok(!$('[data-program-sheet]'));
  assert.deepEqual(climbed, ['summit']);
  assert.equal(world.bought, undefined, 'nothing bought');
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
  assert.ok(!camp('proof'), 'no Proof on a sample: its reviews are the sample\'s own');
  await m.unmount();
  // Even with a review pinned on the sample (Make it yours on the signed-out demo): no Proof, and the
  // pinned one stays in Words.
  reset({ me: null });
  const m2 = await mount(page({ person: { who: 'Maya Okafor', kind: 'TRAINER' }, previewCustom: { pinnedReviews: ['demo-r1'] } }));
  assert.ok($('[data-sample-note]') || $('[data-climb]'), 'the demo');
  assert.ok(!camp('proof'), 'no Proof on the demo');
  assert.match(camp('words').textContent, /\+60 lb on my deadlift/, 'the pinned sample review in Words');
  await m2.unmount();
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
  assert.deepEqual(campKeys(), ['base', 'day', 'kitchen', 'plates', 'proof', 'words', 'about', 'find', 'posts', 'summit']);
  // Her meal plans are in the Summit (owner, 2026-11-11), saying what to add; no camp of their own.
  assert.deepEqual(summitParts(), ['coaching', 'meal-plans']);
  assert.match(camp('summit').querySelector('[data-summit-part="meal-plans"]').textContent, /^Meal plans.*Publish a meal plan and it shows here/);
  assert.ok(!camp('replays') && !camp('range'), 'no trainer camps, and no range');
  const probe = document.createElement('div'); probe.style.background = '#d8a23a';
  assert.equal($('[data-climb-make] span').style.background, probe.style.background, 'gold');
  await m.unmount();
});

test('the coach\'s own page: Your hours and Make it yours as a small pill in the head that scrolls away (owner, 9 Nov)', async () => {
  reset();
  const m = await mount(page({ isSelf: true }));
  const own = $('[data-climb-console-self]');
  assert.ok(own && own.closest('[data-climb-hero]'), 'in the head, under the quote and plates');
  assert.notEqual(own.style.position, 'sticky', 'it does not follow the scroll');
  assert.equal($$('[data-climb-console]').length, 1, 'no docked console on the coach\'s own page');
  assert.ok(!/Members book you from here/.test(own.textContent), 'no line of text, only the two keys');
  assert.equal(own.querySelector('[role="group"]').getAttribute('aria-label'), 'Members book you from here.');
  for (const sel of ['[data-climb-hours]', '[data-climb-make]']) {
    const b = $(sel);
    assert.equal(b.style.minHeight, '44px', `${sel} keeps a 44px tap area`);
    assert.equal(b.querySelector('span').style.height, '30px', `${sel} has a smaller face`);
  }
  await m.unmount();
  // A visitor's console sits in the head too and scrolls away (owner, 10 Nov: "still staying present and
  // too high on screen when i scroll"); the Summit's storefront has its own free intro.
  reset();
  const v = await mount(page());
  const theirs = $('[data-climb-console]');
  assert.ok(theirs.closest('[data-climb-hero]'), 'in the head, under the quote and plates');
  assert.notEqual(theirs.style.position, 'sticky', 'it does not follow the scroll');
  assert.ok(!theirs.style.bottom, 'no offset over the tab bar');
  assert.equal($$('[data-climb-console]').length, 1, 'one console, no docked copy');
  assert.ok(!$('[data-climb-console-self]'));
  await v.unmount();
});

test('the portrait, a little smaller (owner, 10 Nov), in the same box so the name stays below the route', async () => {
  reset();
  const m = await mount(page());
  const prism = $('[data-climb-prism]');
  assert.equal(prism.style.width, '38%');
  assert.equal(prism.style.maxWidth, '144px', 'was 168');
  assert.equal(prism.style.height, '184px', 'was 214');
  assert.equal(prism.parentElement.style.height, '336px', 'its box keeps its height');
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
  assert.deepEqual(imports, ['react', 'react-dom', '../services/videoComponents.mjs', '../services/dialogBack.mjs'], 'nothing from the client module or the profile');
  assert.match(src, /^function useShapeTr\(\) \{/m);
  assert.match(src, /document\.getElementById\('bs-phone-surface'\)/);
  assert.match(src, /W\.useBSPinnedMastTop \? W\.useBSPinnedMastTop\(\) : 0/, 'the camps stick under the pinned masthead');
  assert.doesNotMatch(src, /^const \{[^}]*\} = window;/m, 'a global read when the module loads');
  // The figures as the chat feed sets them (owner, 9 Nov): Saira 700, tight, even-width numerals; no Doto left.
  assert.match(src, /FIG: "'Saira', /);
  // In the page's theme (climbType: the coach's ink, the Climb's with no pick).
  assert.match(src, /numFace: \(size, color = C\.INK\) => \(\{ fontFamily: C\.FIG, fontWeight: 700, [^}]*fontVariantNumeric: 'tabular-nums', letterSpacing: '-0\.035em' \}\),/);
  assert.doesNotMatch(src, /Doto|DOTO|ROND/, 'no Doto on the coach profile');
  assert.doesNotMatch(readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), 'utf8'), /Doto|DOTO|ROND/, 'nor on the page that feeds it');
  assert.doesNotMatch(src, /\bconfirm\(/);
  const profile = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), 'utf8');
  assert.match(profile, /from '\.\/BSCoachClimb\.jsx';/);
});

// ── One camp list on both surfaces (owner, 9 Nov: "Fix everything with profile then open PR") ────────
const PHOTO = 'https://x.supabase.co/storage/v1/object/public/community-photos/u-maya/lift.jpg';
const fullCoach = (over = {}) => reset({
  reviews: { reviews: REVIEWS, avg: 9.5, count: 2 }, byIds: [REVIEWS[0]], salePlans: [PLAN],
  posts: [{ key: 'ph1', title: 'Morning lift', photo: PHOTO, ago: '1d', statsRow: [] }, { key: 'n1', title: 'Week 7 notes are up', ago: '6h', statsRow: [] }],
  custom: {
    about: { story: 'I started lifting at 30.', years: 9 }, prompts: [{ q: 'philosophy', a: 'Strong first.' }],
    links: { instagram: '@maya.lifts' }, bizCard: { name: 'Iron Path Strength', where: 'Brooklyn' }, pinnedReviews: [R1],
  },
  provider: { id: 7, owner_id: 'u-maya', price: 180, specialty: 'Strength coach', verified: true, listing_media: { cover: null, gallery: [{ url: 'https://x.supabase.co/storage/v1/object/public/coach-media/u-maya/gym.jpg', caption: 'The gym' }] }, monthly_offer: { includes: [] }, at_capacity: false },
  ...over,
});

test('the camps run as on the website: Base, Book, Proof, Words, About, Find me, Posts, Summit', async () => {
  fullCoach();
  const m = await mount(page());
  // No Programs camp (owner, 2026-11-11: the Programs camp folds into the Summit; Book stays on its own).
  assert.deepEqual(campKeys(), ['base', 'day', 'proof', 'words', 'about', 'find', 'posts', 'summit']);
  assert.deepEqual($$('[data-climb-camp-tab]').map((b) => b.textContent), ['Base', 'Book', 'Proof', 'Words', 'About', 'Find me', 'Posts', 'Summit']);
  // The numbering: Base first, the Summit last, Camp 1, 2 … between.
  assert.match(camp('day').textContent, /^Camp 1 · Book/);
  assert.match(camp('find').textContent, /^Camp 5 · Find me/);
  // Base: the newest post with a photo, opening the Posts camp, and All N posts.
  const tile = camp('base').querySelector('[data-climb-photo-post]');
  assert.equal(tile.querySelector('img').getAttribute('src'), PHOTO);
  assert.match(camp('base').querySelector('[data-climb-all-posts]').textContent, /All 2 posts/);
  // About is who they are; Find me is where: the practice's card, the links and the listing's photos.
  const about = camp('about'), find = camp('find');
  assert.ok(about.querySelector('[data-about="story"]') && about.querySelector('[data-about="qa"]'));
  assert.ok(!about.querySelector('[data-about="practice"], [data-about="socials"], [data-about="photos"]'), 'none of Find me under About');
  assert.match(find.querySelector('[data-about="practice"]').textContent, /Iron Path Strength/);
  assert.equal(find.querySelector('[data-about-link="instagram"]').getAttribute('href'), 'https://instagram.com/maya.lifts');
  assert.ok(find.querySelector('[data-about="photos"] img'), 'the listing photos');
  assert.ok(!find.querySelector('[data-about="story"], [data-about="qa"]'));
  // Proof is the pinned win; Words the rest.
  assert.match(camp('proof').textContent, /Back squat from 225 to 245/);
  assert.doesNotMatch(camp('words').textContent, /Back squat from 225 to 245/, 'a pinned review is in Proof, not twice');
  assert.match(camp('words').textContent, /Tempo work fixed my knees/);
  await m.unmount();
});

test('Proof is review text: a reader the reviews are locked for never sees the camp', async () => {
  fullCoach({ reviews: { reviews: [], avg: 9.5, count: 2, locked: true } });
  const m = await mount(page());
  assert.ok(!camp('proof'), 'no Proof for a locked reader, even with pins');
  assert.doesNotMatch(m.text(), /Back squat from 225 to 245/);
  assert.match(camp('words').textContent, /Join Shape to read all 2/);
  await m.unmount();
});

test('Find me: hidden from a visitor with nothing in it; the coach sees it empty with what to add', async () => {
  reset({ custom: { about: { story: 'Hi.' } } });
  let m = await mount(page());
  assert.ok(camp('about') && !camp('find'), 'About, but no empty Find me');
  await m.unmount();
  reset({ me: 'u-maya', stored: {} });
  m = await mount(page({ isSelf: true }));
  assert.match(camp('find').textContent, /Add your practice, its hours and your links/);
  await click(camp('find').querySelector('[data-about-edit="find"]'));
  assert.ok($('[data-mine-about]'), 'Add where to find you opens Make it yours on About me');
  await m.unmount();
});

test('a failed read of the posts, programs or reviews says so where it is, with Try again', async () => {
  reset({ postsFail: true, plansFail: true, revFails: true });
  const m = await mount(page());
  const programs = () => camp('summit').querySelector('[data-summit-part="programs"]');
  assert.match(camp('posts').querySelector('[data-climb-read-error]').textContent, /Couldn't read Maya's posts just now/);
  assert.match(camp('replays').querySelector('[data-climb-read-error]').textContent, /Couldn't read Maya's posts/);
  assert.match(programs().querySelector('[data-climb-read-error]').textContent, /Couldn't read Maya's programs just now/, 'in the Summit, where the programs are');
  assert.match(camp('words').querySelector('[data-climb-read-error]').textContent, /Couldn't read the reviews just now/);
  assert.doesNotMatch(m.text(), SAMPLE_WORDS, 'never a sample in its place');
  world.postsFail = false; world.posts = [{ key: 'n1', title: 'Week 7 notes are up', ago: '6h', statsRow: [] }];
  await click(camp('posts').querySelector('[data-climb-retry]'));
  assert.ok(!camp('posts').querySelector('[data-climb-read-error]'));
  assert.match(camp('posts').textContent, /Week 7 notes are up/);
  world.plansFail = false; world.salePlans = [PLAN];
  await click(programs().querySelector('[data-climb-retry]'));
  assert.ok(programs().querySelector('[data-climb-program]'), 'the program, read again');
  world.revFails = false; world.reviews = { reviews: REVIEWS, avg: 9.5, count: 2 };
  await click(camp('words').querySelector('[data-climb-retry]'));
  assert.match(camp('words').textContent, /Tempo work fixed my knees/);
  await m.unmount();
});

// ── The Summit, the one place to buy (owner, 2026-11-11) ───────────────────────────────────────
// "The Summit becomes the one place to buy: monthly coaching first, then each program as its card with
// preview and Buy, then the workouts, then Message. The separate Programs section and the duplicate price
// list go away."
const MEAL = { id: 'm1', kind: 'meal_plan', name: 'Lean cut', price: '60', category: 'meal', meta: '4 weeks', providerId: 9, providerRole: 'nutritionist', detail: {} };
const nadia = { userId: 'u-nadia', who: 'Nadia Rahman', kind: 'NUTRI' };
const NADIA_LISTING = { id: 9, owner_id: 'u-nadia', price: 140, verified: true, listing_media: { cover: null, gallery: [] }, monthly_offer: { includes: [] }, at_capacity: false };
test('the Summit: coaching, then the programs or meal plans as cards, then the workouts; no price list, and every Work with lands there', async () => {
  // A trainer, with a program on sale and a line about her coaching.
  fullCoach({ custom: { descriptions: { coaching: 'Weekly video check-ins, a new block every month.' } } });
  let m = await mount(page());
  assert.ok(!camp('range') && !$('[data-climb-camp-tab="range"]'), 'no Programs camp');
  assert.deepEqual(summitParts(), ['coaching', 'programs', 'workouts'], 'coaching first, then the programs, then the workouts');
  const summit = camp('summit');
  assert.ok(summit.querySelector('[data-summit-part="coaching"] [data-coaching-block]'), 'the monthly coaching is the storefront, in the Summit');
  assert.equal(world.blockProps.noPlans, true, 'without its plan list');
  assert.equal(world.blockProps.desc, 'Weekly video check-ins, a new block every month.', 'with the coach\'s own line about their coaching');
  assert.equal(summit.querySelectorAll('[data-offer-row], [data-offer-empty]').length, 0, 'no price list');
  assert.equal($$('[data-offer-row]').length, 0, 'anywhere on the page');
  assert.ok(summit.querySelector('[data-summit-part="coaching"] [data-summit-message]'), 'Message, with the coaching');
  assert.equal($$('[data-summit-message]').length, 1, 'once');
  // Each program as its card, with its preview and Start.
  const card = summit.querySelector('[data-summit-part="programs"] [data-climb-program="p1"]');
  assert.match(card.textContent, /Strength Block 3/);
  assert.ok(card.querySelector('[data-program-open]') && card.querySelector('[data-climb-start]'));
  assert.match(summit.querySelector('[data-summit-part="programs"] [data-climb-summit-head]').textContent, /^Programs$/);
  // The workouts, with no coaching card (the coaching is the first part) and no jump line for one part.
  const workouts = summit.querySelector('[data-summit-part="workouts"]');
  assert.ok(workouts.querySelector('[data-studio-workouts] [data-workout]'), 'the program\'s days as workouts');
  assert.ok(!$('[data-coaching-card]') && !$('[data-studio-coaching]') && !$('[data-studio-jump]'));
  // Every door that opened the Work-with sheet climbs to the Summit.
  let climbed = watchClimb();
  await click(button(/^Work with her$/));
  await click(button(/^Ways to work with Maya/));
  assert.deepEqual(climbed, ['summit', 'summit'], 'the hero\'s Work with and the day\'s Ways to work with');
  assert.ok(!$('[role="dialog"]'), 'no Work-with sheet');
  await m.unmount();
  // A free program's sheet offers Work with in place of Start: it closes the sheet at the Summit.
  fullCoach({ salePlans: [{ ...PLAN, price: null }] });
  m = await mount(page());
  await click(camp('summit').querySelector('[data-program-open]'));
  assert.ok($('[data-program-sheet]'));
  climbed = watchClimb();
  await click(button(/^Work with Maya$/));
  assert.ok(!$('[data-program-sheet]'), 'the sheet closes');
  assert.deepEqual(climbed, ['summit']);
  await m.unmount();
  // A nutritionist: the coaching, then her meal plans; a paid one buys through the storefront's checkout.
  reset({ me: 'u-me', provider: NADIA_LISTING, salePlans: [MEAL, { ...MEAL, id: 'm2', name: 'Free week', price: '' }] });
  m = await mount(page({ person: nadia }));
  assert.ok(!camp('range'), 'no Meal plans camp');
  assert.deepEqual(summitParts(), ['coaching', 'meal-plans']);
  assert.equal(camp('summit').querySelectorAll('[data-offer-row], [data-offer-empty]').length, 0, 'no price list');
  assert.equal(world.blockProps.noPlans, true);
  const plans = camp('summit').querySelector('[data-summit-part="meal-plans"]');
  assert.match(plans.querySelector('[data-climb-summit-head]').textContent, /^Meal plans$/);
  assert.deepEqual([...plans.querySelectorAll('[data-climb-program]')].map((c) => c.getAttribute('data-climb-program')), ['m1', 'm2']);
  assert.ok(!plans.querySelector('[data-climb-program="m2"] [data-climb-start]'), 'nothing to pay for a free plan');
  await click(plans.querySelector('[data-climb-start]'));
  assert.deepEqual(world.bought, { plan: { id: 'm1', name: 'Lean cut', price: '60' }, providerRole: 'nutritionist', providerId: 9 }, 'the plan\'s own listing and role');
  assert.equal(world.checkout, 'https://checkout.stripe.test/c/1');
  // See the plan opens its preview (the marketplace's sheet), whose Buy is the card's Start.
  world.bought = undefined; world.checkout = undefined;
  const open1 = plans.querySelector('[data-climb-program="m1"] [data-program-open]');
  assert.equal(open1.textContent, 'See the plan', 'a meal plan is no climb');
  await click(open1);
  assert.ok($('[role="dialog"][aria-label="What\'s inside Lean cut"]'), 'the preview sheet');
  assert.match($('[role="dialog"]').textContent, /Meal plan · \$60/);
  assert.ok(!$('[data-preview-work]'));
  await click($('[data-preview-buy]'));
  assert.ok(!$('[role="dialog"]'), 'Buy closes the sheet for the checkout');
  assert.deepEqual(world.bought, { plan: { id: 'm1', name: 'Lean cut', price: '60' }, providerRole: 'nutritionist', providerId: 9 });
  assert.equal(world.checkout, 'https://checkout.stripe.test/c/1');
  // A free plan's preview has nothing to buy, and offers Work with: it climbs to the Summit.
  world.bought = undefined;
  await click(plans.querySelector('[data-climb-program="m2"] [data-program-open]'));
  assert.ok(!$('[data-preview-buy]'), 'no Buy on a free plan');
  await click($('[data-preview-work]'));
  assert.ok(!$('[role="dialog"]'));
  assert.equal(world.bought, undefined);
  await m.unmount();
  // No live listing: the plan opens, and neither its card nor its preview sells it.
  reset({ me: 'u-me', provider: null, salePlans: [MEAL] });
  m = await mount(page({ person: nadia }));
  const plans2 = camp('summit').querySelector('[data-summit-part="meal-plans"]');
  assert.ok(plans2.querySelector('[data-climb-program="m1"]') && !plans2.querySelector('[data-climb-start]'), 'no Start without a listing');
  await click(plans2.querySelector('[data-program-open]'));
  assert.ok($('[role="dialog"]') && !$('[data-preview-buy]') && $('[data-preview-work]'), 'Work with, not Buy');
  await m.unmount();
  // A checkout that fails says so.
  reset({ me: 'u-me', provider: NADIA_LISTING, salePlans: [MEAL] });
  const toasts = [];
  const hadToast = window.__bsToast;
  const hadBuy = window.ShapeCoachPlans.buy;
  window.__bsToast = (msg, kind) => toasts.push([msg, kind]);
  window.ShapeCoachPlans.buy = async () => { throw new Error('This plan is no longer for sale.'); };
  try {
    m = await mount(page({ person: nadia }));
    await click(camp('summit').querySelector('[data-climb-start]'));
    assert.deepEqual(toasts, [['This plan is no longer for sale.', 'err']]);
    await m.unmount();
  } finally { window.__bsToast = hadToast; window.ShapeCoachPlans.buy = hadBuy; }
  // Her own page: the meal plan to look at, never to buy.
  reset({ me: 'u-nadia', provider: NADIA_LISTING, salePlans: [MEAL] });
  m = await mount(page({ person: nadia, isSelf: true }));
  assert.ok(camp('summit').querySelector('[data-climb-program="m1"]') && !$('[data-climb-start]'), 'no Start on her own page');
  await click(camp('summit').querySelector('[data-program-open]'));
  assert.ok($('[role="dialog"]') && !$('[data-preview-buy]') && !$('[data-preview-work]'), 'her own plan\'s preview sells nothing');
  assert.match($('[data-preview-self]').textContent, /what members see before they buy/);
  await click(button(/^Close$/));
  assert.ok(!camp('summit').querySelector('[data-coaching-block]'), 'the storefront is a member\'s; she reads what members do here');
  assert.match(camp('summit').textContent, /Members start working with you from here/);
  await m.unmount();
  // Unread is not empty: the coach's own Summit says what to add only once their plans are read.
  let release;
  reset({ me: 'u-maya' });
  world.plansHold = new Promise((r) => { release = r; });
  m = await mount(page({ isSelf: true }));
  assert.ok(camp('summit').querySelector('[data-summit-part="programs"]'));
  assert.doesNotMatch(camp('summit').textContent, /Publish a program/, 'not while the plans are read');
  world.plansHold = null;
  release();
  await flush();
  assert.match(camp('summit').querySelector('[data-summit-part="programs"]').textContent, /Publish a program and it shows here/, 'read, and none');
  await m.unmount();
});

test('the Summit sells every program the coach publishes, past the Studio\'s twelve; on their own page the coach keeps their coaching card', async () => {
  // The price list sold every plan the read returned; its cards must too (coachWork.mjs's BS_WORK_SALE_MAX).
  const many = Array.from({ length: 15 }, (_, i) => ({ ...PLAN, id: `p${i + 1}`, name: `Block ${i + 1}` }));
  fullCoach({ salePlans: many });
  world.custom = { ...(world.custom || {}), heroStats: ['programs'] };
  let m = await mount(page());
  const programs = camp('summit').querySelector('[data-summit-part="programs"]');
  assert.deepEqual([...programs.querySelectorAll('[data-climb-program]')].map((c) => c.getAttribute('data-climb-program')), many.map((p) => p.id), 'all fifteen, in their order');
  await click(programs.querySelector('[data-climb-program="p15"] [data-climb-start]'));
  assert.equal(world.bought && world.bought.plan.id, 'p15', 'the fifteenth buys');
  await click(programs.querySelector('[data-climb-program="p14"] [data-program-open]'));
  assert.match($('[data-program-sheet]').textContent, /Block 14/, 'and opens its sheet');
  // The head counts them all too, not the Studio's twelve.
  assert.match($('[data-climb]').textContent, /15 programs/, 'the milestone');
  assert.doesNotMatch($('[data-climb]').textContent, /12 programs/);
  assert.match($('[data-climb-plates]').textContent, /15\s*Programs/, 'and the head\'s stat');
  await m.unmount();
  // Their own page: the storefront draws nothing for the coach, so their coaching card (its price) stays,
  // under the workouts; with no monthly price the Summit's line says so, and there is no card.
  fullCoach({ me: 'u-maya' });
  m = await mount(page({ isSelf: true }));
  const card = camp('summit').querySelector('[data-summit-part="workouts"] [data-coaching-card]');
  assert.ok(card, 'their coaching card');
  assert.match(card.textContent, /\$180/);
  assert.ok(!camp('summit').querySelector('[data-summit-no-prices]'));
  await m.unmount();
  // (With no plan to pay for either: a paid plan is a price, and the line stays away.)
  fullCoach({ me: 'u-maya', salePlans: [], provider: { ...world.provider, price: 0 } });
  m = await mount(page({ isSelf: true }));
  assert.ok(!$('[data-coaching-card]') && !$('[data-studio-coaching]'), 'no card, and no second line to say so');
  assert.match(camp('summit').querySelector('[data-summit-no-prices]').textContent, /once your listing has a monthly price/);
  await m.unmount();
});

// ── The coach's accent: the drawing, never the words ─────────────────────────────────────────
const colorOf = (hex) => { const d = document.createElement('div'); d.style.color = hex; return d.style.color; };
test("the accent the coach picked paints the drawing, the labels and the tabs at its readable step; Book keeps the role's rust", async () => {
  fullCoach();
  world.custom = { ...world.custom, look: { accent: 'violet' } };
  let m = await mount(page());
  // Owner, 2026-11-11 (after #2706 on the website): the kit's palette, an accent alone on the Climb's ground.
  const P = bsCoachPagePalette({ accent: 'violet' }, 'trainer');
  const V = P.DRAW;
  assert.equal($('[data-climb-route-glow]').getAttribute('stroke'), V, 'the route');
  assert.ok($$('[data-climb-contour]').every((c) => c.getAttribute('stroke') === V), 'the contours');
  assert.equal($('[data-climb-stop]').style.color, colorOf(V), "the name's full stop");
  assert.ok($$('[data-climb-camp-stop]').length && $$('[data-climb-camp-stop]').every((d) => d.style.color === colorOf(V)), "each camp title's full stop");
  assert.ok($$('[data-climb-diamond]').every((d) => d.style.borderColor === colorOf(V)), 'the diamonds');
  assert.equal($('[data-climb-pin-ring]').style.borderColor, colorOf(V), 'the pins');
  // Text and controls: the accent at its readable step (was: always teal); Book keeps the rust.
  assert.equal($('[data-climb-eyebrow]').style.color, colorOf(P.ACCENT), 'a label takes the accent');
  assert.equal($('[data-climb-camp-tab][aria-current]').style.color, colorOf(P.ACCENT), 'the tab you are at');
  const probe = document.createElement('div'); probe.style.background = '#c0533b';
  assert.equal($('[data-climb-book]').style.background, probe.style.background, 'Book stays rust');
  await m.unmount();
  // No accent, or one that is not Shape's: today's teal.
  for (const look of [null, { accent: 'chartreuse' }, { accent: '#123456' }]) {
    fullCoach(); world.custom = { ...world.custom, look };
    m = await mount(page());
    assert.equal($('[data-climb-route-glow]').getAttribute('stroke'), '#34d6c5', JSON.stringify(look));
    assert.equal($('[data-climb-stop]').style.color, colorOf('#34d6c5'));
    await m.unmount();
  }
  // A trainer whose pick is the seeded teal: teal (no pick).
  fullCoach(); world.custom = { ...world.custom, look: { accent: 'teal' } };
  m = await mount(page());
  assert.equal($('[data-climb-route-glow]').getAttribute('stroke'), '#34d6c5');
  await m.unmount();
  // A nutritionist with the seeded amber, which is no pick: the Climb's gold.
  reset({ me: 'u-nadia', stored: { look: { accent: 'amber' } }, custom: { look: { accent: 'amber' } }, provider: { id: 9, owner_id: 'u-nadia', price: 140, verified: true, listing_media: { cover: null, gallery: [] } } });
  m = await mount(page({ person: { userId: 'u-nadia', who: 'Nadia Rahman', kind: 'NUTRI' } }));
  assert.equal($('[data-climb-route-glow]').getAttribute('stroke'), '#d8a23a', 'amber is her own: gold');
  await m.unmount();
  // A nutritionist with none: gold.
  reset({ me: 'u-nadia', provider: { id: 9, owner_id: 'u-nadia', price: 140, verified: true, listing_media: { cover: null, gallery: [] } } });
  m = await mount(page({ person: { userId: 'u-nadia', who: 'Nadia Rahman', kind: 'NUTRI' }, isSelf: true }));
  assert.equal($('[data-climb-route-glow]').getAttribute('stroke'), '#d8a23a');
  assert.equal($('[data-climb-stop]').style.color, colorOf('#d8a23a'));
  await m.unmount();
});

test('the accent keys draw the hexes bsCoachPalette paints on a dark stock; the role\'s own key is no pick', () => {
  for (const role of ['trainer', 'nutritionist']) {
    const own = role === 'nutritionist' ? 'amber' : 'teal';
    for (const k of Object.keys(BS_COACH_ACCENTS)) {
      const kit = bsCoachPalette({ paper: 'dark', accent: k }, role).ACCENT;
      assert.equal(bsClimbAccent(k, role), k === own ? null : kit, `${role} ${k}`);
    }
  }
  assert.equal(bsClimbAccent('black'), '#ffffff', 'black reads as white on the dark');
  // Every accent Shape offers shows on the Climb's ground, so the contrast floor holds back none today.
  for (const hex of Object.values(CLIMB_ACCENTS)) assert.ok(climbMod.bsClimbContrast(hex, '#0a0e11') >= 1.6, hex);
  assert.ok(climbMod.bsClimbContrast('#000000', '#0a0e11') < 1.6, 'black on the dark would not show');
  assert.equal(bsClimbAccent('amber', 'trainer'), CLIMB_ACCENTS.amber, 'amber is a trainer\'s real pick');
  for (const bad of [null, undefined, '', 'chartreuse', '#123456', 'constructor', '__proto__']) assert.equal(bsClimbAccent(bad), null, String(bad));
});

// Codex on #2704: the place a coach writes in Edit profile (get_public_profile.location) is the page's
// place, ahead of the directory row's city.
test('the page names the location the coach wrote in Edit profile', async () => {
  // The practice's own card names no place, so the account's is the page's.
  fullCoach();
  world.custom = { ...world.custom, bizCard: { name: 'Iron Path Strength' } };
  world.location = 'Austin, TX';
  let m = await mount(page());
  assert.match($('[data-climb-eyebrow]').textContent, /Austin, TX/, 'the account\'s location never reached the page');
  await m.unmount();
  // A place on the practice's card is still the page's first.
  fullCoach();
  world.location = 'Austin, TX';
  m = await mount(page());
  assert.match($('[data-climb-eyebrow]').textContent, /Brooklyn/);
  assert.doesNotMatch($('[data-climb-eyebrow]').textContent, /Austin/);
  await m.unmount();
  world.location = null;
});

test('the Climb itself draws only a #rrggbb accent; anything else is the role colour', async () => {
  for (const [accent, want] of [['#a78bfa', '#a78bfa'], ['red', '#34d6c5'], ['#abc', '#34d6c5'], ['url(x)', '#34d6c5']]) {
    const m = await mount(React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
      React.createElement(climbMod.BSCoachClimb, { who: { name: 'Maya Okafor', first: 'Maya', initials: 'MO' }, accent })));
    assert.equal($('[data-climb-stop]').style.color, colorOf(want), accent);
    await m.unmount();
  }
});

test('a photo post with no title still names its Base tile (review, 9 Nov)', async () => {
  const m = await mount(React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
    React.createElement(climbMod.BSClimbStart, { photos: [{ key: 'a', photo: PHOTO, title: '' }, { key: 'b', photo: PHOTO, title: 'Morning lift' }] })));
  const [bare, named] = $$('[data-climb-photo-post]');
  assert.equal(bare.getAttribute('aria-label'), 'Posts');
  assert.equal(named.hasAttribute('aria-label'), false, 'a titled tile is named by its title');
  assert.match(named.textContent, /Morning lift/);
  await m.unmount();
});

// Owner, 9 Nov: "use programs own photo", then "remove the graph design part, looks stupid". A program with a
// photo shows it, bright, with nothing drawn over it; one with none is a short band in its colour.
test('a program card is the program\'s own photo with nothing drawn over it; without one, a band in its colour', async () => {
  const COVER = 'https://x.supabase.co/storage/v1/object/public/coach-media/u-maya/program/cover.jpg';
  const m = await mount(React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
    React.createElement(climbMod.BSClimbRange, { programs: [
      { key: 'a', id: 'a', name: 'Strength Block 3', weeks: 4, perWeek: 3, poster: COVER },
      { key: 'b', id: 'b', name: 'Barbell basics', weeks: 6, perWeek: 2, poster: null },
    ] })));
  const [a, b] = $$('[data-climb-program]');
  const img = a.querySelector('[data-climb-program-photo]');
  assert.equal(img ? img.getAttribute('src') : null, COVER, 'the program\'s own photo');
  assert.equal(img.style.filter, 'brightness(0.78)', 'bright enough to see');
  assert.equal(a.querySelector('[data-climb-program-art]').getAttribute('data-climb-program-art'), 'photo');
  assert.equal(b.querySelector('[data-climb-program-art]').getAttribute('data-climb-program-art'), 'band');
  assert.equal(b.querySelector('[data-climb-program-art]').style.height, '64px', 'a short band, not an empty picture');
  assert.equal(!!b.querySelector('[data-climb-program-photo]'), false);
  assert.equal(!!document.querySelector('[data-climb-range] svg'), false, 'no peaks drawn on any card');
  await m.unmount();
});
