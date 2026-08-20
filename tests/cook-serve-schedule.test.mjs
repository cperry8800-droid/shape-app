// Serve mode's promise is a CLOCK: "everything on the table at 19:30". The plan that
// makes that true assigns every step a start minute (`at`), and a dish is deliberately
// held back so it lands with the rest rather than an hour early and cold.
//
// WHY THIS FILE EXISTS. The board computed that plan, displayed it, and then ignored
// it: `BSPrepCook` rendered `timeline[0]` and advanced purely on cursor and timer
// state, never reading `at`. A cook could run every delayed step immediately, so the
// table time they chose was decoration. Nothing but a MOUNT catches that — the schedule
// was correct in the engine and unenforced in the UI, which is exactly the shape of
// defect a pure engine test cannot see.
//
// Harness is the shared one in tests/helpers/broadsheet-mount.mjs: compile the shipping
// file in memory, resolve its imports to the real modules, drive the component with a
// hook shim. Nothing is stubbed or written to disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, SRC, SHIM, drive, pressable, textOf, flatten as flattenNode, loadBroadsheet, importSibling, jsxOpenTag,
} from './helpers/broadsheet-mount.mjs';

const MOD = await loadBroadsheet(['BSPrepCook', 'BSCookMode', 'BSPrepSession']);
const ORCH = await importSibling('..', 'services', 'cookOrchestrator.mjs');
const { bsOrchestrate, BS_COOK_MODE, BS_ORCH } = ORCH;
const { SHAPE_KITCHEN_RECIPES } = await importSibling('shapeKitchenData.js');
const { bsCookableFromRecipe, bsCookableFromMeal, bsStepTimers } = await importSibling('..', 'services', 'cookable.mjs');

// The prep sheet reads `Date.now()` ONCE at mount and compares calendar days off it,
// so any test that touches the table-time picker inherits both the runner's wall clock
// and its timezone. That is a real flake, not a theoretical one: this file's rollover
// test passed all evening locally and failed in CI at 00:06 UTC, where "an hour before
// now" is 23:06 -- later today, not yesterday.
//
// Pin the clock instead of picking a safer offset. The instant is built from LOCAL
// components rather than a fixed epoch, because the component's rollover check is
// `getDate()` in local time; a fixed epoch would land on a different local hour in every
// timezone. Noon on a June weekday is far from any DST transition in any zone.
function withClockAt(hour, minute, fn) {
  const real = Date.now;
  const pinned = new Date(2026, 5, 15, hour, minute, 0, 0).getTime();
  Date.now = () => pinned;
  try { return fn(pinned); } finally { Date.now = real; }
}

// The mount harness installs no translator, so `useShapeTr` falls back to each call's
// `defaultValue` VERBATIM -- placeholders and all ("Within {n} min of each other"). That
// is what most mount tests want (tests/kitchen-allergen-surfaces.test.mjs asserts on the
// literal template on purpose), so this fills them in for ONE test rather than changing
// the shared harness underneath the others. It substitutes only from the params the
// component actually passed, so a placeholder the component forgot to supply still shows
// up as `{n}` and the assertion fails rather than quietly matching.
function withCopyValues(fn) {
  const prev = window.ShapeI18n;
  window.ShapeI18n = {
    t(key, opts) {
      const raw = opts && opts.defaultValue;
      if (typeof raw !== 'string') return null;
      return raw.replace(/\{(\w+)\}/g, (m, name) => (
        opts && opts[name] != null ? String(opts[name]) : m
      ));
    },
  };
  try { return fn(); } finally { window.ShapeI18n = prev; }
}

// Two dishes that CAN be timed to land together, one much shorter than the other, so a
// serve plan genuinely has to hold the short one back.
const LONG = {
  key: 'long', title: 'The long braise',
  steps: ['Brown the meat well on every side.', 'Braise it 40 minutes until it yields.', 'Rest it before slicing.'],
  stepMeta: [{ min: null, passive: false, station: 'board' }, { min: 40, passive: true, station: 'stove' }, { min: 5, passive: true, station: 'off' }],
};
const SHORT = {
  key: 'short', title: 'The quick greens',
  steps: ['Wash and trim the greens.', 'Wilt them 5 minutes in the pan.'],
  stepMeta: [{ min: null, passive: false, station: 'board' }, { min: 5, passive: true, station: 'stove' }],
};
const OPTS = { activeStepMin: 3, minPassive: 4, kitchen: { stove: 2, oven: 1 } };
const MIN = 60000;

const servePlan = (extraDelay) => {
  const soonest = bsOrchestrate([LONG, SHORT], { ...OPTS, mode: BS_COOK_MODE.SERVE });
  return bsOrchestrate([LONG, SHORT], { ...OPTS, mode: BS_COOK_MODE.SERVE, serveAt: (soonest.earliestServe || 0) + extraDelay });
};

test('serve plan: a delayed table time really does push the first step later', () => {
  // Guard the guard. If the plan started at minute zero there would be nothing for the
  // board to enforce, and every assertion below would pass vacuously.
  const plan = servePlan(45);
  const firstAt = Math.min(...plan.timeline.map((e) => e.at));
  assert.ok(plan.timeline.length > 0, 'no timeline at all');
  assert.equal(firstAt, 45, `the plan should idle 45 minutes before the first step, got ${firstAt}`);
});

test('the board HOLDS a step that is not due yet, and says when it is', () => {
  const plan = servePlan(45);
  const s = drive(MOD.BSPrepCook, {
    items: [], timeline: plan.timeline, anchor: Date.now(),
    onClose() {}, onRecipePrepped() {}, onDone() {},
  });
  const labels = s.buttons().map((b) => b.label).join(' | ');
  assert.ok(/Starts in/.test(s.text), `no countdown on a step 45 minutes early — buttons: ${labels}`);
  // The advance actions must be ABSENT, not merely styled differently: a disabled-looking
  // button that still fires is the same defect wearing a hat.
  const live = s.buttons().filter((b) => !b.disabled).map((b) => b.label);
  assert.ok(!live.some((l) => /^Next|^Finish|^Start timer/.test(l)),
    `a not-yet-due step still offers a live advance action: ${JSON.stringify(live)}`);
});

test('the cook can overrule the plan for one step, and the board then obeys them', () => {
  // Never a lock. The cook owns the kitchen; the gate is a default, not a cage.
  const plan = servePlan(45);
  const s = drive(MOD.BSPrepCook, {
    items: [], timeline: plan.timeline, anchor: Date.now(),
    onClose() {}, onRecipePrepped() {}, onDone() {},
  });
  s.click('Start now');
  assert.ok(!/Starts in/.test(s.text), 'the countdown survived the override');
  const live = s.buttons().filter((b) => !b.disabled).map((b) => b.label);
  assert.ok(live.some((l) => /^Next|^Finish|^Start timer/.test(l)),
    `overriding did not hand the step back: ${JSON.stringify(live)}`);
});

test('the gate opens once the planned minute actually arrives', () => {
  const plan = servePlan(45);
  // Same plan, but the session began 46 minutes ago — step one is due.
  const s = drive(MOD.BSPrepCook, {
    items: [], timeline: plan.timeline, anchor: Date.now() - 46 * MIN,
    onClose() {}, onRecipePrepped() {}, onDone() {},
  });
  assert.ok(!/Starts in/.test(s.text), 'the board still holds a step whose minute has passed');
});

test('a session with no clock anchor is never gated', () => {
  // Every non-serve session — and every session predating the anchor — must behave
  // exactly as it did before. An inert gate is the whole compatibility story.
  const plan = servePlan(45);
  for (const anchor of [undefined, null, NaN, 'nonsense']) {
    const s = drive(MOD.BSPrepCook, {
      items: [], timeline: plan.timeline, anchor,
      onClose() {}, onRecipePrepped() {}, onDone() {},
    });
    assert.ok(!/Starts in/.test(s.text), `anchor ${String(anchor)} produced a gate out of nothing`);
  }
});

test('the board is actually HANDED the session clock in the shipping mount', () => {
  // ⚠ Every test above passes `anchor` itself, so all five would stay green if the
  // production mount site simply never passed it — the gate would be inert in the app
  // and perfect in the suite. This reads the real call site instead.
  const src = readFileSync(SRC, 'utf8');
  // ⚠ The tag is read brace-aware. Slicing to the first `>` ends at the first arrow
  // function in a prop (`onDone={() => …}`), so a prop ordering change would have
  // truncated the tag and failed for a reason that has nothing to do with the anchor.
  const open = jsxOpenTag(src, 'BSPrepCook');
  assert.ok(open, 'BSPrepCook is never mounted — the interleaved board would not render at all');
  assert.match(open, /anchor=\{/,
    'the shipping BSPrepCook mount passes no `anchor`, so the schedule gate can never fire in the app');
  // And the value handed over must be the stamp taken at the Start tap, not a fresh
  // clock read — the offsets are measured from when cooking BEGAN.
  assert.match(open, /anchor=\{sessionAnchor\}/, 'the anchor is not the session start stamp');
  assert.match(src, /setSessionAnchor\(Date\.now\(\)\)/, 'nothing ever stamps the session start');
});

// ── the progress debit must not punish the convenience timer ───────────────────
// Round 1 taught the board that a RUNNING passive hold has not delivered its minutes
// yet: the cursor moves past a window the instant its timer starts, so those minutes
// are promised, not banked, and `bsProgressPct` debits them.
//
// ⚠ That rule is about HOLDS. A `soft` timer is the plain countdown a cook starts on
// the step they are STANDING AT — the cursor has not passed it, so nothing credited
// those minutes in the first place. Debiting them subtracts a figure nobody banked and
// the bar walks BACKWARD, to zero on a long one, as a reward for using the timer
// (Codex, round 2). Every other reader of `timers` already filters soft out; the debit
// was the only one that did not, which is exactly why a mount is what catches it.
const SEARED = {
  key: 'seared', title: 'The seared cutlets',
  steps: [
    'Trim the cutlets and pat them dry.',
    'Sear the cutlets 8 minutes, turning once, until the crust is deep brown.',
    'Rest them on a warm plate before serving.',
  ],
  stepMeta: [null, null, null],
};
const pctOf = (s) => {
  const m = s.text.match(/(\d+)%/);
  return m ? Number(m[1]) : null;
};

test('a convenience timer on the CURRENT step never moves the board backward', () => {
  const plan = bsOrchestrate([SEARED], { ...OPTS, mode: BS_COOK_MODE.SEQUENCE });
  const s = drive(MOD.BSPrepCook, {
    items: [], timeline: plan.timeline,
    onClose() {}, onRecipePrepped() {}, onDone() {},
  });
  s.click('Next');                       // step 0 behind us — real, banked minutes
  const before = pctOf(s);
  assert.ok(Number.isFinite(before) && before > 0,
    `the board must have banked something before the timer starts, read ${before}%`);
  // Guard the guard: without a chip to press there is nothing under test here.
  const chips = s.buttons().filter((b) => b.label.startsWith('◷'));
  assert.ok(chips.length > 0, 'no convenience-timer chip on an active step that states a duration');

  s.click('◷');
  const after = pctOf(s);
  assert.equal(after, before,
    `starting an 8-minute convenience timer moved the board ${before}% -> ${after}%; a soft timer banks nothing and owes nothing`);

  // ⚠ AND IT STILL OWES NOTHING ONCE THE CURSOR PASSES IT. The debit later gained a
  // `stepIndex < cursor` gate, which covers a soft timer on the CURRENT step by accident —
  // so deleting the `!soft` filter left this test green. Walk past the step with the chip
  // still running: the step banks its active minutes, and the convenience clock still owes
  // nothing, because it was never what those minutes measured.
  if (s.buttons().some((b) => !b.disabled && b.label.startsWith('Next'))) {
    const banked = pctOf(s);
    s.click('Next');
    const walked = pctOf(s);
    assert.ok(walked >= banked,
      `walking past a step with a convenience timer running moved the board ${banked}% -> ${walked}%; the chip is not the step's hold`);
  }
});

test('a real HOLD still owes its minutes — the round-1 fix survives', () => {
  // The other arm, and it needs the RIGHT question. Asking only whether the board
  // stayed under 100% let the defect through at 77%: plenty of steps were still
  // undone, so the figure was low for a reason that had nothing to do with the debit.
  //
  // The discriminating question is what STARTING the hold does. Advancing past a
  // window credits its minutes, and the debit takes back exactly what has not elapsed,
  // so a braise that has just gone on must move the board barely at all. Measured on
  // this plan: 5% before the tap and 5% after — and 5% -> 77% with the debit deleted.
  const plan = bsOrchestrate([LONG, SHORT], { ...OPTS, mode: BS_COOK_MODE.TOGETHER });
  const s = drive(MOD.BSPrepCook, {
    items: [], timeline: plan.timeline,
    onClose() {}, onRecipePrepped() {}, onDone() {},
  });
  let atHold = null;
  let guard = 0;
  while (guard++ < 12) {
    const labels = s.buttons().filter((b) => !b.disabled).map((b) => b.label);
    if (labels.some((l) => l.startsWith('Start timer'))) { atHold = pctOf(s); s.click('Start timer'); break; }
    if (!labels.some((l) => l.startsWith('Next'))) break;
    s.click('Next');
  }
  assert.ok(Number.isFinite(atHold), 'never reached a holding window — this plan cannot exercise the debit');
  const after = pctOf(s);
  assert.ok(Number.isFinite(after), 'no percentage rendered once a hold was running');
  assert.ok(after - atHold <= 2,
    `putting a 40-minute braise on moved the board ${atHold}% -> ${after}%; those minutes are promised, not banked`);
});

// ⚠ "GET IT ALL DONE SOONEST" HAS TO ACTUALLY BE SOONEST. The placement was greedy —
// longest dish first, and only the serve time T was searched — so `earliestServe` was
// the earliest that ONE ORDER fits, presented as the earliest reachable. On these three
// catalog dishes it reported 57 while a different order serves at 51, and the ordinary
// interleaved plan already finished in 55: the mode's single promise, broken, on a
// button labelled with it.
//
// Pinned to the real catalog rather than fixtures. Fixtures would let the constraint
// that produces the clash (one oven, three dishes wanting it) drift out from under the
// test while it kept passing — the recipes ARE the input this shipped wrong on.
const OVEN_TRIO = ['One-pan chicken and rice', 'Sheet-pan salmon, sweet potato and broccoli', 'Roasted veg and halloumi traybake']
  .map((t) => {
    const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === t);
    assert.ok(r, `catalog no longer has "${t}" — repin this test, do not delete it`);
    return { key: r.key || r.title, title: r.title, steps: r.steps, stepMeta: r.stepMeta };
  });

// ── the SERVE picker mounts ──────────────────────────────────────────────────
// BSPrepSession owns the serve-time picker, and every test that mounted it drove the
// MISE, never SERVE -- so the whole branch was rendered by nothing. A hook-order or
// TDZ fault there passes parse, tsc, the suite and the build, and takes down the
// entire prep flow at the tap. This mounts it.
const PICKER_PROGRAM = [{
  meals: [
    { id: 'm1', slot: 'Lunch', title: 'One-pan chicken and rice', kcal: 600, p: 45, c: 55, f: 18 },
    { id: 'm2', slot: 'Dinner', title: 'Sheet-pan salmon, sweet potato and broccoli', kcal: 620, p: 42, c: 48, f: 24 },
  ],
}];

test('serve picker: choosing a table time renders, and says which DAY it landed on', () => {
  // Pinned to local noon, so both branches below are facts about the component rather
  // than about the hour the suite happens to run in. See `withClockAt`.
  withClockAt(12, 0, () => {
    const s = drive(MOD.BSPrepSession, { program: PICKER_PROGRAM, onClose() {} });
    for (const m of PICKER_PROGRAM[0].meals) s.click(m.title, pressable);
    s.click('Merge the mise');
    s.clickKey('serve');   // by key, not by label — the test is about the OPTION, not its wording

    assert.match(s.text, /On the table at/, 'the serve-time picker must render');
    const times = s.nodes().filter((n) => n.type === 'input' && n.props.type === 'time');
    assert.equal(times.length, 1, 'exactly one table-time input');

    // Guard the guard: the default has to actually land today, or the first assertion
    // passes for the wrong reason and the label is never exercised. The chosen time
    // lives in the input's value, not in the rendered text.
    assert.match(times[0].props.value, /^1[2-9]:/,
      `the default serve time should be this afternoon, got ${times[0].props.value}`);
    assert.doesNotMatch(s.text, /Tomorrow/, 'a reachable time today is not labelled tomorrow');

    // A time already past today resolves to TOMORROW. That is right for a cook plating
    // after midnight and identical for one who mis-taps a minute into the past, so the
    // day has to be on screen either way -- a silent rollover schedules the session ~23
    // hours out behind a start time that reads perfectly normal.
    times[0].props.onChange({ target: { value: '11:00' } });
    s.render();
    assert.match(s.text, /Tomorrow/, 'a time that rolled over must say so');

    // ...and it goes away again. A label that never clears would pass the line above
    // whether or not it tracks the chosen time.
    times[0].props.onChange({ target: { value: '19:30' } });
    s.render();
    assert.doesNotMatch(s.text, /Tomorrow/, 'the label must clear when the time lands today');
  });
});

test('serve picker: the landing gap belongs to the plan being RUN, not the earliest one', () => {
  // The gap renders beside "You start cooking at {t}", which reads the plan for the time
  // the cook PICKED. The gap was read from a different plan -- SERVE with no serveAt,
  // i.e. serving as early as possible. Those are different schedules.
  //
  // ⚠ MEASURED over 89,100 pair/kitchen/serve-time comparisons, they disagree in 5.7%,
  // and it is ONE-DIRECTIONAL: the earliest-plan gap UNDERSTATES the run plan's, by up
  // to 101 minutes. So the failure mode is a number that reads better than the truth --
  // never a false promise of a single moment (0 cases of shown-0 with a real gap), which
  // is why nothing on screen contradicted it.
  //
  // This pair is one of the disagreeing ones, and the assertions below prove that BEFORE
  // reading the component: a corpus that cannot exhibit the defect would let a rebinding
  // to `orchServe` pass silently.
  withClockAt(12, 0, () => withCopyValues(() => {
    const cookables = PICKER_PROGRAM[0].meals
      .map((m) => bsCookableFromMeal(m, SHAPE_KITCHEN_RECIPES))
      .filter(Boolean)
      .map((c) => ({ key: c.key || c.title, title: c.title, steps: c.steps, stepMeta: c.stepMeta }));
    assert.equal(cookables.length, 2, 'both meals must resolve to catalog recipes, or this tests nothing');

    // The sheet reads the cook's kitchen at mount; with no stored kitchen that is one of
    // each. Computing against an unlimited kitchen would compare a plan the sheet is not
    // running, which is the very mistake this test exists to catch.
    const KITCHEN = { stove: 1, oven: 1, board: 1 };
    const earliestPlan = bsOrchestrate(cookables, { mode: BS_COOK_MODE.SERVE, kitchen: KITCHEN });
    const DELAY = 30;
    const runPlan = bsOrchestrate(cookables, {
      mode: BS_COOK_MODE.SERVE, serveAt: (earliestPlan.earliestServe || 0) + DELAY, kitchen: KITCHEN,
    });
    const shownIfWrong = earliestPlan.spread || 0;
    const shownIfRight = runPlan.spread || 0;

    // Guard the guard, both ways: a gap of zero renders nothing at all, and two equal
    // gaps make the assertion below true whichever plan the component reads.
    assert.ok(shownIfRight > 0, 'the run plan must land the dishes apart, or the line never renders');
    assert.notEqual(shownIfRight, shownIfWrong,
      `this pair no longer discriminates (both plans gap ${shownIfRight}) — find another, do not delete this test`);

    const s = drive(MOD.BSPrepSession, { program: PICKER_PROGRAM, onClose() {} });
    for (const m of PICKER_PROGRAM[0].meals) s.click(m.title, pressable);
    s.click('Merge the mise');
    s.clickKey('serve');

    const times = s.nodes().filter((n) => n.type === 'input' && n.props.type === 'time');
    assert.equal(times.length, 1, 'exactly one table-time input');
    const at = new Date(Date.now() + ((earliestPlan.earliestServe || 0) + DELAY) * 60000);
    times[0].props.onChange({
      target: { value: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` },
    });
    s.render();

    // The too-soon branch renders a different block entirely; if we landed there the gap
    // line is absent and the match below would fail for the wrong reason.
    assert.match(s.text, /You start cooking at/, 'a reachable time must render the start-time branch');
    const shown = /Within (\d+) min of each other/.exec(s.text);
    assert.ok(shown, `the landing-gap line must render, got: ${s.text.slice(0, 400)}`);
    assert.equal(Number(shown[1]), shownIfRight,
      `the gap must come from the plan the cook runs (${shownIfRight}), not the earliest-serve plan (${shownIfWrong})`);
  }));
});

test('serve mode: the earliest serve time is the earliest over placement ORDERS, not one order', () => {
  const plan = bsOrchestrate(OVEN_TRIO, { mode: BS_COOK_MODE.SERVE });
  assert.equal(plan.earliestServe, 51,
    `earliest serve is ${plan.earliestServe}; longest-first alone reports 57, and the plain interleaved plan already lands in 55`);

  // The schedule is re-derived from the RETURNED timeline, not taken on the engine's word.
  // An earlier version of this mode reported a plan with two pots on one stove as
  // "issues: ['stations']" — handled-looking, and impossible.
  const EXCL = ['oven', 'stove', 'board'];
  const bands = plan.timeline
    .filter((e) => e.station && EXCL.includes(e.station))
    .map((e) => ({ st: e.station, from: e.at, to: e.at + (e.min > 0 ? e.min : BS_ORCH.activeStepMin), who: e.title }));
  const clashes = [];
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const a = bands[i]; const b = bands[j];
      if (a.st === b.st && a.from < b.to && b.from < a.to) clashes.push(`${a.st}: ${a.who} ${a.from}-${a.to} vs ${b.who} ${b.from}-${b.to}`);
    }
  }
  assert.deepEqual(clashes, [], `${clashes.length} station clash(es) in a schedule reported as feasible`);
  assert.ok(plan.timeline.every((e) => e.at >= 0), 'no step may be scheduled before the cook starts');

  const ends = {};
  for (const e of plan.timeline) ends[e.iid] = Math.max(ends[e.iid] || 0, e.at + (e.min > 0 ? e.min : BS_ORCH.activeStepMin));
  assert.ok(Math.max(...Object.values(ends)) <= plan.earliestServe,
    'a dish finishing after the serve time is not a serve-together plan');

  // 12 is not a recorded observation: enumerating every arrangement of these three dishes at
  // T=51 gives 19 feasible ones, and 12 is the smallest spread any of them reaches. So the
  // schedule this returns is the tightest available at the earliest time, and the assertion
  // holds the QUALITY of the plan, not just its serve minute.
  assert.equal(plan.spread, 12,
    `spread ${plan.spread}; 12 is the tightest of the 19 arrangements that serve at 51`);
});

const dishes = (titles) => titles.map((t) => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === t);
  assert.ok(r, `catalog no longer has "${t}" — repin this test, do not delete it`);
  return { key: r.key || r.title, title: r.title, steps: r.steps, stepMeta: r.stepMeta };
});
const durationOfRecipe = (r) => r.steps.reduce((n, _s, i) => {
  const m = (r.stepMeta || [])[i];
  return n + (m && m.min > 0 ? m.min : BS_ORCH.activeStepMin);
}, 0);
// Hands-on spans, by dish, from a RETURNED plan.
const handsSpans = (plan) => plan.timeline
  .filter((e) => !e.station)
  .map((e) => ({ iid: e.iid, who: e.title, from: e.at, to: e.at + (e.min > 0 ? e.min : BS_ORCH.activeStepMin) }));
const handsClashes = (plan) => {
  const h = handsSpans(plan);
  const out = [];
  for (let i = 0; i < h.length; i++) {
    for (let j = i + 1; j < h.length; j++) {
      if (h[i].iid !== h[j].iid && h[i].from < h[j].to && h[j].from < h[i].to) {
        out.push(`${h[i].who} ${h[i].from}-${h[i].to} vs ${h[j].who} ${h[j].from}-${h[j].to}`);
      }
    }
  }
  return out;
};

// ⚠ ONE COOK, TWO HANDS — and a plan is worth nothing if the person cannot perform it.
// Station capacity says nothing about the person, so two dishes could each be given the
// same three minutes of chopping with no station contended. The pair below was reported
// as `earliestServe: 33, spread: 0, issues: []` — a flawless serve-together plan in which
// both dishes' final hands-on steps sat at 30-33. The board then presents those steps one
// after the other, so the second dish lands after the time the plan promised.
//
// 1,688 of 1,770 catalog pairs were scheduled that way, so this was not an edge case: the
// serve time and the spread were both systematically optimistic. What the mode exists to
// save is the wait between cooking one dish and starting the next, and that saving is only
// real when dish B's hands-on work sits inside dish A's HOLD.
test('serve mode: one cook cannot do two hands-on steps at once', () => {
  const plan = bsOrchestrate(dishes(['One-pan chicken and rice', 'Greek yogurt power bowl']), { mode: BS_COOK_MODE.SERVE });
  assert.deepEqual(handsClashes(plan), [],
    'two dishes were given the same minutes of the cook — the promised finish is unreachable');
  // ⚠ I first asserted the serve time would move LATER, which was an assumption rather
  // than a measurement — it does not. The same 33 minutes is reachable; what changes is
  // that the arrangement becomes performable. The yogurt bowl is now built ENTIRELY
  // inside the chicken's 18-minute stove hold, which is precisely the overlap this mode
  // exists to find. The tell is the spread: it claimed 0 while placing both dishes' final
  // hands-on steps in the same three minutes, and honestly reports 3.
  assert.equal(plan.earliestServe, 33, 'the honest arrangement still reaches 33');
  assert.equal(plan.spread, 3,
    `spread ${plan.spread}; 0 was claimed by putting both dishes' last steps in one pair of hands`);
  const inHold = handsSpans(plan).filter((h) => plan.timeline.some((e) =>
    e.station && e.min > 0 && e.iid !== h.iid && h.from >= e.at && h.to <= e.at + e.min));
  assert.ok(inHold.length >= 5,
    `only ${inHold.length} hands-on steps run inside the other dish's hold — the bowl should be built during the rice`);
});

test('serve mode: a hold hosts the other dish, which is the whole saving', () => {
  const pair = dishes(['Roasted veg and halloumi traybake', 'One-pan chicken and rice']);
  const plan = bsOrchestrate(pair, { mode: BS_COOK_MODE.SERVE });

  // This asserted `earliestServe === the longest dish (39)` until the cook was modelled.
  // That premise was arithmetic: both dishes wanted the same last three minutes of the
  // cook, so 39 was available on paper and impossible in a kitchen. 42 is the first time
  // both fit one pair of hands, and the schedule that reaches it puts each dish's prep
  // inside the other's oven/stove hold rather than on top of its hands-on work.
  assert.equal(plan.earliestServe, 42,
    `earliest serve ${plan.earliestServe}; 39 is the longest dish alone and ignores the cook`);
  assert.deepEqual(handsClashes(plan), [], 'the cook is doing two things at once');

  // The saving is real: back-to-back these two are 72 minutes of waiting.
  const backToBack = pair.reduce((n, r) => n + durationOfRecipe(r), 0);
  assert.ok(plan.earliestServe < backToBack,
    `serving at ${plan.earliestServe} must beat cooking them one after the other (${backToBack})`);

  // And the overlap is genuinely inside a hold, not merely a smaller number.
  const holdSpans = plan.timeline.filter((e) => e.station && e.min > 0)
    .map((e) => ({ iid: e.iid, from: e.at, to: e.at + e.min }));
  const hostedWork = handsSpans(plan).filter((h) => holdSpans.some((s) => s.iid !== h.iid && h.from >= s.from && h.to <= s.to));
  assert.ok(hostedWork.length > 0,
    'no hands-on step runs inside the other dish\'s hold — nothing is actually being overlapped');
});

test('serve mode: a single dish is untouched by any of this', () => {
  const [only] = dishes(['Roasted veg and halloumi traybake']);
  const plan = bsOrchestrate([only], { mode: BS_COOK_MODE.SERVE });
  assert.equal(plan.earliestServe, durationOfRecipe(only),
    'with nothing to contend with, the earliest serve is exactly the dish');
  assert.equal(plan.spread, 0, 'one dish cannot be spread');
});

// ⚠ THE SAME DEFECT ONE LANE OVER. The interleaved board learned twice that a running
// hold has not delivered its minutes; the SOLO path credited the authored duration
// outright. Tap Done on the energy bites' 30-minute chill and the header read 100% with
// half an hour left on the clock — and in a sequential multi-dish session those phantom
// minutes were added to the whole evening's progress too.
//
// Driven through the real component rather than by calling bsProgressPct with an
// unearned figure of my own: a pure test would supply the very argument whose ABSENCE
// was the bug, and would have passed against the broken build.
test('solo cook: a chill still running is not progress you have banked', () => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === 'Date and almond energy bites');
  assert.ok(r, 'catalog no longer has the energy bites — repin this test, do not delete it');
  const c = bsCookableFromRecipe(r);
  const s = drive(MOD.BSCookMode, { cookable: c, onClose() {} });
  s.click('Start cooking');

  // Walk to the 30-minute chill, banking the earlier steps honestly on the way. Matched
  // on the step's own words rather than an index, so a catalog edit fails loudly here
  // instead of quietly testing some other step.
  let guard = 0;
  while (guard++ < 8 && !/Chill 30 minutes/.test(s.text)) {
    const next = s.buttons().find((b) => !b.disabled && b.label.startsWith('✓ Done'));
    if (!next) break;
    s.click('✓ Done');
  }
  assert.match(s.text, /Chill 30 minutes/, 'never reached the chill step — this recipe cannot exercise the debit');

  const chip = s.buttons().find((b) => !b.disabled && b.label.startsWith('▸ Timer'));
  assert.ok(chip, `no countdown offered on the chill (buttons: ${s.buttons().map((b) => b.label).join(' | ')})`);
  assert.match(chip.label, /30 min/, `the chip under test reads "${chip.label}" — not the 30-minute chill`);

  const before = pctOf(s);
  s.click('▸ Timer');                      // the 30-minute chill goes on
  // ⚠ BOTH ARMS. Merely STARTING the chill must move nothing: the cook is standing on
  // that step, its minutes were never credited, and debiting them walks the bar
  // backward — 23% to 0% here. That is the round-1 regression from the interleaved
  // lane, and without this line a debit-everything version passed clean.
  assert.equal(pctOf(s), before,
    `starting the chill moved the board ${before}% -> ${pctOf(s)}%; an uncredited step owes nothing`);

  // Mark it done while the clock is still running — the exact move that inflated it.
  // The last step's button reads "Plated", not "Done"; both are the same advance.
  const finish = s.buttons().find((b) => !b.disabled && (b.label.startsWith('✓ Plated') || b.label.startsWith('✓ Done')));
  assert.ok(finish, 'no way to advance past the chill — the scenario cannot be reached');
  s.click(finish.label.startsWith('✓ Plated') ? '✓ Plated' : '✓ Done');
  const after = pctOf(s);

  assert.ok(Number.isFinite(after), 'no percentage rendered after advancing past a running chill');
  assert.ok(after < 100,
    `the board reads ${after}% (from ${before}%) with a 30-minute chill still running; those minutes are promised, not banked`);
});

// ⚠ THE HOLD IS THE ANNOTATION, NOT THE PROSE. `bsStepTimers` collapses a range to its TOP:
// "roast 12 to 15 minutes" comes back as 15. So a window authored at the LOW end — which is
// where the cook is actually wanted — still counted down from the maximum, and the annotation
// was decorative for the one thing it most needed to control. Pinned against the real catalog
// because the mismatch is a property of the recipe's own words.
test('prep board: a hold runs for the annotated window, not the parsed maximum', () => {
  // `bsStepTimers` is inconsistent about ranges: an en-dash form ("12–15 min") comes back as
  // its LOW end, while the word form collapses to the TOP — "simmer 6 to 8 minutes" parses as
  // 8. So a window authored at the low end, which is where the cook is actually wanted, still
  // counted down from the maximum. The annotation was decorative for the one thing it most
  // needed to control.
  //
  // ⚠ Pinned on a fixture rather than the catalog, deliberately and with the reason: every
  // window in THIS branch's catalog already has `min` equal to what its prose parses to, so
  // nothing here can exhibit the mismatch. It becomes load-bearing when the low-end
  // corrections land — the fix has to exist before the data that needs it, not after.
  const parsedTop = bsStepTimers('Cover, lower the heat and simmer 6 to 8 minutes, until the glaze coats a spoon.');
  assert.equal(Math.round(parsedTop[0].seconds / 60), 8,
    'the parser no longer collapses "6 to 8" to its top — if that is fixed, this test is obsolete, not wrong');

  const RANGED = {
    key: 'ranged-fixture', title: 'Ranged hold fixture',
    steps: [
      'Season the chops on both sides and set a heavy skillet over medium-high heat until it shimmers.',
      'Cover, lower the heat and simmer 6 to 8 minutes, until the glaze coats a spoon.',
      'Rest them off the heat and spoon the pan glaze back over before serving.',
    ],
    stepMeta: [null, { min: 6, passive: true, station: 'stove' }, null],
  };
  const plan = bsOrchestrate([RANGED], { ...OPTS, mode: BS_COOK_MODE.SEQUENCE });
  const s = drive(MOD.BSPrepCook, { items: [], timeline: plan.timeline, onClose() {}, onRecipePrepped() {}, onDone() {} });

  let guard = 0;
  while (guard++ < 8 && !s.buttons().some((b) => !b.disabled && b.label.startsWith('Start timer'))) {
    const next = s.buttons().find((b) => !b.disabled && b.label.startsWith('Next'));
    if (!next) break;
    s.click('Next');
  }
  assert.ok(s.buttons().some((b) => b.label.startsWith('Start timer')), 'never reached the window');
  s.click('Start timer');

  const shown = s.text.match(/(\d+):(\d\d)/);
  assert.ok(shown, `no countdown rendered after starting the hold — text was ${JSON.stringify(s.text.slice(0, 200))}`);
  const mins = Number(shown[1]) + (Number(shown[2]) > 0 ? 1 : 0);
  assert.equal(mins, 6, `the board counts down ${shown[0]}; the window is 6 min and only the PROSE says 8`);
});

// ⚠ DEBIT ONLY WHAT THE CURSOR HAS CREDITED — and `!soft` is not that test. `startAndGo`
// deliberately leaves the cursor ON a passive step when the same dish's continuation is next
// and still blocked, so that step has contributed nothing to a percentage that credits steps
// BEFORE the cursor. Debiting its hold subtracts minutes nobody banked: the same error the
// soft-timer filter exists to prevent, arriving through the other door.
test('prep board: starting a hold the cursor still sits on does not move the board backward', () => {
  const pair = ['One-pan chicken and rice', 'Roasted veg and halloumi traybake'].map((t) => {
    const x = SHAPE_KITCHEN_RECIPES.find((y) => y.title === t);
    assert.ok(x, `catalog no longer has "${t}" — repin this test, do not delete it`);
    return { key: x.key || x.title, title: x.title, steps: x.steps, stepMeta: x.stepMeta };
  });
  const plan = bsOrchestrate(pair, { ...OPTS, mode: BS_COOK_MODE.SERVE });
  const s = drive(MOD.BSPrepCook, { items: [], timeline: plan.timeline, onClose() {}, onRecipePrepped() {}, onDone() {} });

  // ⚠ EVERY hold, not the first one. The first hold in this plan is followed by the OTHER
  // dish, so the cursor advances past it and both rules agree — a test that stops there
  // proves nothing. The discriminating hold is the one whose continuation belongs to the
  // SAME dish and is still blocked, so `startAndGo` leaves the cursor sitting on it and the
  // step has banked nothing to debit.
  //
  // ⚠ THE PAIR IS LOAD-BEARING AND WAS RE-CHOSEN. The original fixture reached three holds;
  // after the cook-windows catalog landed it reaches ONE, so the guard below would have been
  // the only thing failing and re-pinning the count would have left a test that walks a board
  // with nothing to discriminate. This pair was picked by driving the real board across the
  // catalog and keeping one that still reaches two, then confirmed by mutation: widening the
  // debit guard to `<=` makes this test fail.
  const moves = [];
  let guard = 0;
  while (guard++ < 30) {
    const labels = s.buttons().filter((b) => !b.disabled).map((b) => b.label);
    if (labels.some((l) => l.startsWith('Start timer'))) {
      const before = pctOf(s);
      s.click('Start timer');
      moves.push({ before, after: pctOf(s) });
      continue;
    }
    if (!labels.some((l) => l.startsWith('Next'))) break;
    s.click('Next');
  }
  assert.ok(moves.length >= 2,
    `only ${moves.length} hold(s) reached; this plan has two and the second is the one that discriminates`);
  const backward = moves.filter((m) => m.after < m.before);
  assert.deepEqual(backward, [],
    `a hold moved the board backward (${backward.map((m) => `${m.before}% -> ${m.after}%`).join(', ')}); the cursor has not passed that step, so nothing was banked to take back`);
});

// ⚠ THE SEARCH BOUND IS PART OF THE PROMISE. Stopping the order search above five dishes while
// the control still reads "get it all done soonest" is the same defect as the original one-order
// heuristic, just further out. These six catalog dishes reported 118 minutes with an order
// available at 113 — and the cheap rotation family does NOT find it, which is why the
// exhaustive bound had to move rather than the fallback getting cleverer.
test('serve mode: the order search reaches a six-dish session', () => {
  const six = ['Red lentil and spinach dahl', 'Turkey chili verde', 'Black-eyed pea and coconut curry',
    'One-pan chicken and rice', 'Chickpea and spinach curry', 'Tempeh and broccoli teriyaki'].map((title) => {
    const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === title);
    assert.ok(r, `catalog no longer has "${title}" — repin this test, do not delete it`);
    return { key: r.key || r.title, title: r.title, steps: r.steps, stepMeta: r.stepMeta };
  });
  const plan = bsOrchestrate(six, { mode: BS_COOK_MODE.SERVE });
  // ⚠ MEASURED on the current catalog: 111, and a single longest-first order ALSO reaches
  // 111 for this set. The old message here claimed the search beat a fixed order by 5
  // minutes; the cook-windows catalog closed that gap, so repeating the claim would be
  // asserting something no longer true of this fixture. What this test still earns is the
  // SIX-dish case — the exhaustive order-search bound (BS_ORCH.orderSearchMax) — and that
  // the plan it returns is actually feasible. The search-beats-one-order claim is pinned
  // by "the earliest serve time is the earliest over placement ORDERS", which uses a set
  // where the two still differ.
  assert.equal(plan.earliestServe, 111,
    `six dishes serve at ${plan.earliestServe}`);
  assert.equal(plan.exact, true,
    'six dishes sit ON the exhaustive bound — if this reports a sample, the bound moved');

  const EXCL = ['oven', 'stove', 'board'];
  const bands = plan.timeline.filter((e) => e.station && EXCL.includes(e.station))
    .map((e) => ({ st: e.station, from: e.at, to: e.at + (e.min > 0 ? e.min : BS_ORCH.activeStepMin) }));
  const clashes = [];
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const a = bands[i]; const b = bands[j];
      if (a.st === b.st && a.from < b.to && b.from < a.to) clashes.push(`${a.st} ${a.from}-${a.to} vs ${b.from}-${b.to}`);
    }
  }
  assert.deepEqual(clashes, [], 'an earlier serve time that puts two pans on one station is not a schedule');
});

// ⚠ THE HANDOFF ITSELF HAD NO COVERAGE. The button that ends a dish inside a Prep Session now
// passes its still-running holds up, reading `timers` and `visited` from the component's own
// scope. Scope being correct is not the same as the click working: a wrong binding here throws
// at click time, which parse, tsc and both builds all pass cleanly.
test('prep session: finishing a dish hands its unfinished holds to the session', () => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === 'Date and almond energy bites');
  assert.ok(r, 'catalog no longer has the energy bites — repin this test, do not delete it');
  const c = bsCookableFromRecipe(r);

  let handed = 'never called';
  const s = drive(MOD.BSCookMode, {
    cookable: c, onClose() {},
    prep: { index: 0, count: 2, priorMins: 0, totalMins: 100, onPrepped(out) { handed = out; } },
  });

  // Walk to the chill, put it on, then end the dish while it is still running.
  let guard = 0;
  while (guard++ < 8 && !/Chill 30 minutes/.test(s.text)) {
    if (!s.buttons().some((b) => !b.disabled && b.label.startsWith('✓ Done'))) break;
    s.click('✓ Done');
  }
  assert.match(s.text, /Chill 30 minutes/, 'never reached the chill — this recipe cannot exercise the handoff');
  const chip = s.buttons().find((b) => !b.disabled && b.label.startsWith('▸ Timer'));
  assert.ok(chip, `no countdown offered on the chill (buttons: ${s.buttons().map((b) => b.label).join(' | ')})`);
  s.click('▸ Timer');

  const finish = s.buttons().find((b) => !b.disabled && (b.label.startsWith('✓ Plated') || b.label.startsWith('✓ Done')));
  assert.ok(finish, 'no way to end the dish');
  s.click(finish.label.startsWith('✓ Plated') ? '✓ Plated' : '✓ Done');

  // Plating does not end the dish inside a session — a separate CTA does, and that is the
  // button carrying the handoff. Assert we found it rather than silently skipping the click.
  const cta = s.buttons().find((b) => !b.disabled && (b.label.startsWith('Next recipe') || b.label.startsWith('Wrap the session')));
  assert.ok(cta, `no session CTA after plating (buttons: ${s.buttons().map((b) => b.label).join(' | ')})`);
  s.click(cta.label.startsWith('Next recipe') ? 'Next recipe' : 'Wrap the session');

  assert.ok(Array.isArray(handed), `onPrepped received ${JSON.stringify(handed)} — the handoff did not run`);
  assert.equal(handed.length, 1, `expected the running chill to be handed up, got ${JSON.stringify(handed)}`);
  assert.ok(handed[0].endsAt > Date.now() + 25 * 60000,
    `the carried hold ends at ${handed[0].endsAt}, which is not ~30 minutes out`);

  // ⚠ AND IT MUST CARRY MORE THAN THE ARITHMETIC. Handing up only `endsAt` fed the debit
  // correctly and destroyed everything a COOK needs: the next dish mounted a fresh
  // BSCookMode with an empty timer list, so a live 30-minute chill and its finish notice
  // vanished the moment the previous recipe unmounted.
  assert.equal(handed[0].dish, r.title,
    `the carried hold lost the dish it belongs to: ${JSON.stringify(handed[0])}`);
  assert.ok(handed[0].gist || handed[0].label,
    `the carried hold lost the words that name it: ${JSON.stringify(handed[0])}`);

  // The NEXT dish must actually show it — the handoff is worth nothing if nothing renders.
  const next = SHAPE_KITCHEN_RECIPES.find((x) => x.title !== r.title && bsCookableFromRecipe(x));
  const s2 = drive(MOD.BSCookMode, {
    cookable: bsCookableFromRecipe(next), onClose() {},
    prep: { index: 1, count: 2, priorMins: 0, totalMins: 100, onPrepped() {}, carried: handed },
  });
  assert.ok(s2.text.includes(r.title),
    `the next dish does not mention the hold still running from ${r.title}: ${s2.text.slice(0, 300)}`);

  // ⚠ ...and while it is still RUNNING it must not be dismissible: the session debit is
  // max(0, endsAt - now), so clearing a live hold would move a figure this screen does
  // not own.
  const liveDismiss = s2.nodes().filter((n) => n.type === 'button' && n.props.onClick
    && /Done/.test(textOf(n)) && String(n.key || '').startsWith('carried-'));
  assert.equal(liveDismiss.length, 0,
    'a still-running carried hold must not be dismissible on the next dish');
});

// ⚠ THE FIX FOR A VANISHING TIMER WAS ONE EDIT AWAY FROM A VANISHING TIMER. The first
// version of the carried-hold rail filtered on `endsAt > now`, so a chill that ended while
// the cook was on the transition screen was dropped before anything announced it — and
// carried holds are absent from the local `rung` list too, so no "time's up" ever came.
// That is the very defect the carry was written to fix, re-created one stage later.
test('prep session: a carried hold that EXPIRES is still announced, not silently dropped', () => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => bsCookableFromRecipe(x));
  const expired = { id: 1, cid: '0-1', label: 'Chill 30 minutes', gist: 'Chill 30 minutes', total: 1800, endsAt: Date.now() - 60_000, dish: 'Date and almond energy bites' };

  let cleared = 'never called';
  const s = drive(MOD.BSCookMode, {
    cookable: bsCookableFromRecipe(r), onClose() {},
    prep: { index: 1, count: 2, priorMins: 0, totalMins: 100, onPrepped() {}, carried: [expired], onCarriedDone(cid) { cleared = cid; } },
  });

  assert.ok(s.text.includes(expired.dish),
    `an expired carried hold vanished instead of being announced: ${s.text.slice(0, 300)}`);
  assert.match(s.text, /Time's up/,
    `an expired carried hold must say so, not just sit there: ${s.text.slice(0, 300)}`);

  // ...and NOW it is dismissible — its debit is already zero, so clearing it moves nothing.
  // ⚠ Take the button from INSIDE the carried row. The step itself also renders a "✓ Done",
  // so a whole-tree search by label clicks the wrong control and the assertion below then
  // fails for a reason that has nothing to do with carried holds.
  const row = s.nodes().find((n) => String(n.key || '') === `carried-${expired.cid}`);
  assert.ok(row, 'the expired carried hold did not render its own row');
  const btn = flattenNode(row).find((n) => n.type === 'button' && n.props.onClick);
  assert.ok(btn, `a finished carried hold must be acknowledgeable: ${textOf(row)}`);
  btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(cleared, expired.cid, `acknowledging must clear THAT hold, got ${JSON.stringify(cleared)}`);
});

// ⚠ `timerIdRef` restarts at 0 in every newly mounted BSCookMode, so two dishes each handing
// up their first timer both produce id 1. Keyed on the raw id they collide as "carried-1" and
// React can drop the wrong countdown when one expires.
test('prep session: carried holds from different dishes get distinct keys', () => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => bsCookableFromRecipe(x));
  const mk = (cid, dish) => ({ id: 1, cid, label: 'Rest', gist: 'Rest', total: 600, endsAt: Date.now() + 300_000, dish });
  const s = drive(MOD.BSCookMode, {
    cookable: bsCookableFromRecipe(r), onClose() {},
    prep: {
      index: 2, count: 3, priorMins: 0, totalMins: 100, onPrepped() {}, onCarriedDone() {},
      carried: [mk('0-1', 'First dish'), mk('1-1', 'Second dish')],
    },
  });
  const keys = s.nodes().map((n) => String(n.key || '')).filter((k) => k.startsWith('carried-'));
  assert.equal(keys.length, 2, `both carried holds must render, got ${JSON.stringify(keys)}`);
  assert.equal(new Set(keys).size, 2, `carried holds collided on key: ${JSON.stringify(keys)}`);
});

// ⚠ THE FIX FOR A VANISHING TIMER LEFT THE TIMER STANDING STILL. Carried holds now reach
// the wrap screen — and stop dead there. `sessionNow` is a plain render-time constant, and
// the only second-hands in this flow belong to `BSPrepCook` and `BSCookMode`, BOTH of which
// are unmounted by the time `stage === 'wrap'`. Nothing re-renders the wrap, so the
// countdown freezes at the instant the cook arrived: it never reaches "Time's up" and never
// offers the acknowledge button — the one thing the carry exists to deliver, absent from the
// last screen that can deliver it.
//
// ⚠ NO ASSERTION ON THE RENDERED TEXT CAN SEE THIS. Re-rendering is precisely what the
// harness does, so a test that calls `render()` supplies the very thing production fails to
// schedule and passes either way. The defect is the WIRING, so the wiring is what these
// assert. The shared harness makes effects no-ops on purpose (the real ones start wall-clock
// intervals); these two tests — and only these two — collect what a render registered and
// run it against a recording timer, restoring both on the way out.
function withWrapEffects(fn) {
  const realEffect = SHIM.useEffect;
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  const realNow = Date.now;
  const pending = [];
  const timers = [];
  SHIM.useEffect = (fx) => { pending.push(fx); };
  globalThis.setInterval = (cb, ms) => { const h = { cb, ms, live: true }; timers.push(h); return h; };
  globalThis.clearInterval = (h) => { if (h && typeof h === 'object') h.live = false; };
  // Local noon, movable. Same reasoning as `withClockAt`: a real wall clock makes the
  // expiry assertions facts about the hour the suite happens to run in.
  let clock = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();
  Date.now = () => clock;
  const api = {
    at: (ms) => { clock = ms; },
    now: () => clock,
    forget: () => { pending.length = 0; },   // discard what earlier stages registered
    run: () => pending.splice(0).map((f) => f()).filter((t) => typeof t === 'function'),
    liveTimers: () => timers.filter((t) => t.live),
  };
  try { return fn(api); } finally {
    SHIM.useEffect = realEffect;
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
    Date.now = realNow;
  }
}

// Walk a ONE-recipe session to the wrap with `hold` still on the clock. One recipe is what
// puts the wrap directly after the dish (`cookIdx + 1 >= ordered.length`), and the hold is
// handed up through the real `prep.onPrepped` the cook surface calls — not written into
// state by the test, which would prove nothing about how a hold actually arrives.
function wrapWithCarriedHold(hold) {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => bsCookableFromRecipe(x));
  assert.ok(r, 'the catalog has no cookable recipe — this test cannot run');
  const program = [{ meals: [{ id: 'w1', slot: 'Lunch', title: r.title, kcal: 500, p: 30, c: 40, f: 15 }] }];
  const s = drive(MOD.BSPrepSession, { program, onClose() {} });
  s.click(r.title, pressable);
  s.click('Merge the mise');
  s.click('Start the session');
  s.click('Start this recipe');
  const board = s.nodes().find((n) => n.props && n.props.prep && typeof n.props.prep.onPrepped === 'function');
  assert.ok(board, 'the session never reached a cook surface that can hand a hold up');
  board.props.prep.onPrepped([hold]);
  return s;
}

test('prep session: the wrap screen keeps a carried hold TICKING, not frozen at arrival', () => {
  withWrapEffects((clock) => {
    const hold = { id: 1, label: 'Chill 30 minutes', gist: 'Chill 30 minutes', total: 1800, endsAt: clock.now() + 60_000, dish: 'Date and almond energy bites' };
    const s = wrapWithCarriedHold(hold);

    clock.forget();   // the picker/mise renders are not what this is about
    s.render();       // ...this is: the wrap, with a minute still to run
    const teardowns = clock.run();

    assert.match(s.text, /Chill 30 minutes/, 'the carried hold did not reach the wrap at all');
    assert.doesNotMatch(s.text, /Time's up/, 'guard the guard: the hold must still be RUNNING here');

    const live = clock.liveTimers();
    assert.equal(live.length, 1,
      `the wrap must run its own second-hand while a carried hold is still counting — it registered ${live.length}. Without one, sessionNow never moves again and the countdown is a still photograph.`);
    assert.ok(live[0].ms <= 1000, `a countdown showing seconds cannot tick every ${live[0].ms}ms`);

    // ...and what it drives is THIS row: run the clock past the hold and the wrap must now
    // say so and offer the acknowledgement.
    clock.at(hold.endsAt + 1000);
    live[0].cb();
    s.render();
    assert.match(s.text, /Time's up/, `the hold expired and the wrap never said so: ${s.text.slice(0, 300)}`);
    // ⚠ Find the row by CONTENT, not by key shape: the wrap keys these rows on the bare
    // `cid` while the cook rail prefixes them `carried-`, and a test pinned to the wrong
    // scheme fails for a reason that has nothing to do with the countdown.
    const row = s.nodes()
      .filter((n) => textOf(n).includes("Time's up")
        && flattenNode(n).some((x) => x.type === 'button' && x.props.onClick))
      .sort((a, b) => textOf(a).length - textOf(b).length)[0];
    assert.ok(row, `a finished carried hold must be acknowledgeable on the wrap: ${s.text.slice(0, 300)}`);
    const ack = flattenNode(row).find((n) => n.type === 'button' && n.props.onClick);
    ack.props.onClick({ preventDefault() {}, stopPropagation() {} });
    s.render();
    assert.doesNotMatch(s.text, /Chill 30 minutes/,
      `acknowledging the finished hold did not clear it from the wrap: ${s.text.slice(0, 300)}`);

    // A heartbeat that outlives its screen is a leak: the teardown must stop it.
    teardowns.forEach((t) => t());
    assert.equal(clock.liveTimers().length, 0, 'the wrap heartbeat kept running after teardown');
  });
});

// ⚠ A HEARTBEAT THAT ALWAYS FIRES IS ITS OWN DEFECT. BSPrepSession returns the BOARD during
// the cook stage, so a session-wide second-hand would re-render `BSPrepCook`/`BSCookMode`
// every second ON TOP of the one each already runs. It must start only when there is
// something left to count.
test('prep session: the wrap runs NO heartbeat once nothing is left to count', () => {
  withWrapEffects((clock) => {
    const rung = { id: 1, label: 'Chill 30 minutes', gist: 'Chill 30 minutes', total: 1800, endsAt: clock.now() - 60_000, dish: 'Date and almond energy bites' };
    const s = wrapWithCarriedHold(rung);

    clock.forget();
    s.render();
    clock.run();

    assert.match(s.text, /Time's up/, 'guard the guard: this hold must have ALREADY rung');
    assert.equal(clock.liveTimers().length, 0,
      'the wrap started a second-hand with nothing left to count — every session would then re-render once a second forever');
  });
});


// ---------------------------------------------------------------------------------------
// HOW LONG A STEP TAKES IS NOT WHETHER THE COOK MAY LEAVE DURING IT. The engine conflated
// them in its two timeline builders, so a step could carry an authored duration, have SERVE
// placement believe it, and have the plan those builders produced ignore it.
// ---------------------------------------------------------------------------------------

// WARNING - THE FIRST VERSION OF THIS TEST WAS HOLLOW, and mutation-testing is the only
// reason I know. It asserted on `max(at + min)` across the timeline, and `evt` puts the
// authored `min` on the event whatever its passive flag - so the span read 73 even when the
// clock had advanced by three. Reverting the fix left it GREEN. What actually distinguishes
// the two builds is WHEN THE NEXT STEP STARTS, so that is what these assert on now.
const startOf = (tl, key) => Math.min(...tl.filter((e) => e.recipe === key).map((e) => e.at));

test('a step can take an hour without ever being a window the cook may walk away from', () => {
  // The layered gratin's shape, reduced to a fixture: a step that bakes for an hour and then
  // tells the cook to rest and slice. It can NEVER be a window - it hides an instruction
  // behind its own timer - and it still takes seventy minutes of the evening.
  const bake = {
    key: 'bake', title: 'Long bake',
    steps: ['Layer the potatoes and sauce in the dish.', 'Bake 1 hour, until bronzed; rest 10 minutes before serving.'],
    stepMeta: [null, { min: 70, passive: false, station: 'oven' }],
  };
  const quick = { key: 'quick', title: 'Quick bowl', steps: ['Chop.', 'Toss.', 'Plate.'], stepMeta: [null, null, null] };

  const seq = bsOrchestrate([bake, quick], { mode: BS_COOK_MODE.SEQUENCE });
  assert.ok(startOf(seq.timeline, 'quick') >= 70,
    `one-at-a-time starts the second dish at ${startOf(seq.timeline, 'quick')} minutes, `
    + 'walking straight past a 70-minute bake');

  // ...and it is emphatically NOT a window. No `passive` flag, so nothing may be scheduled
  // inside it - the owner constraint against fabricated parallelism is untouched by this.
  assert.equal(bsOrchestrate([bake, quick], {}).canInterleave, false,
    'a duration alone must never make a step host a detour');
  assert.equal(bsOrchestrate([bake, quick], { mode: BS_COOK_MODE.SERVE }).canInterleave, false,
    'serve mode agrees: duration is not permission to leave');
});

test('the INTERLEAVER spends the clock on a long step it is not allowed to leave', () => {
  // A separate fixture, because the interleaver is a different code path from the serial
  // builder and only runs when a real window exists. The rest at the end is that window; the
  // hour in the middle is not, and the cook is standing there for it either way.
  const bake = {
    key: 'bake', title: 'Long bake',
    steps: ['Layer it up.', 'Bake 1 hour, basting twice.', 'Rest before slicing.'],
    stepMeta: [null, { min: 60, passive: false, station: 'oven' }, { min: 10, passive: true, station: 'off' }],
  };
  const quick = { key: 'quick', title: 'Quick bowl', steps: ['Chop.', 'Toss.', 'Plate.'], stepMeta: [null, null, null] };
  const auto = bsOrchestrate([bake, quick], {});
  assert.equal(auto.canInterleave, true, 'the rest is a real window - this fixture must interleave');
  const rest = auto.timeline.find((e) => e.recipe === 'bake' && e.stepIndex === 2);
  assert.ok(rest.at >= 60 + BS_ORCH.activeStepMin,
    `the rest is scheduled at ${rest.at} minutes, so the hour of baking before it cost nothing`);
});

test('serve mode: the sheet is told when "soonest" is the best of a sample, not a proof', () => {
  const mk = (n) => ({
    key: 'd' + n, title: 'Dish ' + n,
    steps: ['Prep it.', 'Leave it be.'],
    stepMeta: [null, { min: 10, passive: true, station: 'off' }],
  });
  const six = Array.from({ length: 6 }, (_, i) => mk(i));
  assert.equal(BS_ORCH.orderSearchMax, 6, 'the published bound must be the one the search uses');
  assert.equal(bsOrchestrate(six, { mode: BS_COOK_MODE.SERVE }).exact, true,
    'six dishes are searched exhaustively, so the figure IS the earliest');
  assert.equal(bsOrchestrate([...six, mk(6)], { mode: BS_COOK_MODE.SERVE }).exact, false,
    'seven dishes are searched by rotation only - seven catalog dishes report 118 where an '
    + 'order exists that serves at 113, so the sheet must not call it the earliest');
});

test('serve mode: a plan resting on untimed long steps says so, and authoring the time silences it', () => {
  const untimed = {
    key: 'u', title: 'Untimed bake',
    steps: ['Assemble the dish.', 'Bake 1 hour until the top is bronzed.'],
    stepMeta: [null, null],
  };
  const short = { key: 's', title: 'Chop and toss', steps: ['Chop the herbs.', 'Toss for 2 minutes.'], stepMeta: [null, null] };

  assert.equal(bsOrchestrate([untimed, short], { mode: BS_COOK_MODE.SERVE }).estimated, true,
    'an hour of un-authored bake is exactly the assumption the cook needs warning about');
  assert.equal(bsOrchestrate([short, { ...short, key: 's2' }], { mode: BS_COOK_MODE.SERVE }).estimated, false,
    'the flag must have a quiet arm, or the caveat is wallpaper - it fired on 97.5% of catalog '
    + 'pairs before the threshold, and a caveat that always shows teaches cooks to read past it');

  // The point of the flag: it marks MISSING DATA, so supplying the data clears it. Same steps,
  // same prose, one authored duration - and the sheet stops hedging.
  const authored = { ...untimed, stepMeta: [null, { min: 60, passive: false, station: 'oven' }] };
  assert.equal(bsOrchestrate([authored, short], { mode: BS_COOK_MODE.SERVE }).estimated, false,
    'authoring the duration must silence the caveat, or it is measuring the wrong thing');
  assert.ok(bsOrchestrate([authored, short], { mode: BS_COOK_MODE.SERVE }).earliestServe >= 60,
    'and the authored hour must still be scheduled');
});

test('the three cook options run three DIFFERENT schedulers', () => {
  // Owner ruling 2026-08-19: "cook at the same time", "cook separately" and "cook to
  // serve" are three questions, not one question at three times. SOONEST used to run
  // SERVE with no `serveAt`, which made it the serve option minus its time picker --
  // two of the three doors opening on the same room.
  //
  // ⚠ THIS MUST ASSERT THE PLAN THE SHEET RUNS, NOT THE ROW BADGE. A first version of
  // this test checked the minutes on the option row; those come from their own memos
  // and never touch the choice->mode mapping, so rewiring SOONEST back to SERVE left it
  // GREEN. The road map renders one row per timeline event as `{at}m{title}`, which is
  // the chosen plan itself -- so that is what is compared.
  const cookables = SHAPE_KITCHEN_RECIPES.map((r) => {
    const c = bsCookableFromRecipe(r);
    if (!c || !Array.isArray(c.steps) || !c.steps.length) return null;
    return { key: r.key || r.title, title: r.title, steps: c.steps, stepMeta: c.stepMeta || [] };
  }).filter(Boolean);

  // The first catalog pair whose three modes all disagree. A pair where two of them
  // agree could not tell those two apart; the search failing is asserted, so this can
  // never pass vacuously.
  let found = null;
  outer:
  for (let i = 0; i < cookables.length && !found; i++) {
    for (let j = i + 1; j < cookables.length; j++) {
      const rs = [cookables[i], cookables[j]];
      const tog = bsOrchestrate(rs, { mode: BS_COOK_MODE.TOGETHER });
      const srv = bsOrchestrate(rs, { mode: BS_COOK_MODE.SERVE });
      const seq = bsOrchestrate(rs, { mode: BS_COOK_MODE.SEQUENCE });
      const sig = (p) => p.timeline.map((e) => e.at).join(',');
      if (sig(tog) !== sig(srv) && sig(tog) !== sig(seq) && sig(srv) !== sig(seq)) {
        found = { rs, tog, srv, seq }; break outer;
      }
    }
  }
  assert.ok(found, 'no catalog pair separates all three modes — this test cannot discriminate');

  const { rs, tog, srv, seq } = found;
  const program = [{ meals: rs.map((r, i) => ({ id: `p${i}`, slot: 'Lunch', title: r.title, kcal: 500, p: 30, c: 40, f: 15 })) }];
  // Each road-map row is `{at}m` immediately followed by the recipe title, so a minute
  // token followed by a letter is a step row. A hold chip reads "◷ 18m" and is followed
  // by the next row's digits, so it does not match.
  const offsets = (text) => [...text.matchAll(/(\d+)m(?=[A-Za-z])/g)].map((m) => Number(m[1]));
  const planOffsets = (p) => p.timeline.map((e) => e.at);

  const render = (choiceKey) => withClockAt(12, 0, () => {
    const s = drive(MOD.BSPrepSession, { program, onClose() {} });
    for (const m of program[0].meals) s.click(m.title, pressable);
    s.click('Merge the mise');
    s.clickKey(choiceKey);
    return offsets(s.text);
  });

  const shownSoonest = render('soonest');
  const shownSequence = render('sequence');

  assert.deepEqual(shownSoonest, planOffsets(tog),
    `"cook at the same time" must run the TOGETHER plan. Got ${shownSoonest.join(',')}; TOGETHER is ${planOffsets(tog).join(',')} and SERVE is ${planOffsets(srv).join(',')}`);
  assert.notDeepEqual(shownSoonest, planOffsets(srv),
    'the same-time option is running the SERVE scheduler — the two options are the same door again');
  assert.deepEqual(shownSequence, planOffsets(seq), '"cook separately" must run the SEQUENCE plan');
});

// The whole shipping catalog as cookables, built once — these two tests search it for a
// real pair rather than hand-building fixtures, so they fail loudly if the catalog stops
// containing the case they exist for.
const KITCHEN_DATA = await importSibling('shapeKitchenData.js');
const COOKABLE = await importSibling('..', 'services', 'cookable.mjs');
const cookables = KITCHEN_DATA.SHAPE_KITCHEN_RECIPES
  .map((r) => {
    const c = COOKABLE.bsCookableFromRecipe(r);
    return c && c.steps && c.steps.length
      ? { key: r.key || r.title, title: r.title, steps: c.steps, stepMeta: c.stepMeta || [] }
      : null;
  })
  .filter(Boolean);

// ⚠ TWO OPTIONS THAT RUN THE SAME PLAN ARE ONE OPTION WITH A FALSE PROMISE. When no dish
// has a window to weave into, TOGETHER falls back to serial: it produces the SAME timeline
// as "cook separately" and therefore the SAME minutes, while its row promised simultaneous
// cooking. The engine had always NAMED the reason (BS_SERIAL_REASON.NO_WINDOW); nothing
// read it, so the sheet offered a dead choice with no explanation.
test('prep sheet: "cook at the same time" is not offered when it cannot weave', () => {
  const kitchen = { stove: 1, oven: 1, board: 1 };

  // Find REAL catalog pairs rather than hand-building fixtures — a pair I construct myself
  // cannot tell me the shipping catalog still contains the case.
  let dead = null;
  let live = null;
  for (let i = 0; i < cookables.length && (!dead || !live); i++) {
    for (let j = i + 1; j < cookables.length && (!dead || !live); j++) {
      const rs = [cookables[i], cookables[j]];
      const plan = bsOrchestrate(rs, { mode: BS_COOK_MODE.TOGETHER, kitchen });
      // ⚠ SELECT ON THE REASON, NOT ON `serial`. A STATIONS plan is serial too, so taking
      // the first serial pair could hand this test a station-blocked plan while the
      // assertion below accepts EITHER message — passing without ever exercising NO_WINDOW.
      if (plan?.serial === true && plan.reason === ORCH.BS_SERIAL_REASON.NO_WINDOW && !dead) dead = rs;
      if (plan?.serial === false && !live) live = rs;
    }
  }
  assert.ok(dead, 'the catalog no longer holds a pair that cannot weave — this test is vacuous');
  assert.ok(live, 'the catalog no longer holds a pair that CAN weave — guard the guard');

  const sameTimeRow = (rs) => {
    const program = [{ meals: rs.map((r, i) => ({ id: `p${i}`, slot: 'Lunch', title: r.title, kcal: 500, p: 30, c: 40, f: 15 })) }];
    const s = drive(MOD.BSPrepSession, { program, onClose() {} });
    for (const m of program[0].meals) s.click(m.title, pressable);
    s.click('Merge the mise');
    const row = s.nodes().find((n) => String(n.key) === 'soonest' && n.props && n.props.onClick);
    assert.ok(row, 'no option row keyed "soonest" rendered');
    return { row, text: textOf(row) };
  };

  const d = sameTimeRow(dead);
  assert.equal(d.row.props.disabled, true,
    `a pair that cannot weave must not offer "at the same time": ${d.text}`);
  // ⚠ The NO_WINDOW message specifically, read from the catalog — not an alternation over
  // both reasons. `dead` is selected on the reason now, so accepting either message would
  // let a station-blocked plan satisfy a test written for the no-window one. Reading the
  // catalog also catches the copy drifting out of sync with the component's defaultValue.
  const noWindowCopy = JSON.parse(readFileSync(join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs', 'en', 'cook.json'), 'utf8'))['prep.noWindow'];
  assert.ok(d.text.includes(noWindowCopy),
    `the row must say WHY it is unavailable, in the NO_WINDOW words (${JSON.stringify(noWindowCopy)}): ${d.text}`);

  // ⚠ AND THE MINUTES MUST BE GONE. They equal the "cook separately" figure exactly, so
  // printing them offers a saving that does not exist.
  //
  // ⚠ THE FIRST VERSION OF THIS ASSERTION WAS HOLLOW, AND MUTATION-TESTING CAUGHT IT. It
  // recomputed the sequence span here and looked for THAT number in the row — but the
  // component schedules against its own persisted kitchen and renders 27 where this test
  // computed 30, so the regex could never match and the assertion could never fail.
  // Assert on what the ROW SHOWS, never on a number the test derived for itself.
  assert.doesNotMatch(d.text, /\d+\s*min/,
    `the unavailable row still printed minutes — the very figure "cook separately" shows: ${d.text}`);

  // Guard the guard: still offered, still with its minutes, when it CAN weave.
  const l = sameTimeRow(live);
  assert.ok(!l.row.props.disabled, `a pair that CAN weave must still offer the option: ${l.text}`);
  assert.match(l.text, /\d+\s*min/, `an available row must still show its minutes: ${l.text}`);
});

// ⚠ A SUPERLATIVE THE SCHEDULER CANNOT SUPPORT. TOGETHER is greedy and ORDER-SENSITIVE, and
// the order search that would justify "soonest" lives on the SERVE path only.
test('prep sheet: the same-time option claims no optimum it never searched for', () => {
  const kitchen = { stove: 1, oven: 1, board: 1 };
  const span = (p) => (p?.timeline?.length
    ? Math.max(...p.timeline.map((e) => e.at + (e.min || BS_ORCH.activeStepMin)))
    : null);
  const byTitle = (t) => cookables.find((r) => r.title === t);

  const trio = ['One-pan chicken and rice', 'Greek yogurt power bowl', 'Catfish stew with brown rice'].map(byTitle);
  if (trio.every(Boolean)) {
    const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));
    const spans = perms(trio).map((o) => span(bsOrchestrate(o, { mode: BS_COOK_MODE.TOGETHER, kitchen }))).filter((x) => x != null);
    const asGiven = span(bsOrchestrate(trio, { mode: BS_COOK_MODE.TOGETHER, kitchen }));
    // This is the PREMISE of the copy change, pinned. If the scheduler ever becomes
    // order-insensitive the superlative would be earnable again, and this is what says so.
    assert.ok(Math.min(...spans) < asGiven,
      'TOGETHER is no longer order-sensitive here — revisit whether "soonest" is now earnable');
  }

  const en = JSON.parse(readFileSync(join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs', 'en', 'cook.json'), 'utf8'));
  assert.doesNotMatch(en['prep.soonestSub'], /soonest|fastest|quickest|earliest/i,
    `the same-time copy claims an optimum the greedy scheduler never searched for: ${en['prep.soonestSub']}`);
});

// ⚠ THE SAME RULE AT THREE SITES, AND THE FIRST FIX CHANGED ONE. A carried hold was dropped
// once expired — on the DISPLAY, on the HANDOFF, and on the WRAP. Fixing only the display
// was worthless for a hold that finished before the cook tapped "Next recipe": it was never
// handed up at all, so there was nothing downstream to display. Both tests below were
// written after mutation-testing showed the suite could not tell the fix from the defect.
test('prep session: a hold that finishes BEFORE the handoff is still handed up', () => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === 'Date and almond energy bites');
  assert.ok(r, 'catalog no longer has the energy bites — repin this test, do not delete it');

  let handed = 'never called';
  const s = drive(MOD.BSCookMode, {
    cookable: bsCookableFromRecipe(r), onClose() {},
    prep: { index: 0, count: 2, priorMins: 0, totalMins: 100, onPrepped(out) { handed = out; } },
  });

  let guard = 0;
  while (guard++ < 8 && !/Chill 30 minutes/.test(s.text)) {
    if (!s.buttons().some((b) => !b.disabled && b.label.startsWith('✓ Done'))) break;
    s.click('✓ Done');
  }
  assert.match(s.text, /Chill 30 minutes/, 'never reached the chill');
  assert.ok(s.buttons().some((b) => !b.disabled && b.label.startsWith('▸ Timer')), 'no countdown offered');
  s.click('▸ Timer');

  const finish = s.buttons().find((b) => !b.disabled && (b.label.startsWith('✓ Plated') || b.label.startsWith('✓ Done')));
  assert.ok(finish, 'no way to end the dish');
  s.click(finish.label.startsWith('✓ Plated') ? '✓ Plated' : '✓ Done');

  // ⚠ Let the chill FINISH before the cook advances — the case the handoff filter dropped.
  const real = Date.now;
  Date.now = () => real() + 45 * 60_000;
  try {
    const cta = s.buttons().find((b) => !b.disabled && (b.label.startsWith('Next recipe') || b.label.startsWith('Wrap the session')));
    assert.ok(cta, `no session CTA (buttons: ${s.buttons().map((b) => b.label).join(' | ')})`);
    s.click(cta.label.startsWith('Next recipe') ? 'Next recipe' : 'Wrap the session');
  } finally { Date.now = real; }

  assert.ok(Array.isArray(handed), `onPrepped received ${JSON.stringify(handed)}`);
  assert.equal(handed.length, 1,
    `an EXPIRED hold must still be handed up so it can be acknowledged, got ${JSON.stringify(handed)}`);
  assert.equal(handed[0].dish, r.title, 'the expired hold lost its dish');
});

// ⚠ AND THE WRAP DROPPED IT TOO — the third site, and the cook's LAST chance to hear that a
// hold from an earlier dish has finished.
test('prep session: the WRAP does not filter a carried hold that has finished', () => {
  const src = readFileSync(SRC, 'utf8');
  const i = src.indexOf('A hold inherited from an earlier dish is still running at the wrap');
  assert.ok(i > 0, 'the wrap carried-hold block was renamed — repoint this test');
  const head = src.slice(i, i + 1500);
  assert.doesNotMatch(head, /carried\.filter\(\(h\) => h\.endsAt > sessionNow\)/,
    'the wrap filters expired carried holds again — the third site of the same defect');
  assert.match(head, /Time's up/,
    'the wrap must be able to say a carried hold FINISHED, not only count it down');
});
