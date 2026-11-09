// Mutation spec for the ingredient words the scan of every Kitchen recipe added after #2648 (owner,
// 9 Nov 2026: "We can scan recipes and wording in separate PR"): each word or exception
// dashMealWeek.js's ALLERGEN_WORDS and OWN_WORDS gained, and the builder's wording that the check is
// read from ingredient names and is not a certified allergen check. Each mutation takes one back out.
// A survivor is a missing test, or a proven no-op marked expectSurvive with its proof.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/own-recipe-allergen-words-2026-11-09.mutations.mjs --fail-on-skipped
const WEEK = 'public/newdesign/dashMealWeek.js';
const UI = 'public/newdesign/dashMealBuilder.jsx';

export default {
  test: 'node --test tests/builders-6c-meal.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── Gluten ──
    { name: 'croutons are not gluten', file: WEEK, find: '|crackers?|croutons?|breadcrumbs?|', replace: '|crackers?|breadcrumbs?|' },
    { name: 'a condensed soup is not gluten', file: WEEK, find: '|condensed(?: [\\w-]+){0,3} soups?|', replace: '|' },
    { name: 'a cream soup is not gluten', file: WEEK, find: '|cream of [\\w-]+ soups?)\\b(?!-free)/i,', replace: ')\\b(?!-free)/i,' },
    { name: 'corn tortillas are gluten', file: WEEK, find: '|(?<!\\bcorn )tortillas?|', replace: '|tortillas?|' },
    { name: 'pasta sauce is gluten', file: WEEK, find: '|pasta(?! sauce\\b)|', replace: '|pasta|' },
    { name: 'pizza sauce is gluten', file: WEEK, find: '|pizza(?! sauce\\b)|', replace: '|pizza|' },
    { name: 'a vegetable noodle is gluten', file: WEEK, find: '|(?<!\\b(?:courgette|zucchini|squash|cucumber|carrot|kelp|shirataki|konjac) )noodles?|', replace: '|noodles?|' },
    { name: '"Noodle-free" is gluten', file: WEEK, find: '|cream of [\\w-]+ soups?)\\b(?!-free)/i,', replace: '|cream of [\\w-]+ soups?)\\b/i,' },
    // ── Dairy ──
    { name: 'pesto is not dairy', file: WEEK, find: '|curds?|pestos?)\\w*\\b|', replace: '|curds?)\\w*\\b|' },
    { name: 'butter lettuce and butter beans are dairy', file: WEEK, find: '|butter(?! (?:lettuce|beans?)\\b)|', replace: '|butter|' },
    { name: 'cream of tartar is dairy', file: WEEK, find: '|cream(?! of tartar\\b))\\b|', replace: '|cream)\\b|' },
    // ── Nuts ──
    { name: 'pesto is not a nut', file: WEEK, find: '|nut butters?|nuts?|pestos?)\\b(?!-free)/i,', replace: '|nut butters?|nuts?)\\b(?!-free)/i,' },
    { name: 'a chestnut is not a nut', file: WEEK, find: '|(?<!\\bwater )chestnuts?|butternuts|', replace: '|butternuts|' },
    { name: 'a water chestnut is a nut', file: WEEK, find: '|(?<!\\bwater )chestnuts?|', replace: '|chestnuts?|' },
    { name: 'the butternut is not a nut', file: WEEK, find: '|butternuts|pine nuts?|', replace: '|pine nuts?|' },
    { name: 'the butternut squash is a nut', file: WEEK, find: '|butternuts|pine nuts?|', replace: '|butternuts?|pine nuts?|' },
    { name: '"Nut-free" is nuts', file: WEEK, find: '|nut butters?|nuts?|pestos?)\\b(?!-free)/i,', replace: '|nut butters?|nuts?|pestos?)\\b/i,' },
    // ── Egg ──
    { name: 'an omelette is not egg', file: WEEK, find: '|mayonnaise|omelet(?:te)?s?|', replace: '|mayonnaise|omelets?|' },
    { name: 'an omelet is not egg', file: WEEK, find: '|mayonnaise|omelet(?:te)?s?|', replace: '|mayonnaise|omelettes?|' },
    { name: 'a frittata is not egg', file: WEEK, find: '|frittatas?|quiches?|', replace: '|quiches?|' },
    { name: 'a quiche is not egg', file: WEEK, find: '|quiches?|shakshuka)', replace: '|shakshuka)' },
    { name: 'shakshuka is not egg', file: WEEK, find: '|quiches?|shakshuka)', replace: '|quiches?)' },
    { name: '"Egg-free" is egg', file: WEEK, find: '|quiches?|shakshuka)\\b(?!-free)/i,', replace: '|quiches?|shakshuka)\\b/i,' },
    // ── Fish and soy ──
    { name: 'catfish is not fish', file: WEEK, find: '|fish|catfish|pollock|', replace: '|fish|pollock|' },
    { name: 'pollock is not fish', file: WEEK, find: '|fish|catfish|pollock|', replace: '|fish|catfish|' },
    { name: '"Fish-free" is fish', file: WEEK, find: '|halibut|mackerel|haddock|snapper)\\b(?!-free)/i,', replace: '|halibut|mackerel|haddock|snapper)\\b/i,' },
    { name: '"Soy-free" is soy', file: WEEK, find: '|miso|tamari)\\w*\\b(?!-free)/i,', replace: '|miso|tamari)\\w*/i,' },
    // ── One field at a time (Codex on 2a4ac12) ──
    { name: 'a coach\'s ingredients run together', file: WEEK, find: '.join("\\n") : "");', replace: '.join(" ") : "");' },
    { name: 'a coach\'s dish name runs into its first ingredient', file: WEEK, find: '    var text = String(food.name || "") + "\\n" +', replace: '    var text = String(food.name || "") + " " +' },
    { name: 'a catalog recipe\'s lines run together', file: WEEK, find: '(l && l.m) || ""; }).join("\\n");', replace: '(l && l.m) || ""; }).join(" ");' },
    // ── The wording ──
    { name: 'the panel no longer says it is not a certified check', file: UI, find: 'const DMB_ALLERGEN_NOTE = "read from recipe names and ingredients, not a certified allergen check";', replace: 'const DMB_ALLERGEN_NOTE = "read from each recipe’s ingredients";' },
    { name: 'the Kitchen panel no longer says dairy and gluten are the catalog\'s lists', file: UI, find: '{listed.length ? " · " + listed.join(", ") + " " + DMB_LISTED_NOTE : ""}', replace: '' },
    { name: 'Mine says its exclusions come from the catalog\'s lists', file: UI, find: '  const listed = tab === "kitchen" ? ((constraints && constraints.exclusions) || []).filter((a) => readOff.indexOf(a) < 0) : [];', replace: '  const listed = ((constraints && constraints.exclusions) || []).filter((a) => W.readFromIngredients(constraints).indexOf(a) < 0);' },
    { name: 'Mine says only the catalog\'s ingredient-read allergens', file: UI, find: 'const readOff = tab === "kitchen" ? W.readFromIngredients(constraints) : ((constraints && constraints.exclusions) || []);', replace: 'const readOff = W.readFromIngredients(constraints);' },
    { name: 'the plan\'s rules say nothing of how exclusions are read', file: UI, find: '                <p className="dmb-quiet" data-allergen-note="">Exclusions are {DMB_ALLERGEN_NOTE}; Shape Kitchen’s dairy and gluten come from its own lists.</p>\n', replace: '' },
  ],
};
