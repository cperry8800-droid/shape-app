// The website's coach profile, the Climb (public/newdesign/coachProfileWeb.jsx, its kit
// coachProfileKit.mjs). What a visitor sees at a trainer's or nutritionist's public page
// (MemberProfile.html): the stage (the terrain over their photo, the summit's rating, the prism
// portrait, the name and the plates), the wire, and the camps on the spine (Base · {Name}'s day ·
// the range or kitchen · Replays or Plate notes · Proof · Words · About · Find me · Posts · the Summit's
// storefront), with the booking console docked. tests/web-coach-climb.test.mjs reads the Climb's own
// rules; these pin the parts it kept from today's page, that Subscribe and Buy run
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
  assert.deepEqual(K.bsCoachWords('her', 'Maya'), { day: 'Her day', work: 'Work with her', kitchen: 'My kitchen' });
  assert.deepEqual(K.bsCoachWords(null, 'Quinn'), { day: "Quinn's day", work: 'Work with Quinn', kitchen: 'My kitchen' });
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
  // The spotlight's figures and cleaners: the app's own (coachWork.mjs, profileCustom.mjs).
  assert.equal(K.bsCoachHeadline, (await import('../mobile-app/src/services/coachWork.mjs')).bsCoachHeadline);
  assert.equal(K.bsProfileSong, (await import('../mobile-app/src/services/profileCustom.mjs')).bsProfileSong);
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
    // `how` is 'list' for a read of rows, 'single' for a maybeSingle (the storefront hook's own read).
    const res = (how) => { reads[table] = (reads[table] || 0) + 1; return fail(table, how) ? { data: null, error: { message: 'timeout' } } : { data: rows, error: null }; };
    const o = { select: () => o, eq: () => o, in: () => o, order: () => o, limit: () => o, maybeSingle: async () => { const r = res('single'); return { data: r.data ? r.data[0] || null : null, error: r.error }; }, then: (r, j) => (hold(table) ? new Promise(() => {}) : Promise.resolve(res('list'))).then(r, j) };
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
  for (const sel of ['[data-terrain]', '[data-who]', '[data-summit]', '[data-chip="verified"]', '[data-dock] [data-message]', '[data-follow]', '[data-day-tab]', '[data-reviews-strip]', '[data-credential]', '[data-work-rail]']) assert.ok(document.querySelector(sel), sel);
  const camps = [...document.querySelectorAll('[data-camp]')].map((c) => c.getAttribute('data-camp'));
  assert.deepEqual(camps, ['day', 'words', 'about', 'summit'], 'a visitor sees a camp only with something in it (the program they sell is in the Summit), the day first, the summit last');
  assert.match(document.querySelector('[data-summit]').textContent, /10\.0\/10Rating · 1 review/);
  assert.match(document.querySelector('[data-chips]').textContent, /Verified by Shape.*Elite/);
  assert.match(document.querySelector('[data-credential]').textContent, /NSCA-CSCS · Checked by Shape/);
  assert.equal(document.querySelector('[data-who] h1').textContent, 'Tom Trainer.');
  // The words come after the day; the Summit is the storefront, then the programs (owner, 2026-11-11: "The
  // Summit becomes the one place to buy"), then the credential.
  const order = (a, b) => !!(document.querySelector(a).compareDocumentPosition(document.querySelector(b)) & window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(order('[data-who]', '[data-camp="day"]') && order('[data-camp="day"]', '[data-reviews-strip]') && order('[data-reviews-strip]', '[data-work-rail]')
    && order('[data-work-rail]', '[data-summit-range]') && order('[data-summit-range]', '[data-credential]'));
  assert.ok(document.querySelector('[data-camp="summit"] [data-summit-range] [data-program]'), 'the program they sell is in the Summit');
  assert.ok(!document.querySelector('[data-offer-row]'), 'and listed once: the storefront\'s price list is gone');
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

// Owner, 2026-11-03: "the about me should have more things to add. certificates, accolades" and
// "coaches socials should be shown somewhere in this section if they choose to": the website draws the
// coach's lists on About and the socials in the head, as the app does.
test('About me on the website: the coach\'s accolades and education; the head\'s socials only when chosen', async () => {
  WIDE = true; backend();
  const about = { story: 'Ten years on the floor.', accolades: [{ title: 'Coach of the Year', detail: 'Portland Fitness Awards', year: 2024 }], education: [{ title: 'BSc Exercise Science', year: 2015 }] };
  const links = { instagram: '@tom.lifts', x: 'javascript:alert(1)' };
  let p = await mount({ ...LIVE, row: { ...LIVE.row, custom: { about, links } } });
  assert.ok(!document.querySelector('[data-head-socials]'), 'socials in the head the coach did not choose');
  assert.deepEqual([...document.querySelectorAll('[data-about="accolades"] [data-about-item]')].map((li) => li.textContent), ['Coach of the YearPortland Fitness Awards2024']);
  assert.match(document.querySelector('[data-about="accolades"]').textContent, /^Accolades/);
  assert.ok(document.querySelector('[data-camp="find"] [data-about-link="instagram"]'), 'the socials are in Find me, not About');
  assert.ok(!document.querySelector('[data-camp="about"] [data-about-link]'));
  assert.deepEqual([...document.querySelectorAll('[data-about="education"] [data-about-item]')].map((li) => li.textContent), ['BSc Exercise Science2015']);
  await p.unmount();
  p = await mount({ ...LIVE, row: { ...LIVE.row, custom: { about, links, headLinks: true } } });
  const row = document.querySelector('[data-head-socials]');
  assert.ok(row, 'the socials the coach chose for the head');
  assert.deepEqual([...row.querySelectorAll('[data-head-social]')].map((a) => [a.getAttribute('data-head-social'), a.getAttribute('href'), a.getAttribute('aria-label')]), [['instagram', 'https://instagram.com/tom.lifts', 'Instagram @tom.lifts']], 'only a link the page can use');
  await p.unmount();
});

// Owner, 2026-11-04: "Show them on coach pages", "this should apply to website as well": what a coach
// sets in Make it yours → Spotlight (and the practice's card in About me) shows on the website's page too.
test('the website shows the spotlight: stats, highlight, film, the practice, the song and the wins wall; none when unset', async () => {
  WIDE = true; backend();
  const host = 'https://' + (await import('../public/newdesign/listingMedia.mjs')).BS_SUPABASE_HOST;
  const FILM = `${host}/storage/v1/object/public/coach-media/coach-1/intro.mp4`;
  const PIN = '11111111-1111-4111-8111-111111111111';
  const base = globalThis.fetch;
  // A pinned review, read by id, as one of this coach's members'.
  globalThis.fetch = async (url, init) => (String(url).startsWith('/api/coaches/reviews?ids=')
    ? { ok: true, status: 200, json: async () => ({ reviews: [{ id: PIN, author: 'Dana K.', rating: 10, text: 'An old favourite.', ownerId: 'coach-1', authorId: 'm-1' }] }) }
    : base(url, init));
  const custom = {
    about: { story: 'Ten years on the floor.', years: 9 },
    film: { url: FILM, caption: 'How I coach a squat.' },
    heroStats: ['rating', 'years', 'programs'],
    pinned: { kind: 'win', title: 'Client deadlift: twice her bodyweight', note: 'Fourteen weeks.', metric: '2×BW' },
    song: { url: 'https://open.spotify.com/track/2KH16WveTQWT6KOG9Rg6e2', label: 'Warm-up anthem' },
    pinnedReviews: [PIN],
    bizCard: { name: 'Iron Path Strength', where: 'Austin, TX', hours: 'Mon–Sat · by appointment', handle: '@ironpath' },
  };
  let p = await mount({ ...LIVE, row: { ...LIVE.row, custom } });
  // The plates: the coach's own picks but the rating (the summit holds it), then the open times.
  const plates = [...document.querySelectorAll('[data-coach-stat]')].map((s) => s.textContent);
  assert.deepEqual(plates.slice(0, 3), ['9Years coaching', '1Programs', '1Reviews'], 'the page\'s own figures, in the coach\'s order');
  assert.match(plates[3], /^[12]Open this week$/, 'the weekly hour, once or twice in the next seven days');
  assert.match(document.querySelector('[data-coach-highlight]').textContent, /Pinned · Win.*Client deadlift: twice her bodyweight.*2×BW.*Fourteen weeks\./);
  assert.equal(document.querySelector('[data-coach-film] video').getAttribute('src'), `${FILM}#t=0.1`);
  assert.match(document.querySelector('[data-coach-film]').textContent, /Intro film.*How I coach a squat\./);
  assert.ok(document.querySelector('[data-camp="base"] [data-coach-spotlight]'), 'at Base · Start here');
  assert.equal(document.querySelector('[data-camp]').getAttribute('data-camp'), 'base', 'the first camp');
  // The wins wall is the Proof camp, ahead of the Words, which hold the rest (never the pinned one twice).
  const proof = document.querySelector('[data-camp="proof"] [data-proof-card]');
  assert.match(proof.textContent, /10\/10 · Pinned.*An old favourite\./, 'the wins wall is Proof');
  assert.ok(!/An old favourite/.test(document.querySelector('[data-reviews-strip]').textContent), 'not again in the Words');
  const campsNow = [...document.querySelectorAll('[data-camp]')].map((c) => c.getAttribute('data-camp'));
  assert.ok(campsNow.indexOf('proof') >= 0 && campsNow.indexOf('proof') === campsNow.indexOf('words') - 1, 'Proof, then Words: ' + campsNow.join(','));
  assert.match(document.querySelector('[data-about="practice"]').textContent, /^The practiceIron Path Strength/);
  assert.deepEqual([...document.querySelectorAll('[data-about-practice-row]')].map((r) => r.textContent), ['WhereAustin, TX', 'HoursMon–Sat · by appointment', 'Find@ironpath']);
  assert.equal(document.querySelector('[data-about-song] iframe').getAttribute('src'), 'https://open.spotify.com/embed/track/2KH16WveTQWT6KOG9Rg6e2');
  assert.match(document.querySelector('[data-about="song"]').textContent, /^Warm-up anthem/);
  await p.unmount();

  // Unset, or not the coach's own (another coach's folder, a song that is not Spotify's, a member's stats): none.
  p = await mount({ ...LIVE, row: { ...LIVE.row, custom: { about: { story: 'Ten years.' }, film: { url: FILM.replace('/coach-1/', '/coach-2/') }, song: { url: 'https://example.com/x' }, heroStats: ['score', 'streak'], pinned: { title: '' } } } });
  for (const sel of ['[data-coach-highlight]', '[data-coach-film]', '[data-coach-spotlight]', '[data-camp="base"]', '[data-coach-stat="score"]', '[data-coach-stat="streak"]']) assert.ok(!document.querySelector(sel), sel);
  assert.ok(!document.querySelector('[data-about="practice"]') && !document.querySelector('[data-about="song"]'));
  await p.unmount();
  globalThis.fetch = base;
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
  // A plan's Buy is the same path, with the same code: the program's card in the Summit opens its sheet, whose
  // Start buys it.
  await React.act(async () => document.querySelector('[data-camp="summit"] [data-program-open]').click());
  const buy = document.querySelector('[data-program-sheet] [data-program-buy]');
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
  // The plans are the Summit's, under its storefront: there the failed read says so.
  const work = document.querySelector('[data-camp="summit"] [data-summit-range]');
  assert.ok(work, 'the Summit keeps its programs part on a failed read');
  const err = work.querySelector('[data-work-error]');
  assert.ok(err, 'the failed read is shown');
  assert.match(err.textContent, /Couldn't read all of Tom's work just now/);
  assert.doesNotMatch(document.querySelector('[data-camp="summit"]').textContent, /hasn't listed a plan|hasn't listed prices/, 'never "no plans" on a failed read');
  assert.ok(!work.querySelector('[data-program]'));
  fail = false;
  const before = reads;
  await React.act(async () => err.querySelector('[data-read-retry]').click());
  await settle();
  assert.equal(reads, before + 1, 'Try again reads the plans again');
  // (The part is drawn again once the read is in.)
  const again = document.querySelector('[data-camp="summit"] [data-summit-range]');
  assert.ok(again && !again.querySelector('[data-work-error]'));
  assert.ok(again.querySelector('[data-program]'), 'and the plan is back on sale');
  await p.unmount();
  backend({ plans: () => { throw new Error('network'); } });
  const q = await mount(LIVE);
  assert.ok(document.querySelector('[data-camp="summit"] [data-summit-range] [data-work-error]'), 'a request that throws is a failed read too');
  await q.unmount();
});

test('Subscribe checks out against the listing the page read, never needing a second read of it', async () => {
  WIDE = true; const reads = {};
  const calls = backend({ fail: (t, how) => t === 'trainers' && how === 'single', reads });
  const p = await mount(LIVE);
  const rail = document.querySelector('[data-work-rail]');
  assert.ok(rail.querySelector('[data-code-box]'), 'the storefront has its provider: the code box is drawn');
  await React.act(async () => rail.querySelector('[data-subscribe]').click());
  await settle();
  const post = calls.find((c) => c.url === '/api/stripe/checkout-session');
  assert.ok(post, 'Subscribe posts the checkout');
  assert.deepEqual(post.body.coach, { provider_id: 7, provider_role: 'trainer', name: 'Tom Trainer' });
  await p.unmount();
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
    assert.ok(!document.querySelector('[data-summit]'), 'no summit: a failed read claims neither a rating nor "no reviews"');
    assert.ok(document.querySelector('[data-chip="verified"]'));
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
    assert.match(document.querySelector('[data-summit]').textContent, /10\.0\/10Rating · 1 review/);
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
  const camps = [...document.querySelectorAll('[data-camp]')].map((b) => b.getAttribute('data-camp'));
  assert.ok(camps.includes('posts') && camps.includes('replays'), 'the post camps stay: ' + camps.join(','));
  assert.match(document.querySelector('[data-camp="replays"] [data-work-error]').textContent, /Couldn't read Tom's sessions just now/);
  // The Summit's work reads the posts too (the workout videos): it says so, and the programs that did load show.
  assert.match(document.querySelector('[data-camp="summit"] [data-work-error]').textContent, /Couldn't read all of Tom's work just now/);
  assert.ok(document.querySelector('[data-camp="summit"] [data-program]'), 'the programs that did load still show');
  const err = document.querySelector('[data-posts-error]');
  assert.match(err.textContent, /Couldn't read Tom's posts just now/);
  down = false;
  const before = reads.community_posts;
  await React.act(async () => err.querySelector('[data-read-retry]').click());
  await settle();
  assert.equal(reads.community_posts, before + 1, 'Try again reads the posts again');
  assert.ok(!document.querySelector('[data-posts-error]'));
  // Read, and empty: a visitor sees no Posts camp, as before.
  assert.ok(!document.querySelector('[data-camp="posts"]'));
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

// Owner, 2026-11-11: the Summit is the one place to buy, on a phone too. Work with was a sheet there, and the
// Summit a button to it.
test('on a phone Work with is the Summit, and a coach\'s referral link opens on it', async () => {
  WIDE = false; backend();
  const shownCamps = () => [...document.querySelectorAll('[data-camp]')].filter((c) => !c.hidden).map((c) => c.getAttribute('data-camp'));
  const plain = await mount(LIVE);
  assert.ok(!document.querySelector('[data-work-sheet]') && !document.querySelector('[data-summit-work]'), 'no sheet, and no button to one');
  assert.ok(document.querySelector('[data-camp="summit"] [data-work-rail] [data-subscribe]'), 'the Summit holds the storefront');
  assert.ok(document.querySelector('[data-camp="summit"] [data-summit-range] [data-program]'), 'and the programs under it');
  await plain.unmount();
  // The console's Work with (a sample's) opens the Summit, not a sheet.
  const sample = await mount({ mode: 'sample', role: 'trainer', name: 'Jordan Reyes', sampleKey: 'Jordan Reyes', follow: null });
  assert.notDeepEqual(shownCamps(), ['summit']);
  await React.act(async () => document.querySelector('[data-dock] [data-work-with]').click());
  assert.deepEqual(shownCamps(), ['summit']);
  assert.ok(!document.querySelector('[data-work-sheet]'));
  await sample.unmount();
  const ref = await mount(LIVE, '/newdesign/MemberProfile.html?u=coach-1&ref=0b6f3c1e-8a2d-4c5b-9e7f-1a2b3c4d5e6f&role=trainer');
  assert.deepEqual(shownCamps(), ['summit'], 'the person a coach brings lands on the Summit');
  assert.ok(document.querySelector('[data-camp="summit"] [data-subscribe]'));
  await ref.unmount();
  // On a desktop the storefront is the summit: the referral link brings it into view (Codex P2 on #2652).
  WIDE = true; backend();
  const was = window.Element.prototype.scrollIntoView;
  const scrolled = [];
  window.Element.prototype.scrollIntoView = function () { scrolled.push(this.hasAttribute('data-work-rail')); };
  try {
    const wideRef = await mount(LIVE, '/newdesign/MemberProfile.html?u=coach-1&ref=0b6f3c1e-8a2d-4c5b-9e7f-1a2b3c4d5e6f&role=trainer');
    assert.equal(scrolled.filter(Boolean).length, 1, 'scrolled to the summit\'s storefront once');
    await wideRef.unmount();
  } finally { window.Element.prototype.scrollIntoView = was; }
});

test('a coach with no account is the app\'s sample: its studio, replays, reviews and times, said so, selling nothing', async () => {
  WIDE = true; const calls = backend();
  const p = await mount({ mode: 'sample', role: 'trainer', name: 'Jordan Reyes', sampleKey: 'Jordan Reyes', follow: null });
  assert.match(document.querySelector('[data-sample-note]').textContent, /hasn't set up a Shape account yet/);
  const camps = [...document.querySelectorAll('[data-camp]')].map((b) => b.getAttribute('data-camp'));
  assert.deepEqual(camps, ['day', 'replays', 'words', 'find', 'posts', 'summit'], 'Find me holds the listing\'s photos');
  assert.ok(!document.querySelector('[data-subscribe]') && !document.querySelector('[data-plan-buy]'), 'a sample sells nothing');
  assert.ok(!document.querySelector('a[data-open-time]'), 'sample times are shown, never taken');
  assert.match(document.querySelector('[data-day-sub]') ? document.querySelector('[data-day-sub]').textContent : 'Sample times', /Sample times/);
  assert.equal(document.querySelectorAll('[data-review-card]').length, 4, 'the sample\'s own reviews');
  assert.ok(!calls.some((c) => c.url.startsWith('/api/availability')), 'nothing is read for a sample\'s times');
  assert.ok(document.querySelector('[data-camp="find"] [data-about-photos] [data-gallery] img'), 'where they coach, in Find me');
  assert.ok(!document.querySelector('[data-studio-plan]') && !document.querySelector('[data-station]'), 'no floor plan');
  assert.ok(document.querySelectorAll('[data-camp="summit"] [data-program]').length > 0 && document.querySelectorAll('[data-camp="summit"] [data-workout]').length > 0, 'its programs and workouts, in the Summit');
  // Its storefront sells nothing, so its coaching keeps the Studio's card, at the sample's price.
  assert.ok(document.querySelector('[data-camp="summit"] [data-coaching-card]') && !document.querySelector('[data-storefront]'), 'and its coaching, at the sample\'s price');
  assert.ok(document.querySelectorAll('[data-camp="replays"] [data-replay]').length > 0 && !document.querySelector('[data-camp="replays"] [data-program]'), 'Replays: the sessions alone');
  await React.act(async () => document.querySelector('[data-program-open]').click());
  const sheet = document.querySelector('[data-program-sheet]');
  assert.ok(sheet && !sheet.querySelector('[data-program-buy]'), 'a sample program has no Buy');
  await p.unmount();
});

test('the Studio on the website: the app\'s model, with the coach\'s own words, focus words and picks', async () => {
  // Two program days and one posted video, as the app's Studio reads them (coachWork.mjs bsStudioModel).
  const day = (d, dayName, moves) => moves.map(([name, equipment, muscle]) => ({ week: 0, day: d, weekday: d * 2, dayName, name, equipment, muscle }));
  const plan = { ...PLANS[0], detail: { preview: true, weeks: 12, media: [], note: 'The note on the plan.',
    blocks: [...day(0, 'Squat', [['Back squat', 'Barbell', 'Quads'], ['Romanian deadlift', 'Barbell', 'Hamstrings']]), ...day(1, 'Press', [['Bench press', 'Barbell', 'Chest'], ['Barbell row', 'Barbell', 'Back']])],
    firstWeek: [{ week: 0, day: 0, weekday: 0, dayName: 'Squat', moves: 2 }, { week: 0, day: 1, weekday: 2, dayName: 'Press', moves: 2 }] } };
  WIDE = true; backend({ plans: () => ({ data: [plan], error: null }) });
  const custom = {
    about: { story: 'Ten years on the floor.' },
    focus: [{ id: 'strength' }, { w: 'Garage gyms' }],
    picks: ['d:p1:1'],
    descriptions: { 'p:p1': 'Three days, filmed top sets.', 'd:p1:0': 'The heavy day.', coaching: 'Your week, rewritten every Sunday.' },
    programFor: { p1: { id: 'lifting' } },
  };
  const p = await mount({ ...LIVE, row: { ...LIVE.row, custom } });
  // The focus words take the specialty's place under the name, a preset in its words.
  assert.match(document.querySelector('[data-who]').textContent, /Strength · Garage gyms/);
  assert.doesNotMatch(document.querySelector('[data-who]').textContent, /Strength · Strength/);
  const prog = document.querySelector('[data-program][data-lead]');
  assert.match(prog.textContent, /Three days, filmed top sets\./, 'the coach\'s line, over the plan\'s own note');
  assert.match(prog.querySelector('[data-studio-for]').textContent, /Lifting already/);
  assert.match(prog.textContent, /\$79/);
  const rows = [...document.querySelectorAll('[data-workout]')];
  assert.deepEqual(rows.map((r) => r.querySelector('button').textContent.match(/Squat|Press/)[0]), ['Press', 'Squat'], 'the pick first');
  assert.ok(rows[0].hasAttribute('data-pick') && !rows[1].hasAttribute('data-pick'));
  assert.match(rows[1].textContent, /The heavy day\./, 'a day\'s own line');
  // The focus filter offers only the foci there are, and keeps to one.
  assert.deepEqual([...document.querySelectorAll('[data-studio-focus]')].map((b) => b.getAttribute('data-studio-focus')), ['all', 'upper', 'lower']);
  await React.act(async () => document.querySelector('[data-studio-focus=lower]').click());
  assert.deepEqual([...document.querySelectorAll('[data-workout]')].map((r) => r.querySelector('button').textContent.match(/Squat|Press/)[0]), ['Squat']);
  // A day opens in place to its moves and their muscles, and leads to its program's sheet.
  await React.act(async () => document.querySelector('[data-workout] button').click());
  assert.match(document.querySelector('[data-workout-moves]').textContent, /Back squat\s*Quads/);
  await React.act(async () => document.querySelector('[data-workout-program]').click());
  const sheet = document.querySelector('[data-program-sheet]');
  assert.match(sheet.querySelector('[data-program-desc]').textContent, /Three days, filmed top sets\./);
  assert.match(sheet.querySelector('[data-program-for]').textContent, /Lifting already/);
  assert.equal(sheet.querySelectorAll('[data-program-day]').length, 2, 'its first week, day by day');
  await React.act(async () => sheet.querySelector('[data-program-day] button').click());
  assert.match(sheet.querySelector('[data-program-moves]').textContent, /Romanian deadlift\s*Hamstrings/);
  assert.ok(sheet.querySelector('[data-program-buy]'), 'a real program still sells');
  // Coaching: the storefront at the top of the Summit, with the monthly price and the coach's own line; the
  // Studio's coaching card, which said them again, is gone.
  const store = document.querySelector('[data-camp="summit"] [data-storefront]');
  assert.match(store.textContent, /\$180/);
  assert.match(store.querySelector('[data-coaching-desc]').textContent, /Your week, rewritten every Sunday\./);
  assert.ok(store.querySelector('[data-subscribe]') && store.querySelector('[data-message-coach]'));
  assert.ok(!document.querySelector('[data-coaching-card]'), 'coaching said once');
  await p.unmount();
});

test('the page pins its rows: the root clips sideways without becoming a scroller, and the rail runs the page\'s height', () => {
  // overflow-x: hidden made the page's root a scroll container, so the tabs, the Studio's focus filter
  // and Work with's rail (each position: sticky) never pinned on the website.
  const src = read('public/newdesign/coachProfileWeb.jsx');
  assert.match(src, /\.cpw\{overflow-x:hidden;overflow-x:clip\}/, 'clip, with hidden for a browser without it');
  // pageShell sets html, body { overflow-x: hidden } on every page, which makes <body> the scroller the
  // rows stuck to; the coach page overrides it, more specifically, while it is shown.
  assert.match(read('public/newdesign/pageShell.jsx'), /html, body \{ overflow-x: hidden; \}/, 'pageShell still hides: drop the override if it stops');
  assert.match(src, /html:root, html > body\{overflow-x:clip\}/, 'the page and its body clip while a coach page is shown');
  // In a coach dashboard the page sits in livingProfilePage's <main style={{ overflowX: "hidden" }}> under
  // the dashboard's sticky app bar (Codex P2 on #2597): that <main> clips too, and the rows pin under the bar.
  assert.match(read('public/newdesign/livingProfilePage.jsx'), /<main style=\{\{ minWidth: 0, overflowX: "hidden" \}\}>\{node\}<\/main>/, 'the dashboard wrapper still hides: drop the override if it stops');
  assert.match(src, /\.dash-app main\{overflow-x:clip !important\}/, 'over its inline hidden; a browser without clip keeps hidden');
  // Without the site's chrome, the header is the dashboard's sticky bars across the top: its app bar, and
  // at 900px and under its nav rail, pinned under the app bar as a bar (Codex P2 on #2597, dash.css).
  assert.match(src, /if \(!chrome\) \{ setH\(cpwDashBarsH\(\)\); return; \}/);
  assert.match(read('public/newdesign/dash.css'), /\.dash-appbar \{ position: sticky; top: 0;/, 'the app bar still pins');
  assert.match(read('public/newdesign/dash.css'), /\.dash-rail \{ top: 60px; height: auto; z-index: 59; \}/, 'the narrow rail still pins under it');
  // The measure, run on stand-ins for the two layouts: a wide rail is a side column, a narrow one a bar.
  const fnSrc = src.slice(src.indexOf('function cpwDashBarsH()'), src.indexOf('function useCpwHeadH('));
  const bars = (els) => new Function('document', 'window', `${fnSrc}; return cpwDashBarsH();`)(
    { querySelectorAll: () => els.map((e) => e.el) },
    { getComputedStyle: (el) => els.find((e) => e.el === el).cs },
  );
  const bar = (top, w, h, position = 'sticky') => ({ el: {}, cs: { position, top: `${top}px` } , r: { width: w, height: h } });
  const withRect = (x) => { x.el.getBoundingClientRect = () => x.r; return x; };
  assert.equal(bars([withRect(bar(0, 1200, 60)), withRect(bar(0, 64, 900))]), 60, 'wide: the app bar alone; the side rail is no bar');
  assert.equal(bars([withRect(bar(0, 390, 60)), withRect(bar(60, 390, 50))]), 110, 'narrow: the app bar and the rail under it');
  assert.equal(bars([withRect(bar(0, 390, 60, 'static'))]), 0, 'a bar that does not pin is no header');
  assert.doesNotMatch(src, /if \(!chrome\) \{ setH\(0\)/, 'a dashboard no longer reads as no header');
  assert.doesNotMatch(src, /data-coach-profile=""[^\n]*overflowX: "hidden"/, 'no inline hidden on the root');
  assert.match(src, /data-studio-filter=""[^\n]*\n[^\n]*position: "sticky", top: stickyTop/, 'the focus filter pins');
  // Under the header and the camps' names: the desktop's tabs at their measured height, the phone's bar.
  assert.match(src, /const pinH = wide \? \(showTabs \? campTabsH : 0\) : 51;/);
  assert.match(src, /stickyTop=\{headH \+ pinH\}/, 'the focus filter pins under the header and the camp tabs or bar');
  assert.match(src, /\.cpw-camp-mark\{position:sticky;top:\$\{headH \+ pinH \+ 28\}px/, 'a camp\'s mark on the spine pins under the header and the tabs');
});

test('a nutritionist\'s page: amber until they pick, the kitchen and plate notes in place of the studio and replays', async () => {
  WIDE = true; backend();
  const p = await mount({ mode: 'sample', role: 'nutritionist', name: 'Quinn Avery', sampleKey: 'Quinn Avery', follow: null });
  const camps = [...document.querySelectorAll('[data-camp]')].map((b) => b.getAttribute('data-camp'));
  assert.deepEqual(camps, ['day', 'kitchen', 'plates', 'words', 'posts', 'summit']);
  assert.equal(document.querySelector('#camp-h-kitchen').textContent, 'My kitchen.');
  assert.equal(document.querySelector('[data-camp="summit"] [data-summit-head] h3').textContent, 'Meal plans.', 'the meal plans are the Summit\'s');
  assert.match(document.querySelector('.cpw-h1').innerHTML, /#d8a23a|rgb\(216, 162, 58\)/, 'the name\'s full stop is the nutritionist gold');
  await React.act(async () => document.querySelector('[data-plate-day] [data-plate-step-through]').click());
  assert.ok(document.querySelector('[data-plate-step]'), 'a day of meals steps meal by meal');
  // The Summit lists the sample's own meal plans, each with its price and length and none to buy (Codex P2
  // on #2560: the list read only programs, empty for a nutritionist).
  const rows = [...document.querySelectorAll('[data-camp="summit"] [data-summit-range] [data-program]')];
  assert.ok(rows.length >= 2, 'the sample meal plans are listed: ' + rows.length);
  for (const r of rows) {
    assert.match(r.textContent, /\$\d+/, 'each with its price: ' + r.textContent);
    assert.match(r.textContent, /\d+ weeks?/, 'and its length: ' + r.textContent);
    assert.equal(r.querySelector('[data-program-open]').textContent, 'Open', 'a sample sells nothing');
  }
  assert.ok(!document.querySelector('[data-offer-row]'), 'listed once');
  // The Activity tab carries no "{name}'s activity" heading under a tab already named Activity, as
  // the app's (#2562).
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
