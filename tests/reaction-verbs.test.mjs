// The feed reaction verb system: an activity-mapped, display-only verb over ONE
// unified count. Confirms every bucket maps to its verb, PR wins over the base
// type, and anything unknown falls back to "Props" (never blank, never a
// strength-only word on a non-strength post). Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BS_REACTION_VERBS,
  BS_REACTION_EXPRESSIONS,
  bsActivityBucket,
  bsReactionType,
  bsReactionVerb,
  bsReactionPalette,
} from "../mobile-app/src/services/reactionVerbs.mjs";

test("verb table — every bucket maps to the spec'd verb", () => {
  assert.equal(BS_REACTION_VERBS.strength, "Spot");
  assert.equal(BS_REACTION_VERBS.pr, "Beast");
  assert.equal(BS_REACTION_VERBS.run, "Respect");
  assert.equal(BS_REACTION_VERBS.swim, "Gliding");
  assert.equal(BS_REACTION_VERBS.cycle, "Watts");
  assert.equal(BS_REACTION_VERBS.recovery, "Smart");
  assert.equal(BS_REACTION_VERBS.nutrition, "Locked in");
  assert.equal(BS_REACTION_VERBS.sleep, "Recharged");
  assert.equal(BS_REACTION_VERBS.mobility, "Centered");
  assert.equal(BS_REACTION_VERBS.sport, "Props");
});

test("bucket normalization — composer woTypes", () => {
  assert.equal(bsActivityBucket("Strength"), "strength");
  assert.equal(bsActivityBucket("Run"), "run");
  assert.equal(bsActivityBucket("Ride"), "cycle");
  assert.equal(bsActivityBucket("Conditioning"), "run"); // endurance
  assert.equal(bsActivityBucket("Mobility"), "mobility");
});

test("bucket normalization — sensor / free-text activity names", () => {
  assert.equal(bsActivityBucket("trail run"), "run");
  assert.equal(bsActivityBucket("Open Water Swim"), "swim");
  assert.equal(bsActivityBucket("Peloton ride"), "cycle");
  assert.equal(bsActivityBucket("cycling"), "cycle");
  assert.equal(bsActivityBucket("Vinyasa yoga"), "mobility");
  assert.equal(bsActivityBucket("Rest day"), "recovery");
  assert.equal(bsActivityBucket("active recovery"), "recovery");
  assert.equal(bsActivityBucket("Meal logged"), "nutrition");
  assert.equal(bsActivityBucket("Sleep"), "sleep");
  assert.equal(bsActivityBucket("Deadlift"), "strength");
  assert.equal(bsActivityBucket("Lower strength · Block 3"), "strength");
});

test("unknown / empty / sport → sport bucket (Props)", () => {
  assert.equal(bsActivityBucket(""), "sport");
  assert.equal(bsActivityBucket(null), "sport");
  assert.equal(bsActivityBucket("pickup basketball"), "sport");
  assert.equal(bsActivityBucket("something we don't model"), "sport");
  assert.equal(bsReactionVerb(bsActivityBucket("pickup basketball")), "Props");
});

test("PR/milestone wins over the base type", () => {
  // a strength PR reads "Beast", not "Spot"
  assert.equal(bsReactionType("Strength", { isPR: true }), "pr");
  assert.equal(bsReactionVerb(bsReactionType("Strength", { isPR: true })), "Beast");
  // a run that's a new best is still a PR
  assert.equal(bsReactionType("Run", { isPR: true }), "pr");
  // no delta → the base type stands
  assert.equal(bsReactionType("Strength", { isPR: false }), "strength");
  assert.equal(bsReactionType("Run"), "run");
});

test("end-to-end: each preview card type shows the right verb", () => {
  const verbFor = (raw, isPR = false) => bsReactionVerb(bsReactionType(raw, { isPR }));
  assert.equal(verbFor("Strength", true), "Beast");   // strength PR
  assert.equal(verbFor("Run"), "Respect");            // run
  assert.equal(verbFor("Open Water Swim"), "Gliding"); // swim
  assert.equal(verbFor("Rest day"), "Smart");          // rest
  assert.equal(verbFor("Ride"), "Watts");              // cycle
  assert.equal(verbFor("Sleep"), "Recharged");         // sleep
  assert.equal(verbFor("Yoga"), "Centered");           // mobility
  assert.equal(verbFor("Meal"), "Locked in");          // nutrition
  assert.equal(verbFor("kayaking"), "Props");          // fallback
});

test("bsReactionVerb falls back to Props for an unknown bucket key", () => {
  assert.equal(bsReactionVerb("totally-unknown"), "Props");
  assert.equal(bsReactionVerb(undefined), "Props");
});

test("phase 2 — expressive palette: the contextual verb leads, then the universals", () => {
  assert.deepEqual(BS_REACTION_EXPRESSIONS, ["Fire", "Props", "Crushing it", "Don't stop"]);
  // a run leads with "Respect", then the universals
  assert.deepEqual(bsReactionPalette("Respect"), ["Respect", "Fire", "Props", "Crushing it", "Don't stop"]);
  // a PR leads with "Beast"
  assert.deepEqual(bsReactionPalette("Beast"), ["Beast", "Fire", "Props", "Crushing it", "Don't stop"]);
});

test("phase 2 — the default/fallback verb (Props) is never duplicated in the palette", () => {
  // a sport/unknown card's default IS "Props" — it leads once, not twice
  const p = bsReactionPalette(bsReactionVerb("sport")); // Props
  assert.deepEqual(p, ["Props", "Fire", "Crushing it", "Don't stop"]);
  assert.equal(p.filter((w) => w === "Props").length, 1);
});

test("phase 2 — every palette pick is still text (no emoji)", () => {
  for (const w of bsReactionPalette("Beast")) {
    assert.match(w, /^[A-Za-z' ]+$/); // letters, apostrophe, space only
  }
});

test("work milestones read Onward (spec 2026-07-13) — exact token, never name-guessed", () => {
  assert.equal(bsActivityBucket("milestone"), "career");
  assert.equal(bsReactionVerb("career"), "Onward");
  // The token is exact — a workout NAMED "milestone madness" is not a career post…
  assert.equal(bsActivityBucket("milestone madness"), "sport");
  // …and a training PR (isPR) still reads Beast, never Onward.
  assert.equal(bsReactionType("strength", { isPR: true }), "pr");
});
