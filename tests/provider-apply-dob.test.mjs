import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';

// ⚠ WHY THIS GUARD EXISTS — the regression it was written to end.
//
// /api/apply now REFUSES an application it cannot age-place: `isMinorFromDob('')`
// returns null and the route answers 400. That check is load-bearing (an approved
// coach is provisioned an auth user AND a coach profile, and coach roles satisfy
// membership automatically, so a provider row with no DOB is an entitled account
// the read-time gates then refuse at every surface).
//
// But enforcing at the route without updating every PRODUCER breaks the door.
// Four of the five surfaces that POST to /api/apply did not forward a date of
// birth, and the two failure modes are opposite — which is why only one of them
// was noticed:
//
//   • The mobile app fails OPEN and SILENTLY. shapeBackend's submitProviderApplication
//     catches a failed route call and falls back to a direct Supabase insert, so a
//     400 means the route — its server-side 18+ re-check, its reviewer email, its
//     file uploads — is bypassed with nothing on screen to say so.
//   • The legacy pages fail CLOSED and LOUDLY: the applicant is shown the route's
//     own error and cannot apply at all.
//
// Both are regressions of this wave. The rule is therefore not "shapeBackend must
// send dob" — it is "EVERY surface that posts an application forwards a date of
// birth the route can validate", and a NEW surface must not be able to join the
// list silently. That is what the second test enforces.
//
// These are source-text guards (the forms are classic scripts and inline handlers
// with no seam to import), so they strip comments before asserting — the rationale
// comments around this code quote the very tokens being matched.

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

// ONE stripper, shared with tests/provider-apply-requirements.test.mjs. It shipped a
// real defect (a lazy `/* … */` span that ate the function under test) that only
// mutation-testing caught, so a second copy is a second chance to reintroduce it.
// The rationale for its line-oriented shape lives in the helper.

// The surfaces that post a provider application, and the expression that proves
// each one puts a date of birth in the REQUEST — not merely in a local object.
const APPLY_CALLERS = [
  {
    file: 'mobile-app/src/services/shapeBackend.js',
    label: 'the mobile app + /m/ web build',
    // providerApplicationApiBody() is what actually becomes the request body;
    // applicationToPayload() carrying `dob` proves nothing on its own.
    forwards: /dob:\s*payload\.dob/,
  },
  {
    file: 'public/newdesign/signup.jsx',
    label: 'the canonical website coach application',
    forwards: /append\(\s*["']dob["']/,
  },
  {
    file: 'public/mobile/signup.jsx',
    label: 'the legacy /mobile Signup{Trainer,Nutritionist,Client} pages',
    forwards: /append\(\s*["']dob["']/,
  },
  {
    file: 'public/signup-trainer.html',
    label: 'the legacy trainer application page',
    forwards: /append\(\s*["']dob["']/,
  },
  {
    file: 'public/signup-nutritionist.html',
    label: 'the legacy nutritionist application page',
    forwards: /append\(\s*["']dob["']/,
  },
];

test('every surface that posts to /api/apply forwards a date of birth', () => {
  for (const caller of APPLY_CALLERS) {
    const src = stripComments(read(caller.file));
    assert.match(
      src,
      caller.forwards,
      `${caller.file} (${caller.label}) posts an application without forwarding a date of birth — ` +
        'the route refuses it 400, and this surface either bypasses the route silently or cannot apply at all'
    );
  }
});

// FAIL CLOSED ON A NEW SURFACE. A future page that posts an application must
// either forward a DOB (and be registered above) or fail this build — it must not
// be able to reach the route unlisted, which is exactly how four surfaces drifted.
// Files that name the route without being an application surface. Deliberately an
// explicit list with a reason rather than a clever heuristic: a new file lands in
// the failure above until someone classifies it, which is the point.
const NOT_APPLY_SURFACES = new Map([
  ['src/lib/warroom.ts', 'the route registry / status prober — it lists and pings every route, it does not submit an application'],
]);

test('no unregistered surface posts to /api/apply', () => {
  const known = new Set([...APPLY_CALLERS.map((c) => c.file), ...NOT_APPLY_SURFACES.keys()]);
  // ⚠ `nd` IS BUILD OUTPUT, like `dist` and `m` beside it, and leaving it out of
  // this list made the guard fail on a copy of a file it had already checked.
  // scripts/build-newdesign.mjs precompiles the newdesign JSX into
  // public/newdesign/nd/; the directory is gitignored and regenerated at deploy,
  // so anything in it is a duplicate of a source this walk already visited. Run
  // that script once locally and this test went red on public/newdesign/nd/
  // signup.js — a registered surface reported as an unregistered one.
  const skipDirs = new Set(['node_modules', '.git', '.next', 'dist', 'm', 'nd', 'ios', 'android']);
  const exts = /\.(m?js|jsx|ts|tsx|html)$/;
  const found = [];

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (skipDirs.has(entry)) continue;
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (!exts.test(entry)) continue;
      const rel = relative(ROOT, abs).split('\\').join('/');
      const src = stripComments(readFileSync(abs, 'utf8'));
      // A POST to the apply route: the path plus a fetch in the same file.
      if (/["'`][^"'`]*\/api\/apply["'`]/.test(src) && /fetch\s*\(/.test(src)) {
        found.push(rel);
      }
    }
  }

  for (const top of ['public', 'src', 'mobile-app/src']) {
    walk(join(ROOT, top));
  }

  const unregistered = found.filter((f) => !known.has(f));
  assert.deepEqual(
    unregistered,
    [],
    `these files POST to /api/apply but are not registered in APPLY_CALLERS, so nothing checks ` +
      `that they forward a date of birth: ${unregistered.join(', ')}`
  );
});

// ⚠ FORWARDING THE DATE FIXES THE TRIGGER, NOT THE MECHANISM. submitProviderApplication
// catches ANY failed route call and falls back to a direct Supabase insert. That is
// right for a transport failure (offline, DNS, 5xx) — the application should survive.
// It is wrong for a REJECTION: a 4xx means the route deliberately refused this
// application (under 18, too few years of experience, no background-check consent),
// and rewriting that refusal into a direct insert stores the row anyway, skips the
// reviewer email, and tells the applicant they succeeded. A genuinely under-18 mobile
// applicant would still take that path even with the date forwarded, which is why the
// discriminator — not the missing field — is the actual fix.
test('a route rejection is not silently rewritten into a direct insert', () => {
  const src = stripComments(read('mobile-app/src/services/shapeBackend.js'));
  const start = src.indexOf('function providerApplicationApiBody');
  assert.notEqual(start, -1, 'providerApplicationApiBody has moved — re-anchor this test');
  const end = src.indexOf('.from(\'provider_applications\')', start);
  assert.notEqual(end, -1, 'the direct-insert fallback has moved — re-anchor this test');
  const region = src.slice(start, end);

  assert.match(
    region,
    /status\s*>=\s*400[\s\S]{0,80}status\s*<\s*500/,
    'no 4xx discriminator: a deliberate refusal is indistinguishable from a transport failure'
  );
  assert.match(
    region,
    /rejected/,
    'the refusal is not marked, so the caller cannot tell it apart from a network error'
  );
  // ⚠ ANCHOR ON THE REAL CATCH BLOCK. A looser `catch[\s\S]*rejected[\s\S]*throw`
  // matched `response.json().catch(() => ({}))` followed by the THROW inside the
  // submitter — so deleting the rethrow left this assertion green. Caught by
  // mutation-testing this test, which is the only reason it is written this way.
  const catchAt = region.indexOf('catch (apiError');
  assert.notEqual(catchAt, -1, 'the fallback catch has moved — re-anchor this test');
  assert.match(
    region.slice(catchAt),
    /rejected[\s\S]{0,80}throw/,
    'a rejected application still falls through to the direct insert instead of surfacing the refusal'
  );
});

// The two legacy pages had no date-of-birth input at all, so "forward the value"
// is only half the fix — there was no value to forward. They must also collect it
// and refuse before submitting, and refuse when the shared derivation is absent:
// a page that cannot verify an age must not admit one.
for (const file of ['public/signup-trainer.html', 'public/signup-nutritionist.html']) {
  test(`${file} collects a date of birth and fails closed without the shared derivation`, () => {
    const raw = read(file);
    const src = stripComments(raw);
    assert.match(src, /name=["']dob["']/, `${file} has no date-of-birth input to forward`);
    assert.match(
      src,
      /<script[^>]+src=["']\/age-derive\.js["']/,
      `${file} does not load the shared 18+ derivation, so its check would be a hand-written copy`
    );
    assert.match(
      src,
      /window\.ShapeAgeDerive/,
      `${file} does not consult the shared derivation`
    );
    assert.match(
      src,
      /!ageApi\b/,
      `${file} does not fail closed when the shared derivation is missing`
    );
  });
}
