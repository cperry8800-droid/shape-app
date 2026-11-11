// The Coaches page is the coach marketplace (owner, 2026-11-05: "The marketplace is awesome. Right
// now I have the website set up as coaches page marketing towards them, but what you designed makes
// much more sense. So lets change that whole concept and turn coaches page into what you built.").
//
// What this file holds, each one a defect the old marketplace shipped (the 2026-11-04 audit):
//   · the pages: Coaches.html runs marketplace.jsx, the coaches' pitch moved to ForCoaches.html, and
//     Marketplace.html forwards with its query and hash;
//   · one source each for the tier (the profile's ladder), the price unit and the rating;
//   · no made-up rating: every listing is rated by its reviews or reads "New";
//   · a listing with no Shape account says "Not bookable yet" and is out of the match count;
//   · live listings go through the same goals and filters as the sample coaches;
//   · signed out, Message asks for a sign-in instead of opening a chat;
//   · the quick view shows a rating, never a review's words;
//   · the copy the audit found false is gone.
//
// The page is mounted from its shipping file in jsdom with real React, against a fake listing read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ND = join(ROOT, 'public/newdesign');
const read = (f) => readFileSync(join(ND, f), 'utf8');
const require = createRequire(import.meta.url);
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/Coaches.html' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.React = React;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.HTMLElement.prototype.scrollIntoView = function () {};
// The page mounts itself into #root as it loads; the mount is a no-op here and the test mounts it.
globalThis.ReactDOM = { createRoot: () => ({ render() {} }) };
const SRC = read('marketplace.jsx');
const mk = await loadRealModule(join(ND, 'marketplace.jsx'), {
  appendExports: 'Object.assign(exports, { Marketplace, CoachCard, MkQuickView, mapLiveCoach, mkPriceOf, mkCoachTier, mkRating10, mkRatingLabel, mkIsRated, mkKind, mkCanBook, mkIntroHref, mkProfileHref, mkGoalsOf, mkPass, MK_DEFAULTS, MK_GOALS, MK_COACH_LADDER, COACHES_FULL, mkTabFromHash, mkReadOpenTimes, mkEachLimited, MkCompare, mkMeetLabel: typeof mkMeetLabel === "function" ? mkMeetLabel : null });',
});
const { createRoot } = require('react-dom/client');
globalThis.ReactDOM = require('react-dom');

// Two of production's seeded rows as the anon read returns them (2026-11-05), and one account.
const SEEDED = { id: 4, name: 'Damon Clarke', specialty: 'Cardio & Endurance', category: 'cardio', price: 44.99, rating: 4.8, subscribers: 890, experience: '10 yrs', credential: 'CSCS', tags: ['Cardio', 'HIIT', 'Endurance'], owner_id: null, session_price: null, at_capacity: false, verified: false };
const SEEDED_2 = { id: 8, name: 'Leah Kim', specialty: 'HIIT & Weight Loss', category: 'hiit', price: 34.99, rating: 4.8, subscribers: 3200, experience: '5 yrs', credential: 'ACE-CPT', tags: ['HIIT', 'Weight Loss'], owner_id: null, session_price: null, at_capacity: false, verified: false };
const NUTRI = { id: 102, name: 'James Okafor', specialty: 'Weight Management', category: 'weightloss', price: 44.99, meal_plan_price: 19, rating: null, experience: '9 yrs', credential: 'RD', tags: ['Weight Loss'], services: ['Habit coaching'], owner_id: null };
const OWNED = { id: 31, name: 'Tess Owner', specialty: 'Strength & Hypertrophy', category: 'strength', price: 160, session_price: 95, rating: 4.8, experience: '6 yrs', credential: 'NSCA-CSCS', tags: ['Strength'], owner_id: 'u-tess', at_capacity: false, verified: true };

test('the pages: Coaches.html is the marketplace, ForCoaches.html the pitch, Marketplace.html forwards', () => {
  const coaches = read('Coaches.html');
  assert.match(coaches, /src="marketplace\.jsx/);
  assert.match(coaches, /src="pageShell\.jsx/);
  assert.match(coaches, /src="bookingSlots\.js"/, 'the open intro times need BookingSlots');
  assert.doesNotMatch(coaches, /coaches\.jsx/);
  // The homepage's three faces, each with the axes the page sets.
  assert.match(coaches, /family=Anybody:wdth,wght@50\.\.150,100\.\.900/);
  assert.match(coaches, /family=Doto:ROND,wght@/);
  assert.match(coaches, /family=Schibsted\+Grotesk/);
  const pitch = read('ForCoaches.html');
  assert.match(pitch, /src="coaches\.jsx/);
  assert.match(pitch, /<title>Shape — For coaches<\/title>/);
  const old = read('Marketplace.html');
  assert.match(old, /location\.replace\('Coaches\.html' \+ location\.search \+ location\.hash\)/, 'the old address drops its query or hash');
  assert.match(stripComments(SRC), /<Header active="Coaches" \/>/, 'the Coaches tab does not light on its own page');
});

test('one ladder: the card\'s tier is the profile\'s (livingShared.jsx LV_LADDER.coach)', () => {
  const m = /coach: (\[\[0, "Certified"[^\n]*\]\]),/.exec(read('livingShared.jsx'));
  assert.ok(m, 'LV_LADDER.coach moved');
  const ladder = JSON.parse(m[1]).map(([p, name, color]) => [p, name, color]);
  assert.deepEqual(mk.MK_COACH_LADDER, ladder);
  assert.equal(mk.mkCoachTier({ points: 3060 }).name, 'Elite');
  assert.equal(mk.mkCoachTier({ points: null }), null, 'a listing with no points behind it shows a tier');
  assert.equal(mk.mkCoachTier(mk.mapLiveCoach(SEEDED, 'Trainer')), null);
});

test('a listing is rated by its reviews or not at all: no 4.8 fallback', () => {
  for (const row of [SEEDED, OWNED]) {
    const c = mk.mapLiveCoach(row, 'Trainer');
    assert.equal(c.rating, null);
    assert.equal(c.ratingLive, true);
    assert.equal(mk.mkRatingLabel(c), 'New', row.name + ' carries a rating nobody gave');
    assert.equal(mk.mkIsRated(c), false);
  }
  const reviewed = { ...mk.mapLiveCoach(OWNED, 'Trainer'), rating10: 8.4, reviewCount: 12 };
  assert.equal(mk.mkRatingLabel(reviewed), '★ 8.4/10');
  // A sample keeps its example number, doubled to the ten-point scale.
  assert.equal(mk.mkRating10(mk.COACHES_FULL.find((c) => c.name === 'Maya Okafor')), 9.94);
});

test('one price unit: per session from a session price, per month otherwise, a nutritionist per month', () => {
  assert.deepEqual(mk.mkPriceOf(mk.mapLiveCoach(OWNED, 'Trainer')), { amount: 95, per: 'session' });
  assert.deepEqual(mk.mkPriceOf(mk.mapLiveCoach(SEEDED, 'Trainer')), { amount: 45, per: 'month' }, 'a monthly price read per session');
  assert.deepEqual(mk.mkPriceOf(mk.mapLiveCoach(NUTRI, 'Nutritionist')), { amount: 45, per: 'month' }, 'a nutritionist priced by the meal plan');
  for (const c of mk.COACHES_FULL) assert.equal(mk.mkPriceOf(c).per, c.tag === 'Nutritionist' ? 'month' : 'session', c.name);
});

test('who can book: an account, not at capacity; a listing with no account and a sample cannot', () => {
  const seeded = mk.mapLiveCoach(SEEDED, 'Trainer');
  const owned = mk.mapLiveCoach(OWNED, 'Trainer');
  const sample = mk.COACHES_FULL[0];
  assert.deepEqual([mk.mkKind(seeded), mk.mkKind(owned), mk.mkKind(sample)], ['listing', 'live', 'example']);
  assert.deepEqual([mk.mkCanBook(seeded), mk.mkCanBook(owned), mk.mkCanBook(sample)], [false, true, false]);
  assert.equal(mk.mkCanBook(mk.mapLiveCoach({ ...OWNED, at_capacity: true }, 'Trainer')), false, 'a full coach counted as bookable');
  // The intro books where the profile books it; a sample has no such flow and opens its profile.
  assert.equal(mk.mkIntroHref(owned), '/newdesign/consultation.html?type=trainer&id=31&name=Tess%20Owner');
  assert.equal(mk.mkIntroHref(sample), mk.mkProfileHref(sample));
  assert.equal(mk.mkProfileHref(owned), 'MemberProfile.html?u=u-tess&role=trainer');
  // The listing tables give a visitor no location or format: unknown, never "Remote".
  assert.equal(seeded.city, null);
  assert.equal(seeded.format, null);
});

test('live listings go through the same goals and filters as the samples', () => {
  const withGoals = (c) => ({ ...c, goals: mk.mkGoalsOf(c) });
  const cardio = withGoals(mk.mapLiveCoach(SEEDED, 'Trainer'));
  const f = (patch) => ({ ...mk.MK_DEFAULTS, ...patch });
  assert.equal(mk.mkPass(cardio, f({ goals: ['strength'] })), false, 'a cardio listing passed the Strength goal (the old page skipped every filter for live rows)');
  assert.equal(mk.mkPass(cardio, f({ goals: ['endurance'] })), true);
  assert.equal(mk.mkPass(cardio, f({ meet: 'inperson' })), false, 'a listing that says nothing about format passed In person');
  assert.equal(mk.mkPass(cardio, f({ city: 'Brooklyn, NY' })), false, 'a listing with no city passed a city');
  assert.equal(mk.mkPass(cardio, f({ maxMonth: 40 })), false, 'a $45 a month listing passed a $40 monthly budget');
  assert.equal(mk.mkPass(cardio, f({ role: 'Nutritionist' })), false);
  assert.equal(mk.mkPass(cardio, f({ intro: true })), false, 'a listing with no account offers a free intro');
});

async function mountPage({ rows = [], me = null, availability = null, profile = null } = {}) {
  const calls = { chat: 0 };
  window.__openChat = () => { calls.chat += 1; };
  const client = {
    from: (table) => ({ select: () => ({ eq: () => Promise.resolve({ data: rows.filter((r) => (table === 'nutritionists') === ('services' in r || 'meal_plan_price' in r)), error: null }) }) }),
    rpc: (name) => Promise.resolve({ data: name === 'get_public_profile' && profile ? [profile] : [] }),
  };
  window.shapeEnsureDb = () => Promise.resolve({ client });
  globalThis.fetch = window.fetch = async (url) => {
    if (String(url).startsWith('/api/me')) return { ok: !!me, json: async () => (me ? { user: me } : {}) };
    if (availability && String(url).startsWith('/api/availability')) return { ok: true, json: async () => availability };
    return { ok: false, json: async () => ({}) };
  };
  window.Header = () => null; window.Footer = () => null;
  globalThis.Header = window.Header; globalThis.Footer = window.Footer;
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(mk.Marketplace)));
  await React.act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return { calls, unmount: () => React.act(async () => root.unmount()) };
}
const text = () => document.body.textContent.replace(/\s+/g, ' ');
const click = (el) => React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });

test('the page: listings without an account are not bookable and out of the count, nothing rated 9.6', async () => {
  const m = await mountPage({ rows: [SEEDED, SEEDED_2, NUTRI] });
  assert.equal(document.querySelector('.mk-count').textContent, '0', 'a listing that cannot take a booking was counted');
  assert.match(text(), /Also showing \d+ example coaches and 3 listings not bookable yet\./);
  const listings = [...document.querySelectorAll('[data-kind="listing"]')];
  // The first page shows the bookable and example coaches first; the listings follow, so page on.
  let more = [...document.querySelectorAll('button')].find((b) => /^Show \d+ more$/.test(b.textContent));
  while (more) { await click(more); more = [...document.querySelectorAll('button')].find((b) => /^Show \d+ more$/.test(b.textContent)); }
  const all = [...document.querySelectorAll('[data-kind="listing"]')];
  assert.ok(all.length === 3 && all.length >= listings.length, 'the three listings did not render');
  for (const card of all) {
    assert.match(card.textContent, /Not bookable yet/);
    assert.match(card.textContent, /No reviews yet/);
    assert.doesNotMatch(card.textContent, /9\.6/);
    assert.ok(!card.querySelector('[data-book-intro]'), 'a listing with no account offers Book a free intro');
  }
  assert.match(text(), /Example coaches/, 'the sample coaches are not labelled');
  await m.unmount();
});

// Owner, 2026-11-09, of the matcher's Goal list: "make sure all goals are here and this actually
// works". It offered the six fold goals, so most of what coaches on Shape list (Hyrox, running,
// prenatal, gut health, plant-based…) could only be found as General fitness. Every one of the app
// marketplace's categories, read from the app itself, now has a specific goal that finds it.
test('every coach category in the app has a goal of its own, and the matcher lists every goal', async () => {
  const app = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx'), 'utf8');
  const block = /const BSM_MARKETPLACE_CATEGORIES = \{([\s\S]*?)\n\};/.exec(app);
  assert.ok(block, "could not read the app's marketplace categories");
  let n = 0;
  for (const [, side, list] of block[1].matchAll(/(Trainer|Nutritionist): \[([^\]]*)\]/g)) {
    for (const [, cat] of list.matchAll(/'([^']+)'/g)) {
      if (cat === 'All Categories') continue;
      n++;
      const goals = [...mk.mkGoalsOf({ role: cat, category: cat, specialties: [], tag: side })];
      const specific = goals.filter((g) => g !== 'general');
      assert.ok(specific.length, `${side} category "${cat}" finds only General fitness (${goals.join(', ')})`);
    }
  }
  assert.equal(n, 21, `read ${n} app categories, not 21 — the parse drifted`);
  // The goals that belong to one side never match the other.
  const nutri = mk.mkGoalsOf({ role: 'Gut Health & Functional Nutrition', category: 'Gut Health & Functional Nutrition', specialties: [], tag: 'Nutritionist' });
  assert.ok(!nutri.has('functional'), "a nutritionist's Functional Nutrition matched the trainers' Functional & hybrid");
  assert.ok(nutri.has('gut'));
  const trainer = mk.mkGoalsOf({ role: 'Strength & Resistance', category: 'Strength & Resistance', specialties: [], tag: 'Trainer' });
  assert.ok(!mk.MK_GOALS.filter((g) => g.nu).some((g) => trainer.has(g.id)), 'a trainer matched a nutrition-only goal');

  // The fold keeps its six cards; the matcher's Goal list carries every goal.
  const m = await mountPage({ rows: [SEEDED, SEEDED_2, NUTRI] });
  assert.equal(document.querySelectorAll('.mk-goal').length, 6, 'the fold should keep its six goal cards');
  // Owner, 2026-11-11: the Goal dropdown stays, "just the scroll bar" goes. The browser's select can't hide the
  // bar its open list draws, so the Goal is the page's own list, as the city's is: no select in the matcher.
  assert.ok(!document.querySelector('.mk-matcher select'), 'the matcher still uses the browser select for the goal');
  const box = document.querySelector('.mk-matcher [role="combobox"][aria-label="Goal"]');
  assert.ok(box, 'the Goal list');
  assert.equal(box.querySelector('.v').textContent, 'Any goal');
  await click(box);
  const list = document.getElementById(box.getAttribute('aria-controls'));
  assert.ok(list && list.getAttribute('role') === 'listbox', 'the Goal list opens');
  assert.ok(list.closest('.mk-city.hero'), 'it is the city\'s list, opening upward in the hero, scrolling with no bar');
  const opts = [...list.querySelectorAll('[role="option"]')];
  assert.equal(opts[0].textContent, 'Any goal✓');
  const label = (id) => mk.MK_GOALS.find((g) => g.id === id).label;
  assert.deepEqual(opts.slice(1).map((o) => o.textContent).sort(), mk.MK_GOALS.map((g) => g.label).sort(), 'the matcher does not list every goal');
  // Training and nutrition apart, under their headings, as the select's optgroups were.
  const groups = [...list.querySelectorAll('[role="group"]')];
  assert.deepEqual(groups.map((g) => document.getElementById(g.getAttribute('aria-labelledby')).textContent), ['Training', 'Nutrition']);
  assert.deepEqual([...groups[1].querySelectorAll('[role="option"]')].map((o) => o.textContent).sort(), mk.MK_GOALS.filter((g) => g.nu).map((g) => g.label).sort());
  // And picking one from the list narrows the results: of the three rows, only James Okafor is weight management.
  await click(opts.find((o) => o.textContent === label('weight')));
  assert.ok(!document.getElementById(box.getAttribute('aria-controls')), 'a pick closes it');
  assert.equal(box.querySelector('.v').textContent, label('weight'), 'the pick shows');
  assert.ok(box.querySelector('svg'), 'with the goal\'s icon');
  assert.match(text(), /and 1 listing not bookable yet\./, 'Weight management kept listings that are not weight-management coaches');
  // Any goal clears it.
  await click(box);
  await click(document.getElementById(box.getAttribute('aria-controls')).querySelector('[role="option"]'));
  assert.equal(box.querySelector('.v').textContent, 'Any goal');
  assert.ok(!box.querySelector('svg'), 'Any goal has no icon');
  await m.unmount();
});

test('the page: picking a goal applies to live listings too', async () => {
  const m = await mountPage({ rows: [SEEDED, SEEDED_2, NUTRI] });
  const goal = [...document.querySelectorAll('.mk-goal')].find((b) => /Endurance/.test(b.textContent));
  await click(goal);
  assert.match(text(), /and 1 listing not bookable yet\./, 'Endurance kept listings that are not endurance coaches');
  await m.unmount();
});

test('signed out, Message asks for a sign-in; the quick view shows a rating, never review words', async () => {
  const m = await mountPage({ rows: [] });
  await click(document.querySelector('.mk-quickhit'));
  const qv = document.querySelector('.mk-qv');
  assert.ok(qv, 'the quick view did not open');
  const message = [...qv.querySelectorAll('button')].find((b) => /Message/.test(b.textContent));
  await click(message);
  assert.equal(m.calls.chat, 0, 'signed out, Message opened a chat');
  assert.match(qv.textContent, /Sign in to message/);
  assert.ok([...qv.querySelectorAll('a')].some((a) => /^\/newdesign\/Login\.html\?next=/.test(a.getAttribute('href'))), 'no way to sign in');
  assert.match(qv.textContent, /Here you see the rating only\./);
  await m.unmount();
});

test('signed in, Message on a coach with an account opens the chat with that coach', async () => {
  const me = { id: 'u-me', email: 'me@shape.test' };
  const m = await mountPage({ rows: [OWNED], me });
  const card = document.querySelector('[data-kind="live"]');
  assert.ok(card, 'the account\'s card did not render');
  await click(card.querySelector('.mk-quickhit'));
  const message = [...document.querySelector('.mk-qv').querySelectorAll('button')].find((b) => /Message/.test(b.textContent));
  await click(message);
  assert.equal(m.calls.chat, 1);
  assert.equal(document.querySelector('.mk-count').textContent, '1');
  await m.unmount();
});

test('what the audit found false is gone, and stays gone', () => {
  const code = stripComments(SRC);
  for (const [re, why] of [
    [/Updated hourly/i, 'nothing on the page updates hourly'],
    [/FeaturedCity|Featured in/, 'Featured City advertised coaches that did not exist'],
    [/isLeadBoosted|useActiveLeadBoost/, 'a boost was applied to demo coaches by name'],
    [/row\.rating \|\| 4\.8/, 'the made-up rating'],
    [/images\.unsplash\.com/, 'hot-linked covers'],
    [/30% faster|sub-3 last season|Olympic endurance athletes/, 'unverified performance claims'],
    [/not by who paid for placement/, 'the placement promise the boosts contradicted'],
  ]) assert.doesNotMatch(code, re, why);
  // Sticky works on this page: `clip` in place of pageShell's `hidden`, scoped to it.
  assert.match(SRC, /@supports \(overflow-x:clip\)\{html\.mk-root,html\.mk-root body\{overflow-x:clip\}\}/);
  assert.match(code, /document\.documentElement\.classList\.add\("mk-root"\)/);
});

test('the side a link names: #hash or ?role=, and Both by default', () => {
  assert.equal(mk.mkTabFromHash('#nutritionists'), 'Nutritionist');
  assert.equal(mk.mkTabFromHash('trainer'), 'Trainer');
  assert.equal(mk.mkTabFromHash('#results'), null, 'an unknown hash picked a side');
  assert.match(SRC, /\|\| "Both" \}\)\);/, 'the page does not open on Both');
});

// Codex on #2619: a full coach whose intros at capacity are off offers no intro times, so it can't
// pass "Open this week" or rank as the soonest intro; on, the times stand. The rule comes back with
// the times, so the card can tell intros apart from paid-client capacity.
test('a full coach with intros at capacity off has no open intro times', async () => {
  const slot = { iso: '2026-11-06T14:00:00.000Z', ms: Date.parse('2026-11-06T14:00:00.000Z') };
  window.BookingSlots = { buildSlots: () => [slot], isZone: () => true };
  const answer = (body) => { globalThis.fetch = window.fetch = async () => ({ ok: true, json: async () => body }); };
  const owned = mk.mapLiveCoach(OWNED, 'Trainer');
  const base = { slots: [{ day: 4, start: '09:00', end: '12:00' }], booked: [], busy: [], timezone: 'America/New_York' };
  answer({ ...base, atCapacity: true, rules: { introsAtCapacity: false } });
  assert.deepEqual(await mk.mkReadOpenTimes(owned), { times: [], introsAtCap: false }, 'a full coach kept bookable intro times');
  answer({ ...base, atCapacity: true, rules: {} });
  assert.deepEqual(await mk.mkReadOpenTimes(owned), { times: [], introsAtCap: false }, 'the default (no rule) is intros off at capacity');
  answer({ ...base, atCapacity: true, rules: { introsAtCapacity: true } });
  assert.deepEqual(await mk.mkReadOpenTimes(owned), { times: [slot], introsAtCap: true }, 'intros at capacity on: the times and the rule stand');
  answer({ ...base, atCapacity: false, rules: {} });
  assert.deepEqual(await mk.mkReadOpenTimes(owned), { times: [slot], introsAtCap: false });
  answer(null);
  assert.equal(await mk.mkReadOpenTimes(owned), null, 'a failed read made up times');
});

// Codex on #2619 (second pass): with intros at capacity on, a full coach keeps its intro times AND
// Book a free intro, passes Free intro, and still fails Taking new clients; off, a waiting list only.
test('full: intros at capacity on keeps Book a free intro; off, the waiting list', async () => {
  const soon = new Date(Date.now() + 86400000); soon.setHours(10, 0, 0, 0);
  const slot = { iso: soon.toISOString(), ms: soon.getTime() };
  const full = mk.mapLiveCoach({ ...OWNED, at_capacity: true }, 'Trainer');
  const withGoals = (c) => ({ ...c, goals: mk.mkGoalsOf(c), openTimes: [slot] });
  const f = (patch) => ({ ...mk.MK_DEFAULTS, ...patch });
  const card = async (c) => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = createRoot(document.getElementById('root'));
    await React.act(async () => root.render(React.createElement(mk.CoachCard, { c, onCompare() {}, onQuick() {} })));
    const el = document.querySelector('.mk-cc');
    const out = { book: !!el.querySelector('[data-book-intro]'), text: el.textContent };
    await React.act(async () => root.unmount());
    return out;
  };
  const on = withGoals({ ...full, introsAtCap: true });
  assert.equal(on.atCapacity, true);
  const a = await card(on);
  assert.equal(a.book, true, 'a full coach who takes intros lost Book a free intro');
  assert.match(a.text, /Full · free intro open/);
  assert.match(a.text, /next intro/);
  assert.doesNotMatch(a.text, /waiting list/i, 'a full coach who takes intros was sent to the waiting list');
  assert.equal(mk.mkPass(on, f({ intro: true })), true, 'Free intro dropped a coach whose intros are open');
  assert.equal(mk.mkPass(on, f({ openWeek: true })), true);
  assert.equal(mk.mkPass(on, f({ taking: true })), false, 'a full coach passed Taking new clients');
  assert.equal(mk.mkCanBook(on), true);
  const off = withGoals({ ...full, introsAtCap: false });
  const b = await card(off);
  assert.equal(b.book, false, 'a full coach with intros off offers Book a free intro');
  assert.match(b.text, /Join waiting list/);
  assert.equal(mk.mkPass(off, f({ intro: true })), false);
  assert.equal(mk.mkPass(off, f({ openWeek: true })), false, 'times a full coach cannot take passed Open this week');
  assert.equal(mk.mkCanBook(off), false);
});

// Codex on #2619 (second pass): the page itself carries the rule from the availability read onto the
// coach, so a full coach who takes intros shows Book a free intro on its card, not the waiting list.
test('the page: a full coach\'s intros rule reaches its card', async () => {
  const soon = new Date(Date.now() + 86400000); soon.setHours(10, 0, 0, 0);
  const slot = { iso: soon.toISOString(), ms: soon.getTime() };
  window.BookingSlots = { buildSlots: () => [slot], isZone: () => true };
  const base = { slots: [{ day: 4, start: '09:00', end: '12:00' }], booked: [], busy: [], timezone: 'America/New_York', atCapacity: true };
  const full = { ...OWNED, at_capacity: true };
  const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  let m = await mountPage({ rows: [full], availability: { ...base, rules: { introsAtCapacity: true } } });
  await settle();
  let card = document.querySelector('[data-kind="live"]');
  assert.ok(card, 'the account\'s card did not render');
  assert.ok(card.querySelector('[data-book-intro]'), 'the intros rule never reached the card: a full coach who takes intros lost Book a free intro');
  assert.match(card.textContent, /Full · free intro open/);
  await m.unmount();
  m = await mountPage({ rows: [full], availability: { ...base, rules: {} } });
  await settle();
  card = document.querySelector('[data-kind="live"]');
  assert.ok(!card.querySelector('[data-book-intro]'), 'a full coach with intros off offers Book a free intro');
  assert.match(card.textContent, /Join waiting list/);
  await m.unmount();
});

// Codex on #2704: the place a coach writes in Edit profile (get_public_profile.location) is their card's
// city; a listing row has none.
test('the page: an account\'s card shows the location written in Edit profile', async () => {
  const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  let m = await mountPage({ rows: [OWNED], profile: { user_id: OWNED.owner_id, location: '  Brooklyn, NY ' } });
  await settle();
  let card = document.querySelector('[data-kind="live"]');
  assert.ok(card, 'the account\'s card did not render');
  assert.match(card.textContent, /Brooklyn, NY/, 'the account\'s location never reached its card');
  await m.unmount();
  m = await mountPage({ rows: [OWNED], profile: { user_id: OWNED.owner_id, location: null } });
  await settle();
  card = document.querySelector('[data-kind="live"]');
  assert.doesNotMatch(card.textContent, /Brooklyn/, 'a card with no location made one up');
  await m.unmount();
});

// Owner, 2026-11-11: "coaches should be able to customize how their page appears publicly ... This
// should also effect the marketplace card as well". An account's card takes the look its coach set for
// their page (get_public_profile.custom, through the kit): the paper and accent, the climb background's
// wash, their own cover photo and the spot they dragged it to.
test('the page: an account\'s card takes its coach\'s look: paper, accent, wash, cover and its spot', async () => {
  const K = await import('../public/newdesign/coachProfileKit.mjs');
  window.ShapeCoachKit = K;
  const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  const { BS_SUPABASE_HOST } = await import('../public/newdesign/listingMedia.mjs');
  const OWN = `https://${BS_SUPABASE_HOST}/storage/v1/object/public/community-photos/u-tess/cover.jpg`;
  const OTHER = `https://${BS_SUPABASE_HOST}/storage/v1/object/public/community-photos/u-other/cover.jpg`;
  const custom = { look: { paper: 'light', accent: 'blue', focus: 'bottom', pos: { x: 30, y: 70 } }, climbBg: 'dusk', cover: { image: OWN } };
  const card = () => document.querySelector('[data-kind="live"]');
  const prop = (name) => card().style.getPropertyValue(name);
  try {
    let m = await mountPage({ rows: [OWNED], profile: { user_id: OWNED.owner_id, can_view: true, custom } });
    await settle();
    assert.ok(card(), 'the account\'s card did not render');
    const pal = K.bsCoachPagePalette(custom.look, 'trainer');
    assert.equal(card().getAttribute('data-paper'), 'light');
    assert.ok(card().hasAttribute('data-light'));
    assert.equal(prop('--card'), pal.PAPER, 'the card is the coach\'s paper');
    assert.equal(prop('--fg'), pal.INK);
    assert.equal(prop('--fg-3'), pal.INK_MUTED);
    assert.equal(prop('--teal'), pal.ACCENT, 'the card\'s accent');
    assert.equal(prop('--draw'), pal.DRAW);
    assert.equal(prop('--cv-acc'), pal.ACCENT_DARK, 'the badge on the photo keeps a readable accent');
    assert.equal(prop('--role-text'), pal.CTA_TEXT);
    assert.equal(prop('--card-wash'), K.BS_CLIMB_BGS.dusk, 'the climb background');
    const img = card().querySelector('.mk-cover img');
    assert.ok(img, 'the coach\'s cover');
    assert.equal(img.getAttribute('src'), OWN);
    assert.equal(img.style.objectPosition, '30% 70%', 'the spot the coach dragged it to');
    assert.match(card().querySelector('.mk-topo').innerHTML, /var\(--draw, #34d6c5\)/, 'the drawing takes the card\'s accent');
    assert.ok(card().querySelector('[data-book-intro]'), 'the booking is still there');
    await m.unmount();
    // A metallic paper keeps its sheen on the card, as on the coach's page (Codex on #2706).
    m = await mountPage({ rows: [OWNED], profile: { user_id: OWNED.owner_id, can_view: true, custom: { look: { paper: 'steel' } } } });
    await settle();
    assert.equal(card().getAttribute('data-paper'), 'steel');
    assert.equal(prop('--card-sheen'), K.BS_METAL_SHEEN, 'the steel card lost its sheen');
    assert.equal(prop('--card'), K.BS_COACH_PAPERS.steel.paper);
    await m.unmount();
    // A stop with no dragged spot is the stage's stop.
    m = await mountPage({ rows: [OWNED], profile: { user_id: OWNED.owner_id, can_view: true, custom: { look: { focus: 'top' }, cover: { image: OWN } } } });
    await settle();
    assert.equal(card().querySelector('.mk-cover img').style.objectPosition, 'center 22%');
    assert.ok(!card().hasAttribute('data-paper'), 'a stop alone is no colour pick');
    await m.unmount();
    // An accent alone keeps the Climb's dark card.
    m = await mountPage({ rows: [OWNED], profile: { user_id: OWNED.owner_id, can_view: true, custom: { look: { accent: 'rose' } } } });
    await settle();
    assert.equal(card().getAttribute('data-paper'), 'climb');
    assert.equal(prop('--card'), '', 'an accent alone changed the card\'s paper');
    assert.equal(prop('--teal'), K.bsCoachPagePalette({ accent: 'rose' }, 'trainer').ACCENT);
    await m.unmount();
    // No pick (or the editor's seed), a locked card, another account's photo, a key that is no wash:
    // the Climb's card.
    for (const profile of [
      { user_id: OWNED.owner_id, can_view: true, custom: { look: { paper: 'dark', accent: 'teal' } } },
      { user_id: OWNED.owner_id, can_view: false, custom },
      { user_id: OWNED.owner_id, can_view: true, custom: { cover: { image: OTHER } } },
      { user_id: OWNED.owner_id, can_view: true, custom: { climbBg: '__proto__' } },
      { user_id: OWNED.owner_id, can_view: true, custom: 'junk' },
    ]) {
      m = await mountPage({ rows: [OWNED], profile });
      await settle();
      const label = JSON.stringify(profile);
      assert.ok(!card().hasAttribute('data-paper'), label);
      assert.equal(card().getAttribute('style'), null, label);
      const im = card().querySelector('.mk-cover img');
      assert.ok(!(im && /u-other|u-tess/.test(im.getAttribute('src') || '')), `${label}: a cover the card may not show`);
      await m.unmount();
    }
  } finally {
    delete window.ShapeCoachKit;
  }
});

// Codex on #2619: every account's times are read, not the first 24, and never more than six at once.
test('open times are read for every account, six at a time', async () => {
  let live = 0; let peak = 0; const seen = [];
  const items = Array.from({ length: 40 }, (_, i) => i);
  await mk.mkEachLimited(items, 6, async (i) => {
    live += 1; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 1));
    seen.push(i); live -= 1;
  });
  assert.equal(seen.length, 40, 'an account past a cap was skipped');
  assert.deepEqual([...seen].sort((a, b) => a - b), items);
  assert.ok(peak <= 6, 'more than six reads at once: ' + peak);
  assert.ok(!/owned\.slice\(0,\s*\d+\)/.test(SRC.replace(/\/\/.*$/gm, '')), 'a cap on the accounts whose times are read is back');
});

// Owner, 9 Nov: the city and open intro this week at the top of the filters, compact, and the city list
// with no scrollbar: Shape's own list in place of the browser's select.
test('the filters: city and open intro this week first, the city picked from a list with no scrollbar', async () => {
  const m = await mountPage({ rows: [SEEDED, SEEDED_2, NUTRI] });
  const filters = document.querySelector('.mk-filters');
  const top = filters.querySelector('[data-mk-top]');
  assert.ok(top, 'the top block');
  assert.equal(top.previousElementSibling && top.previousElementSibling.querySelector('input[type="search"]') ? 'search' : 'other', 'search', 'right under the search');
  assert.ok(top.querySelector('[role="combobox"][aria-label="City"]') && top.querySelector('[role="switch"]'), 'the city and the open-intro switch');
  assert.ok(!document.querySelector('select[aria-label="City"]'), 'no browser select for the city');
  const heads = [...filters.querySelectorAll('.mk-rg-h')].map((h) => h.textContent);
  assert.ok(!heads.some((h) => /^City|^Availability/.test(h)), 'no City or Availability section further down');
  const box = top.querySelector('[role="combobox"]');
  assert.equal(box.getAttribute('aria-expanded'), 'false');
  await click(box);
  const list = document.getElementById(box.getAttribute('aria-controls'));
  assert.ok(list && list.getAttribute('role') === 'listbox', 'the list opens');
  assert.match(SRC, /\.mk-city-l\{[^}]*overflow-y:auto;scrollbar-width:none[^}]*\}\n\s+\.mk-city-l::-webkit-scrollbar\{display:none\}/, 'it scrolls with no bar');
  // The hero clips what leaves it and its matcher is its last row: there the list opens upward (Codex P2 on #2658;
  // measured in Chromium at 1440 and 390, the open list inside the hero).
  assert.match(SRC, /\.mk-hero\{[^}]*overflow:hidden/);
  assert.match(SRC, /\.mk-city\.hero \.mk-city-l\{top:auto;bottom:calc\(100% \+ 6px\);/, 'the hero list opens upward');
  assert.ok(document.querySelector('.mk-hero .mk-city.hero [role="combobox"]'), 'the hero uses the same list');
  const opts = [...list.querySelectorAll('[role="option"]')];
  assert.equal(opts[0].textContent, 'Anywhere✓');
  const city = opts[1];
  const name = city.textContent;
  await click(city);
  assert.ok(!document.getElementById(box.getAttribute('aria-controls')), 'a pick closes it');
  assert.equal(box.querySelector('.v').textContent, name, 'the pick shows');
  await React.act(async () => { box.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
  assert.equal(box.getAttribute('aria-expanded'), 'true', '↓ opens it');
  await React.act(async () => { box.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true })); });
  await React.act(async () => { box.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  assert.equal(box.querySelector('.v').textContent, 'Anywhere', 'Home and Enter pick Anywhere');
  await m.unmount();
});

// Codex P2 on #2658: the browser's select let a keyboard user type a city's first letter to jump to it; the
// custom list keeps that, as a select does: closed, typing picks; open, it moves the highlight.
test('the city picker keeps a select\'s type-ahead: a letter jumps, the same letter again moves on, letters typed fast match a prefix', async () => {
  const m = await mountPage({ rows: [SEEDED, SEEDED_2, NUTRI] });
  const box = document.querySelector('.mk-top [role="combobox"]');
  const key = (k) => React.act(async () => { box.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true })); });
  await click(box);
  const cities = [...document.getElementById(box.getAttribute('aria-controls')).querySelectorAll('[role="option"]')].map((o) => o.textContent.replace('✓', '')).slice(1);
  await click(box);
  // A letter two or more cities start with.
  const letter = [...new Set(cities.map((c) => c[0]))].find((l) => cities.filter((c) => c[0] === l).length >= 2);
  assert.ok(letter, 'the sample cities share a first letter');
  const withIt = cities.filter((c) => c[0] === letter);
  await key(letter.toLowerCase());
  assert.equal(box.querySelector('.v').textContent, withIt[0], 'closed: the letter picks the first city with it');
  assert.equal(box.getAttribute('aria-expanded'), 'false');
  await new Promise((r) => setTimeout(r, 750));
  await key(letter);
  assert.equal(box.querySelector('.v').textContent, withIt[1], 'the same letter again moves on to the next');
  // Open: a prefix typed fast moves the highlight to the city that starts with it, and Enter picks it.
  await new Promise((r) => setTimeout(r, 750));
  await key('ArrowDown');
  const target = withIt[0];
  for (const ch of target.slice(0, 3)) await key(ch);
  const active = document.getElementById(box.getAttribute('aria-activedescendant'));
  assert.equal(active ? active.textContent.replace('✓', '') : null, target, 'the highlight on the city the prefix names');
  await key('Enter');
  assert.equal(box.querySelector('.v').textContent, target);
  await m.unmount();
});

// ── Owner, 2026-11-11: "every coach should have remote listed"; a tap anywhere on the card opens its quick
// view "minus when you click the book free intro and view boxes"; and the Compare sheet improved ──────────
test('every coach is listed remote: in person reads In person + remote, none stated reads Remote', () => {
  const byFormat = (format) => mk.mkMeetLabel({ format });
  assert.equal(byFormat('In-person'), 'In person + remote');
  assert.equal(byFormat('Hybrid'), 'In person + remote');
  assert.equal(byFormat('Remote'), 'Remote');
  assert.equal(byFormat(null), 'Remote', 'a live listing with no format is not listed remote');
  // The Remote filter keeps every coach; In person still narrows; a city still narrows.
  const f = (patch) => ({ ...mk.MK_DEFAULTS, ...patch });
  const withGoals = (c) => ({ ...c, goals: mk.mkGoalsOf(c) });
  const inPerson = withGoals(mk.COACHES_FULL.find((c) => c.format === 'In-person'));
  const live = withGoals(mk.mapLiveCoach(SEEDED, 'Trainer'));
  assert.equal(mk.mkPass(inPerson, f({ meet: 'remote' })), true, 'an in-person coach was left out of Remote');
  assert.equal(mk.mkPass(live, f({ meet: 'remote' })), true, 'a live coach was left out of Remote');
  assert.equal(mk.mkPass(live, f({ meet: 'inperson' })), false);
  assert.equal(mk.mkPass(inPerson, f({ city: inPerson.city === 'Lisbon' ? 'Miami' : 'Lisbon' })), false, 'a city no longer narrows the list');
  // The website's coach page and the app's say the same of a coach who meets in person.
  const web = readFileSync(join(ROOT, 'public/newdesign/coachProfileWeb.jsx'), 'utf8');
  assert.match(web, /const howSaid = !aboutDoc \|\| !aboutDoc\.how \? "" : aboutDoc\.how === "online" \? "Remote" : "In person \+ remote";/);
  const app = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), 'utf8');
  assert.doesNotMatch(app, /profile:climb\.howInPerson|profile:about\.howInPerson/, 'the app still says in person alone');
});

test('a tap anywhere on a coach card opens its quick view, save on View, Book a free intro and Compare', async () => {
  const c = { ...mk.COACHES_FULL.find((x) => x.format === 'In-person'), key: 'k1' };
  c.goals = mk.mkGoalsOf(c);
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root'));
  const seen = { quick: 0, compare: 0 };
  await React.act(async () => root.render(React.createElement(mk.CoachCard, { c, onCompare() { seen.compare += 1; }, onQuick() { seen.quick += 1; } })));
  const card = document.querySelector('.mk-cc');
  assert.match(card.textContent, /In person \+ remote/, 'the card lists no remote');
  for (const sel of ['.mk-why', '.mk-plates', '.mk-meta', '.mk-creds', '.mk-cover', '.mk-roleb']) {
    const before = seen.quick;
    await click(card.querySelector(sel));
    assert.equal(seen.quick, before + 1, `a tap on ${sel} did not open the quick view`);
  }
  const before = seen.quick;
  // Links are stopped from navigating in jsdom's eyes; what matters is that the card did not also open.
  for (const a of card.querySelectorAll('.mk-acts a')) { a.addEventListener('click', (e) => e.preventDefault()); await click(a); }
  await click(card.querySelector('.mk-cmp'));
  assert.equal(seen.quick, before, 'View, Book a free intro or Compare opened the quick view');
  assert.equal(seen.compare, 1);
  assert.ok(card.classList.contains('tap'), 'the card does not show it can be tapped');
  await React.act(async () => root.unmount());
});

test('Compare marks the best of a row it can rank, and folds away the rows every coach answers the same', async () => {
  const pick = (name) => ({ ...mk.COACHES_FULL.find((x) => x.name === name), key: name });
  const list = [pick('Leo Martins'), pick('Diego Alvarez'), pick('Rhea Kapoor')];
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(mk.MkCompare, { list, onClose() {}, onRemove() {} })));
  const row = (label) => [...document.querySelectorAll('.mk-cmp-t tbody tr')].find((tr) => tr.querySelector('th').textContent === label);
  const bestOf = (label) => { const r = row(label); return r ? [...r.querySelectorAll('td')].findIndex((td) => td.hasAttribute('data-best')) : 'gone'; };
  assert.equal(bestOf('Price'), 2, 'the lowest price ($70, Rhea) is not marked');
  assert.equal(bestOf('Experience'), 0, 'the most years (8, Leo) is not marked');
  assert.equal(bestOf('City'), -1, 'a row that cannot be ranked marked a best');
  assert.match(row('How you meet').textContent, /In person \+ remote/);
  // Only what differs: Tier, Free intro and Verified are the same for all three.
  const diff = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Only what differs');
  assert.ok(diff, 'no way to see only what differs');
  await click(diff);
  assert.equal(diff.getAttribute('aria-pressed'), 'true');
  for (const gone of ['Tier', 'Free intro', 'Verified by Shape']) assert.equal(row(gone), undefined, `${gone} is the same for all and still shows`);
  assert.ok(row('Price') && row('City'));
  assert.match(document.querySelector('.mk-cmp-same').textContent, /rows are the same for all 3/);
  // Book a free intro and View stay on one line: the actions do not wrap.
  assert.match(SRC, /\.mk-cmp-t \.act\{display:flex;gap:8px\}/);
  await React.act(async () => root.unmount());
});
