// The cookable contract — Cook Mode's input layer (spec 2026-07-21 §4).
//
// One normalizer, bsCookable(source), ingests EVERY meal/recipe shape in the
// system and emits the one shape the walkthrough renders. Coverage is an
// honest ladder, never fabrication:
//   tier 1 (STEPS)  — authored steps, walked verbatim
//   tier 2 (PROSE)  — a prose method deterministically split ("FROM THE PLAN")
//   tier 3 (MISE)   — ingredients but no method: mise + timers only
//   tier 4 (QUICK)  — title/macros only: quick mode
// A tier-3/4 cookable carries steps: [] — the UI never renders a step that
// wasn't authored (or member-reviewed via the labeled AI draft, PR B).
//
// Pure + deterministic: no Date, no random, Symbol-safe on attacker-shaped
// input (rows can arrive from jsonb — treat every field as untrusted).

export const BS_COOK_TIERS = { STEPS: 1, PROSE: 2, MISE: 3, QUICK: 4 };

// A string-or-nothing guard: only real, non-empty strings pass (a Symbol or
// object in a text field must drop honestly, never throw via String()).
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// Honest number: null/''/Symbol/NaN are ABSENCE, never 0 (the Number(null)=0
// fabrication class — see the cycle-engine + food-search lessons).
const num = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

export const bsCookSlug = (title) => {
  const s = str(title);
  return s ? s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
};

// ---------------------------------------------------------------------------
// Steps + ingredients normalization

// Accepts string steps AND the forward-compatible structured shape
// { t, min?, passive?, station? } the orchestration pass (PR D) introduces.
const normalizeSteps = (steps) => {
  if (!Array.isArray(steps)) return [];
  const out = [];
  for (const s of steps) {
    const text = typeof s === 'object' && s !== null ? str(s.t) : str(s);
    if (text) out.push(text);
  }
  return out;
};

// Ingredients: { n, m, k? } objects (the catalog/meal grammar) or plain
// strings (legacy website shape) → { n, m, k? }. Empty names drop.
const normalizeIngredients = (ings) => {
  if (!Array.isArray(ings)) return [];
  const out = [];
  for (const ing of ings) {
    if (typeof ing === 'string') {
      const m = str(ing);
      if (m) out.push({ n: '', m });
    } else if (typeof ing === 'object' && ing !== null) {
      const m = str(ing.m);
      if (!m) continue;
      const row = { n: str(ing.n) || '', m };
      const k = str(ing.k);
      if (k) row.k = k;
      out.push(row);
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// The prose splitter (tier 2)

// A blurb only qualifies as a METHOD when it actually reads as instructions —
// gated on cooking verbs so marketing copy ("Sunday reset — easy to scale")
// never becomes fake steps.
const COOK_VERBS = /\b(heat|preheat|cook|stir|add|mix|whisk|bake|roast|grill|boil|simmer|sear|saut[eé]|toast|season|slice|chop|dice|mince|drain|rinse|marinate|fold|pour|spread|layer|top|serve|rest|cover|blend|mash|melt|fry|steam|reduce|combine|transfer|flip|remove|garnish)\b/i;

export const bsSplitMethodProse = (text) => {
  const t = str(text);
  if (!t) return null;
  // Numbered/lettered line markers win; otherwise sentence boundaries.
  let parts;
  if (/(?:^|\n|\s)(?:\d+[.)]|[a-h][.)])\s+/.test(t)) {
    parts = t.split(/(?:^|\n|\s)(?:\d+[.)]|[a-h][.)])\s+/).map((p) => p.trim()).filter(Boolean);
  } else {
    parts = t.split(/(?<=[.!?])\s+(?=[A-Z])/).map((p) => p.trim()).filter(Boolean);
  }
  parts = parts.filter((p) => p.length > 12);
  if (parts.length < 2) return null;
  const instructional = parts.filter((p) => COOK_VERBS.test(p));
  if (instructional.length < 2) return null;
  return parts;
};

// ---------------------------------------------------------------------------
// The step-timer parser (v1 — structured `min` metadata overrides in PR D)

// "18 minutes" · "30 seconds" · "1 hour" · "18–20 minutes" (range → the lower
// bound runs, the label keeps the range) · "3 minutes per side" (label keeps
// the qualifier). Cap 4 per step.
const TIMER_RE = /(\d+(?:\s*[–-]\s*\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)(\s+per\s+side)?/gi;
const UNIT_SECONDS = (unit) => (/^h/i.test(unit) ? 3600 : /^m/i.test(unit) ? 60 : 1);

export const bsStepTimers = (text) => {
  const t = str(text);
  if (!t) return [];
  const out = [];
  let m;
  TIMER_RE.lastIndex = 0;
  while ((m = TIMER_RE.exec(t)) && out.length < 4) {
    const firstNum = num(m[1].split(/[–-]/)[0]);
    if (firstNum === null || firstNum <= 0) continue;
    const seconds = firstNum * UNIT_SECONDS(m[2]);
    // A cook timer under 5s or over 6h is a parse artifact, not a timer.
    if (seconds < 5 || seconds > 21600) continue;
    const unitLabel = /^h/i.test(m[2]) ? 'hr' : /^m/i.test(m[2]) ? 'min' : 'sec';
    out.push({ seconds, label: `${m[1].replace(/\s+/g, '')} ${unitLabel}${m[3] ? ' per side' : ''}` });
  }
  return out;
};

// ---------------------------------------------------------------------------
// Adapters

const finishCookable = (c) => {
  if (c.steps.length > 0) c.tier = c.fromPlan ? BS_COOK_TIERS.PROSE : BS_COOK_TIERS.STEPS;
  else if (c.ingredients.length > 0) c.tier = BS_COOK_TIERS.MISE;
  else c.tier = BS_COOK_TIERS.QUICK;
  return c;
};

// Catalog recipe: { title, servings, kcal, macros:{p,c,f}, ingredients, steps,
// tip, time, prep, by, byRole } (shapeKitchenData.js).
export const bsCookableFromRecipe = (recipe) => {
  if (typeof recipe !== 'object' || recipe === null) return null;
  const title = str(recipe.title);
  if (!title) return null;
  const macros = recipe.macros && typeof recipe.macros === 'object' ? recipe.macros : {};
  return finishCookable({
    title,
    sourceKind: 'recipe',
    servings: num(recipe.servings),
    macros: { kcal: num(recipe.kcal), p: num(macros.p), c: num(macros.c), f: num(macros.f) },
    ingredients: normalizeIngredients(recipe.ingredients),
    steps: normalizeSteps(recipe.steps),
    fromPlan: false,
    coach: str(recipe.by) ? { name: str(recipe.by), role: str(recipe.byRole) || '' } : null,
    tip: str(recipe.tip),
    timeLabel: str(recipe.time),
    prepNote: str(recipe.prep),
    recipeTitle: title,
  });
};

// Plan/preview meal: { title, kcal, p, c, f, ingredients?, steps?, recipeId?,
// coach?, brief?/hero?, prep? } (BSMealPreview's contract). When the meal maps
// to a catalog recipe (recipeId slug or exact title), the recipe's method +
// ingredients carry the walkthrough while the MEAL's macros stay the logged
// truth (the plan's numbers are what "Ate as planned" writes).
export const bsCookableFromMeal = (meal, recipes) => {
  if (typeof meal !== 'object' || meal === null) return null;
  const title = str(meal.title);
  if (!title) return null;

  const list = Array.isArray(recipes) ? recipes : [];
  const wantId = str(meal.recipeId);
  const slug = bsCookSlug(title);
  const mapped = list.find((r) => {
    const rSlug = bsCookSlug(r && r.title);
    if (!rSlug) return false;
    if (wantId) return rSlug === bsCookSlug(wantId) || str(r.title) === wantId;
    return rSlug === slug;
  });

  const base = mapped ? bsCookableFromRecipe(mapped) : null;
  const mealMacros = { kcal: num(meal.kcal), p: num(meal.p), c: num(meal.c), f: num(meal.f) };
  const coach = str(meal.coach) ? { name: str(meal.coach), role: 'Nutritionist' } : null;

  if (base) {
    return finishCookable({
      ...base,
      title,
      sourceKind: 'meal',
      // The plan's macros are the billing truth of the plate — never the
      // recipe's, which may be portioned differently.
      macros: mealMacros,
      coach: coach || base.coach,
      mealId: str(meal.id != null ? String(meal.id) : null),
      recipeTitle: base.recipeTitle,
    });
  }

  let steps = normalizeSteps(meal.steps);
  let fromPlan = false;
  if (steps.length === 0) {
    const prose = bsSplitMethodProse([str(meal.brief), str(meal.desc), str(meal.method)].filter(Boolean).join(' '));
    if (prose) { steps = prose; fromPlan = true; }
  }
  return finishCookable({
    title,
    sourceKind: 'meal',
    servings: null,
    macros: mealMacros,
    ingredients: normalizeIngredients(meal.ingredients),
    steps,
    fromPlan,
    coach,
    tip: null,
    timeLabel: str(meal.prep),
    prepNote: null,
    mealId: str(meal.id != null ? String(meal.id) : null),
    recipeTitle: null,
  });
};

// Generic text adapter — the seam future creation surfaces (coach_plans
// single dishes, AI-created recipes) call with whatever they honestly have.
export const bsCookableFromText = ({ title, text, ingredients, macros, coach } = {}) => {
  const t = str(title);
  if (!t) return null;
  const prose = bsSplitMethodProse(text);
  const mm = macros && typeof macros === 'object' ? macros : {};
  return finishCookable({
    title: t,
    sourceKind: 'text',
    servings: null,
    macros: { kcal: num(mm.kcal), p: num(mm.p), c: num(mm.c), f: num(mm.f) },
    ingredients: normalizeIngredients(ingredients),
    steps: prose || [],
    fromPlan: !!prose,
    coach: coach && str(coach.name) ? { name: str(coach.name), role: str(coach.role) || '' } : null,
    tip: null,
    timeLabel: null,
    prepNote: null,
    recipeTitle: null,
  });
};

// The dispatch: recipes carry a macros OBJECT, meals carry flat p/c/f.
export const bsCookable = (source, opts = {}) => {
  if (typeof source !== 'object' || source === null) return null;
  if (source.macros && typeof source.macros === 'object' && Array.isArray(source.steps)) {
    return bsCookableFromRecipe(source);
  }
  return bsCookableFromMeal(source, opts.recipes);
};
