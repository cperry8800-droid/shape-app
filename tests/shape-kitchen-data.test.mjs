// Shape Kitchen catalog — data-integrity bar for the Kitchen Card wave.
// Enforces the spec §7 content contract mechanically: structured {n, m, k?}
// ingredients with a real quantity on every line, cookable step detail,
// macro-consistent kcal, and honest photo fields. Written RED first; the
// catalog restructure/expansion turns it green.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHAPE_KITCHEN_RECIPES,
  recipeNeeds, recipeMatchesDiet,
  _RECIPE_NOT_GF, _RECIPE_HAS_DAIRY, _RECIPE_MED,
  _KITCHEN_STEP_META,
  _RECIPE_ALLERGEN_NOTES, bsAllergenNoteText,
} from '../mobile-app/src/broadsheet/shapeKitchenData.js';
import { bsStepTimers, BS_STATIONS } from '../mobile-app/src/services/cookable.mjs';

const QTY_RE = /\d|pinch|drizzle|handful|to taste|dash|splash|zest|juice of/i;
// A "cue-rich" step joins at least two of these families — a time cue plus at
// least one of heat / vessel / doneness — so a no-cook recipe (overnight oats,
// energy bites) still passes on time + vessel/doneness without a false heat cue.
const CUE_TIME = /(min|minute|second|hour|overnight)/i;
const CUE_HEAT = /heat|warm|boil|simmer|fry|roast|bake|sear|sauté|saute|grill|toast|cook|broil|steam|blister|char|reduce|melt|poach|scald|chill|freeze|refrigerate/i;
const CUE_VESSEL = /pan|pot|skillet|bowl|tray|sheet|dish|oven|blender|processor|jar|saucepan|wok|griddle|container|board|plate|steamer|microwave|fridge/i;
const CUE_DONE = /golden|tender|crisp|browned|set|thicken|soft|translucent|fragrant|charred|bubbl|firm|opaque|cooked through|pink|springy|glossy|caramel|wilt|combine|smooth|coat/i;

test('catalog: expanded to the full 35 recipes', () => {
  assert.ok(SHAPE_KITCHEN_RECIPES.length >= 35, `have ${SHAPE_KITCHEN_RECIPES.length}`);
});

test('catalog: every recipe has the required fields', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    for (const f of ['title', 'diet', 'time', 'servings', 'kcal', 'macros', 'tags', 'hero', 'blurb', 'ingredients', 'steps', 'tip']) {
      assert.ok(r[f] != null && r[f] !== '', `${r.title || '?'} missing ${f}`);
    }
    // ATTRIBUTION: every recipe must be credited, but there are two honest ways
    // to be credited. An authored recipe carries by + byRole. A public-domain
    // federal work (USDA MyPlate Kitchen, 17 USC § 105) has no author, so it
    // carries source + sourceUrl + license instead. What is NOT allowed is
    // neither -- an uncredited recipe, or a half-filled byline the card would
    // render as "by null".
    const authored = r.by != null && r.by !== '' && r.byRole != null && r.byRole !== '';
    const sourced = ['source', 'sourceUrl', 'license'].every((f) => r[f] != null && r[f] !== '');
    assert.ok(authored || sourced,
      `${r.title}: credited as neither authored (by + byRole) nor sourced (source + sourceUrl + license)`);
    // Exactly one of the two, so a recipe can never carry a byline AND a source
    // and leave the card guessing which to print.
    assert.ok(!(authored && sourced), `${r.title}: carries BOTH a byline and a source — which should the card credit?`);
    assert.ok(Number.isFinite(r.macros.p) && Number.isFinite(r.macros.c) && Number.isFinite(r.macros.f), `${r.title} macros`);
  }
});

test('catalog: ingredients are structured {n, m} with a real quantity on every line', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    assert.ok(Array.isArray(r.ingredients) && r.ingredients.length >= 4, `${r.title} needs >=4 ingredients (has ${r.ingredients.length})`);
    for (const ing of r.ingredients) {
      assert.equal(typeof ing, 'object', `${r.title}: string ingredient "${ing}"`);
      assert.ok(ing.m && String(ing.m).trim(), `${r.title}: ingredient missing name`);
      assert.ok(ing.n && QTY_RE.test(String(ing.n)), `${r.title}: "${ing.m}" missing a real quantity ("${ing.n}")`);
      assert.ok(!/,/.test(String(ing.m)) || String(ing.m).length < 40, `${r.title}: "${ing.m}" looks like a catch-all line`);
    }
  }
});

test('catalog: steps are detailed (>=4 steps, each >=50 chars, cue-rich)', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    assert.ok(r.steps.length >= 4, `${r.title}: only ${r.steps.length} steps`);
    for (const s of r.steps) assert.ok(s.length >= 50, `${r.title}: thin step "${s.slice(0, 40)}…"`);
    const joined = r.steps.join(' ');
    assert.ok(CUE_TIME.test(joined), `${r.title}: no time cue in steps`);
    const families = [CUE_TIME, CUE_HEAT, CUE_VESSEL, CUE_DONE].filter((re) => re.test(joined)).length;
    assert.ok(families >= 2, `${r.title}: steps need >=2 cue families (time + heat/vessel/doneness), has ${families}`);
  }
});

test('catalog: kcal is macro-consistent within ±15%', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    const est = r.macros.p * 4 + r.macros.c * 4 + r.macros.f * 9;
    const drift = Math.abs(est - r.kcal) / r.kcal;
    assert.ok(drift <= 0.15, `${r.title}: kcal ${r.kcal} vs macro estimate ${est} (${Math.round(drift * 100)}%)`);
  }
});

test('catalog: photo, when present, is a real path (never the hero gradient)', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    if (r.photo != null) assert.ok(/^\/|^https?:/.test(r.photo) && !/gradient/.test(r.photo), `${r.title}: photo "${r.photo}"`);
  }
});

// Diet classification is keyed by exact recipe title (the _RECIPE_* allowlists),
// so a rename/typo silently desyncs a recipe's Gluten-free/Dairy-free/Mediterranean
// flags with no error. Guard the desync: every allowlisted title must be a real
// catalog title.
test('catalog: diet-classification allowlists reference only real recipe titles', () => {
  const titles = new Set(SHAPE_KITCHEN_RECIPES.map((r) => r.title));
  for (const [name, set] of [['not-GF', _RECIPE_NOT_GF], ['has-dairy', _RECIPE_HAS_DAIRY], ['mediterranean', _RECIPE_MED]]) {
    for (const t of set) assert.ok(titles.has(t), `${name} set references a title not in the catalog: "${t}"`);
  }
});

// ── PR D orchestration (§6): passive-window overlay ────────────────────────
test('catalog: passive-window overlay keys reference only real recipe titles', () => {
  const titles = new Set(SHAPE_KITCHEN_RECIPES.map((r) => r.title));
  for (const t of Object.keys(_KITCHEN_STEP_META)) assert.ok(titles.has(t), `overlay references a title not in the catalog: "${t}"`);
});

// ── Allergen claim notes ───────────────────────────────────────────────────
// The attach loop in shapeKitchenData.js fails SILENTLY on a title typo (`if (r)`),
// exactly like the overlay above, so the typo needs its own guard: a note that
// attaches to nothing is a note nobody ever reads, on a recipe still making the claim.
test('catalog: every allergen-note title references a real recipe', () => {
  const titles = new Set(SHAPE_KITCHEN_RECIPES.map((r) => r.title));
  for (const [t] of _RECIPE_ALLERGEN_NOTES) {
    assert.ok(titles.has(t), `allergen note references a title not in the catalog: "${t}"`);
  }
});

test('catalog: every note in the table actually landed on its recipe', () => {
  // Counts the ATTACHED notes rather than trusting the loop — the assertion above
  // proves the titles resolve, this one proves the attachment ran.
  const attached = SHAPE_KITCHEN_RECIPES.reduce((n, r) => n + (r.allergenNotes ? r.allergenNotes.length : 0), 0);
  assert.equal(attached, _RECIPE_ALLERGEN_NOTES.length,
    'attached note count does not match the table — a title resolved but the note did not attach');
});

test('catalog: allergen notes are well-formed (allergen, non-empty certification, structured brands)', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    for (const n of r.allergenNotes || []) {
      assert.ok(['gluten', 'dairy'].includes(n.allergen), `${r.title}: unknown allergen "${n.allergen}"`);
      // The note is bound to the ambiguous CLASS it excuses, so the gate can refuse
      // to let a broth note wave through oats. A missing class makes the note inert
      // in the audit; the vocabulary itself is checked in the allergen gate.
      assert.equal(typeof n.ingredient, 'string', `${r.title}: note is missing its ingredient class`);
      assert.ok(n.ingredient.trim().length > 0, `${r.title}: note ingredient class is empty`);
      assert.equal(typeof n.certification, 'string');
      assert.ok(n.certification.trim().length > 20, `${r.title}: certification text is not a real sentence`);
      // The certification must not END the sentence itself — the composer adds the
      // terminator, so a trailing period here would produce ".." or ". — e.g.".
      assert.ok(!/[.]$/.test(n.certification.trim()), `${r.title}: certification must not carry its own full stop`);
      assert.ok(Array.isArray(n.brands), `${r.title}: brands must be an array (empty is valid)`);
      for (const b of n.brands) {
        assert.ok(Array.isArray(b) && b.length === 2, `${r.title}: a brand must be [name, region]`);
        assert.equal(typeof b[0], 'string');
        assert.equal(typeof b[1], 'string');
        assert.ok(b[0].trim() && b[1].trim(), `${r.title}: brand name and region must both be real`);
      }
    }
  }
});

test('bsAllergenNoteText: certification LEADS, brands are appended only when present', () => {
  const cert = 'Look for a certified gluten-free label';
  assert.equal(bsAllergenNoteText({ certification: cert, brands: [] }), `${cert}.`);
  assert.equal(bsAllergenNoteText({ certification: cert }), `${cert}.`);
  assert.equal(
    bsAllergenNoteText({ certification: cert, brands: [['Acme GF', 'US'], ['Beta GF', 'UK']] }),
    `${cert} — e.g. Acme GF (US), Beta GF (UK).`);
  // Emptying the brand list for a market must lose the examples and NOTHING else —
  // the safety-bearing half is the certification sentence.
  for (const r of SHAPE_KITCHEN_RECIPES) {
    for (const n of r.allergenNotes || []) {
      assert.ok(bsAllergenNoteText({ ...n, brands: [] }).startsWith(n.certification),
        `${r.title}: certification does not lead the composed note`);
    }
  }
});

test('catalog: stepMeta is aligned, valid, station-scoped, and HONEST (min stated in the step)', () => {
  const MIN_PASSIVE = 4;
  for (const r of SHAPE_KITCHEN_RECIPES) {
    if (!r.stepMeta) continue;
    assert.equal(r.stepMeta.length, r.steps.length, `${r.title}: stepMeta not index-aligned with steps`);
    r.stepMeta.forEach((m, i) => {
      if (m == null) return;
      assert.ok(BS_STATIONS.includes(m.station), `${r.title} step ${i}: bad station "${m.station}"`);
      assert.equal(m.passive, true, `${r.title} step ${i}: overlay entries must be passive windows`);
      assert.ok(Number.isFinite(m.min) && m.min >= MIN_PASSIVE, `${r.title} step ${i}: min ${m.min} below the ${MIN_PASSIVE}-min floor`);
      assert.ok(m.min <= 6 * 60, `${r.title} step ${i}: min ${m.min} exceeds 6h`);
      // No fabrication: the authored `min` must equal a real duration the step text itself states.
      // ⚠ `bsStepTimers` reduces a RANGE to one figure — "simmer 4 to 5 minutes" comes back as
      // 5 — so a window correctly set to the low end read as fabricated. Both ends of a stated
      // range are stated, and the sibling gate below requires the low one; without this the two
      // rules contradict each other and the honest value is the one that fails.
      const RANGE_ENDS = /(\d+)\s*(?:to|\u2013|-)\s*(\d+)\s*(minutes?|mins?|hours?|hrs?)/gi;
      const stated = bsStepTimers(r.steps[i]).map((x) => Math.round(x.seconds / 60));
      for (const hit of String(r.steps[i]).matchAll(RANGE_ENDS)) {
        const scale = /hour|hr/i.test(hit[3]) ? 60 : 1;
        stated.push(Number(hit[1]) * scale, Number(hit[2]) * scale);
      }
      assert.ok(stated.includes(m.min), `${r.title} step ${i}: min ${m.min} not stated in the step — "${r.steps[i].slice(0, 48)}…" states ${JSON.stringify(stated)}`);
    });
  }
});

test('catalog: the interleave demo is real — oven, stove AND off windows all exist', () => {
  const stations = new Set();
  for (const r of SHAPE_KITCHEN_RECIPES) for (const m of r.stepMeta || []) if (m) stations.add(m.station);
  for (const s of ['oven', 'stove', 'off']) assert.ok(stations.has(s), `no ${s} interleave window in the catalog`);
});

// An annotation means "the recipe's NEXT step waits for this hold" — the board's
// wait gate blocks same-recipe continuation while the window runs. A window whose
// next step is authored CONCURRENT with it ("While it roasts…"/"Meanwhile…") would
// lock the cook out of work the author scheduled inside the window (Codex, PR D
// round 5 — 8 recipes shipped this before the guard).
test('catalog: no annotated window is followed by a concurrent-authored same-recipe step', () => {
  const CONCURRENT = /^(while (it|they|the|that)|meanwhile|as (it|they|the))\b/i;
  for (const r of SHAPE_KITCHEN_RECIPES) {
    (r.stepMeta || []).forEach((m, i) => {
      if (!m || m.passive !== true) return;
      const nxt = r.steps[i + 1];
      assert.ok(!(nxt && CONCURRENT.test(nxt.trim())),
        `${r.title} step ${i}: annotated window, but step ${i + 1} is authored concurrent with it — "${String(nxt).slice(0, 60)}…" (drop the annotation or restructure the steps)`);
    });
  }
});

// ⚠ A WINDOW MEANS THE COOK CAN WALK AWAY. The board proves how much this matters:
// while a hold runs, the HOLDING lane renders only the recipe TITLE, the station and a
// countdown — the step TEXT is never shown. So annotating a step that asks the cook to
// come back mid-window ("simmer 2 hours, TURNING the roast once at the halfway mark")
// hides the instruction until the timer rings: the roast is never turned, the foam is
// never skimmed, the croutons burn. `cookOrchestrator.mjs`'s own header states the rule
// — "never a merely-parsed duration (a 'simmer 20 min, stirring' is not hands-off)" —
// and it shipped violated 9 times (3 of them live on main since the Cook Mode wave).
//
// The distinction is grammatical and precise. A GERUND clause modifies the timed action
// and therefore runs DURING it ("stirring occasionally", "flipping once", "skimming the
// foam"). The same verb as an IMPERATIVE is setup that completes BEFORE the wait ("Stir
// in the flour, then simmer 5 minutes"; "Press the tofu … rest 10 minutes"), and a state
// verb describes the food, not the cook ("until it turns soft"). Measured over the
// catalog: the gerund rule flags 9 real violations and 0 of the 24 false positives a
// bare verb match produces.
test('catalog: an ATTENDED step is never annotated as a hands-off window', () => {
  // ⚠ A LIST, KNOWINGLY. Round 3 beat the previous list with `spooning` ("roast about an
  // hour, spooning the pan juices back over the chicken"), so the obvious move was to
  // match the SHAPE instead — a comma plus a participle. That was tried and measured,
  // and it is worse: `\w+ing` is morphology, not grammar, so it fires on "bring to a
  // simmer" and on "string beans". Seven false positives against one real catch.
  // Telling a gerund from a noun needs a parser this suite does not have, so the list
  // stays — precise, and honestly incomplete. It is a tripwire for known shapes, NOT a
  // proof the catalog is clean; only reading a step can establish that.
  const ATTEND_GERUND = /\b(stirring|turning|flipping|skimming|tossing|basting|spooning|ladling|whisking|shaking|scraping|checking|rotating|nudging|pressing)\b/i;
  // "without stirring" / "without lifting the lid" is the same shape NEGATED, and means the
  // opposite: leave it alone. Matched as a shape too, for the same reason.
  // "without stirring" is an instruction to leave it alone. ⚠ "without stirring TOO OFTEN"
  // is not — it asks for occasional stirring, and this guard exempted it because it read
  // only the opening words. A negation counts only when nothing walks it back.
  const NEGATED = /\bwithout\s+(?:\w+\s+){0,2}\w+ing\b(?!\s+(?:too\s+\w+|much|often|constantly|every|more\s+than))/i;

  // ⚠ Collect, then assert ONCE. An assert inside the loop reports the FIRST violation
  // and hides the count — which is exactly how a review round named 2 of these 9.
  const bad = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    (r.stepMeta || []).forEach((m, i) => {
      if (!m || m.passive !== true) return;
      const text = r.steps[i] || '';
      if (NEGATED.test(text)) return;
      const hit = text.match(ATTEND_GERUND);
      if (hit) bad.push(`${r.title} step ${i} (${m.min}m/${m.station}) — "${hit[0]}": ${text.slice(0, 70)}…`);
    });
  }
  assert.deepEqual(bad, [],
    `${bad.length} annotated window(s) ask the cook to attend mid-hold; the board hides the step text, so drop the annotation:\n  ${bad.join('\n  ')}`);
});

// Spot-check the diet helpers so a logic regression (not just a desync) is caught.
test('catalog: recipeNeeds / recipeMatchesDiet behave for known recipes', () => {
  const byTitle = (t) => SHAPE_KITCHEN_RECIPES.find((r) => r.title === t);
  // A dairy recipe must not read as Dairy-free; a plainly non-dairy one must.
  const dairy = byTitle('Greek yogurt power bowl');
  assert.ok(dairy && !recipeNeeds(dairy).includes('Dairy-free'), 'Greek yogurt bowl should not be Dairy-free');
  // Pescatarian excludes meat/poultry; a seafood recipe passes, a poultry one does not.
  const seafood = SHAPE_KITCHEN_RECIPES.find((r) => r.diet === 'Seafood');
  const poultry = SHAPE_KITCHEN_RECIPES.find((r) => r.diet === 'Poultry');
  if (seafood) assert.ok(recipeMatchesDiet(seafood, 'Pescatarian'), `${seafood.title} should match Pescatarian`);
  if (poultry) assert.ok(!recipeMatchesDiet(poultry, 'Pescatarian'), `${poultry.title} should not match Pescatarian`);
  // Mediterranean is allowlist-driven.
  const med = SHAPE_KITCHEN_RECIPES.find((r) => _RECIPE_MED.has(r.title));
  if (med) assert.ok(recipeMatchesDiet(med, 'Mediterranean'), `${med.title} should match Mediterranean`);
});

// Only a TERMINAL window (the recipe's last step) can still be running at the
// board's final event — every non-terminal window's continuation is wait-gated.
// The wrap screen therefore treats leftover holds as unattended make-aheads,
// which is only true when a terminal window is station 'off' (fridge/counter).
// A terminal OVEN/STOVE window would lose a live-fire countdown at Finish
// (round-7 ruling made structural).
test("catalog: a terminal annotated window must be station 'off'", () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    (r.stepMeta || []).forEach((m, i) => {
      if (!m || m.passive !== true || i !== r.steps.length - 1) return;
      assert.equal(m.station, 'off',
        `${r.title}: terminal window (step ${i}) is '${m.station}' — a live-fire hold would outlive the board`);
    });
  }
});

// ---------------------------------------------------------------------------------
// Review round 2 broke the same PREMISE three more ways. The rule is one sentence —
// an annotated window means the cook can put the dish down and leave the kitchen —
// and each gate below is a different grammar in which the catalog said that untruthfully.
// ---------------------------------------------------------------------------------

// (1) THE SAME RULE, A DIFFERENT GRAMMAR. The gerund gate above reads an attendance
// CLAUSE ("stirring occasionally"). It is blind to an attended cooking METHOD that IS
// the timed action: "sauté 5 to 8 minutes" carries no gerund, yet a board that sends the
// cook off to another dish leaves mushrooms and peppers on a hot pan for eight minutes.
// The tell is that the method verb is followed by its own duration in the same clause —
// the verb GOVERNS the interval. "so they sauté instead of flooding the pan" is a purpose
// clause carrying no duration, and requiring the duration is what keeps that one out.
test('catalog: an attended cooking METHOD never governs an annotated window', () => {
  // ⚠ The trailing (?![a-z]) rather than \b is load-bearing. `\b` after an accented vowel
  // can never match, so the first draft of this pattern — /\bsaut[eé]\b/ — found NOTHING
  // and read as a clean sweep while covering nothing at all. The two asserts below exist
  // because a silent zero from this gate is indistinguishable from a passing catalog.
  const METHOD = /(?:^|[^a-z])(saut[eé]|stir-fry|sear|pan-fry|griddle|scramble|deep-fry|soften|sweat)(?![a-z])/i;
  // `soften` and `sweat` joined after round 3: "soften them in olive oil over medium heat
  // for 8 minutes" is a soffritto, and needs moving or it catches. Note the gate only
  // fires when a DURATION sits in the same clause, which is what keeps the doneness use
  // — "cook about 5 minutes until they soften and give up their liquid" — out of it.
  const DUR = /\d+\s*(?:to\s*\d+\s*)?(?:minutes?|mins?|hours?|hrs?)/i;
  assert.ok(METHOD.test('and sauté 5 to 8 minutes'), 'METHOD must match the accented spelling');
  assert.ok(!METHOD.test('research the topic'), 'METHOD must not match inside a word');

  const bad = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    (r.stepMeta || []).forEach((m, i) => {
      if (!m || m.passive !== true) return;
      const text = r.steps[i] || '';
      const hit = METHOD.exec(text);
      if (!hit) return;
      // Only the clause the verb sits in can carry the duration that verb governs.
      const clause = text.slice(hit.index).split(/[.,;]/)[0];
      if (DUR.test(clause)) bad.push(`${r.title} step ${i} (${m.min}m/${m.station}) — "${hit[1]}": ${clause.trim().slice(0, 60)}…`);
    });
  }
  assert.deepEqual(bad, [],
    `${bad.length} annotated window(s) are an attended cooking method — nobody walks away from a hot pan`);
});

// (2) THE RECIPE HAS ALREADY SPENT THAT TIME. When a step says "marinate 10 minutes while
// the oven heats" or "rest 5 minutes while you make the dressing", the author has already
// assigned those minutes to the cook's own next job. Annotating it hands the same minutes
// to a DIFFERENT dish — and since a hold also blocks its own recipe (`freeAt`), the work
// the recipe scheduled there is pushed out behind it. A step that OPENS with "While" or
// "Meanwhile" is itself the detour and likewise cannot host one; four recipes correctly
// carry no annotation for exactly that reason, and a fifth had been annotated anyway.
// "the vegetables weep a little liquid that seasons the meat while it sits" describes the
// food rather than giving the cook a job, and is correctly ignored.
test('catalog: a window never sits on time the recipe already gave the cook', () => {
  const COOK_BUSY = /\bwhile\s+(?:you\b|the\s+(?:oven|grill|pan|griddle|broiler|water)\s+(?:heats|preheats|comes\b))/i;
  const OPENS_CONCURRENT = /^\s*(?:while|meanwhile)\b/i;
  assert.ok(COOK_BUSY.test('marinate 10 minutes while the oven heats'), 'must catch an appliance warming');
  assert.ok(!COOK_BUSY.test('liquid that seasons the meat while it sits'), 'must not catch a description of the food');

  const bad = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    (r.stepMeta || []).forEach((m, i) => {
      if (!m || m.passive !== true) return;
      const text = r.steps[i] || '';
      if (COOK_BUSY.test(text)) bad.push(`${r.title} step ${i} — the recipe gave those ${m.min}m to the cook: ${text.slice(0, 60)}…`);
      else if (OPENS_CONCURRENT.test(text)) bad.push(`${r.title} step ${i} — opens as the detour, so it cannot host one: ${text.slice(0, 60)}…`);
    });
  }
  assert.deepEqual(bad, [], `${bad.length} window(s) claim time the recipe had already scheduled`);
});

// (3) NOTHING SURVIVES THE COUNTDOWN. The HOLDING lane is a title, a station and a clock.
// An instruction sitting AFTER the duration inside the same step is therefore never shown
// again — the cursor has already moved on by the time the timer rings. "Freeze the beef 30
// minutes, THEN SLICE IT into strips" left the following step seasoning "the strips" the
// cook had never been told to cut. Two steps were split so the hidden half became a step
// of its own; the rest were dropped, because where the action has to happen the instant
// the timer rings (chill the eggs, drain the potatoes) it was never a walk-away window.
// The exemptions are STRUCTURAL rather than a list: a terminal step has no later step to
// mislead, and a trailing clause that is itself a wait ("set it aside to steam off") asks
// nothing of the cook. A named exemption list would have gone stale on the next batch.
test('catalog: an annotated window never hides an instruction behind its timer', () => {
  const DUR = /\d+\s*(?:to\s*\d+\s*)?(?:minutes?|mins?|hours?|hrs?)/i;
  // ⚠ This exemption started as a verb LIST (rest|stand|cool|chill|set|leave|keep) and it
  // swallowed the case that motivated the gate: "then chill in cold water and peel" is an
  // urgent action, not a wait, and `chill` in the list exempted it. Mutation-testing is the
  // only reason that was caught — restoring the offending annotation left the gate GREEN.
  // It is now the single SHAPE it actually has to cover: leaving something where it stands.
  const STILL_A_WAIT = /^set\s+(?:it|them|the\s+\w+)\s+aside\b/i;
  assert.ok(STILL_A_WAIT.test('set it aside to steam off in its bowl'), 'must exempt leaving it be');
  assert.ok(!STILL_A_WAIT.test('chill in cold water and peel'), 'must NOT exempt an urgent action');
  const bad = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    (r.stepMeta || []).forEach((m, i) => {
      if (!m || m.passive !== true) return;
      // ⚠ THE TERMINAL EXEMPTION WAS WRONG. It reasoned that a last step has no later step
      // to mislead. But starting a terminal hold marks the recipe prepped and sends the cook
      // to another dish or the wrap — and the wrap renders `◷ {title} · {countdown}`, with
      // `wrapHolds` carrying only {title, leftS}. The step text is not merely unshown there,
      // it is not even carried. A terminal hold hides its instruction exactly like the rest.
      const text = r.steps[i] || '';
      const d = text.search(DUR);
      if (d < 0) return;
      const tail = text.slice(d);
      // ⚠ THIS LOOKED FOR THE WORD `then` AND ROUND 3 CAME BACK WITH `;` AND `and`: the
      // quinoa reads "simmer 15 minutes ...; rest 5 minutes off the heat", the rice
      // "simmer covered on low 15 minutes and rest 5 off the heat" — the same hidden
      // hand-off, punctuated differently.
      //
      // Widening the separator alone was measured and is far too broad: "and" also joins
      // DONENESS clauses ("until the salmon flakes and the edges char"), which flagged 40
      // steps that ask the cook for nothing. So the separator is widened AND the following
      // clause must open with something the cook DOES. A doneness cue opens with the food
      // ("the beans blister"); an instruction opens with a verb.
      const HANDOFF = '(?:rest|drain|rinse|remove|take|pull|lift|chill|cool|transfer|tip|uncover|fluff|fork|slice|cut|spoon|scoop|stir|toss|season|serve)';
      // ⚠ The conjunction is OPTIONAL after real punctuation. The quinoa reads
      // "...the liquid is gone; rest 5 minutes off the heat" — a semicolon and no
      // conjunction whatever, which slipped through a `(?:then|and)` requirement.
      // Mutation-testing caught that; reading the pattern back had not.
      const th = tail.search(new RegExp('(?:[;.]\\s*(?:then\\s+|and\\s+)?|[,]?\\s*(?:then|and)\\s+)(?=' + HANDOFF + '\\b)', 'i'));
      if (th < 0) return;
      const after = tail.slice(th).replace(/^[;,.]?\s*(?:then\s+|and\s+)?/i, '');
      if (STILL_A_WAIT.test(after)) return;
      bad.push(`${r.title} step ${i} (${m.min}m/${m.station}) — hidden behind the clock: "${after.slice(0, 60)}…"`);
    });
  }
  assert.deepEqual(bad, [],
    `${bad.length} window(s) hide an instruction the board never shows — split the step, or drop the window`);
});

// (4) THE ARITHMETIC BACKSTOP, and the only one of the four that needs no reading of the
// prose. A hold blocks its own recipe, so a recipe's hold minutes are minutes it cannot
// spend on itself. When they exceed the recipe's OWN stated total, the recipe is saying
// those minutes overlap with its other work — a BACKGROUND hold, which this model cannot
// express. Picadillo annotated its 45-minute rice that way: a recipe that calls itself 50
// minutes read 79 on the board, and a two-dish session stopped interleaving altogether.
// Three recipes trip the sum honestly, because their stated time is hands-on time and
// deliberately excludes a long chill. They are named with the reason rather than waved
// through, so that a fourth cannot join them silently.
test('catalog: hold minutes never outrun the recipe\'s own stated time', () => {
  const MAKE_AHEAD = {
    'Overnight oats, three ways': 'the 4-hour chill IS the dish and was never part of "5 min"',
    'Date and almond energy bites': 'a terminal 30-minute set in the fridge, excluded from hands-on time',
    'Black skillet beef with kale and red potatoes': 'a 30-minute partial freeze before any cooking begins',
  };
  const stated = (t) => {
    const h = /(\d+)\s*hr/.exec(String(t || ''));
    const mm = /(\d+)\s*min/.exec(String(t || ''));
    return (h ? Number(h[1]) * 60 : 0) + (mm ? Number(mm[1]) : 0);
  };
  // The first draft read only the leading integer, so "1 hr 15 min" measured as 1 and
  // half the catalog looked like a violation. A parser this gate depends on gets probed.
  assert.equal(stated('1 hr 15 min'), 75, 'the time parser must read hours, or this gate measures nothing');
  assert.equal(stated('45 min'), 45);

  const bad = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    const st = stated(r.time);
    if (!st) continue;
    const held = (r.stepMeta || []).reduce((n, m) => n + (m && m.passive === true && m.min > 0 ? m.min : 0), 0);
    if (held > st && !MAKE_AHEAD[r.title]) bad.push(`${r.title}: ${held}m of holds inside a stated ${st}m — the recipe says they overlap`);
  }
  assert.deepEqual(bad, [], `${bad.length} recipe(s) hold for longer than they claim to take`);
});

// (5) A RANGE IS A PROMISE ABOUT ITS LOW END. "Simmer uncovered 2 to 5 minutes", with the
// next step saying "pull the spears while they still snap", is not a five-minute window —
// the cook is needed at TWO minutes and the annotation pins the maximum. Anything under
// BS_ORCH.minPassive cannot host an interleave at all, so a range straddling that floor has
// no honest window inside it and the board would return the cook to overcooked food.
// Structural, not lexical: it reads the numbers the step itself states.
test('catalog: a ranged window is its LOW end, never its top', () => {
  const RANGE = /(\d+)\s*(?:to|–|-)\s*(\d+)\s*(minutes?|mins?|hours?|hrs?)/i;
  const FLOOR = 4;   // BS_ORCH.minPassive — below this the orchestrator hosts nothing
  assert.deepEqual(RANGE.exec('simmer uncovered 2 to 5 minutes').slice(1, 3), ['2', '5'],
    'the range parser must read both ends, or this gate measures nothing');

  const bad = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    (r.stepMeta || []).forEach((m, i) => {
      if (!m || m.passive !== true) return;
      const hit = RANGE.exec(r.steps[i] || '');
      if (!hit) return;
      const lo = Number(hit[1]) * (/hour|hr/i.test(hit[3]) ? 60 : 1);
      // ⚠ The first version of this gate only rejected a range reaching BELOW the floor. That
      // was half the rule: "simmer 6 to 8 minutes" annotated as 8 keeps the countdown running
      // for two minutes after the chops are ready. The window is the low end in every case —
      // the top of a range is where the board returns the cook to something overcooked. The
      // review named one; the catalog had eight.
      if (lo < FLOOR) bad.push(`${r.title} step ${i} (${m.min}m) — the cook may be needed at ${lo}m, below the ${FLOOR}m floor`);
      else if (m.min !== lo) bad.push(`${r.title} step ${i} — window is ${m.min}m but the step states ${lo} to ${hit[2]}; a window is its LOW end`);
    });
  }
  assert.deepEqual(bad, [], `${bad.length} ranged window(s) do not match the low end the step states`);
});
// (6) AN INGREDIENT NOBODY IS TOLD TO USE. "1/4 cup chopped pecans" sat in a list while no
// step ever mentioned pecans: a purchased item wasted, and a dish that no longer matches the
// nutrition published beside it. Structural — does any step name it?
//
// ⚠ The first version of this sweep reduced "2 tbsp olive oil" to the head noun "olive" and
// dropped words of three letters, so it reported 38 unused ingredients while steps plainly
// said "heat the oil". Match on ANY content word of the whole measure, keep short nouns like
// oil and cod, and drop only PREPARATION words — because if "chopped" counts as a match then
// "chopped pecans" is satisfied by any other chopped thing in the recipe.
test('catalog: every ingredient is named by some step', () => {
  const PREP = new Set(['chopped', 'minced', 'diced', 'sliced', 'grated', 'shredded', 'ground', 'fresh',
    'frozen', 'dried', 'canned', 'cooked', 'raw', 'packed', 'thawed', 'drained', 'rinsed', 'divided',
    'low', 'sodium', 'reduced', 'fat', 'free', 'whole', 'large', 'small', 'medium', 'ripe', 'unsalted',
    'salted', 'boneless', 'skinless', 'lean', 'extra', 'virgin', 'plain', 'thin', 'thinly', 'trimmed',
    'peeled', 'halved', 'quartered', 'cubed', 'crushed', 'toasted', 'optional', 'washed', 'and', 'the',
    'for', 'with', 'into', 'about', 'your', 'any', 'plus', 'more', 'taste', 'needed', 'pieces', 'wedges']);
  // A step may name the CATEGORY rather than the variety — "cook the pasta", not "cook the
  // fusilli". These are the categories the catalog actually writes, and each is a word a cook
  // reads as the same thing; without them the gate flags five recipes that are perfectly clear.
  const CATEGORY = [
    [/penne|fusilli|macaroni|spaghetti|rigatoni|linguine|fettuccine|orzo/, /pasta|noodle/],
    [/farro|quinoa|barley|bulgur|freekeh/, /grain/],
    [/honey|maple|agave/, /sweeten/],
    [/wholegrain|sourdough|rye|ciabatta/, /bread|toast|slice/],
    [/cheddar|mozzarella|parmesan|gruy|halloumi|feta/, /cheese/],
  ];
  const stem = (w) => w.replace(/(ies|es|s)$/i, '');
  const words = (m) => String(m || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !PREP.has(w));
  assert.deepEqual(words('olive oil'), ['olive', 'oil'], 'short nouns must survive, or the sweep is meaningless');
  assert.deepEqual(words('chopped pecans'), ['pecans'], 'preparation words must not count as a match');

  const bad = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    const method = (r.steps || []).join(' ').toLowerCase();
    for (const g of r.ingredients || []) {
      const ws = words(g.m);
      if (!ws.length) continue;
      if (ws.some((w) => method.includes(stem(w)))) continue;
      if (CATEGORY.some(([variety, category]) => variety.test(g.m) && category.test(method))) continue;
      bad.push(`${r.title}: "${g.n} ${g.m}" — no step ever tells the cook to use it`);
    }
  }
  assert.deepEqual(bad, [], `${bad.length} ingredient(s) are bought and never used`);
});
