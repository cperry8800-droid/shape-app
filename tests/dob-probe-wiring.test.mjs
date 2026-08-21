// The two things about the DOB probe that only its CALL SITE can prove.
//
// ⚠ WHY THIS FILE IS SOURCE-ASSERTED, AND THE LIMIT IS REAL. Both rules live in
// `iosAppBroadsheetMain.jsx`, which calls `createRoot` at module scope and so
// cannot be imported by a test — the same constraint that put the gate itself in
// its own file. A test that supplied the probe's inputs itself would pass with
// the production wiring deleted, which is the failure mode these rules HAVE. So
// these read the shipping source and assert the wiring, and say plainly that
// they are spelling checks rather than behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = '/api/me/date-of-birth';

// ⚠ DERIVED FROM THE TREE, NOT LISTED HERE. A hardcoded list of callers is one
// the next caller silently fails to join — and the whole point of this rule is
// that it must hold for callers nobody has written yet.
function callerFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).filter((f) => {
    if (!/\.(js|jsx|ts|tsx|mjs)$/.test(f)) return false;
    if (f.startsWith('tests/') || f.startsWith('src/app/api/')) return false;
    try { return readFileSync(join(ROOT, f), 'utf8').includes(ENDPOINT); } catch { return false; }
  });
}

const FETCH_CALL = /fetch\(\s*[`'"][^`'"]*\/api\/me\/date-of-birth[^`'"]*[`'"]/g;
const SENDS_NO_STORE = /cache:\s*['"`]no-store['"`]/;

// ⚠ THIS RULE HAS NOW BEEN WRONG TWICE, IN TWO DIFFERENT DIRECTIONS, so it is a
// pure function over a string with its own adversarial tests below. A checker
// nobody can feed hostile input to is a checker nobody has checked.
//
//   1. It split on the literal `fetch('<endpoint>'`, so a caller using DOUBLE
//      quotes matched nothing and the rule passed having inspected nothing.
//   2. It then read a fixed 400-character window after the match, which could
//      reach PAST this call and borrow `cache: 'no-store'` from the next,
//      unrelated request — approving a cacheable DOB probe.
//
// Both holes have one shape: the rule reported success about something it had not
// actually looked at. So the window is now the call's OWN argument list, found by
// scanning to its matching close paren, quote-aware so a paren inside a string
// cannot end it early.
function argumentsOf(src, from) {
  let depth = 1;              // we begin just inside `fetch(`
  let quote = null;
  for (let i = from; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(from, i);
    }
  }
  return null;                // unbalanced — unreadable, and never treated as clean
}

/** Call sites of the DOB endpoint in `src`, each with its own argument text. */
function dobCallSites(src) {
  return [...src.matchAll(FETCH_CALL)].map((m) => ({
    index: m.index,
    args: argumentsOf(src, m.index + m[0].length),
  }));
}

test('the no-store rule reads only the call it is judging', () => {
  // ⚠ THE REGRESSION THAT MOTIVATED THE REWRITE. A cacheable DOB request followed
  // by an unrelated no-store request passed the previous version outright.
  const borrowed = [
    "fetch('/api/me/date-of-birth', { credentials: 'same-origin' });",
    'logSomething();',
    "fetch('/api/telemetry', { cache: 'no-store' });",
  ].join('\n');
  const [dob] = dobCallSites(borrowed);
  assert.ok(dob, 'the DOB call must be found');
  assert.ok(!SENDS_NO_STORE.test(dob.args),
    'a cacheable DOB call must not be excused by a LATER request that happens to set no-store');

  // The honest positive: its own options are read correctly.
  const ok = "fetch('/api/me/date-of-birth', { credentials: 'same-origin', cache: 'no-store' })";
  assert.ok(SENDS_NO_STORE.test(dobCallSites(ok)[0].args));

  // Quoting must not change the verdict — the FIRST hole this rule had.
  for (const q of ["'", '"', '`']) {
    const src = `fetch(${q}/api/me/date-of-birth${q}, { credentials: 'same-origin' })`;
    const [site] = dobCallSites(src);
    assert.ok(site, `a ${q}-quoted call must still be found`);
    assert.ok(!SENDS_NO_STORE.test(site.args), `a ${q}-quoted cacheable call must be flagged`);
  }

  // A nested call inside the options must not end this call's window early.
  const nested = "fetch('/api/me/date-of-birth', { headers: buildHeaders(token), cache: 'no-store' })";
  assert.ok(SENDS_NO_STORE.test(dobCallSites(nested)[0].args),
    'a nested call in the options must not truncate the arguments this rule reads');
});

test('every client that calls the DOB endpoint sends cache: no-store', () => {
  const files = callerFiles();
  assert.ok(files.length >= 3, `expected the mobile + web callers, found ${files.length}`);

  const offenders = [];
  const uninspectable = [];
  let inspected = 0;

  for (const f of files) {
    const src = stripComments(readFileSync(join(ROOT, f), 'utf8'));
    const sites = dobCallSites(src);
    if (!sites.length) {
      // A file can MENTION the endpoint without calling it — src/lib/warroom.ts
      // names it in a records label, 166,200 characters from its only unrelated
      // fetch(). Distinguishing a mention from a call this rule cannot parse is
      // the difference between a useful failure and a permanent false alarm, and
      // a permanent false alarm gets deleted. A real call has the endpoint inside
      // the fetch's arguments; prose does not.
      const nearCall = [...src.matchAll(/fetch\s*\(/g)]
        .some((m) => src.slice(m.index, m.index + 160).includes(ENDPOINT));
      if (nearCall) uninspectable.push(f);
      continue;
    }
    sites.forEach((site, i) => {
      inspected += 1;
      if (site.args === null) { uninspectable.push(`${f} (call ${i + 1}: unbalanced)`); return; }
      if (!SENDS_NO_STORE.test(site.args)) offenders.push(`${f} (call ${i + 1})`);
    });
  }

  assert.deepEqual(uninspectable, [],
    'these files reference the endpoint but this rule could not find a fetch() to check — '
    + `it went blind rather than finding nothing wrong:\n  ${uninspectable.join('\n  ')}`);
  assert.ok(inspected >= 4, `expected at least the four known call sites, inspected ${inspected}`);
  assert.deepEqual(offenders, [],
    `a per-account answer must never be served from cache on a shared device:\n  ${offenders.join('\n  ')}`);
});

// ⚠ THE PROBE FIRED BEFORE THE SESSION EXISTED AND NEVER TRIED AGAIN. `authState`
// is seeded synchronously from the cached state, so `authUserId` — and through
// `signedIn`, `memberAllowed` — are already truthy on the first render, on
// purpose. The probe therefore ran with the CACHED access token, which on a
// returning member's cold boot is the expired one; the 401 was correctly not
// treated as evidence, but no dependency then CHANGED when the refresh landed,
// because it is the same user id. `needed: true` was missed for the whole
// session and the gate silently never appeared.
test('the DOB probe waits for the session restore, and re-runs when it lands', () => {
  const src = stripComments(readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx'), 'utf8'));
  const start = src.indexOf(ENDPOINT);
  assert.ok(start > 0, 'the probe should exist');

  // The effect's guard sits above the fetch; its dependency array below it.
  const guard = src.slice(Math.max(0, start - 1200), start);
  const deps = src.slice(start, start + 1200);

  assert.match(guard, /if\s*\(!authReady\s*\|\|/,
    'the probe must not run before the session restore completes');
  const depMatch = /\}\s*,\s*\[([^\]]*)\]\s*\)/.exec(deps);
  assert.ok(depMatch, 'the effect should declare a dependency array');
  assert.match(depMatch[1], /\bauthReady\b/,
    'authReady must be a dependency — it is the only one that changes when a refreshed session arrives for the SAME user');
});
