import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

// WHY THIS FILE EXISTS, measured rather than argued.
//
// `assert.equal(document.querySelector('.x'), null)` reads perfectly well and is a trap on the
// one path that matters: the FAILING one. Node builds an assertion error's diff with
// util.inspect, and a live DOM element's parent pointers reach the whole document — so the
// error the guard exists to raise takes 81 SECONDS to format, after which the test runner
// SIGKILLs the file. Everything below the failing assertion in that file is then silently
// never run, while the runner's own summary counts one failure and looks like an ordinary red.
//
// Measured on tests/coach-builder-views.test.mjs against the mutation that stops the Sheet
// switch clearing its selection: `assert.equal(node, null, msg)` hung and was SIGKILLed at
// 81s with four later tests cancelled; `assert.ok(!node, msg)` threw the same message in 1ms.
//
// The rule is therefore: compare a BOOLEAN or a primitive, never the node. This sweep is what
// keeps the shape out.
//
// ⚠ THE CENSUS IS PER FILE, NEVER file:line. A line number pins a layout, so an unrelated edit
// above the assertion would fail a guard about something else — the defect this repo has paid
// for repeatedly. A count moves only when somebody adds or removes one of these. (A failure
// message may still cite lines, to help whoever fixes it; nothing is compared against them.)
//
// ⚠ AND IT IS A RATCHET THAT MAY ONLY SHRINK. The sites below predate the guard and sat in
// files that work did not otherwise touch, so they were REGISTERED rather than swept: fixing one
// is a two-character change and a lower number here. A change that touches one of these files
// fixes its sites rather than leaving them registered. A file that is not on the list may carry
// none at all.

const KNOWN = {
  'tests/broadsheet-builder-render.test.mjs': 4,
  'tests/desktop-live-workout.test.mjs': 4,
  'tests/live-watch-mounted.test.mjs': 1,
  'tests/workout-coach-cues.test.mjs': 2,
};

// HOW IT READS. Every test file is parsed with @babel/parser, and every equality assertion in the
// tree is checked on BOTH of the values it compares. A call split across lines is one node in the
// tree, so layout cannot hide it. A comment or a string is not code to a parser, so a mention in
// one is never read as a call — which is why the fixtures below can be written out plainly.
// ⚠ A FILE THAT DOES NOT PARSE FAILS THE SWEEP. Skipping it would report a clean file that was
// never read.
//
// How the shape list got here:
// ⚠ `.activeElement` was the first shape it missed, and it cost the same minute. A focus check
// that fails formats the document exactly like a query does. Measured twice: a mutation that broke
// Escape-returns-focus in the coach library filters turned a ~17s run into a multi-minute stall,
// and a focus mutation in the per-set ladder suite was SIGKILLed at 76s. That one was reported as
// a kill, which is the worse half: it proves the run stopped, not that the assertion fired.
// ⚠ The line-by-line reading this replaced saw the FIRST argument of a call written on ONE line.
// It missed `document.getElementById('root')` as the second argument in error-boundary-mount, and
// it would have missed any call split across lines. The tree reading closes both.
// ⚠ A query on another receiver is the same trap, and the old pattern only knew `document.`.
// `doc.getElementById(...)` in dob-gate-web and `m.el.querySelector(...)` in
// dashboard-coaching-usability were live when this was written. So the four query methods now
// count on any receiver.
//
// ⚠ WHAT IT STILL CANNOT SEE. The tree records how a value is SPELLED, not what it is at runtime.
// These are all invisible to any check of the syntax, because nothing in `find(x)` says what
// `find` returns:
//   - a node returned by a helper other than byText, like `find(...)` and `byAria(...)` (the shapes
//     #2150 and #2152 hit) and dob-gate-web's `gateIn(doc)`;
//   - a node held in a variable (`dialog`, `opener`);
//   - a node reached through a pointer that is not on the list (`document.body`, `.firstChild`).
// `byText` is on the list only because it is known by name. It also knows `assert` by name,
// including node:test's `t.assert`; a destructured `import { equal }` would be invisible.
// Only a runtime check could see the rest. Compare a boolean, e.g.
// `assert.ok(a === b, msg)`, and none of this arises.

// The whole equality family: each of these builds its failure message by inspecting the values.
const METHODS = new Set([
  'equal', 'strictEqual', 'notEqual', 'notStrictEqual', 'deepEqual', 'deepStrictEqual',
  'notDeepEqual', 'notDeepStrictEqual', 'partialDeepStrictEqual',
]);
const QUERIES = new Set(['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName']);
const POINTERS = new Set(['parentElement', 'parentNode', 'firstElementChild', 'lastElementChild', 'activeElement']);

const isMember = (n) => n?.type === 'MemberExpression' || n?.type === 'OptionalMemberExpression';
const isCall = (n) => n?.type === 'CallExpression' || n?.type === 'OptionalCallExpression';
// `a.b` and `a['b']` name the same property.
const propName = (m) => (m.computed ? (m.property.type === 'StringLiteral' ? m.property.value : null) : m.property.name);

// A compared value that IS a DOM node: the query or pointer itself, with no property read after
// it. `assert.equal(el.value, 'x')` compares a string and is fine; it is the node reaching the
// formatter that costs the minute.
function nodeish(n) {
  if (isCall(n)) {
    const c = n.callee;
    if (c.type === 'Identifier') return c.name === 'byText';
    if (!isMember(c)) return false;
    const p = propName(c);
    return p === 'byText' || p === 'closest' || QUERIES.has(p);
  }
  return isMember(n) && POINTERS.has(propName(n));
}

// `assert.equal(...)`, and node:test's `t.assert.equal(...)`.
function equalityCall(n) {
  if (!isCall(n) || !isMember(n.callee) || !METHODS.has(propName(n.callee))) return false;
  const o = n.callee.object;
  return (o.type === 'Identifier' && o.name === 'assert') || (isMember(o) && propName(o) === 'assert');
}

// Comments ride on the nodes as metadata, not code, so they are never walked.
const META = new Set(['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments']);
function eachNode(root, fn) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    fn(node);
    for (const key of Object.keys(node)) {
      if (META.has(key)) continue;
      const v = node[key];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') stack.push(c); }
      else if (v && typeof v.type === 'string') stack.push(v);
    }
  }
}

// Every equality call handed a DOM node as EITHER compared value. One call is one site, however
// many of its values are nodes. Throws (a SyntaxError) when the source does not parse.
function scan(src) {
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const sites = [];
  let calls = 0;
  eachNode(ast.program, (n) => {
    if (!equalityCall(n)) return;
    calls++;
    if (n.arguments.slice(0, 2).some(nodeish)) sites.push(n.loc.start.line);
  });
  return { sites: sites.sort((a, b) => a - b), calls };
}
const sitesIn = (src) => scan(src).sites.length;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('no assertion is handed a live DOM node as a value it compares', () => {
  const files = walk('tests');
  // A sweep that stops matching passes vacuously, so the corpus size is asserted first.
  assert.ok(files.length > 200, `expected the whole test corpus, walked ${files.length} files`);

  const census = {};
  const lines = {};
  let calls = 0;
  for (const f of files) {
    let r;
    try {
      r = scan(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      assert.fail(`${f} did not parse, so this sweep could not read it: ${e.message}`);
    }
    calls += r.calls;
    if (r.sites.length) { census[f] = r.sites.length; lines[f] = r.sites; }
  }
  // Everything below rests on the walk recognising `assert.equal`: if it stopped, every file would
  // read clean. There were ~10,000 equality assertions when this was written.
  assert.ok(calls > 5000, `expected the corpus's equality assertions, walked ${calls}`);

  const unexpected = Object.keys(census).filter((f) => !(f in KNOWN)).map((f) => `${f} (line ${lines[f].join(', ')})`);
  assert.deepEqual(unexpected, [],
    'a new DOM-valued assertion: compare a boolean instead — assert.ok(!node, msg) — or the ' +
    'failure takes 81s to format and the runner SIGKILLs the whole file');

  // Two-way, so a detector that has stopped matching FAILS rather than reporting a clean sweep.
  for (const [f, want] of Object.entries(KNOWN)) {
    assert.equal(census[f] || 0, want,
      `${f}: registered ${want} pre-existing DOM-valued assertions, found ${census[f] || 0} — ` +
      'if you fixed one, lower the number here; if this reads 0 across the board the detector broke');
  }

  // Neither builder suite may carry one: this is where the 81s was measured.
  for (const f of ['tests/coach-builder-views.test.mjs', 'tests/coach-builder-recovery.test.mjs']) {
    assert.equal(census[f] || 0, 0, `${f} must stay clear of the shape that cost 81s`);
  }
});

test('the detector reads both compared values and split calls, and not the safe forms', () => {
  const bad = [
    // the first compared value
    "assert.equal(document.querySelector('.x'), null);",
    "assert.equal(document.getElementById('root'), null, 'msg');",
    'assert.strictEqual(el.parentElement, document.body);',
    "assert.equal(m.byText('Strength'), undefined);",
    "assert.deepEqual(document.querySelector('.x'), null);",
    'assert.equal(document.activeElement, opener);',
    'assert.notEqual(doc.activeElement, submit);',
    "assert.strictEqual(win.document.activeElement, first, 'msg');",
    // the SECOND compared value, which the one-line reading this replaced could not see
    "assert.equal(rootRenders[0].container, document.getElementById('root'));",
    'assert.strictEqual(first, doc.activeElement);',
    "assert.equal(undefined, byText('Sheet'));",
    // a call split across lines
    "assert.equal(\n  document.querySelector('.x'),\n  null,\n  'msg',\n);",
    'assert.equal(\n  first,\n  doc.activeElement,\n);',
    // the same query on another receiver
    "assert.equal(doc.getElementById('x'), null);",
    'assert.equal(m.el.querySelector(\'[role="button"]\'), null);',
    // the rest of the equality family, node:test's t.assert, optional chaining, a computed name
    "assert.notDeepStrictEqual(document.querySelector('.x'), null);",
    't.assert.equal(document.activeElement, opener);',
    "assert.equal(el?.closest('li'), null);",
    "assert.equal(el['parentElement'], null);",
    // both values nodes: one call is one site
    "assert.equal(document.activeElement, document.getElementById('save'));",
  ];
  for (const s of bad) assert.equal(sitesIn(s), 1, `should have flagged: ${s}`);

  const good = [
    "assert.ok(!document.querySelector('.x'), 'msg');",
    "assert.ok(document.activeElement === opener, 'msg');",
    "assert.ok(rootRenders[0].container === document.getElementById('root'), 'msg');",
    "assert.ok(doc.activeElement !== submit, 'msg');",
    "assert.equal(document.querySelector('.x').value, 'Upper');",
    "assert.equal(document.activeElement.id, 'save');",
    "assert.equal(first, document.activeElement.id);",
    "assert.equal(doc.activeElement.getAttribute('aria-label'), 'Close');",
    "assert.equal(byText('Sheet').getAttribute('aria-pressed'), 'true');",
    'assert.equal(document.getElementById(\'root\').contains(dialog), false);',
    "assert.match(document.querySelector('.x').textContent, /x/);",
    // not an assertion at all
    "other.equal(document.querySelector('.x'), null);",
    // a comment and a string are not code
    "// assert.equal(document.querySelector('.x'), null);",
    "const s = \"assert.equal(document.querySelector('.x'), null)\";",
  ];
  for (const s of good) assert.equal(sitesIn(s), 0, `should NOT have flagged: ${s}`);

  // The blind spots the header names, pinned so it cannot drift from the code: nothing in how these
  // are spelled says they are nodes. A detector that learns one moves it to `bad` above.
  const blind = [
    'assert.equal(gateIn(doc), null);',
    "assert.equal(find(m, 'button'), null);",
    'assert.equal(dialog, opener);',
    'assert.equal(document.body, host);',
  ];
  for (const s of blind) assert.equal(sitesIn(s), 0, `a documented blind spot started matching: ${s}`);

  // A file that does not parse throws; it never reads as clean.
  assert.throws(() => sitesIn("assert.equal(document.querySelector('.x'), null"), SyntaxError);
});
