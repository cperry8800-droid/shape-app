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
// Harness is the proven one from tests/kitchen-allergen-surfaces.test.mjs: compile the
// shipping file in memory, resolve its imports to the real modules, drive the component
// with a hook shim. Nothing is stubbed or written to disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const commonjs = require_('next/dist/compiled/babel/plugin-transform-modules-commonjs');
const React = require_('react');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');

const THEME = new Proxy({
  MONO: 'mono', DISPLAY: 'display', PAPER: '#fff', INK: '#111', INK50: '#777',
  RULE: '#ccc', padX: 18, isLight: true, W: { display: 800 },
}, { get: (t, k) => (k in t ? t[k] : '#000'), has: () => true });

globalThis.window = globalThis;
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };
globalThis.useBS = () => THEME;
let ACTIVE_REACT = React;
globalThis.useStateBSC = (init) => ACTIVE_REACT.useState(init);
globalThis._bsScrollTopOnMount = () => {};
globalThis.BSEyebrow = ({ children }) => React.createElement('div', null, children);
globalThis.BSPage = ({ children }) => React.createElement('div', null, children);
globalThis.BSPageHeader = () => null;
globalThis.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);

const CTX = { cells: [], idx: 0 };
const SHIM = {
  ...React,
  useState(init) {
    const i = CTX.idx++;
    if (!(i in CTX.cells)) CTX.cells[i] = (typeof init === 'function' ? init() : init);
    return [CTX.cells[i], (next) => { CTX.cells[i] = (typeof next === 'function' ? next(CTX.cells[i]) : next); }];
  },
  useRef(init) {
    const i = CTX.idx++;
    if (!(i in CTX.cells)) CTX.cells[i] = { current: init };
    return CTX.cells[i];
  },
  useEffect() {}, useLayoutEffect() {}, useInsertionEffect() {},
  useMemo(fn) { return fn(); },
  useCallback(fn) { return fn; },
  useId() { return 'test-id'; },
};
ACTIVE_REACT = SHIM;

async function loadModule(reactImpl) {
  const dir = dirname(SRC);
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { BSPrepCook, BSCookMode };\n`;
  const { code } = babel.transformSync(source, {
    presets: [presetReact], plugins: [commonjs], babelrc: false, configFile: false, filename: SRC,
  });
  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const registry = new Map([['react', reactImpl], ['react-dom', { createPortal: (n) => n }]]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    registry.set(spec, await import(pathToFileURL(join(dir, spec)).href));
  }
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)((s) => {
    if (!registry.has(s)) throw new Error(`unmapped import: ${s}`);
    return registry.get(s);
  }, mod, mod.exports);
  return mod.exports;
}

const MOD = await loadModule(SHIM);
const ORCH = await import(pathToFileURL(join(dirname(SRC), '..', 'services', 'cookOrchestrator.mjs')).href);
const { bsOrchestrate, BS_COOK_MODE, BS_ORCH } = ORCH;
const { SHAPE_KITCHEN_RECIPES } = await import(pathToFileURL(join(dirname(SRC), 'shapeKitchenData.js')).href);
const { bsCookableFromRecipe } = await import(pathToFileURL(join(dirname(SRC), '..', 'services', 'cookable.mjs')).href);

function flatten(node, out = []) {
  if (node == null || node === false) return out;
  if (Array.isArray(node)) { for (const n of node) flatten(n, out); return out; }
  if (typeof node === 'object' && node.props) { out.push(node); flatten(node.props.children, out); }
  return out;
}
const textOf = (node) => {
  const parts = [];
  (function rec(n) {
    if (n == null || n === false) return;
    if (typeof n === 'string' || typeof n === 'number') { parts.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(rec); return; }
    if (typeof n === 'object' && n.props) rec(n.props.children);
  })(node.props ? node.props.children : node);
  return parts.join('');
};
function drive(Component, props) {
  CTX.cells.length = 0;
  let tree;
  const renderOnce = () => { CTX.idx = 0; tree = Component(props); return tree; };
  renderOnce();
  const nodes = () => flatten(tree);
  const api = {
    nodes,
    get text() { return textOf({ props: { children: tree } }); },
    buttons: () => nodes().filter((n) => n.type === 'button').map((n) => ({ label: textOf(n).trim(), disabled: !!n.props.disabled })),
    click(label) {
      const btn = nodes().find((n) => n.type === 'button' && n.props.onClick && textOf(n).trim().startsWith(label));
      if (!btn) throw new Error(`no button starting ${JSON.stringify(label)} (have: ${api.buttons().map((b) => JSON.stringify(b.label)).join(', ')})`);
      btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
      renderOnce();
      return api;
    },
  };
  return api;
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
  const i = src.indexOf('<BSPrepCook');
  assert.ok(i > 0, 'BSPrepCook is never mounted — the interleaved board would not render at all');
  const open = src.slice(i, src.indexOf('/>', i) > 0 ? src.indexOf('>', i) + 1 : i + 400);
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
