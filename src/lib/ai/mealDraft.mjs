// Nora drafts a meal plan for a nutritionist (the Ask Nora plan, step 5), the way she
// drafts workouts for a trainer (workoutDraft.mjs). PURE: no I/O, no model, no clock.
//
// ⚠ EVERY MEAL AND EVERY NUMBER COMES FROM SHAPE'S MEAL LIBRARY. The model only reads the
// nutritionist's brief into structured fields (goal phase, targets they stated, days,
// meals per day, what to leave out, most prep minutes). This file picks one library food
// per meal, closest to the day's targets and varied across days, and the macros are the
// library's own. Nothing here invents a dish or a figure; a target they did not give is the
// builder's own default for the phase, and the card says so.
//
// The draft is the website builder's document (coach_plans.detail.mealBuilder,
// public/newdesign/dashMealCore.js), saved unpublished for them to edit and assign there.

// The builder's library (DashMeals.FOODS), copied because dashMealCore.js is a browser
// script; tests/ai-meal-draft.test.mjs fails if the two drift.
export const MEAL_LIBRARY = [
{id: 'f1', name: 'Greek yogurt (250 g)', kcal: 160,p: 25,c: 9,f: 2,prepMin: 1,tags: ['dairy'],ingredients: [{name: 'Greek yogurt', qty: 250,unit: 'g'}]},
  {id: 'f2', name: 'Overnight oats', kcal: 420,p: 18,c: 62,f: 11,prepMin: 5,tags: ['oats', 'dairy', 'gluten'],ingredients: [{name: 'Rolled oats', qty: 80,unit: 'g'},  {name: 'Milk', qty: 200,unit: 'ml'},  {name: 'Chia seeds', qty: 15,unit: 'g'}]},
  {id: 'f3', name: '3-egg omelette + toast', kcal: 440,p: 28,c: 28,f: 22,prepMin: 10,tags: ['egg', 'gluten', 'dairy'],ingredients: [{name: 'Eggs', qty: 3,unit: ''},  {name: 'Sourdough', qty: 2,unit: 'slices'},  {name: 'Butter', qty: 10,unit: 'g'}]},
  {id: 'f4', name: 'Protein shake (whey + banana)', kcal: 260,p: 32,c: 28,f: 3,prepMin: 2,tags: ['dairy'],ingredients: [{name: 'Whey protein', qty: 35,unit: 'g'},  {name: 'Banana', qty: 1,unit: ''}]},
  {id: 'f5', name: 'Grilled chicken bowl', kcal: 620,p: 52,c: 68,f: 18,prepMin: 20,tags: [],ingredients: [{name: 'Chicken breast', qty: 200,unit: 'g'},  {name: 'Rice', qty: 180,unit: 'g'},  {name: 'Broccoli', qty: 150,unit: 'g'},  {name: 'Olive oil', qty: 10,unit: 'ml'}]},
  {id: 'f6', name: 'Salmon, rice & greens', kcal: 680,p: 46,c: 64,f: 24,prepMin: 25,tags: ['fish'],ingredients: [{name: 'Salmon fillet', qty: 180,unit: 'g'},  {name: 'Rice', qty: 180,unit: 'g'},  {name: 'Spinach', qty: 100,unit: 'g'}]},
  {id: 'f7', name: 'Chicken thighs, rice & greens', kcal: 690,p: 45,c: 64,f: 26,prepMin: 25,tags: [],ingredients: [{name: 'Chicken thighs', qty: 200,unit: 'g'},  {name: 'Rice', qty: 180,unit: 'g'},  {name: 'Spinach', qty: 100,unit: 'g'}]},
  {id: 'f8', name: 'Turkey & rice bowl', kcal: 610,p: 48,c: 66,f: 14,prepMin: 20,tags: [],ingredients: [{name: 'Turkey mince', qty: 200,unit: 'g'},  {name: 'Rice', qty: 180,unit: 'g'},  {name: 'Peppers', qty: 120,unit: 'g'}]},
  {id: 'f9', name: 'Tofu stir-fry + rice', kcal: 580,p: 34,c: 72,f: 16,prepMin: 18,tags: ['soy', 'plant'],ingredients: [{name: 'Tofu', qty: 200,unit: 'g'},  {name: 'Rice', qty: 160,unit: 'g'},  {name: 'Stir-fry veg', qty: 200,unit: 'g'}]},
  {id: 'f10', name: 'Shrimp tacos (3)', kcal: 540,p: 38,c: 58,f: 16,prepMin: 15,tags: ['shellfish', 'gluten'],ingredients: [{name: 'Shrimp', qty: 180,unit: 'g'},  {name: 'Tortillas', qty: 3,unit: ''},  {name: 'Slaw mix', qty: 100,unit: 'g'}]},
  {id: 'f11', name: 'Beef chili + sweet potato', kcal: 640,p: 44,c: 60,f: 22,prepMin: 35,tags: [],ingredients: [{name: 'Lean beef mince', qty: 180,unit: 'g'},  {name: 'Sweet potato', qty: 250,unit: 'g'},  {name: 'Black beans', qty: 120,unit: 'g'}]},
  {id: 'f12', name: 'Tuna wrap', kcal: 430,p: 36,c: 44,f: 12,prepMin: 8,tags: ['fish', 'gluten', 'dairy'],ingredients: [{name: 'Tuna (tin)', qty: 1,unit: ''},  {name: 'Tortilla wrap', qty: 1,unit: ''},  {name: 'Greek yogurt', qty: 40,unit: 'g'}]},
  {id: 'f13', name: 'Cottage cheese + berries', kcal: 220,p: 26,c: 18,f: 5,prepMin: 2,tags: ['dairy'],ingredients: [{name: 'Cottage cheese', qty: 200,unit: 'g'},  {name: 'Mixed berries', qty: 100,unit: 'g'}]},
  {id: 'f14', name: 'Apple + peanut butter', kcal: 280,p: 8,c: 30,f: 16,prepMin: 2,tags: ['nuts'],ingredients: [{name: 'Apple', qty: 1,unit: ''},  {name: 'Peanut butter', qty: 30,unit: 'g'}]},
  {id: 'f15', name: 'Rice cakes + cottage cheese', kcal: 190,p: 16,c: 26,f: 3,prepMin: 3,tags: ['dairy'],ingredients: [{name: 'Rice cakes', qty: 3,unit: ''},  {name: 'Cottage cheese', qty: 120,unit: 'g'}]},
  {id: 'f16', name: 'Trail mix (40 g)', kcal: 230,p: 7,c: 18,f: 15,prepMin: 0,tags: ['nuts'],packaged: true,ingredients: [{name: 'Trail mix', qty: 40,unit: 'g'}]},
  {id: 'f17', name: 'Protein pancakes', kcal: 480,p: 36,c: 54,f: 12,prepMin: 15,tags: ['egg', 'dairy', 'gluten'],ingredients: [{name: 'Whey protein', qty: 30,unit: 'g'},  {name: 'Oats', qty: 60,unit: 'g'},  {name: 'Eggs', qty: 2,unit: ''}]},
  {id: 'f18', name: 'Burrito bowl (chicken)', kcal: 720,p: 50,c: 78,f: 22,prepMin: 20,tags: [],ingredients: [{name: 'Chicken breast', qty: 180,unit: 'g'},  {name: 'Rice', qty: 180,unit: 'g'},  {name: 'Black beans', qty: 100,unit: 'g'},  {name: 'Guacamole', qty: 50,unit: 'g'}]},
  {id: 'f19', name: 'Lentil curry + rice', kcal: 560,p: 24,c: 88,f: 12,prepMin: 30,tags: ['plant'],ingredients: [{name: 'Red lentils', qty: 150,unit: 'g'},  {name: 'Rice', qty: 160,unit: 'g'},  {name: 'Coconut milk', qty: 100,unit: 'ml'}]},
  {id: 'f20', name: 'Steak, potatoes & asparagus', kcal: 710,p: 52,c: 52,f: 30,prepMin: 30,tags: [],ingredients: [{name: 'Sirloin steak', qty: 220,unit: 'g'},  {name: 'Baby potatoes', qty: 250,unit: 'g'},  {name: 'Asparagus', qty: 120,unit: 'g'}]},
  {id: 'f21', name: 'Protein bar', kcal: 210,p: 20,c: 21,f: 7,prepMin: 0,tags: ['bar'],packaged: true,ingredients: [{name: 'Protein bar', qty: 1,unit: ''}]},
  {id: 'f22', name: 'Sushi set (12 pc)', kcal: 580,p: 28,c: 88,f: 12,prepMin: 0,tags: ['fish', 'travel'],packaged: true,ingredients: [{name: 'Sushi set', qty: 1,unit: ''}]},
  {id: 'f23', name: 'Chicken caesar (no croutons)', kcal: 460,p: 42,c: 12,f: 26,prepMin: 10,tags: ['dairy', 'egg'],ingredients: [{name: 'Chicken breast', qty: 160,unit: 'g'},  {name: 'Romaine', qty: 120,unit: 'g'},  {name: 'Caesar dressing', qty: 30,unit: 'ml'}]},
  {id: 'f24', name: 'Egg-white veggie scramble', kcal: 280,p: 30,c: 14,f: 11,prepMin: 12,tags: ['egg', 'dairy'],ingredients: [{name: 'Egg whites', qty: 250,unit: 'ml'},  {name: 'Mixed veg', qty: 150,unit: 'g'},  {name: 'Feta', qty: 30,unit: 'g'}]},
];

// The builder's phases and their starting targets (DashMeals.GOAL_PHASES).
export const PHASES = {
  cut: { label: 'Cut', targets: { kcal: 1900, p: 165, c: 170, f: 60 } },
  maintain: { label: 'Maintain', targets: { kcal: 2300, p: 160, c: 250, f: 75 } },
  build: { label: 'Build', targets: { kcal: 2700, p: 180, c: 320, f: 85 } },
};
export const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
// Which library foods suit each meal of the day. A lighter dish (the tuna wrap, the sushi
// set, the caesar) is a lunch, not a dinner.
export const SLOT_FOODS = {
  Breakfast: ['f2', 'f3', 'f17', 'f24', 'f4', 'f1', 'f13'],
  Lunch: ['f5', 'f8', 'f12', 'f23', 'f9', 'f18', 'f19', 'f6', 'f7', 'f10', 'f11', 'f20', 'f22'],
  Dinner: ['f6', 'f7', 'f11', 'f20', 'f5', 'f8', 'f9', 'f10', 'f18', 'f19'],
  Snack: ['f13', 'f1', 'f14', 'f15', 'f4', 'f21', 'f16'],
};
export const MAX_DAYS = 7;
export const DRAFT_NOTICE = "Every meal is from Shape's meal library, with its own macros; swap in your own foods in the builder.";

const byId = new Map(MEAL_LIBRARY.map((f) => [f.id, f]));
const clip = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const num = (v, lo, hi) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};

// The brief as the model read it, reduced to what this file can honour. A number outside a
// sane range is dropped, not clamped: it was misheard, not meant.
export function cleanMealBrief(input) {
  const i = input && typeof input === 'object' ? input : {};
  const phaseKey = Object.prototype.hasOwnProperty.call(PHASES, i.goalPhase) ? i.goalPhase : 'maintain';
  const given = {
    kcal: num(i.kcal, 1000, 6000),
    p: num(i.protein, 30, 400),
    c: num(i.carbs, 0, 800),
    f: num(i.fat, 10, 300),
  };
  const defaults = PHASES[phaseKey].targets;
  const targets = { kcal: given.kcal ?? defaults.kcal, p: given.p ?? defaults.p, c: given.c ?? defaults.c, f: given.f ?? defaults.f };
  const stated = Object.keys(given).filter((k) => given[k] != null);
  const wanted = Array.isArray(i.slots) ? i.slots.map((s) => SLOTS.find((x) => x.toLowerCase() === String(s).trim().toLowerCase())).filter(Boolean) : [];
  const slots = wanted.length ? SLOTS.filter((s) => wanted.includes(s)) : SLOTS.slice();
  const exclusions = Array.isArray(i.exclude)
    ? [...new Set(i.exclude.map((x) => clip(String(x), 30).toLowerCase()).filter((x) => x.length >= 2))].slice(0, 12)
    : [];
  return {
    name: clip(i.name, 80),
    goalPhase: phaseKey,
    targets,
    stated,
    days: num(i.days, 1, MAX_DAYS) || 3,
    slots,
    exclusions,
    maxPrep: num(i.maxPrepMinutes, 1, 180),
    proteinFloor: given.p != null ? given.p : defaults.p - 20,
  };
}

// The rule the builder's own search uses (DashMeals.searchFoods): a food is left out when an
// exclusion is one of its tags or appears in its name. ⚠ AND A PACKAGED FOOD (a bar, a sushi
// set, a trail mix) IS LEFT OUT WHENEVER ANYTHING IS EXCLUDED: its tags say what it certainly
// holds, never what it lacks, because the contents depend on the brand.
function allowed(food, brief) {
  if (brief.maxPrep != null && food.prepMin != null && food.prepMin > brief.maxPrep) return false;
  if (!brief.exclusions.length) return true;
  if (food.packaged) return false;
  const name = food.name.toLowerCase();
  const ingredients = (food.ingredients || []).map((x) => String(x.name).toLowerCase());
  return !brief.exclusions.some((ex) => food.tags.includes(ex) || name.includes(ex) || ingredients.some((n) => n.includes(ex)));
}

export function slotPools(brief) {
  const pools = {};
  for (const slot of brief.slots) pools[slot] = SLOT_FOODS[slot].map((id) => byId.get(id)).filter((f) => allowed(f, brief));
  return pools;
}

// Portions move with the day's calories: each day is scaled to its kcal target by one
// factor between SCALE_MIN and SCALE_MAX (to the nearest 0.05), by the builder's own
// arithmetic (scaleMeal below, the same as DashMeals.scaleMeal). One food per meal cannot
// reach a 2,700 kcal day otherwise, and the card states the factor.
export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.6;
function dayScale(kcal, target) {
  if (!(kcal > 0)) return 1;
  const k = Math.round((target / kcal) * 20) / 20;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, k));
}

// One pick per meal for every day: once scaled to the day's calories, the combination whose
// protein, carbs and fat sit closest to the targets (protein counts double), with portions
// far from the library's own costing a little, and a food already used costing a little more
// (more again on the day after), so the rotation varies. Deterministic: the same brief, the
// same plan.
export function pickMeals(brief) {
  const pools = slotPools(brief);
  const slots = brief.slots.filter((s) => pools[s].length);
  const missing = brief.slots.filter((s) => !pools[s].length);
  const t = brief.targets;
  const used = new Map();
  const days = [];
  let yesterday = [];
  for (let d = 0; d < brief.days; d += 1) {
    let best = null;
    const walk = (k, picks, sum) => {
      if (k === slots.length) {
        const scale = dayScale(sum.kcal, t.kcal);
        const miss = (v, goal) => (goal > 0 ? Math.abs(v * scale - goal) / goal * 100 : 0);
        const kcalMiss = miss(sum.kcal, t.kcal);
        const macroMiss = miss(sum.p, t.p) * 2 + miss(sum.c, t.c) + miss(sum.f, t.f);
        const short = Math.max(0, brief.proteinFloor - sum.p * scale);
        const repeats = picks.reduce((n, f, j) => n + (used.get(f.id) || 0) * 6 + (yesterday[j] === f.id ? 15 : 0), 0);
        const score = kcalMiss * 2 + macroMiss / 2 + short + Math.abs(scale - 1) * 20 + repeats;
        if (!best || score < best.score) best = { score, picks: picks.slice(), scale };
        return;
      }
      for (const f of pools[slots[k]]) {
        if (picks.some((x) => x.id === f.id)) continue; // one food once a day
        picks.push(f);
        walk(k + 1, picks, { kcal: sum.kcal + f.kcal, p: sum.p + f.p, c: sum.c + f.c, f: sum.f + f.f });
        picks.pop();
      }
    };
    walk(0, [], { kcal: 0, p: 0, c: 0, f: 0 });
    const picks = best ? best.picks : [];
    picks.forEach((f) => used.set(f.id, (used.get(f.id) || 0) + 1));
    yesterday = picks.map((f) => f.id);
    days.push({ scale: best ? best.scale : 1, meals: picks.map((f, j) => ({ slot: slots[j], id: f.id })) });
  }
  return { days, missing };
}

// DashMeals.scaleMeal, exactly (a test holds the two equal).
export function scaleMeal(meal, k) {
  const m = JSON.parse(JSON.stringify(meal));
  ['kcal', 'p', 'c', 'f'].forEach((key) => { m[key] = Math.round((Number(m[key]) || 0) * k); });
  m.ingredients = (m.ingredients || []).map((ing) => ({ name: ing.name, qty: Math.round((Number(ing.qty) || 0) * k * 10) / 10, unit: ing.unit || '' }));
  m.swaps = (m.swaps || []).map((x) => ({ name: x.name, kcal: Math.round(x.kcal * k), p: Math.round(x.p * k), c: Math.round(x.c * k), f: Math.round(x.f * k) }));
  return m;
}

const DAY_NAMES = ['Day A', 'Day B', 'Day C', 'Day D', 'Day E', 'Day F', 'Day G'];
const clone = (o) => JSON.parse(JSON.stringify(o));
export function dayTotals(meals) {
  return meals.reduce((t, m) => ({ kcal: t.kcal + m.kcal, p: t.p + m.p, c: t.c + m.c, f: t.f + m.f }), { kcal: 0, p: 0, c: 0, f: 0 });
}

// The builder's document for the picks. Meal ids are derived from the plan id and the
// position, so the token's picks rebuild exactly the document the card showed.
export function buildMealDoc(brief, picked, planId) {
  const tag = String(planId || 'draft').replace(/[^a-z0-9]/gi, '').slice(0, 8);
  return {
    version: 1,
    goalPhase: brief.goalPhase,
    targets: { ...brief.targets },
    constraints: { proteinFloor: brief.proteinFloor, exclusions: brief.exclusions.slice(), maxPrep: brief.maxPrep },
    days: picked.days.map((day, d) => ({
      name: DAY_NAMES[d],
      slots: day.meals.map((m, j) => {
        const food = byId.get(m.id);
        return scaleMeal({
          id: `nora-${tag}-${d}-${j}`, slot: m.slot, name: food.name,
          kcal: food.kcal, p: food.p, c: food.c, f: food.f,
          prepMin: food.prepMin != null ? food.prepMin : null,
          ingredients: clone(food.ingredients || []), swaps: [],
        }, day.scale);
      }),
      variants: {},
    })),
  };
}

export function draftName(brief) {
  return brief.name || `${PHASES[brief.goalPhase].label} · ${brief.days}-day rotation`;
}

// The card: the targets (and which are theirs), each day's total, then its meals.
export function mealDraftDiff(brief, doc, picked = null) {
  const missing = picked ? picked.missing : [];
  const t = brief.targets;
  const label = PHASES[brief.goalPhase].label;
  const yours = brief.stated.map((k) => (k === 'kcal' ? 'kcal' : k.toUpperCase())).join(', ');
  const whose = !brief.stated.length ? `the builder's ${label} defaults; edit them there`
    : brief.stated.length === 4 ? 'yours'
    : `yours: ${yours}; ${label} defaults for the rest`;
  const rows = [
    { label: 'Source', after: DRAFT_NOTICE },
    { label: 'Targets', after: `${t.kcal} kcal · ${t.p} P · ${t.c} C · ${t.f} F (${whose})` },
  ];
  if (brief.exclusions.length) rows.push({ label: 'Leaves out', after: brief.exclusions.join(', ') });
  if (brief.maxPrep != null) rows.push({ label: 'Prep', after: `${brief.maxPrep} min or less a meal` });
  if (missing.length) rows.push({ label: 'Not filled', after: `${missing.join(', ')}: no library food fits what you left out; add your own in the builder` });
  doc.days.forEach((day, d) => {
    const tot = dayTotals(day.slots);
    const k = picked && picked.days[d] ? picked.days[d].scale : 1;
    rows.push({ label: day.name, after: `${tot.kcal} kcal · ${tot.p} P · ${tot.c} C · ${tot.f} F${k !== 1 ? ` · portions ×${k}` : ''}` });
    day.slots.forEach((m) => rows.push({ label: '', after: `${m.slot} · ${m.name} · ${m.kcal} kcal` }));
  });
  return rows;
}
