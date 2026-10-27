// The trainer profile (owner, 2026-10-27: "trainer profiles are good to go"), MOUNTED:
// mobile-app/src/broadsheet/BSTrainerProfile.jsx and its editor BSMakeItYours.jsx in the real
// broadsheet chrome, against scripted profile, listing, availability and booking backends, reading
// the real English catalogs (a key missing from them fails here rather than falling back).
//
// What it pins: the words follow the pronouns the coach wrote (never their name), the day shows
// the times the listing books and only "busy" for the rest, a booking sends what the marketplace
// sends, the storefront never prints a price the coach did not set, the page is painted in the
// coach's own colours, and the editor saves its three keys onto the doc as it is at save time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsCoachPronoun } from '../mobile-app/src/services/coachPronoun.mjs';
import { bsStudioFromTemplate } from '../mobile-app/src/services/studioKit.mjs';

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
    booked: null, bookError: null, saved: null, stored: null, me: 'u-me',
    ...over,
  };
}
reset();
window.ShapeAuth = { getCachedState: () => ({ user: { id: world.me } }) };
window.ShapeProfiles = { getPublicProfile: async () => ({ name: 'Maya Okafor', pronouns: world.pronouns, bio: 'I teach people to lift well.', points: 6200, custom: world.custom, can_view: world.canView }) };
window.ShapeCoachListing = { publicByOwner: async () => world.provider };
window.ShapeCoachAvailability = { get: async () => ({ slots: world.slots, booked: [], busy: world.busy, rules: world.rules, timezone: ZONE, atCapacity: world.atCapacity }) };
window.ShapeCoachReviews = { forOwner: async () => ({ reviews: [], avg: 0, count: 0 }) };
window.ShapeCoachPlans = { salePlansByUser: async () => [] };
window.ShapeFollows = { stats: async () => ({ isFollowing: false, isPending: false }), toggle: async () => ({ isFollowing: true }), getCached: () => null };
window.ShapeCommunity = { listByAuthor: async () => ({ data: world.posts }) };
window.shapeDb = { getUserGoals: async () => world.stored, saveUserGoals: async (k, d) => { world.saved = { k, d }; return { ok: true }; } };
window.ShapeBookings = { submitConsultationBooking: async (a) => { if (world.bookError) throw world.bookError; world.booked = a; return { ok: true }; } };
window.bsProfileCardFromPost = (p) => p;
// The client module's storefront, as a probe: it records what the page hands it.
window.useBSCoachCommerce = ({ person }) => ({ commerce: person.commerce, commerceCoach: person.commerce && person.commerce.coach, atCapacity: !!(person.commerce && person.commerce.atCapacity), wl: null });
window.BSCoachCoachingBlock = ({ cm }) => React.createElement('div', { 'data-coaching-block': '' }, cm.commerce.packages.map((p) => `${p.name} ${p.price}`).join(' '));

const maya = { userId: 'u-maya', who: 'Maya Okafor', kind: 'TRAINER' };
const page = (props = {}) => React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
  React.createElement(BSTrainerProfile, { person: maya, onBack: () => {}, onMessage: () => {}, ...props }));

test('the words follow the pronouns the coach wrote, else their first name', async () => {
  assert.equal(bsCoachPronoun('she/her'), 'her');
  assert.equal(bsCoachPronoun('He / him'), 'him');
  assert.equal(bsCoachPronoun('they/them'), 'them');
  for (const v of ['', null, 'ze/zir', 'any', 'shee']) assert.equal(bsCoachPronoun(v), null, String(v));
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
  assert.equal(document.querySelector('[data-coaching-block]'), null);
  assert.match(m.text(), /hasn't listed prices on Shape yet/);
  assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /\$/);
  await m.unmount();
});

test('a visitor sees a tab only when it has something in it; a private profile shows none', async () => {
  reset();
  let m = await mount(page());
  assert.ok(button(/^Her day$/));
  assert.equal(button(/^The studio$/), undefined);
  assert.equal(button(/^Replays$/), undefined);
  await m.unmount();
  reset({ custom: { studio: { kind: 'gym', where: 'Fishtown', items: bsStudioFromTemplate('gym') } }, posts: [{ key: 'p1', title: 'Heavy squat day', ago: '2d', statsRow: [], breakdown: { label: 'Sets', rows: [['Set 1', '100 kg × 5', '']] } }] });
  m = await mount(page());
  await click(button(/^The studio$/));
  assert.ok(document.querySelectorAll('[data-station]').length >= 5, 'the stations are numbered');
  await click(button(/^Replays$/));
  assert.equal(document.querySelectorAll('[data-replay]').length, 1);
  await m.unmount();
  reset({ canView: false });
  m = await mount(page());
  assert.equal(button(/^Her day$/), undefined);
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

test('Make it yours saves look, cover and studio onto the doc as it is at save time', async () => {
  // The doc changed elsewhere since the page read it: a bio and a wall the editor never saw.
  reset({ me: 'u-maya', custom: null, stored: { bio: 'Saved elsewhere', wall: [], look: { paper: 'dark', accent: 'teal' } } });
  const m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click(document.querySelector('[data-paper="sage"]'));
  await click(document.querySelector('[data-accent="green"]'));
  await click(button(/^Your space$/));
  await click(document.querySelector('[data-kind="gym"]'));
  await click(button(/^Cardio$/));
  await click(document.querySelector('[data-kit="treadmill"]'));
  await click(button(/^Done$/));
  await click(document.querySelector('[data-save-mine]'));
  assert.ok(world.saved, 'saved');
  assert.equal(world.saved.k, 'profile_custom');
  const doc = world.saved.d;
  assert.equal(doc.bio, 'Saved elsewhere', 'a key saved elsewhere is kept');
  assert.deepEqual(doc.look, { paper: 'sage', accent: 'green', focus: 'center' });
  assert.equal(doc.studio.kind, 'gym');
  assert.equal(doc.studio.items.length, bsStudioFromTemplate('gym').length + 1, 'the layout and the added treadmill');
  assert.ok(doc.studio.items.some((p) => p.st && p.st.title === 'Squat racks'), 'the layout\'s words, in English here');
  assert.equal('cover' in doc, false, 'no wall photo, no cover key');
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
  assert.equal(button(/^Message Maya$/), undefined);
  await m.unmount();
});
