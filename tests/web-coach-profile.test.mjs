// The website's coach profile in the app profile's design (public/newdesign/coachProfileWeb.jsx,
// its kit coachProfileKit.mjs). What a visitor sees at a trainer's or nutritionist's public page
// (MemberProfile.html) is the app's BSTrainerProfile laid out for the web: the wall and who they
// are, the tabs ({Name}'s day · About me · The studio or kitchen · Replays or Plate notes ·
// Activity), What clients say, and Work with. These pin its structure, that Subscribe and Buy run
// through the old page's one path with the code box before the redirect, that a referral link opens
// on the storefront, that a coach with no account is the app's sample, and that what the website
// shares with the app is the same code, not a copy.
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

// ── The kit ──────────────────────────────────────────────────────────────────────────────────
test('the coach\'s colours are the app\'s, value for value (iosAppBroadsheet.jsx makePalette)', () => {
  const src = read('mobile-app/src/broadsheet/iosAppBroadsheet.jsx');
  const lift = (name) => {
    const at = src.indexOf(`const ${name} = {`);
    assert.ok(at > 0, `${name} moved in the app`);
    let depth = 0;
    for (let i = src.indexOf('{', at); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && !--depth) return new Function(`return ${src.slice(src.indexOf('{', at), i + 1)};`)();
    }
    throw new Error(`${name} never closed`);
  };
  assert.deepEqual(JSON.parse(JSON.stringify(K.BS_COACH_PAPERS)), lift('PAPERS'), 'a paper stock drifted from the app');
  assert.deepEqual(JSON.parse(JSON.stringify(K.BS_COACH_ACCENTS)), lift('accents'), 'an accent drifted from the app');
  // Every look Make it yours can save has a stock and an accent here.
  for (const p of K.bsProfileLook ? ['dark', 'bone', 'oxblood', 'manila', 'carbon'] : []) assert.ok(K.BS_COACH_PAPERS[p], p);
});

test('a trainer is teal and a nutritionist amber until they pick; a mono accent flips to read', () => {
  assert.equal(K.bsCoachPalette({}, 'trainer').ACCENT, '#34d6c5');
  assert.equal(K.bsCoachPalette({}, 'nutritionist').ACCENT, '#e3a544');
  assert.equal(K.bsCoachPalette({ paper: 'bone', accent: 'rust' }, 'trainer').ACCENT, '#a8331b', 'a light stock takes the light accent');
  assert.equal(K.bsCoachPalette({ paper: 'white', accent: 'white' }).ACCENT, '#000000', 'white on white reads as black');
  assert.equal(K.bsCoachPalette({ paper: 'carbon', accent: 'black' }).ACCENT, '#ffffff');
  assert.equal(K.bsCoachPalette({ paper: 'nonsense' }).PAPER, '#0f0e0c', 'an unknown stock is the dark paper');
  assert.equal(K.bsOnColor('#34d6c5'), '#0b0d0c');
  assert.equal(K.bsOnColor('#a8331b'), '#ffffff');
});

test('the words for a coach follow the pronouns they wrote, or their first name', () => {
  assert.deepEqual(K.bsCoachWords('her', 'Maya'), { day: 'Her day', work: 'Work with her', kitchen: 'Her kitchen' });
  assert.deepEqual(K.bsCoachWords(null, 'Quinn'), { day: "Quinn's day", work: 'Work with Quinn', kitchen: "Quinn's kitchen" });
  assert.equal(K.bsCoachWords(K.bsCoachPronoun('they/them'), 'Sam').day, 'Their day');
});

test('a post becomes the card its tab reads, and nothing is invented', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const session = K.bsCoachCardFromRow({ id: 9, title: 'Squat day', note: 'Moved well.', created_at: '2026-10-30T12:00:00Z', privacy: 'public',
    metrics: { kind: 'workout', setLogs: [{ moveName: 'Back squat', setNumber: 1, actualLoad: '100 kg', actualReps: 5, rpe: 8 }, { moveName: 'Back squat', setNumber: 2, completed: false }] } }, now);
  assert.equal(session.kind, 'session');
  assert.deepEqual(session.breakdown, { label: 'Back squat · sets', rows: [['Set 1', '100 kg × 5', 'RPE 8']] }, 'a skipped set is not a set');
  assert.equal(session.ago, '2d');
  const meal = K.bsCoachCardFromRow({ id: 3, metrics: { kind: 'meal', p: 41, kcal: '' }, created_at: '2026-10-31T08:00:00Z' }, now);
  assert.deepEqual(meal.meal, { kcal: null, p: 41, c: null, f: null, recipeId: '' }, 'a macro the meal did not carry is null, never 0');
  assert.equal(K.bsCoachCardFromRow({ id: 4, title: 'hi', note: 'just text' }), null, 'a plain text post is not a profile card');
  const bad = K.bsCoachCardFromRow({ id: 5, photo_url: 'javascript:alert(1)', metrics: { kind: 'photo', video_url: 'http://x.test/v.mp4', link: { url: 'data:text/html,x' } } });
  assert.equal(bad.photo, null); assert.equal(bad.video, null, 'only https video'); assert.equal(bad.link, null);
  const video = K.bsCoachCardFromRow({ id: 6, title: 'Deadlift set-up', metrics: { kind: 'video', video_url: 'https://cdn.test/v.mp4' } });
  assert.equal(video.kind, 'video');
  assert.equal(K.bsWorkoutVideos([video]).length, 1, 'a workout on video reaches Replays through the app\'s own reader');
});

test('one day\'s rows: open times that start on it and busy time that overlaps it, today from now', () => {
  const day = new Date(2026, 10, 2);
  const at = (h, m = 0) => new Date(2026, 10, 2, h, m).getTime();
  const rows = K.bsCoachDayRows({
    day, now: at(9),
    open: [{ iso: new Date(at(8)).toISOString(), ms: at(8) }, { iso: new Date(at(10)).toISOString(), ms: at(10) }, { ms: at(26) }],
    busy: [{ start: new Date(at(7)).toISOString(), end: new Date(at(8)).toISOString(), kind: 'session' }, { start: new Date(at(11)).toISOString(), end: new Date(at(12)).toISOString(), kind: 'time_off' }, { start: new Date(at(23)).toISOString(), end: new Date(at(25)).toISOString(), kind: 'session' }],
  });
  assert.deepEqual(rows.map((r) => [r.kind, new Date(r.at).getHours()]), [['open', 10], ['away', 11], ['busy', 23]]);
  assert.equal(rows[2].end, at(24), 'busy time running past midnight ends with the day');
});

test('what the website shares with the app is the same code, not a copy', async () => {
  for (const [mobile, canonical, name] of [
    ['coachWork.mjs', 'coachWork.mjs', 'bsCoachPrograms'], ['studioKit.mjs', 'studioKit.mjs', 'bsStudioSvg'], ['planPreview.mjs', 'planPreview.mjs', 'bsPlanPreview'],
    ['planOutline.mjs', 'planOutline.mjs', 'bsAssignSplitBlock'], ['coachPronoun.mjs', 'coachPronoun.mjs', 'bsCoachPronoun'], ['trainerDemo.mjs', 'trainerDemo.mjs', 'bsTrainerDemo'],
  ]) {
    const m = await import(`../mobile-app/src/services/${mobile}`);
    const c = await import(`../public/newdesign/${canonical}`);
    assert.equal(m[name], c[name], `${mobile} re-exports the canonical ${name}`);
    assert.match(read(`mobile-app/src/services/${mobile}`), /export \* from '\.\.\/\.\.\/\.\.\/public\/newdesign\//, `${mobile} is a re-export, not a second copy`);
  }
  assert.equal(K.bsPlateNoteDays, (await import('../public/newdesign/coachWork.mjs')).bsPlateNoteDays);
  // The nutritionist sample: the app hands in its kitchen catalog; the website has none and draws
  // the sample without recipes, never a recipe it cannot show.
  const app = (await import('../mobile-app/src/services/nutritionistDemo.mjs')).bsNutritionistDemo({});
  const web = K.bsNutritionistDemo({});
  assert.ok(app.custom.kitchen.recipes.length > 0, 'the app\'s sample keeps its recipes');
  assert.equal(web.custom.kitchen.recipes.length, 0);
  assert.deepEqual(web.custom.kitchen.staples, app.custom.kitchen.staples);
  assert.deepEqual(web.plates.map((p) => p.title), app.plates.map((p) => p.title));
});

// ── The page, mounted ────────────────────────────────────────────────────────────────────────
const vc = new VirtualConsole();
const navigations = [];
vc.on('jsdomError', (e) => { if (/navigation/i.test(String(e && e.message))) navigations.push(e.message); else console.error(e); });
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/MemberProfile.html?u=coach-1&role=trainer', virtualConsole: vc });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;
globalThis.ReactDOM = require('react-dom');
let WIDE = true;
window.matchMedia = () => ({ get matches() { return WIDE; }, addEventListener() {}, removeEventListener() {} });
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
const LISTING = { id: 7, name: 'Tom Trainer', specialty: 'Strength', price: 180, credential: 'NSCA-CSCS', verified: true, at_capacity: false, capacity_resume_at: null, listing_ready: true, monthly_offer: { includes: ['A program written for your week'] }, listing_media: null, owner_id: 'coach-1' };
const PLANS = [{ id: 'p1', kind: 'program', name: 'Strong in 12', price: 79, category: 'program', meta: '12 weeks', provider_id: 7, provider_role: 'trainer', detail: { preview: true, blocks: [{ week: 0, day: 0, dayName: 'Squat', name: 'Back squat', equipment: 'Barbell' }], weeks: 12, media: [] } }];
const dayAfter = new Date(Date.now() + 2 * 864e5);
// `fail(table)` makes a table's read come back with an error, as a Supabase or network failure does;
// `hold(table)` leaves it on its way; `reads` counts each table's reads.
function backend({ capacity = false, plans = () => ({ data: PLANS, error: null }), fail = () => false, hold = () => false, reads = {} } = {}) {
  const calls = [];
  const q = (table) => {
    const rows = table === 'trainers' ? [{ ...LISTING, at_capacity: capacity }] : table === 'community_posts' ? [] : [];
    const res = () => { reads[table] = (reads[table] || 0) + 1; return fail(table) ? { data: null, error: { message: 'timeout' } } : { data: rows, error: null }; };
    const o = { select: () => o, eq: () => o, in: () => o, order: () => o, limit: () => o, maybeSingle: async () => { const r = res(); return { data: r.data ? r.data[0] || null : null, error: r.error }; }, then: (r, j) => (hold(table) ? new Promise(() => {}) : Promise.resolve(res())).then(r, j) };
    return o;
  };
  window.shapeDb = {
    getUser: async () => ({ id: 'member-1' }),
    client: { from: q, rpc: async (fn) => (fn === 'get_coach_sale_plans_by_user' ? plans() : { data: [], error: null }), auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getUser: async () => ({ data: { user: null } }) } },
  };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    const u = String(url);
    const j = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (u.startsWith('/api/availability')) return j(200, { slots: [{ weekday: dayAfter.getDay(), start_minute: 600, duration_min: 120 }], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, busy: [], booked: [], rules: { consultMin: 20 }, atCapacity: capacity });
    if (u.startsWith('/api/coaches/reviews')) return j(200, { reviews: [{ id: 'r1', author: 'Priya S.', rating: 10, text: 'Best coach I have had.' }], avg: 10, count: 1 });
    if (u.startsWith('/api/stripe/checkout-session')) return j(200, { url: 'https://checkout.stripe.test/session' });
    if (u.startsWith('/api/waitlist/mine')) return j(200, { entries: [], clientOf: [] });
    return j(404, {});
  };
  return calls;
}
async function mount(props, path = '/newdesign/MemberProfile.html?u=coach-1&role=trainer') {
  dom.reconfigure({ url: 'https://shape.test' + path });
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(WebCoachProfile, { chrome: false, follow: { followers: 3, following: 2, canFollow: true }, onFollow() {}, onMessage() {}, ...props })));
  await settle(); await settle();
  return { root, unmount: () => React.act(async () => root.unmount()) };
}
const LIVE = { mode: 'live', role: 'trainer', uid: 'coach-1', row: { role: 'trainer', full_name: 'Tom Trainer', points: 2400, is_public: true, can_view: true, pronouns: 'he/him', goal: 'Strong, simply.', custom: { about: { story: 'Ten years on the floor.' } } }, verified: true };

test('a real coach\'s page has the app profile\'s sections, in its order', async () => {
  WIDE = true; backend();
  const p = await mount(LIVE);
  const page = document.querySelector('[data-coach-profile]');
  assert.ok(page, 'the coach page, not the living layout');
  for (const sel of ['[data-wall]', '[data-who]', '[data-verified-line]', '[data-message]', '[data-work-with]', '[data-follow]', '[data-day-tab]', '[data-reviews-strip]', '[data-credential]', '[data-work-rail]']) assert.ok(document.querySelector(sel), sel);
  const tabs = [...document.querySelectorAll('[data-profile-tab]')].map((b) => [b.getAttribute('data-profile-tab'), b.textContent]);
  assert.deepEqual(tabs, [['day', 'His day'], ['about', 'About me'], ['replays', 'Replays']], 'a visitor sees a tab only with something in it (the program they sell is in Replays), the day first');
  assert.match(document.querySelector('[data-verified-line]').textContent, /Verified Elite coach · 10\.0\/10 from 1 review/);
  assert.match(document.querySelector('[data-credential]').textContent, /NSCA-CSCS · Checked by Shape/);
  assert.equal(document.querySelector('[data-who] h1').textContent, 'Tom Trainer.');
  // Reviews close the page, after the tabs.
  const order = (a, b) => !!(document.querySelector(a).compareDocumentPosition(document.querySelector(b)) & window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(order('[data-who]', '.cpw-tabs') && order('.cpw-tabs', '[data-reviews-strip]') && order('[data-reviews-strip]', '[data-credential]'));
  // An open time is taken on the booking page, at that time.
  const open = document.querySelector('a[data-open-time]') || null;
  if (!open) {
    const btn = [...document.querySelectorAll('[aria-label="Days"] button')].find((b) => /open/.test(b.getAttribute('aria-label')) && !/none open/.test(b.getAttribute('aria-label')));
    await React.act(async () => btn.click());
  }
  const link = document.querySelector('a[data-open-time]');
  assert.ok(link, 'an open time to take');
  assert.match(link.getAttribute('href'), /^\/newdesign\/consultation\.html\?type=trainer&id=7&name=Tom%20Trainer&at=/);
  assert.match(link.textContent, /A free 20-minute intro call/, 'the coach\'s own intro length');
  await p.unmount();
});

test('Subscribe goes through the one checkout path, with the code typed before the redirect', async () => {
  WIDE = true; const calls = backend();
  const p = await mount(LIVE);
  const rail = document.querySelector('[data-work-rail]');
  assert.match(rail.textContent, /Monthly coaching · \$180\/mo/, 'the listing\'s own price, never a sample one');
  const open = rail.querySelector('[data-code-open]');
  assert.ok(open, 'the code box is on the storefront');
  await React.act(async () => open.click());
  const input = rail.querySelector('[data-checkout-code]');
  const sub = rail.querySelector('[data-subscribe]');
  assert.ok(input.compareDocumentPosition(sub) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'the code box comes before Subscribe');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(input, 'SHAPE20'); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  const before = navigations.length;
  await React.act(async () => sub.click());
  await settle();
  const post = calls.find((c) => c.url === '/api/stripe/checkout-session');
  assert.ok(post, 'Subscribe posts the checkout');
  assert.equal(post.body.item.type, 'Subscription');
  assert.deepEqual(post.body.coach, { provider_id: 7, provider_role: 'trainer', name: 'Tom Trainer' });
  assert.equal(post.body.code, 'SHAPE20', 'the code rides the checkout, so the server checks it before the redirect');
  assert.equal(post.body.item.price, '$180');
  assert.equal(navigations.length, before + 1, 'then on to Stripe');
  // A plan's Buy is the same path, with the same code.
  const buy = rail.querySelector('[data-plan-buy]');
  assert.ok(buy, 'a plan with a price has Buy');
  await React.act(async () => buy.click());
  await settle();
  const plan = calls.filter((c) => c.url === '/api/stripe/checkout-session')[1];
  assert.equal(plan.body.item.planId, 'p1'); assert.equal(plan.body.code, 'SHAPE20');
  assert.deepEqual(plan.body.coach, { provider_id: 7, provider_role: 'trainer' });
  await p.unmount();
});

test('a plan read that fails says so, with Try again, and never reads as "no plans"', async () => {
  WIDE = true;
  let fail = true; let reads = 0;
  backend({ plans: () => { reads++; return fail ? { data: null, error: { message: 'timeout' } } : { data: PLANS, error: null }; } });
  const p = await mount(LIVE);
  const rail = document.querySelector('[data-work-rail]');
  const err = rail.querySelector('[data-plans-error]');
  assert.ok(err, 'the failed read is shown');
  assert.match(err.textContent, /Couldn't read Tom's plans just now/);
  assert.ok(!rail.querySelector('[data-offer-empty]'), 'no "hasn\'t listed a plan" on a failed read');
  assert.doesNotMatch(rail.textContent, /hasn't listed a plan/);
  assert.ok(!rail.querySelector('[data-plan-buy]'));
  fail = false;
  const before = reads;
  await React.act(async () => rail.querySelector('[data-plans-retry]').click());
  await settle();
  assert.equal(reads, before + 1, 'Try again reads the plans again');
  assert.ok(!rail.querySelector('[data-plans-error]'));
  assert.ok(rail.querySelector('[data-plan-buy]'), 'and the plan is back on sale');
  await p.unmount();
  backend({ plans: () => { throw new Error('network'); } });
  const q = await mount(LIVE);
  assert.ok(document.querySelector('[data-work-rail] [data-plans-error]'), 'a request that throws is a failed read too');
  await q.unmount();
});

test('a listing read that fails says so in Work with, with Try again, and never reads as unlisted', async () => {
  WIDE = true;
  let down = true; const reads = {};
  backend({ fail: (t) => down && t === 'trainers', reads });
  const p = await mount(LIVE);
  const rail = document.querySelector('[data-work-rail]');
  const err = rail.querySelector('[data-listing-error]');
  assert.ok(err, 'the failed read is shown');
  assert.match(err.textContent, /Couldn't read Tom's prices just now/);
  assert.doesNotMatch(rail.textContent, /hasn't listed prices/, 'no "unlisted" claim on a failed read');
  assert.ok(!rail.querySelector('[data-subscribe]') && !rail.querySelector('[data-plan-buy]'));
  down = false;
  const before = reads.trainers;
  await React.act(async () => err.querySelector('[data-read-retry]').click());
  await settle(); await settle();
  assert.ok(reads.trainers > before, 'Try again reads the listing again');
  assert.ok(!rail.querySelector('[data-listing-error]'));
  assert.ok(rail.querySelector('[data-subscribe]'), 'and Subscribe is back');
  await p.unmount();
});

test('a reviews read that fails claims no rating and says so, with Try again', async () => {
  WIDE = true; backend();
  const real = globalThis.fetch;
  let down = true; let reads = 0;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('/api/coaches/reviews')) return real(url, init);
    reads++;
    if (down) return { ok: false, status: 503, json: async () => ({}) };
    return real(url, init);
  };
  try {
    const p = await mount(LIVE);
    const line = document.querySelector('[data-verified-line]').textContent;
    assert.doesNotMatch(line, /New on Shape/);
    assert.match(line, /Verified Elite coach/);
    assert.doesNotMatch(document.querySelector('[data-coach-profile]').textContent, /No reviews yet/);
    const err = document.querySelector('[data-reviews-strip] [data-reviews-error]');
    assert.ok(err, 'the strip says the read failed');
    assert.match(err.textContent, /Couldn't read Tom's reviews just now/);
    down = false;
    const before = reads;
    await React.act(async () => err.querySelector('[data-read-retry]').click());
    await settle();
    assert.equal(reads, before + 1, 'Try again reads the reviews again');
    assert.ok(!document.querySelector('[data-reviews-error]'));
    assert.match(document.querySelector('[data-verified-line]').textContent, /10\.0\/10 from 1 review/);
    assert.ok(document.querySelector('[data-review-card]'), 'and the reviews are back');
    // A request that throws is a failed read too.
    await p.unmount();
    globalThis.fetch = async (url, init) => (String(url).startsWith('/api/coaches/reviews') ? Promise.reject(new Error('network')) : real(url, init));
    const q = await mount(LIVE);
    assert.ok(document.querySelector('[data-reviews-strip] [data-reviews-error]'));
    await q.unmount();
  } finally { globalThis.fetch = real; }
});

test('while the listing is read, Work with claims no prices', async () => {
  WIDE = true; backend({ hold: (t) => t === 'trainers' });
  const p = await mount(LIVE);
  const rail = document.querySelector('[data-work-rail]');
  assert.match(rail.textContent, /Reading the prices/);
  assert.doesNotMatch(rail.textContent, /hasn't listed prices/);
  await p.unmount();
});

test('a post read that fails keeps the tabs it feeds, each saying so with Try again', async () => {
  WIDE = true;
  let down = true; const reads = {};
  backend({ fail: (t) => down && t === 'community_posts', reads });
  const p = await mount(LIVE);
  const tabs = [...document.querySelectorAll('[data-profile-tab]')].map((b) => b.getAttribute('data-profile-tab'));
  assert.ok(tabs.includes('activity') && tabs.includes('replays'), 'the post tabs stay: ' + tabs.join(','));
  await React.act(async () => document.querySelector('[data-profile-tab="replays"]').click());
  assert.match(document.querySelector('[data-work-error]').textContent, /Couldn't read all of Tom's work just now/);
  assert.ok(document.querySelector('[data-program]'), 'the programs that did load still show');
  await React.act(async () => document.querySelector('[data-profile-tab="activity"]').click());
  const err = document.querySelector('[data-posts-error]');
  assert.match(err.textContent, /Couldn't read Tom's posts just now/);
  down = false;
  const before = reads.community_posts;
  await React.act(async () => err.querySelector('[data-read-retry]').click());
  await settle();
  assert.equal(reads.community_posts, before + 1, 'Try again reads the posts again');
  assert.ok(!document.querySelector('[data-posts-error]'));
  // Read, and empty: a visitor sees no Activity tab, as before.
  assert.ok(![...document.querySelectorAll('[data-profile-tab]')].some((b) => b.getAttribute('data-profile-tab') === 'activity'));
  await p.unmount();
});

test('at capacity the storefront is the waiting list, never a live Subscribe', async () => {
  WIDE = true; backend({ capacity: true });
  const p = await mount(LIVE);
  const rail = document.querySelector('[data-work-rail]');
  assert.ok(rail.querySelector('[data-at-capacity]'));
  assert.ok(!rail.querySelector('[data-subscribe]'), 'no Subscribe under "isn\'t taking new clients"');
  assert.match(rail.textContent, /Join the waiting list/);
  await p.unmount();
});

test('on a phone Work with is a sheet, and a coach\'s referral link opens on it', async () => {
  WIDE = false; backend();
  const plain = await mount(LIVE);
  assert.ok(!document.querySelector('[data-work-rail]'), 'no side column on a phone');
  assert.ok(!document.querySelector('[data-work-sheet]'));
  await React.act(async () => document.querySelector('[data-work-with]').click());
  assert.ok(document.querySelector('[data-work-sheet] [data-subscribe]'), 'Work with opens the storefront');
  await plain.unmount();
  const ref = await mount(LIVE, '/newdesign/MemberProfile.html?u=coach-1&ref=0b6f3c1e-8a2d-4c5b-9e7f-1a2b3c4d5e6f&role=trainer');
  assert.ok(document.querySelector('[data-work-sheet] [data-subscribe]'), 'the person a coach brings lands on the storefront');
  await ref.unmount();
});

test('a coach with no account is the app\'s sample: its studio, replays, reviews and times, said so, selling nothing', async () => {
  WIDE = true; const calls = backend();
  const p = await mount({ mode: 'sample', role: 'trainer', name: 'Jordan Reyes', sampleKey: 'Jordan Reyes', follow: null });
  assert.match(document.querySelector('[data-sample-note]').textContent, /hasn't set up a Shape account yet/);
  const tabs = [...document.querySelectorAll('[data-profile-tab]')].map((b) => b.getAttribute('data-profile-tab'));
  assert.deepEqual(tabs, ['day', 'studio', 'replays', 'activity'], 'Activity is last');
  assert.ok(!document.querySelector('[data-subscribe]') && !document.querySelector('[data-plan-buy]'), 'a sample sells nothing');
  assert.ok(!document.querySelector('a[data-open-time]'), 'sample times are shown, never taken');
  assert.match(document.querySelector('[data-day-sub]') ? document.querySelector('[data-day-sub]').textContent : 'Sample times', /Sample times/);
  assert.equal(document.querySelectorAll('[data-review-card]').length, 4, 'the sample\'s own reviews');
  assert.ok(!calls.some((c) => c.url.startsWith('/api/availability')), 'nothing is read for a sample\'s times');
  await React.act(async () => document.querySelector('[data-profile-tab=studio]').click());
  assert.ok(document.querySelector('[data-studio-plan]') && document.querySelectorAll('[data-station]').length > 0, 'the studio as drawn, its stations numbered');
  await React.act(async () => document.querySelector('[data-profile-tab=replays]').click());
  assert.ok(document.querySelectorAll('[data-program]').length > 0 && document.querySelectorAll('[data-replay]').length > 0);
  await React.act(async () => document.querySelector('[data-program]').click());
  const sheet = document.querySelector('[data-program-sheet]');
  assert.ok(sheet && !sheet.querySelector('[data-program-buy]'), 'a sample program has no Buy');
  await p.unmount();
});

test('a nutritionist\'s page: amber until they pick, the kitchen and plate notes in place of the studio and replays', async () => {
  WIDE = true; backend();
  const p = await mount({ mode: 'sample', role: 'nutritionist', name: 'Quinn Avery', sampleKey: 'Quinn Avery', follow: null });
  const tabs = [...document.querySelectorAll('[data-profile-tab]')].map((b) => [b.getAttribute('data-profile-tab'), b.textContent]);
  assert.deepEqual(tabs.map((t) => t[0]), ['day', 'kitchen', 'plates', 'activity']);
  assert.equal(tabs[1][1], "Quinn's kitchen");
  assert.match(document.querySelector('.cpw-h1').innerHTML, /#e3a544|rgb\(227, 165, 68\)/, 'the name\'s accent dot is the nutritionist gold');
  await React.act(async () => document.querySelector('[data-profile-tab=plates]').click());
  await React.act(async () => document.querySelector('[data-plate-day]').click());
  assert.ok(document.querySelector('[data-plate-step]'), 'a day of meals steps meal by meal');
  // Work with lists the sample's own meal plans, each with its price and length and none to buy, as
  // the app's sheet does (Codex P2 on #2560: the sheet read only programs, empty for a nutritionist).
  const rows = [...document.querySelectorAll('[data-work-rail] [data-offer-row]')];
  assert.ok(rows.length >= 2, 'the sample meal plans are listed: ' + rows.length);
  for (const r of rows) {
    assert.match(r.textContent, /\$\d+/, 'each with its price: ' + r.textContent);
    assert.match(r.textContent, /\d+ weeks?/, 'and its length: ' + r.textContent);
  }
  assert.ok(!document.querySelector('[data-work-rail] [data-plan-buy]'), 'a sample sells nothing');
  assert.ok(!document.querySelector('[data-work-rail] [data-offer-empty]'));
  // The Activity tab carries no "{name}'s activity" heading under a tab already named Activity, as
  // the app's (#2562).
  await React.act(async () => document.querySelector('[data-profile-tab=activity]').click());
  const act = document.querySelector('[data-activity]');
  assert.ok(act, 'the Activity tab is drawn');
  assert.doesNotMatch(act.textContent, /Quinn's activity/);
  await p.unmount();
});

// ── Where it is loaded ───────────────────────────────────────────────────────────────────────
test('the living profile page hands every coach to the new page, with the old one as its fallback', () => {
  const page = read('public/newdesign/livingProfilePage.jsx');
  assert.match(page, /const coachPage = coach && typeof WebCoachProfile !== "undefined" \? \(isDerived/);
  assert.match(page, /<WebCoachProfile key=\{"sample:"[^\n]*mode="sample"[^\n]*fallback=\{desktop\} \/>/, 'a coach with no account is the sample');
  // A dual-role coach: the page shows the listing the link names, by the storefront hook's own rule,
  // so what it shows is what Subscribe buys (Codex P2 on #2560).
  assert.match(page, /mode="live" role=\{listingRole\} uid=\{st\.uid\} row=\{row\} isSelf=\{st\.isSelf\}/);
  const pageRule = /const listingRole = \(\(\) => \{[\s\S]*?\}\)\(\);/.exec(page)[0];
  assert.match(pageRule, /get\("role"\)/);
  // The URL's role first, then a coach dashboard's own (its host's demoRole), then the profile row's
  // (Codex P2 on 745e3a8: the nutritionist dashboard's Profile showed a dual-role coach's trainer listing).
  const order = ['if (p === "trainer" || p === "nutritionist") return p;', 'if (demoRole === "trainer" || demoRole === "nutritionist") return demoRole;', 'return role;'].map((x) => pageRule.indexOf(x));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], 'URL, then host, then row: ' + order);
  const shared = read('public/newdesign/livingShared.jsx');
  assert.match(shared, /const listingRole = \(\(\) => \{\n    let p = null;\n    try \{ p = new URLSearchParams\(window\.location\.search\)\.get\("role"\); \} catch \(e\) \{\}\n    if \(p === "trainer" \|\| p === "nutritionist"\) return p;/, 'the storefront reads the same parameter first');
  assert.match(page, /\{coachPage \|\| desktop\}/, 'a member keeps the living layout');
  for (const host of ['MemberProfile', 'TrainerApp', 'NutritionistApp', 'TrainerProfile', 'NutritionistProfile']) {
    const html = read(`public/newdesign/${host}.html`);
    const at = (s) => { const i = html.indexOf(s); assert.ok(i > 0, `${host}: ${s}`); return i; };
    assert.ok(at('bookingSlots.js') < at('livingProfilePage.jsx') && at('src="coachProfileWeb.jsx"') < at('livingProfilePage.jsx'), `${host} loads the coach page before the living profile page`);
    assert.match(html, /family=Saira:wght@300;400;500;600;700/, `${host} loads the app's display face`);
  }
});

test('a time taken on the profile is selected on the booking page, matched on the instant', () => {
  const html = read('public/newdesign/consultation.html');
  assert.match(html, /let wantedAt = params\.get\('at'\);/);
  assert.match(html, /const hit = Number\.isFinite\(want\) \? built\.find\(\(sl\) => sl\.ms === want\) : null;\n\s+wantedAt = null;/, 'once, and only a time that is still open');
});
