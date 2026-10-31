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
window.ShapeProfiles = { getPublicProfile: async () => ({ name: 'Maya Okafor', pronouns: world.pronouns, bio: 'I teach people to lift well.', points: 6200, custom: world.custom, can_view: world.canView }) };
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
window.BSCoachCoachingBlock = ({ cm }) => React.createElement('div', { 'data-coaching-block': '' }, cm.commerce.packages.map((p) => `${p.name} ${p.price}`).join(' '));

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
});

test('a visitor sees a tab only when it has something in it; a private profile shows none', async () => {
  reset();
  let m = await mount(page());
  assert.ok(button(/^Her day$/));
  assert.ok(!button(/^The studio$/), 'no studio tab without a studio');
  assert.ok(!button(/^Replays$/), 'no replays tab without replays');
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
  assert.deepEqual(world.readWith, { expectedUserId: 'u-maya' }, 'the read is bound to the account that opened the editor');
  assert.deepEqual(world.saved.opts, { expectedUserId: 'u-maya' }, 'and so is the save');
  await m.unmount();
});

// Owner, 2026-10-31: "coaches should be able to add custom additional eqipment or kitchen stations".
test('Make it yours: a coach adds a piece of their own, named and sized, and it is saved with its name', async () => {
  reset({ me: 'u-maya', custom: null, stored: { look: { paper: 'dark', accent: 'teal' } } });
  const m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click(button(/^Your space$/));
  await click(document.querySelector('[data-kind="gym"]'));
  const before = document.querySelectorAll('[data-studio-plan] [data-piece]').length;
  await click(document.querySelector('[data-kit="custom"]'));
  assert.ok(document.querySelector('[data-own-piece]'), 'the tile opens its form');
  await click(document.querySelector('[data-own-add]'));
  assert.match(document.querySelector('[data-own-piece]').textContent, /Give it a name first\./, 'a nameless piece is asked for its name, in the form');
  await type(document.querySelector('[data-own-piece] input'), 'Sandbag wall');
  await click(document.querySelector('[data-own-size="l"]'));
  await click(document.querySelector('[data-own-add]'));
  assert.ok(!document.querySelector('[data-own-piece]'), 'the form closes');
  assert.equal(document.querySelectorAll('[data-studio-plan] [data-piece]').length, before + 1, 'it drops onto the plan');
  assert.match(document.querySelector('[data-piece-panel]').textContent, /Sandbag wall/, 'selected, under its own name');
  await click(button(/^Done$/));
  await click(document.querySelector('[data-save-mine]'));
  const mine = world.saved.d.studio.items.filter((p) => p.t === 'custom');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].label, 'Sandbag wall');
  assert.deepEqual([mine[0].w, mine[0].h], [110, 64], 'the size it was given');
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
    await click(button(/^Close$/));
    await click(button(/^The studio$/));
    assert.match(m.text(), /Full gym/);
    const stations = document.querySelectorAll('[data-station]');
    assert.equal(stations.length, 8, 'the full gym\'s stations');
    await click(stations[0]);
    assert.match(document.querySelector('[role="dialog"]').textContent, /Most sessions start here/);
    await click(button(/^Close$/));
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
    await click(button(/^The studio$/));
    assert.match(m.text(), /Garage gym/, 'a studio that fits HIIT');
    assert.ok(document.querySelectorAll('[data-station]').length >= 4);
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

test('a demo saved in Make it yours keeps only what was changed, so the studio still follows the language (Codex P2 on #2486)', async () => {
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
    // Now Spanish: the station names are the template's, in the reader's language.
    lang = 'es';
    window.ShapeI18n.t = (key, opts) => (key === 'profile:studio.word.squatRacks' ? 'Racks de sentadilla' : hadT(key, opts));
    await act(async () => { for (const fn of subs) fn(); });
    await flush();
    await click(button(/^The studio$/));
    assert.match(m.text(), /Racks de sentadilla/, 'the studio follows the language after a colours-only save');
    const probe = document.createElement('div'); probe.style.background = window.makePalette({ paperMode: 'sage', accentKey: 'teal' }).PAPER_BG;
    assert.equal(document.querySelector('[data-trainer-profile]').style.background, probe.style.background, 'and the saved paper stays');
    await m.unmount();
  } finally { window.ShapeLocale = hadLocale; window.ShapeI18n.t = hadT; client.restore(); }
});

test('their activity: what they posted that the tabs do not already show, newest three then See all; a sample has its own', async () => {
  // Owner, 2026-10-30: "there is also no activity feed on coaches profile".
  const note = (i) => ({ key: `n${i}`, title: `Note ${i}`, typeLabel: 'Note', ago: `${i}d`, body: `Body ${i}`, statsRow: [], breakdown: null });
  reset({ posts: [note(1), { key: 'p1', title: 'Heavy squat day', ago: '2d', statsRow: [], breakdown: { label: 'Sets', rows: [['Set 1', '100 kg × 5', '']] } }, note(2), note(3), note(4)] });
  let m = await mount(page());
  const feed = document.querySelector('[data-activity]');
  assert.ok(feed, 'the feed');
  assert.match(feed.textContent, /Maya's activity/);
  const titles = () => [...feed.querySelectorAll('[data-activity-card]')].map((c) => (c.textContent.match(/Note \d/) || [''])[0]);
  assert.deepEqual(titles(), ['Note 1', 'Note 2', 'Note 3'], 'newest three; the logged session stays in Replays');
  assert.ok(!/Heavy squat day/.test(feed.textContent));
  await click(feed.querySelector('[data-activity-all]'));
  assert.deepEqual(titles(), ['Note 1', 'Note 2', 'Note 3', 'Note 4']);
  assert.ok(!feed.querySelector('[data-log-activity]'), 'no Log activity on another coach\'s page');
  const reviews = document.querySelector('[data-reviews-strip]');
  if (reviews) assert.ok(feed.compareDocumentPosition(reviews) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'above the reviews');
  await m.unmount();
  // Nothing posted: no feed for a visitor.
  reset({ posts: [] });
  m = await mount(page());
  assert.ok(!document.querySelector('[data-activity]'));
  await m.unmount();
  // A private profile shows none.
  reset({ posts: [note(1)], canView: false });
  m = await mount(page());
  assert.ok(!document.querySelector('[data-activity]'));
  await m.unmount();
  // A sample coach: its own run and note.
  reset({ me: 'u-me', byId: leahRow, slots: [] });
  m = await mount(page({ person: leah }));
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
    // From the likers sheet.
    await click(document.querySelector('[data-liker]'));
    assert.equal(document.querySelector('[data-public-profile]')?.getAttribute('data-public-profile'), 'u-sam', 'the liker\'s profile');
    assert.ok(!document.querySelector('[data-activity]'), 'over the coach page');
    await click(document.querySelector('[data-public-message]'));
    assert.deepEqual(messaged, ['u-sam'], 'Message on their profile messages them');
    await click(document.querySelector('[data-public-back]'));
    assert.ok(document.querySelector('[data-activity]') && !document.querySelector('[data-public-profile]'), 'Back to the coach page');
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


// ── Replays: programs with their free video, workouts on video, sessions; the studio's work ─────
// Owner, 2026-10-29: "There needs to be videos in replays of specific workouts or programs. The
// layout of the gym floor needs to include coaches workouts based on those machines."
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

test('Replays: each program with its free video, its weeks and first week, and Buy through the storefront\'s checkout', async () => {
  reset({ salePlans: [STRONG, MEAL, ROWER] });
  let m = await mount(page());
  await tab('Replays');
  const cards = [...document.querySelectorAll('[data-program]')];
  assert.equal(cards.length, 2, 'programs only, never a meal plan');
  assert.match(cards[0].textContent, /\$79/);
  assert.match(cards[0].textContent, /Strong in 12/);
  assert.match(cards[0].textContent, /12 weeks · 2 days a week · Preview video/);
  assert.match(cards[0].textContent, /MON Squat · WED Press/);
  assert.match(cards[1].textContent, /8 weeks/, 'no video and no poster: the weeks in its place');
  // A free program has no checkout (Codex on #2508): Work with in place of Buy.
  await click(cards[1]);
  assert.ok(!document.querySelector('[data-program-buy]'), 'no Buy · Free');
  assert.ok(button(/^Work with Maya$/));
  await click(button(/^Close$/));
  await click(cards[0]);
  const sheet = document.querySelector('[data-program-sheet]');
  assert.ok(sheet);
  const video = sheet.querySelector('[data-program-video] video');
  assert.ok(video, 'the free video plays in the sheet');
  assert.equal(video.getAttribute('src'), CLIP);
  assert.match(sheet.textContent, /The first week/);
  assert.match(sheet.textContent, /Back squat · Dumbbell row/);
  assert.match(sheet.textContent, /Bench press · Face pull · ＋1/, 'a day\'s moves past the names kept say how many');
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
    await tab('Replays');
    await click(document.querySelector('[data-program]'));
    await click(document.querySelector('[data-program-buy]'));
    assert.equal(world.bought, undefined);
    await m.unmount();
  } finally { delete window.bsRequireAccount; }
  // The coach on their own page sees what members see, with no Buy.
  reset({ me: 'u-maya', salePlans: [STRONG] });
  m = await mount(page({ isSelf: true }));
  await tab('Replays');
  await click(document.querySelector('[data-program]'));
  assert.ok(!document.querySelector('[data-program-buy]'), 'no Buy on their own program');
  assert.match(document.querySelector('[data-program-sheet]').textContent, /This is what members see before they buy\./);
  await m.unmount();
});

test('Replays: workouts posted on video play in the sheet; sessions keep their sets', async () => {
  const V2 = 'https://abcd.supabase.co/storage/v1/object/public/coach-media/u-maya/v2.mp4';
  reset({ posts: [
    { key: 'v1', title: 'Squat walkthrough', body: 'Brace, then sit between the hips.', video: CLIP, ago: '2d' },
    { key: 's1', title: 'Heavy triples', breakdown: { label: 'Working sets', rows: [['Set 1', '100 kg × 3', 'RPE 6']] }, ago: '3d' },
    { key: 's2', title: 'Pulls on film', video: V2, breakdown: { label: 'Sets', rows: [['Set 1', '150 kg × 3', 'RPE 7'], ['Set 2', '160 kg × 3', 'RPE 8']] }, ago: '4d' },
    { key: 'x1', title: 'Insecure link', video: 'http://example.com/v.mp4', ago: '5d' },
  ] });
  const m = await mount(page());
  await tab('Replays');
  const workouts = [...document.querySelectorAll('[data-workout]')];
  assert.deepEqual(workouts.map((w) => w.textContent.includes('Squat walkthrough') ? 'v1' : w.textContent.includes('Pulls on film') ? 's2' : '?'), ['v1', 's2'], 'https videos only');
  assert.equal(document.querySelectorAll('[data-replay]').length, 1, 'a session with a video is a workout, not listed twice');
  await click(workouts[0]);
  assert.equal(document.querySelector('[data-replay-video] video').getAttribute('src'), CLIP);
  assert.match(document.body.textContent, /Workout · 2d/);
  assert.ok(!button(/^Next →$/), 'no sets, no stepper');
  await click(button(/^Close$/));
  await click(workouts[1]);
  assert.equal(document.querySelector('[data-replay-video] video').getAttribute('src'), V2);
  assert.ok(button(/^Next →$/), 'its sets step through');
  await m.unmount();
});

test('the studio: each piece shows the moves of the coach\'s programs done on it, and the programs pinned to a station', async () => {
  const studio = { kind: 'gym', where: 'Portland', items: [
    { t: 'rack', x: 20, y: 40, w: 78, h: 46, st: { title: 'Squat rack', note: 'Heavy sets.', pins: [STRONG.id, '99999999-2222-4333-8444-555555555555'] } },
    { t: 'dumbbells', x: 20, y: 200, w: 120, h: 16 },
    { t: 'dumbbells', x: 20, y: 230, w: 120, h: 16 },
    // A zone round both racks holds their moves, but is not a piece to tap.
    { t: 'zone', x: 10, y: 190, w: 150, h: 70, tag: 'Free weights' },
    { t: 'speaker', x: 200, y: 20, w: 22, h: 22 },
    { t: 'rower', x: 260, y: 300, w: 18, h: 76 },
  ] };
  reset({ custom: { studio }, salePlans: [STRONG, ROWER] });
  const m = await mount(page());
  await tab('The studio');
  assert.equal(document.querySelectorAll('[data-station]').length, 1);
  const marks = [...document.querySelectorAll('[data-piece]')];
  assert.equal(marks.length, 3, 'both dumbbell racks and the rower; never the speaker or the zone');
  assert.match(marks[0].getAttribute('aria-label'), /Dumbbell rack: 1 move from the programs/);
  const rows = [...document.querySelectorAll('[data-floor-row]')];
  assert.equal(rows.length, 2, 'the two dumbbell racks are one row');
  assert.match(rows[0].textContent, /Dumbbell rack ×2/);
  assert.match(rows[0].textContent, /1 move · Strong in 12/);
  assert.match(rows[1].textContent, /Rower/);
  await click(document.querySelector('[data-station]'));
  const pinned = document.querySelector('[data-pinned]');
  assert.ok(pinned);
  assert.equal(pinned.querySelectorAll('[data-piece-program]').length, 1, 'a pin to a program no longer published is left out');
  assert.match(document.querySelector('[data-piece-moves]').textContent, /Strong in 12.*Back squat · Bench press/);
  await click(document.querySelector('[data-piece-moves] [data-piece-program]'));
  const sheet = document.querySelector('[data-program-sheet]');
  assert.ok(sheet, 'a program opens from the studio');
  assert.match(sheet.querySelector('[data-program-where]').textContent, /On Maya's floor.*Squat rack · Dumbbell rack/);
  await m.unmount();
});

test('Make it yours pins the coach\'s published programs to a station, three at most', async () => {
  const PROGS = [0, 1, 2, 3].map((i) => ({ ...STRONG, id: `1111111${i}-2222-4333-8444-555555555555`, name: `Program ${i + 1}` }));
  // Two pins to programs no longer published: they don't fill the station, and go at the next change.
  const GONE = ['99999990-2222-4333-8444-555555555555', '99999991-2222-4333-8444-555555555555'];
  const studio = { kind: 'gym', items: [{ t: 'rack', x: 20, y: 40, w: 78, h: 46, st: { title: 'Squat rack', note: '', pins: GONE } }] };
  reset({ me: 'u-maya', custom: null, stored: { studio }, salePlans: PROGS });
  const m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click(button(/^Your space$/));
  const piece = document.querySelector('g[role="button"]');
  await act(async () => { piece.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await flush();
  const pins = () => [...document.querySelectorAll('[data-pin]')];
  assert.deepEqual(pins().map((b) => b.textContent), ['Program 1', 'Program 2', 'Program 3', 'Program 4']);
  for (const i of [0, 1, 2, 3]) await click(pins()[i]);
  assert.match(m.text(), /Up to 3 programs on a station\./);
  assert.deepEqual(pins().map((b) => b.getAttribute('aria-pressed')), ['true', 'true', 'true', 'false']);
  await click(pins()[1]);
  await click(button(/^Done$/));
  await click(document.querySelector('[data-save-mine]'));
  assert.deepEqual(world.saved.d.studio.items[0].st.pins, [PROGS[0].id, PROGS[2].id]);
  await m.unmount();
});

// Owner, 2026-10-30: "Translate all sample text". A sample read in German: its programs, workouts,
// replays and station notes in the German catalog's words, and nothing left in the English. Their
// ages too (owner, 2026-10-30: "Yes, translate the short ages too").
test('a sample trainer\'s page reads in the reader\'s language: programs, workouts, replays and the studio\'s notes', async () => {
  const de = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/de/profile.json'), 'utf8'));
  const deCommon = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/de/common.json'), 'utf8'));
  const hadT = window.ShapeI18n.t;
  window.ShapeI18n.t = (key, opts = {}) => (key.startsWith('profile:sample.') ? new IntlMessageFormat(de[key.slice('profile:'.length)], 'de-DE').format(opts)
    : key.startsWith('common:age.') ? new IntlMessageFormat(deCommon[key.slice('common:'.length)], 'de-DE').format(opts)
    : hadT(key, opts));
  try {
    reset({ me: 'u-me', byId: leahRow, slots: [] });
    const m = await mount(page({ person: leah }));
    await tab('Replays');
    const text = m.text();
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

test('a sample coach\'s programs open with no Buy, and the coach\'s own Replays post a workout video in the composer\'s Video', async () => {
  reset({ me: 'u-me', byId: leahRow, slots: [] });
  let m = await mount(page({ person: leah }));
  await tab('Replays');
  const names = [...document.querySelectorAll('[data-program]')].map((b) => b.textContent);
  assert.equal(names.length, 2);
  assert.match(names[0], /Engine 8/, 'a HIIT coach\'s sample programs');
  // The generated sample clips: two workouts on video, and each program plays one.
  const workouts = [...document.querySelectorAll('[data-workout]')].map((b) => b.textContent);
  assert.equal(workouts.length, 2);
  assert.match(workouts.join(' '), /Rower pacing/);
  assert.match(workouts.join(' '), /Kettlebell swings/);
  await click(document.querySelector('[data-program]'));
  assert.ok(document.querySelector('[data-program-video]'), 'the sample program plays its clip');
  assert.ok(!document.querySelector('[data-program-buy]'), 'nothing is sold on a sample');
  assert.ok(button(/^Work with Leah$/));
  await m.unmount();
  const had = window.BSLogActivitySheet;
  window.BSLogActivitySheet = (props) => ((world.composer = props.startKind || null), React.createElement('div', { 'data-composer': '' }));
  try {
    reset({ me: 'u-maya' });
    m = await mount(page({ isSelf: true }));
    await tab('Replays');
    await click(document.querySelector('[data-post-video]'));
    assert.equal(world.composer, 'video');
    await m.unmount();
  } finally { window.BSLogActivitySheet = had; }
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /function BSLogActivitySheet\(\{ c, INK, BG, onClose, onPosted, editPost = null, startKind = null \}\)/);
  assert.match(client, /: \(\['note', 'photo', 'video', 'workout', 'milestone', 'link'\]\.includes\(startKind\) \? startKind : 'note'\);/, 'a new post opens on the kind asked for');
  assert.match(client, /BSSearchCorner, bsOpenCheckout, bsStartPlatformCheckout \}\);/, 'the checkout opener is on window for the profile');
});
