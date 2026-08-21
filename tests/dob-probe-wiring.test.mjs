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

// ⚠ THE FIRST VERSION OF THIS RULE PASSED VACUOUSLY, AND ITS OWN MUTATION TEST
// MISSED THAT. It split on the literal `fetch('<endpoint>'`, so a caller that kept
// the endpoint but used DOUBLE quotes — or a template literal, or a query string —
// matched nothing, contributed no offenders, and the rule reported success having
// inspected NOTHING. Proven by mutation: re-quoting one call site and deleting its
// `no-store` still passed. The mutation that would have caught it changed the
// SHAPE of the call, not the property being asserted — mutating only the thing you
// already believe in confirms only what you already believe.
//
// So the rule now has two halves, and the second is what keeps it honest: every
// file containing the endpoint must yield at least one call site this test could
// actually READ. A file it cannot parse is a failure, not a pass.
const FETCH_CALL = /fetch\(\s*[`'"][^`'"]*\/api\/me\/date-of-birth[^`'"]*[`'"]/g;

test('every client that calls the DOB endpoint sends cache: no-store', () => {
  const files = callerFiles();
  assert.ok(files.length >= 3, `expected the mobile + web callers, found ${files.length}`);

  const offenders = [];
  const uninspectable = [];
  let inspected = 0;

  for (const f of files) {
    const src = stripComments(readFileSync(join(ROOT, f), 'utf8'));
    const hits = [...src.matchAll(FETCH_CALL)];
    if (!hits.length) {
      // A file can MENTION the endpoint without calling it — src/lib/warroom.ts
      // names it in a records label, 166k characters from its only unrelated
      // fetch(). Distinguishing a mention from a call this rule cannot parse is
      // the difference between a useful failure and a permanent false alarm that
      // gets deleted. A real call has the endpoint inside the fetch's arguments;
      // prose does not.
      const nearCall = [...src.matchAll(/fetch\s*\(/g)]
        .some((m) => src.slice(m.index, m.index + 160).includes(ENDPOINT));
      if (nearCall) uninspectable.push(f);
      continue;
    }
    hits.forEach((m, i) => {
      inspected += 1;
      const opts = src.slice(m.index + m[0].length, m.index + m[0].length + 400);
      if (!/cache:\s*['"]no-store['"]/.test(opts)) offenders.push(`${f} (call ${i + 1})`);
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
