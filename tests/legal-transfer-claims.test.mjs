import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
// stronger — verified free of false positives across all 182 files.
//
// ⚠ AND NO DIRECTORY LIST (round 21). The hand-written ['public','public/newdesign']
// was the same defect one level up — it omitted the 54 live pages in `public/mobile`.
// A typed list goes blind the moment a page lands outside it, so the walk recursed.
//
// ⚠ BUT A RECURSIVE WALK WITH NO SKIP-LIST IS THE SAME CLASS INVERTED, and this file
// was carrying it: it read the FILESYSTEM, so once a build had run it also scanned
// generated output — `public/m` (the mobile bundle) and `public/newdesign/nd` (the
// precompile), both gitignored. Reproduced rather than assumed: dropping a single
// generated `public/m/index.html` carrying "bound by contract" turned the suite red on
// a file that is not source, does not appear in `git status`, and no one edited.
// The set is now derived from `git ls-files`, the same technique as
// tests/provider-apply-dob.test.mjs and tests/source-no-control-bytes.test.mjs: build
// output cannot appear because it is ignored, nothing has to be remembered when the next
// generated directory lands, and no tracked page can be missed. It REFUSES rather than
// reporting clean if the index cannot be read.
// `listTracked` is a parameter ONLY so the empty-index refusal below is reachable from a
// test. Without it that branch is real, correct and unpinnable — a live repo never returns
// an empty index — and an unpinnable guard is the kind a later reader deletes as dead.
const gitTracked = () =>
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);

function allPages(listTracked = gitTracked) {
  const tracked = listTracked();
  assert.ok(
    tracked.length > 0,
    'git ls-files returned nothing — the sweep cannot enumerate the pages, so it refuses ' +
      'rather than report every ban below as passing.'
  );
  const pages = tracked.filter((f) => f.startsWith('public/') && f.endsWith('.html'));
  // The in-app legal pages live in one JSX module, not discoverable by the HTML sweep.
  pages.push('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  return pages;
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
  assert.ok(SURFACES.length >= 150, `expected the full page set, found ${SURFACES.length}`);
  // ⚠ MEASURED, because the comment this replaced was wrong and so was my first rewrite.
  // Of the 181 tracked pages, 51 sit directly in `public/` and 130 are nested (76
  // newdesign, 54 mobile) — so a depth-1 or public+newdesign-only set is 51 or 127 and
  // the >=150 floor above already catches it. Naming the cohort adds DIAGNOSIS, not
  // detection: the failure then says which 54 pages vanished instead of just a count.
  // (Footgun met while measuring: `git ls-files 'public/*.html'` returns all 181, because
  // git's fnmatch lets `*` cross `/`. Do not use a pathspec to test depth.)
  assert.ok(
    files.some((f) => f.startsWith('public/mobile/')),
    'the sweep found no public/mobile page — the derivation stopped reaching nested ' +
      'directories, so 54 live pages are outside every ban below.'
  );
});

test('an unreadable index REFUSES rather than reporting every ban as passing', () => {
  // If the enumeration silently returned nothing, every per-page ban below would vanish
  // and the suite would go green while scanning no legal surface at all — the loudest
  // possible false pass. It throws instead.
  assert.throws(() => allPages(() => []), /refuses/);
});

test('the sweep enumerates TRACKED pages only — generated build output is excluded', () => {
  // ⚠ THE DEFECT THIS FILE USED TO CARRY, pinned. The previous version read the
  // FILESYSTEM, so once a build had run it also scanned `public/m` and
  // `public/newdesign/nd` — gitignored output that is not source, does not show in
  // `git status`, and that nobody edited. Reproduced at the time by dropping one
  // generated page carrying "bound by contract": the suite went red on it.
  // A probe file is genuinely created here rather than asserted about, because the
  // question is what the DERIVATION does with a real untracked page on disk.
  const probe = 'public/__generated-output-probe.html';
  try {
    writeFileSync(probe, '<html><body>All subprocessors are bound by contract.</body></html>');
    assert.ok(
      !allPages().includes(probe),
      'an untracked page on disk was enumerated — the sweep is reading the filesystem ' +
        'again, so a build turns this suite red on generated output.'
    );
  } finally {
    rmSync(probe, { force: true });
  }
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
