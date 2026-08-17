import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────
// Codex rounds 17, 18 and 19 were all the same defect: a legal surface telling
// readers that transfer safeguards are in place, or that subprocessors are
// contractually restricted, while `docs/legal/compliance-spec.md` still carries
// [VERIFY] markers and the Subprocessors table lists recipients whose only basis is
// the provider's own published terms.
//
// Round 17 fixed privacy.html. Round 18 found the same claim on subprocessors.html
// and data-compliance.html; a sweep found four more, three in the mobile app.
//
// ⚠ ROUND 19 THEN FOUND THE SAME DEFECT IN THE FIRST VERSION OF THIS FILE. It carried
// a hand-written list of four surfaces and omitted `public/health-data-privacy.html`,
// whose §05 still said processors operate "under contract" — so the suite passed while
// a public legal page kept the exact claim this guard exists to prohibit. The banned
// wording list was incomplete too ("under contract" was a third phrasing I had not
// enumerated).
//
// THE LESSON, and why this file is now written the way it is: a guard against
// "fixed where reported, live elsewhere" MUST NOT ITSELF BE AN ENUMERATION of where to
// look. So the ban is applied to a DERIVED set — every page that actually makes a
// transfer/subprocessor claim, discovered by reading the directory — and a new or
// renamed page is covered the moment it makes such a claim, with nobody remembering to
// register it. The explicit registry below now governs only the POSITIVE requirement
// (a page must carry the honest qualifier), where naming the surfaces is the point.
//
// ⚠ When the safeguards ARE executed, do not delete this file to make it pass. Flip
// HONEST_POSTURE_REQUIRED with the evidence recorded, so it is a reviewable claim.
const HONEST_POSTURE_REQUIRED = true;

// Claim shapes that are false while any recipient sits on bare provider terms.
const BANNED = [
  {
    re: /bound by (?:a )?contract/i,
    why: 'a blanket "bound by contract" claim covers recipients whose only basis is published terms',
  },
  { re: /contractually (?:bound|restricted)/i, why: 'same blanket contractual claim, different wording' },
  {
    // ⚠ Round 19's miss. Deliberately narrow: it bans asserting that processors operate
    // "under contract" as a general fact, without banning honest qualified prose such as
    // "for some it is a contract we have signed".
    re: /(?:processors?|vendors?|subprocessors?|services?)[^.]{0,80}\bunder contract\b/i,
    why:
      'stating that processors/vendors operate "under contract" as a blanket fact — the ' +
      'basis differs per recipient and several currently rest on published terms',
  },
  {
    re: /fallback even for/i,
    why: 'the unverifiable "SCCs as a fallback even for DPF-certified recipients" assertion',
  },
];

// ⚠ NO SCOPE PREDICATE, deliberately (Codex round 20). Any predicate is narrower than
// the claims being banned, so a page could carry a banned claim without matching the
// predicate and escape the check entirely. Scanning EVERY page is both simpler and
// stronger — verified free of false positives across all 128 files.
function allPages() {
  const out = [];
  for (const dir of ['public', 'public/newdesign']) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.html')) out.push(`${dir}/${name}`);
    }
  }
  // The in-app legal pages live in one JSX module, not discoverable by the HTML sweep.
  out.push('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  return out;
}

const SURFACES = allPages().map((file) => ({ file, src: readFileSync(file, 'utf8') }));

test('the claim sweep actually found the known legal surfaces', () => {
  // Guards the guard: if the discovery ever silently matches nothing (a moved directory,
  // a renamed marker), every ban below would vacuously pass.
  const files = SURFACES.map((s) => s.file);
  for (const required of [
    'public/privacy.html',
    'public/subprocessors.html',
    'public/data-compliance.html',
    'public/health-data-privacy.html',
    'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx',
  ]) {
    assert.ok(
      files.includes(required),
      `${required} was not picked up by the page sweep — discovery is broken, so every ` +
        'ban in this file is passing vacuously.'
    );
  }
  assert.ok(SURFACES.length >= 50, `expected the full page set, found ${SURFACES.length}`);
});

for (const { file, src } of SURFACES) {
  test(`${file} makes no unqualified safeguard or contract guarantee`, () => {
    for (const claim of BANNED) {
      const m = src.match(claim.re);
      assert.equal(
        m,
        null,
        `${file} carries a claim this repo cannot back — ${claim.why}. Matched: ` +
          `"${(m && m[0]) || ''}". State the per-recipient basis instead and let the ` +
          'Subprocessors table (with its per-row markers) be the authority.'
      );
    }
  });
}

// The positive requirement. Naming these IS the point: each is a page a reader may land
// on alone, so each must admit the posture itself rather than defer to another page.
const MUST_ADMIT = [
  'public/privacy.html',
  'public/subprocessors.html',
  'public/data-compliance.html',
  'public/health-data-privacy.html',
  'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx',
];

if (HONEST_POSTURE_REQUIRED) {
  for (const file of MUST_ADMIT) {
    test(`${file} states the honest per-recipient posture`, () => {
      const src = readFileSync(file, 'utf8');
      assert.match(
        src,
        /published terms/i,
        `${file} speaks about subprocessors or transfers but never admits that some ` +
          "recipients currently rest on the provider's own published terms. A reader must " +
          'not have to infer that from another page.'
      );
    });
  }

  // ⚠ Round 19's second finding: pointing readers at the table is only honest if the
  // TABLE ITSELF distinguishes what is held from what is merely intended.
  test('the subprocessors table marks unverified safeguards as intended, not held', () => {
    const src = readFileSync('public/subprocessors.html', 'utf8');
    const spec = readFileSync('docs/legal/compliance-spec.md', 'utf8');
    const verifyCount = (spec.match(/\[VERIFY/g) || []).length;
    if (verifyCount === 0) return; // everything verified — nothing to mark

    const marks = (src.match(/class="pend"/g) || []).length;
    assert.ok(
      marks > 0,
      `compliance-spec.md carries ${verifyCount} [VERIFY] marker(s), but the Subprocessors ` +
        'table marks no row as "intended — not yet confirmed". A row naming SCCs or the DPF ' +
        'while the spec still flags it reads to a EEA/UK reader as a safeguard already held.'
    );

    // ⚠ PER ROW, not a count (Codex round 20): an aggregate threshold does not enforce
    // the property on any particular row, so one unmarked vendor could hide behind seven
    // marked ones. Every row naming a framework or clauses must carry the mark itself.
    const VERIFIED_HELD = []; // add a vendor here ONLY with evidence the basis is executed
    // Row-scoped, so the pend <span> INSIDE a cell cannot break the match. (My first
    // attempt used [^<]* for the cell, which cannot cross the span — marked rows silently
    // stopped matching and the `checked > 0` assertion below is what caught it.)
    let checked = 0;
    for (const [, row] of src.matchAll(/<tr>(.*?)<\/tr>/gs)) {
      if (!/Data Privacy Framework|Standard Contractual Clauses/.test(row)) continue;
      const vendor = (row.match(/<td>([^<]*)<\/td>/) || [, '(unknown)'])[1].trim();
      if (VERIFIED_HELD.includes(vendor)) continue;
      checked += 1;
      assert.match(
        row,
        /class="pend"/,
        `the Subprocessors row for "${vendor}" names a framework or clauses but is not marked ` +
          '"intended — not yet confirmed", so it reads to an EEA/UK reader as a safeguard ' +
          'already held.'
      );
    }
    assert.ok(checked > 0, 'no framework/clause rows were examined — this check is vacuous');
  });
}

test('the compliance spec still carries [VERIFY] markers, so the honest posture is required', () => {
  const spec = readFileSync('docs/legal/compliance-spec.md', 'utf8');
  const markers = (spec.match(/\[VERIFY/g) || []).length;
  if (markers > 0) {
    assert.equal(
      HONEST_POSTURE_REQUIRED,
      true,
      `compliance-spec.md still has ${markers} [VERIFY] marker(s), so HONEST_POSTURE_REQUIRED ` +
        'must stay true. Turning it off while safeguards are unverified re-opens the exact ' +
        'over-claim Codex rounds 17, 18 and 19 all reported.'
    );
  }
});
