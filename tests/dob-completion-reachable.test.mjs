// THE COMPLETION ROUTE MUST STAY REACHABLE BY THE PEOPLE IT EXISTS FOR.
//
// The owner ruled (2026-08-21) that every account must supply a birthdate, which
// ends the grandfathering in `mustRefuseForAge()` for accounts created before
// ADULT_PROOF_REQUIRED_FROM. Those members currently pass the gate on the
// exemption alone; once it is removed they are refused until they supply a date.
//
// So there is exactly one door that must keep working while the gate refuses
// them: POST /api/me/date-of-birth. If that path ever falls INSIDE the gate, the
// remedy becomes unreachable at the precise moment it is needed — a member is
// refused, and the only route that could fix it refuses them too. Nothing about
// that failure is visible in a normal test run: the route works fine for everyone
// who does not need it.
//
// ⚠ THIS TEST READS THE REAL PREFIX LIST OUT OF THE MIDDLEWARE SOURCE. A copy of
// the list here would keep passing after someone widened the real one, which is
// the only way this defect can actually arrive. The same reason the age-gate
// header says to read GATED_API_PREFIXES rather than a prose copy of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const MIDDLEWARE = 'src/lib/supabase/middleware.ts';
const ROUTE_FILE = 'src/app/api/me/date-of-birth/route.ts';
const ROUTE_PATH = '/api/me/date-of-birth';

function arrayLiteral(src, name) {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(src);
  assert.ok(m, `${name} not found in ${MIDDLEWARE} — the gate was restructured; re-read it before trusting this test`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

test('the completion route exists', () => {
  assert.ok(existsSync(ROUTE_FILE), `${ROUTE_FILE} is missing — the ruling has no remedy behind it`);
});

test('the completion route is NOT behind the age/membership gate', () => {
  const src = readFileSync(MIDDLEWARE, 'utf8');
  const gated = arrayLiteral(src, 'GATED_API_PREFIXES');
  assert.ok(gated.length > 0, 'read an empty prefix list — the extraction broke, not the gate');

  const covered = gated.filter((p) => ROUTE_PATH === p || ROUTE_PATH.startsWith(p + '/'));
  if (covered.length) {
    // Covered is survivable ONLY if the path is explicitly skipped.
    const skip = arrayLiteral(src, 'GATE_SKIP');
    assert.ok(
      skip.includes(ROUTE_PATH),
      `${ROUTE_PATH} is now inside the gate via ${covered.join(', ')} and is NOT in GATE_SKIP. ` +
      `A member refused for having no date of birth can no longer reach the route that supplies one. ` +
      `Add it to GATE_SKIP in the same change that widened the prefix.`
    );
  }
});

// The extraction above must be able to FAIL, or the test above proves nothing.
// Both arms: a list that covers the path is detected, a list that does not is not.
test('the coverage check discriminates', () => {
  const covers = (prefixes) => prefixes.some((p) => ROUTE_PATH === p || ROUTE_PATH.startsWith(p + '/'));
  assert.equal(covers(['/api/client', '/api/messages']), false, 'unrelated prefixes must not match');
  assert.equal(covers(['/api/me']), true, 'a parent prefix MUST match, or the guard is hollow');
  assert.equal(covers([ROUTE_PATH]), true, 'an exact path MUST match');
  assert.equal(covers(['/api/mem']), false, 'a partial name must not match — /api/mem is not /api/me');
});

test('the route validates through the shared helper, not a local date parse', () => {
  const src = readFileSync(ROUTE_FILE, 'utf8');
  assert.match(
    src,
    /isMinorFromDob/,
    'the route must decide age with isMinorFromDob so it cannot disagree with the trigger'
  );
  // Date.parse / new Date(string) roll impossible dates forward (Feb 30 -> Mar 2)
  // and do not clamp the 18-year anniversary the way Postgres does.
  assert.doesNotMatch(
    src.replace(/\/\/[^\n]*/g, ''),   // comments discuss these on purpose
    /Date\.parse\s*\(|new Date\s*\(\s*(dob|body)/,
    'the route must not parse the date itself — that is how the two gates start disagreeing'
  );
});
