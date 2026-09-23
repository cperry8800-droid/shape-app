import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';

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
// for repeatedly. A count moves only when somebody adds or removes one of these.
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

// An assert whose COMPARED VALUE is a bare DOM query or element reference — no property read
// after it. `assert.equal(el.value, 'x')` is a string comparison and is fine; it is the node
// itself reaching the formatter that costs the minute.
//
// ⚠ `.activeElement` IS THE SHAPE THIS MISSED FIRST, AND IT COST THE SAME MINUTE. A focus check
// that fails formats the document exactly like a query does. Measured twice: a mutation that broke
// Escape-returns-focus in the coach library filters turned a ~17s run into a multi-minute stall,
// and a focus mutation in the per-set ladder suite was SIGKILLed at 76s. That one was reported as
// a kill, which is the worse half: it proves the run stopped, not that the assertion fired.
//
// ⚠ IT READS THE FIRST ARGUMENT ONLY, ON ONE LINE. `assert.equal(x, document.activeElement)`
// puts the node second and is invisible here, and so is a call split across lines. Compare a
// boolean — `assert.ok(document.activeElement === x, msg)` — and neither question arises.
const CALL = /assert\.(?:equal|strictEqual|notEqual|notStrictEqual|deepEqual|deepStrictEqual)\(\s*([^,]*?)\s*,/g;
const NODEISH = /(?:document\.(?:querySelector|querySelectorAll|getElementById|getElementsByClassName)\([^)]*\)|\.(?:parentElement|parentNode|firstElementChild|lastElementChild|activeElement)|\.closest\([^)]*\)|\bbyText\([^)]*\))\s*$/;

function sitesIn(src) {
  const clean = stripComments(src);
  let n = 0;
  for (const line of clean.split('\n')) {
    CALL.lastIndex = 0;
    let m;
    while ((m = CALL.exec(line))) if (NODEISH.test(m[1])) n++;
  }
  return n;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('no assertion is handed a live DOM node as the value it compares', () => {
  const files = walk('tests');
  // A sweep that stops matching passes vacuously, so the corpus size is asserted first.
  assert.ok(files.length > 200, `expected the whole test corpus, walked ${files.length} files`);

  const census = {};
  for (const f of files) {
    const n = sitesIn(fs.readFileSync(f, 'utf8'));
    if (n) census[f] = n;
  }

  const unexpected = Object.entries(census).filter(([f]) => !(f in KNOWN));
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

test('the detector fires on the shape it is written for, and not on the safe forms', () => {
  // ⚠ THE FIXTURES ARE ASSEMBLED, NOT WRITTEN OUT. Spelled literally they would be real
  // matches in this file's own source and the sweep above would flag its own test data — so
  // the alternative was exempting this file from the sweep, which is an exemption far wider
  // than the thing it excuses. `A + 'equal('` never reads as `assert.equal(` to the detector.
  const A = 'assert.';

  const bad = [
    `${A}equal(document.querySelector('.x'), null);`,
    `${A}equal(document.getElementById('root'), null, 'msg');`,
    `${A}strictEqual(el.parentElement, document.body);`,
    `${A}equal(m.byText('Strength'), undefined);`,
    `${A}deepEqual(document.querySelector('.x'), null);`,
    `${A}equal(document.activeElement, opener);`,
    `${A}notEqual(doc.activeElement, submit);`,
    `${A}strictEqual(win.document.activeElement, first, 'msg');`,
  ];
  for (const s of bad) assert.equal(sitesIn(s), 1, `should have flagged: ${s}`);

  const good = [
    `${A}ok(!document.querySelector('.x'), 'msg');`,
    `${A}equal(document.querySelector('.x').value, 'Upper');`,
    `${A}equal(document.querySelector('fieldset').disabled, true);`,
    `${A}equal(byText('Sheet').getAttribute('aria-pressed'), 'true');`,
    `${A}equal(document.getElementById('root').contains(dialog), false);`,
    `${A}ok(document.activeElement === opener, 'msg');`,
    `${A}ok(doc.activeElement !== submit, 'msg');`,
    `${A}equal(document.activeElement.id, 'save');`,
    `${A}equal(doc.activeElement.getAttribute('aria-label'), 'Close');`,
    // a mention inside a comment is not a claim about the code
    `// ${A}equal(document.querySelector('.x'), null);`,
  ];
  for (const s of good) assert.equal(sitesIn(s), 0, `should NOT have flagged: ${s}`);

  // and the sweep can see this file at all — otherwise the assembly above would be hiding it
  assert.ok(fs.readFileSync('tests/assert-dom-value.test.mjs', 'utf8').length > 1000);
});
