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

// ⚠ AND THE SIBLING CLASS GETS THE SAME TREATMENT, FOR THE SAME REASON (round 9).
// "A branch that SAYS the right thing has not necessarily STOPPED" has now produced
// six findings across rounds 3, 4, 6, 8 and 9 — the non-ok branch existing at all,
// the station route's return, the non-ok branch's own return, the pause exit, the
// status refusals, and the isCurrent check below — and every fix was a fresh copy of
// the same four lines. The question is asked in one place now: does this node's OWN
// control flow leave the function? A return inside a nested function is somebody
// else's exit and does not count, which was round 7's finding.
function ownScopeExits(node) {
  const own = functionsOf(node);
  return collect(node, (n) => n.type === 'ReturnStatement' || n.type === 'ThrowStatement')
    .filter((r) => !own.some((f) => r.start > f.start && r.end < f.end));
}
const exitsOwnScope = (node) => ownScopeExits(node).length > 0;

// The enclosing function of every node, so a guard can ask "is this call inside
// the same function as that one" rather than counting lines between them.
function functionsOf(root) {
  return collect(root, (n) => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
}


// ── the fold sits in the site's own measure ────────────────────────────────────
test('the fold stages its chrome in the same width the site header uses', () => {
  // ⚠ THE POINT IS THAT THE TWO CANNOT DRIFT. The fold was the only section on the
  // page with no width bound: its two chrome blocks were pinned `left: 32, right: 32`
  // against the VIEWPORT while the header centres its content in 1440, so measured on
  // the real page the fold's wordmark sat 240px left of the header's logo at 1920,
  // 560px at 2560 and 1000px at 3440. RD_STAGE is READ FROM the header rather than
  // restated, so changing one without the other fails here rather than showing up as
  // a hero that is out of line with the page on a wide monitor.
  const shell = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  const inner = /className="shape-header-inner"[^>]*?maxWidth:\s*(\d+)/.exec(stripComments(shell));
  assert.ok(inner, 'could not read .shape-header-inner maxWidth — this guard is not looking at the header any more');
  const headerMeasure = Number(inner[1]);

  const stage = /\bconst RD_STAGE = (\d+)\b/.exec(BARE);
  assert.ok(stage, 'RD_STAGE is gone — the fold is full-bleed again');
  assert.equal(Number(stage[1]), headerMeasure,
    `the fold stages at ${stage[1]} and the header at ${headerMeasure}: the hero is out of line with the page above it`);

  // and both blocks actually USE it — a constant nothing reads is not a stage
  for (const block of ['rd-top', 'rd-bottom']) {
    const m = new RegExp(`className="${block}"[^>]*?maxWidth:\\s*RD_STAGE`).exec(BARE);
    assert.ok(m, `.${block} does not stage: it is still pinned to the viewport`);
  }
});

test('the wordmark size is decided by the rules module, not by the renderer', () => {
  // ⚠ A RULE WITH ONE CALL SITE NOBODY DRIVES IS A RULE NOBODY TESTS. `wallWordFit`
  // can be correct and tested while buildMask quietly keeps its own literals, which
  // is exactly how the word came to grow with the monitor: the two bounds were
  // `mh * 0.42` and `mw * 0.88`, both fractions OF THE GRID. Structural, so an
  // equivalent rewrite passes and only a bypass fails.
  assert.ok(/F\.wallWordFit\(/.test(BARE), 'buildMask no longer asks the rules module for the budget');
  assert.ok(!/measureText\([^)]*\)\.width\s*>\s*mw\s*\*/.test(BARE),
    'the fitting loop is bounded by the grid again rather than by the budget');
  assert.ok(!/fillText\(\s*word\s*,\s*mw\s*\/\s*2/.test(BARE),
    'the word is centred on a half column again — that alone is a one-tile jitter');

  // and a browser holding a stale cached copy of the module must DEGRADE rather than
  // call through to undefined inside a render — the guard this file's header is about
  assert.ok(/!F\.wallWordFit\b/.test(BARE),
    'rdLib does not check wallWordFit, so a stale cached module throws in a render');
});

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

  // ⚠ RE-ANCHORED (round 12): this asserted the station fetch never touches `signedIn`
  // AT ALL, which is broader than the finding and became wrong. The invariant is about
  // DIRECTION, not contact: this function may never conclude signed-OUT, because the
  // two ways it could — a 401 (ambiguous: `currentUser()` drops the error, so an
  // auth-server fault answers 401 exactly as a real visitor does) and a 403 (a
  // CONFIRMED MINOR, who is signed IN) — are both facts about the attempt.
  //
  // A session the press RESOLVES is a different thing: it proves one exists, and it is
  // a NEWER reading than the mount probe, which may still be in flight. Forbidding it
  // outright is what let a stale `{user:null}` land over a member already listening and
  // start the visitor preview on top of a real stream. So: upgrade only.
  const target = innermost(stationFns, 'the station fetch');
  const offenders = collect(target, (n) => calleeName(n) === 'setSignedIn'
    && !(n.arguments.length === 1 && n.arguments[0].type === 'BooleanLiteral' && n.arguments[0].value === true));
  assert.equal(offenders.length, 0,
    'the station fetch concludes something other than signed-IN — a route refusal is a fact about the attempt, not about the session');

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

test('a session the cookie cannot see still reaches playback', () => {
  // ⚠ THE FINDING (Codex, round 10): `/api/me` reads the Next.js cookie and nothing
  // else — it calls `createClient()` with no request, so a Bearer token is not even
  // an option there — while this site ALSO keeps sessions in localStorage under
  // `shape.auth`. `supabase.js` copies one into the cookie from `applyNavAuthState()`
  // and that POST is fire-and-forget, so nothing orders it against this page's read.
  // A member signed in on a legacy or static page was therefore measured as signed
  // OUT, permanently (the effect has empty deps): the key read "Sign in to listen"
  // and they were handed the visitor preview. The retired player did not have this
  // defect — it awaited `shapeDb.getSession()` and sent the bearer — so this is a
  // behaviour the rewrite lost rather than one nobody had built.
  const fns = functionsOf(AST);

  // (a) the SDK is asked at all
  const sdkCalls = collect(AST, (n) => n.type === 'CallExpression'
    && n.callee.type === 'MemberExpression' && n.callee.property && n.callee.property.name === 'getSession');
  assert.ok(sdkCalls.length > 0,
    'the page never asks the SDK for a session — /api/me alone cannot see a localStorage session');

  // (b) ...and the branch that acts on one STOPS. This is the class this file has now
  // swept: `setSignedIn(true)` without an exit lets the /api/me fallback below it run
  // and overwrite a real member back to `false`, which is the very defect being fixed,
  // reintroduced one line under its own fix.
  const sessionFn = innermost(fns.filter((fn) => collect(fn, (n) => n.type === 'StringLiteral'
    && n.value === '/api/me').length > 0), 'the session effect');
  assert.ok(collect(sessionFn, (n) => sdkCalls.includes(n)).length > 0,
    'the session effect does not ask the SDK — it decides the session from the cookie alone');
  const trueBranches = collect(sessionFn, (n) => n.type === 'IfStatement'
    && collect(n, (c) => calleeName(c) === 'setSignedIn'
      && c.arguments.length === 1 && c.arguments[0].type === 'BooleanLiteral' && c.arguments[0].value === true).length > 0);
  assert.equal(trueBranches.length, 1, 'no single branch resolves a live SDK session to signed-in');
  assert.ok(exitsOwnScope(trueBranches[0].consequent),
    'the SDK-session branch records the session and does not stop — the /api/me fallback below it overwrites a real member with false');

  // (c) /api/me is the FALLBACK, in the same function — not a second effect racing it
  assert.ok(collect(sessionFn, (n) => n.type === 'StringLiteral' && n.value === '/api/me').length > 0,
    '/api/me is no longer the arbiter of the null case — a failed SDK bridge would read as confirmed signed-out');

  // (d) THE BEARER IS SENT, AND IT IS RESOLVED AT THE PRESS RATHER THAN CARRIED FROM
  // THE MOUNT. Knowing the member is signed in is half of it — `/api/radio/station`
  // resolves through `currentUser()`, which reads the cookie OR a Bearer, so a
  // cookie-less member whose request carries neither gets that route's own 401.
  //
  // ⚠ AND THE OTHER HALF IS THAT A CAPTURED TOKEN IS WORSE THAN NONE (Codex, round 11).
  // Access tokens expire and the SDK refreshes its own persisted session, while
  // `currentUser()` gives ANY Bearer header PRECEDENCE over the cookie — the
  // `if (bearer)` at src/lib/request-auth.ts:31 short-circuits, so the cookie branch is
  // never reached. An hour-old page therefore sent a dead token, suppressed a working
  // cookie with it, and re-sent the same dead token on every retry: the lockout this
  // whole fix removes, reintroduced by the fix. So the assertion is an ABSENCE plus a
  // location — no ref may hold the token at all, and the station function must resolve
  // a session inside its own scope — which makes the stale case unrepresentable rather
  // than something a later edit has to remember not to do.
  assert.equal(collect(AST, (n) => n.type === 'AssignmentExpression'
    && n.left.type === 'MemberExpression' && n.left.property && n.left.property.name === 'current'
    && collect(n.right, (c) => c.type === 'Identifier' && c.name === 'access_token').length > 0).length, 0,
    'the access token is stashed on a ref — it goes stale, and a stale bearer outranks a valid cookie');

  const stationFn = innermost(fns.filter((fn) => collect(fn, (n) => n.type === 'StringLiteral'
    && n.value === '/api/radio/station').length > 0), 'the station fetch');
  const liveReads = collect(stationFn, (n) => sdkCalls.includes(n));
  assert.ok(liveReads.length > 0,
    'the station fetch does not resolve the session itself — any bearer it sends was captured earlier and may be dead');
  const tokenFrom = collect(stationFn, (n) => n.type === 'Identifier' && n.name === 'access_token');
  assert.ok(tokenFrom.length > 0,
    'the station fetch reads no access_token from the session it just resolved');
  assert.ok(collect(stationFn, (n) => (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression'
      && n.left.property && n.left.property.name === 'Authorization')
    || (n.type === 'ObjectProperty' && n.key && (n.key.name === 'Authorization' || n.key.value === 'Authorization'))).length > 0,
    'the station fetch builds no Authorization header — a cookie-less member is refused by the route');
});

test('the lock screen is cleared when the reading is', () => {
  // ⚠ THE FINDING (Codex, round 10): the retired player assigned
  // `navigator.mediaSession.metadata` from every now-playing response, so system and
  // lock-screen controls carried the track. The rewrite moved the poll into React
  // state and dropped that assignment entirely — a shipped behaviour retired by a
  // rewrite rather than by a decision.
  //
  // The half that matters more here is the CLEAR. `nowPlaying` is null for a
  // simulated payload and for a poll that never landed, and a stale title on a lock
  // screen is the same false claim as a stale title on the page — worse, because the
  // page's own correction is not on screen beside it.
  const msFns = functionsOf(AST).filter((fn) => collect(fn, (n) => (n.type === 'StringLiteral' || n.type === 'Identifier')
    && (n.value === 'mediaSession' || n.name === 'mediaSession')).length > 0);
  const ms = innermost(msFns, 'the media-session effect');

  const metaWrites = collect(ms, (n) => n.type === 'AssignmentExpression'
    && n.left.type === 'MemberExpression' && n.left.property && n.left.property.name === 'metadata');
  assert.ok(metaWrites.some((n) => n.right.type === 'NewExpression'),
    'nothing publishes the track to the media session — the lock screen shows no track');
  assert.ok(metaWrites.some((n) => n.right.type === 'NullLiteral'),
    'the media session is never cleared — a simulated or unreadable poll leaves a stale title on the lock screen');

  // the clear is reachable from the empty reading, and that branch stops rather than
  // falling through into the publish below it
  const emptyBranches = collect(ms, (n) => n.type === 'IfStatement'
    && n.test.type === 'UnaryExpression' && n.test.operator === '!'
    && collect(n.test, (c) => c.type === 'Identifier' && c.name === 'nowPlaying').length > 0);
  assert.equal(emptyBranches.length, 1, 'no branch acts on an absent reading');
  assert.ok(exitsOwnScope(emptyBranches[0].consequent),
    'the empty-reading branch does not stop — it would fall through and publish a track it has just cleared');

  // ⚠ AND NOTHING IS INVENTED. The retired player defaulted the title to "Shape Radio"
  // and the artist to "Live"; the first is the product's own name AND the mock
  // provider's artist string, so a leak would read exactly like an honest empty — the
  // ambiguity round 5's control had to work around. `album` is exempt: it names the
  // station, which is a fact about us rather than a claim about the track.
  const built = metaWrites.find((n) => n.right.type === 'NewExpression');
  const arg = built.right.arguments[0];
  assert.ok(arg && arg.type === 'ObjectExpression', 'the media metadata is not built from an object literal');
  for (const prop of arg.properties) {
    const key = prop.key && (prop.key.name || prop.key.value);
    if (key !== 'title' && key !== 'artist') continue;
    const fallbacks = collect(prop.value, (n) => n.type === 'LogicalExpression' && n.operator === '||'
      && n.right.type === 'StringLiteral' && n.right.value !== '');
    assert.equal(fallbacks.length, 0,
      `the media session invents a ${key} when the reading carries none — an unmeasured claim on the lock screen`);
  }

  // and it follows the reading rather than firing once
  const eff = collect(AST, (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression'
    && n.callee.property && n.callee.property.name === 'useEffect'
    && n.arguments.length === 2 && n.arguments[0] === ms);
  assert.equal(eff.length, 1, 'the media-session block is not a useEffect with a dependency array');
  assert.ok(collect(eff[0].arguments[1], (n) => n.type === 'Identifier' && n.name === 'nowPlaying').length > 0,
    'the media session does not depend on nowPlaying — it would keep whatever it published first');
});

test('a settled session is not undone by a probe that was already in flight', () => {
  // ⚠ THE FINDING (Codex, round 12). The mount probe and the press are two readings of
  // one thing taken at different times, and the probe's `/api/me` leg is a round trip
  // that can still be in flight when the member presses. If the SDK bridges or refreshes
  // a session in between, the press resolves one, the station answers 200, audio starts —
  // and then the OLD probe lands `{user:null}`, publishes signed-out over a member who is
  // listening, disables the transport and starts the VISITOR PREVIEW SIMULATION on top of
  // a real stream. A fabricated signal shown to a paying member is the one thing this page
  // exists to refuse, reached by a stale answer to a question already settled.
  const fns = functionsOf(AST);

  // there is a marker, and the press sets it
  const settles = collect(AST, (n) => n.type === 'AssignmentExpression'
    && n.left.type === 'MemberExpression' && n.left.property && n.left.property.name === 'current'
    && n.right.type === 'BooleanLiteral' && n.right.value === true
    && n.left.object.type === 'Identifier' && /settled/i.test(n.left.object.name));
  assert.ok(settles.length >= 2,
    'the session has no settled marker set by both the mount probe and the press');
  const markerName = settles[0].left.object.name;

  const stationFn = innermost(fns.filter((fn) => collect(fn, (n) => n.type === 'StringLiteral'
    && n.value === '/api/radio/station').length > 0), 'the station fetch');
  assert.ok(collect(stationFn, (n) => settles.includes(n)).length > 0,
    'the press never marks the session settled — its newer reading cannot outrank the mount probe');

  // ⚠ AND SETTLING MUST PUBLISH IN THE SAME BREATH. Found by mutation, not by reading:
  // marking the session settled WITHOUT resolving it blocks the mount probe's write and
  // then never supplies one of its own, so `signedIn` stays unresolved for the life of
  // the page — the marker suppressing the only reading that was going to arrive. The
  // rule is applied to EVERY settle rather than the press's, because it is the same
  // mistake wherever the marker is set.
  for (const st of settles) {
    const together = collect(AST, (n) => n.type === 'IfStatement'
      && st.start > n.start && st.end < n.end
      && collect(n, (c) => calleeName(c) === 'setSignedIn'
        && c.arguments.length === 1 && c.arguments[0].type === 'BooleanLiteral' && c.arguments[0].value === true).length > 0);
    assert.ok(together.length > 0,
      'the session is marked settled without being resolved — the marker blocks the probe and supplies nothing');
  }

  // EVERY /api/me write is gated on it. This is the half that matters: a marker nothing
  // reads is decoration, and the read has to be on the writes rather than merely present
  // somewhere in the effect.
  const sessionFn = innermost(fns.filter((fn) => collect(fn, (n) => n.type === 'StringLiteral'
    && n.value === '/api/me').length > 0), 'the session effect');
  const probeWrites = collect(sessionFn, (n) => calleeName(n) === 'setSignedIn'
    && !(n.arguments.length === 1 && n.arguments[0].type === 'BooleanLiteral' && n.arguments[0].value === true));
  assert.ok(probeWrites.length > 0, 'the mount probe publishes no session verdict — this guard is reading the wrong function');
  for (const w of probeWrites) {
    const guarded = collect(sessionFn, (n) => n.type === 'IfStatement'
      && collect(n.test, (c) => c.type === 'MemberExpression' && c.object.type === 'Identifier'
        && c.object.name === markerName).length > 0
      && w.start > n.start && w.end < n.end);
    assert.ok(guarded.length > 0,
      `a mount-probe write to signedIn is not gated on ${markerName} — it can overwrite a session the press already settled`);
  }

  // ...and a measured verdict is never hidden behind an UNMEASURED session. `configured`
  // is only ever set from a 200, which the route answers to a signed-in caller alone, so
  // gating its line on `=== true` hid a reading we had actually taken.
  assert.equal((BARE.match(/configured === false && st\.signedIn === true/g) || []).length, 0,
    'the no-station verdict is gated on a resolved session — a measured answer hidden behind an unmeasured one');
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

  // ⚠ AND EACH STATUS BRANCH MUST **STOP**, WHICH NOTHING ABOVE ASKED — the SIXTH
  // instance of the round-3/4/6/8 class and the first one found inside a guard rather
  // than inside the code. Every assertion above reads source TEXT for the two
  // setRefusal calls; not one proves either branch exits. Proven by mutation before it
  // was written: drop `return false` from the 401 and all eleven tests stay green,
  // while the branch falls straight into `if (!r.ok)` — which is TRUE for a 401 — and
  // the refusal is OVERWRITTEN with "unavailable". A member whose session lookup
  // faulted is then told we could not complete the attempt instead of to sign in, and
  // a confirmed minor gets the same sentence, which is round 1's whole finding undone
  // by the absence of one keyword.
  //
  // The branches are DERIVED from the status comparison rather than named, so a third
  // code added later arrives already covered.
  const playFn = innermost(functionsOf(AST).filter((fn) => collect(fn, (n) => n.type === 'StringLiteral'
    && n.value === '/api/radio/station').length > 0), 'play()');
  const statusBranches = collect(playFn, (n) => n.type === 'IfStatement'
    && n.test.type === 'BinaryExpression' && n.test.operator === '==='
    && [n.test.left, n.test.right].some((x) => x.type === 'MemberExpression' && x.property && x.property.name === 'status')
    && [n.test.left, n.test.right].some((x) => x.type === 'NumericLiteral'));
  assert.ok(statusBranches.length >= 2,
    `expected the status-coded refusal branches in play(), found ${statusBranches.length}`);
  const named = [];
  for (const g of statusBranches) {
    const code = [g.test.left, g.test.right].find((x) => x.type === 'NumericLiteral').value;
    const says = collect(g, (n) => calleeName(n) === 'setRefusal'
      && n.arguments.length === 1 && n.arguments[0].type === 'StringLiteral');
    assert.ok(says.length > 0, `the ${code} branch records no refusal, so the deck can say nothing about it`);
    named.push(says[0].arguments[0].value);
    assert.ok(exitsOwnScope(g),
      `the ${code} branch does not return in its own scope — it falls into the !r.ok guard, which overwrites its refusal with the generic one`);
  }
  // ...and they name DIFFERENT refusals, or two causes are given one remedy — which is
  // the #2005 defect the sentences above exist to keep apart.
  assert.equal(new Set(named).size, named.length,
    `two status branches share one refusal (${named.join(', ')})`);
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

  // ⚠ A CHECK IS A BRANCH THAT EXITS, NOT A CALL (Codex, round 9). This marked every
  // `isCurrent()` CALL as a check, so `isCurrent();` as a bare statement — its result
  // thrown away — cleared `stale` and let every later write straight through, which is
  // the whole defect the walk exists to catch. The same says-but-does-not-stop shape as
  // the four branches this file already guards, this time inside the instrument that
  // guards them: a call's PRESENCE standing in for what its result does.
  //
  // Two shapes count, and both are exits rather than mentions:
  //   (a) `if (!isCurrent()) return …` — a check for everything after it;
  //   (b) a write inside `if (isCurrent()) { … }` — a check for that block alone.
  // Anything else FAILS rather than passing. That direction is deliberate: an
  // unrecognised guard shape is one nobody has proven, and a walk that silently
  // accepts it is the instrument this finding was about.
  const namesIsCurrent = (n) => collect(n, (c) => calleeName(c) === 'isCurrent').length > 0;
  const exitChecks = collect(play, (n) => n.type === 'IfStatement' && !inNested(n.start)
    && n.test.type === 'UnaryExpression' && n.test.operator === '!' && namesIsCurrent(n.test)
    && exitsOwnScope(n.consequent));
  const blockGuards = collect(play, (n) => n.type === 'IfStatement' && !inNested(n.start)
    && n.test.type === 'CallExpression' && calleeName(n.test) === 'isCurrent');
  const inBlockGuard = (at) => blockGuards.some((g) => at > g.consequent.start && at < g.consequent.end);

  const marks = exitChecks.map((c) => ({ at: c.start, kind: 'check' }));
  walk(play, (n) => {
    if (inNested(n.start)) return;
    if (n.type === 'AwaitExpression') marks.push({ at: n.start, kind: 'await' });
    else if ((calleeName(n) === 'setRefusal' || calleeName(n) === 'setConfigured') && !inBlockGuard(n.start)) marks.push({ at: n.start, kind: 'write', what: n.callee.name });
    else if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression'
      && ((n.left.object.name === 'audio' && n.left.property.name === 'src')
        || n.left.object.name === 'startedAtRef') && !inBlockGuard(n.start)) marks.push({ at: n.start, kind: 'write', what: 'audio/clock' });
  });
  marks.sort((a, b) => a.at - b.at);

  assert.ok(marks.some((m) => m.kind === 'await'), 'play() has no await — this guard is reading the wrong function');
  assert.ok(marks.some((m) => m.kind === 'check'),
    'play() has no isCurrent() branch that EXITS — a call whose result goes nowhere guards nothing');
  // ...and the calls and the branches agree in number, or one `isCurrent()` is doing
  // something this walk does not model and is being counted as though it were.
  assert.equal(collect(play, (n) => calleeName(n) === 'isCurrent' && !inNested(n.start)).length,
    exitChecks.length + blockGuards.length,
    'an isCurrent() call is neither an exiting branch nor a guarded block — its result is unused or used in a shape this guard cannot verify');

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

  // ⚠ AND THE NON-FAILURE BRANCH MUST **EXIT** BEFORE THE CLEANUP (Codex, round 8) —
  // the fourth instance of one class, and the one I asked that round to go looking for.
  // Every assertion above inspects what the failure path DOES and none proves the
  // ordinary pause never reaches it: drop the `return` from `if (!bad) return` and a
  // deliberate Pause falls through to setRefusal("unavailable") and drops the cached
  // source — a station failure reported for a button the listener pressed on purpose,
  // plus a needless refetch on every resume. Saying the right thing is not stopping.
  const notBad = collect(stoppedFn, (n) => n.type === 'IfStatement'
    && n.test.type === 'UnaryExpression' && n.test.operator === '!'
    && n.test.argument.type === 'Identifier');
  assert.ok(notBad.length > 0, 'the terminal handler does not branch on its failure flag at all');
  assert.ok(notBad.some(exitsOwnScope),
    'the non-failure branch does not return in its own scope — an ordinary pause falls through to the failure cleanup');

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
  assert.ok(okGuards.some(exitsOwnScope),
    'the non-ok branch does not return in its own scope — a 402/503 falls through to the configuration verdict');
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
  const returns = ownScopeExits(guard).filter((n) => n.type === 'ReturnStatement' && n.argument);
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
  // ⚠ AND THE POLL SUPERSEDES (Codex, round 8) — the same rule `play()` got in round 2
  // and this did not. Two polls in flight (one slower than the 15 s interval) and the
  // older landing last overwrites the current track with metadata already known to be
  // stale, and drives radioProgram with it.
  // The token is DERIVED rather than named here: find the variable the poll advances
  // with `+= 1`, then require every setNowPlaying to sit inside a condition that reads
  // it. Pinning the spelling `mine === seq` would pin whatever that spelling is wrong
  // about, which is this repo's most-repeated lesson.
  // ⚠ AND THE TOKEN MUST BE COMPARED WITH ITS SNAPSHOT, NOT MERELY MENTIONED (Codex,
  // round 9). This required only that the incremented identifier OCCUR somewhere in an
  // enclosing condition, so `if (on && seq > 0)` satisfied it completely while an older
  // poll could still overwrite a newer track. Naming a variable is not comparing it.
  //
  // So both halves are derived: the token from the `+= 1`, and the SNAPSHOT from the
  // declarator that captured it (`const mine = (seq += 1)`). Every setNowPlaying must
  // then sit inside a condition that compares those two — which is the only expression
  // that can actually tell a superseded response from the current one.
  const pollParents = new Map();
  walk(poll, (n, p) => { if (p) pollParents.set(n, p); });
  const bumps = collect(poll, (n) => n.type === 'AssignmentExpression' && n.operator === '+='
    && n.left.type === 'Identifier');
  assert.ok(bumps.length > 0, 'the now-playing poll advances no attempt token — a slow response can overwrite a newer one');
  const pairs = bumps.map((b) => {
    const p = pollParents.get(b);
    const snap = p && p.type === 'VariableDeclarator' && p.id && p.id.type === 'Identifier' ? p.id.name
      : (p && p.type === 'AssignmentExpression' && p.left.type === 'Identifier' && p.right === b ? p.left.name : null);
    return { token: b.left.name, snap };
  }).filter((x) => x.snap && x.snap !== x.token);
  assert.ok(pairs.length > 0,
    'the poll advances a token without capturing the value for this tick — there is nothing to compare a late response against');
  const comparesPair = (node) => collect(node, (x) => x.type === 'BinaryExpression'
    && (x.operator === '===' || x.operator === '!==')
    && pairs.some((p) => {
      const names = [x.left, x.right].filter((sd) => sd.type === 'Identifier').map((sd) => sd.name);
      return names.includes(p.token) && names.includes(p.snap);
    })).length > 0;
  const writes = collect(poll, (n) => calleeName(n) === 'setNowPlaying');
  assert.ok(writes.length > 0, 'the poll never sets the track — this guard is reading the wrong function');
  for (const w of writes) {
    const guarding = collect(poll, (n) => (n.type === 'IfStatement' || n.type === 'LogicalExpression'
      || n.type === 'ConditionalExpression')
      && w.start > n.start && w.end < n.end
      && comparesPair(n.test || n.left || {}));
    assert.ok(guarding.length > 0,
      'a now-playing response is applied without comparing this tick against the current attempt — a slow poll can overwrite a newer one');
  }

  for (const c of catches) {
    const handler = c.arguments[0];
    assert.ok(handler, 'the now-playing catch takes no handler');
    assert.ok(collect(handler, (n) => calleeName(n) === 'setNowPlaying').length > 0,
      'a failed now-playing poll keeps the last track on screen — a reading we cannot take is not a reading');
  }
});

test('Nora can be handed the analyser that did not exist when her booth opened', () => {
  // ⚠ A REGRESSION AGAINST THE PAGE THIS ONE RETIRES (Codex, round 8). The old player
  // built its stage only once the graph existed. Here the booth is its own control and
  // a visitor very reasonably opens Nora BEFORE pressing Tune in — at which point
  // `window.__shapeRadioGraph` is null, `NoraStage` stored that null, and there was no
  // way to tell it otherwise. She stood still for the rest of the session with the
  // station playing, which is the one feature the PR claimed was ported losslessly.
  //
  // Three files have to agree, so all three are read and the EVENT NAME IS DERIVED from
  // the dispatcher rather than typed twice — two spellings of one channel is how the
  // announcement and the listener come apart while each looks right.
  const stageSrc = readFileSync(new URL('../public/newdesign/noraStage.mjs', import.meta.url), 'utf8');
  const boothSrc = readFileSync(new URL('../public/newdesign/radio.jsx', import.meta.url), 'utf8');
  const stageAst = parse(stageSrc, { sourceType: 'module' });
  const boothAst = parse(boothSrc, { sourceType: 'script', plugins: ['jsx'] });

  // 1. the stage can learn one later at all
  const setter = collect(stageAst, (n) => n.type === 'ClassMethod' && n.key.name === 'setAnalyser');
  assert.equal(setter.length, 1, 'NoraStage has no setAnalyser — a stage handed null stays deaf for the life of the page');
  const setterSrc = stageSrc.slice(setter[0].start, setter[0].end);
  assert.match(setterSrc, /this\.analyser\s*=/, 'setAnalyser does not store the analyser');
  assert.match(setterSrc, /_freq\s*=\s*new Uint8Array/,
    'setAnalyser does not resize the frequency buffer — it is sized from the analyser at construction');

  // 2. the instrument announces the graph, and on which channel
  const dispatches = collect(AST, (n) => n.type === 'NewExpression'
    && n.callee.name === 'CustomEvent' && n.arguments[0] && n.arguments[0].type === 'StringLiteral');
  assert.ok(dispatches.length > 0, 'the instrument announces no graph — an already-open booth can never learn of it');
  const channels = dispatches.map((d) => d.arguments[0].value);

  // 3. the booth listens on that same derived channel, and binds the analyser when it fires
  const listeners = collect(boothAst, (n) => n.type === 'CallExpression'
    && n.callee.type === 'MemberExpression' && n.callee.property.name === 'addEventListener'
    && n.arguments[0] && n.arguments[0].type === 'StringLiteral'
    && channels.includes(n.arguments[0].value));
  assert.ok(listeners.length > 0,
    `the booth listens on none of the channels the instrument announces (${channels.join(', ')})`);
  // ⚠ THE HANDLER ITSELF, WITH NO WHOLE-FILE FALLBACK (Codex, round 9). That `||` was
  // written as belt-and-braces and removed the belt: the post-load re-read in step 4 is
  // another `setAnalyser` in the same file, so deleting the call from THIS handler left
  // the assertion green — while a graph built after Nora has fully opened would never be
  // bound, because the one-time re-read has already happened. A fallback that can be
  // satisfied by the thing you are about to assert separately is not a fallback.
  // ⚠ AND THE HANDLER IS PASSED BY NAME, SO IT HAS TO BE RESOLVED TO ITS BINDING —
  // which is what the `||` was quietly covering for. `addEventListener("…", bind)` hands
  // an Identifier, and collecting over an Identifier finds nothing: the check was
  // failing on correct code and passing on the fallback, which is the worst of both.
  // An unresolvable handler now FAILS rather than being waved through.
  const resolveFn = (arg) => {
    if (!arg) return null;
    if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') return arg;
    if (arg.type !== 'Identifier') return null;
    const decls = collect(boothAst, (n) => n.type === 'VariableDeclarator'
      && n.id.type === 'Identifier' && n.id.name === arg.name && n.init
      && (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression'));
    if (decls.length) return innermost(decls, `the handler ${arg.name}`).init;
    const fds = collect(boothAst, (n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === arg.name);
    return fds.length ? innermost(fds, `the handler ${arg.name}`) : null;
  };
  const handlers = listeners.map((l) => resolveFn(l.arguments[1])).filter(Boolean);
  assert.equal(handlers.length, listeners.length,
    'a shape:radiograph listener was registered with a handler this guard cannot resolve — it would pass without ever being read');
  // ⚠ A CALL, NOT A MENTION. The handler guards on `stageRef.current.setAnalyser`
  // before calling it, so a MemberExpression match is satisfied by the CAPABILITY CHECK
  // alone — replacing the call body with `void g.analyser` left this green. Same shape
  // as the round-9 isCurrent finding one test up: a token appearing where the thing it
  // names is supposed to happen.
  assert.ok(handlers.some((h) => collect(h, (n) => n.type === 'CallExpression'
    && n.callee.type === 'MemberExpression' && n.callee.property.name === 'setAnalyser').length > 0),
    'the booth hears the graph and never hands it to the stage — a graph built after she opened is lost');

  // 4. ...and it re-reads after the async load, or a graph that arrived mid-download is
  //    announced to a stage that does not exist yet — the both-ways problem setColor has
  const open = innermost(functionsOf(boothAst).filter((f) => /await stage\.load\(\)/
    .test(boothSrc.slice(f.start, f.end))), 'the booth open() handler');
  const loadAwait = collect(open, (n) => n.type === 'AwaitExpression'
    && /stage\.load\(\)/.test(boothSrc.slice(n.start, n.end)));
  assert.equal(loadAwait.length, 1, 'could not locate the stage load await');
  const afterLoad = collect(open, (n) => n.type === 'MemberExpression'
    && n.property.name === 'setAnalyser' && n.start > loadAwait[0].end);
  assert.ok(afterLoad.length > 0,
    'the booth never re-reads the graph after the VRM finishes loading — one that arrived mid-download is lost');

  // 5. ...and a load that THROWS leaves nothing running (Codex, round 9). `stageRef` is
  //    assigned only once load() and start() have both succeeded, so the catch had
  //    `stageRef.current === null` and disposed nothing — while NoraStage allocates its
  //    WebGLRenderer in the CONSTRUCTOR. Each retry leaked another live context, which a
  //    browser caps and silently evicts rather than reporting: the symptom is the booth
  //    quietly failing to draw on some later attempt with nothing in the log.
  //
  //    The load-bearing part is WHERE the handle is taken. A binding assigned after the
  //    await is not reachable from a failure of that await, which is the bug exactly, so
  //    the assignment is required to sit BEFORE it.
  // ⚠ THE TRY THAT COVERS THE LOAD, not the smallest one: open() also wraps
  // `context.resume()` in its own try, and `innermost` would pick that — the
  // enclosing-node reducer being right for containment lookups and wrong here, where
  // the node wanted is the one that CONTAINS the await rather than the one nearest it.
  const tries = collect(open, (n) => n.type === 'TryStatement'
    && loadAwait[0].start > n.block.start && loadAwait[0].end < n.block.end);
  assert.equal(tries.length, 1, `expected exactly one try around the stage load, found ${tries.length}`);
  const tryStmt = tries[0];
  const inTry = (n) => n.start > tryStmt.block.start && n.end < tryStmt.block.end;
  const outerNames = new Set(collect(open, (n) => n.type === 'VariableDeclarator'
    && n.id.type === 'Identifier' && !inTry(n)).map((n) => n.id.name));
  const handles = collect(tryStmt.block, (n) => n.type === 'AssignmentExpression'
    && n.left.type === 'Identifier' && outerNames.has(n.left.name)
    && n.start < loadAwait[0].start);
  assert.ok(handles.length > 0,
    'the stage open() builds is never handed to a binding outside the try before the load — a failed load leaves its WebGLRenderer undisposed');
  const handler = tryStmt.handler;
  assert.ok(handler, 'open() has no catch clause at all');
  const handleNames = new Set(handles.map((h) => h.left.name));
  assert.ok(collect(handler, (n) => n.type === 'Identifier' && handleNames.has(n.name)).length > 0,
    'the failure path never reads the stage this attempt built — its WebGL context leaks, and a browser evicts rather than reports');
  assert.ok(collect(handler, (n) => n.type === 'MemberExpression' && n.property.name === 'dispose').length > 0,
    'the failure path disposes nothing');
});

test('a set schedule we could not read is never published as an empty one', () => {
  // ⚠ THE FIFTH INSTANCE OF THE ROUND-3/4/6/8 CLASS, AND THE FIRST I WENT LOOKING FOR
  // RATHER THAN BEING HANDED. That class is *a statement's presence standing in for the
  // control flow around it*; its sibling, which this closes, is *a failure of ours
  // published as a fact about the station*. `RdSetsComingUp` had THREE doors — a
  // Supabase client that never loaded, a query that faulted, a request that never
  // landed — and all three answered `setRows([])`, which renders "Schedule lands with
  // the first broadcast." That is the "No station on the air yet" finding one component
  // below where it took four rounds to close, and this PR's own description asserts the
  // schedule here "is real".
  //
  // ⚠ AND THE GUARD ASKS THE INVARIANT, NOT THE SENTINEL. It DERIVES which value means
  // "could not read" from the doors themselves, so renaming it to a string or a symbol
  // keeps the test meaningful; what it forbids is the empty array, and what it requires
  // is that the sentinel is settled before `rows` is ever read as a list.
  const src = readFileSync(new URL('../public/newdesign/radio.jsx', import.meta.url), 'utf8');
  const ast = parse(src, { sourceType: 'script', plugins: ['jsx'] });

  const fn = innermost(
    collect(ast, (n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'RdSetsComingUp'),
    'RdSetsComingUp in radio.jsx',
  );

  const litKey = (n) => {
    if (!n) return null;
    if (n.type === 'NullLiteral') return 'null';
    if (n.type === 'BooleanLiteral' || n.type === 'StringLiteral' || n.type === 'NumericLiteral') {
      return `${n.type}:${String(n.value)}`;
    }
    return null;
  };

  // the "not resolved yet" value, read off useState rather than assumed
  const useStateCall = innermost(
    collect(fn, (n) => n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression'
      && n.callee.property && n.callee.property.name === 'useState'),
    'the useState call in RdSetsComingUp',
  );
  assert.equal(useStateCall.arguments.length, 1, 'useState takes one initial value here');
  const unresolved = litKey(useStateCall.arguments[0]);
  assert.ok(unresolved, 'the initial state is not a literal, so "not resolved yet" cannot be identified');

  const setters = collect(fn, (n) => calleeName(n) === 'setRows');
  assert.ok(setters.length >= 4, `expected the three failure doors plus the success arm, found ${setters.length}`);

  // 1. no door publishes a MEASURED empty for a read that did not happen
  const emptyArrays = setters.filter((n) => n.arguments.length === 1
    && n.arguments[0].type === 'ArrayExpression' && n.arguments[0].elements.length === 0);
  assert.equal(emptyArrays.length, 0,
    'setRows([]) — an unreadable schedule rendered as "Schedule lands with the first broadcast."');

  // 2. exactly one sentinel across the doors, and it is not the not-resolved value
  const doorLits = setters.map((n) => litKey(n.arguments[0])).filter(Boolean);
  const kinds = new Set(doorLits);
  assert.equal(kinds.size, 1,
    `the failure doors disagree about what "could not read" is (${[...kinds].join(', ') || 'none'})`);
  const sentinel = doorLits[0];
  assert.notEqual(sentinel, unresolved,
    'the unreadable sentinel is the same value as "not resolved yet", so the two states cannot be told apart');
  assert.equal(doorLits.length, 3, `expected all three failure doors to set it, found ${doorLits.length}`);

  // 3. the sentinel is settled BEFORE rows is read as a list
  const rowsIs = (n) => n.type === 'BinaryExpression' && (n.operator === '===' || n.operator === '!==')
    && ((n.left.type === 'Identifier' && n.left.name === 'rows' && litKey(n.right) === sentinel)
      || (n.right.type === 'Identifier' && n.right.name === 'rows' && litKey(n.left) === sentinel));
  const cmps = collect(fn, rowsIs);
  assert.ok(cmps.length > 0, 'nothing in the render distinguishes the unreadable schedule from an empty one');
  const listReads = collect(fn, (n) => n.type === 'MemberExpression'
    && n.object.type === 'Identifier' && n.object.name === 'rows'
    && n.property && (n.property.name === 'length' || n.property.name === 'map'));
  assert.ok(listReads.length > 0, 'the render never reads rows as a list — this guard is pointed at the wrong component');
  assert.ok(Math.min(...cmps.map((n) => n.start)) < Math.min(...listReads.map((n) => n.start)),
    'rows is read as a list before the unreadable sentinel is ruled out');

  // 4. ...and the not-resolved branch STOPS, which is the round-8 discipline applied here
  const unresolvedCmp = innermost(
    collect(fn, (n) => n.type === 'BinaryExpression' && n.operator === '==='
      && ((n.left.type === 'Identifier' && n.left.name === 'rows' && litKey(n.right) === unresolved)
        || (n.right.type === 'Identifier' && n.right.name === 'rows' && litKey(n.left) === unresolved))),
    'the "not resolved yet" comparison',
  );
  const unresolvedIf = innermost(
    collect(fn, (n) => n.type === 'IfStatement' && n.test.start <= unresolvedCmp.start && n.test.end >= unresolvedCmp.end),
    'the if guarding the not-resolved state',
  );
  const uBody = unresolvedIf.consequent.type === 'BlockStatement'
    ? unresolvedIf.consequent.body : [unresolvedIf.consequent];
  assert.ok(uBody.length > 0 && uBody[uBody.length - 1].type === 'ReturnStatement',
    'the not-resolved branch does not return, so an unresolved schedule falls through into the render');

  // 5. ...and every door STOPS too. A door that records the verdict and then carries on
  //    is the round-8 pause branch exactly: the state is right for one statement and
  //    then the success arm overwrites it.
  const parents = new Map();
  walk(fn, (n, p) => { if (p) parents.set(n, p); });
  const escapes = (call) => {
    let cur = call;
    while (cur && cur !== fn) {
      const p = parents.get(cur);
      if (!p) return false;
      if (p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression') return false;
      if (Array.isArray(p.body) && p.body.includes(cur)) {
        const after = p.body.slice(p.body.indexOf(cur) + 1);
        if (after.length) return !(after[0].type === 'ReturnStatement' || after[0].type === 'ThrowStatement');
      }
      cur = p;
    }
    return false;
  };
  for (const call of setters.filter((n) => litKey(n.arguments[0]) === sentinel)) {
    assert.equal(escapes(call), false,
      `a failure door at offset ${call.start} records "could not read" and then carries on`);
  }
});
