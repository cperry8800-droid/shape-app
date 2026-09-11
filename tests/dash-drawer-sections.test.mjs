// The client drilldown's sections, per lens (review 2026-09-09, R15).
//
// ⚠ THE DRAWER IS A 440px MODAL WITH SIX SECTIONS, and a coach who never reads Milestones
// scrolls past it on every client, every day. The control lives IN the drawer rather than
// on a card's ⚙ because the drawer opens from four places — the roster table, the pulse,
// the schedule and the roster page — so any one card's gear would be the wrong home for a
// preference about the drawer itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROSTER = readFileSync(new URL('../public/newdesign/dashRoster.jsx', import.meta.url), 'utf8');
const SRC = stripComments(ROSTER);

// Execute the shipped selector rather than describing it.
function fn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' moved');
  let d = 0, seen = false, k = at;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') { d++; seen = true; } else if (c === '}') { d--; if (seen && !d) { k++; break; } } }
  return new Function(src.slice(at, k) + '\nreturn ' + name + ';')();
}
const pick = fn(SRC, 'dashDrawerSections');
const VIEW = { eyebrow: 'Client drilldown', sections: [['a', 'A', 1], ['b', 'B', 2], ['c', 'C', 3]] };
const keys = (list) => list.map(([k]) => k);

test('with nothing hidden the drawer is exactly the drawer it was', () => {
  for (const h of [[], null, undefined, 'nope', [null, '', 7]]) {
    const r = pick(VIEW, h);
    assert.deepEqual(keys(r.shown), ['a', 'b', 'c']);
    assert.equal(r.hiddenCount, 0);
  }
});

test('a hidden section is dropped, and order is preserved', () => {
  const r = pick(VIEW, ['b']);
  assert.deepEqual(keys(r.shown), ['a', 'c'], 'hiding reordered the drawer');
  assert.equal(r.hiddenCount, 1);
  assert.deepEqual(keys(r.all), ['a', 'b', 'c'], 'the picker lost the section it has to offer back');
});

test('a key this build does not recognise changes nothing', () => {
  // ⚠ IGNORED, NOT DROPPED FROM THE DOCUMENT. A section retired here may belong to a
  // build that still has it — the same rule useRememberedChoice applies to a stale value.
  const r = pick(VIEW, ['ghost', 'b']);
  assert.deepEqual(keys(r.shown), ['a', 'c']);
  assert.equal(r.hiddenCount, 1, 'an unknown key was counted as a hidden section');
});

test('hiding everything is allowed, and the drawer says so', () => {
  const r = pick(VIEW, ['a', 'b', 'c']);
  assert.deepEqual(r.shown, []);
  assert.equal(r.hiddenCount, 3);
  // ⚠ A control whose effect cannot be reversed from where you see it is the dead-control
  // class from the other direction, so the empty drawer names the way back.
  assert.match(SRC, /secs\.shown\.length === 0 &&/);
  assert.match(SRC, /Every section is hidden\. Open ⚙ above to bring one back\./);
});

test('a malformed view yields nothing rather than throwing', () => {
  // There is no error boundary anywhere in public/newdesign: a throw here blanks the page.
  for (const v of [null, undefined, {}, { sections: 'no' }]) {
    assert.doesNotThrow(() => pick(v, ['a']));
    assert.deepEqual(pick(v, ['a']).shown, []);
  }
});

test('every section carries a STABLE key, and the title is not it', () => {
  // ⚠ Keying the hidden list on the title would mean rewording a heading silently
  // un-hides that section for everyone who had hidden it.
  const block = SRC.slice(SRC.indexOf('const DASH_DRAWER_VIEWS'), SRC.indexOf('function dashDrawerSections'));
  const tuples = [...block.matchAll(/\[\s*"([a-z]+)"\s*,\s*"([^"]+)"\s*,\s*(DashSec\w+)\s*\]/g)];
  assert.ok(tuples.length >= 11, 'the section tuples changed shape: ' + tuples.length);
  for (const [, key, title] of tuples) {
    assert.match(key, /^[a-z]+$/, 'a section key is not a plain slug: ' + key);
    assert.notEqual(key, title, 'a section is keyed on its own title');
  }
  // the two lenses share `goals` deliberately — one concept, one key
  const byRole = block.split('nutritionist:');
  assert.match(byRole[0], /\["goals", /);
  assert.match(byRole[1], /\["goals", /);
});

test('the drawer stores what is HIDDEN, per account and per role', () => {
  // ⚠ POLARITY IS THE DESIGN. Storing the SHOWN list pins today's drawer into the coach's
  // data: a section added next month would be missing for every coach who ever touched the
  // control, with no way to know it existed.
  assert.match(SRC, /useRememberedSet\(prefs, "drawerHidden:" \+ role, 12\)/);
  assert.doesNotMatch(SRC, /drawerShown/, 'the drawer went back to storing the shown list');
});

test('the hooks run before the early return', () => {
  // A drawer that closes would otherwise render fewer hooks than the one that opened —
  // the rules-of-hooks class this repo already post-mortems, which no build step catches.
  const at = SRC.indexOf('function DashClientDrawer(');
  const body = SRC.slice(at, SRC.indexOf('\n}\n', at));
  const bail = body.indexOf('if (!row) return null;');
  assert.ok(bail > 0, 'the drawer early return moved');
  for (const h of ['useRememberedSet(prefs', 'React.useState(false)']) {
    const k = body.indexOf(h);
    assert.ok(k > 0, h + ' moved');
    assert.ok(k < bail, h + ' now runs AFTER the early return');
  }
});

test('the gear is a real toggle and says when something is hidden', () => {
  assert.match(SRC, /aria-label="Choose sections"/);
  assert.match(SRC, /aria-expanded=\{showSettings\}/);
  // lit when a section is hidden, so the drawer never quietly omits one
  assert.match(SRC, /color: secs\.hiddenCount \? "#2ee0c4" : DASH_ROSTER_INK50/);
  // and each chip is a pressed-state toggle over the FULL list, not just the shown one
  assert.match(SRC, /\{secs\.all\.map\(\(\[key, title\]\) => \{/);
  assert.match(SRC, /aria-pressed=\{on\}/);
  assert.match(SRC, /onClick=\{\(\) => toggleSection\(key\)\}/);
});

test('no rgba() colour token anywhere in newdesign takes a hex alpha suffix', () => {
  // ⚠ EARNED HERE: the first cut of the sections panel wrote
  // `1px solid ${DASH_ROSTER_INK50}33`, and that token is an rgba() string — so the value
  // was `rgba(242,237,228,0.55)33`, which is not a colour. CSS error-handling drops the
  // WHOLE declaration, so the border simply did not paint. Neither the mutation round nor
  // the browser drive could see it: an absent border still renders, still passes, still
  // looks approximately right. The same class this repo post-mortems on the page textures,
  // where two of them voided every page background.
  //
  // ⚠ THE CORPUS IS DERIVED FROM EACH FILE'S OWN CONSTANTS, not a list of token names, so
  // a new rgba constant is covered the day it is declared — and the sweep asserts it
  // scanned something, because a sweep that scans nothing passes.
  const dir = new URL('../public/newdesign/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.jsx?$/.test(f));
  assert.ok(files.length >= 40, 'the newdesign corpus vanished: ' + files.length);
  let scanned = 0;
  const bad = [];
  for (const f of files) {
    const src = stripComments(readFileSync(new URL(f, dir), 'utf8'));
    const rgba = [...src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*"(rgba\([^"]*\))"/g)].map((m) => m[1]);
    for (const name of rgba) {
      scanned += 1;
      const re = new RegExp('(?:\\$\\{' + name + '\\}|' + name + '\\s*\\+\\s*")([0-9a-fA-F]{2})(?![0-9a-fA-F])', 'g');
      for (const m of src.matchAll(re)) bad.push(f + ': ' + m[0]);
    }
  }
  assert.ok(scanned >= 5, 'no rgba constants found — the derivation broke: ' + scanned);
  assert.deepEqual(bad, [], 'an rgba token is given a hex alpha suffix, which voids the whole declaration');
});

test('the drawer is handed the PAGE\'s store, never its own', () => {
  // ⚠ THE DRAWER IS MOUNTED ONLY WHILE IT IS OPEN, so a store of its own would start a
  // fresh `dashboard_prefs` read on every open: all six sections painted and two dropped
  // ~300ms later, every time, and a ⚙ reached inside that window writing a list derived
  // from an empty document. The page's store is hydrated long before any row is clicked.
  assert.doesNotMatch(SRC, /useRememberedChoices\(/, 'DashClientDrawer opened its own preference store again');

  // ⚠ AND THE CORPUS IS DERIVED, so a host added later is covered with nobody
  // remembering this test exists. Every JSX mount of the drawer, in every newdesign
  // module, must pass one — a host that forgets degrades to session-only silently.
  const dir = new URL('../public/newdesign/', import.meta.url);
  const mounts = [];
  for (const f of readdirSync(dir)) {
    if (!/\.jsx$/.test(f)) continue;
    const src = readFileSync(new URL(f, dir), 'utf8');
    let i = 0;
    for (;;) {
      const at = src.indexOf('<DashClientDrawer', i);
      if (at < 0) break;
      i = at + 1;
      // the opening tag ends at the first '>' that is not inside a {…} expression
      let depth = 0, end = at;
      for (let k = at; k < src.length; k++) {
        const c = src[k];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '>' && depth === 0) { end = k; break; }
      }
      mounts.push({ file: f, tag: src.slice(at, end + 1) });
    }
  }
  assert.ok(mounts.length >= 3, 'found ' + mounts.length + ' drawer mounts — the sweep stopped seeing them');
  for (const m of mounts) {
    assert.match(m.tag, /prefs=\{/, m.file + ' mounts the drawer without a preference store: ' + m.tag);
  }
});
