// tests/radio-instrument-rules.test.mjs
//
// WHY THIS FILE EXISTS: `public/newdesign/radioInstrument.jsx` is the one part of
// the website Radio page that cannot be driven in Node — it is a canvas renderer
// and a React component. So the three things it must never do again are asserted
// against its SOURCE, and each is written as the invariant rather than as the
// spelling of the line that broke it. All three were found by the Codex round on
// #2101, and all three are the same shape: a decision that belongs somewhere else
// had been made here, quietly and correctly-looking.
//
// Everything is read through the shared `stripComments`, because every one of
// these guards is about a token that also appears in the comment explaining it —
// the exact way a guard comes to report on its own rationale.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { stripComments } from './helpers/strip-comments.mjs';

const SRC = readFileSync(new URL('../public/newdesign/radioInstrument.jsx', import.meta.url), 'utf8');
const BARE = stripComments(SRC);

// The AST is parsed from the RAW source: babel drops comments on its own, and
// parsing the stripped copy would report line numbers for a file nobody ships.
const AST = parse(SRC, { sourceType: 'script', plugins: ['jsx'] });

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, visit, node));
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

function collect(node, pred) {
  const out = [];
  walk(node, (n) => { if (pred(n)) out.push(n); });
  return out;
}

const calleeName = (n) => (n.type === 'CallExpression' && n.callee && n.callee.type === 'Identifier' ? n.callee.name : null);

// The enclosing function of every node, so a guard can ask "is this call inside
// the same function as that one" rather than counting lines between them.
function functionsOf(root) {
  return collect(root, (n) => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
}

test('the station route never decides the session — only /api/me does', () => {
  // ⚠ THE FINDING: `play()` read `/api/radio/station`'s 401 and 403 as a session
  // measurement and called `setSignedIn(false)`. Neither is one. A 401 is
  // ambiguous for the SAME reason `/api/me`'s is — `currentUser()` destructures
  // `{ data }` and drops the error, and the Supabase client resolves rather than
  // throws on an auth-server fault — and a 403 is `refuseKnownMinor`, i.e. a
  // signed-IN account failing an AGE check. Either one flipped a real member's
  // key to disabled with no way back but a reload, and started the visitor
  // preview simulation for them.
  //
  // The invariant is structural, not textual: whichever function talks to the
  // station route may not be the function that moves the session.
  const fns = functionsOf(AST);
  const stationFns = fns.filter((fn) => collect(fn, (n) => n.type === 'StringLiteral' && n.value === '/api/radio/station').length > 0);
  assert.ok(stationFns.length > 0, 'no function fetches /api/radio/station — this guard is reading the wrong file');

  // the innermost one, so an enclosing component does not answer for its child
  const innermost = stationFns.reduce((a, b) => (a.end - a.start <= b.end - b.start ? a : b));
  const offenders = collect(innermost, (n) => calleeName(n) === 'setSignedIn');
  assert.equal(offenders.length, 0,
    'the station fetch moves `signedIn` — a route refusal is a fact about the attempt, not about the session');

  // ...and nothing anywhere may assert signed-out as a literal. `/api/me` sets it
  // from its OWN answer (`!!(d && d.user)`) or to null; a bare `false` can only
  // come from somebody deciding it.
  assert.equal((BARE.match(/setSignedIn\(\s*false\s*\)/g) || []).length, 0,
    'something sets signedIn to a literal false — only /api/me may measure the session');

  // a positive control: the /api/me effect still measures it, or the two
  // assertions above pass on a page that never resolves the session at all
  assert.match(BARE, /setSignedIn\(!!\(d && d\.user\)\)/,
    '/api/me no longer sets the session — the guards above would pass vacuously');
});

test('a refused attempt stays retryable and says which refusal it was', () => {
  // The other half of the same finding: once a refusal stops disabling the key,
  // the key is live and must not be a control that visibly does nothing.
  assert.match(BARE, /setRefusal\("signin"\)/, 'a 401 records no refusal, so the deck can say nothing about it');
  assert.match(BARE, /setRefusal\("age"\)/, 'a 403 records no refusal — a minor would be told to sign in');
  assert.match(BARE, /setRefusal\(null\)/, 'a refusal is never cleared, so it outlives the attempt that caused it');

  // and the two are DIFFERENT sentences on the page. Telling a confirmed minor to
  // sign in is #2005 with the wrong remedy attached.
  assert.match(BARE, /st\.refusal === "age"/, 'the age refusal is not rendered');
  assert.match(BARE, /st\.refusal === "signin"/, 'the sign-in refusal is not rendered');
  assert.ok(!/refusal === "age"[\s\S]{0,400}?Sign in/i.test(BARE),
    'the age refusal renders a sign-in prompt — that is the wrong remedy for an age gate');

  // the key itself may only be disabled by the MEASURED session
  assert.match(BARE, /disabled=\{key === "signin"\}/, 'the key is disabled by something other than the transport key');
  assert.ok(!/disabled=\{[^}]*refusal/.test(BARE),
    'a refusal disables the key — then the attempt is not retryable, which is the defect');
});

test('the parked track callback reads the live track, not its mount closure', () => {
  // ⚠ THE FINDING: `applyTrack` is declared inside the field effect, whose deps
  // are `[]`. It closed over `title`/`artist` from the MOUNT render — both null,
  // because now-playing is a fetch — and the `[title, artist]` effect then called
  // that same stale function. Its key was "·" forever, so the programme, the
  // figure sweep and the beat reset never followed the song, while the chrome
  // (which reads them at render) displayed the real track.
  //
  // The invariant: the effect that owns the frame loop may not reference either
  // value directly. This is the `liveRef` rule, and it has two subjects.
  const effects = collect(AST, (n) =>
    n.type === 'CallExpression'
    && n.callee && n.callee.type === 'MemberExpression'
    && n.callee.property && n.callee.property.name === 'useEffect'
    && n.arguments.length === 2
    && n.arguments[1].type === 'ArrayExpression'
    && n.arguments[1].elements.length === 0);
  const field = effects.filter((e) => collect(e, (n) => n.type === 'Identifier' && n.name === 'applyTrack').length > 0);
  assert.equal(field.length, 1, 'could not find exactly one empty-deps effect declaring applyTrack');

  const body = field[0].arguments[0];
  for (const name of ['title', 'artist']) {
    const refs = collect(body, (n) => n.type === 'Identifier' && n.name === name);
    // a property read (`now.title`, `{ title }` as a key) is not a closure over the value
    const bare = refs.filter((n) => {
      const parents = collect(body, (p) =>
        (p.type === 'MemberExpression' && p.property === n && !p.computed)
        || (p.type === 'ObjectProperty' && p.key === n && !p.computed));
      return parents.length === 0;
    });
    assert.equal(bare.length, 0,
      `the empty-deps field effect closes over \`${name}\` — it will be the mount value forever`);
  }
  assert.match(BARE, /trackRef\.current/, 'nothing reads the track through a live ref');

  // ...and the ref is RE-POINTED on every render, or it is a second stale closure
  // wearing a ref's clothes: a `useRef({title, artist})` that is never assigned
  // again holds the mount value exactly as the closure did, and every assertion
  // above still passes.
  const repoint = collect(AST, (n) => n.type === 'AssignmentExpression'
    && n.left.type === 'MemberExpression'
    && n.left.object.name === 'trackRef' && n.left.property.name === 'current');
  assert.ok(repoint.length > 0, 'trackRef is never re-pointed — it holds the mount value forever');
  const insideEffect = collect(body, (n) => n.type === 'AssignmentExpression'
    && n.left.type === 'MemberExpression' && n.left.object && n.left.object.name === 'trackRef');
  assert.equal(insideEffect.length, 0,
    'trackRef is re-pointed inside the once-only effect — that is the same staleness through a ref');
});

test('the wall flood is a field rule, not a canvas literal', () => {
  // ⚠ THE FINDING: `kick > 0.3` sat inside `rdMakeField`, deciding when the
  // song's programmed band lights. That is field behaviour — it cannot be driven
  // in Node where it was, and it was a THIRD kick threshold agreeing with neither
  // KICK_ON nor KICK_OFF, free to drift from both.
  assert.match(BARE, /F\.wallFloods\(/, 'the renderer no longer consumes the shared flood rule');
  assert.ok(!/\bkick\s*[><]=?\s*[\d.]/.test(BARE),
    'the renderer compares the kick against a bare literal again — that decision belongs in radioField.mjs');
});
