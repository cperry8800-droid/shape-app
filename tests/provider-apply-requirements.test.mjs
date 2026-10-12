import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';

// ⚠ WHY THIS GUARD EXISTS — the pattern it was written to end, not the instance.
//
// TWICE now a server-side requirement was added to /api/apply without updating the
// surfaces that POST to it, and both times every gate in the repo stayed green:
//
//   • round 15 — the route began refusing an application it cannot age-place, and
//     FOUR of the five surfaces never forwarded a date of birth.
//   • round 16 — the route refuses a nutritionist application without the NC1
//     compliance attestations, and THREE surfaces never forwarded them.
//
// The failure modes are opposite, which is why only one of each pair gets reported:
// the mobile app used to fail OPEN and silently (a 4xx fell back to a direct insert
// that skipped the route's own re-check), while the legacy pages fail CLOSED and
// loudly (the applicant simply cannot apply). Only the silent one looks like a
// security finding; the loud ones are the wider outage.
//
// Patching the reported surface cannot converge, because the defect is not any one
// missing field — it is that NOTHING TIES THE ROUTE'S REQUIREMENTS TO ITS PRODUCERS.
// So this guard asserts the matrix: every 400-gate in the route is registered here,
// and every registered gate is satisfiable from every surface that can reach it.
// Adding a new gate to the route now fails the build until the producers are updated.
//
// These are source-text guards (the forms are classic scripts and inline handlers
// with no seam to import), so they strip comments before asserting — the rationale
// comments around this code quote the very tokens being matched.

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const src = (rel) => stripComments(read(rel));

const ROUTE = 'src/app/api/apply/route.ts';

// Every surface that POSTs an application, and which provider types it can submit.
// A surface that cannot submit a type is not held to that type's requirements.
// (The legacy root pages and the /mobile preview's sign-up pages were retired on 2026-10-12 and
// redirect to the website's application: tests/legacy-signup-retired.test.mjs.)
const SURFACES = [
  {
    file: 'public/newdesign/signup.jsx',
    label: 'the canonical website coach application',
    types: ['trainer', 'nutritionist'],
  },
  {
    file: 'mobile-app/src/services/shapeBackend.js',
    label: 'the mobile app + /m/ web build',
    types: ['trainer', 'nutritionist'],
    // The apply FORM lives in a separate module from the request builder, so the
    // collection half is asserted there.
    companions: ['mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx'],
  },
];

// One entry per `status: 400` the route can return.
//
//   route      — proves the gate still exists (a renamed/removed gate must not
//                silently retire its producer requirement)
//   producer   — null when no producer can satisfy it (a malformed request is not
//                a field a form can supply); otherwise per-surface evidence that
//                the value reaches the REQUEST, keyed by file
//   appliesTo  — which provider types the gate fires for
const REQUIREMENTS = [
  {
    key: 'malformed',
    route: /Invalid application request/,
    appliesTo: ['trainer', 'nutritionist'],
    producer: null,
    why: 'a body the route cannot parse is not a field any form can forward',
  },
  {
    key: 'providerType',
    route: /providerType must be/,
    appliesTo: ['trainer', 'nutritionist'],
    producer: {
      'public/newdesign/signup.jsx': /append\(\s*["']providerType["']/,
      'mobile-app/src/services/shapeBackend.js': /providerType:\s*payload\.provider_type/,
    },
  },
  {
    key: 'identity',
    route: /First name, last name, and email are required/,
    appliesTo: ['trainer', 'nutritionist'],
    producer: {
      'public/newdesign/signup.jsx': /append\(\s*["']firstName["']/,
      'mobile-app/src/services/shapeBackend.js': /firstName:\s*payload\.first_name/,
    },
  },
  {
    key: 'email',
    route: /Please enter a valid email/,
    appliesTo: ['trainer', 'nutritionist'],
    producer: {
      'public/newdesign/signup.jsx': /append\(\s*["']email["']/,
      'mobile-app/src/services/shapeBackend.js': /email:\s*payload\.email/,
    },
  },
  {
    key: 'dobUnplaceable',
    route: /Enter a valid date of birth/,
    appliesTo: ['trainer', 'nutritionist'],
    producer: {
      // providerApplicationApiBody() is what becomes the request body;
      // applicationToPayload() carrying `dob` proves nothing on its own.
      'mobile-app/src/services/shapeBackend.js': /dob:\s*payload\.dob/,
      'public/newdesign/signup.jsx': /append\(\s*["']dob["']/,
    },
  },
  {
    key: 'dobMinor',
    route: /You must be 18 or older/,
    appliesTo: ['trainer', 'nutritionist'],
    // Same field as dobUnplaceable — one value satisfies both gates.
    producer: 'dobUnplaceable',
  },
  {
    // 2026-10-12: a years answer, and below the 5-year standard where they have worked and what
    // kind of experience it is (experienceProblem in src/lib/provider-experience.mjs). Never a
    // refusal of the years themselves.
    key: 'experience',
    route: /const experienceIssue = experienceProblem\(yearsExperience, details\);/,
    appliesTo: ['trainer', 'nutritionist'],
    producer: {
      'public/newdesign/signup.jsx': /append\(\s*["']yearsExperience["'][\s\S]*experience_history:[\s\S]*experience_type:/,
      'mobile-app/src/services/shapeBackend.js': /yearsExperience:\s*payload\.years_experience[\s\S]*experience_history:[\s\S]*experience_type:|experience_history:[\s\S]*experience_type:[\s\S]*yearsExperience:\s*payload\.years_experience/,
    },
  },
  {
    key: 'backgroundCheckConsent',
    route: /Background check consent is required/,
    appliesTo: ['trainer', 'nutritionist'],
    producer: {
      'public/newdesign/signup.jsx': /background_check_consent/,
      'mobile-app/src/services/shapeBackend.js': /background_check_consent/,
    },
  },
  {
    key: 'files',
    // L4 of the 2026-10-08 review: a seventh file, or one of a type we do not accept (an empty
    // declared type is read off the extension), is refused BEFORE the row is written.
    route: /const fileProblem = checkApplicationFiles\(files\);/,
    appliesTo: ['trainer', 'nutritionist'],
    producer: null,
    why: 'a form that sends no file, or accepted ones, is not held to it; a file of the wrong type is not a field any form can supply',
  },
  {
    // 2026-10-12: Turnstile on the application (a no-op until TURNSTILE_SECRET_KEY is set). A
    // signed-in app caller is vouched for by its account instead; every surface a signed-out
    // applicant can reach must send a token, or once the secret is set it cannot apply at all.
    key: 'captcha',
    route: /Captcha check failed/,
    appliesTo: ['trainer', 'nutritionist'],
    producer: {
      'public/newdesign/signup.jsx': /append\(\s*["']turnstileToken["']/,
      'mobile-app/src/services/shapeBackend.js': /append\(\s*['"]turnstileToken['"]/,
    },
  },
  {
    key: 'nutritionAttestations',
    route: /All nutrition compliance attestations are required/,
    appliesTo: ['nutritionist'],
    producer: {
      'public/newdesign/signup.jsx': /compliance_attestations/,
      'mobile-app/src/services/shapeBackend.js': /compliance_attestations/,
    },
  },
];

test('every 400 gate in /api/apply is registered in this matrix', () => {
  const route = src(ROUTE);
  const gates = [...route.matchAll(/status:\s*400/g)].length;
  assert.equal(
    gates,
    REQUIREMENTS.length,
    `${ROUTE} returns 400 from ${gates} places but ${REQUIREMENTS.length} are registered here. ` +
      'A new server-side requirement must be registered AND satisfied by every apply surface — ' +
      'enforcing it at the route alone breaks the door (rounds 15 and 16 were both this).'
  );
});

test('every registered gate still exists in the route', () => {
  const route = src(ROUTE);
  for (const req of REQUIREMENTS) {
    assert.match(
      route,
      req.route,
      `the "${req.key}" gate is registered here but no longer appears in ${ROUTE} — if it was ` +
        'removed, drop it from this matrix deliberately; do not let a stale entry mask a real gate.'
    );
  }
});

test('every apply surface can satisfy every requirement it can reach', () => {
  const sources = new Map();
  for (const s of SURFACES) {
    const files = [s.file, ...(s.companions || [])];
    sources.set(s.file, files.map((f) => src(f)).join('\n'));
  }

  for (const req of REQUIREMENTS) {
    if (req.producer === null) continue;
    // A shared-field gate reuses another requirement's evidence.
    const evidence =
      typeof req.producer === 'string'
        ? REQUIREMENTS.find((r) => r.key === req.producer).producer
        : req.producer;

    for (const s of SURFACES) {
      const reachable = s.types.some((type) => req.appliesTo.includes(type));
      if (!reachable) continue;
      const pattern = evidence[s.file];
      assert.ok(
        pattern,
        `no evidence registered for "${req.key}" on ${s.file} (${s.label}), which CAN submit ` +
          `${s.types.filter((t) => req.appliesTo.includes(t)).join('/')} — an unregistered pair is ` +
          'exactly how four surfaces drifted. Register it or narrow the surface types.'
      );
      assert.match(
        sources.get(s.file),
        pattern,
        `${s.file} (${s.label}) posts an application without satisfying the route's "${req.key}" ` +
          'requirement, so the route answers 400 — this surface either bypasses the route silently ' +
          'or cannot apply at all.'
      );
    }
  }
});

// The attestation KEYS are the contract between the route and every surface. The website's
// form is a classic script that cannot import the canonical module, so it mirrors the list,
// and a mirror is what drifts. Assert the mirror matches.
test('mirrored attestation keys match the canonical list', () => {
  const canonical = src('src/lib/compliance/nutrition.mjs');
  const list = canonical.match(/REQUIRED_ATTESTATIONS\s*=\s*\[([^\]]+)\]/);
  assert.ok(list, 'REQUIRED_ATTESTATIONS has moved in src/lib/compliance/nutrition.mjs');
  const keys = [...list[1].matchAll(/['"]([a-z_]+)['"]/g)].map((m) => m[1]);
  assert.ok(keys.length >= 4, `expected the canonical attestation keys, read ${keys.length}`);

  for (const rel of ['public/newdesign/signup.jsx']) {
    const body = src(rel);
    for (const key of keys) {
      assert.ok(
        body.includes(key),
        `${rel} mirrors the nutrition attestations but is missing "${key}" — the route refuses an ` +
          'application that omits it, so this surface would collect a partial set and still be 400ed.'
      );
    }
  }

  // The mobile app imports the canonical list rather than mirroring it, so assert
  // the import instead of the keys — that is the stronger property.
  assert.match(
    src('mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx'),
    /REQUIRED_ATTESTATIONS[\s\S]{0,120}compliance\/nutrition\.mjs/,
    'the mobile apply form should IMPORT REQUIRED_ATTESTATIONS from the canonical module, not re-type it'
  );
});
