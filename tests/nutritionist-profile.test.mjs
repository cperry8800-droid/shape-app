// The nutritionist profile, MOUNTED: mobile-app/src/broadsheet/BSTrainerProfile.jsx opened for a
// nutritionist, and its editor BSMakeItYours.jsx, in the real broadsheet chrome, against scripted
// profile, listing, availability, booking and feed backends, reading the real English catalogs and
// the real Shape Kitchen. The design is the owner's of 2026-10-27 ("lets do something different for
// nutritionists"): the trainer profile's style, with "Her kitchen" (no floor plan: the plate she
// teaches, her staples, her go-to recipes) and "Plate notes" (a day of meals, stepped through).
//
// What it pins: a nutritionist's page reads, sells and books as a nutritionist and starts amber; its
// tabs are their day, their kitchen and plate notes (never the studio or replays); the kitchen draws
// the plate and the rules, lets a member put staples on their own grocery list, and lists the recipes
// in the coach's order, each opening in Shape, dropping one the catalog doesn't have; plate notes
// group shared meals by day and step through them with the protein so far, never showing a macro the
// meal didn't carry; Make it yours edits all four and saves them onto the doc as it is at save time;
// a nutritionist with no account is a sample, and every sample recipe and meal is the catalog's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsProfileKitchen, bsKitchenPlate, bsNormalizeProfileCustom } from '../mobile-app/src/services/profileCustom.mjs';
import { bsNutritionistDemo, bsNutritionistSampleOf, BS_NUTRI_SAMPLE_KINDS, BS_NUTRI_SAMPLE_RECIPES } from '../mobile-app/src/services/nutritionistDemo.mjs';
import { bsKitchenRecipe, bsKitchenSearch, bsKitchenSlug } from '../mobile-app/src/broadsheet/kitchenDishes.js';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
// The grocery save dispatches a global CustomEvent, as a browser's is the window's.
globalThis.CustomEvent = dom.window.CustomEvent;
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
// Types into an input or textarea as React sees typing.
const type = async (el, text) => {
  assert.ok(el, 'no such field');
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
};

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
window.BSDetailHeader = ({ kicker, title, onBack }) => React.createElement('header', null, React.createElement('button', { type: 'button', onClick: onBack }, '← Back'), kicker, ' ', title);
const { BSTrainerProfile, bsPlateNoteDays } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });
// The Kitchen's recipe page (the client module's), as a probe.
window.BSShapeKitchenRecipe = ({ recipe, onBack, onAddGrocery, groceryAdded }) => React.createElement('div', { 'data-recipe-page': '' }, recipe.title,
  React.createElement('button', { type: 'button', onClick: onBack }, 'Leave the recipe'),
  React.createElement('button', { type: 'button', 'data-recipe-grocery': '', onClick: onAddGrocery }, groceryAdded ? 'On your grocery list' : 'Send to grocery list'));

// ── The world the page reads ─────────────────────────────────────────────────────────────────
const ZONE = 'America/New_York';
let world;
function reset(over = {}) {
  world = {
    pronouns: 'she/her', custom: null, provider: { id: 9, owner_id: 'u-nadia', price: 140, specialty: 'Sports nutrition', verified: true, credential: 'RD, CSSD', listing_media: { cover: null, gallery: [] }, monthly_offer: { includes: ['A meal plan'] } },
    slots: [0, 1, 2, 3, 4, 5, 6].map((wd) => ({ weekday: wd, start_minute: 6 * 60, duration_min: 16 * 60 })),
    busy: [], rules: { consultMin: 20, introsAtCapacity: false }, atCapacity: false, posts: [], canView: true,
    booked: null, saved: null, stored: {}, readWith: undefined, me: 'u-me', roles: [],
    ...over,
  };
}
reset();
window.ShapeAuth = { getCachedState: () => ({ user: world.me ? { id: world.me } : null }) };
window.ShapeProfiles = { getPublicProfile: async () => ({ name: 'Nadia Rahman', pronouns: world.pronouns, bio: 'Food that fits your training.', points: 3100, custom: world.custom, can_view: world.canView }) };
window.ShapeCoachListing = {
  publicByOwner: async (role) => { world.roles.push(['listing', role]); return world.provider; },
  publicById: async (role, id) => { world.roles.push(['listingById', role]); world.byIdFor = id; return world.byId || null; },
};
window.ShapeCoachAvailability = { get: async (role) => { world.roles.push(['hours', role]); return { slots: world.slots, booked: [], busy: world.busy, rules: world.rules, timezone: ZONE, atCapacity: world.atCapacity }; } };
window.ShapeCoachReviews = { forOwner: async () => ({ reviews: [], avg: 0, count: 0 }) };
window.ShapeCoachPlans = { salePlansByUser: async () => [] };
window.ShapeFollows = { stats: async () => ({ isFollowing: false, isPending: false }), toggle: async () => ({ isFollowing: true }), getCached: () => null };
window.ShapeCommunity = { listByAuthor: async () => ({ data: world.posts }) };
window.shapeDb = {
  getUserGoals: async (k, opts) => { world.readWith = opts; if (opts && opts.expectedUserId != null && opts.expectedUserId !== world.me) return null; return world.stored; },
  saveUserGoals: async (k, d, opts) => { if (opts && opts.expectedUserId && opts.expectedUserId !== world.me) return { error: { message: 'Account changed' } }; world.saved = { k, d, opts }; return { ok: true }; },
};
window.ShapeBookings = { submitConsultationBooking: async (a) => { world.booked = a; return { ok: true }; } };
window.bsProfileCardFromPost = (p) => p;
window.useBSCoachCommerce = ({ person, isNutri }) => ((world.commerceSeen = person.commerce), (world.isNutriSeen = isNutri), { commerce: person.commerce, commerceCoach: person.commerce && person.commerce.coach, atCapacity: false, wl: null });
window.BSCoachCoachingBlock = ({ cm }) => React.createElement('div', { 'data-coaching-block': '' }, cm.commerce.packages.map((p) => `${p.name} ${p.price}`).join(' '));


const nadia = { userId: 'u-nadia', who: 'Nadia Rahman', kind: 'NUTRI' };
const page = (props = {}) => React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
  React.createElement(BSTrainerProfile, { person: nadia, onBack: () => {}, onMessage: () => {}, ...props }));
const KITCHEN = {
  plate: { veg: 50, protein: 25, carbs: 25 },
  rules: ['A palm of protein at every meal', 'A fist of carbs'],
  staples: [{ n: 'Greek yogurt', g: 'fridge' }, { n: 'Oats', g: 'pantry' }, { n: 'Frozen berries', g: 'freezer' }],
  dishes: [
    { r: 'greek-yogurt-power-bowl', note: 'For mornings you train early.' },
    { r: 'not-a-recipe-we-have', note: 'Gone from the catalog.' },
    { r: 'herbed-baked-salmon-with-lemon' },
  ],
};
// Shared meals as bsProfileCardFromPost shapes them, on two days; and a workout card, never a plate.
const at = (daysAgo, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString(); };
const meal = (over = {}) => ({ key: 'm1', title: 'Greek yogurt power bowl', ago: '1d', photo: null, body: 'Before a 7 am lift.', created_at: at(1, 7), meal: { kcal: 480, p: 38, c: 52, f: 12, planned: true, recipeId: 'greek-yogurt-power-bowl' }, ...over });
const workout = { key: 'w1', title: 'Heavy squat day', ago: '2d', created_at: at(2, 18), statsRow: [], breakdown: { label: 'Sets', rows: [['Set 1', '100 kg × 5', '']] } };
const twoDays = () => [
  meal({ key: 'm2', title: 'Rice bowl', body: 'Lunch.', created_at: at(1, 12, 30), meal: { kcal: 520, p: 30, c: null, f: '' } }),
  meal(),
  meal({ key: 'm3', title: 'Salmon tray', body: '', created_at: at(2, 19), meal: { kcal: 620, p: 44, c: 58, f: 22, recipeId: '' } }),
  meal({ key: 'm4', title: 'An apple', body: '', created_at: at(2, 15), meal: { kcal: 95 } }),
  workout,
];

test('a nutritionist\'s page reads, sells and books as a nutritionist, and starts amber', async () => {
  const t0 = new Date(); t0.setDate(t0.getDate() + 1); t0.setHours(9, 0, 0, 0);
  reset({ busy: [{ start: t0.toISOString(), end: new Date(t0.getTime() + 3600000).toISOString(), kind: 'session' }] });
  const m = await mount(page());
  assert.deepEqual(world.roles, [['listing', 'nutritionist'], ['hours', 'nutritionist']], 'the nutritionist listing and its hours');
  assert.equal(world.isNutriSeen, true, 'the storefront is told it is a nutritionist');
  assert.equal(world.commerceSeen.coach.provider_role, 'nutritionist');
  // No colours of their own yet: Shape's amber, not the trainers' teal.
  const amber = window.makePalette({ paperMode: 'dark', accentKey: 'amber' });
  const probe = document.createElement('div'); probe.style.background = amber.ACCENT;
  assert.equal(button(/^Message Nadia$/).style.background, probe.style.background, 'amber');
  assert.ok(button(/^Her day$/));
  await click(button(/^Work with her$/));
  assert.equal(document.querySelector('[data-coaching-block]').textContent, 'Monthly nutrition coaching $140');
  await click(button(/^Close$/));
  await click(document.querySelectorAll('[role="group"] button')[1]);
  assert.match(document.querySelector('[data-busy-time]').textContent, /With a client/, 'busy time, said as a nutritionist\'s');
  await click(document.querySelector('[data-open-time]'));
  assert.match(m.text(), /Tell Nadia what you want from your food\./);
  await click(document.querySelector('[data-book-intro]'));
  assert.equal(world.booked.role, 'nutritionist', 'the intro is booked with the nutritionist');
  assert.equal(world.booked.coach.provider_id, 9);
  await m.unmount();
});

test('a nutritionist has their kitchen and plate notes, never the studio or replays; a trainer never the kitchen', async () => {
  reset();
  let m = await mount(page());
  assert.ok(button(/^Her day$/));
  for (const re of [/^Her kitchen$/, /^Plate notes$/, /^The studio$/, /^Replays$/]) assert.ok(!button(re), String(re));
  await m.unmount();
  // A studio and a workout on a nutritionist's doc and feed show nothing; a kitchen and a meal do.
  reset({ custom: { studio: { kind: 'gym', items: [{ t: 'rack', x: 10, y: 10, w: 60, h: 40, st: { title: 'Rack', note: '' } }] }, kitchen: KITCHEN }, posts: [workout, meal()] });
  m = await mount(page());
  assert.ok(button(/^Her kitchen$/) && button(/^Plate notes$/));
  assert.ok(!button(/^The studio$/) && !button(/^Replays$/));
  await m.unmount();
  // The tab follows the pronouns they wrote, else their first name.
  for (const [pronouns, label] of [['he/him', 'His kitchen'], ['they/them', 'Their kitchen'], ['', "Nadia's kitchen"]]) {
    reset({ pronouns, custom: { kitchen: KITCHEN } });
    m = await mount(page());
    assert.ok(button(new RegExp(`^${label}$`)), label);
    await m.unmount();
  }
  // A trainer with a kitchen on their doc gets no kitchen tab.
  reset({ custom: { kitchen: KITCHEN }, posts: [meal()] });
  m = await mount(page({ person: { ...nadia, kind: 'TRAINER' } }));
  assert.ok(!button(/kitchen$/) && !button(/^Plate notes$/));
  assert.deepEqual(world.roles[0], ['listing', 'trainer']);
  await m.unmount();
  // Their own page always shows all three, with a way to fill the kitchen.
  reset({ me: 'u-nadia', stored: {} });
  m = await mount(page({ isSelf: true }));
  await click(button(/^Her kitchen$/));
  assert.match(m.text(), /Show members the plate you teach/);
  assert.ok(button(/^Fill your kitchen$/));
  await click(button(/^Plate notes$/));
  assert.match(m.text(), /each day you share becomes a plate note here/);
  await m.unmount();
});

test('her kitchen: the plate she teaches and her rules, her staples, and her recipes in her order, each opening in Shape', async () => {
  reset({ custom: { kitchen: KITCHEN } });
  const m = await mount(page());
  await click(button(/^Her kitchen$/));
  const plate = document.querySelector('[data-kitchen-plate]');
  assert.match(plate.textContent, /The plate Nadia teaches/);
  assert.match(plate.textContent, /Vegetables\s*50%.*Protein\s*25%.*Carbs\s*25%/);
  assert.match(plate.textContent, /A palm of protein at every meal.*A fist of carbs/);
  const staples = document.querySelector('[data-kitchen-staples]').textContent;
  assert.match(staples, /Always in the kitchen/);
  assert.match(staples, /Fridge\s*Greek yogurt.*Pantry\s*Oats.*Freezer\s*Frozen berries/, 'grouped where they live');
  const dishes = [...document.querySelectorAll('[data-dish]')];
  assert.deepEqual(dishes.map((d) => d.getAttribute('data-dish')), ['greek-yogurt-power-bowl', 'herbed-baked-salmon-with-lemon'], 'her order; the unknown slug is not shown');
  assert.match(dishes[0].textContent, /Greek yogurt power bowl/);
  assert.match(dishes[0].textContent, /5 min · 480 kcal · 38 g protein/, 'the recipe\'s own time, energy and protein');
  assert.match(dishes[0].textContent, /For mornings you train early\./, 'her note');
  assert.match(dishes[0].textContent, /Recipe by Mara Whitfield/, 'credited to the recipe\'s author');
  assert.match(dishes[0].textContent, /Try it in Shape/);
  assert.match(dishes[1].textContent, /Recipe from USDA MyPlate Kitchen/, 'a public-domain recipe credited to its source');
  assert.doesNotMatch(m.text(), /Gone from the catalog/);
  await click(dishes[0]);
  assert.match(document.querySelector('[data-recipe-page]').textContent, /Greek yogurt power bowl/, 'the Kitchen\'s recipe page');
  await click(button(/^Leave the recipe$/));
  assert.ok(!document.querySelector('[data-recipe-page]'), 'Back closes it, onto the profile');
  assert.ok(document.querySelector('[data-trainer-profile]'));
  await m.unmount();
});

test('a bigger pick of long staple names is its own list, and a recipe goes onto the grocery lists as Eat makes it', async () => {
  const long = { ...KITCHEN, staples: [
    { n: 'Unsweetened almond milk, barista style', g: 'fridge' },
    { n: 'Unsweetened almond milk, original', g: 'fridge' },
    { n: 'Unsweetened almond milk, vanilla', g: 'fridge' },
  ] };
  reset({ custom: { kitchen: long } });
  const received = [];
  const onList = (e) => { received.push(e.detail.list); e.detail.handled = true; };
  window.addEventListener('shape:groceryReceived', onList);
  const asked = [];
  window.bsRequireAccount = (why) => { asked.push(why); return world.me != null; };
  try {
    let m = await mount(page());
    await click(button(/^Her kitchen$/));
    await click(document.querySelectorAll('[data-staple]')[0]);
    await click(document.querySelectorAll('[data-staple]')[1]);
    await click(document.querySelector('[data-add-staples]'));
    for (const i of [0, 1, 2]) await click(document.querySelectorAll('[data-staple]')[i]);
    await click(document.querySelector('[data-add-staples]'));
    assert.equal(received.length, 2);
    assert.notEqual(received[1].id, received[0].id, 'the same first names with one more is a different list, never kept as the first');
    assert.equal(received[1].items.length, 3);
    // A recipe: its own list, under the id Eat gives the same recipe, so it is kept once.
    await click(document.querySelector('[data-dish]'));
    const send = document.querySelector('[data-recipe-grocery]');
    assert.match(send.textContent, /^Send to grocery list$/);
    await click(send);
    assert.equal(received.length, 3);
    assert.equal(received[2].id, 'sk-greek-yogurt-power-bowl');
    assert.equal(received[2].name, 'Greek yogurt power bowl grocery list');
    assert.equal(received[2].kind, 'recipe');
    const bowl = bsKitchenRecipe('greek-yogurt-power-bowl');
    assert.deepEqual(received[2].items.map((i) => [i.n, i.q]), bowl.ingredients.map((g) => [g.m, g.n]), 'the recipe\'s own ingredients and amounts');
    assert.match(document.querySelector('[data-recipe-grocery]').textContent, /^On your grocery list$/);
    await m.unmount();
    // Signed out, the recipe asks for an account and saves nothing.
    reset({ me: null, custom: { kitchen: long } });
    m = await mount(page());
    await click(button(/^Her kitchen$/));
    await click(document.querySelector('[data-dish]'));
    await click(document.querySelector('[data-recipe-grocery]'));
    assert.deepEqual(asked.slice(-1), ['add to your grocery list']);
    assert.equal(received.length, 3);
    await m.unmount();
  } finally {
    window.removeEventListener('shape:groceryReceived', onList);
    delete window.bsRequireAccount;
  }
});

test('a member picks staples and adds them to their own grocery lists as one list; a guest is asked for an account', async () => {
  reset({ custom: { kitchen: KITCHEN } });
  const received = [];
  // As the Eat page takes a list while it is on screen (BSGroceryShare's one writer).
  const onList = (e) => { received.push(e.detail.list); e.detail.handled = true; };
  window.addEventListener('shape:groceryReceived', onList);
  const asked = [];
  window.bsRequireAccount = (why) => { asked.push(why); return world.me != null; };
  try {
    let m = await mount(page());
    await click(button(/^Her kitchen$/));
    const add = document.querySelector('[data-add-staples]');
    assert.ok(add.disabled, 'nothing picked, nothing to add');
    assert.match(add.textContent, /Pick what to add/);
    const chips = [...document.querySelectorAll('[data-staple]')];
    await click(chips[0]);
    await click(chips[2]);
    assert.equal(chips[0].getAttribute('aria-pressed'), 'true');
    assert.match(document.querySelector('[data-add-staples]').textContent, /Add 2 to my grocery list/);
    await click(document.querySelector('[data-add-staples]'));
    assert.equal(received.length, 1, 'one list');
    assert.equal(received[0].name, "Nadia's staples");
    assert.deepEqual(received[0].items.map((i) => i.n), ['Greek yogurt', 'Frozen berries']);
    assert.match(m.text(), /Added to your grocery lists, under Eat\./);
    assert.equal(document.querySelectorAll('[data-staple][aria-pressed="true"]').length, 0, 'the picks clear');
    // The same staples again make the same list, so the grocery store keeps one copy.
    await click(document.querySelectorAll('[data-staple]')[0]);
    await click(document.querySelectorAll('[data-staple]')[2]);
    await click(document.querySelector('[data-add-staples]'));
    assert.equal(received[1].id, received[0].id);
    await m.unmount();
    // Signed out: asked for an account, and nothing is saved.
    reset({ me: null, custom: { kitchen: KITCHEN } });
    m = await mount(page());
    await click(button(/^Her kitchen$/));
    await click(document.querySelectorAll('[data-staple]')[1]);
    await click(document.querySelector('[data-add-staples]'));
    assert.deepEqual(asked.slice(-1), ['add to your grocery list']);
    assert.equal(received.length, 2, 'nothing more saved');
    await m.unmount();
    // On their own page the staples are shown, not offered.
    reset({ me: 'u-nadia', stored: { kitchen: KITCHEN } });
    m = await mount(page({ isSelf: true }));
    await click(button(/^Her kitchen$/));
    assert.ok(!document.querySelector('button[data-staple]') && !document.querySelector('[data-add-staples]'));
    assert.equal(document.querySelectorAll('[data-staple]').length, 3);
    await m.unmount();
  } finally {
    window.removeEventListener('shape:groceryReceived', onList);
    delete window.bsRequireAccount;
  }
});

test('plate notes: shared meals by day, newest first, stepped through with the protein so far and her note', async () => {
  reset({ posts: twoDays() });
  const m = await mount(page());
  await click(button(/^Plate notes$/));
  const days = [...document.querySelectorAll('[data-plate-day]')];
  assert.equal(days.length, 2, 'two days; the workout is not a plate');
  assert.match(days[0].textContent, /2 meals/);
  assert.match(days[0].textContent, /Greek yogurt power bowl · Rice bowl/, 'the day in the order it was eaten');
  assert.match(days[0].textContent, /68 g protein · 1,?000 kcal/, 'the day\'s protein and energy');
  assert.match(days[1].textContent, /2 meals.*An apple · Salmon tray/);
  assert.doesNotMatch(days[1].textContent, /g protein/, 'a day with a meal missing its protein gives no protein total');
  assert.match(days[1].textContent, /715 kcal/);
  await click(days[0]);
  const step = () => document.querySelector('[data-plate-step]').textContent;
  assert.match(step(), /Greek yogurt power bowl/);
  assert.match(step(), /38 g protein/);
  assert.match(step(), /480 kcal · 38 g protein · 52 g carbs · 12 g fat/);
  assert.match(step(), /Protein so far: 38 g/);
  assert.ok(document.querySelector('[data-plate-step] [role="img"]').getAttribute('aria-label').match(/Energy: 32% protein, 44% carbs, 24% fat/), 'where the meal\'s energy came from');
  assert.match(m.text(), /Nadia's note.*Before a 7 am lift\./);
  await click(button(/^Next →$/));
  assert.match(step(), /Rice bowl/);
  assert.match(step(), /30 g protein/);
  assert.doesNotMatch(step(), /carbs|fat|(^|[^0-9])0 g/, 'a macro the meal didn\'t carry is left out, never shown as 0');
  assert.match(step(), /Protein so far: 68 g/);
  assert.ok(!document.querySelector('[data-plate-step] [role="img"]'), 'no split without all three macros');
  await click(button(/^← Previous$/));
  await click(document.querySelector('[data-plate-recipe]'));
  assert.match(document.querySelector('[data-recipe-page]').textContent, /Greek yogurt power bowl/, 'a meal from a recipe opens it');
  await click(button(/^Leave the recipe$/));
  // On the second day the apple carried no protein, so no running total is claimed after it.
  await click(button(/^Plate notes$/));
  await click(document.querySelectorAll('[data-plate-day]')[1]);
  assert.match(step(), /An apple/);
  assert.match(step(), /95 kcal/);
  assert.ok(!document.querySelector('[data-protein-so-far]'), 'no protein so far over a meal that had none logged');
  await click(button(/^Next →$/));
  assert.match(step(), /Salmon tray/);
  assert.ok(!document.querySelector('[data-protein-so-far]'));
  assert.ok(!document.querySelector('[data-plate-recipe]'), 'a meal with no recipe opens none');
  await m.unmount();
});

test('Make it yours: a nutritionist edits the plate, rules, staples and recipes, saved onto the doc as it is at save time', async () => {
  reset({ me: 'u-nadia', stored: { bio: 'Kept', kitchen: { plate: { veg: 50, protein: 25, carbs: 25 }, rules: ['Old rule'], staples: [{ n: 'Eggs', g: 'fridge' }], dishes: [{ r: 'greek-yogurt-power-bowl', note: 'Early mornings.' }] } } });
  const m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  assert.ok(button(/^Your kitchen$/), 'the kitchen tab');
  assert.ok(!button(/^Your space$/), 'not the studio');
  await click(button(/^Your kitchen$/));
  assert.equal(document.querySelector('[data-plate-preset="everyday"]').getAttribute('aria-pressed'), 'true', 'it opens on their plate');
  // More protein takes from the largest other part; the plate always adds up to 100.
  await click(button(/^More Protein$/));
  const parts = () => ['veg', 'protein', 'carbs'].map((k) => document.querySelector(`[data-plate-part="${k}"]`).textContent);
  assert.deepEqual(parts(), ['45%', '30%', '25%']);
  await click(button(/^Less Carbs$/));
  assert.deepEqual(parts(), ['50%', '30%', '20%']);
  // Rules: change the old one, add another.
  await type(document.querySelector('input[value="Old rule"]'), 'A palm of protein');
  await click(document.querySelector('[data-add-rule]'));
  const ruleInputs = [...document.querySelectorAll('input')].filter((i) => i.getAttribute('aria-label') === 'Your portion rules');
  await type(ruleInputs[1], 'A fist of carbs');
  // A staple in the pantry.
  await click(button(/^Pantry$/));
  await type(document.querySelector('input[aria-label="A staple"]'), 'Oats');
  await click(document.querySelector('[data-add-staple]'));
  assert.equal(document.querySelectorAll('[data-mine-staple]').length, 2);
  // A recipe from the search, its note, moved to the top.
  await type(document.querySelector('input[type="search"]'), 'salmon');
  await click(document.querySelector('[data-kitchen-pick="sheet-pan-salmon-sweet-potato-and-broccoli"]'));
  assert.ok(document.querySelector('[data-kitchen-pick="sheet-pan-salmon-sweet-potato-and-broccoli"]').disabled, 'a recipe already added is not offered again');
  await type(document.querySelectorAll('[data-mine-dish] input')[1], 'Twice a week.');
  await click(document.querySelectorAll('[data-mine-dish]')[1].querySelector('button[aria-label="Move up"]'));
  // The doc changes elsewhere while the editor is open.
  world.stored = { ...world.stored, bizCard: { name: 'Second Helping' } };
  await click(document.querySelector('[data-save-mine]'));
  assert.ok(world.saved, 'saved');
  assert.deepEqual(world.saved.d.kitchen, {
    plate: { veg: 50, protein: 30, carbs: 20 },
    rules: ['A palm of protein', 'A fist of carbs'],
    staples: [{ n: 'Eggs', g: 'fridge' }, { n: 'Oats', g: 'pantry' }],
    dishes: [{ r: 'sheet-pan-salmon-sweet-potato-and-broccoli', note: 'Twice a week.' }, { r: 'greek-yogurt-power-bowl', note: 'Early mornings.' }],
  });
  assert.equal(world.saved.d.bio, 'Kept');
  assert.equal(world.saved.d.bizCard.name, 'Second Helping', 'a key saved elsewhere since is kept');
  assert.equal('studio' in world.saved.d, false, 'no studio written for a nutritionist');
  assert.deepEqual(world.saved.opts, { expectedUserId: 'u-nadia' });
  await m.unmount();
});

test('Make it yours: an emptied kitchen drops the key, a nutritionist starts amber, and the picker stops at six', async () => {
  reset({ me: 'u-nadia', stored: { kitchen: { rules: ['Only rule'], dishes: [{ r: 'greek-yogurt-power-bowl' }] } } });
  let m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await click(button(/^Your kitchen$/));
  await click(document.querySelector('button[aria-label="Remove"]'));
  await click(document.querySelector('[data-remove-dish]'));
  await click(document.querySelector('[data-save-mine]'));
  assert.equal('kitchen' in world.saved.d, false, 'no empty kitchen is stored');
  await m.unmount();
  reset({ me: 'u-nadia', stored: {} });
  m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  assert.equal(document.querySelector('[data-accent="amber"]').getAttribute('aria-pressed'), 'true', 'no look yet: amber');
  await click(button(/^Your kitchen$/));
  for (const b of [...document.querySelectorAll('[data-kitchen-pick]')].slice(0, 7)) await click(b);
  assert.equal(document.querySelectorAll('[data-mine-dish]').length, 6);
  assert.match(m.text(), /Up to 6 recipes\./);
  await m.unmount();
});

test('a seeded nutritionist listing is a sample: its listing by id, a sample kitchen and plate notes, times never taken', async () => {
  const rae = { who: 'Rae Lindqvist', kind: 'NUTRI', providerId: 52, city: 'Remote', bio: 'Plant-forward fuelling.', specialty: 'Plant-based nutrition Vegan', rating10: 9.8 };
  reset({ me: 'u-me', byId: { id: 52, owner_id: null, name: 'Rae Lindqvist', price: 110, specialty: 'Plant-based nutrition', credential: 'RD', verified: false, listing_media: { cover: null, gallery: [] }, monthly_offer: null }, slots: [] });
  const m = await mount(page({ person: rae }));
  assert.deepEqual(world.roles[0], ['listingById', 'nutritionist']);
  assert.equal(world.byIdFor, 52);
  assert.match(m.text(), /Rae hasn't set up a Shape account yet, so the kitchen, plate notes, reviews and times here are samples\./);
  assert.ok(!document.querySelector('img[alt="Rae\'s wall photo"]'), 'no sample wall photo: their colours');
  await click(button(/^Rae's kitchen$/));
  assert.match(document.querySelector('[data-kitchen-plate]').textContent, /Beans, lentils or tofu at every meal/, 'a plant kitchen for a plant-based specialty');
  assert.ok(document.querySelectorAll('[data-staple]').length >= 8);
  assert.equal(document.querySelectorAll('[data-dish]').length, 6, 'six recipes, every one in the catalog');
  await click(button(/^Plate notes$/));
  assert.equal(document.querySelectorAll('[data-plate-day]').length, 2);
  await click(button(/^Rae's day$/));
  assert.match(m.text(), /Sample times: Rae hasn't set open hours on Shape yet\./);
  assert.ok([...document.querySelectorAll('[data-open-time]')].every((b) => b.disabled), 'sample times are not to take');
  await m.unmount();
});

test('signed out, the nutritionist app\'s own page is the sample, and Make it yours changes it on screen only', async () => {
  reset({ me: null });
  const m = await mount(page({ person: { who: 'Dr. Maya Patel', kind: 'NUTRI' }, isSelf: true }));
  assert.match(m.text(), /Sports nutrition · Second Helping Nutrition/);
  assert.match(m.text(), /Food that fits your training and your week/);
  await click(button(/kitchen$/));
  assert.equal(document.querySelectorAll('[data-dish]').length, 6);
  await click(button(/^Make it yours$/));
  await click(button(/^Your kitchen$/));
  await click(document.querySelector('[data-plate-preset="lighter"]'));
  await click(document.querySelector('[data-save-mine]'));
  assert.equal(world.saved, null, 'nothing written');
  await click(button(/kitchen$/));
  assert.match(document.querySelector('[data-kitchen-plate]').textContent, /Vegetables\s*50%.*Protein\s*35%.*Carbs\s*15%/, 'the page shows the change');
  await m.unmount();
});

// ── The data ───────────────────────────────────────────────────────────────────────────────
test('the kitchen doc: a plate that adds up, rules, staples and recipes, cleaned; nothing to show is no key', () => {
  assert.equal(bsProfileKitchen(null), null);
  assert.equal(bsProfileKitchen({ rules: ['  '], staples: [], dishes: [] }), null);
  assert.equal(bsProfileKitchen([]), null);
  // The plate: steps of five that add up to 100, or none.
  assert.deepEqual(bsKitchenPlate({ veg: 50, protein: 30, carbs: 20, extra: 1 }), { veg: 50, protein: 30, carbs: 20 });
  for (const bad of [{ veg: 50, protein: 30, carbs: 25 }, { veg: 50, protein: 27, carbs: 23 }, { veg: 110, protein: -5, carbs: -5 }, { veg: '50', protein: 25, carbs: 25 }, null, []]) assert.equal(bsKitchenPlate(bad), null, JSON.stringify(bad));
  const k = bsProfileKitchen({
    plate: { veg: 40, protein: 30, carbs: 30 }, extra: 'dropped',
    rules: ['  A palm\u0007  ', '', 'x'.repeat(90), 'b', 'c', 'd', 'e'],
    staples: [{ n: 'Eggs', g: 'fridge' }, { n: 'eggs', g: 'pantry' }, { n: 'Oats', g: 'garage' }, { n: '' }, 'str', ...Array.from({ length: 20 }, (_, i) => ({ n: 'S' + i, g: 'pantry' }))],
    dishes: [
      { r: 'Greek-Yogurt-Power-Bowl', note: 'x'.repeat(400), extra: 1 }, { r: 'greek-yogurt-power-bowl' }, { r: 'bad slug!' }, { r: '-lead' }, { r: 7 }, null,
      { r: 'a' }, { r: 'b' }, { r: 'c' }, { r: 'd' }, { r: 'e' }, { r: 'f' },
    ],
  });
  assert.deepEqual(k.plate, { veg: 40, protein: 30, carbs: 30 });
  assert.equal('extra' in k, false);
  assert.deepEqual(k.rules, ['A palm', 'x'.repeat(60), 'b', 'c'], 'cleaned, cut at 60, four at most');
  assert.deepEqual(k.staples.slice(0, 3), [{ n: 'Eggs', g: 'fridge' }, { n: 'Oats', g: 'pantry' }, { n: 'S0', g: 'pantry' }], 'one of each name; an unknown place is the pantry');
  assert.equal(k.staples.length, 12);
  assert.deepEqual(k.dishes.map((d) => d.r), ['greek-yogurt-power-bowl', 'a', 'b', 'c', 'd', 'e'], 'lowercased, deduplicated, shaped, six at most');
  assert.equal(k.dishes[0].note.length, 160);
  assert.equal(bsProfileKitchen({ dishes: [{ r: 'x'.repeat(81) }] }), null, 'a slug past 80 characters');
  // A long array is scanned only so far (the doc is public-read).
  assert.equal(bsProfileKitchen({ dishes: Array.from({ length: 5000 }, () => ({ r: 'bad slug' })).concat([{ r: 'late' }]) }), null);
  // The save path keeps it, cleaned, and drops it when empty.
  assert.deepEqual(bsNormalizeProfileCustom({ kitchen: { rules: ['R'], dishes: [{ r: 'A' }] } }, 'u').kitchen, { plate: null, rules: ['R'], staples: [], dishes: [{ r: 'a' }] });
  assert.equal('kitchen' in bsNormalizeProfileCustom({ kitchen: { rules: [''] } }, 'u'), false);
});

test('every sample kitchen and meal is the Shape Kitchen\'s own, with the recipe\'s own macros', () => {
  for (const [slug, [title, kcal, p, c, f]] of Object.entries(BS_NUTRI_SAMPLE_RECIPES)) {
    const r = bsKitchenRecipe(slug);
    assert.ok(r, `${slug} is in the catalog`);
    assert.deepEqual([title, kcal, p, c, f], [r.title, r.kcal, r.macros.p, r.macros.c, r.macros.f], `${slug}: the recipe's own name and macros`);
  }
  for (const kind of BS_NUTRI_SAMPLE_KINDS) {
    const d = bsNutritionistDemo({ kind });
    const k = d.custom.kitchen;
    assert.deepEqual(bsProfileKitchen(k), k, `${kind}: already clean`);
    assert.ok(k.plate && k.rules.length && k.staples.length >= 8, `${kind}: a plate, rules and staples`);
    assert.equal(k.dishes.length, 6, kind);
    for (const dish of k.dishes) assert.ok(bsKitchenRecipe(dish.r), `${kind}: ${dish.r} is in the catalog`);
    assert.ok(d.plates.length >= 6, `${kind}: two days of meals`);
    for (const pl of d.plates) {
      if (!pl.meal.recipeId) continue;
      const r = bsKitchenRecipe(pl.meal.recipeId);
      assert.deepEqual([pl.title, pl.meal.kcal, pl.meal.p, pl.meal.c, pl.meal.f], [r.title, r.kcal, r.macros.p, r.macros.c, r.macros.f], `${kind}: ${r.title}`);
    }
    assert.equal(d.custom.look.accent, 'amber');
    assert.doesNotMatch(JSON.stringify(d.reviews), /\b(she|he|her|him|his)\b/i, `${kind}: no pronouns for a sample coach`);
  }
  assert.equal(bsNutritionistSampleOf({ specialty: 'Plant-based nutrition' }).kind, 'plant');
  assert.equal(bsNutritionistSampleOf({ specialty: 'Sports nutrition, endurance' }).kind, 'performance');
  assert.equal(bsNutritionistSampleOf({ specialty: 'Weight management' }).kind, 'steady');
  assert.equal(bsNutritionistSampleOf({ specialty: 'Family and gut health' }).kind, 'everyday');
  assert.equal(bsNutritionistSampleOf({ key: 'x', specialty: '' }).kind, bsNutritionistSampleOf({ key: 'x' }).kind, 'the same seed, the same sample');
});

test('the recipe picker finds recipes by title, diet or tag, and a slug names one recipe', () => {
  assert.ok(bsKitchenSearch('salmon').every((r) => /salmon/i.test([r.title, r.diet, ...(r.tags || [])].join(' '))));
  assert.ok(bsKitchenSearch('vegan').length > 0);
  assert.equal(bsKitchenSearch('', 5).length, 5);
  assert.equal(bsKitchenSearch('no such dish anywhere').length, 0);
  const r = bsKitchenSearch('greek yogurt')[0];
  assert.equal(bsKitchenRecipe(bsKitchenSlug(r)), r);
  assert.equal(bsKitchenRecipe('nope'), null);
  assert.equal(bsKitchenRecipe(null), null);
});

test('a day of plate notes totals protein and energy only when every meal carried them', () => {
  const day = (meals) => bsPlateNoteDays(meals.map((m, i) => ({ title: 'Meal ' + i, created_at: at(1, 8 + i), meal: m })))[0];
  assert.deepEqual([day([{ kcal: 400, p: 30 }, { kcal: 600, p: 40 }]).kcal, day([{ kcal: 400, p: 30 }, { kcal: 600, p: 40 }]).protein], [1000, 70]);
  const gap = day([{ kcal: 400, p: 30 }, { p: 40 }]);
  assert.equal(gap.kcal, null, 'a meal with no energy logged leaves the day without a total, never an undercount');
  assert.equal(gap.proteinAll, true);
  assert.equal(day([{ kcal: 400 }, { kcal: 600, p: 40 }]).proteinAll, false);
});
