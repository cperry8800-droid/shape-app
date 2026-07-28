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
// The theme arrives via a window-global hook, not a prop, on some components
// (BSProAssignPage). It is destructured at MODULE EVAL, so it has to exist
// before loadModule runs — hence the late-bound read of __BS_T.
globalThis.useBS = () => globalThis.__BS_T;
// BSProAssignPage's header chrome reaches one level further into the window
// globals than the draft editor does. Stub only the chrome — the page body,
// which is what these tests are about, is the real component.
globalThis.BSBackButton = ({ onClick, label }) => React.createElement('button', { onClick }, label || '← BACK');
globalThis.BSFacetAvatar = () => React.createElement('span', { 'data-avatar': true });

async function loadModule(reactImpl = React) {
  const dir = dirname(SRC);
  // The component under test is module-local. Exporting it is the only edit,
  // and it is made to the in-memory copy — the shipping file is untouched.
  // `import.meta.env` is Vite's, injected at build; substitute it the same way
  // the bundler does so asset URLs resolve instead of being a syntax error in a
  // CJS function body.
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta\.env/g, '__VITE_ENV__')}\nexport { BSCoachDraftEditor, BSProAssignPage };\n`;
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
  INK50: '#777', RULE: '#ccc', padX: 18, isLight: true,
  AMBER: '#d8a23a', RUST: '#c0533b', ACCENT: '#0a8f87', GREEN: '#5fa96e', BLUE: '#3b74b8',
};
globalThis.__BS_T = t; // what the window-global useBS() hands back
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

// ── The assign page: a HELD week must never read as an assigned one ──────────
//
// This is the render-crash class the house rule exists for: adding a hook and a
// conditional branch passes parse, tsc, the suite and the build, because none
// of them CALL the component. It also drives the branch, because the held state
// only exists after a failed publish — a first paint would never reach it.

function driveAssign(props) {
  CTX.cells.length = 0;
  let tree;
  const render = () => { CTX.idx = 0; tree = SHIM_MOD.BSProAssignPage(props); return tree; };
  render();
  const nodes = () => flatten(tree);
  return {
    render,
    nodes,
    text: () => nodes().map((n) => textOf(n)).join(' '),
    button: (re) => nodes().find((n) => n.type === 'button' && n.props.onClick && re.test(textOf(n))),
  };
}

const ASSIGN_PLAN = { id: 'p1', name: 'Base Block', meta: '', detail: { blocks: ['Back squat · 4×8'], note: 'Keep RPE 7.' } };
const assignProps = (over = {}) => ({
  role: 'trainer', plan: ASSIGN_PLAN, client: { n: 'Alex Rivera' }, clientUid: 'u-1',
  onBack: () => {}, onDone: () => {}, ...over,
});

test('assign page mounts (hook order + every new identifier in scope)', () => {
  globalThis.ShapeAssign = { workout: async () => ({ stored: 'supabase' }), clients: async () => [] };
  const { html, warnings } = render(React.createElement(MOD.BSProAssignPage, assignProps()));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  assert.match(html, /Base Block/);
});

test('assign: an offline week reads HELD and is never reported as assigned', async () => {
  const seen = [];
  globalThis.ShapeAssign = {
    workout: async (a) => { seen.push(a); return { stored: 'queued', queued: true }; },
    clients: async () => [],
  };
  // If this ever fires, the coach was told the plan is live when nothing left
  // the device — the exact false assurance the fix exists to prevent.
  let toldClient = false;
  globalThis.ShapeMessages = {
    getOrCreateMemberConversation: async () => { toldClient = true; return { data: 'c1' }; },
    sendMessage: async () => { toldClient = true; },
  };

  const d = driveAssign(assignProps());
  const cta = d.button(/Assign & notify/);
  assert.ok(cta, 'the assign CTA renders');
  await cta.props.onClick();
  d.render();

  const txt = d.text();
  assert.ok(seen.length > 0, 'the week was attempted');
  assert.match(txt, /HELD · \d/, 'the held count is shown');
  assert.match(txt, /offline/i, 'and it says why');
  assert.doesNotMatch(txt, /Assigned ✓/, 'a held week is NEVER "Assigned ✓"');
  assert.equal(toldClient, false, 'the client is not told a plan is live that never left the device');
});

test('assign: a REJECTED week surfaces the reason instead of reporting success', async () => {
  globalThis.ShapeAssign = {
    workout: async () => { const e = new Error('guardrail red — not acknowledged'); e.rejected = true; throw e; },
    clients: async () => [],
  };
  let toldClient = false;
  globalThis.ShapeMessages = {
    getOrCreateMemberConversation: async () => { toldClient = true; return { data: 'c1' }; },
    sendMessage: async () => { toldClient = true; },
  };

  const d = driveAssign(assignProps());
  await d.button(/Assign & notify/).props.onClick();
  d.render();

  const txt = d.text();
  // The harness translator returns defaultValue WITHOUT interpolating, so the
  // reason itself renders as the literal `{status}` placeholder. What is
  // assertable — and what matters — is which branch the failure took.
  assert.match(txt, /Couldn't assign/, 'the failure surfaces on the error line');
  assert.doesNotMatch(txt, /Assigned ✓/, 'a rejection is never reported as success');
  assert.doesNotMatch(txt, /HELD · /, 'a rejection is not disguised as an offline hold');
  assert.equal(toldClient, false);
});
