// /api/me answers three things, not two.
//
// ⚠ IT USED TO ANSWER TWO, AND THE DASHBOARD GATE IS WHAT MADE THAT DANGEROUS.
// `supabase.auth.getUser()` validates the JWT against the auth server, so it resolves
// `{ user: null, error }` for a transient failure exactly as it does for a visitor
// with no session. The route discarded the error and called both "signed out" — which
// was harmless while callers only used the answer to pick which nav to draw, and stops
// being harmless the moment a caller REDIRECTS on it. Codex raised it on #2064 against
// the gate added in that same PR; the gate's fail-open was real for a dead network and
// hollow for the failure most likely to happen.
//
// These drive the shipped GET against a scripted auth client, because the whole
// finding is about which of two indistinguishable-looking results the route returns —
// a question no source scan can answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
const SRC = readFileSync(path.join(ROOT, 'src', 'app', 'api', 'me', 'route.ts'), 'utf8');

// The real errors, from the SDK the route imports — not hand-rolled look-alikes, which
// is the fixture-invents-a-shape trap this repo has paid for more than once.
const { AuthSessionMissingError, AuthApiError, AuthRetryableFetchError, isAuthSessionMissingError } =
  await import('@supabase/supabase-js');

// The route is a Next server module; rather than stand up its five dependencies, the
// decision it makes is lifted and driven. `isMeasuredSignedOut` IS the finding's answer,
// so it is the thing under test — and it is lifted from source, so an equivalent
// rewrite passes and a real change fails.
function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' is gone from the route — the third state may have gone with it');
  const open = SRC.indexOf('{', SRC.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}' && --depth === 0) {
      const body = SRC.slice(at, i + 1);
      assert.ok(body.length > 120, name + ' lifted only ' + body.length + ' chars — the matcher is reading the wrong span');
      // Strip the TypeScript annotations; the logic underneath is plain JS.
      // ⚠ THE CAST GOES FIRST. Stripping `: unknown` ahead of it turns
      // `(error as { status?: unknown })` into `(error as { status? })` — the
      // annotation rule eats the cast's own inner type and leaves the `as`, which is
      // a SyntaxError that reads as "the route is broken" rather than "the lift is".
      const js = body
        .replace(/\(\s*error\s+as\s+\{[^}]*\}\s*\)/g, 'error')
        .replace(/function\s+(\w+)\(([^)]*)\)\s*:\s*boolean/, 'function $1($2)')
        .replace(/:\s*unknown/g, '');
      assert.ok(!/\bas\s+\{/.test(js), 'a TypeScript cast survived the lift: ' + js);
      // ⚠ THE SDK'S OWN PREDICATE IS INJECTED, NOT RESTATED. The lifted body calls
      // `isAuthSessionMissingError`, which is an import the `new Function` scope does
      // not have — and the tempting repair is a one-line local copy, after which the
      // suite is measuring the copy instead of the library the route actually calls.
      return new Function('isAuthSessionMissingError', js + '\nreturn ' + name + ';')(
        isAuthSessionMissingError,
      );
    }
  }
  throw new Error(name + ' is unbalanced');
}

const isMeasuredSignedOut = lift('isMeasuredSignedOut');

test('a clean read that finds nobody is a measured answer', () => {
  assert.equal(isMeasuredSignedOut(null), true);
  assert.equal(isMeasuredSignedOut(undefined), true);
});

test('no token presented is a measured answer', () => {
  // The SDK's own comment on this path: "the user is signed out".
  assert.equal(isMeasuredSignedOut(new AuthSessionMissingError()), true);
});

test('a token the auth server checked and refused is a measured answer', () => {
  for (const status of [401, 403]) {
    assert.equal(isMeasuredSignedOut(new AuthApiError('invalid claim', status, undefined)), true,
      status + ' should read as a real refusal');
  }
});

// ⚠ THE DIRECTION THAT MATTERS. Every case below used to return 200 { user: null },
// which the gate reads as confirmed anonymity and acts on by sending a signed-in
// member to a login form that does not forward a live session.
test('a read that did not complete is NOT a measured answer', () => {
  const cases = [
    ['the auth server 500ed', new AuthApiError('internal', 500, undefined)],
    ['the auth server was rate limiting', new AuthApiError('too many requests', 429, undefined)],
    ['the fetch itself failed', new AuthRetryableFetchError('network down', 0)],
    ['an error shape we do not recognise', new Error('something else entirely')],
    ['an error carrying no status at all', { message: 'opaque' }],
  ];
  for (const [why, err] of cases) {
    assert.equal(isMeasuredSignedOut(err), false, why + ' must not read as signed out');
  }
});

// ⚠ AND THE ALLOW-LIST SHAPE IS THE POINT, NOT AN IMPLEMENTATION DETAIL. Written as a
// deny-list of known failures, the NEXT unanticipated error reads as confirmed
// anonymity — which is the direction that costs a member their dashboard. The case
// above ('an error shape we do not recognise') is what proves it, and this pins the
// reasoning so a later simplification cannot quietly invert it.
test('an unanticipated error fails toward rendering, not toward the login form', () => {
  class SomeFutureAuthError extends Error {}
  assert.equal(isMeasuredSignedOut(new SomeFutureAuthError('invented')), false);
});

// ⚠ THIS ASSERTS THE BRANCH IS REACHED, NOT THAT ITS TEXT IS PRESENT, AND THE
// MUTATION ROUND IS WHY. The first version matched `/status: 503/` against the source
// — which passes with the branch's condition replaced by `false`, because the string
// is still there and simply unreachable. Every other assertion in this file drives the
// predicate, so the whole suite was green on a route that could never answer 503: the
// exact "a guard that reports a pass is a broken instrument" shape, in the guard
// written for the finding. Parsed now, so a rename or a reformat passes and only an
// actual bypass fails.
test('the 503 branch is reachable, and its condition is the predicate', async () => {
  const { parse } = await import('@babel/parser');
  const ast = parse(SRC, { sourceType: 'module', plugins: ['typescript'] });

  let guard = null;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'IfStatement') {
      const t = n.test;
      // `if (!isMeasuredSignedOut(error))` — a unary-not over a call to the predicate.
      if (t && t.type === 'UnaryExpression' && t.operator === '!' &&
          t.argument && t.argument.type === 'CallExpression' &&
          t.argument.callee && t.argument.callee.name === 'isMeasuredSignedOut') {
        guard = n;
      }
    }
    for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'leadingComments' && k !== 'trailingComments') walk(n[k]);
  };
  walk(ast.program.body);

  assert.ok(guard, 'nothing in the route branches on !isMeasuredSignedOut(error) — the 503 is unreachable');
  const branch = SRC.slice(guard.consequent.start, guard.consequent.end);
  assert.match(branch, /status:\s*503/, 'that branch no longer answers 503');
  assert.match(branch, /unknown:\s*true/, 'that branch no longer marks itself unknown');

  // The gate reads `r.ok`, so the STATUS is what carries this — a 200 with a flag
  // would need three copies of that gate to learn a new field.
  const body = SRC.slice(SRC.indexOf('export async function GET'));
  assert.ok(body.indexOf('503') < body.indexOf('return NextResponse.json({ user: null })'),
    'the indeterminate branch must come before the plain signed-out answer');
});

test('the discriminator comes from the SDK, not from a copy of its rules', () => {
  // A hand-rolled `error.name === "AuthSessionMissingError"` is a spelling pin on a
  // library's internals; the library exports the predicate for exactly this.
  assert.match(SRC, /import \{ isAuthSessionMissingError \} from '@supabase\/supabase-js'/);
});
