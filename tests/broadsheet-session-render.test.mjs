// MOUNT the client session player — the same crash class broadsheet-render
// covers for the coach file, applied to BSSession in iosAppBroadsheetClient.
//
// WHY: BSSession carries the post-session RPE prompt (SPEC-guardrails.md §3.1),
// and its own source warns that a const read by an effect's dependency array
// during render is a TDZ ReferenceError that parse, tsc, the tests and the Vite
// build ALL pass. Adding state and a conditional block to this component is
// exactly the change that shipped #1781. Nothing else in the pipeline RUNS it.
//
// Same technique as tests/broadsheet-render.test.mjs: compile the real file in
// memory, resolve its imports to the real modules, mount with ReactDOMServer.
// No source file is written, copied, or stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
// The SAME constant the component imports — asserting against a literal here
// would let the two drift apart while both sides stayed green.
import { BS_SESSION_MINUTES_CEILING, bsClassifySession, bsDurationFacts } from '../public/newdesign/progressionGuardrail.mjs';

const require_ = createRequire(import.meta.url);
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const commonjs = require_('next/dist/compiled/babel/plugin-transform-modules-commonjs');
const React = require_('react');
const ReactDOMServer = require_('react-dom/server');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');

// The theme is a TOTAL map, not an enumerated one. BSSession reads a long tail
// of token names and this test exists to catch render crashes in the component,
// not to pin the palette — an incomplete stub would fail for a reason that has
// nothing to do with the code under test. Unknown tokens resolve to a harmless
// string so template literals stay well-formed; the few tokens with real
// semantics (spacing, light/dark) are given honestly.
const THEME_KNOWN = {
  MONO: 'mono', DISPLAY: 'display', PAPER: '#fff', PAPER2: '#eee', INK: '#111',
  INK50: '#777', INK70: '#555', RULE: '#ccc', ACCENT: '#0f766e', GREEN: '#2f7d32',
  AMBER: '#b26a00', RUST: '#9a3b1b', TEAL: '#0f766e', padX: 18, isLight: true,
};
const THEME = new Proxy(THEME_KNOWN, {
  get: (target, key) => (key in target ? target[key] : '#000'),
  has: () => true,
});

// The broadsheet reads its theme, shared chrome and state helper off `window`
// (the house Object.assign(window, …) pattern). Stub ONLY those — everything
// inside BSSession is the shipping component.
globalThis.window = globalThis;
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };
globalThis.useBS = () => THEME;
// Driving (below) swaps React for a shim, and `useStateBSC` must follow it or
// the component would mix two hook implementations mid-render.
let ACTIVE_REACT = React;
globalThis.useStateBSC = (init) => ACTIVE_REACT.useState(init);
globalThis._bsScrollTopOnMount = () => {};
globalThis.BSEyebrow = ({ children }) => React.createElement('div', null, children);
globalThis.BSPage = ({ children }) => React.createElement('div', null, children);
globalThis.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);

async function loadModule(reactImpl = React) {
  const dir = dirname(SRC);
  // Substitute ALL of `import.meta`, not just `import.meta.env`: this file also
  // probes a bare `typeof import.meta !== 'undefined'`, which is a hard
  // SyntaxError inside a CJS function body. One replacement covers both forms.
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { BSSession };\n`;
  const { code } = babel.transformSync(source, {
    presets: [presetReact],
    plugins: [commonjs],
    babelrc: false,
    configFile: false,
    filename: SRC,
  });

  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const registry = new Map([
    ['react', reactImpl],
    ['react-dom', { createPortal: (n) => n }],
  ]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    registry.set(spec, await import(pathToFileURL(join(dir, spec)).href));
  }

  const mod = { exports: {} };
  const req = (spec) => {
    if (!registry.has(spec)) throw new Error(`unmapped import: ${spec}`);
    return registry.get(spec);
  };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  return mod.exports;
}

const MOD = await loadModule();

// Render warnings are failures: "Rendered more hooks than during the previous
// render" and "Cannot update during render" arrive here rather than as throws.
function render(el) {
  const warnings = [];
  const realError = console.error;
  console.error = (...a) => warnings.push(a.join(' '));
  try {
    return { html: ReactDOMServer.renderToStaticMarkup(el), warnings };
  } finally {
    console.error = realError;
  }
}

const session = (props) => React.createElement(MOD.BSSession, {
  moves: [{ m: 'Back squat', s: '5', l: '225 lb', reps: '5', rpe: '8', sets: 3 }],
  onBack: () => {},
  ...props,
});

test('the session player mounts, and the effort prompt is NOT on the first paint', () => {
  const { html, warnings } = render(session({}));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  // A fresh session has an active set, so the primary CTA is `Start set 1`; the
  // finish action only appears once the last set is logged (driven below).
  assert.match(html, /Start set 1/);
  assert.match(html, /End workout early/);
  // ⚠ THE WHOLE POINT OF THE COMPLETION STEP. The rating used to sit inline
  // below the finish button, where a member who followed the primary CTA saved
  // and left without ever seeing it — so nearly every session stored a NULL
  // rating and no client could reach the `measured` regime. It now lives behind
  // the finish action. If it reappears here, that regression is back.
  assert.doesNotMatch(html, /aria-label="Effort 1 of 10"/);
  assert.doesNotMatch(html, /How hard was that\?/);
});

test('an open session (no moves handed in) still mounts', () => {
  // openMode seeds a blank move; it exercises a different initial-state path
  // through the same hooks, which is where a hook-order divergence surfaces.
  const { html, warnings } = render(session({ moves: [] }));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  assert.match(html, /End workout early/);
  assert.doesNotMatch(html, /How hard was that\?/);
});

// ── Driving the component, not just rendering it ────────────────────────────
//
// Everything above renders markup once, which cannot reach the completion
// screen at all — it is behind a click. And the properties that matter most
// here are all about what the SAVE receives, which no amount of first-paint
// markup can show: an adversarial pass on the sibling file proved exactly this
// class of hole stays green.
//
// There is no react-test-renderer or jsdom in this repo, so the component is
// driven directly: `react` resolves to a shim whose useState/useRef keep state
// in an array, letting the function component be called, its returned element
// tree walked, a handler invoked, and the component re-called.
function makeReactShim() {
  const ctx = { cells: [], idx: 0 };
  const shim = {
    ...React,
    useState(init) {
      const i = ctx.idx++;
      if (!(i in ctx.cells)) ctx.cells[i] = (typeof init === 'function' ? init() : init);
      return [ctx.cells[i], (next) => { ctx.cells[i] = (typeof next === 'function' ? next(ctx.cells[i]) : next); }];
    },
    useRef(init) {
      const i = ctx.idx++;
      if (!(i in ctx.cells)) ctx.cells[i] = { current: init };
      return ctx.cells[i];
    },
    // Effects stay no-ops. Running them for real hangs the runner: BSSession's
    // mount effects start wall-clock timers and reach for browser APIs that a
    // fake environment cannot honestly stand in for. ⚠ THE GAP THIS LEAVES is
    // the unmount cleanup — see the note under the drive tests.
    useEffect() {},
    useLayoutEffect() {},
    useInsertionEffect() {},
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
    useId() { return 'test-id'; },
  };
  return { shim, ctx };
}

const { shim: SHIM, ctx: CTX } = makeReactShim();
const SHIM_MOD = await loadModule(SHIM);

function flatten(node, out = []) {
  if (node == null || node === false) return out;
  if (Array.isArray(node)) { for (const n of node) flatten(n, out); return out; }
  if (typeof node === 'object' && node.props) {
    out.push(node);
    flatten(node.props.children, out);
  }
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

// Everything the save path touches, captured rather than stubbed away, so the
// assertions are about the real payload the component hands over.
function harness({ elapsedMinutes = 0 } = {}) {
  const saved = [];
  const events = [];
  const backs = [];
  globalThis.ShapeWorkoutLogs = { saveSessionLog: async (payload) => { saved.push(payload); } };
  globalThis.ShapeAnalytics = { track: (event, props) => { events.push({ event, props }); } };
  globalThis.__bsToast = () => {};
  globalThis.ShapeLiveProgress = { clear: () => {}, push: () => {} };
  globalThis.ShapeAuth = { getCachedState: () => ({ user: null }) };

  CTX.cells.length = 0;
  const props = {
    moves: [{ m: 'Back squat', s: '5', l: '225 lb', reps: '5', rpe: '8', sets: 3 }],
    onBack: () => { backs.push(true); },
  };
  let tree;
  const renderOnce = () => { CTX.idx = 0; tree = SHIM_MOD.BSSession(props); return tree; };

  // `now` and `elapsedStart` are BOTH eager `useStateBSC(Date.now())` reads, in
  // that order, and the shim keeps only the first render's values (the ticking
  // effect is a no-op here). Pushing the SECOND call into the past makes
  // elapsed = now - start a positive, controllable duration. Staging both
  // backwards instead yields a NEGATIVE elapsed, which sails past the ceiling
  // test while proving nothing.
  const realNow = Date.now;
  let call = 0;
  try {
    Date.now = () => (++call === 2 ? realNow() - elapsedMinutes * 60 * 1000 : realNow());
    renderOnce();
  } finally {
    Date.now = realNow;
  }

  const nodes = () => flatten(tree);
  const api = {
    get html() { return nodes().map(textOf).join(' '); },
    nodes,
    async click(label) {
      const btn = nodes().find((n) => n.type === 'button' && n.props.onClick && textOf(n).trim() === label);
      if (!btn) throw new Error(`no button labelled ${JSON.stringify(label)} (have: ${nodes().filter((n) => n.type === 'button').map((n) => JSON.stringify(textOf(n).trim())).join(', ')})`);
      await btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
      renderOnce();
      return api;
    },
    async clickAria(label) {
      const btn = nodes().find((n) => n.type === 'button' && n.props['aria-label'] === label);
      if (!btn) throw new Error(`no button with aria-label ${JSON.stringify(label)}`);
      await btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
      renderOnce();
      return api;
    },
    hasAria: (label) => nodes().some((n) => n.props && n.props['aria-label'] === label),
    // Type into the duration field (matched by its accessible label, not an
    // index — the completion screen holds exactly one input, but an index would
    // silently follow any future one).
    type(label, value) {
      const el = nodes().find((n) => n.type === 'input' && n.props['aria-label'] === label);
      if (!el) throw new Error(`no input with aria-label ${JSON.stringify(label)}`);
      el.props.onChange({ target: { value } });
      renderOnce();
      return api;
    },
    valueOf(label) {
      const el = nodes().find((n) => n.type === 'input' && n.props['aria-label'] === label);
      return el ? el.props.value : undefined;
    },
    // Walk the real session to its end: the primary CTA cycles
    // Start set → Log set per set, and only becomes `Finish workout ✓` once the
    // last set of the last move is logged. Driving it this way (rather than
    // forcing state) is what proves the finish button is reachable at all.
    async completeAllSets() {
      for (let guard = 0; guard < 40; guard += 1) {
        const btn = nodes().find((n) => n.type === 'button' && n.props.onClick && /^(Start set|Log set)/.test(textOf(n).trim()));
        if (!btn) return api;
        await btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
        renderOnce();
      }
      throw new Error('never ran out of sets to log');
    },
    saved,
    events,
    backs,
  };
  return api;
}

test('drive: the finish CTA opens the completion step instead of saving blind', async () => {
  const h = harness();
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  // The prompt the member must actually see.
  assert.match(h.html, /How hard was that\?/);
  assert.equal(h.hasAria('Effort 1 of 10'), true);
  assert.equal(h.hasAria('Effort 10 of 10'), true);
  // ...and nothing has been written or navigated yet: the finish button is now
  // a door, not a save.
  assert.equal(h.saved.length, 0);
  assert.equal(h.backs.length, 0);
  // Skipping stays possible but is never INVITED — an explicit affordance would
  // make it a labelled peer of the save.
  assert.doesNotMatch(h.html, /Skip rating/i);
});

test('drive: saving persists BOTH the rating and the duration confirmation', async () => {
  const h = harness({ elapsedMinutes: 175 }); // past the 150-minute ceiling
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  await h.clickAria('Effort 8 of 10');
  await h.click('Save & finish ✓');

  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].sessionRpe, 8);
  // ⚠ THE FLAG THE CORE ACTUALLY READS. An overrun is excluded unless a human
  // vouched for it, so without this a genuinely long, genuinely confirmed
  // session is discarded forever — indistinguishable from a screen left open.
  assert.equal(h.saved[0].durationAnswer, 'confirmed');
  assert.equal(h.backs.length, 1, 'saving also leaves the player');
});

test('drive: backing out STILL saves the workout, with a null rating', async () => {
  const h = harness();
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  await h.click('← Back');

  // The rating is optional; the workout log is not. Losing an irreplaceable
  // session over one skipped field is a far worse failure than an unrated
  // session, which the core already excludes honestly.
  assert.equal(h.saved.length, 1, 'the workout must persist even when dismissed');
  assert.equal(h.saved[0].sessionRpe, null);
  // Backing out is the OPPOSITE of confirming a duration.
  assert.equal(h.saved[0].durationAnswer, 'declined');
  assert.equal(h.backs.length, 1);
});

test('drive: the save runs at most once across every exit path', async () => {
  const h = harness();
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  await h.clickAria('Effort 5 of 10');
  await h.click('Save & finish ✓');
  // A double-tap, or a save racing the unmount cleanup, must not write twice —
  // that would post the session to the feed twice and double any award.
  await h.click('← Back').catch(() => {});
  assert.equal(h.saved.length, 1);
});

test('drive: skip-rate telemetry fires exactly once on BOTH exits', async () => {
  const rated = harness();
  await rated.completeAllSets();
  await rated.click('Finish workout ✓');
  await rated.clickAria('Effort 7 of 10');
  await rated.click('Save & finish ✓');
  const a = rated.events.filter((e) => e.event === 'session_rpe_prompted');
  assert.equal(a.length, 1);
  assert.equal(a[0].props.rated, true);

  const skipped = harness();
  await skipped.completeAllSets();
  await skipped.click('Finish workout ✓');
  await skipped.click('← Back');
  const b = skipped.events.filter((e) => e.event === 'session_rpe_prompted');
  // Both exits must land in the denominator, or the skip rate — the only read
  // we have on whether the prompt works — is measuring the wrong population.
  assert.equal(b.length, 1);
  assert.equal(b[0].props.rated, false);
});

test('drive: the duration question is asked only when the timer is not credible', async () => {
  // A normal-length session: the timer is plainly believable, so asking would
  // be noise on the one screen that has to stay fast.
  const normal = harness({ elapsedMinutes: 45 });
  await normal.completeAllSets();
  await normal.click('Finish workout ✓');
  assert.equal(normal.hasAria('Session length in minutes'), false);
  assert.doesNotMatch(normal.html, /How long/);

  // Too long — someone finished hours after they stopped. Pre-filled with the
  // timer's own figure: confirming is the common answer, correcting is an edit.
  const long = harness({ elapsedMinutes: 175 });
  await long.completeAllSets();
  await long.click('Finish workout ✓');
  assert.equal(long.hasAria('Session length in minutes'), true);
  assert.match(long.html, /How long, really\?/);
  assert.match(long.html, /fix it if you finished earlier/);

  // Too short — the timer plainly never ran, and there is no credible figure to
  // offer, so the field starts empty.
  const short = harness({ elapsedMinutes: 0 });
  await short.completeAllSets();
  await short.click('Finish workout ✓');
  assert.equal(short.hasAria('Session length in minutes'), true);
  assert.match(short.html, /timer didn’t run/);
});

test('drive: nothing is pre-selected — a skipped rating must stay skipped', async () => {
  const h = harness();
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  const pressed = h.nodes().filter((n) => n.props && n.props['aria-pressed'] === true);
  // A default selection would turn "skipped" into a fabricated rating for every
  // member who never touches the control — the one outcome §3.1 forbids.
  assert.equal(pressed.length, 0);
});

// ⚠ ALSO NOT COVERED: the LATCHED completion clock. `elapsedSec` is frozen when
// the completion screen opens, so the question cannot change under a member
// mid-answer — a 40-second timer that crosses 60s while they type would
// otherwise hide the field and store their typed figure as one nobody was asked
// for. Time cannot pass in this harness (effects are no-ops, so `now` never
// ticks), which means a perturbation removing the latch survives here. Verify on
// device: start a session, finish under a minute, type a duration, wait past the
// minute mark, save — the field must not vanish and the answer must be recorded.
//
// ⚠ NOT COVERED HERE: the unmount cleanup — the guarantee that a session
// survives an exit we do not control (hardware back, a route change, the shell
// tearing the player down). Driving it needs the real mount effects to run,
// which hangs this runner: BSSession starts wall-clock timers on mount and
// reaches for browser APIs a fake environment cannot honestly stand in for.
//
// The trap it hides is real and was caught by review, not by a test: a
// `[]`-dep cleanup captures the FIRST render's finishSession, whose closure
// holds sessionRpe = null, an EMPTY setLogs and ~0 elapsed — so it would save
// a junk zero-duration session instead of the workout that was done. The fix
// is the `finishRef` indirection in the component, commented there. Verify on
// device: start a session, reach the completion screen, then hardware-back out
// and confirm the saved session carries its real sets and duration.

// ── The duration answer must be a real answer ───────────────────────────────
//
// `durationConfirmed` is what lets the core admit an OVERRUN into a baseline,
// so asserting it is vouching in the member's name. The input advertises
// min 1 / max 600, but HTML bounds are not enforced on submit — and
// `Number('')` is 0, not NaN, so a cleared field slips through a naive `> 0`.
const MIN = 'Session length in minutes';

test('drive: the prompt asks at exactly the ceiling the core excludes at', async () => {
  // The screen must ask at the SAME load the core refuses to admit unconfirmed.
  // A local copy of 150 that drifted from the core's would leave the prompt
  // asking at one threshold while the guardrail excluded at another — silently,
  // because neither side would error. The constant is imported for this reason;
  // these two cases pin the behaviour either side of it.
  // Derived from the imported constant, never a literal — a retune must move
  // these with it rather than leave two numbers to disagree.
  const at = async (minutes) => {
    const h = harness({ elapsedMinutes: minutes });
    await h.completeAllSets();
    await h.click('Finish workout ✓');
    return h.hasAria(MIN);
  };
  assert.equal(await at(BS_SESSION_MINUTES_CEILING - 1), false, 'under the ceiling: the timer stands');
  // The boundary is EXCLUSIVE — `> ceiling`, not `>=`. Without this case a `>=`
  // implementation passes both neighbours while wrongly nagging at exactly 150.
  assert.equal(await at(BS_SESSION_MINUTES_CEILING), false, 'AT the ceiling is still credible');
  assert.equal(await at(BS_SESSION_MINUTES_CEILING + 1), true, 'past it: the member is asked');
});

test('drive: a runaway timer offers no figure to tap through', async () => {
  // A timer left running overnight. Pre-filling it would let ONE tap confirm a
  // 700-minute "session" — thousands of AU from a single row, straight into the
  // baseline. Past the field's own maximum there is no credible figure to offer.
  const h = harness({ elapsedMinutes: 700 });
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  assert.equal(h.hasAria(MIN), true, 'still asked');
  assert.equal(h.valueOf(MIN), '', 'but NOTHING is pre-filled');
  assert.match(h.html, /longer than a session can be/);

  await h.click('Save & finish ✓'); // tapping straight through
  assert.equal(h.saved.length, 1, 'the workout still persists in full');
  assert.equal(h.saved[0].durationSeconds, 700 * 60, 'with the timer’s own reading');
  // ...but nobody vouched for it, so the core excludes it from the baseline.
  assert.equal(h.saved[0].durationAnswer, 'declined');
});

test('drive: clearing an overrun field does NOT confirm the wall-clock figure', async () => {
  const h = harness({ elapsedMinutes: 175 });
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  assert.equal(h.valueOf(MIN), '175', 'pre-filled with the timer’s own figure');
  h.type(MIN, ''); // the member deletes it — the opposite of confirming
  assert.match(h.html, /won’t count toward your limits/);
  await h.click('Save & finish ✓');

  // The workout still persists in full...
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].durationSeconds, 175 * 60);
  // ...but nobody vouched for that number, so the core will exclude it rather
  // than let a screen left open inflate the baseline.
  assert.equal(h.saved[0].durationAnswer, 'declined');
});

test('drive: an out-of-range duration is neither logged nor confirmed', async () => {
  const h = harness({ elapsedMinutes: 175 });
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  h.type(MIN, '9999'); // past the input's own max — 166 hours
  await h.click('Save & finish ✓');

  assert.equal(h.saved.length, 1);
  assert.notEqual(h.saved[0].durationSeconds, 9999 * 60, 'a nonsense figure must never be logged');
  assert.equal(h.saved[0].durationSeconds, 175 * 60, 'falls back to the timer');
  assert.equal(h.saved[0].durationAnswer, 'declined');
});

test('drive: the prefill gate and the log read the SAME quantity', async () => {
  // ⚠ FRACTIONAL ON PURPOSE. Whole-minute fixtures cannot tell a rounded
  // comparison from an unrounded one, so a gate testing `Math.round(minutes)`
  // while the save stores raw seconds passes every other test here. At 600.3 min
  // the rounded view says 600 (offer the prefill) and the true view says 36018s
  // (past the maximum) — the band where one tap would confirm a figure the core
  // will not admit.
  const past = harness({ elapsedMinutes: 600.3 });
  await past.completeAllSets();
  await past.click('Finish workout ✓');
  assert.equal(past.valueOf(MIN), '', 'nothing offered past the maximum');
  await past.click('Save & finish ✓');
  assert.equal(past.saved[0].durationAnswer, 'declined', 'and tapping through confirms nothing');

  // And where a prefill IS offered, the figure stored must be the figure SHOWN —
  // not one that merely rounds to it. "A human affirmed this" has to mean the
  // number they actually saw.
  const inside = harness({ elapsedMinutes: 200.4 });
  await inside.completeAllSets();
  await inside.click('Finish workout ✓');
  assert.equal(inside.valueOf(MIN), '200', 'offered whole minutes');
  await inside.click('Save & finish ✓');
  assert.equal(inside.saved[0].durationAnswer, 'confirmed');
  assert.equal(inside.saved[0].durationSeconds, 200 * 60,
    'stores the affirmed figure, not the 24 extra seconds behind it');
});

test('drive: a valid typed duration IS used and IS confirmed', async () => {
  const h = harness({ elapsedMinutes: 175 });
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  h.type(MIN, '95'); // "I actually finished after 95 minutes"
  await h.click('Save & finish ✓');

  assert.equal(h.saved[0].durationSeconds, 95 * 60, 'the member’s answer wins');
  assert.equal(h.saved[0].durationAnswer, 'confirmed');
});

test('drive: accepting the pre-filled overrun untouched counts as the answer', async () => {
  const h = harness({ elapsedMinutes: 175 });
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  await h.click('Save & finish ✓'); // never touched the field

  // The field is pre-filled at this end precisely because confirming is the
  // common case and correcting is the edit, so saving as-offered IS a decision.
  assert.equal(h.saved[0].durationSeconds, 175 * 60);
  assert.equal(h.saved[0].durationAnswer, 'confirmed');
  assert.doesNotMatch(h.html, /won’t count toward your limits/);
});

test('drive: an under-a-minute timer is never recorded as confirmed', async () => {
  const h = harness({ elapsedMinutes: 0 });
  await h.completeAllSets();
  await h.click('Finish workout ✓');
  assert.equal(h.valueOf(MIN), '', 'no credible figure is offered at this end');
  await h.click('Save & finish ✓');

  assert.equal(h.saved.length, 1);
  // Nothing was offered and nothing was typed, so nothing was confirmed.
  assert.equal(h.saved[0].durationAnswer, 'declined');
});

test('drive: what the writer SAVES is a valid input to the reader', async () => {
  // ⚠ THE SEAM. This file drives the writer and progression-guardrail.test.mjs
  // drives the reader, so each can be green while the pair they exchange is
  // incoherent — a perturbation that made the client always report
  // `durationPrompted: true` survived every other test here, and would only have
  // surfaced in production as a whole history reading `malformed`.
  //
  // Feed the ACTUAL saved payload through the ACTUAL classifier instead.
  const scenarios = [
    ['not asked at all', 45, 'not_prompted'],
    ['asked and answered', 175, 'confirmed'],
    ['asked and declined', 175, 'declined'],
    // ⚠ 700, NOT 500. The seam defect this test exists to catch only appears
    // past the core's maximum — a fixture that stops short of it cannot fail on
    // the very bug the test is named for.
    ['a runaway timer, tapped through', 700, 'declined'],
    ['just past the maximum, by rounding', 601, 'declined'],
  ];
  for (const [label, minutes, expected] of scenarios) {
    const h = harness({ elapsedMinutes: minutes });
    await h.completeAllSets();
    await h.click('Finish workout ✓');
    if (expected === 'declined') h.type(MIN, '');
    await h.click('Save & finish ✓');

    const saved = h.saved[0];
    assert.ok(saved, `${label}: saved`);
    const c = bsClassifySession({
      // The two fields the RPC supplies; everything else is the writer's own.
      startedAtISO: '2026-07-29T02:30:00Z',
      timezone: 'America/New_York',
      durationSec: saved.durationSeconds,
      sessionRpe: saved.sessionRpe,
      // The writer emits ONE fact; `bsDurationFacts` derives the coherent pair,
      // exactly as `saveStructuredWorkoutSession` does before it persists. The
      // chain is client → backend → core, so the test walks all three links
      // rather than handing the core something no layer actually writes.
      ...bsDurationFacts(saved.durationAnswer),
    }, 0);
    assert.equal(c.malformed, false,
      `${label}: the writer must never emit a row the reader calls malformed — ${JSON.stringify(c.issues)}`);
    assert.equal(saved.durationAnswer, expected, label);
    // And the pair the writer emits must agree with itself.
    assert.equal(bsDurationFacts(saved.durationAnswer).durationPrompted, saved.durationAnswer !== 'not_prompted', `${label}: coherent pair`);
  }
});

test('drive: ending early routes to the same completion step', async () => {
  const h = harness({ elapsedMinutes: 20 });
  await h.click('End workout early');
  assert.match(h.html, /How hard was that\?/);
  assert.equal(h.saved.length, 0, 'ending early asks before it writes');
});
