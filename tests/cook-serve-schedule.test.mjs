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
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { BSPrepCook };\n`;
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
const { bsOrchestrate, BS_COOK_MODE } = ORCH;

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
