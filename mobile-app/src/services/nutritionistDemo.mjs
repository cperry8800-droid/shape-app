// ─── SAMPLE NUTRITIONIST PAGES ───────────────────────────────────────────────────────────────
// The nutritionist's side of trainerDemo.mjs: a nutritionist page with no Shape account behind
// it is the coach profile (BSTrainerProfile.jsx) with sample content. That is the nutritionist
// app's own page signed out (the demo coach), and any nutritionist a member opens who has no
// account: the marketplace's seeded listings and the app's demo people. The page runs it
// through the same code a real nutritionist's runs (the availability through
// bsProjectAvailability, the kitchen through the doc's own cleaner, the plate notes as shared-meal
// cards grouped by day), and the sample itself reads nothing from Shape and writes nothing to it.
//
// What a sample nutritionist has is what an account would give it: a kitchen (the plate they
// teach and their portion rules, their staples, and six recipes of their own with a note on each:
// Shape Kitchen recipes by Shape's own recipe writers, written out as the coach's), a week of open
// and busy times, two days of shared meals and reviews. Each coach gets its own from a seed (its
// listing id or name): a kitchen that fits its specialty. What its listing says
// (name, bio, credential, price, rating) stays its listing's. There is no sample wall photo: the
// page shows the coach's colours until they add one.
//
// The sample words (the bio, the notes, the meals, the reviews) are content, as a coach's own words
// are, so they stay in English like the rest of the demo's. No pronouns: the sample coach's words
// go by their first name.

import { bsKitchenRecipeItem } from './profileCustom.mjs';
import { bsKitchenRecipe, bsKitchenMinutes } from '../broadsheet/kitchenRecipes.js';

// A recipe's own name and macros per serving (kcal, protein, carbs, fat), for the meals made from
// it. tests/nutritionist-profile.test.mjs checks each against the Shape Kitchen catalog.
const R = {
  'greek-yogurt-power-bowl': ['Greek yogurt power bowl', 480, 38, 52, 12],
  'one-pan-chicken-and-rice': ['One-pan chicken and rice', 640, 48, 72, 18],
  'sheet-pan-salmon-sweet-potato-and-broccoli': ['Sheet-pan salmon, sweet potato and broccoli', 620, 44, 58, 22],
  'overnight-oats-three-ways': ['Overnight oats, three ways', 480, 28, 58, 14],
  'lemon-herb-chicken-meal-prep-box': ['Lemon-herb chicken meal-prep box', 510, 44, 48, 14],
  'steak-and-sweet-potato-hash': ['Steak and sweet potato hash', 660, 46, 56, 26],
  'crispy-tofu-grain-bowl': ['Crispy tofu grain bowl', 560, 30, 62, 20],
  'red-lentil-and-spinach-dahl': ['Red lentil and spinach dahl', 470, 24, 68, 12],
  'chickpea-shakshuka': ['Chickpea shakshuka', 430, 22, 46, 18],
  'black-bean-and-sweet-potato-tacos': ['Black bean and sweet potato tacos', 540, 24, 78, 14],
  'tempeh-and-broccoli-teriyaki': ['Tempeh and broccoli teriyaki', 540, 32, 58, 18],
  'cottage-cheese-protein-toast': ['Cottage cheese protein toast', 340, 28, 34, 10],
  'grilled-chicken-caesar-lightened': ['Grilled chicken Caesar, lightened', 500, 50, 22, 22],
  'miso-glazed-cod-with-greens': ['Miso-glazed cod with greens', 410, 42, 18, 16],
  'tempo-turkey-lettuce-cups': ['Tempo turkey lettuce cups', 520, 42, 38, 22],
  'turkey-chili-verde': ['Turkey chili verde', 460, 42, 34, 16],
  'shrimp-and-quinoa-harvest-bowl': ['Shrimp and quinoa harvest bowl', 560, 40, 62, 16],
  'turkey-meatballs-in-marinara': ['Turkey meatballs in marinara', 580, 44, 52, 20],
  'chickpea-and-spinach-curry': ['Chickpea and spinach curry', 460, 22, 58, 14],
  'harissa-salmon-with-couscous': ['Harissa salmon with couscous', 580, 40, 52, 22],
};
export const BS_NUTRI_SAMPLE_RECIPES = R;

// Each kind of practice: the plate and its rules, the staples, the recipes (by the catalog recipe's
// slug they are written from, with the note a nutritionist would put on each) and two days of shared meals. A meal is [hour, minute,
// recipe slug] for one made from a recipe, or [hour, minute, null, name, kcal, protein, carbs, fat];
// then the note.
const KITCHENS = {
  performance: {
    plate: { veg: 40, protein: 30, carbs: 30 },
    rules: ['A palm of protein at every meal', 'A fist of carbs, two on training days', 'Half the plate vegetables at lunch and dinner', 'Fats as a thumb, not a pour'],
    staples: [['Greek yogurt', 'fridge'], ['Eggs', 'fridge'], ['Chicken thighs', 'fridge'], ['Spinach', 'fridge'], ['Oats', 'pantry'], ['Jasmine rice', 'pantry'], ['Canned beans', 'pantry'], ['Peanut butter', 'pantry'], ['Frozen berries', 'freezer'], ['Frozen peas', 'freezer']],
    dishes: [
      { r: 'one-pan-chicken-and-rice', note: 'The post-training plate I give almost everyone. Double it on Sunday.' },
      { r: 'greek-yogurt-power-bowl', note: 'Five minutes, close to 40 g of protein. For mornings you train early.' },
      { r: 'sheet-pan-salmon-sweet-potato-and-broccoli', note: 'Omega-3s and slow carbs on one tray. Twice a week in season.' },
      { r: 'steak-and-sweet-potato-hash', note: 'Iron for heavy training blocks. A breakfast-for-dinner favourite.' },
      { r: 'overnight-oats-three-ways', note: 'Made the night before, so a 6 am session still gets breakfast.' },
      { r: 'lemon-herb-chicken-meal-prep-box', note: 'Four lunches in one go. The box most clients keep.' },
    ],
    days: [
      [[7, 0, 'greek-yogurt-power-bowl', 'A quarter of the day\'s protein before eight.'],
        [12, 30, 'one-pan-chicken-and-rice', 'Lunch from Sunday\'s pan. Half greens on the side, a palm of chicken, a fist of rice.'],
        [16, 0, null, 'Banana and rice cakes', 260, 6, 58, 2, 'Carbs an hour before lifting. Fat later.'],
        [19, 30, 'sheet-pan-salmon-sweet-potato-and-broccoli', 'The day\'s protein landed. Same again tomorrow.']],
      [[8, 0, 'overnight-oats-three-ways', 'Made last night, eaten on the train.'],
        [13, 0, 'lemon-herb-chicken-meal-prep-box', 'Box three of four. Still good.'],
        [19, 0, 'steak-and-sweet-potato-hash', 'Iron on a rest day before a heavy block.']],
    ],
  },
  plant: {
    plate: { veg: 50, protein: 25, carbs: 25 },
    rules: ['Beans, lentils or tofu at every meal', 'Half the plate vegetables', 'A fist of whole grains', 'A spoon of seeds or nuts on top'],
    staples: [['Firm tofu', 'fridge'], ['Tempeh', 'fridge'], ['Hummus', 'fridge'], ['Kale', 'fridge'], ['Red lentils', 'pantry'], ['Chickpeas', 'pantry'], ['Brown rice', 'pantry'], ['Tahini', 'pantry'], ['Edamame', 'freezer'], ['Frozen spinach', 'freezer']],
    dishes: [
      { r: 'crispy-tofu-grain-bowl', note: 'The bowl that converts the sceptics. Press the tofu, it matters.' },
      { r: 'red-lentil-and-spinach-dahl', note: 'Cheap, quick, freezes well. My answer to "I have nothing in".' },
      { r: 'black-bean-and-sweet-potato-tacos', note: 'Fibre and colour for a Tuesday night.' },
      { r: 'tempeh-and-broccoli-teriyaki', note: 'Over 30 g of plant protein. Good cold the next day.' },
      { r: 'chickpea-shakshuka', note: 'One pan for brunch, eggs optional.' },
      { r: 'overnight-oats-three-ways', note: 'Breakfast sorted for the week in ten minutes.' },
    ],
    days: [
      [[7, 30, 'overnight-oats-three-ways', 'Soy milk and chia. Ready when I woke up.'],
        [12, 30, 'crispy-tofu-grain-bowl', 'Pressed the tofu for twenty minutes this time. Worth it.'],
        [16, 0, null, 'Apple and peanut butter', 280, 8, 30, 16, 'The afternoon snack I give most clients.'],
        [19, 30, 'red-lentil-and-spinach-dahl', 'Double batch, four portions in the freezer.']],
      [[10, 0, 'chickpea-shakshuka', 'A slow Sunday brunch.'],
        [14, 0, 'black-bean-and-sweet-potato-tacos', 'Pickled onions from the jar in the fridge.'],
        [19, 0, 'tempeh-and-broccoli-teriyaki', 'Made two, one for tomorrow\'s lunch.']],
    ],
  },
  steady: {
    plate: { veg: 50, protein: 30, carbs: 20 },
    rules: ['Vegetables first, and plenty of them', 'A palm and a half of protein', 'Carbs as a cupped hand', 'Water before second helpings'],
    staples: [['Cottage cheese', 'fridge'], ['Eggs', 'fridge'], ['Salad greens', 'fridge'], ['Chicken breast', 'fridge'], ['Canned tuna', 'pantry'], ['Almonds', 'pantry'], ['Quinoa', 'pantry'], ['Cod fillets', 'freezer'], ['Frozen broccoli', 'freezer']],
    dishes: [
      { r: 'grilled-chicken-caesar-lightened', note: 'The Caesar without the regret. Fifty grams of protein.' },
      { r: 'miso-glazed-cod-with-greens', note: 'Feels like a restaurant, done in twenty minutes.' },
      { r: 'tempo-turkey-lettuce-cups', note: 'Crunch and flavour without a heavy plate.' },
      { r: 'cottage-cheese-protein-toast', note: 'The breakfast that keeps the morning calm.' },
      { r: 'turkey-chili-verde', note: 'A pot on Sunday, lunches until Thursday.' },
      { r: 'shrimp-and-quinoa-harvest-bowl', note: 'Meal prep that still tastes good on day three.' },
    ],
    days: [
      [[7, 30, 'cottage-cheese-protein-toast', 'Twenty-eight grams before work.'],
        [12, 30, 'grilled-chicken-caesar-lightened', 'Yogurt dressing, nobody noticed.'],
        [15, 30, null, 'An orange and almonds', 210, 7, 18, 13, 'Enough to make it to dinner.'],
        [19, 0, 'miso-glazed-cod-with-greens', 'Bok choy in the same pan for the last three minutes.']],
      [[8, 0, null, 'Greek yogurt and berries', 220, 20, 26, 4, 'Quick, and it holds until lunch.'],
        [13, 0, 'tempo-turkey-lettuce-cups', 'Lettuce cups at my desk.'],
        [19, 0, 'turkey-chili-verde', 'Extra beans for the fibre. Lunches sorted.']],
    ],
  },
  everyday: {
    plate: { veg: 50, protein: 25, carbs: 25 },
    rules: ['Half the plate vegetables', 'A palm of protein', 'A fist of carbs', 'Everyone at the table eats the same meal'],
    staples: [['Eggs', 'fridge'], ['Milk', 'fridge'], ['Carrots', 'fridge'], ['Cheddar', 'fridge'], ['Pasta', 'pantry'], ['Canned tomatoes', 'pantry'], ['Oats', 'pantry'], ['Chickpeas', 'pantry'], ['Frozen shrimp', 'freezer'], ['Frozen peas', 'freezer']],
    dishes: [
      { r: 'shrimp-and-quinoa-harvest-bowl', note: 'Meal prep that still tastes good on day three.' },
      { r: 'chickpea-and-spinach-curry', note: 'From the freezer to the table in ten minutes.' },
      { r: 'turkey-meatballs-in-marinara', note: 'The family dinner everyone agrees on.' },
      { r: 'harissa-salmon-with-couscous', note: 'Twenty minutes, a little heat, a lot of omega-3.' },
      { r: 'overnight-oats-three-ways', note: 'Breakfast for the week, made in one go.' },
      { r: 'one-pan-chicken-and-rice', note: 'One pan, and it scales for the whole table.' },
    ],
    days: [
      [[7, 30, 'overnight-oats-three-ways', 'Three jars, three flavours, three happy kids.'],
        [12, 30, 'shrimp-and-quinoa-harvest-bowl', 'Day two of the Sunday prep.'],
        [18, 30, 'turkey-meatballs-in-marinara', 'Kids rolled the meatballs. Twice as long, twice as fun.']],
      [[8, 0, null, 'Eggs on toast', 380, 22, 34, 16, 'Two eggs, wholegrain toast, tomatoes on the side.'],
        [12, 30, 'chickpea-and-spinach-curry', 'From the freezer after a late one. Rice from yesterday.'],
        [19, 0, 'harissa-salmon-with-couscous', 'Harissa on the side for the ones who say no to spice.']],
    ],
  },
};

// Weekly open hours as the hours editor stores them: Monday to Thursday 8:00 to 18:00, Friday 8:00
// to 14:00, weekends off.
const SLOTS = [1, 2, 3, 4].map((weekday) => ({ weekday, start_minute: 480, duration_min: 600 }))
  .concat([{ weekday: 5, start_minute: 480, duration_min: 360 }]);
// Each weekday's consults ([hour, minutes long]) and time away, so every day reads differently.
const DAYS = {
  1: { sessions: [[8, 45], [9, 45], [11, 45], [14, 45], [16, 45]], away: [12, 13] },
  2: { sessions: [[9, 45], [10, 45], [13, 45], [15, 45], [17, 45]] },
  3: { sessions: [[8, 45], [10, 45], [11, 45], [14, 45]], away: [16, 18] },
  4: { sessions: [[9, 45], [11, 45], [13, 45], [14, 45], [16, 45]] },
  5: { sessions: [[8, 45], [10, 45], [12, 45]] },
};

// A sample recipe, written out from the catalog recipe it is made from (its name, time, servings,
// a serving's macros, ingredients and method) with the coach's note, through the doc's own cleaner.
function sampleRecipe(slug, note, i) {
  const r = bsKitchenRecipe(slug);
  if (!r) return null;
  const m = r.macros || {};
  return bsKitchenRecipeItem({
    id: `s${i + 1}`, t: r.title, note, min: bsKitchenMinutes(r) ?? undefined, serves: r.servings, kcal: r.kcal, p: m.p, c: m.c, f: m.f,
    ing: (r.ingredients || []).map((g) => ({ n: g.n, m: g.m })),
    steps: (r.steps || []).map((x) => (typeof x === 'string' ? x : x && x.t)),
  }, null);
}

const hash = (s) => { let h = 7; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** The kinds of practice a sample can have, for the tests. */
export const BS_NUTRI_SAMPLE_KINDS = Object.keys(KITCHENS);

/**
 * What a sample nutritionist's page is drawn from: its seed and the kind of practice that fits its
 * specialty (the listing's specialty, category and tags, as one string).
 */
export function bsNutritionistSampleOf({ key = '', specialty = '' } = {}) {
  const seed = hash(key);
  const s = String(specialty || '');
  let kind;
  if (/vegan|plant|vegetarian/i.test(s)) kind = 'plant';
  else if (/sport|athlet|performance|endurance|strength|muscle|recovery/i.test(s)) kind = 'performance';
  else if (/weight|metabolic|diabet|cardio|heart|cholesterol|blood|steady|habit/i.test(s)) kind = 'steady';
  else if (/family|gut|digest|pregnan|kid|child|general|everyday/i.test(s)) kind = 'everyday';
  else kind = ['performance', 'everyday', 'plant', 'steady'][seed % 4];
  return { seed, kind };
}

/**
 * A sample nutritionist's page, built for now in this device's time zone.
 *   kind      from bsNutritionistSampleOf; the default is the nutritionist app's demo coach
 *   where     the place they practise
 *   business  the business name on the page (the demo coach's own; none for a listing's coach)
 */
export function bsNutritionistDemo({ now = Date.now(), zone = null, kind = 'performance', where = 'Austin, TX', business = 'Second Helping Nutrition' } = {}) {
  const k = KITCHENS[kind] || KITCHENS.performance;
  const tz = zone || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })() || 'UTC';
  const today = new Date(now);

  // This week's consults, at local wall-clock hours (the device's zone is the hours' zone).
  const busy = [];
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const plan = DAYS[d.getDay()];
    if (!plan) continue;
    const at = (h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
    for (const [h, min] of plan.sessions) busy.push({ start: at(h), end: at(h, min), kind: 'session' });
    if (plan.away) busy.push({ start: at(plan.away[0]), end: at(plan.away[1]), kind: 'time_off' });
  }

  // Two days of shared meals, yesterday and the day before, as the client module's shared-meal cards
  // are shaped (bsProfileCardFromPost): the page groups them by day into plate notes.
  const plates = [];
  k.days.forEach((meals, di) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (di + 1));
    for (const m of meals) {
      const [h, mi, slug] = m;
      const [title, kcal, p, c, f] = slug ? R[slug] : m.slice(3, 8);
      const note = slug ? m[3] : m[8];
      plates.push({
        key: `demo-plate-${di}-${h}${mi}`, title, ago: `${di + 1}d`, photo: null, body: note, typeLabel: 'Meal',
        created_at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi).toISOString(),
        meal: { kcal, p, c, f, planned: true, recipeId: slug || '' },
      });
    }
  });

  return {
    // No sample photos: Make it yours offers only an upload, and the page shows the colours.
    photos: [],
    live: {
      pronouns: '',
      points: 2480,
      goal: 'Food that fits your training and your week, not the other way round.',
      can_view: true,
      is_public: true,
    },
    custom: {
      look: { paper: 'dark', accent: 'amber', focus: 'center' },
      kitchen: {
        plate: { ...k.plate },
        rules: k.rules.slice(),
        staples: k.staples.map(([n, g]) => ({ n, g })),
        recipes: k.dishes.map((d, i) => sampleRecipe(d.r, d.note, i)).filter(Boolean),
      },
      ...(business ? { bizCard: { name: business, where: where || '' } } : {}),
    },
    provider: {
      id: 'demo',
      owner_id: null,
      price: 140,
      session_price: 70,
      specialty: 'Sports nutrition',
      verified: true,
      credential: 'RD, CSSD',
      at_capacity: false,
      listing_media: { cover: null, gallery: [] },
      monthly_offer: { includes: ['A meal plan written for your week', 'Notes on the meals you log', 'Messages answered within a day'] },
    },
    availability: { slots: SLOTS, busy, booked: busy.filter((b) => b.kind === 'session').map((b) => b.start), rules: { consultMin: 20 }, timezone: tz, atCapacity: false },
    reviews: {
      avg: 9.8,
      count: 161,
      list: [
        { id: 'demo-n1', author: 'Alicia R.', rating: 10, text: 'First plan I have kept past week two. I cook three times a week now and eat well all seven days.' },
        { id: 'demo-n2', author: 'Ben T.', rating: 10, text: 'Fuelled my first marathon without a single wall. The race-week plan was gold.' },
        { id: 'demo-n3', author: 'Sofia M.', rating: 10, text: 'Every meal I log gets read, and the notes are short and useful. No food guilt, ever.' },
        { id: 'demo-n4', author: 'Kevin O.', rating: 9, text: 'Down 9 kg in five months and I still eat pasta on Fridays.' },
      ],
    },
    plates,
  };
}
