import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────
// Codex rounds 17 and 18 were THE SAME DEFECT at three different surfaces: a legal
// page telling EEA/UK readers that transfer safeguards are in place, or that every
// subprocessor is contractually restricted, while `docs/legal/compliance-spec.md`
// still carries [VERIFY] markers and the Subprocessors table lists recipients whose
// only basis is the provider's own published terms.
//
// Round 17 fixed privacy.html. Round 18 found the identical sentence still published
// on subprocessors.html — the page privacy.html POINTS AT as authoritative — plus a
// blanket contract claim on data-compliance.html. A sweep then found four MORE
// surfaces neither round named, three of them in the mobile app.
//
// So this guard is deliberately not a check on three sentences. It is the RULE:
// every surface that speaks to transfers or subprocessors must carry the honest
// qualifier, and none of them may carry an unqualified guarantee. A new legal
// surface must be registered here, which is the point — the failure mode being
// closed is "fixed where it was reported, still live everywhere else".
//
// ⚠ When the safeguards ARE actually executed, do not delete this file to make it
// pass. Flip HONEST_POSTURE_REQUIRED to false with the evidence recorded, so the
// change is a deliberate, reviewable claim rather than a quietly dropped guard.
const HONEST_POSTURE_REQUIRED = true;

// Every surface that makes a transfer or subprocessor claim to a reader.
const SURFACES = [
  { file: 'public/privacy.html', what: 'the Privacy Policy' },
  { file: 'public/subprocessors.html', what: 'the canonical Subprocessors page' },
  { file: 'public/data-compliance.html', what: 'the Data & compliance page' },
  {
    file: 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx',
    what: 'the in-app privacy / data-compliance / subprocessors pages',
  },
];

// Claim shapes that are false while any recipient sits on bare provider terms.
// Matched case-insensitively against the raw source.
const BANNED = [
  {
    re: /bound by (?:a )?contract/i,
    why:
      'a blanket "bound by contract" claim covers recipients whose only basis is the ' +
      "provider's own published terms (the public video-calling service among them)",
  },
  {
    re: /contractually bound/i,
    why: 'same blanket contractual claim, different wording',
  },
  {
    re: /fallback even for/i,
    why:
      'the unverifiable "we maintain SCCs as a fallback even for DPF-certified recipients" ' +
      'assertion — deleted in round 17, still published elsewhere in round 18',
  },
];

for (const surface of SURFACES) {
  test(`${surface.file} makes no unqualified safeguard guarantee`, () => {
    const src = readFileSync(surface.file, 'utf8');
    for (const claim of BANNED) {
      assert.doesNotMatch(
        src,
        claim.re,
        `${surface.file} (${surface.what}) carries a claim this repo cannot back: ${claim.why}. ` +
          'State the per-recipient basis instead, and let the Subprocessors table be the authority.'
      );
    }
  });

  if (HONEST_POSTURE_REQUIRED) {
    test(`${surface.file} states the honest per-recipient posture`, () => {
      const src = readFileSync(surface.file, 'utf8');
      assert.match(
        src,
        /published terms/i,
        `${surface.file} (${surface.what}) speaks about subprocessors or transfers but never ` +
          'admits that some recipients currently rest on the provider\'s own published terms. ' +
          'A reader must not have to infer that from another page.'
      );
    });
  }
}

// The spec is the evidence base. While it still carries [VERIFY] markers, the honest
// posture is mandatory — this ties the guard to the underlying facts rather than to a
// hand-maintained boolean that could drift away from them.
test('the compliance spec still carries [VERIFY] markers, so the honest posture is required', () => {
  const spec = readFileSync('docs/legal/compliance-spec.md', 'utf8');
  const markers = (spec.match(/\[VERIFY\]/g) || []).length;
  if (markers > 0) {
    assert.equal(
      HONEST_POSTURE_REQUIRED,
      true,
      `compliance-spec.md still has ${markers} [VERIFY] marker(s), so HONEST_POSTURE_REQUIRED ` +
        'must stay true. Turning it off while safeguards are unverified re-opens exactly the ' +
        'over-claim Codex rounds 17 and 18 both reported.'
    );
  }
});
