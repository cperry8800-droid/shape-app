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

// ⚠ EVERY NODE LOOKUP IN THIS FILE GOES THROUGH HERE, BECAUSE THE ENCLOSING-NODE SLIP
// HAS NOW PRODUCED FIVE FINDINGS ACROSS TWO ROUNDS. A predicate that matches on source
// text or on a contained token matches the TARGET and every function wrapping it —
// `play` encloses the terminal handler, `useRadioStation` encloses `play`, a `.catch`
// node's callee is its whole chain. `.find` then returns the outermost, which is the
// one case where every later assertion is vacuously satisfied by unrelated code.
// Routing all of them through one reducer makes picking the wrong one something you
// have to do on purpose rather than something you have to remember not to do.
function innermost(candidates, what) {
  assert.ok(candidates.length > 0, `could not find ${what}`);
  return candidates.reduce((a, b) => (a.end - a.start <= b.end - b.start ? a : b));
}

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
  const target = innermost(stationFns, 'the station fetch');
  const offenders = collect(target, (n) => calleeName(n) === 'setSignedIn');
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

test('a superseded tune-in attempt writes nothing', () => {
  // ⚠ THE FINDING (Codex, round 2): making the key retryable made two presses
  // during one slow round trip ordinary, and `!audio.src` gates the fetch, so BOTH
  // reach it. With nothing sequencing them the newer request could succeed and
  // start playback while the older came back 401 and painted a refusal over a
  // station already on air — and a stale response could assign `audio.src` a
  // second time, reloading the element mid-play.
  //
  // The invariant is a dataflow one rather than a spelling: inside `play`, no
  // state may be written while an `await` has resolved without the attempt being
  // re-checked. Walked in source order, which is what makes it survive a rewrite
  // that moves the guards around.
  const fns = functionsOf(AST);
  const play = innermost(fns.filter((fn) => collect(fn, (n) => n.type === 'StringLiteral'
    && n.value === '/api/radio/station').length > 0), 'play()');

  // ⚠ WRITES INSIDE A NESTED CALLBACK ARE EXCLUDED, AND THAT IS LOAD-BEARING RATHER
  // THAN TIDY. `play` declares the audio element's own `pause`/`ended`/`error`
  // listeners, and those call `setRefusal` — so by SOURCE POSITION they sit before
  // the first await and satisfied "the attempt resets its verdicts first" even with
  // the real reset deleted. Measured: that mutation was caught only by a weaker
  // text assertion elsewhere, so the positional rule below had quietly gone vacuous.
  // A callback's definition site is not its execution order either, which is the
  // same reason the dataflow walk must not see them.
  //
  // ⚠ AND IT IS LOAD-BEARING FOR `setRefusal` ALONE, WHICH IS WORTH THE LINE BECAUSE
  // THE OBVIOUS MEASUREMENT SAYS OTHERWISE. Moving BOTH resets after the fetch fails
  // with or without this filter — but only because `setConfigured` is reset on the
  // next line and appears in no nested callback, so its half of the assertion covers
  // the refusal's by accident. Isolated (move ONLY the refusal reset): with this
  // filter the suite fails, without it the defect walks straight through. Today's
  // coverage is a fact about where the two resets happen to sit, not about the rule.
  const nested = functionsOf(play).filter((f) => f !== play);
  const inNested = (at) => nested.some((f) => at > f.start && at < f.end);

  const marks = [];
  walk(play, (n) => {
    if (inNested(n.start)) return;
    if (n.type === 'AwaitExpression') marks.push({ at: n.start, kind: 'await' });
    else if (calleeName(n) === 'isCurrent') marks.push({ at: n.start, kind: 'check' });
    else if (calleeName(n) === 'setRefusal' || calleeName(n) === 'setConfigured') marks.push({ at: n.start, kind: 'write', what: n.callee.name });
    else if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression'
      && ((n.left.object.name === 'audio' && n.left.property.name === 'src')
        || n.left.object.name === 'startedAtRef')) marks.push({ at: n.start, kind: 'write', what: 'audio/clock' });
  });
  marks.sort((a, b) => a.at - b.at);

  assert.ok(marks.some((m) => m.kind === 'await'), 'play() has no await — this guard is reading the wrong function');
  assert.ok(marks.some((m) => m.kind === 'check'), 'play() never re-checks the attempt after an await');

  let stale = false;
  for (const m of marks) {
    if (m.kind === 'await') stale = true;
    else if (m.kind === 'check') stale = false;
    else if (m.kind === 'write' && stale) {
      assert.fail(`\`${m.what}\` is written after an await with no isCurrent() re-check — a superseded attempt can paint over a newer one`);
    }
  }

  // and the attempt counter is actually bumped, or every isCurrent() is a no-op
  assert.match(BARE, /attemptRef\.current \+= 1/, 'nothing advances the attempt counter');

  // ⚠ AND A NEW ATTEMPT CLEARS **BOTH** VERDICTS (Codex, round 3). `configured` used
  // to outlive the attempt that produced it, so a listener who got {configured:false}
  // and pressed again could be shown the new refusal AND "No station on the air yet"
  // together — two answers to one press. Asserted as "before the first await", which
  // is what makes it a reset rather than an outcome.
  const firstAw = marks.find((m) => m.kind === 'await').at;
  for (const setter of ['setRefusal', 'setConfigured']) {
    assert.ok(marks.some((m) => m.kind === 'write' && m.what === setter && m.at < firstAw),
      `a new attempt does not reset \`${setter}\` before it starts — the previous attempt's verdict can outlive it`);
  }
});

test('a fetch that never landed does not claim there is no station', () => {
  // ⚠ The catch used to answer `setConfigured(false)`, which renders "No station on
  // the air yet" — a claim about the BROADCAST made out of a failure of our own
  // network, on a page whose whole argument is that it measures or says nothing.
  const fns = functionsOf(AST);
  const catches = collect(AST, (n) => n.type === 'CatchClause'
    && collect(n, (c) => calleeName(c) === 'setConfigured' || calleeName(c) === 'setRefusal').length > 0);
  assert.ok(catches.length > 0, 'no catch clause touches the station state — this guard is reading the wrong file');
  for (const c of catches) {
    assert.equal(collect(c, (n) => calleeName(n) === 'setConfigured').length, 0,
      'a failed station fetch sets `configured` — that renders "No station on the air yet" for a network fault');
    assert.ok(collect(c, (n) => calleeName(n) === 'setRefusal').length > 0,
      'a failed station fetch says nothing at all, leaving a live key that looks dead');
  }
  assert.match(BARE, /st\.refusal === "unavailable"/, 'the unreachable-station refusal is never rendered');

  // ⚠ AND A STREAM THAT STOPS MUST STOP THE CLAIM (Codex, round 4). Only `pause` was
  // listened for; `ended` and a fatal media `error` end playback without necessarily
  // emitting it, so the rail went on reading "On air" and the session clock went on
  // counting for a member hearing nothing. Both terminal events are required, and
  // both must clear the cached source — the station fetch is gated on `!audio.src`,
  // so a dead URL would make every later press skip it and fail identically.
  // ⚠ COLLECTING THE NAMES PROVES ONLY THAT THEY ARE WIRED (Codex, round 5). Pointing
  // the `error` listener at the non-failure branch satisfies every check here while
  // leaving the dead src cached and emitting no refusal — so every retry skips the
  // station fetch and replays the URL that just failed. Each terminal listener is
  // matched to the ARGUMENT it hands the cleanup path.
  const listeners = collect(AST, (n) => n.type === 'CallExpression'
    && n.callee.type === 'MemberExpression' && n.callee.property.name === 'addEventListener'
    && n.arguments.length === 2 && n.arguments[0].type === 'StringLiteral');
  const byEvent = Object.fromEntries(listeners.map((n) => [n.arguments[0].value, n.arguments[1]]));
  for (const ev of ['pause', 'ended', 'error']) {
    assert.ok(byEvent[ev], `the audio element has no \`${ev}\` listener — playback can stop with the page still claiming it is on air`);
  }
  // ⚠ AND THE CALLEE IS CHECKED, NOT JUST THE ARGUMENT (Codex, round 6). The previous
  // version accepted ANY one-argument call passing `true`, so `() => noop(true)`
  // satisfied it while clearing nothing, refusing nothing and dropping no source — and
  // the separate inspection of the cleanup function never connected it to either event.
  // The name is read off the cleanup function's own binding rather than typed here, so
  // renaming it cannot silently unhook this.
  const cleanupName = (() => {
    // the INNERMOST match: `play` encloses this handler, so its own declarator
    // contains both markers too and a naive collect returns two
    const d = collect(AST, (n) => n.type === 'VariableDeclarator' && n.init
      && n.id.type === 'Identifier'
      && /removeAttribute\("src"\)/.test(SRC.slice(n.init.start, n.init.end))
      && /startedAtRef\.current = null/.test(SRC.slice(n.init.start, n.init.end)));
    return innermost(d, 'the terminal cleanup binding').id.name;
  })();
  for (const ev of ['ended', 'error']) {
    const calls = collect(byEvent[ev], (n) => n.type === 'CallExpression'
      && n.callee.type === 'Identifier' && n.callee.name === cleanupName
      && n.arguments.length === 1 && n.arguments[0].type === 'BooleanLiteral');
    assert.ok(calls.length === 1 && calls[0].arguments[0].value === true,
      `the \`${ev}\` listener does not call \`${cleanupName}(true)\` — the dead source stays cached and nothing says why`);
  }

  assert.ok((BARE.match(/removeAttribute\("src"\)/g) || []).length >= 2,
    'a dead stream URL survives, so the fetch gate makes every later press fail the same way');

  // ...and the handler must clear the CLAIM, not merely exist. Found by mutation:
  // asserting the listeners are wired says nothing about what they do, and a
  // `stopped` that forgets `setPlaying(false)` leaves the rail on "On air" with the
  // key offering Pause — the whole defect, with all three listeners present.
  // ⚠ INNERMOST, NOT `.find` (Codex, round 7). `useRadioStation` encloses `play` which
  // encloses this handler, so all three match the two markers and `.find` returned the
  // outermost — after which `badPath` found `setRefusal("unavailable")` in the unrelated
  // station-fetch branches and stayed green with the terminal path stripped of it. The
  // lookup immediately above this one had already been fixed for the same reason in the
  // previous round; this one was left, which is why the helper now owns the rule.
  const stoppedFn = innermost(functionsOf(AST).filter((f) => {
    const src = SRC.slice(f.start, f.end);
    return /startedAtRef\.current = null/.test(src) && /removeAttribute\("src"\)/.test(src);
  }), 'the terminal-stop handler');
  // the failure path is the one that refuses AND drops the cached source
  const badPath = SRC.slice(stoppedFn.start, stoppedFn.end);
  assert.ok(/setRefusal\("unavailable"\)/.test(badPath) && /removeAttribute\("src"\)/.test(badPath),
    'the terminal failure path neither refuses nor drops the cached source');
  assert.ok(collect(stoppedFn, (n) => calleeName(n) === 'setPlaying'
    && n.arguments.length === 1 && n.arguments[0].value === false).length > 0,
    'a terminal stop does not clear `playing` — the rail keeps claiming On air and the clock keeps counting');

  // ⚠ AND THE OTHER DOOR INTO THE SAME FALSE CLAIM (Codex, round 3): `fetch` RESOLVES
  // on an HTTP error, so the catch never runs for the route's own 503 or 402 — both
  // reached the configuration verdict and were published as "No station on the air
  // yet". The invariant is an ordering one: a non-ok response must return before
  // anything writes `configured`.
  const play = innermost(functionsOf(AST).filter((fn) => collect(fn, (n) => n.type === 'StringLiteral'
    && n.value === '/api/radio/station').length > 0), 'play()');
  const okGuards = collect(play, (n) => n.type === 'IfStatement'
    && n.test.type === 'UnaryExpression' && n.test.operator === '!'
    && n.test.argument.type === 'MemberExpression' && n.test.argument.property.name === 'ok');
  assert.ok(okGuards.length > 0, 'nothing branches on r.ok — a 503 still reads as "no station"');
  // ...and that branch must SAY something. Found by mutation: a guard that merely
  // returns avoids the false claim and leaves a live key that looks dead, which is
  // the defect the whole refusal mechanism exists to prevent, reached from a new door.
  assert.ok(okGuards.some((g) => collect(g, (n) => calleeName(n) === 'setRefusal').length > 0),
    'the non-ok branch returns silently — the key stays enabled with nothing on screen saying why');
  // ⚠ AND IT MUST RETURN (Codex, round 7). Speaking is not stopping: with `return false`
  // gone, a 402 or 503 falls through, parses the error payload, reaches
  // setConfigured(false) — which is still textually after this guard, so the ordering
  // assertions below stay green — and the deck renders the unavailable refusal AND
  // "No station on the air yet" together. That is round 3's two-answers-to-one-press
  // defect, reachable again through the branch added to fix round 3.
  assert.ok(okGuards.some((g) => {
    const nested = functionsOf(g);
    return collect(g, (n) => n.type === 'ReturnStatement')
      .some((r) => !nested.some((f) => r.start > f.start && r.end < f.end));
  }), 'the non-ok branch does not return in its own scope — a 402/503 falls through to the configuration verdict');
  const writes = collect(play, (n) => calleeName(n) === 'setConfigured');
  const afterFetch = writes.filter((w) => w.start > okGuards[0].start);
  assert.equal(writes.length - afterFetch.length, 1,
    'expected exactly one setConfigured before the r.ok guard (the per-attempt reset)');
  assert.ok(afterFetch.length > 0 && afterFetch.every((w) => w.start > okGuards[0].start),
    'a non-ok station response reaches the configuration verdict — 503 and 402 would read as "no station"');
});

test('the records do not claim an auto-retry the player does not have', () => {
  // ⚠ The war room carried "auto-retry states" from the RETIRED player into the
  // record for this one (Codex, round 2), marking recovery as shipped. Both halves
  // are derived here so the claim and the code cannot drift apart again.
  assert.equal((BARE.match(/fetch\("\/api\/radio\/station"/g) || []).length, 1,
    'the instrument fetches the station from more than one place — the no-auto-retry claim needs re-deriving');
  assert.equal((BARE.match(/setInterval/g) || []).length, 1,
    'a second interval appeared — check whether one of them now retries the station');
  assert.ok(/setInterval\(tick, 15000\)/.test(BARE), 'the only interval is no longer the now-playing poll');

  const wr = readFileSync(new URL('../src/lib/warroom.ts', import.meta.url), 'utf8');
  const radioSection = wr.slice(wr.indexOf('Shape Radio — real licensed player'), wr.indexOf('Shape Score · Momentum'));
  assert.ok(radioSection.length > 500, 'could not isolate the war room radio section');
  assert.ok(!/auto-retry(?!,? and the word is DROPPED)/i.test(radioSection.replace(/NO AUTO-RETRY[\s\S]*?as many words\./gi, '')),
    'the war room claims an auto-retry again — the player has one station fetch and it is on the Tune in press');
});


test('the station route never publishes a lookup failure as a configuration verdict', () => {
  // ⚠ THE THIRD DOOR INTO THE SAME FALSE CLAIM, AND THE ONLY ONE NO CLIENT GUARD
  // COULD SEE (Codex, round 4). The Supabase client RESOLVES on a query fault, so
  // destructuring `{ data }` alone turned a statement timeout or a moved column into
  // `data: null` and answered **200 with configured:false** — "we could not look",
  // published with the authority of a successful response. The page then printed
  // "No station on the air yet", and its own `!r.ok` guard was blind to it because
  // the status said everything was fine.
  //
  // This file is TypeScript and was covered by nothing here, which is why the two
  // mutations for it survived their first round.
  const routeSrc = readFileSync(new URL('../src/app/api/radio/station/route.ts', import.meta.url), 'utf8');
  const routeAst = parse(routeSrc, { sourceType: 'module', plugins: ['typescript'] });

  const q = collect(routeAst, (n) => n.type === 'StringLiteral' && n.value === 'radio_station');
  assert.equal(q.length, 1, 'expected exactly one radio_station query in the route');

  // the destructuring that receives it must take the error
  const decl = collect(routeAst, (n) => n.type === 'VariableDeclarator'
    && n.id.type === 'ObjectPattern'
    && collect(n.init || {}, (c) => c.type === 'StringLiteral' && c.value === 'radio_station').length > 0);
  assert.equal(decl.length, 1, 'could not find the radio_station destructuring');
  const names = decl[0].id.properties.map((pr) => pr.key && pr.key.name);
  assert.ok(names.includes('error'),
    'the station lookup drops its error — a query fault becomes a 200 saying configured:false');

  // ...and it must REFUSE on it, with a non-200, before anything computes `configured`
  const guards = collect(routeAst, (n) => n.type === 'IfStatement'
    && n.test.type === 'Identifier' && n.test.name === 'error');
  assert.ok(guards.length > 0, 'the error is read and never branched on');
  const guard = guards[0];
  // ⚠ AND IT MUST **RETURN** THAT RESPONSE (Codex, round 5). A first version of this
  // guard checked only that an `if (error)` existed, carried a failure status and came
  // before `configured` — all of which survive deleting the `return`, after which the
  // handler falls through and emits 200 {configured:false} for the failed lookup again.
  // The exact regression the test exists for, walking past the test.
  // ⚠ AND THE RETURN MUST BE THE BRANCH'S OWN, NOT ONE NESTED INSIDE A CALLBACK
  // (Codex, round 6). `collect` descends recursively, so
  //     if (error) { const fail = () => { return NextResponse.json(..., {status:503}); }; fail(); }
  // supplies a ReturnStatement and a failure status while the handler DISCARDS that
  // response and falls through to the 200 — the very regression this guard exists for,
  // satisfying the fix written for it one round earlier. This is the same nested-scope
  // rule already applied to `play()`'s marks, which I wrote in the same session and did
  // not carry across to the route.
  const guardNested = functionsOf(guard);
  const ownReturn = (n) => !guardNested.some((f) => n.start > f.start && n.end < f.end);
  const returns = collect(guard, (n) => n.type === 'ReturnStatement' && n.argument).filter(ownReturn);
  assert.ok(returns.length > 0, 'the station error branch does not return in its own scope — the handler falls through to the 200');
  const statuses = returns.flatMap((r) => collect(r, (n) => n.type === 'ObjectProperty'
    && n.key.name === 'status' && typeof n.value.value === 'number'));
  assert.ok(statuses.length > 0, 'the error branch returns no explicit status');
  for (const st of statuses) {
    assert.ok(st.value.value >= 400,
      `the station lookup failure is published as ${st.value.value} — a caller cannot tell it from a real answer`);
  }
  const verdict = collect(routeAst, (n) => n.type === 'ObjectProperty' && n.key.name === 'configured');
  assert.equal(verdict.length, 1, 'expected exactly one `configured` property in the route');
  assert.ok(guard.start < verdict[0].start,
    'the configuration verdict is computed before the lookup failure is refused');
});

test('a simulated now-playing payload is never published as a measured track', () => {
  // ⚠ THE MOCK IS INDISTINGUISHABLE FROM A REAL TRACK ON THE WIRE (Codex, round 5),
  // and this is production TODAY: the station row carries provider='mock', so
  // /api/radio/now-playing answered 'Tempo Lift' / 'Shape Radio' with a 200 and the
  // page printed it under "Now playing" and fed it to the field's programme. An
  // invented reading, on the page whose whole argument is that every figure is
  // measured or absent.
  const npSrc = readFileSync(new URL('../src/app/api/radio/now-playing/route.ts', import.meta.url), 'utf8');
  const npAst = parse(npSrc, { sourceType: 'module', plugins: ['typescript'] });

  // the route reads its error rather than falling through to the mock on a fault
  const decl = collect(npAst, (n) => n.type === 'VariableDeclarator' && n.id.type === 'ObjectPattern'
    && collect(n.init || {}, (c) => c.type === 'StringLiteral' && c.value === 'radio_station').length > 0);
  assert.equal(decl.length, 1, 'could not find the radio_station destructuring in the now-playing route');
  assert.ok(decl[0].id.properties.map((pr) => pr.key && pr.key.name).includes('error'),
    'the now-playing lookup drops its error — a query fault silently becomes the mock track');

  // EVERY response it can return carries the marker, or one door publishes the mock unlabelled
  const returns = collect(npAst, (n) => n.type === 'ReturnStatement' && n.argument
    && n.argument.type === 'CallExpression');
  assert.ok(returns.length >= 2, 'expected the now-playing route to have more than one exit');
  for (const r of returns) {
    assert.ok(collect(r, (n) => (n.type === 'ObjectProperty' && n.key.name === 'simulated')
      || (n.type === 'Identifier' && n.name === 'simulated')).length > 0,
      'a now-playing response leaves the simulated marker off — a caller cannot tell the mock from a real track');
  }

  // ⚠ AND THE MARKER IS DERIVED FROM THE SELECTOR, NOT RESTATED. Re-checking
  // `provider === 'http' && nowPlayingUrl` at the call site is a second copy of the
  // rule, free to drift the day a third provider is added.
  const sel = readFileSync(new URL('../src/lib/radio/index.ts', import.meta.url), 'utf8');
  assert.match(sel, /getProvider\(config\) === mockProvider/,
    'isSimulated restates the provider rule instead of asking which provider was chosen');
  assert.ok(!/provider === 'http'/.test(sel.slice(sel.indexOf('export function isSimulated'))),
    'isSimulated re-derives the http condition — that is the copy that drifts');

  // and the page refuses it
  assert.match(BARE, /!d\.simulated/,
    'the page publishes a simulated payload as the now-playing track');

  // ⚠ AND A POLL THAT NEVER LANDED CLEARS THE READING TOO (Codex, round 6). An empty
  // catch left the last title on screen under "Now playing" — and feeding radioProgram —
  // long after the connection dropped, while the non-ok arm beside it cleared correctly.
  // the INNERMOST function that names the route — the enclosing hook also contains
  // the /api/me poll, whose own catch legitimately does not touch the track
  const pollFns = functionsOf(AST).filter((f) => collect(f, (n) => n.type === 'StringLiteral'
    && n.value === '/api/radio/now-playing').length > 0);
  const poll = innermost(pollFns, 'the now-playing poll');
  const catches = collect(poll, (n) => n.type === 'CallExpression'
    && n.callee.type === 'MemberExpression' && n.callee.property.name === 'catch');
  assert.ok(catches.length > 0, 'the now-playing poll has no catch at all');
  // ⚠ THE HANDLER, NOT THE CALL NODE. A `.catch(fn)` CallExpression's CALLEE is the
  // whole preceding chain, so collecting over the node descends into the `.then` that
  // legitimately calls setNowPlaying — and this guard passed with an empty catch until
  // a mutation said otherwise. Third enclosing-node slip of the session: the node that
  // contains the thing you are looking for is rarely the node you meant.
  for (const c of catches) {
    const handler = c.arguments[0];
    assert.ok(handler, 'the now-playing catch takes no handler');
    assert.ok(collect(handler, (n) => calleeName(n) === 'setNowPlaying').length > 0,
      'a failed now-playing poll keeps the last track on screen — a reading we cannot take is not a reading');
  }
});
