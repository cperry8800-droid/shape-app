// The nutritionist profile, MOUNTED: mobile-app/src/broadsheet/BSTrainerProfile.jsx opened for a
// nutritionist, and its editor BSMakeItYours.jsx, in the real broadsheet chrome, against scripted
// profile, listing, availability, booking and feed backends, reading the real English catalogs and
// the real Shape Kitchen. The design is the owner's of 2026-10-27 ("lets do something different for
// nutritionists"): the trainer profile's style, with "Her kitchen" (no floor plan) and "Plate notes"
// (a day of meals, stepped through); and of 2026-10-29: "It will be their own recipes", with the
// plate, the staples and the recipes all kept and organized.
//
// What it pins: a nutritionist's page reads, sells and books as a nutritionist and starts amber; its
// tabs are their day, their kitchen and plate notes (never the studio or replays); the kitchen shows
// one part at a time (their recipes, their plate, their staples), a visitor only the parts with
// something in them; a recipe opens with its numbers, note, ingredients and method, cooks in Shape's
// cook mode and goes onto the member's grocery lists as one list; a member puts staples on their own
// grocery list; plate notes group shared meals by day and step through them with the protein so far,
// never showing a macro the meal didn't carry; Make it yours writes recipes (typed or pasted, with a
// photo of their own) and edits the plate, rules and staples, saved onto the doc as it is at save
// time; a nutritionist with no account is a sample, whose recipes and meals are the catalog's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsProfileKitchen, bsKitchenPlate, bsKitchenRecipeItem, bsNormalizeProfileCustom } from '../mobile-app/src/services/profileCustom.mjs';
import { BS_SUPABASE_HOST } from '../public/newdesign/listingMedia.mjs';
import { bsNutritionistDemo, bsNutritionistSampleOf, BS_NUTRI_SAMPLE_KINDS, BS_NUTRI_SAMPLE_RECIPES } from '../mobile-app/src/services/nutritionistDemo.mjs';
import { bsKitchenRecipe, bsKitchenMinutes, bsOwnRecipeGroceryList, bsOwnRecipeCookable, bsShortHash } from '../mobile-app/src/broadsheet/kitchenRecipes.js';

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
const { BSTrainerProfile, bsPlateNoteDays, energySplit } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });
// Shape's cook mode and the Kitchen's recipe page (the client module's), as probes.
window.BSCookMode = ({ cookable, onClose }) => React.createElement('div', { 'data-cook-mode': '' }, `${cookable.title} · ${cookable.steps.length} steps · ${cookable.ingredients.length} ingredients`,
  React.createElement('button', { type: 'button', onClick: onClose }, 'Leave cook mode'));
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
window.ShapeCommunity = { listByAuthor: async () => ({ data: world.posts }), uploadPhoto: async (f) => { world.uploaded = f; if (world.uploadGate) await world.uploadGate; return world.uploadUrl; } };
window.shapeDb = {
  getUserGoals: async (k, opts) => { world.readWith = opts; if (opts && opts.expectedUserId != null && opts.expectedUserId !== world.me) return null; return world.stored; },
  saveUserGoals: async (k, d, opts) => { if (opts && opts.expectedUserId && opts.expectedUserId !== world.me) return { error: { message: 'Account changed' } }; world.saved = { k, d, opts }; return { ok: true }; },
};
window.ShapeBookings = { submitConsultationBooking: async (a) => { world.booked = a; return { ok: true }; } };
window.bsProfileCardFromPost = (p) => p;
window.useBSCoachCommerce = ({ person, isNutri }) => ((world.commerceSeen = person.commerce), (world.isNutriSeen = isNutri), { commerce: person.commerce, commerceCoach: person.commerce && person.commerce.coach, atCapacity: false, wl: null });
window.BSCoachCoachingBlock = ({ cm, isNutri }) => (world.blockNutri = isNutri, React.createElement('div', { 'data-coaching-block': '' }, cm.commerce.packages.map((p) => `${p.name} ${p.price}`).join(' ')));


const nadia = { userId: 'u-nadia', who: 'Nadia Rahman', kind: 'NUTRI' };
const page = (props = {}) => React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
  React.createElement(BSTrainerProfile, { person: nadia, onBack: () => {}, onMessage: () => {}, ...props }));
// A photo in a coach's own upload folder, as Shape's storage serves it.
const own = (uid, file) => `https://${BS_SUPABASE_HOST}/storage/v1/object/public/community-photos/${uid}/${file}`;
const BOWL = {
  id: 'r1', t: 'Post-lift rice bowl', note: 'After every heavy session.', min: 25, serves: 2, kcal: 610, p: 45, c: 70, f: 14,
  ing: [{ n: '1 cup', m: 'jasmine rice' }, { n: '200 g', m: 'chicken thigh' }, { m: 'spring onions' }],
  steps: ['Rinse the rice and cook it for 15 minutes.', 'Sear the chicken, slice it and serve it over the rice.'],
  photo: own('u-nadia', 'bowl.jpg'),
};
const OATS = { id: 'r2', t: 'Overnight oats', kcal: 420, p: 28, ing: [{ n: '1/2 cup', m: 'oats' }], steps: ['Stir it all and leave it overnight.'], photo: own('u-someone-else', 'oats.jpg') };
const KITCHEN = {
  plate: { veg: 50, protein: 25, carbs: 25 },
  rules: ['A palm of protein at every meal', 'A fist of carbs'],
  staples: [{ n: 'Greek yogurt', g: 'fridge' }, { n: 'Oats', g: 'pantry' }, { n: 'Frozen berries', g: 'freezer' }],
  recipes: [BOWL, OATS, { id: 'NOT AN ID', t: 'Dropped' }],
};
const section = (k) => document.querySelector(`[data-kitchen-section="${k}"]`);
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
// Lists saved to the member's grocery lists, as the Eat page takes them while it is on screen
// (BSGroceryShare's one writer); and the account check a guest meets.
function groceryWorld() {
  const received = [];
  const asked = [];
  const onList = (e) => { received.push(e.detail.list); e.detail.handled = true; };
  window.addEventListener('shape:groceryReceived', onList);
  window.bsRequireAccount = (why) => { asked.push(why); return world.me != null; };
  return { received, asked, done: () => { window.removeEventListener('shape:groceryReceived', onList); delete window.bsRequireAccount; } };
}
// Picks a file in a file input, as a browser hands one over.
async function pickFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new window.Event('change', { bubbles: true })); });
  await flush();
}

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
  assert.equal(world.blockNutri, true, 'the storefront block files plans as a nutritionist\'s (Codex P1 on #2497)');
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
  assert.match(m.text(), /Show members your recipes, the plate you teach and what is always in your kitchen\./);
  assert.ok(button(/^Fill your kitchen$/));
  await click(button(/^Plate notes$/));
  assert.match(m.text(), /each day you share becomes a plate note here/);
  await m.unmount();
});

test('her kitchen: one part at a time, her recipes first, then her plate and her staples; a visitor sees only the parts with something in them', async () => {
  reset({ custom: { kitchen: KITCHEN } });
  let m = await mount(page());
  await click(button(/^Her kitchen$/));
  assert.deepEqual([...document.querySelectorAll('[data-kitchen-section]')].map((b) => b.textContent), ['Recipes2', 'Plate', 'Staples3'], 'the three parts, with how much is in each');
  assert.equal(section('recipes').getAttribute('aria-pressed'), 'true', 'it opens on the recipes');
  assert.ok(!document.querySelector('[data-kitchen-plate]') && !document.querySelector('[data-kitchen-staples]'), 'one part at a time');
  const cards = [...document.querySelectorAll('[data-recipe]')];
  assert.deepEqual(cards.map((c) => c.getAttribute('data-recipe')), ['r1', 'r2'], 'her order; a recipe that does not clean is not shown');
  assert.match(cards[0].textContent, /Post-lift rice bowl/);
  assert.match(cards[0].textContent, /25 min · 610 kcal · 45 g protein/, 'the recipe\'s time, energy and protein');
  assert.match(cards[0].textContent, /After every heavy session\./, 'her note');
  assert.match(cards[0].textContent, /Try it in Shape/);
  assert.equal(cards[0].querySelector('img').getAttribute('src'), own('u-nadia', 'bowl.jpg'), 'her own photo');
  assert.match(cards[1].textContent, /^O/, 'another account\'s photo is never shown: her colours and the first letter');
  assert.ok(!cards[1].querySelector('img'));
  assert.match(cards[1].textContent, /420 kcal · 28 g protein/, 'only the numbers it has');
  await click(section('plate'));
  const plate = document.querySelector('[data-kitchen-plate]');
  assert.match(plate.textContent, /The plate Nadia teaches/);
  assert.match(plate.textContent, /Vegetables\s*50%.*Protein\s*25%.*Carbs\s*25%/);
  assert.match(plate.textContent, /A palm of protein at every meal.*A fist of carbs/);
  assert.ok(!document.querySelector('[data-recipe]'));
  await click(section('staples'));
  const staples = document.querySelector('[data-kitchen-staples]').textContent;
  assert.match(staples, /Always in the kitchen/);
  assert.match(staples, /Fridge\s*Greek yogurt.*Pantry\s*Oats.*Freezer\s*Frozen berries/, 'grouped where they live');
  await m.unmount();
  // Only staples: no parts to pick from, the staples straight away.
  reset({ custom: { kitchen: { staples: KITCHEN.staples } } });
  m = await mount(page());
  await click(button(/^Her kitchen$/));
  assert.ok(!document.querySelector('[data-kitchen-section]'));
  assert.ok(document.querySelector('[data-kitchen-staples]'));
  await m.unmount();
});

test('a recipe opens with its numbers, her note, the ingredients and the method, and cooks in Shape\'s cook mode', async () => {
  reset({ custom: { kitchen: KITCHEN } });
  const m = await mount(page());
  await click(button(/^Her kitchen$/));
  await click(document.querySelector('[data-recipe="r1"]'));
  const sheet = () => document.querySelector('[data-own-recipe="r1"]');
  assert.ok(sheet(), 'the recipe, over the page');
  assert.match(sheet().textContent, /Nadia's kitchen.*Post-lift rice bowl.*25 min · Serves 2/);
  assert.deepEqual([...document.querySelectorAll('[data-recipe-macros] > div')].map((d) => d.textContent), ['610 kcal', '45 gProtein', '70 gCarbs', '14 gFat']);
  assert.match(sheet().textContent, /Nadia's note.*After every heavy session\./);
  assert.deepEqual([...document.querySelectorAll('[data-recipe-ingredients] li')].map((li) => li.textContent), ['1 cupjasmine rice', '200 gchicken thigh', 'spring onions']);
  assert.deepEqual([...document.querySelectorAll('[data-recipe-method] li')].map((li) => li.textContent), ['1Rinse the rice and cook it for 15 minutes.', '2Sear the chicken, slice it and serve it over the rice.']);
  await click(document.querySelector('[data-cook-recipe]'));
  assert.equal(document.querySelector('[data-cook-mode]').textContent.replace('Leave cook mode', ''), 'Post-lift rice bowl · 2 steps · 3 ingredients', 'cook mode, on her recipe');
  await click(button(/^Leave cook mode$/));
  assert.ok(!document.querySelector('[data-cook-mode]') && sheet(), 'back on the recipe');
  await click(document.querySelector('[data-recipe-back]'));
  assert.ok(!sheet() && document.querySelector('[data-trainer-profile]'), 'Back closes it, onto the profile');
  await m.unmount();
});

test('a recipe\'s ingredients go onto the member\'s grocery lists as one list, the same list each time; a guest is asked for an account', async () => {
  const g = groceryWorld();
  try {
    reset({ custom: { kitchen: KITCHEN } });
    let m = await mount(page());
    await click(button(/^Her kitchen$/));
    await click(document.querySelector('[data-recipe="r1"]'));
    const add = () => document.querySelector('[data-recipe-list]');
    assert.equal(add().textContent, 'Add the ingredients to my grocery list');
    await click(add());
    assert.equal(g.received.length, 1);
    const list = g.received[0];
    assert.equal(list.id, `kr-${bsShortHash('u-nadia')}-r1`, 'one id per coach and recipe');
    assert.equal(list.name, 'Post-lift rice bowl');
    assert.equal(list.eyebrow, "Nadia's kitchen");
    assert.equal(list.kind, 'recipe');
    assert.deepEqual(list.items.map((i) => [i.n, i.q]), [['jasmine rice', '1 cup'], ['chicken thigh', '200 g'], ['spring onions', '']]);
    assert.equal(add().textContent, '✓ On your grocery list, under Eat');
    await m.unmount();
    m = await mount(page());
    await click(button(/^Her kitchen$/));
    await click(document.querySelector('[data-recipe="r1"]'));
    await click(add());
    assert.equal(g.received[1].id, g.received[0].id, 'sent again, the same list');
    await m.unmount();
    // Signed out: asked for an account, and nothing is saved.
    reset({ me: null, custom: { kitchen: KITCHEN } });
    m = await mount(page());
    await click(button(/^Her kitchen$/));
    await click(document.querySelector('[data-recipe="r2"]'));
    await click(add());
    assert.deepEqual(g.asked.slice(-1), ['add to your grocery list']);
    assert.equal(g.received.length, 2);
    await m.unmount();
    // On her own page she can cook it, but not send it to a grocery list.
    reset({ me: 'u-nadia', stored: { kitchen: KITCHEN } });
    m = await mount(page({ isSelf: true }));
    await click(button(/^Her kitchen$/));
    await click(document.querySelector('[data-recipe="r1"]'));
    assert.ok(document.querySelector('[data-cook-recipe]') && !add());
    await m.unmount();
  } finally { g.done(); }
});

test('a member picks staples and adds them to their own grocery lists as one list; a guest is asked for an account', async () => {
  const g = groceryWorld();
  try {
    reset({ custom: { kitchen: KITCHEN } });
    let m = await mount(page());
    await click(button(/^Her kitchen$/));
    await click(section('staples'));
    const add = document.querySelector('[data-add-staples]');
    assert.ok(add.disabled, 'nothing picked, nothing to add');
    assert.match(add.textContent, /Pick what to add/);
    const chips = [...document.querySelectorAll('[data-staple]')];
    await click(chips[0]);
    await click(chips[2]);
    assert.equal(chips[0].getAttribute('aria-pressed'), 'true');
    assert.match(document.querySelector('[data-add-staples]').textContent, /Add 2 to my grocery list/);
    await click(document.querySelector('[data-add-staples]'));
    assert.equal(g.received.length, 1, 'one list');
    assert.equal(g.received[0].name, "Nadia's staples");
    assert.deepEqual(g.received[0].items.map((i) => i.n), ['Greek yogurt', 'Frozen berries']);
    assert.match(m.text(), /Added to your grocery lists, under Eat\./);
    assert.equal(document.querySelectorAll('[data-staple][aria-pressed="true"]').length, 0, 'the picks clear');
    // The same staples again make the same list, so the grocery store keeps one copy.
    await click(document.querySelectorAll('[data-staple]')[0]);
    await click(document.querySelectorAll('[data-staple]')[2]);
    await click(document.querySelector('[data-add-staples]'));
    assert.equal(g.received[1].id, g.received[0].id);
    await m.unmount();
    // Signed out: asked for an account, and nothing is saved.
    reset({ me: null, custom: { kitchen: KITCHEN } });
    m = await mount(page());
    await click(button(/^Her kitchen$/));
    await click(section('staples'));
    await click(document.querySelectorAll('[data-staple]')[1]);
    await click(document.querySelector('[data-add-staples]'));
    assert.deepEqual(g.asked.slice(-1), ['add to your grocery list']);
    assert.equal(g.received.length, 2, 'nothing more saved');
    await m.unmount();
    // On their own page the staples are shown, not offered.
    reset({ me: 'u-nadia', stored: { kitchen: KITCHEN } });
    m = await mount(page({ isSelf: true }));
    await click(button(/^Her kitchen$/));
    await click(section('staples'));
    assert.ok(!document.querySelector('button[data-staple]') && !document.querySelector('[data-add-staples]'));
    assert.equal(document.querySelectorAll('[data-staple]').length, 3);
    await m.unmount();
  } finally { g.done(); }
});

test('a bigger pick of long staple names is its own list', async () => {
  const g = groceryWorld();
  try {
    reset({ custom: { kitchen: { staples: [
      { n: 'Unsweetened almond milk, barista style', g: 'fridge' },
      { n: 'Unsweetened almond milk, original', g: 'fridge' },
      { n: 'Unsweetened almond milk, vanilla', g: 'fridge' },
    ] } } });
    const m = await mount(page());
    await click(button(/^Her kitchen$/));
    await click(document.querySelectorAll('[data-staple]')[0]);
    await click(document.querySelectorAll('[data-staple]')[1]);
    await click(document.querySelector('[data-add-staples]'));
    for (const i of [0, 1, 2]) await click(document.querySelectorAll('[data-staple]')[i]);
    await click(document.querySelector('[data-add-staples]'));
    assert.equal(g.received.length, 2);
    assert.notEqual(g.received[1].id, g.received[0].id, 'the same first names with one more is a different list, never kept as the first');
    assert.equal(g.received[1].items.length, 3);
    await m.unmount();
  } finally { g.done(); }
});

test('on her own page each empty part says what goes there and opens Make it yours on it', async () => {
  reset({ me: 'u-nadia', stored: { kitchen: { staples: [{ n: 'Eggs', g: 'fridge' }] } } });
  const m = await mount(page({ isSelf: true }));
  await click(button(/^Her kitchen$/));
  assert.deepEqual([...document.querySelectorAll('[data-kitchen-section]')].map((b) => b.getAttribute('data-kitchen-section')), ['recipes', 'plate', 'staples'], 'all three parts');
  assert.match(m.text(), /Write the recipes you give clients\./);
  await click(section('plate'));
  assert.match(m.text(), /Show members how you build a plate/);
  await click(document.querySelector('[data-kitchen-fill="plate"]'));
  assert.ok(document.querySelector('[data-mine-part="plate"]'), 'Make it yours, on the plate');
  await click(button(/^← Profile$/));
  await click(button(/^Her kitchen$/));
  await click(document.querySelector('[data-kitchen-fill="recipes"]'));
  assert.ok(document.querySelector('[data-mine-part="recipes"]'), 'and on the recipes');
  await m.unmount();
});

test('plate notes: shared meals by day, newest first, stepped through with the protein so far and her note', async () => {
  reset({ posts: twoDays() });
  const g = groceryWorld();
  const m = await mount(page());
  try {
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
    assert.ok(document.querySelector('[data-plate-step] [role="img"]').getAttribute('aria-label').match(/Energy: 33% protein, 44% carbs, 23% fat/), 'where the meal\'s energy came from');
    assert.match(m.text(), /Nadia's note.*Before a 7 am lift\./);
    await click(button(/^Next →$/));
    assert.match(step(), /Rice bowl/);
    assert.match(step(), /30 g protein/);
    assert.doesNotMatch(step(), /carbs|fat|(^|[^0-9])0 g/, 'a macro the meal didn\'t carry is left out, never shown as 0');
    assert.match(step(), /Protein so far: 68 g/);
    assert.ok(!document.querySelector('[data-plate-step] [role="img"]'), 'no split without all three macros');
    await click(button(/^← Previous$/));
    await click(document.querySelector('[data-plate-recipe]'));
    assert.match(document.querySelector('[data-recipe-page]').textContent, /Greek yogurt power bowl/, 'a meal from a Shape Kitchen recipe opens it');
    // Its grocery button puts the recipe's own list on the member's lists, as Eat makes it.
    await click(document.querySelector('[data-recipe-grocery]'));
    assert.equal(g.received[0].id, 'sk-greek-yogurt-power-bowl');
    assert.equal(g.received[0].name, 'Greek yogurt power bowl grocery list');
    assert.deepEqual(g.received[0].items.map((i) => [i.n, i.q]), bsKitchenRecipe('greek-yogurt-power-bowl').ingredients.map((x) => [x.m, x.n]));
    assert.match(document.querySelector('[data-recipe-grocery]').textContent, /^On your grocery list$/);
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
  } finally { g.done(); await m.unmount(); }
});

test('Make it yours: a nutritionist writes a recipe from a paste with a photo of her own, edits one, and sets the plate, rules and staples, saved onto the doc as it is at save time', async () => {
  reset({ me: 'u-nadia', uploadUrl: own('u-nadia', 'lentils.jpg'), stored: { bio: 'Kept', kitchen: { plate: { veg: 50, protein: 25, carbs: 25 }, rules: ['Old rule'], staples: [{ n: 'Eggs', g: 'fridge' }], recipes: [BOWL] } } });
  window.ShapeRecipeImport = { parse: async (text) => { world.pasted = text; return { ok: true, draft: { title: 'Red lentil soup', servings: 4, ingredients: [{ n: '1 cup', m: 'red lentils' }, { n: '1', m: 'onion' }], steps: ['Soften the onion.', 'Add the lentils and water and simmer for 20 minutes.'] } }; } };
  const m = await mount(page({ isSelf: true }));
  try {
    await click(button(/^Make it yours$/));
    assert.ok(button(/^Your kitchen$/), 'the kitchen tab');
    assert.ok(!button(/^Your space$/), 'not the studio');
    await click(button(/^Your kitchen$/));
    assert.ok(document.querySelector('[data-mine-part="recipes"]'), 'it opens on the recipes');
    assert.equal(document.querySelectorAll('[data-mine-recipe]').length, 1);
    // A new recipe, laid out from a paste: the name, servings, ingredients and method.
    await click(document.querySelector('[data-write-recipe]'));
    await click(document.querySelector('[data-recipe-paste]'));
    await type(document.querySelector('[data-recipe-form] textarea'), 'Red lentil soup\n1 cup red lentils\n1 onion\nSoften the onion...');
    await click(document.querySelector('[data-paste-fill]'));
    assert.match(world.pasted, /^Red lentil soup/);
    assert.match(m.text(), /Laid out from your paste by AI\. Check every line\./);
    assert.equal(document.querySelector('[data-recipe-title]').value, 'Red lentil soup');
    assert.equal(document.querySelector('[data-recipe-num="serves"]').value, '4');
    assert.equal(document.querySelectorAll('[data-recipe-ing]').length, 2);
    assert.equal(document.querySelectorAll('[data-recipe-step]').length, 2);
    // Her photo, her note, the numbers. Edits made while the photo uploads are kept when it lands
    // (Codex P2 on #2497).
    let land;
    world.uploadGate = new Promise((r) => { land = r; });
    await pickFile(document.querySelector('[data-recipe-form] input[type="file"]'), new window.File(['x'], 'soup.jpg', { type: 'image/jpeg' }));
    assert.equal(world.uploaded.name, 'soup.jpg');
    await type(document.querySelector('[data-recipe-num="c"]'), '60');
    await act(async () => { land(); });
    await flush();
    world.uploadGate = null;
    assert.equal(document.querySelector('[data-recipe-num="c"]').value, '60', 'typed while it uploaded, kept');
    assert.equal(document.querySelector('[data-recipe-form] img').getAttribute('src'), own('u-nadia', 'lentils.jpg'));
    await type(document.querySelector('input[aria-label="Why you give it to clients"]'), 'The cheapest high-protein lunch I know.');
    await type(document.querySelector('[data-recipe-num="min"]'), '35');
    await type(document.querySelector('[data-recipe-num="kcal"]'), '380');
    await type(document.querySelector('[data-recipe-num="p"]'), '22.4');
    await click(document.querySelector('[data-add-ing]'));
    const ings = document.querySelectorAll('[data-recipe-ing]');
    await type(ings[2].querySelectorAll('input')[1], 'lemon');
    await click(document.querySelector('[data-recipe-done]'));
    assert.deepEqual([...document.querySelectorAll('[data-mine-recipe]')].map((r) => r.getAttribute('data-mine-recipe')).length, 2, 'kept in the list');
    // Moved to the top, and the old one renamed.
    await click(document.querySelectorAll('[data-mine-recipe]')[1].querySelector('button[aria-label="Move up"]'));
    await click(document.querySelector('[data-edit-recipe="r1"]'));
    await type(document.querySelector('[data-recipe-title]'), 'Post-lift rice bowl, doubled');
    await click(document.querySelector('[data-recipe-done]'));
    // The plate: more protein takes from the vegetables; less carbs gives to them. Always 100.
    await click(button(/^Plate$/));
    assert.equal(document.querySelector('[data-plate-preset="everyday"]').getAttribute('aria-pressed'), 'true', 'it opens on their plate');
    await click(button(/^More Protein$/));
    const parts = () => ['veg', 'protein', 'carbs'].map((k) => document.querySelector(`[data-plate-part="${k}"]`).textContent);
    assert.deepEqual(parts(), ['45%', '30%', '25%']);
    await click(button(/^Less Carbs$/));
    assert.deepEqual(parts(), ['50%', '30%', '20%']);
    await type(document.querySelector('input[value="Old rule"]'), 'A palm of protein');
    await click(document.querySelector('[data-add-rule]'));
    const ruleInputs = [...document.querySelectorAll('input')].filter((i) => i.getAttribute('aria-label') === 'Your portion rules');
    await type(ruleInputs[1], 'A fist of carbs');
    // A staple in the pantry.
    await click(button(/^Staples$/));
    await click(button(/^Pantry$/));
    await type(document.querySelector('input[aria-label="A staple"]'), 'Oats');
    await click(document.querySelector('[data-add-staple]'));
    assert.equal(document.querySelectorAll('[data-mine-staple]').length, 2);
    // A recipe still being written holds the save until Done or Cancel.
    await click(button(/^Recipes$/));
    await click(document.querySelector('[data-write-recipe]'));
    await click(document.querySelector('[data-save-mine]'));
    assert.equal(world.saved, null, 'nothing saved under an open recipe');
    assert.match(m.text(), /Finish the recipe you are writing first: Done or Cancel\./);
    await click(document.querySelector('[data-recipe-cancel]'));
    // The doc changes elsewhere while the editor is open.
    world.stored = { ...world.stored, bizCard: { name: 'Second Helping' } };
    await click(document.querySelector('[data-save-mine]'));
    assert.ok(world.saved, 'saved');
    const k = world.saved.d.kitchen;
    assert.deepEqual({ ...k, recipes: undefined }, {
      plate: { veg: 50, protein: 30, carbs: 20 },
      rules: ['A palm of protein', 'A fist of carbs'],
      staples: [{ n: 'Eggs', g: 'fridge' }, { n: 'Oats', g: 'pantry' }],
      recipes: undefined,
    });
    assert.equal(k.recipes.length, 2);
    const soup = k.recipes[0];
    assert.match(soup.id, /^[a-z0-9]{1,24}$/);
    assert.deepEqual({ ...soup, id: undefined }, {
      id: undefined, t: 'Red lentil soup', note: 'The cheapest high-protein lunch I know.', min: 35, serves: 4, kcal: 380, p: 22, c: 60,
      ing: [{ n: '1 cup', m: 'red lentils' }, { n: '1', m: 'onion' }, { m: 'lemon' }],
      steps: ['Soften the onion.', 'Add the lentils and water and simmer for 20 minutes.'],
      photo: own('u-nadia', 'lentils.jpg'),
    }, 'the pasted recipe with her photo, her note and the numbers (rounded), and the empty rows dropped');
    assert.deepEqual(k.recipes[1], { ...BOWL, t: 'Post-lift rice bowl, doubled' });
    assert.equal(world.saved.d.bio, 'Kept');
    assert.equal(world.saved.d.bizCard.name, 'Second Helping', 'a key saved elsewhere since is kept');
    assert.equal('studio' in world.saved.d, false, 'no studio written for a nutritionist');
    assert.deepEqual(world.saved.opts, { expectedUserId: 'u-nadia' });
  } finally { delete window.ShapeRecipeImport; await m.unmount(); }
});

test('Make it yours: a paste the AI can\'t read is laid out on the phone; a recipe needs a name; six at most; an emptied kitchen drops the key; amber to start', async () => {
  reset({ me: 'u-nadia', stored: { kitchen: { rules: ['Only rule'], recipes: [BOWL] } } });
  window.ShapeRecipeImport = { parse: async () => ({ ok: false, draft: null, reason: 'no_key' }) };
  let m = await mount(page({ isSelf: true }));
  try {
    await click(button(/^Make it yours$/));
    await click(button(/^Your kitchen$/));
    await click(document.querySelector('[data-write-recipe]'));
    await click(document.querySelector('[data-recipe-done]'));
    assert.match(m.text(), /Give it a name first\./, 'no name, not kept');
    await click(document.querySelector('[data-recipe-paste]'));
    await type(document.querySelector('[data-recipe-form] textarea'), 'Spinach eggs\nIngredients\n2 eggs\n1 cup spinach\nMethod\nWhisk the eggs.\nCook with the spinach for 3 minutes.');
    await click(document.querySelector('[data-paste-fill]'));
    assert.match(m.text(), /Laid out from your paste\. Check every line\./);
    assert.equal(document.querySelector('[data-recipe-title]').value, 'Spinach eggs', 'the paste\'s first line is its name');
    assert.deepEqual([...document.querySelectorAll('[data-recipe-ing]')].map((r) => [...r.querySelectorAll('input')].map((i) => i.value)), [['2', 'eggs'], ['1 cup', 'spinach']], 'and not an ingredient');
    assert.equal(document.querySelectorAll('[data-recipe-step]').length, 2);
    await type(document.querySelector('[data-recipe-num="min"]'), '10');
    assert.match(m.text(), /Laid out from your paste\. Check every line\./, 'the note stays while she checks');
    // A recipe being written is unsaved work: leaving asks first (Codex P2 on #2497).
    await click(button(/^← Profile$/));
    assert.match(m.text(), /You haven't saved these changes\./);
    assert.ok(document.querySelector('[data-recipe-form]'), 'still open');
    await click(document.querySelector('[data-recipe-cancel]'));
    assert.equal(document.querySelectorAll('[data-mine-recipe]').length, 1, 'cancelled, not kept');
    // Emptied: the recipe and the rule removed, and the key is not stored.
    await click(document.querySelector('[data-remove-recipe]'));
    await click(button(/^Plate$/));
    await click(document.querySelector('button[aria-label="Remove"]'));
    await click(document.querySelector('[data-save-mine]'));
    assert.equal('kitchen' in world.saved.d, false, 'no empty kitchen is stored');
    await m.unmount();
    // Six at most.
    reset({ me: 'u-nadia', stored: { kitchen: { recipes: Array.from({ length: 6 }, (_, i) => ({ ...OATS, id: 'r' + i, photo: undefined })) } } });
    m = await mount(page({ isSelf: true }));
    await click(button(/^Make it yours$/));
    await click(button(/^Your kitchen$/));
    await click(document.querySelector('[data-write-recipe]'));
    assert.ok(!document.querySelector('[data-recipe-form]'));
    assert.match(m.text(), /Up to 6 recipes\./);
    await m.unmount();
    // No look yet: amber.
    reset({ me: 'u-nadia', stored: {} });
    m = await mount(page({ isSelf: true }));
    await click(button(/^Make it yours$/));
    assert.equal(document.querySelector('[data-accent="amber"]').getAttribute('aria-pressed'), 'true', 'no look yet: amber');
  } finally { delete window.ShapeRecipeImport; await m.unmount(); }
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
  assert.equal(document.querySelectorAll('[data-recipe]').length, 6, 'six recipes');
  await click(document.querySelector('[data-recipe]'));
  assert.ok(document.querySelectorAll('[data-recipe-ingredients] li').length > 3 && document.querySelectorAll('[data-recipe-method] li').length > 3, 'each written out in full');
  await click(document.querySelector('[data-recipe-back]'));
  await click(section('plate'));
  assert.match(document.querySelector('[data-kitchen-plate]').textContent, /Beans, lentils or tofu at every meal/, 'a plant kitchen for a plant-based specialty');
  await click(section('staples'));
  assert.ok(document.querySelectorAll('[data-staple]').length >= 8);
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
  assert.equal(document.querySelectorAll('[data-recipe]').length, 6);
  await click(button(/^Make it yours$/));
  await click(button(/^Your kitchen$/));
  await click(button(/^Plate$/));
  await click(document.querySelector('[data-plate-preset="lighter"]'));
  await click(document.querySelector('[data-save-mine]'));
  assert.equal(world.saved, null, 'nothing written');
  await click(button(/kitchen$/));
  await click(section('plate'));
  assert.match(document.querySelector('[data-kitchen-plate]').textContent, /Vegetables\s*50%.*Protein\s*35%.*Carbs\s*15%/, 'the page shows the change');
  await m.unmount();
});

// ── The data ───────────────────────────────────────────────────────────────────────────────
test('the kitchen doc: a plate that adds up, rules, staples and her recipes, cleaned; nothing to show is no key', () => {
  assert.equal(bsProfileKitchen(null), null);
  assert.equal(bsProfileKitchen({ rules: ['  '], staples: [], recipes: [] }), null);
  assert.equal(bsProfileKitchen([]), null);
  // The plate: steps of five that add up to 100, or none.
  assert.deepEqual(bsKitchenPlate({ veg: 50, protein: 30, carbs: 20, extra: 1 }), { veg: 50, protein: 30, carbs: 20 });
  for (const bad of [{ veg: 50, protein: 30, carbs: 25 }, { veg: 50, protein: 27, carbs: 23 }, { veg: 110, protein: -5, carbs: -5 }, { veg: '50', protein: 25, carbs: 25 }, null, []]) assert.equal(bsKitchenPlate(bad), null, JSON.stringify(bad));
  const k = bsProfileKitchen({
    plate: { veg: 40, protein: 30, carbs: 30 }, extra: 'dropped',
    rules: ['  A palm\u0007  ', '', 'x'.repeat(90), 'b', 'c', 'd', 'e'],
    staples: [{ n: 'Eggs', g: 'fridge' }, { n: 'eggs', g: 'pantry' }, { n: 'Oats', g: 'garage' }, { n: '' }, 'str', ...Array.from({ length: 20 }, (_, i) => ({ n: 'S' + i, g: 'pantry' }))],
    recipes: [
      { ...BOWL, extra: 1 }, { ...BOWL, t: 'The same id again' }, { id: 'Upper', t: 'Bad id' }, { id: 'ok1', t: '  ' }, { id: 'x'.repeat(25), t: 'Long id' }, null, 'str',
      { id: 'a', t: 'A' }, { id: 'b', t: 'B' }, { id: 'c', t: 'C' }, { id: 'd', t: 'D' }, { id: 'e', t: 'E' }, { id: 'f', t: 'F' },
    ],
  }, 'u-nadia');
  assert.deepEqual(k.plate, { veg: 40, protein: 30, carbs: 30 });
  assert.equal('extra' in k, false);
  assert.deepEqual(k.rules, ['A palm', 'x'.repeat(60), 'b', 'c'], 'cleaned, cut at 60, four at most');
  assert.deepEqual(k.staples.slice(0, 3), [{ n: 'Eggs', g: 'fridge' }, { n: 'Oats', g: 'pantry' }, { n: 'S0', g: 'pantry' }], 'one of each name; an unknown place is the pantry');
  assert.equal(k.staples.length, 12);
  assert.deepEqual(k.recipes.map((r) => r.id), ['r1', 'a', 'b', 'c', 'd', 'e'], 'one of each id, shaped ids with a name, six at most');
  assert.deepEqual(k.recipes[0], BOWL, 'rebuilt field by field');
  // One recipe: numbers in their bounds as whole numbers, cleaned text cut to length, a photo only
  // from the owner's own folder.
  const r = bsKitchenRecipeItem({
    id: 'z9', t: 'T'.repeat(90), note: 'N'.repeat(200), min: 0, serves: 25, kcal: 3001, p: -1, c: 12.5, f: '10',
    ing: [{ n: 'Q'.repeat(30), m: 'M'.repeat(70) }, { n: '1' }, 'flour', null, ...Array.from({ length: 30 }, (_, i) => ({ m: 'i' + i }))],
    steps: ['  Step one\u0000  ', '', 'S'.repeat(400), 7, ...Array.from({ length: 30 }, (_, i) => 'step ' + i)],
    photo: own('u-other', 'x.jpg'),
  }, 'u-nadia');
  assert.equal(r.t.length, 80);
  assert.equal(r.note.length, 160);
  for (const key of ['min', 'serves', 'kcal', 'p', 'c', 'f', 'photo']) assert.equal(key in r, false, `${key} out of bounds or not theirs`);
  assert.deepEqual(r.ing[0], { n: 'Q'.repeat(24), m: 'M'.repeat(60) });
  assert.equal(r.ing.length, 20, 'twenty ingredients at most; one with no name is dropped');
  assert.equal(r.ing[1].m, 'i0');
  assert.equal(r.steps[0], 'Step one');
  assert.equal(r.steps[1].length, 300);
  assert.equal(r.steps.length, 16);
  assert.deepEqual(bsKitchenRecipeItem({ id: 'q', t: 'Q', min: 1, serves: 24, kcal: 0, p: 400, c: 0, f: 400 }, null), { id: 'q', t: 'Q', min: 1, serves: 24, kcal: 0, p: 400, c: 0, f: 400 }, 'the bounds themselves are kept');
  assert.equal('photo' in bsKitchenRecipeItem(BOWL, null), false, 'no owner, no photo');
  assert.equal(bsKitchenRecipeItem({ ...BOWL, photo: own('u-nadia', 'x.jpg').replace('https:', 'http:') }, 'u-nadia').photo, undefined);
  // A long array is scanned only so far (the doc is public-read).
  assert.equal(bsProfileKitchen({ recipes: Array.from({ length: 5000 }, () => ({ id: 'BAD' })).concat([{ id: 'late', t: 'Late' }]) }), null);
  // The save path keeps it, cleaned, with the owner's photos, and drops it when empty.
  assert.deepEqual(bsNormalizeProfileCustom({ kitchen: { rules: ['R'], recipes: [BOWL, OATS] } }, 'u-nadia').kitchen.recipes.map((x) => x.photo || null), [own('u-nadia', 'bowl.jpg'), null]);
  assert.equal('kitchen' in bsNormalizeProfileCustom({ kitchen: { rules: [''] } }, 'u'), false);
});

test('every sample kitchen and meal is the Shape Kitchen\'s own: the recipes written out from it, the meals with its macros', () => {
  for (const [slug, [title, kcal, p, c, f]] of Object.entries(BS_NUTRI_SAMPLE_RECIPES)) {
    const r = bsKitchenRecipe(slug);
    assert.ok(r, `${slug} is in the catalog`);
    assert.deepEqual([title, kcal, p, c, f], [r.title, r.kcal, r.macros.p, r.macros.c, r.macros.f], `${slug}: the recipe's own name and macros`);
  }
  const byTitle = new Map(Object.keys(BS_NUTRI_SAMPLE_RECIPES).map((s) => [bsKitchenRecipe(s).title, bsKitchenRecipe(s)]));
  for (const kind of BS_NUTRI_SAMPLE_KINDS) {
    const d = bsNutritionistDemo({ kind });
    const k = d.custom.kitchen;
    assert.deepEqual(bsProfileKitchen(k, null), k, `${kind}: already clean`);
    assert.ok(k.plate && k.rules.length && k.staples.length >= 8, `${kind}: a plate, rules and staples`);
    assert.equal(k.recipes.length, 6, kind);
    for (const rec of k.recipes) {
      const src = byTitle.get(rec.t);
      assert.ok(src, `${kind}: ${rec.t} is written from a catalog recipe`);
      assert.deepEqual([rec.kcal, rec.p, rec.c, rec.f, rec.serves, rec.min], [src.kcal, src.macros.p, src.macros.c, src.macros.f, src.servings, bsKitchenMinutes(src)], `${kind}: ${rec.t}'s numbers`);
      assert.deepEqual(rec.ing, src.ingredients.map((x) => ({ n: x.n, m: x.m })), `${kind}: ${rec.t}'s ingredients`);
      assert.deepEqual(rec.steps, src.steps, `${kind}: ${rec.t}'s method`);
      assert.ok(rec.note, `${kind}: a note on ${rec.t}`);
    }
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

test('a recipe of hers as a grocery list and for cook mode', () => {
  const l = bsOwnRecipeGroceryList(BOWL, { ownerKey: 'u-nadia', name: BOWL.t, from: "Nadia's kitchen" });
  assert.equal(l.id, `kr-${bsShortHash('u-nadia')}-r1`);
  assert.notEqual(bsOwnRecipeGroceryList(BOWL, { ownerKey: 'u-other' }).id, l.id, 'another coach\'s recipe with the same id is another list');
  assert.equal(l.count, 3);
  assert.equal(l.preview, 'jasmine rice · chicken thigh · spring onions');
  assert.equal(bsOwnRecipeGroceryList({ id: 'x', t: 'No ingredients' }, {}), null);
  const c = bsOwnRecipeCookable(BOWL, 'u-nadia');
  assert.equal(c.title, 'Post-lift rice bowl');
  assert.deepEqual(c.steps.map((s) => s.text || s.t || s), c.steps.map((s) => s.text || s.t || s));
  assert.equal(c.steps.length, 2);
  assert.equal(c.ingredients.length, 3);
  assert.deepEqual(c.macros, { kcal: 610, p: 45, c: 70, f: 14 });
  assert.equal(c.timeLabel, '25 min');
  assert.equal(c.sourceKind, 'member', 'through the member-recipe adapter: plain steps, no timing windows');
  assert.equal(c.recipeTitle, null, 'never credited to a catalog recipe by its title');
  assert.equal(c.mealId, l.id, 'resumes per coach and recipe');
  assert.equal(bsShortHash('a'), bsShortHash('a'));
  assert.notEqual(bsShortHash('a'), bsShortHash('b'));
});

test('where a meal\'s energy came from adds up to 100 in whole percentages, none below 0', () => {
  assert.deepEqual(energySplit({ p: 5, c: 35, f: 0 }), { p: 13, c: 87, f: 0 }, 'no -1% fat (Codex P2 on #2497)');
  assert.deepEqual(energySplit({ p: 38, c: 52, f: 12 }), { p: 33, c: 44, f: 23 }, 'exactly 32.48, 44.44 and 23.08: the largest remainder takes the point');
  for (const [p, c, f] of [[1, 1, 1], [0, 0, 1], [7, 3, 2], [33, 33, 15], [5, 35, 0], [0, 50, 0]]) {
    const s = energySplit({ p, c, f });
    assert.equal(s.p + s.c + s.f, 100, `${p}/${c}/${f}`);
    assert.ok(s.p >= 0 && s.c >= 0 && s.f >= 0, `${p}/${c}/${f}`);
  }
  assert.equal(energySplit({ p: 0, c: 0, f: 0 }), null);
  assert.equal(energySplit({ p: 10, c: null, f: 2 }), null);
});

test('a day of plate notes totals protein and energy only when every meal carried them', () => {
  const day = (meals) => bsPlateNoteDays(meals.map((m, i) => ({ title: 'Meal ' + i, created_at: at(1, 8 + i), meal: m })))[0];
  assert.deepEqual([day([{ kcal: 400, p: 30 }, { kcal: 600, p: 40 }]).kcal, day([{ kcal: 400, p: 30 }, { kcal: 600, p: 40 }]).protein], [1000, 70]);
  const gap = day([{ kcal: 400, p: 30 }, { p: 40 }]);
  assert.equal(gap.kcal, null, 'a meal with no energy logged leaves the day without a total, never an undercount');
  assert.equal(gap.proteinAll, true);
  assert.equal(day([{ kcal: 400 }, { kcal: 600, p: 40 }]).proteinAll, false);
});
