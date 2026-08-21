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

test('every client that calls the DOB endpoint sends cache: no-store', () => {
  const files = callerFiles();
  assert.ok(files.length >= 3, `expected the mobile + web callers, found ${files.length}`);

  const offenders = [];
  for (const f of files) {
    const src = stripComments(readFileSync(join(ROOT, f), 'utf8'));
    // Each fetch() to this endpoint, up to the end of its options object.
    const calls = src.split(`fetch('${ENDPOINT}'`).slice(1);
    calls.forEach((tail, i) => {
      const opts = tail.slice(0, 400);
      if (!/cache:\s*'no-store'/.test(opts)) offenders.push(`${f} (call ${i + 1})`);
    });
  }
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
