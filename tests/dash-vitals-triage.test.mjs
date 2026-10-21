// The check-in vitals rules (spec §3A): a chronic 7-day energy/hunger/hydration
// read becomes a triage flag (energy_low / hunger_high) or a client-only
// directive (hydration_low) — while a thin sample, a missing leg, or an absent
// hydration target never fires anything. Absence is never a signal.
// The member's own directive says those averages in the check-in's words; every coach
// role keeps the figure out of 10 (the last section).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
const require = createRequire(import.meta.url);
const { evaluateClient, buildDirective, getTriageFeed, vitalsWordIndex } = require('../public/newdesign/dashSignals.js');
// The card's word rule as it ships, for the parity test.
const CARD = await loadRealModule(fileURLToPath(new URL('../mobile-app/src/broadsheet/BSCheckinCard.jsx', import.meta.url)), {
  registry: new Map([['react', require('react')], ['react-dom', require('react-dom')]]),
});

const NOW = new Date('2026-08-17T12:00:00');
const rec = (vitals) => ({ profile: { name: 'Q' }, vitals });
const has = (ev, key) => ev.flags.some((x) => x.key === key);

// ── energy_low: 7-day avg ≤ 4.0 with ≥3 logged days ─────────────────────────
test('energy averaging AT the 4.0 boundary flags energy_low (≤ is inclusive)', () => {
  const ev = evaluateClient(rec({ energy: { avg7: 4.0, n: 3 } }), NOW, 'trainer');
  const f = ev.flags.find((x) => x.key === 'energy_low');
  assert.ok(f, 'energy_low flag present');
  assert.match(f.reason, /Energy has averaged 4\/10 this week/);
});

test('energy just above the boundary (4.1) does NOT flag', () => {
  assert.equal(has(evaluateClient(rec({ energy: { avg7: 4.1, n: 7 } }), NOW, 'trainer'), 'energy_low'), false);
});

test('a thin energy sample (2 logged days) never flags, however low', () => {
  assert.equal(has(evaluateClient(rec({ energy: { avg7: 2.0, n: 2 } }), NOW, 'trainer'), 'energy_low'), false);
});

// ── hunger_high: 7-day avg ≥ 8.0 with ≥3 logged days ────────────────────────
test('hunger averaging AT the 8.0 boundary flags hunger_high (≥ is inclusive)', () => {
  const ev = evaluateClient(rec({ hunger: { avg7: 8.0, n: 3 } }), NOW, 'nutritionist');
  const f = ev.flags.find((x) => x.key === 'hunger_high');
  assert.ok(f, 'hunger_high flag present');
  assert.match(f.reason, /running light on fuel/);
});

test('hunger just under the boundary (7.9) does NOT flag', () => {
  assert.equal(has(evaluateClient(rec({ hunger: { avg7: 7.9, n: 7 } }), NOW, 'nutritionist'), 'hunger_high'), false);
});

test('a thin hunger sample (2 logged days) never flags', () => {
  assert.equal(has(evaluateClient(rec({ hunger: { avg7: 9.5, n: 2 } }), NOW, 'nutritionist'), 'hunger_high'), false);
});

// ── hydration_low: CLIENT-ONLY, avg strictly under 50% of a REAL target ─────
test('hydration well under half the target flags for the CLIENT role', () => {
  const ev = evaluateClient(rec({ hydration: { avg7L: 1.2, targetL: 3, n: 4 } }), NOW, 'client');
  const f = ev.flags.find((x) => x.key === 'hydration_low');
  assert.ok(f, 'hydration_low flag present');
  assert.match(f.reason, /1\.2L of a 3L water target/);
});

test('hydration at EXACTLY 50% of target does NOT flag (strictly under)', () => {
  assert.equal(has(evaluateClient(rec({ hydration: { avg7L: 1.5, targetL: 3, n: 7 } }), NOW, 'client'), 'hydration_low'), false);
});

test('hydration with NO stored target can never flag — a fabricated default never judges', () => {
  assert.equal(has(evaluateClient(rec({ hydration: { avg7L: 0.2, targetL: null, n: 7 } }), NOW, 'client'), 'hydration_low'), false);
});

test('a thin hydration sample (3 logged days) never flags', () => {
  assert.equal(has(evaluateClient(rec({ hydration: { avg7L: 0.5, targetL: 3, n: 3 } }), NOW, 'client'), 'hydration_low'), false);
});

test('hydration_low NEVER reaches a coach role — owner ruling, client directive only', () => {
  const v = { hydration: { avg7L: 0.5, targetL: 3, n: 7 } };
  assert.equal(has(evaluateClient(rec(v), NOW, 'trainer'), 'hydration_low'), false);
  assert.equal(has(evaluateClient(rec(v), NOW, 'nutritionist'), 'hydration_low'), false);
});

// ── discipline routing: a coach is never escalated by the OTHER discipline ──
// severity is `flags.length >= 2 -> red`, computed BEFORE tagFlag/readOnlyFlags
// mark a non-owner's flag read-only. energy_low is RECOVERY (trainer-owned, and
// follows sleep_low's unconditional pattern); hunger_high is NUTRITION, so it
// must not reach a trainer's flags — it reaches them as routed context instead.
test('energy_low reaches every viewer (recovery, like sleep_low)', () => {
  const v = { energy: { avg7: 3, n: 5 } };
  assert.ok(has(evaluateClient(rec(v), NOW, 'trainer'), 'energy_low'));
  assert.ok(has(evaluateClient(rec(v), NOW, 'nutritionist'), 'energy_low'));
  assert.ok(has(evaluateClient(rec(v), NOW, 'client'), 'energy_low'));
});

test('hunger_high reaches the nutrition owner and the member — never the trainer', () => {
  const v = { hunger: { avg7: 9, n: 5 } };
  assert.ok(has(evaluateClient(rec(v), NOW, 'nutritionist'), 'hunger_high'));
  assert.ok(has(evaluateClient(rec(v), NOW, 'dietitian'), 'hunger_high'), 'dietitian owns nutrition too');
  assert.ok(has(evaluateClient(rec(v), NOW, 'client'), 'hunger_high'), 'the member keeps their own hunger lever');
  assert.equal(has(evaluateClient(rec(v), NOW, 'trainer'), 'hunger_high'), false);
});

test('low energy AND high hunger does not turn the TRAINER red on the nutritionist\'s flag', () => {
  const v = { energy: { avg7: 3, n: 5 }, hunger: { avg7: 9, n: 5 } };
  const trainer = evaluateClient(rec(v), NOW, 'trainer');
  assert.equal(trainer.severity, 'amber');
  assert.deepEqual(trainer.flags.map((f) => f.key), ['energy_low']);
  // The owning role still flags it, and still sees both.
  const nutri = evaluateClient(rec(v), NOW, 'nutritionist');
  assert.ok(has(nutri, 'hunger_high'));
});

test('the trainer still SEES hunger_high — as routed read-only context, not severity', () => {
  const v = { energy: { avg7: 3, n: 5 }, hunger: { avg7: 9, n: 5 } };
  const [rowT] = getTriageFeed('trainer', [rec(v)], NOW);
  assert.equal(rowT.severity, 'amber');
  assert.equal(rowT.flags.some((f) => f.key === 'hunger_high'), false);
  const ctx = rowT.readOnly.find((f) => f.key === 'hunger_high');
  assert.ok(ctx, 'hunger_high surfaces in readOnly for the trainer');
  assert.equal(ctx.discipline, 'nutrition');
  assert.equal(ctx.routeTo, 'nutritionist');
  // The nutritionist owns it in their own flags, and never sees it duplicated
  // in readOnly.
  const [rowN] = getTriageFeed('nutritionist', [rec(v)], NOW);
  assert.ok(rowN.flags.some((f) => f.key === 'hunger_high' && f.owned === true));
  assert.equal(rowN.readOnly.some((f) => f.key === 'hunger_high'), false);
});

// ── pre-existing flag combinations are unchanged ────────────────────────────
test('no pre-existing flag changed severity: two general flags still read red', () => {
  const r = {
    profile: { name: 'Q' },
    streaks: { current: 0, best: 9 },
    shapeScoreHistory: [{ points: 400 }, { points: 300 }],
  };
  const before = evaluateClient(r, NOW, 'trainer');
  assert.deepEqual(before.flags.map((f) => f.key).sort(), ['score_drop', 'streak_broken']);
  assert.equal(before.severity, 'red');
  // …and for the nutritionist, identically.
  assert.equal(evaluateClient(r, NOW, 'nutritionist').severity, 'red');
});

test('sleep_low keeps escalating every role (its established pattern is untouched)', () => {
  const r = { profile: { name: 'Q' }, recovery: { sleepHours: { avg7: 5.5, lastNight: 5.5, target: 7.5, n: 7 } }, streaks: { current: 0, best: 9 } };
  assert.equal(evaluateClient(r, NOW, 'trainer').severity, 'red');
  assert.equal(evaluateClient(r, NOW, 'nutritionist').severity, 'red');
});

test('the nutrition siblings still gate exactly as they did', () => {
  const r = { profile: { name: 'Q' }, nutrition: { avgCalories: 3200, targetCalories: 2000, daysLogged: 7, avgProtein: 40, targetProtein: 160 } };
  assert.equal(evaluateClient(r, NOW, 'trainer').flags.some((f) => f.key === 'ledger_blown'), false);
  assert.ok(evaluateClient(r, NOW, 'nutritionist').flags.some((f) => f.key === 'ledger_blown'));
});

// ── absence gates ───────────────────────────────────────────────────────────
test('no vitals leg at all → no vitals flags', () => {
  const ev = evaluateClient({ profile: { name: 'Q' } }, NOW, 'client');
  assert.equal(ev.flags.some((x) => ['energy_low', 'hunger_high', 'hydration_low'].includes(x.key)), false);
});

test('a malformed vitals leg (non-object entries) never flags', () => {
  const ev = evaluateClient(rec({ energy: 3, hunger: 'high', hydration: null }), NOW, 'client');
  assert.equal(ev.flags.some((x) => ['energy_low', 'hunger_high', 'hydration_low'].includes(x.key)), false);
});

// ── directive priority + lever mapping ──────────────────────────────────────
test('energy_low alone becomes the energy directive (ease_load, never shaming)', () => {
  const d = buildDirective(rec({ energy: { avg7: 3.2, n: 5 } }), NOW, 'client');
  assert.equal(d.lever, 'energy');
  assert.equal(d.action.kind, 'ease_load');
  assert.equal(d.verdict, 'Energy is running low');
  assert.match(d.reason, /a lighter session still counts/);
  assert.deepEqual(d.cited, ['energy_low']);
});

test('hydration_low alone becomes the client hydration directive (log_water)', () => {
  const d = buildDirective(rec({ hydration: { avg7L: 1, targetL: 3, n: 5 } }), NOW, 'client');
  assert.equal(d.lever, 'hydration');
  assert.equal(d.action.kind, 'log_water');
  assert.equal(d.verdict, 'Water is behind');
});

test('sleep_low (35) outranks every vitals flag (34/33/32)', () => {
  const r = rec({ energy: { avg7: 3, n: 5 }, hunger: { avg7: 9, n: 5 }, hydration: { avg7L: 1, targetL: 3, n: 5 } });
  r.recovery = { sleepHours: { avg7: 5.5, lastNight: 5.5, target: 7.5, n: 7 } };
  const d = buildDirective(r, NOW, 'client');
  assert.equal(d.lever, 'sleep');
});

test('within the vitals: energy (34) outranks hunger (33) outranks hydration (32)', () => {
  const all = rec({ energy: { avg7: 3, n: 5 }, hunger: { avg7: 9, n: 5 }, hydration: { avg7L: 1, targetL: 3, n: 5 } });
  assert.equal(buildDirective(all, NOW, 'client').lever, 'energy');
  const noEnergy = rec({ hunger: { avg7: 9, n: 5 }, hydration: { avg7L: 1, targetL: 3, n: 5 } });
  assert.equal(buildDirective(noEnergy, NOW, 'client').lever, 'hunger');
});

// ── the member's words; coaches keep /10 (Morning check-in part 2, rulings 11 and 13) ──
// The check-in asks in five words stored as 2 · 4 · 6 · 8 · 10, so the member's own directive
// says the word an average reads as, by the card's one rule. Every coach surface reads the same
// flags through a coach role and keeps the figure, byte for byte: the roster, the case file,
// coach pushes (whose signature holds the reason) and the coach's Today read.
// The word is the band of an average, so the line says "on average", never "mostly": Your mornings
// says "Most days" only for the answer that holds most of the days (part 2 review fixes, K5).
const energyWords = (w) => `Your energy has been ${w} on average this week — a lighter session still counts`;
const hungerWords = (w) => `You've been ${w} between meals on average this week — the plan may be running light on fuel`;

test("the engine turns an average into a word by the card's one rule (bsCiWordIndex)", () => {
  for (let i = 1; i <= 100; i++) {
    const v = i / 10;
    assert.equal(vitalsWordIndex(v), CARD.bsCiWordIndex(v), `${v} reads as a different word on Home and in the push`);
  }
  for (const v of [null, undefined, 0, -1, 'x', NaN, 11, 2.0001, 3.9999, 8.0001]) {
    assert.equal(vitalsWordIndex(v), CARD.bsCiWordIndex(v), `${v} reads differently`);
  }
  // The edges sit on the engine's thresholds: a flagged week is Drained or Low, Hungry or Starving.
  assert.deepEqual([2, 2.01, 4, 4.01, 8, 8.01].map(vitalsWordIndex), [0, 1, 1, 2, 3, 4]);
});

test("the member's energy_low reason says the word, never /10, and keeps its move", () => {
  for (const [avg7, w] of [[1.5, 'drained'], [2, 'drained'], [2.01, 'low'], [3.2, 'low'], [4, 'low']]) {
    const d = buildDirective(rec({ energy: { avg7, n: 5 } }), NOW, 'client');
    assert.equal(d.lever, 'energy');
    assert.equal(d.reason, energyWords(w), `avg ${avg7}`);
    assert.doesNotMatch(d.reason, /\/10|\d/, 'the member was quoted a figure');
    assert.match(d.reason, /a lighter session still counts/);
    assert.equal(d.read.oneThingNow, d.reason, 'the read quoted something else');
  }
  // No role is the member's own view: buildDirective evaluates as 'client' by default.
  assert.equal(buildDirective(rec({ energy: { avg7: 3.2, n: 5 } }), NOW).reason, energyWords('low'));
});

test("the member's hunger_high reason says the word between meals, never /10", () => {
  for (const [avg7, w] of [[8, 'hungry'], [8.01, 'starving'], [9.5, 'starving'], [10, 'starving']]) {
    const d = buildDirective(rec({ hunger: { avg7, n: 4 } }), NOW, 'client');
    assert.equal(d.lever, 'hunger');
    assert.equal(d.reason, hungerWords(w), `avg ${avg7}`);
    assert.doesNotMatch(d.reason, /\/10|\d/);
  }
});

test("the member's line says the week's average as an average, never as the most common answer", () => {
  // Drained, Drained, Drained and Great (2, 2, 2, 10) average 4: Low by the card's rule, though not
  // one answer was Low. Your mornings says "Most days this week: Drained" for the same week, so a
  // "mostly low" here contradicted the page the lead opens.
  const energy = buildDirective(rec({ energy: { avg7: (2 + 2 + 2 + 10) / 4, n: 4 } }), NOW, 'client');
  assert.equal(energy.reason, 'Your energy has been low on average this week — a lighter session still counts');
  const hunger = buildDirective(rec({ hunger: { avg7: 8.5, n: 4 } }), NOW, 'client');
  assert.equal(hunger.reason, "You've been starving between meals on average this week — the plan may be running light on fuel");
  for (const d of [energy, hunger]) assert.doesNotMatch(d.reason, /mostly/i, 'an average was said as the usual answer');
});

test('every coach role keeps the figure out of 10, byte for byte', () => {
  const energy = rec({ energy: { avg7: 3.4, n: 5 } });
  const hunger = rec({ hunger: { avg7: 8.3, n: 4 } });
  for (const role of ['trainer', 'nutritionist', 'dietitian']) {
    assert.equal(buildDirective(energy, NOW, role).reason, 'Energy has averaged 3.4/10 this week — a lighter session still counts', role);
    assert.equal(evaluateClient(energy, NOW, role).flags.find((f) => f.key === 'energy_low').reason, 'Energy has averaged 3.4/10 this week — a lighter session still counts', role);
  }
  for (const role of ['nutritionist', 'dietitian']) {
    assert.equal(buildDirective(hunger, NOW, role).reason, 'Hunger has averaged 8.3/10 this week — the plan may be running light on fuel', role);
  }
  assert.equal(evaluateClient(rec({ energy: { avg7: 4.0, n: 3 } }), NOW, 'trainer').flags[0].reason, 'Energy has averaged 4/10 this week — a lighter session still counts');
});

test("the coach triage feed keeps /10 in its reasons, its routed context and its directive", () => {
  const v = { energy: { avg7: 3, n: 5 }, hunger: { avg7: 9, n: 5 } };
  const [rowT] = getTriageFeed('trainer', [rec(v)], NOW);
  assert.equal(rowT.reasons[0], 'Energy has averaged 3/10 this week — a lighter session still counts');
  assert.equal(rowT.flags[0].reason, rowT.reasons[0]);
  assert.equal(rowT.directive.reason, rowT.reasons[0]);
  assert.equal(rowT.readOnly.find((f) => f.key === 'hunger_high').reason, 'Hunger has averaged 9/10 this week — the plan may be running light on fuel');
  const [rowN] = getTriageFeed('nutritionist', [rec({ hunger: { avg7: 9, n: 5 } })], NOW);
  assert.equal(rowN.directive.reason, 'Hunger has averaged 9/10 this week — the plan may be running light on fuel');
  assert.match(rowN.reasons[0], /9\/10/);
});

test('the vitals flags and sleep_low carry their raw average and day count', () => {
  const r = rec({ energy: { avg7: 3.25, n: 5 }, hunger: { avg7: 8.25, n: 6 } });
  r.recovery = { sleepHours: { avg7: 5.45, lastNight: 5, target: 7.5, n: 4 } };
  const flags = evaluateClient(r, NOW, 'nutritionist').flags;
  const pick = (k) => { const f = flags.find((x) => x.key === k); return { avg: f.avg, n: f.n }; };
  assert.deepEqual(pick('energy_low'), { avg: 3.25, n: 5 }, 'the average was rounded or lost');
  assert.deepEqual(pick('hunger_high'), { avg: 8.25, n: 6 });
  assert.deepEqual(pick('sleep_low'), { avg: 5.45, n: 4 });
});

test("an engine directive carries what its reason was built from; a coach's own move is never touched", () => {
  assert.deepEqual(buildDirective(rec({ energy: { avg7: 3.25, n: 5 } }), NOW, 'client').evidence, { key: 'energy_low', avg: 3.25, n: 5 });
  assert.deepEqual(buildDirective(rec({ hunger: { avg7: 8.5, n: 3 } }), NOW, 'client').evidence, { key: 'hunger_high', avg: 8.5, n: 3 });
  assert.deepEqual(buildDirective(rec({ energy: { avg7: 3, n: 5 } }), NOW, 'trainer').evidence, { key: 'energy_low', avg: 3, n: 5 }, 'a coach role carries it too');
  // sleep_low: the evidence for Home's line; the reason is in hours already and is unchanged.
  const sleep = buildDirective({ profile: { name: 'Q' }, recovery: { sleepHours: { avg7: 5.5, lastNight: 5.5, target: 7.5, n: 7 } } }, NOW, 'client');
  assert.deepEqual(sleep.evidence, { key: 'sleep_low', avg: 5.5, n: 7 });
  assert.equal(sleep.reason, 'Averaging 5.5h sleep vs a 7.5h target — recovery is running down');
  // A flag with no average says so, and the member's own view carries the figure its reason was
  // built from (a coach role's evidence stays { key, avg, n }: the member-reasons test file).
  const streak = buildDirective({ profile: { name: 'Q' }, streaks: { current: 0, best: 9 } }, NOW, 'client');
  assert.deepEqual(streak.evidence, { key: 'streak_broken', avg: null, n: null, best: 9 });
  assert.deepEqual(buildDirective({ profile: { name: 'Q' }, streaks: { current: 0, best: 9 } }, NOW, 'trainer').evidence, { key: 'streak_broken', avg: null, n: null });
  // The coach's override wins and is passed through as they wrote it (ruling 13), low week or not.
  const low = { energy: { avg7: 3, n: 5 } };
  const coach = buildDirective({ ...rec(low), coachDirective: { lever: 'energy', reason: 'Energy has been 3/10, so we deload this week' } }, NOW, 'client');
  assert.equal(coach.source, 'coach');
  assert.equal(coach.reason, 'Energy has been 3/10, so we deload this week');
  assert.equal('evidence' in coach, false, 'a coach override was given engine evidence');
});
