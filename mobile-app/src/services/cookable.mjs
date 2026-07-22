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

// The station a passive step occupies (PR D orchestration §6). A structured
// step may claim exactly one; anything else is no station. 'off' = a hands-off
// wait that ties up no equipment (rest / chill / marinate), which still hosts an
// interleave window but never conflicts.
export const BS_STATIONS = ['oven', 'stove', 'board', 'off'];

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

// The resume-stamp identity for a cookable. A bare title slug collides (two
// same-titled meals share a slot) and slugs to '' on non-Latin titles (every
// Cyrillic meal would share ONE key) — so identity prefers the meal id, then
// the recipe/title slug, then a stable char-code hash of the raw title.
export const bsCookKey = (c) => {
  if (typeof c !== 'object' || c === null) return 'cook:';
  if (str(c.mealId)) return 'cook:meal:' + str(c.mealId);
  const slug = bsCookSlug(c.recipeTitle || c.title);
  if (slug) return 'cook:' + slug;
  const s = str(c.title) || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
  return 'cook:h' + h.toString(36);
};

// ---------------------------------------------------------------------------
// Steps + ingredients normalization

// The honest step-metadata for a step (PR D orchestration §6). A plain-string
// step carries none — it can never host an interleave window (only authored,
// hand-checked `passive` steps do), so the board never fabricates parallelism.
const plainStepMeta = () => ({ min: null, passive: false, station: null });

// Validate one authored meta blob (an inline `{t, min?, passive?, station?}` step
// OR a catalog `stepMeta[i]` overlay entry) into the canonical shape. `min` counts
// only as a real positive number; `station` only when in BS_STATIONS; `passive`
// only on an explicit `=== true`. Null/attacker-shaped input → null (drops out).
const sanitizeMeta = (m) => {
  if (!m || typeof m !== 'object') return null;
  const min = num(m.min);
  return {
    min: min !== null && min > 0 ? min : null,
    passive: m.passive === true,
    station: BS_STATIONS.includes(m.station) ? m.station : null,
  };
};

// Splits raw step entries (string | { t, min?, passive?, station? }) into two
// index-aligned arrays: the rendered `text` (backward compatible — strings stay
// valid everywhere) and `meta`. Empty/attacker-shaped entries drop from BOTH in
// lockstep, so text[i] and meta[i] always describe the same step. Structured
// `min` is honored only when a real positive number; `station` only when it is
// one of BS_STATIONS; `passive` only on an explicit `=== true`.
const splitSteps = (steps) => {
  const text = [];
  const meta = [];
  if (!Array.isArray(steps)) return { text, meta };
  for (const s of steps) {
    if (typeof s === 'object' && s !== null) {
      const t = str(s.t);
      if (!t) continue;
      text.push(t);
      meta.push(sanitizeMeta(s) || plainStepMeta());
    } else {
      const t = str(s);
      if (!t) continue;
      text.push(t);
      meta.push(plainStepMeta());
    }
  }
  return { text, meta };
};

// Back-compat: the many `steps`-only call sites keep working unchanged.
const normalizeSteps = (steps) => splitSteps(steps).text;

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
  const numbered = /(?:^|\n|\s)(?:\d+[.)]|[a-h][.)])\s+/.test(t);
  let parts;
  if (numbered) {
    // Authored structure — every marked segment is a step, even a short
    // "2. Stir." (no length floor: dropping an authored step would silently
    // omit a real instruction, the opposite of carrying-what-was-authored).
    parts = t.split(/(?:^|\n|\s)(?:\d+[.)]|[a-h][.)])\s+/).map((p) => p.trim()).filter(Boolean);
  } else {
    parts = t.split(/(?<=[.!?])\s+(?=[A-Z])/).map((p) => p.trim()).filter(Boolean)
      .filter((p) => p.length > 12); // noise-fragment floor, sentence mode only
  }
  if (parts.length < 2) return null;
  const instructional = parts.filter((p) => COOK_VERBS.test(p));
  if (instructional.length < 2) return null;
  // Numbered/lettered prose is carried WHOLESALE (the coach chose the
  // structure); free sentences carry only the instructional segments, so a
  // marketing lead ("Sunday reset — a favorite.") can never ride into the
  // walkthrough as a fake method step.
  return numbered ? parts : instructional;
};

// ---------------------------------------------------------------------------
// The step-timer parser (v1 — structured `min` metadata overrides in PR D)

// "18 minutes" · "30 seconds" · "1 hour" · "18–20 minutes" (range → the lower
// bound runs, the label keeps the range) · "3 minutes per side" (label keeps
// the qualifier). Cap 4 per step.
// The per-side qualifier appears both as words ("3 minutes per side") and the
// shipped shorthand ("3 min/side") — match both so the CTA keeps the flip cue.
const TIMER_RE = /(\d+(?:\s*[–-]\s*\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)(\s*\/\s*side|\s+per\s+side)?/gi;
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
  // stepMeta is always index-aligned with steps — a caller that set it from
  // splitSteps carries it through; anything else (prose splits, a mapped base
  // that reshaped steps) gets a fresh plain-meta per step. Never longer/shorter
  // than steps, so board/orchestrator reads can index either array safely.
  const supplied = Array.isArray(c.stepMeta) ? c.stepMeta : [];
  c.stepMeta = c.steps.map((_, i) => supplied[i] || plainStepMeta());
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
  const { text: steps, meta: inlineMeta } = splitSteps(recipe.steps);
  // A recipe may carry an explicit parallel `stepMeta` array (the catalog's
  // hand-curated passive-window overlay — steps stay plain strings). It wins
  // per-index over the inline meta; a null/invalid overlay entry falls back.
  const overlay = Array.isArray(recipe.stepMeta) ? recipe.stepMeta : null;
  const stepMeta = overlay ? steps.map((_, i) => sanitizeMeta(overlay[i]) || inlineMeta[i]) : inlineMeta;
  return finishCookable({
    title,
    sourceKind: 'recipe',
    servings: num(recipe.servings),
    macros: { kcal: num(recipe.kcal), p: num(macros.p), c: num(macros.c), f: num(macros.f) },
    ingredients: normalizeIngredients(recipe.ingredients),
    steps,
    stepMeta,
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

  let { text: steps, meta: stepMeta } = splitSteps(meal.steps);
  let fromPlan = false;
  if (steps.length === 0) {
    const prose = bsSplitMethodProse([str(meal.brief), str(meal.desc), str(meal.method)].filter(Boolean).join(' '));
    if (prose) { steps = prose; stepMeta = null; fromPlan = true; } // prose is plain text → finishCookable derives plain meta
  }
  return finishCookable({
    title,
    sourceKind: 'meal',
    servings: null,
    macros: mealMacros,
    ingredients: normalizeIngredients(meal.ingredients),
    steps,
    stepMeta,
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
