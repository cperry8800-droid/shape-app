// Meal-plan builder core (dashboard-v2 final step). PURE module — browser
// global (window.DashMeals) + Node require() for tests, like dashBuilderCore.
//
// Template document (coach_plans.detail.mealBuilder):
//   {
//     version: n,
//     goalPhase: 'cut'|'maintain'|'build',
//     targets: { kcal, p, c, f },                  // set FIRST; everything measures against these
//     constraints: { proteinFloor: n|null, exclusions: ['shellfish',…], maxPrep: n|null },
//     days: [ {
//       name: 'Day A',
//       slots: [ meal ],                            // base = the TRAINING-day version
//       variants: {                                 // FIRST-CLASS: overlays, not copies
//         rest:   { overrides: { [mealId]: meal|null }, extras: [meal] },
//         travel: { overrides: {…}, extras: […] } | undefined,
//       },
//     } ],
//   }
//   meal = { id, slot: 'Breakfast'|'Lunch'|'Dinner'|'Snack'|custom, name,
//            kcal, p, c, f, prepMin|null, ingredients: [{name, qty, unit}],
//            swaps: [≤3 {name, kcal, p, c, f}] }    // approved alternates
//
// A variant resolves as: base meals, minus overrides set to null, with
// overridden meals replaced, plus extras. Editing a base meal either flows
// into variants (they keep referencing it) or — when the trainer declines —
// the OLD meal is frozen into each variant as an override first.

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DashMeals = api;
})(typeof window !== "undefined" ? window : null, function () {
  var GOAL_PHASES = [
    { key: "cut", label: "Cut", c: "#d8a23a", targets: { kcal: 1900, p: 165, c: 170, f: 60 } },
    { key: "maintain", label: "Maintain", c: "#2ee0c4", targets: { kcal: 2300, p: 160, c: 250, f: 75 } },
    { key: "build", label: "Build", c: "#8a5cf6", targets: { kcal: 2700, p: 180, c: 320, f: 85 } },
  ];
  var SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"];
  var VARIANT_KEYS = [
    { key: "training", label: "Training day" },
    { key: "rest", label: "Rest day" },
    { key: "travel", label: "Travel day" },
  ];

  // ── Food + recipe library (searchable; tags drive exclusion filters) ──────
  // qty units are per listed serving; ingredients aggregate into the grocery.
  var FOODS = [
    { id: "f1", name: "Greek yogurt (250 g)", kcal: 160, p: 25, c: 9, f: 2, prepMin: 1, tags: ["dairy"], ingredients: [{ name: "Greek yogurt", qty: 250, unit: "g" }] },
    { id: "f2", name: "Overnight oats", kcal: 420, p: 18, c: 62, f: 11, prepMin: 5, tags: ["oats", "dairy"], ingredients: [{ name: "Rolled oats", qty: 80, unit: "g" }, { name: "Milk", qty: 200, unit: "ml" }, { name: "Chia seeds", qty: 15, unit: "g" }] },
    { id: "f3", name: "3-egg omelette + toast", kcal: 440, p: 28, c: 28, f: 22, prepMin: 10, tags: ["egg", "gluten"], ingredients: [{ name: "Eggs", qty: 3, unit: "" }, { name: "Sourdough", qty: 2, unit: "slices" }, { name: "Butter", qty: 10, unit: "g" }] },
    { id: "f4", name: "Protein shake (whey + banana)", kcal: 260, p: 32, c: 28, f: 3, prepMin: 2, tags: ["dairy"], ingredients: [{ name: "Whey protein", qty: 35, unit: "g" }, { name: "Banana", qty: 1, unit: "" }] },
    { id: "f5", name: "Grilled chicken bowl", kcal: 620, p: 52, c: 68, f: 18, prepMin: 20, tags: [], ingredients: [{ name: "Chicken breast", qty: 200, unit: "g" }, { name: "Rice", qty: 180, unit: "g" }, { name: "Broccoli", qty: 150, unit: "g" }, { name: "Olive oil", qty: 10, unit: "ml" }] },
    { id: "f6", name: "Salmon, rice & greens", kcal: 680, p: 46, c: 64, f: 24, prepMin: 25, tags: ["fish"], ingredients: [{ name: "Salmon fillet", qty: 180, unit: "g" }, { name: "Rice", qty: 180, unit: "g" }, { name: "Spinach", qty: 100, unit: "g" }] },
    { id: "f7", name: "Chicken thighs, rice & greens", kcal: 690, p: 45, c: 64, f: 26, prepMin: 25, tags: [], ingredients: [{ name: "Chicken thighs", qty: 200, unit: "g" }, { name: "Rice", qty: 180, unit: "g" }, { name: "Spinach", qty: 100, unit: "g" }] },
    { id: "f8", name: "Turkey & rice bowl", kcal: 610, p: 48, c: 66, f: 14, prepMin: 20, tags: [], ingredients: [{ name: "Turkey mince", qty: 200, unit: "g" }, { name: "Rice", qty: 180, unit: "g" }, { name: "Peppers", qty: 120, unit: "g" }] },
    { id: "f9", name: "Tofu stir-fry + rice", kcal: 580, p: 34, c: 72, f: 16, prepMin: 18, tags: ["soy", "plant"], ingredients: [{ name: "Tofu", qty: 200, unit: "g" }, { name: "Rice", qty: 160, unit: "g" }, { name: "Stir-fry veg", qty: 200, unit: "g" }] },
    { id: "f10", name: "Shrimp tacos (3)", kcal: 540, p: 38, c: 58, f: 16, prepMin: 15, tags: ["shellfish", "gluten"], ingredients: [{ name: "Shrimp", qty: 180, unit: "g" }, { name: "Tortillas", qty: 3, unit: "" }, { name: "Slaw mix", qty: 100, unit: "g" }] },
    { id: "f11", name: "Beef chili + sweet potato", kcal: 640, p: 44, c: 60, f: 22, prepMin: 35, tags: [], ingredients: [{ name: "Lean beef mince", qty: 180, unit: "g" }, { name: "Sweet potato", qty: 250, unit: "g" }, { name: "Black beans", qty: 120, unit: "g" }] },
    { id: "f12", name: "Tuna wrap", kcal: 430, p: 36, c: 44, f: 12, prepMin: 8, tags: ["fish", "gluten"], ingredients: [{ name: "Tuna (tin)", qty: 1, unit: "" }, { name: "Tortilla wrap", qty: 1, unit: "" }, { name: "Greek yogurt", qty: 40, unit: "g" }] },
    { id: "f13", name: "Cottage cheese + berries", kcal: 220, p: 26, c: 18, f: 5, prepMin: 2, tags: ["dairy"], ingredients: [{ name: "Cottage cheese", qty: 200, unit: "g" }, { name: "Mixed berries", qty: 100, unit: "g" }] },
    { id: "f14", name: "Apple + peanut butter", kcal: 280, p: 8, c: 30, f: 16, prepMin: 2, tags: ["nuts"], ingredients: [{ name: "Apple", qty: 1, unit: "" }, { name: "Peanut butter", qty: 30, unit: "g" }] },
    { id: "f15", name: "Rice cakes + cottage cheese", kcal: 190, p: 16, c: 26, f: 3, prepMin: 3, tags: ["dairy"], ingredients: [{ name: "Rice cakes", qty: 3, unit: "" }, { name: "Cottage cheese", qty: 120, unit: "g" }] },
    { id: "f16", name: "Trail mix (40 g)", kcal: 230, p: 7, c: 18, f: 15, prepMin: 0, tags: ["nuts"], ingredients: [{ name: "Trail mix", qty: 40, unit: "g" }] },
    { id: "f17", name: "Protein pancakes", kcal: 480, p: 36, c: 54, f: 12, prepMin: 15, tags: ["egg", "dairy", "gluten"], ingredients: [{ name: "Whey protein", qty: 30, unit: "g" }, { name: "Oats", qty: 60, unit: "g" }, { name: "Eggs", qty: 2, unit: "" }] },
    { id: "f18", name: "Burrito bowl (chicken)", kcal: 720, p: 50, c: 78, f: 22, prepMin: 20, tags: [], ingredients: [{ name: "Chicken breast", qty: 180, unit: "g" }, { name: "Rice", qty: 180, unit: "g" }, { name: "Black beans", qty: 100, unit: "g" }, { name: "Guacamole", qty: 50, unit: "g" }] },
    { id: "f19", name: "Lentil curry + rice", kcal: 560, p: 24, c: 88, f: 12, prepMin: 30, tags: ["plant"], ingredients: [{ name: "Red lentils", qty: 150, unit: "g" }, { name: "Rice", qty: 160, unit: "g" }, { name: "Coconut milk", qty: 100, unit: "ml" }] },
    { id: "f20", name: "Steak, potatoes & asparagus", kcal: 710, p: 52, c: 52, f: 30, prepMin: 30, tags: [], ingredients: [{ name: "Sirloin steak", qty: 220, unit: "g" }, { name: "Baby potatoes", qty: 250, unit: "g" }, { name: "Asparagus", qty: 120, unit: "g" }] },
    { id: "f21", name: "Protein bar", kcal: 210, p: 20, c: 21, f: 7, prepMin: 0, tags: ["bar"], ingredients: [{ name: "Protein bar", qty: 1, unit: "" }] },
    { id: "f22", name: "Sushi set (12 pc)", kcal: 580, p: 28, c: 88, f: 12, prepMin: 0, tags: ["fish", "travel"], ingredients: [{ name: "Sushi set", qty: 1, unit: "" }] },
    { id: "f23", name: "Chicken caesar (no croutons)", kcal: 460, p: 42, c: 12, f: 26, prepMin: 10, tags: ["dairy", "egg"], ingredients: [{ name: "Chicken breast", qty: 160, unit: "g" }, { name: "Romaine", qty: 120, unit: "g" }, { name: "Caesar dressing", qty: 30, unit: "ml" }] },
    { id: "f24", name: "Egg-white veggie scramble", kcal: 280, p: 30, c: 14, f: 11, prepMin: 12, tags: ["egg"], ingredients: [{ name: "Egg whites", qty: 250, unit: "ml" }, { name: "Mixed veg", qty: 150, unit: "g" }, { name: "Feta", qty: 30, unit: "g" }] },
  ];

  function searchFoods(q, constraints) {
    var s = String(q || "").trim().toLowerCase();
    var ex = (constraints && constraints.exclusions) || [];
    var maxPrep = constraints && constraints.maxPrep;
    return FOODS.filter(function (f) {
      for (var i = 0; i < ex.length; i++) {
        var tag = String(ex[i]).toLowerCase();
        if (f.tags.indexOf(tag) >= 0 || f.name.toLowerCase().indexOf(tag) >= 0) return false;
      }
      if (maxPrep != null && f.prepMin != null && f.prepMin > maxPrep) return false;
      if (!s) return true;
      return f.name.toLowerCase().indexOf(s) >= 0 || f.tags.join(" ").indexOf(s) >= 0;
    }).slice(0, 12);
  }

  var _uid = 0;
  function uid() { _uid += 1; return "m" + Date.now().toString(36) + "-" + _uid; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function newMeal(food, slot) {
    return {
      id: uid(), slot: slot || "Lunch", name: food.name,
      kcal: food.kcal, p: food.p, c: food.c, f: food.f,
      prepMin: food.prepMin != null ? food.prepMin : null,
      ingredients: clone(food.ingredients || []),
      swaps: [],
    };
  }
  function newDay(name) { return { name: name || "Day A", slots: [], variants: {} }; }
  function newPlan(name, phaseKey) {
    var phase = GOAL_PHASES.find(function (g) { return g.key === phaseKey; }) || GOAL_PHASES[0];
    return {
      version: 1, goalPhase: phase.key,
      targets: clone(phase.targets),
      constraints: { proteinFloor: phase.targets.p - 20, exclusions: [], maxPrep: null },
      days: [newDay("Day A")],
    };
  }

  // ── Variant resolution (first-class overlays) ──────────────────────────────
  function resolveDay(day, variantKey) {
    if (!variantKey || variantKey === "training" || !day.variants || !day.variants[variantKey]) {
      return clone(day.slots);
    }
    var v = day.variants[variantKey];
    var out = [];
    for (var i = 0; i < day.slots.length; i++) {
      var m = day.slots[i];
      if (v.overrides && Object.prototype.hasOwnProperty.call(v.overrides, m.id)) {
        var o = v.overrides[m.id];
        if (o) out.push(clone(o)); // replaced
        // null = removed on this variant
      } else {
        out.push(clone(m)); // follows base
      }
    }
    return out.concat(clone((v.extras || [])));
  }

  // Edit a base meal. applyToVariants=false freezes the OLD meal into every
  // existing variant that was still following base, THEN updates base — so
  // variants keep what the coach had approved.
  function editBaseMeal(day, mealId, nextMeal, applyToVariants) {
    var next = clone(day);
    var idx = next.slots.findIndex(function (m) { return m.id === mealId; });
    if (idx < 0) return next;
    if (!applyToVariants && next.variants) {
      Object.keys(next.variants).forEach(function (k) {
        var v = next.variants[k];
        v.overrides = v.overrides || {};
        if (!Object.prototype.hasOwnProperty.call(v.overrides, mealId)) {
          v.overrides[mealId] = clone(next.slots[idx]); // freeze the old version
        }
      });
    }
    var preserved = nextMeal.id ? nextMeal : Object.assign({}, nextMeal, { id: mealId });
    next.slots[idx] = Object.assign({}, clone(preserved), { id: mealId });
    return next;
  }

  function hasVariantFollowers(day, mealId) {
    if (!day.variants) return false;
    var keys = Object.keys(day.variants);
    for (var i = 0; i < keys.length; i++) {
      var v = day.variants[keys[i]];
      if (!v.overrides || !Object.prototype.hasOwnProperty.call(v.overrides, mealId)) return true;
    }
    return false;
  }

  // ── Macro math ─────────────────────────────────────────────────────────────
  function mealsTotals(meals) {
    var t = { kcal: 0, p: 0, c: 0, f: 0 };
    for (var i = 0; i < meals.length; i++) {
      t.kcal += Number(meals[i].kcal) || 0; t.p += Number(meals[i].p) || 0;
      t.c += Number(meals[i].c) || 0; t.f += Number(meals[i].f) || 0;
    }
    return t;
  }
  function scaleMeal(meal, k) {
    var m = clone(meal);
    ["kcal", "p", "c", "f"].forEach(function (key) { m[key] = Math.round((Number(m[key]) || 0) * k); });
    m.ingredients = (m.ingredients || []).map(function (ing) {
      return { name: ing.name, qty: Math.round((Number(ing.qty) || 0) * k * 10) / 10, unit: ing.unit || "" };
    });
    m.swaps = (m.swaps || []).map(function (s) {
      return { name: s.name, kcal: Math.round(s.kcal * k), p: Math.round(s.p * k), c: Math.round(s.c * k), f: Math.round(s.f * k) };
    });
    return m;
  }

  // Phase shift — one-step macro adjustment across EVERY day, variant
  // override, extra, and swap ("−10% carbs for the Sam R. adjustment").
  // kcal recomputes from the shifted macros (4/4/9).
  function phaseShift(plan, deltas) {
    var next = clone(plan);
    var shiftMeal = function (m) {
      if (deltas.proteinPct) m.p = Math.round(m.p * (1 + deltas.proteinPct / 100));
      if (deltas.carbsPct) m.c = Math.round(m.c * (1 + deltas.carbsPct / 100));
      if (deltas.fatPct) m.f = Math.round(m.f * (1 + deltas.fatPct / 100));
      m.kcal = m.p * 4 + m.c * 4 + m.f * 9;
      (m.swaps || []).forEach(function (s) {
        if (deltas.proteinPct) s.p = Math.round(s.p * (1 + deltas.proteinPct / 100));
        if (deltas.carbsPct) s.c = Math.round(s.c * (1 + deltas.carbsPct / 100));
        if (deltas.fatPct) s.f = Math.round(s.f * (1 + deltas.fatPct / 100));
        s.kcal = s.p * 4 + s.c * 4 + s.f * 9;
      });
    };
    next.days.forEach(function (day) {
      day.slots.forEach(shiftMeal);
      Object.keys(day.variants || {}).forEach(function (k) {
        var v = day.variants[k];
        Object.keys(v.overrides || {}).forEach(function (id) { if (v.overrides[id]) shiftMeal(v.overrides[id]); });
        (v.extras || []).forEach(shiftMeal);
      });
    });
    if (deltas.proteinPct) next.targets.p = Math.round(next.targets.p * (1 + deltas.proteinPct / 100));
    if (deltas.carbsPct) next.targets.c = Math.round(next.targets.c * (1 + deltas.carbsPct / 100));
    if (deltas.fatPct) next.targets.f = Math.round(next.targets.f * (1 + deltas.fatPct / 100));
    next.targets.kcal = next.targets.p * 4 + next.targets.c * 4 + next.targets.f * 9;
    return next;
  }

  function checkConstraints(plan, meals) {
    var warnings = [];
    var t = mealsTotals(meals);
    if (plan.constraints && plan.constraints.proteinFloor != null && t.p < plan.constraints.proteinFloor) {
      warnings.push("Protein " + t.p + "g is under the " + plan.constraints.proteinFloor + "g floor");
    }
    return warnings;
  }

  // ── Grocery (aggregated, per assigned week) ────────────────────────────────
  function buildGrocery(daysMeals, scale) {
    var k = scale || 1;
    var byKey = {};
    daysMeals.forEach(function (meals) {
      meals.forEach(function (m) {
        (m.ingredients || []).forEach(function (ing) {
          var key = (ing.name + "|" + (ing.unit || "")).toLowerCase();
          if (!byKey[key]) byKey[key] = { name: ing.name, unit: ing.unit || "", qty: 0, meals: {} };
          byKey[key].qty += (Number(ing.qty) || 0) * k;
          byKey[key].meals[m.name] = true;
        });
      });
    });
    return Object.keys(byKey).map(function (key) {
      var g = byKey[key];
      return { name: g.name, qty: Math.round(g.qty * 10) / 10, unit: g.unit, meals: Object.keys(g.meals).slice(0, 3) };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  // ── Assignment snapshot (scaled per client; variant per weekday) ──────────
  // Produces the client_meal_plans payload shape the plan API + app already
  // read: days[{dow,title,tag,targets{cal,p,c,f},meals[{slot,title,kcal,p,c,f,
  // ingredients[{qty,name}],alts}]}]. Targets ship SCALED so the client's
  // ledger measures against this plan, not defaults.
  //
  // opts.groceryEdits — the coach's grocery-list edits, keyed "name|unit"
  // (lowercased): { remove: true } drops the ingredient from every meal;
  // { qty: n } rescales each contributing ingredient so the week's total hits
  // n. Edits flow through the INGREDIENTS (not a side list) because every
  // client grocery surface auto-builds from the plan's meals.
  var SLOT_TIMES = { Breakfast: "08:00", Lunch: "12:30", Snack: "16:00", Dinner: "19:00" };
  function groceryKey(ing) { return (ing.name + "|" + (ing.unit || "")).toLowerCase(); }
  function buildMealAssignment(plan, opts) {
    opts = opts || {};
    var scale = opts.scale || 1;
    var trainingDows = opts.trainingDows || [0, 2, 4]; // Mon/Wed/Fri
    var edits = opts.groceryEdits || null;
    // Resolve + scale every weekday's meals once.
    var weekMeals = [];
    var meta = [];
    for (var dow = 0; dow < 7; dow++) {
      var src = plan.days[dow % plan.days.length];
      var variant = trainingDows.indexOf(dow) >= 0 ? "training" : (src.variants && src.variants.rest ? "rest" : "training");
      weekMeals.push(resolveDay(src, variant).map(function (m) { return scaleMeal(m, scale); }));
      meta.push({ src: src, variant: variant });
    }
    // Apply grocery edits onto the ingredients themselves.
    if (edits) {
      var autoTotals = {};
      weekMeals.forEach(function (meals) {
        meals.forEach(function (m) {
          (m.ingredients || []).forEach(function (ing) {
            var k = groceryKey(ing);
            autoTotals[k] = (autoTotals[k] || 0) + (Number(ing.qty) || 0);
          });
        });
      });
      weekMeals.forEach(function (meals) {
        meals.forEach(function (m) {
          m.ingredients = (m.ingredients || []).filter(function (ing) {
            var e = edits[groceryKey(ing)];
            return !(e && e.remove);
          }).map(function (ing) {
            var e = edits[groceryKey(ing)];
            if (e && e.qty != null && autoTotals[groceryKey(ing)] > 0) {
              return { name: ing.name, unit: ing.unit, qty: Math.round(((Number(ing.qty) || 0) * (e.qty / autoTotals[groceryKey(ing)])) * 10) / 10 };
            }
            return ing;
          });
        });
      });
    }
    var days = weekMeals.map(function (meals, dow) {
      return {
        dow: dow,
        title: meta[dow].src.name + (meta[dow].variant === "rest" ? " · rest" : ""),
        tag: meta[dow].variant === "rest" ? "REST" : "TRAIN",
        targets: {
          cal: Math.round(plan.targets.kcal * scale), p: Math.round(plan.targets.p * scale),
          c: Math.round(plan.targets.c * scale), f: Math.round(plan.targets.f * scale),
        },
        meals: meals.map(function (sm) {
          return {
            slot: sm.slot, time: SLOT_TIMES[sm.slot] || "",
            title: sm.name, kcal: sm.kcal, p: sm.p, c: sm.c, f: sm.f,
            ingredients: (sm.ingredients || []).map(function (ing) { return { qty: ing.qty + (ing.unit ? " " + ing.unit : ""), name: ing.name }; }),
            alts: sm.swaps || [],
          };
        }),
      };
    });
    return { days: days, grocery: buildGrocery(weekMeals, 1) };
  }

  // ── Lifecycle groups from the unified client records ──────────────────────
  //   intake pending     — new client / no first check-in yet
  //   ready for phase    — recent 50%-to-goal milestone or ≤3 units from goal
  //   expiring this week — check-in is in, this week's plan not written yet
  //                        (the plan queue's "ready" set)
  function buildPlanLifecycle(clients, queue) {
    var intake = [], phase = [], expiring = [];
    var queueReady = {};
    (queue || []).forEach(function (r) { if (r.state === "ready") queueReady[r.client.profile.id] = true; });
    (clients || []).forEach(function (c) {
      if (c.profile.isNew || (c.checkIn && !c.checkIn.lastWeekOf)) { intake.push(c); return; }
      var m50 = (c.milestones || []).find(function (m) { return /50%/.test(m.label || ""); });
      var closeToGoal = c.goal && c.goal.target != null && c.goal.now != null && Math.abs(c.goal.now - c.goal.target) <= 3;
      if (m50 || closeToGoal) phase.push(c);
      if (queueReady[c.profile.id]) expiring.push(c);
    });
    return { intake: intake, phaseChange: phase, expiring: expiring };
  }

  // ── Demo templates ─────────────────────────────────────────────────────────
  function demoMealTemplates() {
    var meal = function (foodId, slot, swapsIds) {
      var f = FOODS.find(function (x) { return x.id === foodId; });
      var m = newMeal(f, slot);
      (swapsIds || []).forEach(function (sid) {
        var s = FOODS.find(function (x) { return x.id === sid; });
        if (s && m.swaps.length < 3) m.swaps.push({ name: s.name, kcal: s.kcal, p: s.p, c: s.c, f: s.f });
      });
      return m;
    };
    var mk = function (name, phaseKey, days) {
      var plan = newPlan(name, phaseKey);
      plan.version = 2;
      plan.days = days;
      return { id: "demo-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: name, published: true, detail: { mealBuilder: plan } };
    };
    var cutA = newDay("Day A");
    cutA.slots = [meal("f1", "Breakfast"), meal("f5", "Lunch", ["f8", "f9"]), meal("f13", "Snack"), meal("f6", "Dinner", ["f7"])];
    var restOverride = meal("f23", "Lunch");
    cutA.variants = { rest: { overrides: {}, extras: [] } };
    cutA.variants.rest.overrides[cutA.slots[1].id] = Object.assign(restOverride, { id: cutA.slots[1].id });
    cutA.variants.rest.overrides[cutA.slots[2].id] = null; // snack dropped on rest days
    var cutB = newDay("Day B");
    cutB.slots = [meal("f24", "Breakfast"), meal("f12", "Lunch", ["f10"]), meal("f15", "Snack"), meal("f11", "Dinner", ["f20"])];
    var maintA = newDay("Day A");
    maintA.slots = [meal("f2", "Breakfast"), meal("f18", "Lunch"), meal("f14", "Snack"), meal("f20", "Dinner", ["f6"])];
    var buildA = newDay("Day A");
    buildA.slots = [meal("f17", "Breakfast"), meal("f18", "Lunch", ["f5"]), meal("f4", "Snack"), meal("f20", "Dinner"), meal("f21", "Snack")];
    return [
      mk("Summer Cut · 1900", "cut", [cutA, cutB]),
      mk("Steady Maintain", "maintain", [maintA]),
      mk("Build Fuel · 2700", "build", [buildA]),
    ];
  }

  return {
    GOAL_PHASES: GOAL_PHASES, SLOTS: SLOTS, VARIANT_KEYS: VARIANT_KEYS, FOODS: FOODS,
    searchFoods: searchFoods, newMeal: newMeal, newDay: newDay, newPlan: newPlan,
    resolveDay: resolveDay, editBaseMeal: editBaseMeal, hasVariantFollowers: hasVariantFollowers,
    mealsTotals: mealsTotals, scaleMeal: scaleMeal, phaseShift: phaseShift,
    checkConstraints: checkConstraints, buildGrocery: buildGrocery,
    buildMealAssignment: buildMealAssignment, buildPlanLifecycle: buildPlanLifecycle,
    demoMealTemplates: demoMealTemplates,
  };
});
