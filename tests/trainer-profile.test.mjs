// The trainer profile (owner, 2026-10-27: "trainer profiles are good to go"), MOUNTED:
// mobile-app/src/broadsheet/BSTrainerProfile.jsx and its editor BSMakeItYours.jsx in the real
// broadsheet chrome, against scripted profile, listing, availability and booking backends, reading
// the real English catalogs (a key missing from them fails here rather than falling back).
//
// What it pins: the words follow the pronouns the coach wrote (never their name), the day shows
// the times the listing books and only "busy" for the rest, a booking sends what the marketplace
// sends, the storefront never prints a price the coach did not set, the page is painted in the
// coach's own colours, the wall photo is only the coach's own media, and the editor saves its keys
// onto the doc as it is at save time, for the account that opened it, or not at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsCoachPronoun, bsCoachFirstName } from '../mobile-app/src/services/coachPronoun.mjs';
import { bsStudioFromTemplate } from '../mobile-app/src/services/studioKit.mjs';
import { BS_SUPABASE_HOST } from '../public/newdesign/listingMedia.mjs';

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
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(el); });
  await flush();
  return { host, text: () => document.body.textContent.replace(/\s+/g, ' '), unmount: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const click = async (el) => { assert.ok(el, 'no such element'); await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const type = async (el, text) => {
  assert.ok(el, 'no such field');
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
};
const button = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent) || re.test(b.getAttribute('aria-label') || ''));

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
window.BSDetailHeader = ({ kicker, title, onBack }) => React.createElement('header', null, React.createElement('button', { type: 'button', onClick: onBack }, '← Back'), kicker, ' ', title);
const { BSTrainerProfile } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });

// ── The world the page reads ─────────────────────────────────────────────────────────────────
const ZONE = 'America/New_York';
let world;
function reset(over = {}) {
  world = {
    pronouns: 'she/her', custom: null, provider: { id: 7, owner_id: 'u-maya', price: 180, specialty: 'Strength coach', verified: true, credential: 'NSCA-CSCS', listing_media: { cover: null, gallery: [] }, monthly_offer: { includes: ['Custom programming'] } },
    // Open 6:00–22:00 every day, so the next two weeks always hold open times.
    slots: [0, 1, 2, 3, 4, 5, 6].map((wd) => ({ weekday: wd, start_minute: 6 * 60, duration_min: 16 * 60 })),
    busy: [], rules: { consultMin: 20, introsAtCapacity: false }, atCapacity: false, posts: [], canView: true,
    // stored: the profile_custom doc ({} is no row, as the real read answers); readFails: the read
    // errs; switchOnRead: another account signs in while the read is in flight.
    booked: null, bookError: null, saved: null, stored: {}, readWith: undefined, readFails: false, switchOnRead: false, me: 'u-me', availFor: null,
    asked: null, askError: null, asks: null, asksTotal: null, asksFor: null,
    ...over,
  };
}
reset();
window.ShapeAuth = { getCachedState: () => ({ user: { id: world.me } }) };
// noCard: the read answers no row, as get_public_profile does a visitor with no account on a private profile.
window.ShapeProfiles = { getPublicProfile: async () => (world.noCard ? null : { name: 'Maya Okafor', pronouns: world.pronouns, bio: 'I teach people to lift well.', points: 6200, custom: world.custom, can_view: world.canView }) };
// byIdFails / availFails: the listing's or the hours' read fails ('null' answers null, as the
// backend does on a non-2xx; anything else rejects, as a lost connection does).
const failing = (how) => { if (how === 'null') return null; throw new Error('offline'); };
window.ShapeCoachListing = { publicByOwner: async () => world.provider, publicById: async (role, id) => { world.byIdFor = id; if (world.byIdFails) return failing(world.byIdFails); return world.byId || null; } };
window.ShapeCoachAvailability = { get: async (role, id) => { world.availFor = id; if (world.availFails) return failing(world.availFails); return { slots: world.slots, booked: [], busy: world.busy, rules: world.rules, timezone: ZONE, atCapacity: world.atCapacity }; } };
window.ShapeCoachReviews = { forOwner: async () => ({ reviews: [], avg: 0, count: 0 }) };
window.ShapeCoachPlans = { salePlansByUser: async () => world.salePlans || [], buy: async (a) => { world.bought = a; return 'https://checkout.stripe.test/c/1'; } };
window.bsOpenCheckout = (u) => { world.checkout = u; };
window.ShapeFollows = { stats: async () => ({ isFollowing: false, isPending: false }), toggle: async () => ({ isFollowing: true }), getCached: () => null };
window.ShapeCommunity = { listByAuthor: async () => ({ data: world.posts }) };
// As the real shapeDb: a read or save bound to an account that is no longer signed in gets nothing.
window.shapeDb = {
  getUserGoals: async (k, opts) => {
    world.readWith = opts;
    if (world.readHold) await world.readHold;
    if (world.switchOnRead) world.me = 'u-other';
    if (world.readFails) return null;
    if (opts && opts.expectedUserId != null && opts.expectedUserId !== world.me) return null;
    return world.stored;
  },
  saveUserGoals: async (k, d, opts) => {
    if (opts && opts.expectedUserId && opts.expectedUserId !== world.me) return { error: { message: 'Account changed' } };
    world.saved = { k, d, opts };
    return { ok: true };
  },
};
window.ShapeBookings = { submitConsultationBooking: async (a) => { if (world.bookError) throw world.bookError; world.booked = a; return { ok: true }; } };
window.ShapeListingAsks = {
  ask: async (a) => { if (world.askError) throw world.askError; world.asked = a; return { already: false }; },
  forListing: async (role, id) => { world.asksFor = [role, id]; return { rows: world.asks || [], total: world.asksTotal ?? (world.asks || []).length }; },
};
window.bsProfileCardFromPost = (p) => p;
// The client module's storefront, as a probe: it records what the page hands it.
window.useBSCoachCommerce = ({ person }) => ((world.commerceSeen = person.commerce), { commerce: person.commerce, commerceCoach: person.commerce && person.commerce.coach, atCapacity: !!(person.commerce && person.commerce.atCapacity), wl: null });
window.BSCoachCoachingBlock = ({ cm, salePlans, noMonthly }) => (window.__blockPlans = salePlans, React.createElement('div', { 'data-coaching-block': noMonthly ? 'catalogue' : '' }, noMonthly ? salePlans.map((p) => `${p.name} $${p.price}`).join(' ') : cm.commerce.packages.map((p) => `${p.name} ${p.price}`).join(' ')));

const maya = { userId: 'u-maya', who: 'Maya Okafor', kind: 'TRAINER' };
const page = (props = {}) => React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
  React.createElement(BSTrainerProfile, { person: maya, onBack: () => {}, onMessage: () => {}, ...props }));

test('the words follow the pronouns the coach wrote, else their first name', async () => {
  assert.equal(bsCoachPronoun('she/her'), 'her');
  assert.equal(bsCoachPronoun('He / him'), 'him');
  assert.equal(bsCoachPronoun('they/them'), 'them');
  for (const v of ['', null, 'ze/zir', 'any', 'shee']) assert.equal(bsCoachPronoun(v), null, String(v));
  // A title is not the first name: the sample "Dr. Maya Patel" read "Dr.'s day".
  assert.equal(bsCoachFirstName('Dr. Maya Patel'), 'Maya');
  assert.equal(bsCoachFirstName('coach  Jordan Chen'), 'Jordan');
  assert.equal(bsCoachFirstName('Prof Dra. Ana Ruiz'), 'Ana');
  assert.equal(bsCoachFirstName('Maya Okafor'), 'Maya');
  assert.equal(bsCoachFirstName('Dr.'), 'Dr.', 'a name that is only a title keeps it');
  assert.equal(bsCoachFirstName(''), '');
  for (const [pronouns, day, work] of [['she/her', 'Her day', 'Work with her'], ['he/him', 'His day', 'Work with him'], ['they', 'Their day', 'Work with them'], ['', "Maya's day", 'Work with Maya'], ['xe/xem', "Maya's day", 'Work with Maya']]) {
    reset({ pronouns });
    const m = await mount(page());
    assert.ok(button(new RegExp(`^${day}$`)), `${pronouns || '(none)'} → ${day}`);
    assert.ok(button(new RegExp(`^${work}$`)), `${pronouns || '(none)'} → ${work}`);
    await m.unmount();
  }
});

test('the day: open times from the listing\'s own read, busy time only as busy, and a booking as the marketplace sends it', async () => {
  const t0 = new Date(); t0.setDate(t0.getDate() + 1); t0.setHours(9, 0, 0, 0);
  reset({ busy: [{ start: t0.toISOString(), end: new Date(t0.getTime() + 3600000).toISOString(), kind: 'session' }] });
  const m = await mount(page());
  const days = document.querySelectorAll('[role="group"] button');
  assert.equal(days.length, 7);
  await click(days[1]);
  assert.ok(document.querySelectorAll('[data-open-time]').length > 0, 'tomorrow has open times');
  const busy = [...document.querySelectorAll('[data-busy-time]')];
  assert.equal(busy.length, 1);
  assert.match(busy[0].textContent, /In a session/);
  assert.ok(![...document.querySelectorAll('[data-open-time]')].some((b) => /^9:00\s?AM/.test(b.textContent.trim())), 'the busy hour is not offered');
  await click(document.querySelector('[data-open-time]'));
  assert.match(m.text(), /A free 20-minute intro call|20 minutes on video/);
  await click(document.querySelector('[data-book-intro]'));
  assert.ok(world.booked, 'booked');
  assert.equal(world.booked.role, 'trainer');
  assert.equal(world.booked.coach.provider_id, 7);
  assert.equal(world.booked.durationMin, 20, 'the coach\'s intro length');
  assert.ok(Number.isFinite(world.booked.slot.at) && /^\d{4}-\d{2}-\d{2}$/.test(world.booked.slot.coachDate) && /^\d{2}:\d{2}$/.test(world.booked.slot.coachTime), 'a projected slot');
  assert.match(m.text(), /Requested\./);
  await m.unmount();
});

test('a changed intro length reads the times again and says so', async () => {
  reset({ bookError: Object.assign(new Error('x'), { code: 'length_changed', durationMin: 30 }) });
  const m = await mount(page());
  await click(document.querySelectorAll('[role="group"] button')[1]);
  await click(document.querySelector('[data-open-time]'));
  await click(document.querySelector('[data-book-intro]'));
  assert.match(m.text(), /intro now runs 30 minutes/);
  await m.unmount();
});

test('the storefront shows only what the coach sells: no monthly price, no package and no $', async () => {
  reset();
  let m = await mount(page());
  await click(button(/^Work with her$/));
  assert.equal(document.querySelector('[data-coaching-block]').textContent, 'Monthly coaching $180');
  await m.unmount();
  reset({ provider: { ...world.provider, price: null } });
  m = await mount(page());
  await click(button(/^Work with her$/));
  assert.ok(!document.querySelector('[data-coaching-block]'), 'no storefront block without a price');
  assert.match(m.text(), /hasn't listed prices on Shape yet/);
  assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /\$/);
  await m.unmount();
  // No monthly price, but plans to sell: the plans alone, never the monthly package (Codex P2 on #2545).
  reset({ provider: { ...world.provider, price: null }, salePlans: [{ id: 'p1', kind: 'program', name: 'Strong in 12', meta: '', price: '79', category: 'program', providerId: 7, providerRole: 'trainer' }] });
  m = await mount(page());
  await click(button(/^Work with her$/));
  const cat = document.querySelector('[data-coaching-block="catalogue"]');
  assert.ok(cat, 'the plans are listed');
  assert.equal(cat.textContent, 'Strong in 12 $79');
  assert.doesNotMatch(m.text(), /hasn't listed prices on Shape yet/, 'not told there are no prices beside them');
  await m.unmount();
  // Only plans with no price (a workout or reusable program): nothing to buy, so the no-prices line
  // stays and no catalogue shows (Codex P2 on 2ecbc5b).
  reset({ provider: { ...world.provider, price: null }, salePlans: [{ id: 'w1', kind: 'program', name: 'Form check', meta: '', price: null, category: 'workout', providerId: 7, providerRole: 'trainer' }] });
  m = await mount(page());
  await click(button(/^Work with her$/));
  assert.ok(!document.querySelector('[data-coaching-block]'), 'no catalogue with nothing to buy');
  assert.match(m.text(), /hasn't listed prices on Shape yet/);
  await m.unmount();
  // An account that also coaches nutrition: its paid meal plan is not the trainer's to list or sell
  // (Codex P2 on b76e074), so the trainer with no monthly price still has nothing listed.
  reset({ provider: { ...world.provider, price: null }, salePlans: [{ id: 'm1', kind: 'meal_plan', name: 'Lean cut', meta: '', price: '60', category: 'meal', providerId: 9, providerRole: 'nutritionist' }] });
  m = await mount(page());
  await click(button(/^Work with her$/));
  assert.ok(!document.querySelector('[data-coaching-block]'), 'no nutrition plan on the trainer\'s sheet');
  assert.match(m.text(), /hasn't listed prices on Shape yet/);
  await m.unmount();
  // No live listing (unfinished or suspended: the listing read returns no row) sells nothing here,
  // published plans or not (Codex P1 on 196314b).
  reset({ provider: null, salePlans: [{ id: 'p1', kind: 'program', name: 'Strong in 12', meta: '', price: '79', category: 'program', providerId: 7, providerRole: 'trainer' }] });
  m = await mount(page());
  await click(button(/^Work with her$/));
  assert.ok(!document.querySelector('[data-coaching-block]'), 'no checkout without a live listing');
  assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /\$/);
  await m.unmount();
  // With a monthly price, the sheet's catalogue is handed the trainer's plans only.
  reset({ salePlans: [{ id: 'p1', kind: 'program', name: 'Strong in 12', meta: '', price: '79', category: 'program', providerId: 7, providerRole: 'trainer' }, { id: 'm1', kind: 'meal_plan', name: 'Lean cut', meta: '', price: '60', category: 'meal', providerId: 9, providerRole: 'nutritionist' }] });
  m = await mount(page());
  await click(button(/^Work with her$/));
  assert.deepEqual(window.__blockPlans.map((p) => p.name), ['Strong in 12']);
  await m.unmount();
});

test('a visitor sees a tab only when it has something in it; a private profile shows none', async () => {
  reset();
  world.provider = { ...world.provider, price: 0 };
  let m = await mount(page());
  assert.ok(button(/^Her day$/));
  assert.ok(!button(/^Studio$/), 'no Studio tab with no programs, workouts or coaching');
  assert.ok(!button(/^Replays$/), 'no replays tab without replays');
  await m.unmount();
  // A floor plan saved before the Studio became the coach's work is never drawn (owner, 2026-11-04).
  reset({ custom: { studio: { kind: 'gym', where: 'Fishtown', items: bsStudioFromTemplate('gym') } }, posts: [{ key: 'p1', title: 'Heavy squat day', ago: '2d', statsRow: [], breakdown: { label: 'Sets', rows: [['Set 1', '100 kg × 5', '']] } }] });
  m = await mount(page());
  await click(button(/^Studio$/));
  assert.ok(document.querySelector('[data-coaching-card]'), 'monthly coaching is work enough for the tab');
  assert.equal(document.querySelectorAll('[data-station]').length, 0, 'no floor plan');
  await click(button(/^Replays$/));
  assert.equal(document.querySelectorAll('[data-replay]').length, 1);
  await m.unmount();
  reset({ canView: false });
  m = await mount(page());
  assert.ok(!button(/^Her day$/), 'a private profile shows no tabs');
  assert.match(m.text(), /keeps their profile private/);
  await m.unmount();
});

test('the page is painted in the coach\'s own colours, inside an app painted in others', async () => {
  reset({ custom: { look: { paper: 'bone', accent: 'rust' } } });
  const m = await mount(page());
  const bone = window.makePalette({ paperMode: 'bone', accentKey: 'rust' });
  const el = document.querySelector('[data-trainer-profile]');
  const probe = document.createElement('div'); probe.style.background = bone.PAPER_BG;
  assert.equal(el.style.background, probe.style.background, 'bone paper');
  const msg = button(/^Message Maya$/);
  probe.style.background = bone.ACCENT;
  assert.equal(msg.style.background, probe.style.background, 'the rust accent');
  await m.unmount();
});

test("the coach's own page is in the colours members see, before and without their own doc's read", async () => {
  // Owner, 2026-10-31: "have the profile page reflect whatever the coaches picked that shows public
  // to members". It fell back to the default dark until the coach's own doc was read, and for good
  // when that read failed.
  const bone = window.makePalette({ paperMode: 'bone', accentKey: 'rust' });
  const probe = document.createElement('div'); probe.style.background = bone.PAPER_BG;
  const painted = () => document.querySelector('[data-trainer-profile]').style.background;
  let release;
  reset({ me: 'u-maya', custom: { look: { paper: 'bone', accent: 'rust' } }, stored: { look: { paper: 'bone', accent: 'rust' } } });
  world.readHold = new Promise((r) => { release = r; });
  let m = await mount(page({ isSelf: true }));
  assert.equal(painted(), probe.style.background, 'while the own doc is read');
  world.readHold = null;
  release();
  await flush();
  assert.equal(painted(), probe.style.background, 'once it is read');
  await m.unmount();
  reset({ me: 'u-maya', custom: { look: { paper: 'bone', accent: 'rust' } }, readFails: true });
  m = await mount(page({ isSelf: true }));
  assert.equal(painted(), probe.style.background, 'when the own read fails');
  await m.unmount();
  // The own doc, once read, wins: what Make it yours saved is what members now read.
  reset({ me: 'u-maya', custom: { look: { paper: 'dark', accent: 'teal' } }, stored: { look: { paper: 'bone', accent: 'rust' } } });
  m = await mount(page({ isSelf: true }));
  assert.equal(painted(), probe.style.background, 'the own doc over a stale public read');
  await m.unmount();
});

test('Make it yours saves look, cover and the Studio\'s words onto the doc as it is at save time', async () => {
  // The doc changed elsewhere since the page read it: a bio and a wall the editor never saw, and a floor
  // plan from before the Studio became the coach's work, which nothing reads now and nothing rewrites.
  const PLAN = { id: '12121212-2222-4333-8444-555555555555', kind: 'program', name: 'Base 6', price: 39, providerId: 7, providerRole: 'trainer', detail: { preview: true, weeks: 6, note: 'Six weeks.', blocks: [] } };
  const floor = { kind: 'gym', where: 'Fishtown', items: bsStudioFromTemplate('gym') };
  reset({ me: 'u-maya', custom: null, salePlans: [PLAN], stored: { bio: 'Saved elsewhere', wall: [], look: { paper: 'dark', accent: 'teal' }, studio: floor } });
  const m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click(document.querySelector('[data-paper="sage"]'));
  await click(document.querySelector('[data-accent="green"]'));
  // The Studio's words, written in Make it yours → Programs from the programs the page reads.
  await click([...document.querySelectorAll('[data-make-it-yours] button')].find((b) => /^Programs$/.test(b.textContent)));
  await type(document.querySelector(`[data-desc="p:${PLAN.id}"]`), 'Six weeks to a first pull-up.');
  await click(document.querySelector(`[data-program-for="${PLAN.id}"] [data-for="new"]`));
  await click(document.querySelector('[data-save-mine]'));
  assert.ok(world.saved, 'saved');
  assert.equal(world.saved.k, 'profile_custom');
  const doc = world.saved.d;
  assert.equal(doc.bio, 'Saved elsewhere', 'a key saved elsewhere is kept');
  assert.deepEqual(doc.look, { paper: 'sage', accent: 'green', focus: 'center' });
  assert.deepEqual(doc.descriptions, { [`p:${PLAN.id}`]: 'Six weeks to a first pull-up.' });
  assert.deepEqual(doc.programFor, { [PLAN.id]: { id: 'new' } });
  assert.equal(doc.studio.items.length, floor.items.length, 'the old floor plan as it was');
  assert.equal('cover' in doc, false, 'no wall photo, no cover key');
  assert.deepEqual(world.readWith, { expectedUserId: 'u-maya' }, 'the read is bound to the account that opened the editor');
  assert.deepEqual(world.saved.opts, { expectedUserId: 'u-maya' }, 'and so is the save');
  // Back on the page, the Studio reads the coach's line and who it is for.
  await click(button(/^Studio$/));
  assert.match(document.querySelector('[data-program]').textContent, /Base 6.*Six weeks to a first pull-up\..*For.*New to lifting/);
  await m.unmount();
});

test('Make it yours saves only for the account that opened it, and only onto a doc it could read (Codex P1 ×2 on #2484)', async () => {
  for (const [name, arm, says] of [
    ['a failed read', () => { world.readFails = true; }, /Couldn't save\. Nothing changed; try again\./],
    ['another account signed in mid-read', () => { world.switchOnRead = true; }, /Couldn't save\. Nothing changed; try again\./],
    ['another account signed in before Save', () => { world.me = 'u-other'; }, /Sign in to save your page\./],
  ]) {
    reset({ me: 'u-maya', stored: { bio: 'Saved elsewhere since' } });
    const m = await mount(page({ isSelf: true }));
    await click(button(/^Make it yours$/));
    await click(document.querySelector('[data-paper="sage"]'));
    arm();
    await click(document.querySelector('[data-save-mine]'));
    assert.equal(world.saved, null, `${name}: nothing written, so no stale or foreign doc replaces the stored one`);
    assert.match(m.text(), says, `${name}: and the coach is told`);
    assert.ok(document.querySelector('[data-make-it-yours]'), `${name}: the editor stays open with the changes`);
    await m.unmount();
  }
});

test('Make it yours opens only on the coach\'s doc as read, and saves only what was changed in it (Codex P1 on #2484)', async () => {
  const stored = { bio: 'Kept', look: { paper: 'bone', accent: 'rust', focus: 'top' }, studio: { kind: 'gym', where: 'Fishtown', items: bsStudioFromTemplate('gym') } };
  let release;
  reset({ me: 'u-maya', stored });
  world.readHold = new Promise((r) => { release = r; });
  const m = await mount(page({ isSelf: true }));
  const opener = () => [...document.querySelectorAll('button')].filter((b) => /^Make it yours$/.test(b.textContent) || b.getAttribute('aria-label') === 'Make it yours');
  assert.equal(opener().length, 2, 'the corner and the button');
  assert.ok(opener().every((b) => b.disabled), 'neither opens before the doc is read');
  await click(opener()[1]);
  assert.ok(!document.querySelector('[data-make-it-yours]'), 'a tap opens nothing');
  world.readHold = null;
  release();
  await flush();
  assert.ok(opener().every((b) => !b.disabled), 'both open once it is read');
  await click(opener()[1]);
  assert.equal(document.querySelector('[data-paper="bone"]').getAttribute('aria-pressed'), 'true', 'it opens on their look, not the default');
  // Their studio changes elsewhere while the editor is open; here only the accent changes.
  world.stored = { ...stored, studio: { kind: 'garage', where: 'Kensington', items: bsStudioFromTemplate('garage') } };
  await click(document.querySelector('[data-accent="green"]'));
  await click(document.querySelector('[data-save-mine]'));
  assert.deepEqual(world.saved.d.look, { paper: 'bone', accent: 'green', focus: 'top' }, 'the look they had, with the one change');
  assert.equal(world.saved.d.studio.kind, 'garage', 'a key this editor did not change is kept as stored now');
  assert.equal(world.saved.d.bio, 'Kept');
  await m.unmount();
});

test('when the coach\'s doc cannot be read, the page says so and Make it yours waits for Try again', async () => {
  reset({ me: 'u-maya', readFails: true, stored: { look: { paper: 'sage', accent: 'blue' } } });
  const m = await mount(page({ isSelf: true }));
  assert.ok(button(/^Make it yours$/).disabled);
  assert.match(m.text(), /Couldn't read your page just now\./);
  world.readFails = false;
  await click(document.querySelector('[data-own-error] button'));
  assert.ok(!document.querySelector('[data-own-error]'), 'read on the retry');
  assert.ok(!button(/^Make it yours$/).disabled);
  await m.unmount();
});

test('the wall photo is only the coach\'s own media, on the profile and in the editor (Codex P1 on #2484)', async () => {
  const own = (bucket, owner, file) => `https://${BS_SUPABASE_HOST}/storage/v1/object/public/${bucket}/${owner}/${file}`;
  const wallImg = () => document.querySelector('img[alt="Maya\'s wall photo"]');
  for (const [image, shown] of [
    [own('community-photos', 'u-maya', 'wall.jpg'), true],
    [own('coach-media', 'u-maya', 'gym.webp'), true],
    ['https://tracker.example/pixel.gif', false],
    [own('community-photos', 'u-other', 'wall.jpg'), false],
    [own('community-photos', 'u-maya', 'wall.svg'), false],
  ]) {
    reset({ custom: { cover: { image } } });
    const m = await mount(page());
    assert.equal(wallImg() ? wallImg().getAttribute('src') : null, shown ? image : null, image);
    await m.unmount();
  }
  // In the editor: an outside cover is not offered back, and a save that leaves the wall photo
  // alone leaves the stored cover alone; picking a listing photo writes that, as the coach's own.
  const outside = { image: 'https://tracker.example/pixel.gif' };
  const listing = own('coach-media', 'u-maya', 'gym.webp');
  reset({ me: 'u-maya', custom: { cover: outside }, stored: { cover: outside }, provider: { ...world.provider, listing_media: { cover: listing, gallery: [] } } });
  let m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click(document.querySelector('[data-paper="sage"]'));
  await click(document.querySelector('[data-save-mine]'));
  assert.deepEqual(world.saved.d.cover, outside, 'not written by this editor: kept as stored');
  await m.unmount();
  reset({ me: 'u-maya', stored: {}, provider: { ...world.provider, listing_media: { cover: listing, gallery: [] } } });
  m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click(button(/^Wall photo$/));
  await click(document.querySelector(`[data-wall-choice] img[src="${listing}"]`).parentElement);
  await click(document.querySelector('[data-save-mine]'));
  assert.deepEqual(world.saved.d.cover, { image: listing });
  await m.unmount();
});

test('on their own page a coach sees their open times as members do, but cannot take one', async () => {
  reset({ me: 'u-maya' });
  const m = await mount(page({ isSelf: true }));
  await click(document.querySelectorAll('[role="group"] button')[1]);
  const open = [...document.querySelectorAll('[data-open-time]')];
  assert.ok(open.length > 0);
  assert.ok(open.every((b) => b.disabled && !/Take it/.test(b.textContent)));
  assert.ok(button(/^Make it yours$/) && button(/^Your hours$/), 'their own actions instead of Message and Work with');
  assert.ok(!button(/^Message Maya$/), 'no Message on their own page');
  await m.unmount();
});

test('a listing the lookup does not find is not offered from the marketplace snapshot (Codex P1 on #2484)', async () => {
  // Opened from the marketplace, then taken off it: the snapshot still carries its id, photos and price.
  const photo = `https://${BS_SUPABASE_HOST}/storage/v1/object/public/coach-media/u-maya/box.webp`;
  const snapshot = { coach: { provider_id: 7, db_id: 7, listing_media: { cover: photo, gallery: [] } }, packages: [{ type: 'Subscription', name: 'Monthly coaching', price: '$180' }] };
  reset({ provider: null });
  const m = await mount(page({ person: { ...maya, commerce: snapshot } }));
  assert.equal(world.availFor, null, 'no open times are read for it');
  assert.match(m.text(), /Maya has no open times on Shape yet/);
  assert.ok(!document.querySelector(`img[src="${photo}"]`), 'nor its photo shown');
  await click(button(/^Work with her$/));
  assert.ok(!document.querySelector('[data-coaching-block]'), 'nor its checkout offered');
  await m.unmount();
  // Found and listed, the same page reads that listing's times.
  reset();
  const m2 = await mount(page({ person: { ...maya, commerce: snapshot } }));
  assert.equal(world.availFor, 7);
  await m2.unmount();
});

test('a private profile shows nothing from the listing either: no wall, specialty, place or Work with (Codex P1 on #2484)', async () => {
  const photo = `https://${BS_SUPABASE_HOST}/storage/v1/object/public/coach-media/u-maya/box.webp`;
  reset({ canView: false, provider: { ...world.provider, listing_media: { cover: photo, gallery: [] } } });
  const m = await mount(page({ person: { ...maya, city: 'Fishtown' } }));
  assert.match(m.text(), /keeps their profile private/);
  assert.ok(!document.querySelector(`img[src="${photo}"]`), 'no listing wall photo');
  assert.doesNotMatch(m.text(), /Strength coach|Fishtown/, 'no specialty or place');
  assert.ok(!button(/^Work with/), 'no storefront');
  assert.ok(button(/^Follow$/), 'Follow stays: it is how to ask to see more');
  await m.unmount();
});

test('Make it yours opens only for the account its doc was read for (Codex P1 on #2484)', async () => {
  reset({ me: 'u-maya', stored: { look: { paper: 'bone', accent: 'rust' } } });
  const m = await mount(page({ isSelf: true }));
  // Another account signs in while the page stays up; its own doc is different.
  world.me = 'u-other';
  world.stored = { look: { paper: 'sage', accent: 'blue' } };
  await click(button(/^Make it yours$/));
  assert.ok(!document.querySelector('[data-make-it-yours]'), 'not opened on the first account\'s doc');
  assert.deepEqual(world.readWith, { expectedUserId: 'u-other' }, 'it reads again, for the account signed in now');
  await click(button(/^Make it yours$/));
  assert.equal(document.querySelector('[data-paper="sage"]').getAttribute('aria-pressed'), 'true', 'and opens on that account\'s doc');
  await click(document.querySelector('[data-accent="green"]'));
  await click(document.querySelector('[data-save-mine]'));
  assert.deepEqual(world.saved.opts, { expectedUserId: 'u-other' });
  assert.deepEqual(world.saved.d.look, { paper: 'sage', accent: 'green', focus: 'center' });
  await m.unmount();
});

test('the day runs local midnight to local midnight, so a clock-change day keeps its own hours (Codex P2 on #2484)', () => {
  // Pinned on the source: whether the strip crosses a clock change depends on the real date.
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), 'utf8');
  assert.match(src, /const dayEnd = new Date\(picked\.getFullYear\(\), picked\.getMonth\(\), picked\.getDate\(\) \+ 1\)\.getTime\(\);/);
  assert.doesNotMatch(src, /dayStart \+ 86400000/);
});

// ── Signed out: the trainer app's own page is the demo (owner, 2026-10-28) ────────────────────
// Every backend the page could reach, counted, so the demo is shown to read and write nothing.
function countCalls() {
  const calls = [];
  const undo = [];
  for (const [obj, names] of [[window.ShapeProfiles, ['getPublicProfile']], [window.ShapeCoachListing, ['publicByOwner']], [window.ShapeCoachAvailability, ['get']],
    [window.ShapeCoachReviews, ['forOwner']], [window.ShapeCoachPlans, ['salePlansByUser']], [window.ShapeFollows, ['stats', 'toggle']], [window.ShapeCommunity, ['listByAuthor']],
    [window.shapeDb, ['getUserGoals', 'saveUserGoals']], [window.ShapeBookings, ['submitConsultationBooking']]]) {
    for (const n of names) {
      const real = obj[n];
      obj[n] = (...a) => { calls.push(n); return real(...a); };
      undo.push(() => { obj[n] = real; });
    }
  }
  return { calls, restore: () => undo.forEach((f) => f()) };
}
const demoTrainer = { who: 'Jordan Chen', kind: 'TRAINER' };
const demoPage = () => page({ person: demoTrainer, isSelf: true });
// The client's own helpers, as the real bundle has them signed out: the signed-out persona's name
// and photo, and the profile-photo hook, which reads the account's identity when asked for a self
// page (Codex P1 and P2 on #2486). `photoReads` counts those reads.
function asClient() {
  const had = { bsMyName: window.bsMyName, bsMyPhoto: window.bsMyPhoto, useBSProfilePhoto: window.useBSProfilePhoto };
  const photoReads = [];
  window.bsMyName = () => (world.me ? 'Maya Okafor' : 'Quinn Harper');
  window.bsMyPhoto = () => (world.me ? null : '/m/demo-avatar.png');
  window.useBSProfilePhoto = (person, isSelf) => {
    React.useEffect(() => { if (isSelf) photoReads.push('client_identity'); }, [isSelf]);
    return { photo: person.photo || null, fileRef: React.useRef(null), onPick: () => {} };
  };
  return { photoReads, restore: () => Object.assign(window, had) };
}

test('signed out, the trainer\'s own page is the new profile with sample content, and reads nothing from Shape', async () => {
  reset({ me: null });
  const spy = countCalls();
  const client = asClient();
  try {
    const m = await mount(demoPage());
    assert.match(m.text(), /Quinn Harper\./, 'the signed-out persona, as everywhere else in the app');
    assert.equal(document.querySelector('img[alt="Quinn\'s wall photo"]').getAttribute('src'), '/m/demo/box-cover.webp', 'the wall photo');
    const avatarBtn = document.querySelector('img[src="/m/demo-avatar.png"]').closest('button');
    assert.ok(avatarBtn.disabled, 'the persona\'s photo, with no picker');
    assert.ok(!document.querySelector('input[type="file"]'), 'no photo upload in the demo');
    assert.match(m.text(), /Strength and conditioning · Iron & Ordinary/);
    assert.match(m.text(), /Portland, OR/);
    assert.match(m.text(), /Get strong, move well/);
    assert.match(m.text(), /9\.9\/10 from 284 reviews/);
    assert.ok(button(/^Quinn's day$/), 'no pronouns: the words go by the first name');
    // A week of open and busy times: some day in it has both, and none can be taken from here.
    const days = [...document.querySelectorAll('[role="group"] button')];
    let both = false;
    for (const d of days) {
      await click(d);
      const open = [...document.querySelectorAll('[data-open-time]')];
      assert.ok(open.every((b) => b.disabled), 'the coach\'s own times are not to take');
      if (open.length && document.querySelector('[data-busy-time]')) both = true;
    }
    assert.ok(both, 'a day with open and busy times');
    await click(button(/^Ways to work with Quinn/));
    assert.equal(document.querySelector('[data-coaching-block]').textContent, 'Monthly coaching $180');
    // The sheet lists the sample's own programs, as its page shows them (owner, 2026-10-31: it said
    // "Publish your first plan" under every tab: "dont think this is working properly").
    assert.deepEqual(window.__blockPlans.map((p) => [p.name, p.category, p.meta]), [['Strong in 12', 'program', '12 weeks'], ['Barbell basics', 'program', '6 weeks']]);
    await click(button(/^Close$/));
    await click(button(/^Studio$/));
    // The sample's work (owner, 2026-11-04): its two programs, every program day and video as a workout,
    // and its coaching by the month; no floor plan.
    assert.deepEqual([...document.querySelectorAll('[data-program]')].map((p) => (p.textContent.match(/Strong in 12|Barbell basics/) || [''])[0]), ['Strong in 12', 'Barbell basics']);
    assert.equal(document.querySelectorAll('[data-workout]').length, 7, 'five program days and two videos');
    assert.match(document.querySelector('[data-coaching-card]').textContent, /Coaching with Quinn.*\$180.*A month/);
    assert.equal(document.querySelectorAll('[data-station]').length, 0, 'no floor plan');
    await click(button(/^Replays$/));
    const replays = [...document.querySelectorAll('[data-replay]')];
    assert.equal(replays.length, 3);
    assert.match(replays[0].textContent, /Back squat, heavy triples/);
    assert.match(replays[0].textContent, /285 lb × 3|130 kg × 3/, 'loads in the reader\'s units');
    assert.match(replays[0].textContent, /^2d/, 'dated as a replay card is');
    await click(replays[0]);
    assert.match(m.text(), /Paused the first rep of every set/);
    await click(button(/^Close$/));
    await click(button(/9\.9\/10 from 284 reviews/));
    assert.match(m.text(), /Priya S\./);
    await m.unmount();
    assert.deepEqual(spy.calls, [], 'no read or write reached Shape');
    assert.deepEqual(client.photoReads, [], 'nor the account\'s photo');
  } finally { spy.restore(); client.restore(); }
});

test('Make it yours in the demo changes the page on screen, saves nothing, and asks to sign in to upload', async () => {
  reset({ me: null });
  const spy = countCalls();
  const client = asClient();
  try {
    const m = await mount(demoPage());
    await click(button(/^Make it yours$/));
    assert.ok(document.querySelector('[data-make-it-yours]'), 'it opens in the demo');
    await click(button(/^Wall photo$/));
    assert.equal(document.querySelector('[data-wall-choice][aria-pressed="true"] img').getAttribute('src'), '/m/demo/box-cover.webp', 'on the demo\'s wall photo');
    await click(button(/Upload yours/));
    assert.match(m.text(), /Sign in to upload your own photo\./);
    await click(document.querySelector('[data-wall-choice] img[src="/m/demo/studio-01.webp"]').parentElement);
    assert.doesNotMatch(m.text(), /Sign in to upload/, 'a photo picked clears it');
    await click(button(/^Colors$/));
    await click(document.querySelector('[data-paper="sage"]'));
    assert.match(m.text(), /A sample page: your changes show here until you leave\./);
    await click(document.querySelector('[data-save-mine]'));
    assert.ok(!document.querySelector('[data-make-it-yours]'), 'Save closes the editor');
    assert.equal(document.querySelector('img[alt="Quinn\'s wall photo"]').getAttribute('src'), '/m/demo/studio-01.webp', 'the new wall photo');
    const probe = document.createElement('div'); probe.style.background = window.makePalette({ paperMode: 'sage', accentKey: 'teal' }).PAPER_BG;
    assert.equal(document.querySelector('[data-trainer-profile]').style.background, probe.style.background, 'and the new paper');
    await m.unmount();
    assert.equal(world.saved, null);
    assert.deepEqual(spy.calls, [], 'nothing read or written');
  } finally { spy.restore(); client.restore(); }
});

test('a page opened for an account, or with one signed in, is never the demo', async () => {
  // Signed in, the own page without an id (as the trainer Me tab can open it) reads that account.
  reset({ me: 'u-maya', stored: {} });
  let m = await mount(page({ person: { who: 'Maya Okafor', kind: 'TRAINER' }, isSelf: true }));
  assert.deepEqual(world.readWith, { expectedUserId: 'u-maya' });
  assert.ok(!document.querySelector('img[src^="/m/demo/"]'), 'no demo photo');
  assert.doesNotMatch(m.text(), /Iron & Ordinary|Get strong, move well/);
  await m.unmount();
  // Signed out, another coach's page is that coach's.
  reset({ me: null });
  m = await mount(page());
  assert.match(m.text(), /Maya Okafor/);
  assert.ok(!document.querySelector('img[src^="/m/demo/"]'));
  assert.doesNotMatch(m.text(), /Iron & Ordinary/);
  await m.unmount();
});

test('every coach page opens the coach profile: a trainer\'s and a nutritionist\'s', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(src, /if \(person\.kind === 'TRAINER' \|\| person\.kind === 'NUTRI'\) \{\n\s+return <BSTrainerProfile [^\n]*onListing=\{onListing\} \/>;/);
  assert.doesNotMatch(src, /return <BSSignalCoachProfile /, 'no coach opens the Signal page any more');
});

// ── A coach with no account: a sample (owner, 2026-10-28) ────────────────────────────────────
// Leah, as the marketplace opens one of Shape's seeded listings: no account, the listing's id.
const leah = { who: 'Leah Kim', kind: 'TRAINER', providerId: 41, city: 'Remote', bio: 'HIIT built around clear blocks and measurable progress.', specialty: 'HIIT & Conditioning HIIT', rating10: 9.6 };
const leahRow = { id: 41, owner_id: null, name: 'Leah Kim', price: 120, specialty: 'HIIT', credential: 'ACE-CPT', verified: false, listing_media: { cover: null, gallery: [] }, monthly_offer: null };

test('a seeded listing\'s coach: its own listing, read by id, with a sample studio, replays and reviews', async () => {
  reset({ me: 'u-me', byId: leahRow, slots: [] });
  const spy = countCalls();
  let listed = 0;
  try {
    const m = await mount(page({ person: leah, onListing: () => { listed += 1; } }));
    assert.equal(world.byIdFor, 41, 'the listing, read fresh by its id');
    assert.ok(/^\/m\/demo\/.+\.webp$/.test(document.querySelector('img[alt="Leah\'s wall photo"]').getAttribute('src')), 'a sample wall photo');
    assert.match(m.text(), /HIIT built around clear blocks/);
    assert.match(m.text(), /Leah hasn't set up a Shape account yet, so the studio, replays, reviews and times here are samples\./);
    assert.match(m.text(), /9\.6\/10 from 4 reviews/, 'the listing\'s rating over the sample reviews');
    assert.match(m.text(), /ACE-CPT/);
    assert.doesNotMatch(m.text(), /Iron & Ordinary|NSCA-CSCS/, 'nothing of the demo coach\'s own');
    // No hours on the listing: sample times, asked for, never taken (owner, 2026-10-29).
    assert.match(document.querySelector('[data-day-sub]').textContent, /Sample times: Leah hasn't set open hours on Shape yet\./);
    let open = [];
    for (const d of document.querySelectorAll('[role="group"] button')) { await click(d); open = open.concat([...document.querySelectorAll('[data-open-time]')]); }
    assert.ok(open.length > 0, 'sample open times');
    assert.ok(open.every((b) => !b.disabled && /Ask for it →/.test(b.textContent) && !/Take it/.test(b.textContent)), 'each is asked for, none taken');
    await click(button(/^Studio$/));
    assert.match(document.querySelector('[data-program]').textContent, /Engine 8/, 'programs that fit HIIT');
    await click(button(/^Replays$/));
    assert.match(document.querySelector('[data-replay]').textContent, /Air bike intervals/, 'conditioning replays for a HIIT coach');
    await click(button(/^Work with Leah$/));
    assert.equal(document.querySelector('[data-coaching-block]').textContent, 'Monthly coaching $120', 'the listing\'s own price');
    await click(document.querySelector('[data-full-listing]'));
    assert.equal(listed, 1, 'the full listing, one tap away');
    await m.unmount();
    assert.equal(world.booked, null, 'nothing booked');
    assert.deepEqual(spy.calls.filter((c) => c !== 'get'), [], 'no account read: no profile, own doc, reviews, posts or follow');
  } finally { spy.restore(); }
});

test('a sample time is asked for, kept for Leah with the member\'s note; nothing is booked (owner, 2026-10-29)', async () => {
  reset({ me: 'u-me', byId: leahRow, slots: [] });
  const m = await mount(page({ person: leah }));
  try {
    const firstOpen = async () => { for (const d of document.querySelectorAll('[role="group"] button')) { await click(d); const b = document.querySelector('[data-open-time]'); if (b) return b; } return null; };
    await click(await firstOpen());
    assert.match(m.text(), /Ask for this time\./);
    assert.match(m.text(), /Leah isn't on Shape yet, so this time isn't booked\. Ask for it and Shape keeps it for Leah: you'll hear when they join\./);
    await type(document.querySelector('[data-ask-note]'), 'Knee rehab, mornings only');
    await click(document.querySelector('[data-ask-time]'));
    assert.equal(world.asked.role, 'trainer');
    assert.equal(world.asked.providerId, 41, 'kept against the listing');
    assert.ok(Number.isFinite(world.asked.at) && world.asked.at > Date.now(), 'the sample time itself');
    assert.ok(Number.isInteger(world.asked.durationMin));
    assert.equal(world.asked.note, 'Knee rehab, mornings only');
    assert.ok(document.querySelector('[data-ask-done]'));
    assert.match(m.text(), /Asked\./);
    assert.match(document.querySelector('[data-ask-done]').textContent, /^Leah isn't on Shape yet\. Shape has kept your ask, and you'll hear when Leah joins\.$/);
    assert.equal(world.booked, null, 'nothing booked');
    await click(button(/^Done$/));
    // The route's refusals, said in the member's words; anything else, a plain try again.
    for (const [code, said] of [['too_many', /You've asked Leah for 3 times already\. You'll hear when they join\./], ['claimed', /Leah is on Shape now\. Book a time on their listing\./], ['daily_cap', /You've asked for a lot of times today\./], ['time_past', /That time has passed\. Pick a later one\./], [null, /Couldn't send your ask\. Try again\./]]) {
      world.askError = Object.assign(new Error('from the route'), { code });
      await click(await firstOpen());
      await click(document.querySelector('[data-ask-time]'));
      assert.match(document.querySelector('[role="alert"]').textContent, said, String(code));
      assert.doesNotMatch(m.text(), /from the route/, 'never the route\'s English');
      await click(document.querySelector('button[aria-label="Close"]'));
    }
    // A guest is asked for an account and nothing is sent.
    world.askError = null; world.asked = null;
    window.bsRequireAccount = () => false;
    await click(await firstOpen());
    await click(document.querySelector('[data-ask-time]'));
    assert.equal(world.asked, null);
  } finally { delete window.bsRequireAccount; await m.unmount(); }
});

test('the coach\'s own page lists what members asked of the listing before they were on Shape', async () => {
  const DAY = 86_400_000;
  reset({ me: 'u-maya', slots: [], asks: [
    { id: 'a1', memberId: 'm1', name: 'Sam Rivera', at: Date.now() + 2 * DAY, durationMin: 20, note: 'Knee rehab' },
    { id: 'a2', memberId: 'm2', name: '', at: Date.now() - DAY, durationMin: 20, note: '' },
  ] });
  const m = await mount(page({ isSelf: true }));
  assert.deepEqual(world.asksFor, ['trainer', 7], 'their own listing\'s asks');
  const list = document.querySelector('[data-asks]');
  assert.ok(list);
  assert.match(list.textContent, /Asked for before you joined/);
  assert.match(list.textContent, /2 times were asked of your listing while you weren't on Shape\. Each member who asked has been told you're here now\./);
  const rows = [...document.querySelectorAll('[data-ask]')];
  assert.match(rows[0].textContent, /Sam Rivera/);
  assert.match(rows[0].textContent, /Knee rehab/);
  assert.match(rows[1].textContent, /A member.*passed/, 'unnamed, and gone by');
  await click(button(/^Set your hours so they can book →$/));
  await m.unmount();
  // The count is every ask on the listing, not only the ones the list shows (Codex on 126c626).
  reset({ me: 'u-maya', slots: [], asks: [{ id: 'a1', memberId: 'm1', name: 'Sam', at: Date.now() + DAY, durationMin: 20, note: '' }], asksTotal: 140 });
  const many = await mount(page({ isSelf: true }));
  assert.match(document.querySelector('[data-asks]').textContent, /140 times were asked of your listing/);
  await many.unmount();
  // Nobody else's page reads them, and none show when there are none.
  reset({ me: 'u-me', asks: [{ id: 'a1', memberId: 'm1', name: 'Sam', at: Date.now() + DAY, durationMin: 20, note: '' }] });
  const other = await mount(page());
  assert.equal(world.asksFor, null, 'a visitor never reads a listing\'s asks');
  assert.ok(!document.querySelector('[data-asks]'), 'and sees none');
  await other.unmount();
  reset({ me: 'u-maya', asks: [] });
  const none = await mount(page({ isSelf: true }));
  assert.ok(!document.querySelector('[data-asks]'), 'no list with no asks');
  await none.unmount();
  // Claimed but not on the marketplace yet (no public listing): the asks are still read, by the
  // coach's ownership, with no id (Codex on 19b138c).
  reset({ me: 'u-maya', provider: null, slots: [], asks: [{ id: 'a1', memberId: 'm1', name: 'Sam', at: Date.now() + DAY, durationMin: 20, note: '' }] });
  const onboarding = await mount(page({ isSelf: true }));
  assert.deepEqual(world.asksFor, ['trainer', null]);
  assert.ok(document.querySelector('[data-asks]'), 'the coach sees them while onboarding');
  // Nobody has been told yet: the notice goes out when the listing goes live (Codex on af3756e).
  assert.match(document.querySelector('[data-asks]').textContent, /1 time was asked of your listing while you weren't on Shape\. Each member who asked is told you're here once your listing is live\./);
  assert.doesNotMatch(document.querySelector('[data-asks]').textContent, /has been told/);
  await onboarding.unmount();
});

test('a seeded listing with real hours offers them to take, as its listing does', async () => {
  reset({ me: 'u-me', byId: leahRow });
  const m = await mount(page({ person: leah }));
  await click(document.querySelectorAll('[role="group"] button')[1]);
  assert.match(document.querySelector('[data-day-sub]').textContent, /From Leah's Shape calendar/);
  const open = [...document.querySelectorAll('[data-open-time]')];
  assert.ok(open.length > 0 && open.every((b) => !b.disabled && /Take it/.test(b.textContent)));
  assert.equal(world.availFor, 41, 'the listing\'s own hours');
  await m.unmount();
});

test('a seeded listing whose hours or listing could not be read says so, never the sample week (Codex P2 on #2491)', async () => {
  for (const how of ['null', 'reject']) {
    reset({ me: 'u-me', byId: leahRow, availFails: how });
    const m = await mount(page({ person: leah }));
    assert.equal(world.availFor, 41);
    assert.match(m.text(), /Couldn't read the open times just now\./, `hours read: ${how}`);
    assert.ok(!document.querySelector('[data-day-sub]'), 'no "Sample times" line');
    assert.equal(document.querySelectorAll('[data-open-time]').length, 0);
    // Try again reads the hours again, and the listing's real times can be taken.
    world.availFails = null;
    await click(button(/^Try again$/));
    assert.match(document.querySelector('[data-day-sub]').textContent, /From Leah's Shape calendar/);
    await m.unmount();
  }
  // The listing itself could not be read: the same, and Try again reads the listing again.
  reset({ me: 'u-me', byId: leahRow, byIdFails: 'reject' });
  const m = await mount(page({ person: leah }));
  assert.match(m.text(), /Couldn't read the open times just now\./);
  assert.ok(!document.querySelector('[data-day-sub]'));
  world.byIdFails = null;
  world.byIdFor = undefined;
  await click(button(/^Try again$/));
  assert.equal(world.byIdFor, 41, 'the listing, read again');
  assert.match(document.querySelector('[data-day-sub]').textContent, /From Leah's Shape calendar/);
  await m.unmount();
});

test('a full seeded listing with no hours stays full: only the times are the sample\'s (Codex P2 on #2491)', async () => {
  reset({ me: 'u-me', byId: leahRow, slots: [], atCapacity: true, rules: { consultMin: 20, introsAtCapacity: true } });
  let m = await mount(page({ person: leah }));
  assert.match(document.querySelector('[data-day-sub]').textContent, /Sample times/);
  assert.equal(world.commerceSeen.atCapacity, true, 'the listing\'s answer: full');
  assert.equal(world.commerceSeen.introsAtCapacity, true, 'and its intro rule');
  await m.unmount();
  // With no answer to go by (no hours read to ask), the storefront reads the listing row, never
  // the sample's "not full".
  const get = window.ShapeCoachAvailability.get;
  delete window.ShapeCoachAvailability.get;
  try {
    reset({ me: 'u-me', byId: leahRow });
    m = await mount(page({ person: leah }));
    assert.match(document.querySelector('[data-day-sub]').textContent, /Sample times/);
    assert.equal(world.commerceSeen.atCapacity, undefined, 'the listing row decides');
    assert.equal(world.commerceSeen.introsAtCapacity, false);
    await m.unmount();
  } finally { window.ShapeCoachAvailability.get = get; }
  reset({ me: 'u-me', byId: leahRow, slots: [], atCapacity: false });
  m = await mount(page({ person: leah }));
  assert.equal(world.commerceSeen.atCapacity, false);
  await m.unmount();
});

test('a demo person with no listing is a sample too, with no prices and nothing to take', async () => {
  reset({ me: null });
  const m = await mount(page({ person: { who: 'Dana Lewis', kind: 'TRAINER' } }));
  assert.equal(world.byIdFor, undefined, 'no listing to read');
  assert.ok(document.querySelector('[data-sample-note]'));
  assert.ok(document.querySelector('img[alt="Dana\'s wall photo"]'));
  assert.ok([...document.querySelectorAll('[data-open-time]')].every((b) => b.disabled));
  await click(button(/^Work with Dana$/));
  assert.ok(!document.querySelector('[data-coaching-block]'), 'no listing, no storefront');
  assert.match(m.text(), /Dana hasn't listed prices on Shape yet/);
  await m.unmount();
});

test('a coach with an account is never a sample', async () => {
  reset({ me: null });
  const m = await mount(page());
  assert.ok(!document.querySelector('[data-sample-note]'));
  assert.ok(!document.querySelector('img[src^="/m/demo/"]'));
  assert.equal(world.byIdFor, undefined, 'read by the account, not by a listing id');
  await m.unmount();
});

test('a visitor\'s page draws one search corner, white over the photo, and its ⚙ opens their own profile', async () => {
  const had = { BSSearchCorner: window.BSSearchCorner, BSMeCorner: window.BSMeCorner, BSSettingsCorner: window.BSSettingsCorner };
  // The client's corners, as probes: BSMeCorner draws its own search corner and a ⚙.
  window.BSSearchCorner = ({ ink }) => React.createElement('i', { 'data-search-corner': ink || '' });
  window.BSSettingsCorner = ({ ink, onClick }) => React.createElement('button', { type: 'button', 'data-settings-corner': ink || '', onClick }, '⚙');
  window.BSMeCorner = () => React.createElement('span', null, React.createElement(window.BSSearchCorner), React.createElement(window.BSSettingsCorner));
  let opened = 0;
  const onOpen = () => { opened += 1; };
  window.addEventListener('shape:openProfile', onOpen);
  try {
    reset();
    const m = await mount(page());
    const search = document.querySelectorAll('[data-search-corner]');
    assert.equal(search.length, 1, 'one ✦ ⌕, not two: BSMeCorner draws its own');
    assert.equal(search[0].getAttribute('data-search-corner'), '#ffffff');
    const gear = document.querySelectorAll('[data-settings-corner]');
    assert.equal(gear.length, 1);
    assert.equal(gear[0].getAttribute('data-settings-corner'), '#ffffff');
    await click(gear[0]);
    assert.equal(opened, 1, 'the visitor\'s own profile');
    await m.unmount();
  } finally { window.removeEventListener('shape:openProfile', onOpen); Object.assign(window, had); }
});

test('a coach photo that fails to load shows the initials', async () => {
  reset();
  const m = await mount(page({ person: { ...maya, photo: 'https://cdn.example/broken.jpg' } }));
  const img = document.querySelector('img[src="https://cdn.example/broken.jpg"]');
  assert.ok(img, 'the photo first');
  await act(async () => { img.dispatchEvent(new window.Event('error')); });
  assert.ok(!document.querySelector('img[src="https://cdn.example/broken.jpg"]'), 'gone once it fails');
  // The avatar's own text (the page's text held "MO" by chance at some hours, in "TOMORROW").
  assert.equal(document.querySelector('[data-initials]').textContent, 'MO', 'the initials instead');
  await m.unmount();
});

test('a demo saved in Make it yours keeps only what was changed, so the Studio still follows the language (Codex P2 on #2486)', async () => {
  reset({ me: null });
  const client = asClient();
  // The language, as ShapeLocale has it: a switch re-renders every page that reads it.
  let lang = 'en';
  const subs = new Set();
  const hadLocale = window.ShapeLocale;
  const hadT = window.ShapeI18n.t;
  window.ShapeLocale = { get: () => lang, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } };
  try {
    const m = await mount(demoPage());
    await click(button(/^Make it yours$/));
    await click(document.querySelector('[data-paper="sage"]'));
    await click(document.querySelector('[data-save-mine]'));
    // Now Spanish: the sample's programs are named in the reader's language.
    lang = 'es';
    window.ShapeI18n.t = (key, opts) => (key === 'profile:sample.program.strong.name' ? 'Fuerte en 12' : hadT(key, opts));
    await act(async () => { for (const fn of subs) fn(); });
    await flush();
    await click(button(/^Studio$/));
    assert.match(m.text(), /Fuerte en 12/, 'the Studio follows the language after a colours-only save');
    const probe = document.createElement('div'); probe.style.background = window.makePalette({ paperMode: 'sage', accentKey: 'teal' }).PAPER_BG;
    assert.equal(document.querySelector('[data-trainer-profile]').style.background, probe.style.background, 'and the saved paper stays');
    await m.unmount();
  } finally { window.ShapeLocale = hadLocale; window.ShapeI18n.t = hadT; client.restore(); }
});

test('their activity: a tab of its own, last, with what they posted that the other tabs do not already show; a sample has its own', async () => {
  // Owner, 2026-10-30: "there is also no activity feed on coaches profile"; 2026-10-31: "the coaches
  // activity feed shouldn't be under replays, they should have a separate tab for activity".
  const note = (i) => ({ key: `n${i}`, title: `Note ${i}`, typeLabel: 'Note', ago: `${i}d`, body: `Body ${i}`, statsRow: [], breakdown: null });
  const tabNames = () => [...document.querySelectorAll('nav[aria-label="Profile sections"] button')].map((b) => b.textContent);
  reset({ posts: [note(1), { key: 'p1', title: 'Heavy squat day', ago: '2d', statsRow: [], breakdown: { label: 'Sets', rows: [['Set 1', '100 kg × 5', '']] } }, note(2), note(3), note(4)] });
  world.provider = { ...world.provider, price: 0 }; // no coaching by the month, so no Studio tab: three tabs
  let m = await mount(page());
  assert.equal(tabNames()[tabNames().length - 1], 'Activity', 'Activity is the last tab');
  const tabSizes = () => [...document.querySelectorAll('nav[aria-label="Profile sections"] button')].map((b) => b.style.fontSize);
  assert.deepEqual(tabNames(), ['Her day', 'Replays', 'Activity']);
  assert.ok(tabSizes().every((x) => x === '15px'), 'three tabs keep their size');
  assert.ok(!document.querySelector('[data-activity]'), 'the feed is not on the page under another tab');
  await tab('Replays');
  assert.ok(!document.querySelector('[data-activity]'), 'nor under Replays');
  await tab('Activity');
  const feed = document.querySelector('[data-activity]');
  assert.ok(feed, 'the feed, in its tab');
  // No "Maya's activity" heading under a tab already named Activity: the cards carry her name in their byline.
  assert.doesNotMatch(feed.textContent, /Maya's activity/);
  const titles = () => [...feed.querySelectorAll('[data-activity-card]')].map((c) => (c.textContent.match(/Note \d/) || [''])[0]);
  assert.deepEqual(titles(), ['Note 1', 'Note 2', 'Note 3', 'Note 4'], 'all of them, newest first; the logged session stays in Replays');
  assert.ok(!feed.querySelector('[data-activity-all]'), 'no See all in a tab of its own');
  assert.ok(!/Heavy squat day/.test(feed.textContent));
  assert.ok(!feed.querySelector('[data-log-activity]'), 'no Log activity on another coach\'s page');
  const reviews = document.querySelector('[data-reviews-strip]');
  if (reviews) assert.ok(feed.compareDocumentPosition(reviews) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'above the reviews');
  await m.unmount();
  // Nothing posted: no Activity tab for a visitor.
  reset({ posts: [] });
  m = await mount(page());
  assert.ok(!tabNames().includes('Activity'), 'an empty tab for a visitor');
  assert.ok(!document.querySelector('[data-activity]'));
  await m.unmount();
  // The coach's own page always has it, with Log activity.
  reset({ me: 'u-maya', posts: [] });
  m = await mount(page({ isSelf: true }));
  assert.deepEqual(tabNames(), ['Her day', 'About me', 'Studio', 'Replays', 'Activity'], 'all five on their own page, Activity last');
  assert.ok(tabSizes().every((x) => x === '13px'), 'more than three tabs set smaller');
  // A tab never shrinks below its words: the row sets them smaller to fit (useTabFit), and one that still
  // can't fit scrolls sideways instead of cutting a name to "…".
  const nav = document.querySelector('nav[aria-label="Profile sections"]');
  assert.equal(nav.style.overflowX, 'auto', 'the row scrolls');
  for (const b of nav.querySelectorAll('button')) {
    assert.equal(b.style.flex, '1 0 auto', 'a tab shrinks below its words');
    assert.notEqual(b.style.textOverflow, 'ellipsis', 'a name is cut to …');
  }
  await tab('Activity');
  assert.ok(document.querySelector('[data-activity] [data-log-activity]'), 'Log activity on their own page');
  await m.unmount();
  // A private profile shows none.
  reset({ posts: [note(1)], canView: false });
  m = await mount(page());
  assert.ok(!tabNames().includes('Activity'));
  assert.ok(!document.querySelector('[data-activity]'));
  await m.unmount();
  // A sample coach: its own run and note.
  reset({ me: 'u-me', byId: leahRow, slots: [] });
  m = await mount(page({ person: leah }));
  await tab('Activity');
  assert.match(document.querySelector('[data-activity]').textContent, /Easy run, zone 2.*Deload week/s);
  await m.unmount();
});

test('a person tapped in the activity opens their profile, and Back returns to the coach page', async () => {
  // The coach page handed the card and its likers sheet a no-op, so tapping a liker did nothing
  // (#2516's open item). The client module's card, sheets and public profile, as probes.
  const had = { card: window.BSActivityCard, sheets: window.useBSCardSheets, pub: window.BSPublicProfile };
  const sam = { who: 'Sam Lee', kind: 'CLIENT', userId: 'u-sam', public: true };
  window.BSActivityCard = ({ a, ctx }) => React.createElement('button', { type: 'button', 'data-card-name': '', onClick: () => ctx.setOpenProfile(sam) }, a.title);
  window.useBSCardSheets = () => ({ ctx: {}, renderSheets: ({ setOpenProfile }) => React.createElement('button', { type: 'button', 'data-liker': '', onClick: () => setOpenProfile(sam) }, 'Sam Lee liked this') });
  window.BSPublicProfile = ({ person, onBack, onMessage }) => React.createElement('div', { 'data-public-profile': person.userId },
    React.createElement('button', { type: 'button', 'data-public-back': '', onClick: onBack }, '← Back'),
    React.createElement('button', { type: 'button', 'data-public-message': '', onClick: () => onMessage(person) }, 'Message'));
  try {
    const messaged = [];
    reset({ posts: [{ key: 'n1', title: 'Note 1', typeLabel: 'Note', ago: '1d', body: 'Body', statsRow: [], breakdown: null }] });
    const m = await mount(page({ onMessage: (p) => messaged.push(p.userId) }));
    await tab('Activity');
    // From the likers sheet.
    await click(document.querySelector('[data-liker]'));
    assert.equal(document.querySelector('[data-public-profile]')?.getAttribute('data-public-profile'), 'u-sam', 'the liker\'s profile');
    assert.ok(!document.querySelector('[data-activity]'), 'over the coach page');
    await click(document.querySelector('[data-public-message]'));
    assert.deepEqual(messaged, ['u-sam'], 'Message on their profile messages them');
    await click(document.querySelector('[data-public-back]'));
    assert.ok(document.querySelector('[data-activity]') && !document.querySelector('[data-public-profile]'), 'Back to the coach page, on its Activity tab');
    // From a name on the card itself.
    await click(document.querySelector('[data-card-name]'));
    assert.ok(document.querySelector('[data-public-profile="u-sam"]'));
    await m.unmount();
  } finally {
    window.BSActivityCard = had.card; window.useBSCardSheets = had.sheets; window.BSPublicProfile = had.pub;
  }
});

test('the reviews are on the page: the newest, each a card, and All reviews opens the list', async () => {
  // Leah's sample reviews, and a coach with an account's own.
  reset({ me: 'u-me', byId: leahRow, slots: [] });
  let m = await mount(page({ person: leah }));
  const cards = [...document.querySelectorAll('[data-reviews-strip] [data-review-card]')];
  assert.equal(cards.length, 4, 'every sample review with words in it');
  assert.match(cards[0].textContent, /★ 10\/10.*\+60 lb on my deadlift.*Priya S\./s);
  assert.match(document.querySelector('[data-reviews-strip]').textContent, /What clients say/);
  // At the foot of the page, after the tabs and what they hold (owner, 2026-10-30: "move reviews to
  // bottom of page"), and before the footer.
  const nav = document.querySelector('nav[aria-label="Profile sections"]');
  const strip = document.querySelector('[data-reviews-strip]');
  assert.ok(nav.compareDocumentPosition(strip) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'after the tabs');
  assert.equal(strip.nextElementSibling.tagName, 'FOOTER', 'the last thing before the footer');
  await click(document.querySelector('[data-all-reviews]'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /Reviews\..*Marcus L\./s, 'the full list');
  await m.unmount();
  const had = window.ShapeCoachReviews.forOwner;
  window.ShapeCoachReviews.forOwner = async () => ({ reviews: [{ id: 'r1', author: 'Sam R.', rating: 9, text: 'Clear plans, and every set has a reason.' }, { id: 'r2', author: 'Ana P.', rating: 10, text: '' }], avg: 9.5, count: 2 });
  try {
    reset();
    m = await mount(page());
    const own = [...document.querySelectorAll('[data-review-card]')];
    assert.equal(own.length, 1, 'a rating with no words is not a card');
    assert.match(own[0].textContent, /Clear plans.*Sam R\./s);
    await m.unmount();
    // A private profile still shows them: reviews are the readers', not the coach's to hide.
    reset({ canView: false });
    m = await mount(page());
    assert.match(m.text(), /keeps their profile private/);
    assert.equal(document.querySelectorAll('[data-review-card]').length, 1);
    await m.unmount();
  } finally { window.ShapeCoachReviews.forOwner = had; }
  // No reviews, no strip.
  reset();
  m = await mount(page());
  assert.ok(!document.querySelector('[data-reviews-strip]'));
  await m.unmount();
});

test('a reader who isn\'t a member sees the rating and Join to read them, never a review', async () => {
  // As the server answers a non-member (owner, 2026-10-28: members read the reviews, "Rating only").
  const had = window.ShapeCoachReviews.forOwner;
  const hadReq = window.bsRequireAccount, hadCheckout = window.bsStartPlatformCheckout;
  const calls = [];
  window.ShapeCoachReviews.forOwner = async () => ({ reviews: [], locked: true, avg: 9.4, count: 12 });
  window.bsStartPlatformCheckout = () => calls.push('checkout');
  try {
    reset();
    let m = await mount(page());
    const strip = document.querySelector('[data-reviews-strip][data-reviews-locked]');
    assert.ok(strip, 'the strip says so');
    assert.match(strip.textContent, /What clients say.*9\.4\/10 from 12 reviews.*Members read the reviews\..*Join to read them/s);
    assert.equal(document.querySelectorAll('[data-review-card]').length, 0);
    // A guest is asked for an account first, and goes no further.
    window.bsRequireAccount = (label) => { calls.push(`account:${label}`); return false; };
    await click(strip.querySelector('[data-reviews-join]'));
    assert.deepEqual(calls, ['account:read the reviews']);
    // A signed-in non-member goes to the membership checkout.
    window.bsRequireAccount = () => true;
    await click(strip.querySelector('[data-reviews-join]'));
    assert.deepEqual(calls, ['account:read the reviews', 'checkout']);
    // The full list says the same.
    await click(button(/9\.4\/10 from 12 reviews/));
    const dlg = document.querySelector('[role="dialog"]');
    assert.match(dlg.textContent, /Members read the reviews\..*Join to read them/s);
    assert.doesNotMatch(dlg.textContent, /No reviews yet/);
    await click(dlg.querySelector('button[aria-label="Close"]'));
    // Joining (checkout, then the shell's recheck finds a member) reads the reviews again with the
    // page still open (Codex P2 on #2492).
    window.ShapeCoachReviews.forOwner = async () => ({ reviews: [{ id: 'r1', author: 'Sam R.', rating: 9, text: 'Clear plans, and every set has a reason.' }], avg: 9.4, count: 12 });
    await act(async () => { window.dispatchEvent(new window.Event('shape:membership-active')); });
    await flush();
    assert.ok(!document.querySelector('[data-reviews-locked]'), 'no longer locked');
    assert.match(document.querySelector('[data-review-card]').textContent, /Clear plans.*Sam R\./s);
    await m.unmount();
    // Locked with no reviews at all is just no reviews.
    window.ShapeCoachReviews.forOwner = async () => ({ reviews: [], locked: true, avg: 0, count: 0 });
    reset();
    m = await mount(page());
    assert.ok(!document.querySelector('[data-reviews-strip]'));
    await m.unmount();
  } finally {
    window.ShapeCoachReviews.forOwner = had;
    window.bsRequireAccount = hadReq; window.bsStartPlatformCheckout = hadCheckout;
  }
});


// ── Studio: programs with their free video, workouts (program days and videos), coaching ──────
// Owner, 2026-10-29: "There needs to be videos in replays of specific workouts or programs"; 2026-11-04,
// round 3 of the studio: the programs, workouts and coaching are the Studio tab, and Replays the sessions.
const CLIP = 'https://abcd.supabase.co/storage/v1/object/public/coach-media/u-maya/intro.mp4';
const row = (day, weekday, dayName, name, equipment) => ({ week: 0, day, weekday, dayName, name, equipment, muscle: 'x', text: name });
const STRONG = { id: '11111111-2222-4333-8444-555555555555', kind: 'program', name: 'Strong in 12', price: 79, meta: '12 weeks', providerId: 7, providerRole: 'trainer', detail: {
  preview: true, weeks: 12,
  blocks: [row(0, 0, 'Squat', 'Back squat', 'Barbell'), row(0, 0, 'Squat', 'Dumbbell row', 'Dumbbell'), row(1, 2, 'Press', 'Bench press', 'Barbell'), row(1, 2, 'Press', 'Face pull', 'Cable')],
  firstWeek: [{ week: 0, day: 0, weekday: 0, dayName: 'Squat', moves: 2 }, { week: 0, day: 1, weekday: 2, dayName: 'Press', moves: 3 }],
  media: [{ url: CLIP, type: 'video', name: 'Intro' }, { url: 'https://abcd.supabase.co/storage/v1/object/public/coach-media/u-maya/a.jpg', type: 'image' }],
} };
const ROWER = { id: '66666666-2222-4333-8444-555555555555', kind: 'program', name: 'Engine 8', price: 'Free', providerId: 7, providerRole: 'trainer', detail: { preview: true, blocks: [row(0, 0, 'Intervals', 'Rower', 'Rower')], weeks: 8, media: [] } };
const MEAL = { id: '77777777-2222-4333-8444-555555555555', kind: 'meal_plan', name: 'A cut', price: 20, providerId: 7, providerRole: 'trainer', detail: { preview: true } };
const tab = async (name) => click(button(new RegExp(`^${name}$`)));

test('Studio: each program with its price once, its weeks and days, the lead with Preview and Open, and Buy through the storefront\'s checkout', async () => {
  reset({ salePlans: [STRONG, MEAL, ROWER] });
  let m = await mount(page());
  await tab('Studio');
  const cards = [...document.querySelectorAll('[data-program]')];
  assert.equal(cards.length, 2, 'programs only, never a meal plan');
  assert.match(cards[0].textContent, /Program.*Strong in 12.*12 weeks · 2 days a week.*\$79.*Once/);
  assert.ok(cards[0].hasAttribute('data-lead'), 'the first is the lead');
  assert.ok(cards[0].querySelector('[data-program-preview]'), 'with a free video, Preview');
  assert.match(cards[1].textContent, /Engine 8.*8 weeks.*Free/);
  assert.doesNotMatch(cards[1].textContent, /Once/, 'a free program is not bought once');
  // A free program has no checkout (Codex on #2508): Work with in place of Buy.
  await click(cards[1]);
  assert.ok(!document.querySelector('[data-program-buy]'), 'no Buy · Free');
  assert.ok(button(/^Work with Maya$/));
  await click(button(/^Close$/));
  await click(cards[0].querySelector('[data-program-open]'));
  const sheet = document.querySelector('[data-program-sheet]');
  assert.ok(sheet);
  const video = sheet.querySelector('[data-program-video] video');
  assert.ok(video, 'the free video plays in the sheet');
  assert.equal(video.getAttribute('src'), CLIP);
  assert.match(sheet.textContent, /The first week/);
  // The first day open on its moves; another opens on a tap, its moves past the names kept counted.
  const days = [...sheet.querySelectorAll('[data-program-day]')];
  assert.equal(days.length, 2);
  assert.match(days[0].textContent, /MON.*Squat.*Back squat.*Dumbbell row/);
  assert.match(days[1].textContent, /WED.*Press.*3 moves/);
  await click(days[1].querySelector('button'));
  assert.match(sheet.querySelector('[data-program-moves]').textContent, /Bench press.*Face pull.*＋1/);
  assert.match(sheet.textContent, /Sets, loads, cues and exercise videos unlock when you buy/);
  await click(sheet.querySelector('[data-program-buy]'));
  assert.deepEqual(world.bought, { plan: { id: STRONG.id, name: 'Strong in 12', price: 79 }, providerRole: 'trainer', providerId: 7 });
  assert.equal(world.checkout, 'https://checkout.stripe.test/c/1');
  await m.unmount();
  // A guest is asked for an account first, and nothing is bought.
  reset({ salePlans: [STRONG] });
  window.bsRequireAccount = () => false;
  try {
    m = await mount(page());
    await tab('Studio');
    await click(document.querySelector('[data-program-open]'));
    await click(document.querySelector('[data-program-buy]'));
    assert.equal(world.bought, undefined);
    await m.unmount();
  } finally { delete window.bsRequireAccount; }
  // The coach on their own page sees what members see, with no Buy.
  reset({ me: 'u-maya', salePlans: [STRONG] });
  m = await mount(page({ isSelf: true }));
  await tab('Studio');
  await click(document.querySelector('[data-program-open]'));
  assert.ok(!document.querySelector('[data-program-buy]'), 'no Buy on their own program');
  assert.match(document.querySelector('[data-program-sheet]').textContent, /This is what members see before they buy\./);
  await m.unmount();
});

test('Studio: workouts posted on video play in the sheet; Replays keeps the sessions, each with its sets', async () => {
  const V2 = 'https://abcd.supabase.co/storage/v1/object/public/coach-media/u-maya/v2.mp4';
  reset({ posts: [
    { key: 'v1', title: 'Squat walkthrough', body: 'Brace, then sit between the hips.', video: CLIP, ago: '2d' },
    { key: 's1', title: 'Heavy triples', breakdown: { label: 'Working sets', rows: [['Set 1', '100 kg × 3', 'RPE 6']] }, ago: '3d' },
    { key: 's2', title: 'Pulls on film', video: V2, breakdown: { label: 'Sets', rows: [['Set 1', '150 kg × 3', 'RPE 7'], ['Set 2', '160 kg × 3', 'RPE 8']] }, ago: '4d' },
    { key: 'x1', title: 'Insecure link', video: 'http://example.com/v.mp4', ago: '5d' },
  ] });
  const m = await mount(page());
  await tab('Studio');
  const workouts = [...document.querySelectorAll('[data-workout][data-kind="video"]')];
  assert.deepEqual(workouts.map((w) => w.textContent.includes('Squat walkthrough') ? 'v1' : w.textContent.includes('Pulls on film') ? 's2' : '?'), ['v1', 's2'], 'https videos only');
  assert.match(workouts[0].textContent, /Workout · Video.*Squat walkthrough.*Video · 2d/);
  await click(workouts[0].querySelector('button'));
  assert.equal(document.querySelector('[data-replay-video] video').getAttribute('src'), CLIP);
  assert.match(document.body.textContent, /Workout · 2d/);
  assert.ok(!button(/^Next →$/), 'no sets, no stepper');
  await click(button(/^Close$/));
  await click(workouts[1].querySelector('button'));
  assert.equal(document.querySelector('[data-replay-video] video').getAttribute('src'), V2);
  assert.ok(button(/^Next →$/), 'its sets step through');
  await click(button(/^Close$/));
  await tab('Replays');
  assert.equal(document.querySelectorAll('[data-replay]').length, 1, 'a session with a video is a workout, not listed twice');
  assert.ok(!document.querySelector('[data-workout]') && !document.querySelector('[data-program]'), 'Replays is the sessions alone');
  await m.unmount();
});

// Owner, 2026-11-04 (round 3 of the studio): a coach may write one line about anything they sell and say
// who a program is for, pick the workouts to start on, and set the words under their name.
const mv = (day, weekday, dayName, name, muscle) => ({ week: 0, day, weekday, dayName, name, equipment: 'Barbell', muscle, text: name });
const LIFT = { id: 'aaaaaaaa-2222-4333-8444-555555555555', kind: 'program', name: 'Lift 3', price: 49, providerId: 7, providerRole: 'trainer', detail: {
  preview: true, weeks: 6, note: 'The program\'s own note.',
  blocks: [mv(0, 0, 'Legs', 'Back squat', 'Quads'), mv(0, 0, 'Legs', 'Romanian deadlift', 'Hamstrings'), mv(1, 2, 'Push', 'Bench press', 'Chest'), mv(1, 2, 'Push', 'Overhead press', 'Shoulders'), mv(2, 4, 'Total', 'Deadlift', 'Posterior chain'), mv(2, 4, 'Total', 'Pull-up', 'Back')],
  firstWeek: [{ week: 0, day: 0, weekday: 0, dayName: 'Legs', moves: 2 }, { week: 0, day: 1, weekday: 2, dayName: 'Push', moves: 2 }, { week: 0, day: 2, weekday: 4, dayName: 'Total', moves: 2 }],
} };

test('Studio: the coach\'s line on each, who a program is for, their picks first, workouts by focus, and their focus under the name', async () => {
  reset({ salePlans: [LIFT, STRONG], posts: [{ key: 'v1', title: 'Squat walkthrough', video: CLIP, ago: '2d' }], custom: {
    descriptions: { [`p:${STRONG.id}`]: 'Three days a week, filmed.', [`d:${LIFT.id}:1`]: 'Press heavy, then light.', coaching: 'I write your week around you.' },
    programFor: { [LIFT.id]: { id: 'new' }, [STRONG.id]: { w: 'Lifters back from injury' } },
    picks: [`d:${LIFT.id}:1`, 'v:v1', 'v:gone'],
    focus: [{ id: 'strength' }, { w: 'Olympic lifting' }],
  } });
  const m = await mount(page());
  // The focus under the name, each preset in the reader's words, in place of the listing's specialty.
  assert.match(m.text(), /Strength · Olympic lifting/);
  assert.doesNotMatch(m.text(), /Strength coach/);
  await tab('Studio');
  assert.deepEqual([...document.querySelectorAll('[data-studio-jump-to]')].map((b) => b.textContent.replace(/\s+/g, '')), ['2Programs⌄', '6Workouts⌄', '1Coaching⌄']);
  const progs = [...document.querySelectorAll('[data-program]')];
  assert.match(progs[0].textContent, /Lift 3.*The program's own note\..*For.*New to lifting/, 'no line written: the program\'s own note');
  assert.match(progs[1].textContent, /Strong in 12.*Three days a week, filmed\..*For.*Lifters back from injury/);
  // The picks first, in the coach's order (a pick no longer there is left out), then every day and video once.
  const rows = () => [...document.querySelectorAll('[data-workout]')];
  assert.equal(rows().length, 3 + 2 + 1);
  assert.deepEqual(rows().map((r) => r.hasAttribute('data-pick')), [true, true, false, false, false, false]);
  assert.match(rows()[0].textContent, /Workout · Maya's pick.*Push.*Press heavy, then light\..*Lift 3 · Wednesday · 2 moves/);
  assert.match(rows()[1].textContent, /Squat walkthrough/);
  // The filter: All and only the foci there are, each with its count; a day whose moves name no muscle is under All.
  assert.deepEqual([...document.querySelectorAll('[data-studio-focus]')].map((b) => b.textContent), ['All6', 'Upper body1', 'Lower body1', 'Full body1']);
  await click(document.querySelector('[data-studio-focus="lower"]'));
  assert.deepEqual(rows().map((r) => (r.textContent.match(/Legs|Push|Total|Squat|Press|walkthrough/) || [''])[0]), ['Legs']);
  // A day opens in place to its moves and their muscles, and leads to its program's sheet.
  await click(rows()[0].querySelector('button'));
  assert.match(document.querySelector('[data-workout-moves]').textContent, /Back squat\s*Quads.*Romanian deadlift\s*Hamstrings/);
  await click(document.querySelector('[data-workout-program]'));
  const sheet = document.querySelector('[data-program-sheet]');
  assert.match(sheet.querySelector('[data-program-desc]').textContent, /The program's own note\./);
  assert.match(sheet.querySelector('[data-program-for]').textContent, /For\s*New to lifting/);
  await click(button(/^Close$/));
  // Coaching: the coach's line in place of the offer's, what you get, and the way in.
  const card = document.querySelector('[data-coaching-card]');
  assert.match(card.textContent, /Coaching with Maya.*\$180.*A month.*I write your week around you\..*Custom programming/);
  await click(card.querySelector('[data-coaching-apply]'));
  assert.ok(document.querySelector('[data-coaching-block]'), 'Apply opens the Work-with sheet');
  await m.unmount();
  // A private profile shows none of the coach's words.
  reset({ canView: false, custom: { focus: [{ id: 'strength' }] } });
  const priv = await mount(page());
  assert.doesNotMatch(priv.text(), /Strength ·|Olympic/);
  await priv.unmount();
});

// Owner, 2026-10-30: "Translate all sample text". A sample read in German: its programs, workouts,
// replays and station notes in the German catalog's words, and nothing left in the English. Their
// ages too (owner, 2026-10-30: "Yes, translate the short ages too").
test('a sample trainer\'s page reads in the reader\'s language: programs, workouts and replays', async () => {
  const de = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/de/profile.json'), 'utf8'));
  const deCommon = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/de/common.json'), 'utf8'));
  const hadT = window.ShapeI18n.t;
  window.ShapeI18n.t = (key, opts = {}) => (key.startsWith('profile:sample.') ? new IntlMessageFormat(de[key.slice('profile:'.length)], 'de-DE').format(opts)
    : key.startsWith('common:age.') ? new IntlMessageFormat(deCommon[key.slice('common:'.length)], 'de-DE').format(opts)
    : hadT(key, opts));
  try {
    reset({ me: 'u-me', byId: leahRow, slots: [] });
    const m = await mount(page({ person: leah }));
    await tab('Studio');
    let text = m.text();
    await tab('Replays');
    text += m.text();
    for (const k of ['program.engine.name', 'program.bells.name', 'workout.row.title', 'workout.swings.title', 'replay.bike.title', 'replay.circuit.title']) {
      assert.ok(text.includes(de['sample.' + k]), `${k} in German: ${de['sample.' + k]}`);
    }
    for (const english of ['Engine 8', 'Bike and bells', 'Rower pacing', 'Air bike intervals', 'Sled, carries and burpees']) {
      if (!Object.values(de).includes(english)) assert.ok(!text.includes(english), `no English left: ${english}`);
    }
    for (const age of ['2 T.', '4 T.']) assert.ok(text.includes(age), `the replays' age in German: ${age}`);
    assert.doesNotMatch(text, /\b[2-6]d\b/, 'no English short age left');
    await m.unmount();
  } finally { window.ShapeI18n.t = hadT; }
});

test('a sample coach\'s programs open with no Buy, and the coach\'s own Studio posts a workout video in the composer\'s Video', async () => {
  reset({ me: 'u-me', byId: leahRow, slots: [] });
  let m = await mount(page({ person: leah }));
  await tab('Studio');
  const names = [...document.querySelectorAll('[data-program]')].map((b) => b.textContent);
  assert.equal(names.length, 2);
  assert.match(names[0], /Engine 8/, 'a HIIT coach\'s sample programs');
  // The generated sample clips: two workouts on video, and each program plays one.
  const workouts = [...document.querySelectorAll('[data-workout][data-kind="video"]')].map((b) => b.textContent);
  assert.equal(workouts.length, 2);
  assert.match(workouts.join(' '), /Rower pacing/);
  assert.match(workouts.join(' '), /Kettlebell swings/);
  await click(document.querySelector('[data-program-open]'));
  assert.ok(document.querySelector('[data-program-video]'), 'the sample program plays its clip');
  assert.ok(!document.querySelector('[data-program-buy]'), 'nothing is sold on a sample');
  assert.ok(button(/^Work with Leah$/));
  await m.unmount();
  const had = window.BSLogActivitySheet;
  window.BSLogActivitySheet = (props) => ((world.composer = props.startKind || null), React.createElement('div', { 'data-composer': '' }));
  try {
    reset({ me: 'u-maya' });
    m = await mount(page({ isSelf: true }));
    await tab('Studio');
    await click(document.querySelector('[data-post-video]'));
    assert.equal(world.composer, 'video');
    await m.unmount();
  } finally { window.BSLogActivitySheet = had; }
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /function BSLogActivitySheet\(\{ c, INK, BG, onClose, onPosted, editPost = null, startKind = null \}\)/);
  assert.match(client, /: \(\['note', 'photo', 'video', 'workout', 'milestone', 'link'\]\.includes\(startKind\) \? startKind : 'note'\);/, 'a new post opens on the kind asked for');
  assert.match(client, /BSSearchCorner, bsOpenCheckout, bsStartPlatformCheckout \}\);/, 'the checkout opener is on window for the profile');
});

// ── About me (owner, 2026-10-31: "an about page for each coach where they can write a bio about
// themselves and include more information", "a section on coaches profiles for socials to list",
// and "have the tab say about me") ──────────────────────────────────────────────────────────────
test('About me: the story, the details, the questions and the socials, as members see them', async () => {
  reset({ custom: {
    about: { story: 'I started lifting at 30.\n\nNow I coach beginners.', years: 8, how: 'both', where: 'Brooklyn', languages: 'English, Spanish' },
    prompts: [{ q: 'philosophy', a: 'Strong first, then fast.' }, { q: 'Something I wrote myself', a: 'Kept as written.' }],
    links: { instagram: '@maya.lifts', website: 'https://mayaokafor.com/', x: 'javascript:alert(1)', youtube: 'two words', tiktok: 'https://?x' },
  } });
  const m = await mount(page());
  await click(button(/^About me$/));
  const tab = document.querySelector('[data-about-tab]');
  assert.ok(tab, 'the About me tab');
  const story = tab.querySelector('[data-about="story"]');
  assert.match(story.textContent, /^About Maya/);
  assert.deepEqual([...story.querySelectorAll('p')].map((p) => p.textContent), ['I started lifting at 30.', 'Now I coach beginners.'], 'a paragraph each');
  assert.deepEqual([...tab.querySelectorAll('[data-about="facts"] li')].map((li) => li.textContent), ['Coaching for 8 years', 'Coaches online and in person · Brooklyn', 'Coaches in English, Spanish']);
  const answers = [...tab.querySelectorAll('[data-about-answer]')].map((a) => [a.children[0].textContent, a.children[1].textContent]);
  assert.deepEqual(answers, [['My coaching philosophy', 'Strong first, then fast.'], ['Something I wrote myself', 'Kept as written.']], 'a prompt reads in the reader\'s language; one written by hand as written');
  assert.match(tab.querySelector('[data-about="qa"]').textContent, /^In Maya's words/);
  const links = [...tab.querySelectorAll('[data-about-link]')];
  assert.deepEqual(links.map((a) => [a.getAttribute('data-about-link'), a.getAttribute('href')]), [['instagram', 'https://instagram.com/maya.lifts'], ['website', 'https://mayaokafor.com/']], 'a javascript: address, a value with a space and an address with no host are no links');
  assert.match(links[0].textContent, /^Instagram@maya\.lifts/);
  for (const a of links) { assert.equal(a.getAttribute('target'), '_blank'); assert.equal(a.getAttribute('rel'), 'noopener noreferrer'); }
  assert.match(tab.querySelector('[data-about="socials"]').textContent, /^Find Maya online/);
  assert.ok(!document.querySelector('[data-about-edit]'), 'a member has no way to edit it');
  await m.unmount();
});

test('About me: a visitor sees no tab with nothing in it; the coach does, with a way in', async () => {
  // Only a social the page cannot link (Codex P2 on #2540): no tab either.
  reset({ custom: { look: { paper: 'bone', accent: 'rust' }, links: { website: 'https://' } } });
  let m = await mount(page());
  assert.ok(!button(/^About me$/), 'no empty tab for members');
  // Each tab keeps to one line (owner, 2026-10-31: "make this fit on one line"); three or fewer read at
  // 15px, more at 13px with 5px sides and a hairline between two (owner, 2026-11-04). Where the row lays
  // out, the tabs set smaller until it holds them (the next test); jsdom lays nothing out, so they
  // keep their size here.
  const tabStyle = () => [...document.querySelectorAll('[data-profile-tab]')].map((b) => [b.style.fontSize, b.style.padding, b.style.whiteSpace, b.style.flex].join(' '));
  const few = tabStyle();
  assert.ok(few.length >= 1 && few.length <= 3, `the member's tabs: ${few.length}`);
  for (const st of few) assert.equal(st, '15px 0px 6px nowrap 1 0 auto');
  await m.unmount();
  reset({ me: 'u-maya', stored: { look: { paper: 'dark', accent: 'teal' } } });
  m = await mount(page({ isSelf: true }));
  const five = tabStyle();
  assert.equal(five.length, 5, "the coach's own page: the day, About me, the studio, replays, Activity");
  for (const st of five) assert.equal(st, '13px 0px 5px nowrap 1 0 auto');
  assert.equal(document.querySelectorAll('[data-profile-tab-rule]').length, 4, 'a hairline between each two tabs, none at the ends');
  assert.ok(!document.querySelector('[data-profile-tab-fade]'), 'no fade on a row that is not known to run over');
  await click(button(/^About me$/));
  assert.match(m.text(), /Tell members who you are: your story, how you coach, and where to find you\./);
  await click(document.querySelector('[data-about-edit]'));
  assert.ok(document.querySelector('[data-mine-about]'), 'Write About me opens Make it yours on About me');
  await m.unmount();
});

test('the tabs set smaller until the row holds them, down to 11.5px; a row that still runs over fades at its edge', async () => {
  // Owner, 2026-11-04: "these tabs are also going off page". jsdom lays nothing out, so the row's widths
  // are stood in for: each tab's words take 0.6em a letter (0.66em set bold, as the picked one is), its
  // sides 10px, a hairline 1px.
  const P = window.HTMLElement.prototype;
  const saved = ['clientWidth', 'scrollWidth'].map((k) => [k, Object.getOwnPropertyDescriptor(P, k)]);
  // Her day (picked), About me, Studio, Replays, Activity: 330.2px at 12px, 341.3px at 12.5px; the row
  // holds what is within a pixel of its width, as the fit does.
  let room = 340;
  const need = (nav) => 12 + [...nav.querySelectorAll('[data-profile-tab]')].reduce((w, b) => w + b.textContent.length * (b.style.fontWeight === '600' ? 0.66 : 0.6) * parseFloat(b.style.fontSize) + 10, 0)
    + nav.querySelectorAll('[data-profile-tab-rule]').length;
  Object.defineProperty(P, 'clientWidth', { configurable: true, get() { return this.tagName === 'NAV' ? room : 0; } });
  Object.defineProperty(P, 'scrollWidth', { configurable: true, get() { return this.tagName === 'NAV' ? Math.max(room, need(this)) : 0; } });
  try {
    reset({ me: 'u-maya', stored: { look: { paper: 'dark', accent: 'teal' } } });
    let m = await mount(page({ isSelf: true }));
    const nav = document.querySelector('nav[aria-label="Profile sections"]');
    const sizes = () => [...nav.querySelectorAll('[data-profile-tab]')].map((b) => parseFloat(b.style.fontSize));
    const s = sizes();
    assert.equal(s.length, 5);
    assert.deepEqual(s, [12, 12, 12, 12, 12], 'the largest half point that fits: 12.5 needs 341.3px of 340');
    assert.ok(need(nav) <= room + 1, 'the row holds them');
    assert.ok(!nav.querySelector('[data-profile-tab-fade]'), 'no fade on a row that fits');
    // The picked tab is set bold, so a pick changes the row and it is fitted again (Codex P2 on #2590): the
    // shorter Studio frees room for 12.5 (340.5px), the longer Activity takes it back (342px at 12.5).
    const tab = (label) => [...nav.querySelectorAll('[data-profile-tab]')].find((b) => b.textContent === label);
    await click(tab('Studio'));
    assert.deepEqual(sizes(), [12.5, 12.5, 12.5, 12.5, 12.5], 'fitted again for the shorter bold pick');
    assert.ok(need(nav) <= room + 1, 'the row still holds them');
    await click(tab('Activity'));
    assert.deepEqual(sizes(), [12, 12, 12, 12, 12], 'and again for the longer one');
    assert.ok(need(nav) <= room + 1, 'the row still holds them');
    await m.unmount();
    // Too narrow even at 11.5px: the row keeps 11.5 and scrolls, with a fade on the side there is more.
    room = 200;
    m = await mount(page({ isSelf: true }));
    const nav2 = document.querySelector('nav[aria-label="Profile sections"]');
    assert.ok([...nav2.querySelectorAll('[data-profile-tab]')].every((b) => b.style.fontSize === '11.5px'));
    assert.equal(nav2.querySelector('[data-profile-tab-fade="right"]').style.opacity, '1', 'more to the right');
    assert.equal(nav2.querySelector('[data-profile-tab-fade="left"]').style.opacity, '0', 'nothing to the left yet');
    await m.unmount();
  } finally {
    for (const [k, d] of saved) { if (d) Object.defineProperty(P, k, d); else delete P[k]; }
  }
});

test('Make it yours, About me: years past 60 as the only edit still show the save bar, and save says why', async () => {
  // Codex P2 on #2540: the doc drops a 75, so with nothing else changed nothing read as changed.
  reset({ me: 'u-maya', custom: null, stored: { look: { paper: 'dark', accent: 'teal' } } });
  const m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click([...document.querySelectorAll('[data-make-it-yours] button')].find((b) => /^About me$/.test(b.textContent)));
  assert.ok(!document.querySelector('[data-save-mine]'), 'no save bar before an edit');
  await type(document.querySelector('[data-about-years]'), '75');
  assert.ok(document.querySelector('[data-save-mine]'), 'the save bar shows');
  await click(document.querySelector('[data-save-mine]'));
  assert.equal(world.saved, null, 'nothing saved');
  assert.match(m.text(), /Years coaching: a number from 1 to 60\./);
  await type(document.querySelector('[data-about-years]'), '');
  assert.ok(!document.querySelector('[data-save-mine]'), 'cleared, nothing is changed');
  await m.unmount();
});

test('Make it yours, About me: saves the story, details, questions and socials onto the doc; a link it cannot use is said', async () => {
  reset({ me: 'u-maya', custom: null, stored: { bio: 'Saved elsewhere', look: { paper: 'dark', accent: 'teal' }, prompts: [{ q: 'never_skip', a: 'Leg day.' }] } });
  const m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click([...document.querySelectorAll('[data-make-it-yours] button')].find((b) => /^About me$/.test(b.textContent)));
  // The question a member's profile kept is here to edit, as written.
  assert.equal(document.querySelectorAll('[data-about-prompt]').length, 1);
  await type(document.querySelector('[data-about-story]'), 'I started lifting at 30.\n\n\n\nNow I coach beginners.  ');
  await type(document.querySelector('[data-about-years]'), '75');
  await click(document.querySelector('[data-about-how="both"]'));
  await type(document.querySelector('[data-about-where]'), 'Brooklyn');
  await type(document.querySelector('[data-about-languages]'), 'English, Spanish');
  await click(document.querySelector('[data-about-prompt-add]'));
  const answers = document.querySelectorAll('[data-about-answer]');
  await type(answers[1], 'Strong first, then fast.');
  await type(document.querySelector('[data-about-link="instagram"]'), '@maya.lifts');
  await type(document.querySelector('[data-about-link="website"]'), 'my site');
  // Years the page would drop are said at save (Codex P2 on #2540: 61–99 saved and vanished).
  await click(document.querySelector('[data-save-mine]'));
  assert.equal(world.saved, null, 'nothing saved with years past 60');
  assert.match(m.text(), /Years coaching: a number from 1 to 60\./);
  await type(document.querySelector('[data-about-years]'), '8 years');
  assert.equal(document.querySelector('[data-about-years]').value, '8', 'digits only');
  await click(document.querySelector('[data-save-mine]'));
  assert.equal(world.saved, null, 'nothing saved with a link it cannot use');
  assert.match(m.text(), /Check Website: a handle like @you, or an address starting with https:\/\//);
  await type(document.querySelector('[data-about-link="website"]'), 'mayaokafor.com');
  await click(document.querySelector('[data-save-mine]'));
  assert.ok(world.saved, 'saved');
  const d = world.saved.d;
  assert.deepEqual(d.about, { story: 'I started lifting at 30.\n\nNow I coach beginners.', years: 8, how: 'both', where: 'Brooklyn', languages: 'English, Spanish' });
  assert.deepEqual(d.prompts, [{ q: 'never_skip', a: 'Leg day.' }, { q: 'philosophy', a: 'Strong first, then fast.' }]);
  assert.deepEqual(d.links, { instagram: '@maya.lifts', website: 'mayaokafor.com' });
  assert.equal(d.bio, 'Saved elsewhere', 'the rest of the doc is kept');
  assert.deepEqual(d.look, { paper: 'dark', accent: 'teal' }, 'and a key not changed here is not written');
  await m.unmount();
});

// Owner, 2026-11-03: "the about me should have more things to add. certificates, accolades, things like
// that". Certificates are the ones Shape verified (get_coach_certs, names only), read for a verified
// listing; accolades and education and training are the coach's own lists.
test('About me: certificates as Shape verified them, then the coach\'s accolades and education', async () => {
  const had = window.ShapeProfiles.getCoachCerts;
  window.ShapeProfiles.getCoachCerts = async (uid) => { world.certsFor = uid; return world.certs; };
  try {
    reset({ certs: ['NSCA-CSCS', 'Precision Nutrition L1'], custom: { about: {
      story: 'I coach beginners.',
      accolades: [{ title: 'Coach of the Year', detail: 'Brooklyn Fitness Awards', year: 2024 }, { title: 'Featured in a magazine' }],
      education: [{ title: 'BSc Kinesiology', detail: 'Rutgers', year: 2014 }],
    } } });
    let m = await mount(page());
    await click(button(/^About me$/));
    assert.equal(world.certsFor, 'u-maya', 'the certificates were read for the coach');
    const tab = document.querySelector('[data-about-tab]');
    assert.deepEqual([...tab.querySelectorAll('[data-about]')].map((n) => n.getAttribute('data-about')), ['story', 'certs', 'accolades', 'education'], 'certificates, then accolades, then education, after the story');
    assert.match(tab.querySelector('[data-about="certs"]').textContent, /^Certificates/);
    assert.deepEqual([...tab.querySelectorAll('[data-about-cert]')].map((li) => li.textContent), ['NSCA-CSCS✓ Verified by Shape', 'Precision Nutrition L1✓ Verified by Shape']);
    assert.deepEqual([...tab.querySelectorAll('[data-about="accolades"] [data-about-item]')].map((li) => li.textContent), ['Coach of the YearBrooklyn Fitness Awards2024', 'Featured in a magazine']);
    assert.match(tab.querySelector('[data-about="accolades"]').textContent, /^Accolades/);
    assert.deepEqual([...tab.querySelectorAll('[data-about="education"] [data-about-item]')].map((li) => li.textContent), ['BSc KinesiologyRutgers2014']);
    assert.match(tab.querySelector('[data-about="education"]').textContent, /^Education and training/);
    await m.unmount();
    // A listing Shape has not verified reads no certificates, and certificates alone open the tab.
    reset({ certs: ['NSCA-CSCS'], custom: null, provider: { ...world.provider, verified: false } });
    m = await mount(page());
    assert.ok(!button(/^About me$/), 'nothing to show: no tab');
    assert.equal(world.certsFor, undefined, 'certificates were read for an unverified listing');
    await m.unmount();
    reset({ certs: ['NSCA-CSCS'], custom: null });
    m = await mount(page());
    await click(button(/^About me$/));
    assert.deepEqual([...document.querySelectorAll('[data-about-cert]')].map((li) => li.textContent), ['NSCA-CSCS✓ Verified by Shape'], 'certificates alone open the tab');
    await m.unmount();
    // A private profile reads none: one the viewer may not see, and one that answers a visitor with no
    // account with no row at all (Codex on #2576).
    for (const over of [{ canView: false }, { noCard: true }]) {
      reset({ certs: ['NSCA-CSCS'], custom: null, ...over });
      m = await mount(page());
      await flush();
      assert.equal(world.certsFor, undefined, `certificates were read for ${JSON.stringify(over)}`);
      assert.ok(!document.querySelector('[data-about-cert]'), 'a certificate shows');
      await m.unmount();
    }
  } finally { window.ShapeProfiles.getCoachCerts = had; }
});

test('Make it yours, About me: accolades and education save as lists; a row it would drop is said', async () => {
  reset({ me: 'u-maya', custom: null, stored: { look: { paper: 'dark', accent: 'teal' } } });
  const m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click([...document.querySelectorAll('[data-make-it-yours] button')].find((b) => /^About me$/.test(b.textContent)));
  assert.match(m.text(), /Your certificates show on About me once Shape has verified them\./, 'where certificates come from');
  await click(document.querySelector('[data-about-list="accolades"] [data-about-item-add]'));
  await click(document.querySelector('[data-about-list="accolades"] [data-about-item-add]'));
  const acc = () => [...document.querySelectorAll('[data-about-list="accolades"] [data-about-item]')];
  assert.equal(acc().length, 2);
  await type(acc()[0].querySelector('[data-about-item-title]'), 'Coach of the Year');
  await type(acc()[0].querySelector('[data-about-item-detail]'), 'Brooklyn Fitness Awards');
  await type(acc()[0].querySelector('[data-about-item-year]'), '20x24');
  assert.equal(acc()[0].querySelector('[data-about-item-year]').value, '2024', 'digits only, four at most');
  // A row with a detail and no title would be dropped: said at save.
  await type(acc()[1].querySelector('[data-about-item-detail]'), 'Somewhere');
  await click(document.querySelector('[data-save-mine]'));
  assert.equal(world.saved, null, 'nothing saved with a row it would drop');
  assert.match(m.text(), /Each accolade and course needs a title, or remove it\./);
  await click(acc()[1].querySelector('[data-about-item-remove]'));
  assert.equal(acc().length, 1);
  await click(document.querySelector('[data-about-list="education"] [data-about-item-add]'));
  const edu = () => [...document.querySelectorAll('[data-about-list="education"] [data-about-item]')];
  await type(edu()[0].querySelector('[data-about-item-title]'), 'BSc Kinesiology');
  await type(edu()[0].querySelector('[data-about-item-year]'), '1890');
  await click(document.querySelector('[data-save-mine]'));
  assert.equal(world.saved, null, 'nothing saved with a year it would drop');
  assert.match(m.text(), new RegExp(`A year from 1950 to ${new Date().getFullYear() + 1}\\.`));
  await type(edu()[0].querySelector('[data-about-item-year]'), '2014');
  await click(document.querySelector('[data-save-mine]'));
  assert.ok(world.saved, 'saved');
  assert.deepEqual(world.saved.d.about, { accolades: [{ title: 'Coach of the Year', detail: 'Brooklyn Fitness Awards', year: 2024 }], education: [{ title: 'BSc Kinesiology', year: 2014 }] });
  await m.unmount();
});

// Owner, 2026-11-03 (of the profile's head): "coaches socials should be shown somewhere in this section if
// they choose to". Off unless the coach turns it on; then the links About draws, as icons under the rating.
test('the head shows the coach\'s socials only when they chose it, as the links About draws', async () => {
  const links = { instagram: '@maya.lifts', website: 'https://mayaokafor.com/', x: 'javascript:alert(1)' };
  reset({ custom: { links } });
  let m = await mount(page());
  assert.ok(!document.querySelector('[data-head-socials]'), 'shown without the coach choosing it');
  await m.unmount();
  reset({ custom: { links, headLinks: true } });
  m = await mount(page());
  const row = document.querySelector('[data-head-socials]');
  assert.ok(row, 'no socials in the head');
  assert.equal(row.getAttribute('aria-label'), 'Find Maya online');
  const a = [...row.querySelectorAll('[data-head-social]')];
  assert.deepEqual(a.map((x) => [x.getAttribute('data-head-social'), x.getAttribute('href')]), [['instagram', 'https://instagram.com/maya.lifts'], ['website', 'https://mayaokafor.com/']], 'the links About draws, and only those');
  assert.deepEqual(a.map((x) => x.getAttribute('aria-label')), ['Instagram @maya.lifts', 'Website mayaokafor.com']);
  for (const x of a) { assert.equal(x.getAttribute('target'), '_blank'); assert.equal(x.getAttribute('rel'), 'noopener noreferrer'); assert.equal(x.style.width, '44px'); assert.equal(x.style.height, '44px'); }
  await m.unmount();
});

test('Make it yours, About me: the head-socials switch saves the choice, and turning it off removes it', async () => {
  reset({ me: 'u-maya', custom: null, stored: { look: { paper: 'dark', accent: 'teal' }, links: { instagram: '@maya.lifts' } } });
  let m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click([...document.querySelectorAll('[data-make-it-yours] button')].find((b) => /^About me$/.test(b.textContent)));
  const sw = () => document.querySelector('[data-about-head-links]');
  assert.equal(sw().getAttribute('aria-checked'), 'false', 'on before the coach chose it');
  assert.match(sw().textContent, /^Show them at the top of your page/);
  await click(sw());
  assert.equal(sw().getAttribute('aria-checked'), 'true');
  await click(document.querySelector('[data-save-mine]'));
  assert.equal(world.saved.d.headLinks, true);
  assert.deepEqual(world.saved.d.links, { instagram: '@maya.lifts' }, 'the links as they were');
  await m.unmount();
  reset({ me: 'u-maya', custom: null, stored: { look: { paper: 'dark', accent: 'teal' }, links: { instagram: '@maya.lifts' }, headLinks: true } });
  m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click([...document.querySelectorAll('[data-make-it-yours] button')].find((b) => /^About me$/.test(b.textContent)));
  assert.equal(sw().getAttribute('aria-checked'), 'true', 'the saved choice');
  await click(sw());
  await click(document.querySelector('[data-save-mine]'));
  assert.ok(world.saved && !('headLinks' in world.saved.d), 'turned off, the key is gone');
  await m.unmount();
});

// Owner, 2026-10-31: "make coach profile cards show the full byline too". The coach's cards ask the
// shared card for the member profile's byline (onAuthorPage: face, name, coach tier, time; the name
// opens nothing on their own page), with the page's avatar and the tier keyed by the id the posts are
// listed by.
test('the coach\'s activity cards carry the full byline: their face, name and tier', async () => {
  const had = { card: window.BSActivityCard, sheets: window.useBSCardSheets };
  const seen = [];
  window.BSActivityCard = (props) => { seen.push(props); return React.createElement('div', { 'data-probe-card': '' }, props.a.title); };
  window.useBSCardSheets = () => ({ ctx: {}, renderSheets: () => null });
  try {
    reset({ posts: [{ key: 'n1', title: 'Note 1', typeLabel: 'Note', ago: '1d', body: 'Body', statsRow: [], breakdown: null }] });
    const m = await mount(page({ person: { ...maya, photo: 'https://cdn.test/maya.jpg' } }));
    await tab('Activity');
    assert.ok(seen.length, 'no card drawn');
    const p = seen[seen.length - 1];
    assert.equal(p.onAuthorPage, true, 'the full byline, its name not a link');
    assert.ok(!p.hideAuthor, 'the slim byline (the time alone) is back');
    assert.equal(p.variant, 'magazine');
    assert.equal(p.ctx.ownerPhoto, 'https://cdn.test/maya.jpg', 'the page\'s own avatar');
    assert.deepEqual(Object.keys(p.ctx.tierByUser), ['u-maya'], 'the tier keyed by the id the posts are listed by');
    await m.unmount();
  } finally { window.BSActivityCard = had.card; window.useBSCardSheets = had.sheets; }
});

// Codex on #2566 (P2): Nora's account setup writes a coach's headline and About from her sheet, over
// their own page. The page reads its own doc as it opens, so it kept the old About until reopened.
// After a setup card is confirmed or undone the app announces the kinds it wrote
// (services/userGoalsRefresh.mjs); the own page reads profile_custom again, and nothing else does.
test('⚠ the coach\'s own page reads their doc again when Nora\'s account setup changes it', async () => {
  const { bsAnnounceUserGoals } = await import('../mobile-app/src/services/userGoalsRefresh.mjs');
  reset({ me: 'u-maya', custom: null, stored: { about: { story: 'Before Nora.' }, look: { paper: 'dark', accent: 'teal' } } });
  let reads = 0;
  const realGet = window.shapeDb.getUserGoals;
  window.shapeDb.getUserGoals = async (k, opts) => { if (k === 'profile_custom') reads += 1; return realGet(k, opts); };
  try {
    const m = await mount(page({ isSelf: true }));
    await click(button(/^About me$/));
    const story = () => document.querySelector('[data-about-tab] [data-about="story"]').textContent;
    assert.match(story(), /Before Nora\./);
    assert.equal(reads, 1);
    world.stored = { about: { story: 'After Nora.' }, look: { paper: 'dark', accent: 'teal' } };
    await act(async () => { bsAnnounceUserGoals(['client_settings', 'client_goals'], window); });
    await flush();
    assert.equal(reads, 1, 'an announcement of other documents reads nothing here');
    await act(async () => { bsAnnounceUserGoals(['profile_custom'], window); });
    await flush();
    assert.equal(reads, 2, 'read again, bound to the account as before');
    assert.deepEqual(world.readWith, { expectedUserId: 'u-maya' });
    assert.match(story(), /After Nora\./, 'the About on screen is the one now stored');
    await m.unmount();
  } finally { window.shapeDb.getUserGoals = realGet; }
});
