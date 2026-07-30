// MOUNT the broadsheet components — the class of bug nothing else in the
// pipeline catches.
//
// WHY THIS FILE EXISTS: a TDZ reference, a conditionally-called hook, or a
// crash inside a render body is valid syntax, typechecks, builds, and passes
// every pure-logic test — because none of those things RUN the component. One
// shipped this way (#1781). broadsheet-identifiers.test.mjs catches names that
// were never declared; this catches names that exist but are read before they
// are initialized, hooks called in a different order between renders, and any
// exception thrown while producing markup.
//
// The module is compiled in memory (JSX → CJS) with its relative imports served
// from a registry of the REAL modules, so what mounts here is the shipping code
// — no source file is written, copied, or stubbed out.
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
const ReactDOMServer = require_('react-dom/server');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetPros.jsx');

// The broadsheet reads i18n + auth off `window`. Give it the same globals the
// app does, minimally: a translator that resolves defaultValue exactly like the
// real one so copy still renders, and no signed-in user (the demo-safe path).
globalThis.window = globalThis;
globalThis.ShapeI18n = undefined;
globalThis.ShapeLocale = undefined;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/' };
// The page shell comes from a sibling broadsheet module via the house
// `Object.assign(window, …)` pattern. Stub only the chrome — everything inside
// it is the real component.
globalThis.BSPage = ({ children }) => React.createElement('div', { 'data-bspage': true }, children);
globalThis.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);
// `useBS` is read off `window` at module load, so it must exist before the
// module is compiled. It resolves the theme lazily — `t` is declared below.
globalThis.useBS = () => t;
// The rest of the shared chrome, as passthroughs — everything inside them is
// the real component. Without these a chrome global resolves to `undefined`
// and React reports "Element type is invalid", masking real render faults.
for (const name of ['BSMasthead', 'BSPageHeader', 'BSBackButton', 'BSAvatar', 'BSFacetAvatar', 'BSEyebrow', 'BSSection', 'BSPlate', 'BSSlab', 'BSCell', 'BSTag', 'BSRow', 'BSHeadlineNumber', 'BSHalftone']) {
  globalThis[name] = ({ children }) => React.createElement('div', { 'data-chrome': name }, children);
}

async function loadModule(reactImpl = React) {
  const dir = dirname(SRC);
  // The component under test is module-local. Exporting it is the only edit,
  // and it is made to the in-memory copy — the shipping file is untouched.
  // `import.meta.env` is Vite's, injected at build; substitute it the same way
  // the bundler does so asset URLs resolve instead of being a syntax error in a
  // CJS function body.
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta\.env/g, '__VITE_ENV__')}\nexport { BSCoachDraftEditor, BSProAssignPage, BSProAdjustProgram };\n`;
  const { code } = babel.transformSync(source, {
    presets: [presetReact],
    plugins: [commonjs],
    babelrc: false,
    configFile: false,
    filename: SRC,
  });

  // Resolve every import the module declares to the real module, so nothing is
  // stubbed except the browser itself.
  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const registry = new Map([
    ['react', reactImpl],
    ['react-dom', { createPortal: (n) => n }],
  ]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    const mod = await import(pathToFileURL(join(dir, spec)).href);
    registry.set(spec, mod);
  }

  const mod = { exports: {} };
  const req = (spec) => {
    if (!registry.has(spec)) throw new Error(`unmapped import: ${spec}`);
    const m = registry.get(spec);
    // Interop: the compiled CJS reads `.default` for default imports.
    return m;
  };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  return mod.exports;
}

const MOD = await loadModule();

// Render warnings are failures here: "Rendered more hooks than during the
// previous render" and "Cannot update during render" both arrive this way
// rather than as thrown errors.
function render(el) {
  const warnings = [];
  const realError = console.error;
  console.error = (...a) => warnings.push(a.join(' '));
  try {
    const html = ReactDOMServer.renderToStaticMarkup(el);
    return { html, warnings };
  } finally {
    console.error = realError;
  }
}

const t = {
  MONO: 'mono', DISPLAY: 'display', PAPER: '#fff', PAPER2: '#eee', INK: '#111',
  INK50: '#777', INK70: '#555', RULE: '#ccc', padX: 18, isLight: true,
  BODY: 'body', AMBER: '#d8b25a', RUST: '#c0533b',
};
const editor = (props) => React.createElement(MOD.BSCoachDraftEditor, {
  t, accent: '#c8a24a', typeName: 'meal plan', blockLabel: 'MEALS',
  initialName: 'Lean Cut', initialBlocks: [{ id: 'b1', text: 'Breakfast — Oats · 500 kcal' }],
  initialNote: '', initialMedia: [], onPublish: async () => {}, onCancel: () => {},
  ...props,
});

test('the draft editor mounts with per-day authoring OFF (every legacy flow)', () => {
  const { html, warnings } = render(editor({}));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  assert.match(html, /Breakfast/);
  // The day strip must not appear on trainer drafts or nutrition `program`
  // arcs — those blocks are week phases, not menus.
  assert.doesNotMatch(html, /DEFAULT/);
  assert.doesNotMatch(html, /MON/);
});

test('the draft editor mounts with per-day authoring ON, defaulting to DEFAULT', () => {
  const { html, warnings } = render(editor({ perDayAuthoring: true, stepAuthoring: true }));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  assert.match(html, /DEFAULT/);
  assert.match(html, /MON/);
  assert.match(html, /SUN/);
  // DEFAULT tab still edits the flat list, so the existing menu renders.
  assert.match(html, /Breakfast/);
});

test('a plan that already carries `days` mounts and marks the authored days', () => {
  const { html, warnings } = render(editor({
    perDayAuthoring: true,
    initialDays: [
      { dow: 2, blocks: [{ id: 'w1', text: 'Lunch — Salmon · 610 kcal' }] },
      { dow: 0, blocks: [] },
    ],
  }));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  // Both authored days carry the marker, including the deliberately EMPTY one —
  // an emptied day is authored, and losing that marker is how it silently
  // reverts to the default menu.
  assert.equal((html.match(/·<\/button>/g) || []).length, 2);
});

test('malformed stored `days` neither throws nor renders a day it cannot place', () => {
  const { html, warnings } = render(editor({
    perDayAuthoring: true,
    initialDays: [{ dow: 99 }, { dow: '1', blocks: [] }, null, { dow: 3, blocks: [{ id: 'x', text: 'Dinner' }] }],
  }));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  // Only the one valid entry survives canonicalization.
  assert.equal((html.match(/·<\/button>/g) || []).length, 1);
});

// ── Driving the component, not just rendering it ────────────────────────────
//
// Everything above renders markup once. That is not enough for this feature:
// an adversarial pass showed that deleting `days` from the publish payload, or
// changing the sparse-array lookup from find-by-dow to index-by-position, left
// the whole suite green — precisely the failure modes this feature is built
// around, because none of them change the FIRST paint.
//
// There is no react-test-renderer or jsdom in this repo, so the component is
// driven directly: `react` resolves to a shim whose useState/useRef keep state
// in an array, letting the function component be called, its returned element
// tree walked, a handler invoked, and the component re-called. It is a small
// renderer, and it is enough to press a tab and a publish button.
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
    useEffect() {},
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
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

function drive(props) {
  CTX.cells.length = 0;
  let tree;
  const render = () => { CTX.idx = 0; tree = SHIM_MOD.BSCoachDraftEditor(props); return tree; };
  render();
  const nodes = () => flatten(tree);
  const api = {
    get tree() { return tree; },
    nodes,
    find: (pred) => nodes().find(pred),
    // Buttons are matched on their rendered text, the way a coach finds them.
    click(label) {
      const btn = nodes().find((n) => n.type === 'button' && n.props.onClick && textOf(n).trim().replace(/\s*·$/, '') === label);
      if (!btn) throw new Error(`no button labelled ${JSON.stringify(label)} (have: ${nodes().filter((n) => n.type === 'button').map((n) => JSON.stringify(textOf(n).trim())).join(', ')})`);
      btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
      render();
      return api;
    },
    // Click by accessible label (the × buttons carry no text).
    clickAria(label, nth = 0) {
      const btns = nodes().filter((n) => n.type === 'button' && n.props['aria-label'] === label);
      const btn = btns[nth];
      if (!btn) throw new Error(`no button with aria-label ${JSON.stringify(label)} at ${nth} (found ${btns.length})`);
      btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
      render();
      return api;
    },
    // Retype the input that currently holds `was`. Matching on the visible value
    // rather than an index, because index 0 is the NAME field — a block list and
    // a name box are both plain inputs, and that confusion silently made an
    // earlier version of this test edit the plan's title and still pass.
    retype(was, value) {
      const el = nodes().find((n) => n.type === 'input' && n.props.onChange && n.props.value === was);
      if (!el) throw new Error(`no input currently holding ${JSON.stringify(was)}`);
      el.props.onChange({ target: { value } });
      render();
      return api;
    },
    async publish() {
      const btn = nodes().find((n) => n.type === 'button' && /Publish|Publishing/.test(textOf(n)));
      if (!btn) throw new Error('no publish button');
      await btn.props.onClick({});
      render();
      return api;
    },
  };
  return api;
}

const baseProps = (over = {}) => {
  const published = [];
  return {
    published,
    props: {
      t, accent: '#c8a24a', typeName: 'meal plan', blockLabel: 'MEALS',
      initialName: 'Lean Cut', initialNote: '', initialMedia: [],
      initialBlocks: [{ id: 'b1', text: 'Breakfast — Oats · 500 kcal' }],
      perDayAuthoring: true,
      onPublish: async (payload) => { published.push(payload); },
      onCancel: () => {},
      ...over,
    },
  };
};

test('drive: authoring a day carries `days` through onPublish', async () => {
  const { published, props } = baseProps();
  const ed = drive(props);
  ed.click('MON').click('GIVE THIS DAY ITS OWN MENU');
  ed.retype('Breakfast — Oats · 500 kcal', 'Breakfast — Eggs · 400 kcal');
  await ed.publish();

  assert.equal(published.length, 1);
  const p = published[0];
  // The payload the whole feature depends on. Deleting the key here is the
  // failure the contract calls "where the feature can silently die": the editor
  // still looks right, the plan reloads as the legacy repeated menu, nothing
  // throws.
  assert.ok(p.days, 'publish payload must carry `days`');
  assert.deepEqual(p.days.map((d) => d.dow), [0]);
  assert.equal(p.days[0].blocks[0].text, 'Breakfast — Eggs · 400 kcal');
  // ...and the DEFAULT menu is untouched by editing a day.
  assert.equal(p.blocks[0].text, 'Breakfast — Oats · 500 kcal');
});

test('drive: a day tab edits the entry whose dow MATCHES, not the array slot', async () => {
  const { published, props } = baseProps();
  const ed = drive(props);
  // Author WED (dow 2) first, then FRI (dow 4): `days` is now [{dow:2},{dow:4}],
  // so array position and weekday have diverged.
  ed.click('WED').click('GIVE THIS DAY ITS OWN MENU').retype('Breakfast — Oats · 500 kcal', 'WED MENU');
  ed.click('FRI').click('GIVE THIS DAY ITS OWN MENU').retype('Breakfast — Oats · 500 kcal', 'FRI MENU');
  await ed.publish();

  const days = published[0].days;
  assert.deepEqual(days.map((d) => d.dow), [2, 4]);
  // Indexing by position would look for days[4] — which does not exist — and
  // drop the edit on the floor, or worse, write Friday's text onto Wednesday.
  assert.equal(days.find((d) => d.dow === 2).blocks[0].text, 'WED MENU');
  assert.equal(days.find((d) => d.dow === 4).blocks[0].text, 'FRI MENU');
});

test('drive: a day emptied on purpose publishes as an empty override', async () => {
  const { published, props } = baseProps();
  const ed = drive(props);
  ed.click('SUN').click('GIVE THIS DAY ITS OWN MENU');
  // Remove the single copied block — an explicit "nothing is served Sunday".
  ed.clickAria('Remove');
  await ed.publish();

  const sun = published[0].days.find((d) => d.dow === 6);
  assert.ok(sun, 'the emptied day is still AUTHORED');
  assert.deepEqual(sun.blocks, [], 'and it stays empty rather than reverting to the default');
});

test('drive: a draft with no per-day authoring publishes no `days` key at all', async () => {
  const { published, props } = baseProps({ perDayAuthoring: false });
  await drive(props).publish();
  assert.equal('days' in published[0], false, 'legacy payload must be byte-identical');
});

// ── The wiring that spans components ────────────────────────────────────────
//
// The two `publishDraft` receivers and the capability gate live in
// BSTrainerPrograms / BSNutriPlans, not in the editor, so driving the editor
// cannot reach them. They are still exactly where this feature dies quietly —
// a receiver that destructures `{name, blocks, note, media}` drops `days` on
// the floor and nothing errors — so they are asserted against the source, the
// way broadsheet-identifiers.test.mjs already asserts a whole-file invariant.
const SOURCE = readFileSync(SRC, 'utf8');

// Balanced-brace slice from `open` — a plain regex stops at the first `}`, and
// `detail: {…}` nests.
function balanced(src, open) {
  const i = src.indexOf(open);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i + open.length - 1; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

test('wiring: BOTH publishDraft receivers accept `days` and put it in `detail`', () => {
  const receivers = [...SOURCE.matchAll(/const publishDraft = async \(\{([^}]*)\}\) => \{/g)];
  assert.equal(receivers.length, 2, 'trainer + nutritionist');
  for (const m of receivers) assert.match(m[1], /\bdays\b/, 'the receiver must destructure `days`');

  // ...and each must actually carry it into the stored detail. Destructuring it
  // and then not using it is the same bug with one extra step.
  let rest = SOURCE;
  const details = [];
  for (;;) {
    const d = balanced(rest, 'detail: {');
    if (!d) break;
    details.push(d);
    rest = rest.slice(rest.indexOf(d) + d.length);
  }
  const withBlocks = details.filter((d) => /\bblocks\b/.test(d));
  assert.equal(withBlocks.length, 2, 'the two published-plan detail constructions');
  for (const d of withBlocks) {
    assert.match(d, /\.\.\.\(days && days\.length \? \{ days \} : \{\}\)/, `detail must carry days: ${d.slice(0, 70)}…`);
  }
});

test('wiring: perDayAuthoring is passed ONLY on the nutrition menu build types', () => {
  // Each usage is a single line in this file; JSX arrow props contain `>`, so a
  // tag-shaped regex cannot be used.
  const usages = SOURCE.split(/\r?\n/).filter((l) => l.includes('<BSCoachDraftEditor'));
  assert.equal(usages.length, 2, 'trainer + nutritionist call sites');
  const gated = usages.filter((u) => u.includes('perDayAuthoring'));
  assert.equal(gated.length, 1, 'the trainer call site must not pass it at all');
  // Never unconditional: `program` drafts are week ARCS and must never offer day
  // tabs, and a bare `perDayAuthoring` (or ={true}) would put them there.
  assert.match(gated[0], /perDayAuthoring=\{buildType === 'mealplan' \|\| buildType === 'diet'\}/);
});

// ── Deploy 2b: the planned-load pair crosses the publish callback ───────────
//
// The capture design §7's TWO STRUCTURAL GUARDS. A new field must cross the
// draft editor, onPublish, every receiver and the RPC; dropping it anywhere
// kills the feature WITHOUT ERRORING — the exact failure the `days` work
// already documented, where deleting the key from the payload passed every one
// of 884 tests because it does not change the first paint.
//
// So these assert the field AT THE FAR END (the published payload), never by
// inspecting the source for it.

const trainerProps = (over = {}) => {
  const published = [];
  return {
    published,
    props: {
      t, accent: '#2ee0c4', typeName: 'program', blockLabel: 'SESSIONS',
      initialName: 'Base Block', initialNote: '', initialMedia: [],
      // A SPLIT: three day lines, so planOutline classifies each block as a
      // session and the capture row is offered.
      initialBlocks: [
        { id: 'b1', text: 'Mon — Upper (push)' },
        { id: 'b2', text: 'Wed — Lower' },
        { id: 'b3', text: 'Fri — Upper (pull)' },
      ],
      loadCapture: true,
      onPublish: async (payload) => { published.push(payload); },
      onCancel: () => {},
      ...over,
    },
  };
};

test('drive: the planned pair reaches onPublish, mapped and stamped', async () => {
  const { published, props } = trainerProps();
  const ed = drive(props);
  ed.click('60 min');
  ed.click('RPE 8');
  await ed.publish();

  const b = published[0].blocks[0];
  assert.equal(b.plannedMinutes, 60, 'plannedMinutes must survive the callback');
  assert.equal(b.plannedRpe, 8, 'plannedRpe must survive the callback');
  assert.equal(b.loadCapture, 'per_session', 'the row stamp must survive the callback');
  // The chip VALUES are dropped after mapping — a stored block must never carry
  // two representations of the same fact.
  assert.equal('plannedLength' in b, false);
  assert.equal('plannedEffort' in b, false);
});

test('drive: a HALF-answered session publishes UNSTAMPED, not stamped-with-a-hole', () => {
  // The whole point of the stamp is to tell "the coach skipped it" from "a hop
  // dropped it". Recording a half-answer as captured would report a blank field
  // as a transport bug, and one malformed row turns the WHOLE evaluation
  // unknown — which switches the guardrail off.
  const { published, props } = trainerProps();
  const ed = drive(props);
  ed.click('60 min');            // length only
  return ed.publish().then(() => {
    const b = published[0].blocks[0];
    assert.equal('loadCapture' in b, false);
    assert.equal('plannedMinutes' in b, false);
  });
});

test('drive: an untouched session publishes with no pair keys at all', async () => {
  const { published, props } = trainerProps();
  await drive(props).publish();
  const b = published[0].blocks[0];
  assert.equal('plannedMinutes' in b, false);
  assert.equal('plannedRpe' in b, false);
  assert.equal('loadCapture' in b, false);
});

test('drive: tapping the SAME chip again clears it back to honestly-absent', async () => {
  // There is no other way out of a chip row. A coach who mis-tapped must be
  // able to return to absent rather than being forced to publish a number they
  // did not mean.
  const { published, props } = trainerProps();
  const ed = drive(props);
  ed.click('60 min');
  ed.click('RPE 8');
  ed.click('60 min');            // same chip -> clear
  await ed.publish();
  assert.equal('loadCapture' in published[0].blocks[0], false);
});

test('drive: the capture row is NOT offered where a block is an EXERCISE', () => {
  // An exercise block has no length or effort of its own — the session is the
  // whole week — so offering the row there would collect a figure the guardrail
  // must then refuse.
  const { props } = trainerProps({
    initialBlocks: [{ id: 'b1', text: 'Main lift · 4×8' }, { id: 'b2', text: 'Accessory · 3×12' }],
  });
  const ed = drive(props);
  assert.throws(() => ed.click('60 min'), /no button labelled/);
});

test('drive: capture is OFF unless the surface asks for it', () => {
  // The nutritionist editor shares this component. A meal plan has no session
  // to carry a length, so the row must not appear there.
  const { props } = trainerProps({ loadCapture: false });
  assert.throws(() => drive(props).click('60 min'), /no button labelled/);
});

test('drive: a REST day line is not a session and is not offered the row', () => {
  const { props } = trainerProps({
    initialBlocks: [{ id: 'b1', text: 'Sun — Rest' }, { id: 'b2', text: 'Mon — Upper (push)' }],
  });
  const ed = drive(props);
  // Exactly ONE session in this outline, so exactly one length chip row.
  const chips = ed.nodes().filter((n) => n.type === 'button' && n.props['aria-pressed'] !== undefined
    && String(n.props.children) === '60 min');
  assert.equal(chips.length, 1, 'the rest day must not be offered a planned load');
});

// ── The assign page: the ONE gated training writer (SPEC-guardrails §9.4) ────
//
// This is the surface that used to hold three per-session `ShapeAssign.workout`
// calls. Mounting it is the crash gate (the page gained state and a new
// derivation); DRIVING it is what proves the publish is actually week-shaped —
// the boundary can only judge a week it is handed whole, so a path that emits
// one session at a time makes the guardrail optional in practice.

const splitPlan = {
  id: 'plan-split',
  name: 'Hypertrophy Block',
  detail: {
    note: 'Push the top set.',
    blocks: [
      { id: 'b1', text: 'Mon — Upper (push)', plannedMinutes: 60, plannedRpe: 7 },
      { id: 'b2', text: 'Wed — Lower (squat)', plannedMinutes: 75, plannedRpe: 8 },
      { id: 'b3', text: 'Fri — Upper (pull)', plannedMinutes: 60, plannedRpe: 7 },
      { id: 'b4', text: 'Sun — Rest' },
    ],
  },
};

function driveAssign(props, reactMod = SHIM_MOD, ctx = CTX) {
  ctx.cells.length = 0;
  let tree;
  const renderOnce = () => { ctx.idx = 0; tree = reactMod.BSProAssignPage(props); return tree; };
  renderOnce();
  const nodes = () => flatten(tree);
  const api = {
    get tree() { return tree; },
    nodes,
    text: () => nodes().map((n) => textOf(n)).join(' | '),
    async click(match) {
      const btn = nodes().find((n) => n.type === 'button' && n.props.onClick && match(textOf(n).trim()));
      if (!btn) throw new Error('no matching button (have: ' + nodes().filter((n) => n.type === 'button').map((n) => JSON.stringify(textOf(n).trim())).join(', ') + ')');
      await btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
      renderOnce();
      return api;
    },
    type(value) {
      const el = nodes().find((n) => n.type === 'textarea' && n.props.onChange);
      if (!el) throw new Error('no textarea rendered');
      el.props.onChange({ target: { value } });
      renderOnce();
      return api;
    },
  };
  return api;
}

// Capture what the page actually sends, and answer as the boundary would.
function stubAssign(answer = () => ({ stored: 'supabase', status: 'accepted' })) {
  const calls = [];
  globalThis.ShapeAssign = {
    week: async (body) => { calls.push(body); return answer(body, calls.length); },
    clients: async () => [],
  };
  globalThis.ShapeCoachPlans = { list: async () => [] };
  globalThis.ShapeMessages = undefined;
  return calls;
}

const ASSIGN_PROPS = {
  role: 'trainer',
  plan: splitPlan,
  client: { n: 'Marcus Tan' },
  clientUid: '11111111-2222-4333-8444-555555555555',
  onBack() {},
  onDone() {},
};

test('assign: the page mounts (no TDZ, no hook-order fault, no render throw)', () => {
  stubAssign();
  const out = render(React.createElement(MOD.BSProAssignPage, ASSIGN_PROPS));
  assert.equal(out.warnings.length, 0, out.warnings.join('\n'));
  assert.match(out.html, /Hypertrophy Block/);
  assert.match(out.html, /Marcus/);
});

test('assign: a weekday split publishes WEEKS, not sessions', async () => {
  const calls = stubAssign();
  const page = driveAssign(ASSIGN_PROPS);
  await page.click((s) => /Assign/i.test(s));

  // 4 weeks is the stepper default for a split; the rest day never rides.
  assert.equal(calls.length, 4, 'expected 4 week publishes, got ' + calls.length);
  const titles = calls.flatMap((c) => c.sessions.map((s) => s.title));
  assert.equal(titles.filter((x) => /Rest/i.test(x)).length, 0, 'a REST day must not be scheduled');

  for (const c of calls) {
    // Every session must fall inside the week it was published under, or the
    // boundary's atomic week-replace deletes a week it was never handed.
    for (const s of c.sessions) {
      const delta = (new Date(s.scheduledDate) - new Date(c.weekStartISO)) / 86400000;
      assert.ok(delta >= 0 && delta <= 6, s.scheduledDate + ' is outside week ' + c.weekStartISO);
    }
    assert.match(c.idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
  // One key per week — a shared key would make week 2 replay week 1.
  assert.equal(new Set(calls.map((c) => c.idempotencyKey)).size, calls.length);
  assert.equal(new Set(calls.map((c) => c.weekStartISO)).size, calls.length);
});

test('assign: a fully-captured split declares per_session on every week', async () => {
  const calls = stubAssign();
  await driveAssign(ASSIGN_PROPS).click((s) => /Assign/i.test(s));
  assert.ok(calls.length > 0);
  for (const c of calls) {
    assert.equal(c.capture, 'per_session');
    for (const s of c.sessions) assert.equal(s.loadCapture, 'per_session');
  }
});

test('assign: ONE unstamped day makes THAT WHOLE week unstamped, never malformed', async () => {
  // The F158 rule, end to end from an authored plan: a coach who filled two
  // rows and skipped the third must read as `incomplete_week`, not as an
  // alarm. Judged PER WEEK — the first week can start mid-week and so may
  // contain only fully-paired sessions, which is a real (and correct) stamp.
  const partial = {
    ...splitPlan,
    id: 'plan-partial',
    detail: { ...splitPlan.detail, blocks: splitPlan.detail.blocks.map((b, i) => (i === 1 ? { id: b.id, text: b.text } : b)) },
  };
  const calls = stubAssign();
  await driveAssign({ ...ASSIGN_PROPS, plan: partial }).click((s) => /Assign/i.test(s));
  assert.ok(calls.length > 0);

  const holed = calls.filter((c) => c.sessions.some((s) => /Lower/.test(s.title)));
  assert.ok(holed.length > 0, 'the stripped session should appear in at least one week');
  for (const c of holed) {
    assert.equal(c.capture, undefined);
    for (const s of c.sessions) {
      assert.equal(s.loadCapture, undefined);
      assert.equal(s.plannedMinutes, undefined);
    }
  }
  // ...and a week that happens to hold only paired sessions still measures.
  const whole = calls.filter((c) => !c.sessions.some((s) => /Lower/.test(s.title)));
  for (const c of whole) assert.equal(c.capture, 'per_session');
});
test('assign: the SAME assignment re-run mints the SAME keys (a retry replays)', async () => {
  const first = stubAssign();
  await driveAssign(ASSIGN_PROPS).click((s) => /Assign/i.test(s));
  const second = stubAssign();
  await driveAssign(ASSIGN_PROPS).click((s) => /Assign/i.test(s));
  assert.ok(first.length > 0);
  assert.deepEqual(second.map((c) => c.idempotencyKey), first.map((c) => c.idempotencyKey));
});

test('assign: a rejection is HELD with the boundary words, and nothing publishes past it', async () => {
  const calls = stubAssign((body, n) => (n === 2
    ? { stored: 'rejected', rejected: true, reason: 'acute_spike', copy: { chip: 'OVER LIMIT', line: 'This week is a big jump.', detail: 'Week load is 61% over their four-week average.', axes: [] } }
    : { stored: 'supabase', status: 'accepted' }));

  const page = driveAssign(ASSIGN_PROPS);
  await page.click((s) => /Assign/i.test(s));

  // Stopped at the rejection — weeks 3 and 4 were never sent.
  assert.equal(calls.length, 2);
  const shown = page.text();
  assert.match(shown, /OVER LIMIT/);
  assert.match(shown, /This week is a big jump/);
  assert.match(shown, /61% over/);
  // The panel names the week and the count through interpolated copy; this
  // harness runs with no ShapeI18n, so `tr` yields the raw defaultValue and
  // placeholders stay literal. Assert the copy is PRESENT, and assert the
  // underlying facts (which week, how many landed) off the calls themselves.
  assert.match(shown, /Week of/);
  assert.match(shown, /already published/);
  assert.equal(calls[1].weekStartISO > calls[0].weekStartISO, true, 'the held week is the second one');
});

test('assign: publish-anyway requires a reason, and the reason rides with the week', async () => {
  const calls = stubAssign((body, n) => (n === 1 && !body.acknowledgment
    ? { stored: 'rejected', rejected: true, reason: 'acute_spike', copy: { chip: 'OVER LIMIT', line: 'Big jump.', detail: null, axes: [] } }
    : { stored: 'supabase', status: 'accepted' }));

  const page = driveAssign(ASSIGN_PROPS);
  await page.click((s) => /Assign/i.test(s));

  // The override is inert until a reason exists — an unexplained override is
  // exactly what the acknowledgment ledger exists to prevent.
  const anyway = page.nodes().find((n) => n.type === 'button' && /Publish anyway/i.test(textOf(n)));
  assert.ok(anyway, 'the override button should be offered');
  assert.equal(anyway.props.disabled, true);

  page.type('Deliberate overreach week before a deload.');
  const armed = page.nodes().find((n) => n.type === 'button' && /Publish anyway/i.test(textOf(n)));
  assert.equal(armed.props.disabled, false);

  const before = calls.length;
  await page.click((s) => /Publish anyway/i.test(s));
  const acked = calls.slice(before);
  assert.ok(acked.length > 0, 'the override should re-run the publish');
  for (const c of acked) {
    assert.equal(c.acknowledgment.reasonCode, 'coach_override');
    assert.match(c.acknowledgment.reasonText, /Deliberate overreach/);
  }
  // Re-run under the ORIGINAL keys, so a week that already landed no-ops
  // instead of publishing twice.
  assert.equal(acked[0].idempotencyKey, calls[0].idempotencyKey);
});

test('assign: an offline hold is reported as held — the client is NOT told', async () => {
  const calls = stubAssign(() => ({ stored: 'queued', queued: true }));
  let messaged = false;
  globalThis.ShapeMessages = {
    getOrCreateMemberConversation: async () => { messaged = true; return { data: 'c1' }; },
    sendMessage: async () => {},
  };

  const page = driveAssign(ASSIGN_PROPS);
  await page.click((s) => /Assign/i.test(s));
  assert.ok(calls.length > 0);
  assert.equal(messaged, false, 'a held week must not announce a plan that is not live');
  assert.match(page.text(), /held on this device/);
  globalThis.ShapeMessages = undefined;
});

test('assign: a device that cannot hold the week says so instead of claiming success', async () => {
  stubAssign(() => ({ stored: 'lost', queued: false }));
  const page = driveAssign(ASSIGN_PROPS);
  await page.click((s) => /Assign/i.test(s));
  assert.match(page.text(), /hold the week|Couldn't assign/i);
});

test('assign: a HELD week is never counted as published in the rejection panel', async () => {
  // Self-review catch. The first cut incremented the landed count on every
  // answer, so a week merely QUEUED on the device was reported to the coach as
  // "already published" — the same false "saved" the old session-shaped writer
  // gave, reappearing one layer up.
  const calls = stubAssign((body, n) => {
    if (n === 1) return { stored: 'queued', queued: true };
    return { stored: 'rejected', rejected: true, reason: 'acute_spike', copy: { chip: 'OVER LIMIT', line: 'Big jump.', detail: null, axes: [] } };
  });

  const page = driveAssign(ASSIGN_PROPS);
  await page.click((s) => /Assign/i.test(s));
  assert.equal(calls.length, 2);

  const shown = page.text();
  assert.match(shown, /OVER LIMIT/, 'the rejection is shown');
  // Nothing landed, so the panel must not claim a published week...
  assert.doesNotMatch(shown, /already published/, 'a queued week is not a published week');
  // ...and the week that IS held must still be reported, not swallowed by the
  // rejection that followed it.
  assert.match(shown, /held on this device/);
});

// ── Adjust regeneration through the boundary (SPEC-guardrails.md §9.4) ───────
//
// The Adjust page gained two hooks and an acknowledgment interstitial. A
// hook-order fault or a TDZ reference passes parse, tsc, the unit suite AND the
// bundle build — mounting is the only thing that catches it.

const ADJUST_PROPS = {
  role: 'trainer',
  client: { n: 'Marcus Tan' },
  clientUid: '11111111-2222-4333-8444-555555555555',
  onBack() {},
};

/** Answer as the regeneration boundary would, and record what it was sent. */
function stubAdjust(answer = () => ({ changed: true, gen: 2 })) {
  const calls = [];
  const written = [];
  globalThis.bsAskConfirm = async () => true;
  globalThis.ShapeAdjustRegen = { apply: async (body) => { calls.push(body); return answer(body, calls.length); } };
  globalThis.ShapeProgramApi = { get: async () => ({}), set: async (d) => { written.push(d); } };
  globalThis.ShapeMessages = undefined;
  globalThis.__bsToast = () => {};
  return { calls, written };
}

function driveAdjust(props, reactMod = SHIM_MOD, ctx = CTX) {
  ctx.cells.length = 0;
  let tree;
  const renderOnce = () => { ctx.idx = 0; tree = reactMod.BSProAdjustProgram(props); return tree; };
  renderOnce();
  const nodes = () => flatten(tree);
  const api = {
    nodes,
    text: () => nodes().map((n) => textOf(n)).join(' | '),
    button(match) {
      return nodes().find((n) => n.type === 'button' && match(textOf(n).trim()));
    },
    async click(match) {
      const btn = api.button(match);
      if (!btn) throw new Error('no matching button (have: ' + nodes().filter((n) => n.type === 'button').map((n) => JSON.stringify(textOf(n).trim())).join(', ') + ')');
      await btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
      renderOnce();
      return api;
    },
    type(value) {
      const el = nodes().find((n) => n.type === 'textarea' && n.props.onChange && n.props.placeholder);
      if (!el) throw new Error('no reason textarea rendered');
      el.props.onChange({ target: { value } });
      renderOnce();
      return api;
    },
  };
  return api;
}

test('adjust: the page mounts (no TDZ, no hook-order fault, no render throw)', () => {
  stubAdjust();
  const out = render(React.createElement(MOD.BSProAdjustProgram, ADJUST_PROPS));
  assert.equal(out.warnings.length, 0, out.warnings.join('\n'));
  assert.match(out.html, /Marcus/);
});

test('adjust: a guardrail rejection is HELD — the program detail is never written', async () => {
  // The detail + note are what the client actually reads. Writing them over a
  // regeneration the boundary refused would tell the client their program
  // changed when not one of their rows moved.
  const { calls, written } = stubAdjust(() => ({
    changed: false,
    rejected: true,
    blocking: { weekStartISO: '2026-08-03', reason: 'volume_jump', copy: { chip: 'Held for review', line: 'That is a big jump for Marcus.' } },
  }));
  const page = driveAdjust(ADJUST_PROPS);
  await page.click((s) => /Apply & Send/i.test(s));

  assert.equal(calls.length, 1, 'the regeneration was attempted');
  assert.equal(written.length, 0, 'no program detail was written for a refused regeneration');
  // The boundary's OWN words reach the coach, not a generic failure.
  assert.match(page.text(), /Held for review/);
  assert.match(page.text(), /That is a big jump for Marcus/);
  // The week line renders, which is the branch gated on `blocked.weekStartISO`.
  // ⚠ Asserted WITHOUT the date itself: this harness stubs i18n away, so `tr`
  // returns its defaultValue verbatim and never interpolates `{date}`. Matching
  // the value here would pin harness behaviour rather than product behaviour.
  assert.match(page.text(), /Week of/);
});

test('adjust: the override needs a reason, and sends it as the acknowledgment', async () => {
  // §10.1 — the reason is what makes the audit row meaningful. An override with
  // no reason is not an acknowledgment, so the CTA stays disabled.
  let reject = true;
  const { calls } = stubAdjust((body) => {
    if (body.acknowledgment) { reject = false; return { changed: true, gen: 3, audited: true }; }
    return reject
      ? { changed: false, rejected: true, blocking: { weekStartISO: '2026-08-03', copy: { line: 'Held.' } } }
      : { changed: true, gen: 3 };
  });
  const page = driveAdjust(ADJUST_PROPS);
  await page.click((s) => /Apply & Send/i.test(s));

  const before = page.button((s) => /Publish anyway/i.test(s));
  assert.ok(before, 'the override CTA is offered');
  assert.equal(before.props.disabled, true, 'disabled until a reason is typed');

  page.type('Planned overreach before a deload.');
  const after = page.button((s) => /Publish anyway/i.test(s));
  assert.equal(after.props.disabled, false, 'enabled once a reason exists');

  await page.click((s) => /Publish anyway/i.test(s));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].acknowledgment, {
    reasonCode: 'coach_override',
    reasonText: 'Planned overreach before a deload.',
  });
});
