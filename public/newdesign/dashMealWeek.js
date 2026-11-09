// The meal-plan builder's week (the owner's coach review, step 6c: "One day at a time, with Shape
// Kitchen out of reach"). PURE module — browser global (window.DashMealWeek) + Node require() for
// tests, like dashMealCore.js, which it reads at call time and never changes.
//
// What lives here, each read from data the page really has:
//   · the week: one column per day of the plan's rotation, the weekdays each one is served on
//     (the assignment's own `dow % days` rule), and the four meals as rows, so a dish dropped on a
//     row IS that meal (the review's bug: every meal after the first was filed as Lunch);
//   · Shape Kitchen: the website's catalog (recipes.jsx's SHAPE_RECIPES, the 100 recipes /recipes
//     shows) as foods the plan can hold, with the catalog's own calories, macros, diet, time and
//     ingredients; and the nutritionist's own recipes (profile_custom.kitchen.recipes, written in
//     the app's Make it yours → Your kitchen), which may carry no macros at all;
//   · a day's status against the target for its kind of day (training, or rest when the plan sets
//     a rest-day target), said in words: On target, Under, Over, Low P, Empty;
//   · the version the plan stamps when it changes (no Publish vN button);
//   · what the assignment adds to the core's snapshot: a rest day's own target, a note to the
//     client, and the Kitchen recipe a meal came from.
// ⚠ A NEW FILE ON PURPOSE. dashMealCore.js is a plain <script> with a hand-typed `?v=` that is not
// content-hashed at deploy, so a browser can pair a cached core with a new builder; a new URL has
// no cached copy to pair with.

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DashMealWeek = api;
})(typeof window !== "undefined" ? window : null, function () {
  var WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var ROWS = ["Breakfast", "Lunch", "Dinner", "Snack"];
  var MAIN = ["Breakfast", "Lunch", "Dinner"];
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  // ── The week ────────────────────────────────────────────────────────────────
  // The weekdays a rotation day is served on: the assignment sends day `dow % days.length` on each
  // weekday (dashMealCore.js buildMealAssignment), so a 3-day rotation serves Day A on Mon, Thu, Sun.
  // A day past the seventh is never served, and says so (an empty list).
  function servedWeekdays(count, index) {
    var out = [];
    var n = Math.floor(Number(count));
    if (!(n > 0) || index < 0 || index >= n) return out;
    for (var dow = 0; dow < 7; dow++) if (dow % n === index) out.push(dow);
    return out;
  }
  // The column's heading words: a seven-day plan's day IS its weekday.
  function servedLabel(count, index) {
    var days = servedWeekdays(count, index);
    if (!days.length) return "Not served · a week has 7 days";
    if (days.length === 7) return "Every day";
    return days.map(function (d) { return WEEKDAYS[d]; }).join(" · ");
  }
  // The rows a day's meals fall into: the four meals, then any slot the coach named themselves (the
  // row editor's slot list is the four, but a stored plan can carry another), in the order met.
  function slotRows(days) {
    var rows = ROWS.slice();
    (Array.isArray(days) ? days : []).forEach(function (meals) {
      (Array.isArray(meals) ? meals : []).forEach(function (m) {
        var s = m && typeof m.slot === "string" && m.slot.trim() ? m.slot : null;
        if (s && rows.indexOf(s) < 0) rows.push(s);
      });
    });
    return rows;
  }
  function mealsIn(meals, slot) {
    return (Array.isArray(meals) ? meals : []).filter(function (m) { return m && m.slot === slot; });
  }
  // The slot a meal added WITHOUT a row takes (the day editor's "+ Meal", a rest day's extra): the
  // first of Breakfast, Lunch and Dinner the day lacks, then a Snack. The same rule as
  // DashMeals.nextSlot, held here too so a cached core without it cannot bring back
  // "Breakfast, Lunch, Lunch, Lunch".
  function nextSlot(meals) {
    var taken = {};
    (Array.isArray(meals) ? meals : []).forEach(function (m) { if (m && m.slot) taken[m.slot] = true; });
    for (var i = 0; i < MAIN.length; i++) if (!taken[MAIN[i]]) return MAIN[i];
    return "Snack";
  }
  // The first row of a day with nothing in it, the Kitchen's default target; a full day adds a Snack.
  function firstEmptyRow(meals) {
    for (var i = 0; i < ROWS.length; i++) if (!mealsIn(meals, ROWS[i]).length) return ROWS[i];
    return "Snack";
  }
  // A food placed on a row: that row is its slot, always. A Kitchen recipe keeps its id, so the
  // client's app maps the meal back to the recipe even after the coach renames it.
  function placeMeal(food, slot, newMeal) {
    var m = newMeal(food, slot);
    m.slot = slot;
    if (food && typeof food.recipeId === "string" && food.recipeId) m.recipeId = food.recipeId;
    return m;
  }

  // ── Targets and a day's status ─────────────────────────────────────────────
  function validTargets(t) {
    return !!t && typeof t === "object" && num(t.kcal) > 0;
  }
  // The target a day is measured against. A rest day has its own only when the plan sets one; until
  // then it is the training target, and the page says so rather than inventing a number.
  function targetsFor(doc, kind) {
    var base = (doc && doc.targets) || { kcal: 0, p: 0, c: 0, f: 0 };
    if (kind === "rest" && doc && validTargets(doc.restTargets)) return doc.restTargets;
    return base;
  }
  function hasRestTargets(doc) { return !!doc && validTargets(doc.restTargets); }
  // ±5% of the calorie target is on target. Protein reads Low below the plan's floor when it sets
  // one, else below 90% of the protein target.
  var BAND = 0.05;
  function totals(meals) {
    var t = { kcal: 0, p: 0, c: 0, f: 0 };
    (Array.isArray(meals) ? meals : []).forEach(function (m) {
      if (!m) return;
      t.kcal += num(m.kcal); t.p += num(m.p); t.c += num(m.c); t.f += num(m.f);
    });
    return { kcal: Math.round(t.kcal), p: Math.round(t.p), c: Math.round(t.c), f: Math.round(t.f) };
  }
  function dayStatus(meals, target, proteinFloor) {
    var t = totals(meals);
    var list = (Array.isArray(meals) ? meals : []).filter(Boolean);
    var goal = num(target && target.kcal);
    var out = { totals: t, target: goal };
    if (!list.length) { out.key = "empty"; out.label = "Empty"; return out; }
    if (!(goal > 0)) { out.key = "none"; out.label = "No target"; return out; }
    var floor = proteinFloor != null && isFinite(Number(proteinFloor)) ? Number(proteinFloor) : num(target.p) * 0.9;
    if (t.kcal < goal * (1 - BAND)) { out.key = "under"; out.label = "Under"; out.by = goal - t.kcal; return out; }
    if (t.kcal > goal * (1 + BAND)) { out.key = "over"; out.label = "Over"; out.by = t.kcal - goal; return out; }
    if (t.p < floor) { out.key = "lowp"; out.label = "Low P"; out.by = Math.round(floor - t.p); return out; }
    out.key = "on"; out.label = "On target";
    return out;
  }
  // The week's brief: one sentence and the one day to open. The day furthest off its calories leads;
  // a day that is only short of protein comes after any that is off its calories.
  function weekBrief(cols) {
    var list = Array.isArray(cols) ? cols : [];
    var filled = list.filter(function (c) { return c && c.status && c.status.key !== "empty"; });
    if (!filled.length) return { text: "Nothing is planned yet. Drop a Kitchen recipe on a meal to start the week.", day: null };
    var off = filled.filter(function (c) { return c.status.key !== "on" && c.status.key !== "none"; });
    var empty = list.length - filled.length;
    if (!off.length) {
      return { text: empty ? "Every planned day is on target; " + empty + (empty === 1 ? " day is" : " days are") + " still empty." : "Every day is on target.", day: null };
    }
    var rank = function (c) { return c.status.key === "lowp" ? 0 : 1; };
    var lead = off.slice().sort(function (a, b) { return rank(b) - rank(a) || (b.status.by || 0) - (a.status.by || 0); })[0];
    var s = lead.status;
    var what = s.key === "under" ? s.by.toLocaleString("en-US") + " kcal under " + s.target.toLocaleString("en-US")
      : s.key === "over" ? s.by.toLocaleString("en-US") + " kcal over " + s.target.toLocaleString("en-US")
      : s.by + " g short of protein";
    var head = off.length === 1 ? "1 day is off target" : off.length + " days are off target";
    return { text: head + ": " + lead.name + " is " + what + ".", day: lead.index };
  }
  // Calories before and after a food lands on a day ("1,370 → 1,710").
  function projectDay(meals, food) {
    var from = totals(meals).kcal;
    return { from: from, to: Math.round(from + num(food && food.kcal)) };
  }

  // ── Shape Kitchen ──────────────────────────────────────────────────────────
  // The catalog's time is a total ("1 hr 20 min"), read the way /recipes reads it
  // (recipesPage.jsx recipeMinutes). Unreadable is null, never zero.
  function recipeMinutes(time) {
    var s = String(time == null ? "" : time).toLowerCase();
    var h = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|h)\b/);
    var m = s.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes|m)\b/);
    if (!h && !m) return null;
    return Math.round((h ? parseFloat(h[1]) * 60 : 0) + (m ? parseFloat(m[1]) : 0));
  }
  // The app's slug rule (cookable.mjs bsCookSlug), so the id a plan meal carries is the one the
  // client's app reads it back by.
  function recipeId(title) {
    var s = String(title == null ? "" : title).trim();
    return s ? s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") : "";
  }
  var UNITS = ["oz", "lb", "lbs", "g", "kg", "ml", "l", "cup", "cups", "tbsp", "tsp", "can", "cans", "clove", "cloves", "slice", "slices", "sprig", "sprigs", "pinch", "bunch", "head", "stalk", "stalks", "scoop", "scoops", "fillet", "fillets"];
  function qtyOf(s) {
    var t = String(s).trim();
    var mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    var frac = t.match(/^(\d+)\/(\d+)$/);
    if (frac) return Number(frac[1]) / Number(frac[2]);
    return Number(t.replace(",", "."));
  }
  // One catalog ingredient line ("1 1/2 tbsp margarine, melted (150 kcal)") as the grocery's
  // { name, qty, unit }, per serving. A line with no quantity ("to taste salt", "handful basil") is
  // listed once, with no amount, rather than given one.
  function parseIngredient(line, servings) {
    var s = String(line == null ? "" : line).replace(/\s*\(\d+\s*kcal\)\s*$/i, "").trim();
    if (!s) return null;
    var per = Number(servings) > 0 ? Number(servings) : 1;
    var m = s.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s+(.*)$/);
    if (!m) return { name: s, qty: null, unit: "" };
    var qty = qtyOf(m[1]);
    var rest = m[2];
    var unit = "";
    var w = rest.match(/^([a-zA-Z]+)\.?\s+(.*)$/);
    if (w && UNITS.indexOf(w[1].toLowerCase()) >= 0) { unit = w[1].toLowerCase(); rest = w[2]; }
    var name = rest.replace(/,.*$/, "").trim() || rest.trim();
    return { name: name, qty: Math.round((qty / per) * 100) / 100, unit: unit };
  }
  // What a catalog recipe is known to hold. Dairy and gluten are the catalog's own lists
  // (recipes.jsx recipeNeeds); the other allergens are read from the recipe's ingredients and its
  // diet, and the panel says so where it filters on one.
  var ALLERGEN_WORDS = {
    // A nut by name, or the word nut(s) on its own: never "nutmeg" (Codex on #2648).
    nuts: /\b(?:(?:almond|walnut|pecan|cashew|pistachio|hazelnut|peanut|macadamia)\w*|pine nuts?|nut butters?|nuts?)\b/i,
    egg: /\b(eggs?|egg whites?|yolks?|mayo|mayonnaise)\b/i,
    soy: /\b(soy|tofu|tempeh|edamame|miso|tamari)\w*/i,
    fish: /\b(salmon|tuna|cod|fish|anchov\w*|sardines?|trout|tilapia|halibut|mackerel|haddock|snapper)\b/i,
    shellfish: /\b(shrimps?|prawns?|crab|lobster|scallops?|mussels?|clams?|oysters?)\b/i,
  };
  var READ_FROM_INGREDIENTS = ["nuts", "egg", "soy", "fish", "shellfish"];
  // A dish of the coach's own has no catalog lists, so every allergen is read from its name and its
  // ingredients' names (Codex on #2648: "Satay bowl" with peanuts passed a nuts exclusion when only
  // its name and tags were read). Dairy and gluten need words of their own here.
  var OWN_WORDS = {
    // A plant milk or butter ("peanut butter", "oat milk", "coconut cream") is not dairy.
    dairy: /(?<!\b(?:peanut|nut|almond|cashew|sunflower|seed|apple|cocoa|shea|coconut|oat|soy|rice|hemp) )\b(milk|butter|cream)\b|\b(cheese|cheddar|mozzarella|parmesan|feta|ricotta|yog(h)?urt|whey|casein|ghee|paneer|kefir|labneh|skyr)\w*/i,
    // Oats count, as the core's own oat dishes are tagged gluten (Codex on #2648).
    gluten: /\b(wheat|flour|bread|pasta|noodles?|barley|rye|couscous|seitan|bulgur|semolina|spelt|farro|tortillas?|pita|crackers?|breadcrumbs?|panko|oats?|oatmeal|granola|muesli)\b/i,
  };
  function ownContains(food, allergen) {
    var a = String(allergen).toLowerCase();
    if ((food.tags || []).indexOf(a) >= 0) return true;
    var text = String(food.name || "") + " " + (Array.isArray(food.ingredients) ? food.ingredients.map(function (g) { return g && g.name ? g.name : ""; }).join(" ") : "");
    var re = OWN_WORDS[a] || ALLERGEN_WORDS[a];
    return re ? re.test(text) : text.toLowerCase().indexOf(a) >= 0;
  }
  function kitchenContains(food, allergen) {
    var k = food && food.kitchen;
    if (!k) return false;
    if (allergen === "dairy") return k.needs.indexOf("Dairy-free") < 0;
    if (allergen === "gluten") return k.needs.indexOf("Gluten-free") < 0;
    if (k.diet === "Vegan" && (allergen === "egg" || allergen === "fish" || allergen === "shellfish")) return false;
    if ((k.diet === "Vegetarian" || k.diet === "Plant-based") && (allergen === "fish" || allergen === "shellfish")) return false;
    var re = ALLERGEN_WORDS[allergen];
    if (!re) return String(food.name).toLowerCase().indexOf(String(allergen).toLowerCase()) >= 0;
    return re.test(food.name + " " + k.text);
  }
  var VEGETARIAN = ["Vegetarian", "Vegan", "Plant-based"];
  // A catalog recipe as a food the plan can hold. A recipe with no calories cannot be costed, and
  // is left out rather than given zeros.
  function kitchenFood(r, needsOf) {
    if (!r || typeof r !== "object" || !r.title || !r.macros || !(num(r.kcal) > 0)) return null;
    var lines = Array.isArray(r.ingredients) ? r.ingredients : [];
    var ings = [];
    lines.forEach(function (l) {
      var g = parseIngredient(typeof l === "string" ? l : (l && ((l.n ? l.n + " " : "") + (l.m || ""))), r.servings);
      if (g) ings.push(g);
    });
    var needs = typeof needsOf === "function" ? (needsOf(r) || []) : [];
    var mins = recipeMinutes(r.time);
    var text = lines.map(function (l) { return typeof l === "string" ? l : (l && l.m) || ""; }).join(" ");
    return {
      id: "k-" + recipeId(r.title), recipeId: recipeId(r.title), name: String(r.title),
      kcal: Math.round(num(r.kcal)), p: Math.round(num(r.macros.p)), c: Math.round(num(r.macros.c)), f: Math.round(num(r.macros.f)),
      prepMin: mins, tags: [], ingredients: ings,
      kitchen: { diet: r.diet || null, tags: Array.isArray(r.tags) ? r.tags.slice() : [], needs: needs, time: r.time || null, servings: num(r.servings) || 1, text: text },
    };
  }
  function kitchenFoods(list, needsOf) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (r) { var f = kitchenFood(r, needsOf); if (f) out.push(f); });
    return out;
  }
  // A recipe from the nutritionist's own kitchen (profileCustom.mjs bsKitchenRecipeItem's shape:
  // { id, t, min?, serves?, kcal?, p?, c?, f?, ing?: [{ n?, m }], photo? }). Macros they never wrote
  // stay unset: the picker reads "Macros not set", as it does for a dish named in a plan.
  function ownRecipeFood(r) {
    if (!r || typeof r !== "object" || !r.t) return null;
    var has = function (k) { return Number.isInteger(r[k]); };
    var serves = has("serves") && r.serves > 0 ? r.serves : 1;
    var ings = [];
    (Array.isArray(r.ing) ? r.ing : []).forEach(function (g) {
      var p = g && parseIngredient((g.n ? g.n + " " : "") + (g.m || ""), serves);
      if (p) ings.push(p);
    });
    return {
      id: "mine-" + String(r.id || recipeId(r.t)), name: String(r.t),
      kcal: has("kcal") ? r.kcal : 0, p: has("p") ? r.p : 0, c: has("c") ? r.c : 0, f: has("f") ? r.f : 0,
      prepMin: has("min") ? r.min : null, tags: [], ingredients: ings, own: true,
      photo: typeof r.photo === "string" ? r.photo : null, fromKitchen: true,
    };
  }
  var KITCHEN_FILTERS = [
    { key: "protein", label: "High protein" },
    { key: "veg", label: "Vegetarian" },
    { key: "quick", label: "Under 20 min" },
  ];
  function kitchenMatches(food, q, filters, constraints) {
    if (!food) return false;
    var on = filters || {};
    var k = food.kitchen || null;
    var ex = (constraints && constraints.exclusions) || [];
    for (var i = 0; i < ex.length; i++) {
      var a = String(ex[i]).toLowerCase();
      if (k ? kitchenContains(food, a) : ownContains(food, a)) return false;
    }
    var maxPrep = constraints && constraints.maxPrep;
    if (maxPrep != null && food.prepMin != null && food.prepMin > maxPrep) return false;
    // High protein: the catalog's own rule (recipeNeeds' "High-protein", 30 g or more), or its tag.
    if (on.protein && !(k ? (k.needs.indexOf("High-protein") >= 0 || k.tags.indexOf("High protein") >= 0) : num(food.p) >= 30)) return false;
    if (on.veg && !(k && VEGETARIAN.indexOf(k.diet) >= 0)) return false;
    if (on.quick && !(food.prepMin != null && food.prepMin < 20)) return false;
    var s = String(q || "").trim().toLowerCase();
    if (!s) return true;
    var hay = (food.name + " " + (k ? (k.diet || "") + " " + k.tags.join(" ") + " " + k.text : "")).toLowerCase();
    return s.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function searchKitchen(list, q, filters, constraints) {
    return (Array.isArray(list) ? list : []).filter(function (f) { return kitchenMatches(f, q, filters, constraints); });
  }
  // The exclusions a Kitchen filter can only read from the ingredients, for the panel's one line.
  function readFromIngredients(constraints) {
    return ((constraints && constraints.exclusions) || []).filter(function (a) { return READ_FROM_INGREDIENTS.indexOf(String(a).toLowerCase()) >= 0; });
  }

  // ── The version a plan stamps ──────────────────────────────────────────────
  // No Publish vN button: a library plan that changes takes the next version once per editing
  // visit, and the assignment snapshots it ("snapshot v4"). A plan not yet in the library (new, or a
  // copy) keeps the version it opened with. Edits undone return it to the version it opened.
  function contentKey(doc) {
    if (!doc || typeof doc !== "object") return "";
    var c = clone(doc);
    delete c.version;
    return JSON.stringify(c);
  }
  function opening(doc, persisted) {
    return { version: Number(doc && doc.version) > 0 ? Number(doc.version) : 1, key: contentKey(doc), persisted: !!persisted };
  }
  function stampVersion(next, opened) {
    if (!next || typeof next !== "object" || !opened) return next;
    var want = opened.persisted && contentKey(next) !== opened.key ? opened.version + 1 : opened.version;
    if (next.version === want) return next;
    var out = {};
    for (var k in next) if (Object.prototype.hasOwnProperty.call(next, k)) out[k] = next[k];
    out.version = want;
    return out;
  }

  // ── Spread a rotation over the week ────────────────────────────────────────
  // A rotation shorter than seven days becomes seven, Monday to Sunday, each a copy of the day the
  // assignment already serves that weekday, so what a client gets is unchanged. Meal ids are fresh
  // per copy, and each copy's variant overrides follow them.
  function spreadWeek(doc, idOf) {
    var next = clone(doc);
    var days = Array.isArray(next.days) ? next.days : [];
    if (!days.length || days.length >= 7) return next;
    var mk = typeof idOf === "function" ? idOf : function () { return "m" + Math.random().toString(36).slice(2, 10); };
    var out = [];
    for (var dow = 0; dow < 7; dow++) {
      var copy = clone(days[dow % days.length]);
      var remap = {};
      copy.slots = (copy.slots || []).map(function (m) { var id = mk(); remap[m.id] = id; return Object.assign({}, m, { id: id }); });
      Object.keys(copy.variants || {}).forEach(function (vk) {
        var v = copy.variants[vk] || {};
        var ov = {};
        Object.keys(v.overrides || {}).forEach(function (oid) { if (remap[oid]) ov[remap[oid]] = v.overrides[oid] ? Object.assign({}, v.overrides[oid], { id: remap[oid] }) : null; });
        v.overrides = ov;
        v.extras = (v.extras || []).map(function (m) { return Object.assign({}, m, { id: mk() }); });
      });
      copy.name = WEEKDAY_NAMES[dow];
      out.push(copy);
    }
    next.days = out;
    return next;
  }

  // ── The assignment ─────────────────────────────────────────────────────────
  // The core's snapshot (DashMeals.buildMealAssignment) with what the week adds: a rest day measured
  // against the plan's rest-day target (scaled like the training one), the coach's note on a meal as
  // `coachNote` (the client's Kitchen card prints it, labelled COACH), and a Kitchen meal's recipe id.
  // Which weekday is a rest day is the core's call (its `tag`), never re-derived here.
  // ⚠ A REST DAY IS ANY WEEKDAY THE CLIENT DOES NOT TRAIN ON, whether or not the plan wrote a rest
  // version of its meals: the core tags a day REST only when it serves a rest version, so a plan with
  // a rest-day target and no rest versions used to send every weekday the training target.
  function buildAssignment(core, plan, opts) {
    var o = opts || {};
    var out = core.buildMealAssignment(plan, o);
    var scale = o.scale || 1;
    var n = (plan.days || []).length;
    var training = Array.isArray(o.trainingDows) ? o.trainingDows : [0, 2, 4];
    out.days.forEach(function (d) {
      if ((d.tag === "REST" || training.indexOf(d.dow) < 0) && validTargets(plan.restTargets)) {
        var r = plan.restTargets;
        d.targets = { cal: Math.round(num(r.kcal) * scale), p: Math.round(num(r.p) * scale), c: Math.round(num(r.c) * scale), f: Math.round(num(r.f) * scale) };
      }
      if (!n) return;
      var src = core.resolveDay(plan.days[d.dow % n], d.tag === "REST" ? "rest" : "training");
      d.meals.forEach(function (m, i) {
        var s = src[i];
        if (!s) return;
        var note = typeof s.note === "string" ? s.note.trim() : "";
        if (note) m.coachNote = note;
        if (typeof s.recipeId === "string" && s.recipeId) m.recipeId = s.recipeId;
      });
    });
    return out;
  }

  // A phase shift moves the rest-day target with the meals (Codex on #2648): the core shifts every
  // meal and the training target, and a rest day measured against an unshifted target misreads.
  function phaseShift(core, plan, deltas) {
    var next = core.phaseShift(plan, deltas);
    if (!validTargets(plan.restTargets)) return next;
    var r = Object.assign({}, plan.restTargets);
    if (deltas.proteinPct) r.p = Math.round(num(r.p) * (1 + deltas.proteinPct / 100));
    if (deltas.carbsPct) r.c = Math.round(num(r.c) * (1 + deltas.carbsPct / 100));
    if (deltas.fatPct) r.f = Math.round(num(r.f) * (1 + deltas.fatPct / 100));
    r.kcal = num(r.p) * 4 + num(r.c) * 4 + num(r.f) * 9;
    next.restTargets = r;
    return next;
  }

  // The grocery list's first items, and how many more: the items most meals share lead.
  function groceryTop(list, n) {
    var all = Array.isArray(list) ? list : [];
    var top = all.slice().sort(function (a, b) { return (b.meals || []).length - (a.meals || []).length || String(a.name).localeCompare(String(b.name)); }).slice(0, n);
    return { top: top, more: Math.max(0, all.length - top.length) };
  }

  return {
    WEEKDAYS: WEEKDAYS, WEEKDAY_NAMES: WEEKDAY_NAMES, ROWS: ROWS, KITCHEN_FILTERS: KITCHEN_FILTERS, READ_FROM_INGREDIENTS: READ_FROM_INGREDIENTS,
    servedWeekdays: servedWeekdays, servedLabel: servedLabel, slotRows: slotRows, mealsIn: mealsIn, nextSlot: nextSlot, firstEmptyRow: firstEmptyRow, placeMeal: placeMeal,
    targetsFor: targetsFor, hasRestTargets: hasRestTargets, totals: totals, dayStatus: dayStatus, weekBrief: weekBrief, projectDay: projectDay,
    recipeMinutes: recipeMinutes, recipeId: recipeId, parseIngredient: parseIngredient, kitchenContains: kitchenContains, ownContains: ownContains,
    kitchenFood: kitchenFood, kitchenFoods: kitchenFoods, ownRecipeFood: ownRecipeFood, kitchenMatches: kitchenMatches, searchKitchen: searchKitchen, readFromIngredients: readFromIngredients,
    contentKey: contentKey, opening: opening, stampVersion: stampVersion, spreadWeek: spreadWeek, buildAssignment: buildAssignment, groceryTop: groceryTop, phaseShift: phaseShift,
  };
});
