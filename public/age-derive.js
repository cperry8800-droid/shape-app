/* Shape 18+ age derivation — CLASSIC-SCRIPT MIRROR of src/lib/age-derive.mjs.
 *
 * ⚠ THIS FILE IS A MIRROR. The canonical implementation is src/lib/age-derive.mjs.
 * Do not edit one without the other: tests/age-derive-mirror.test.mjs runs BOTH
 * over a shared vector table plus a deterministic fuzz sweep and fails on the
 * first disagreement, so a one-sided edit breaks the build rather than shipping
 * two surfaces that answer differently about the same person.
 *
 * WHY A MIRROR RATHER THAN AN IMPORT: the write surfaces that need this rule are
 * classic scripts — public/supabase.js is a browser IIFE loaded by <script>, and
 * signup-client.html's copy is inline. Neither can import an ES module, and the
 * canonical file must stay import-free because it is pulled into the Edge proxy's
 * bundle. Same constraint, and the same remedy, as public/newdesign/localScrub.mjs
 * and its two classic-script twins.
 *
 * WHY THIS EXISTS AT ALL — the defect it was written to end. Every account-creating
 * surface carried its OWN hand-written 18+ check of the shape
 *   born > (new Date()).setFullYear(getFullYear() - 18)
 * which compares INSTANTS. `new Date('2008-08-17')` is midnight UTC, so at
 * 2026-08-17T00:30:00Z that expression reads ADULT while it is still Aug 16 in
 * Los Angeles — admitting a minor on their local birthday eve. That is the exact
 * counterexample the read-time gate was rewritten to close (it reads the calendar
 * day at UTC−12, the "anywhere on Earth" convention). The write surfaces kept the
 * old expression, so the gate refused at read time what signup had already let in
 * — including relaying the member's health questionnaire.
 *
 * Registers window.ShapeAgeDerive. Callers MUST fail closed when it is absent:
 * a page that cannot load this file cannot verify an age, and "cannot verify"
 * must refuse, never admit.
 */
(function (global) {
  'use strict';

  var ADULT_AGE_YEARS = 18;
  // 12 hours — the westernmost UTC offset in the tz database (Etc/GMT+12).
  // Reading the day there is what makes adulthood true in EVERY timezone before
  // it is asserted. See the canonical module's header for the full rationale.
  var ADULT_REFERENCE_OFFSET_MS = 12 * 60 * 60 * 1000;

  /**
   * TRUE when `dob` proves the account is under 18 as of `now`, FALSE when it
   * proves 18 or over, NULL when there is no usable date — null means "this says
   * nothing", never "adult". Byte-for-byte the canonical module's logic.
   */
  function isMinorFromDob(dob, now) {
    if (now === undefined) now = Date.now();
    if (typeof dob !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    // Reject calendar-impossible dates rather than letting Date.UTC roll them
    // forward — Feb 30 silently becomes Mar 2.
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var born = Date.UTC(y, mo - 1, d);
    if (!isFinite(born)) return null;
    var probe = new Date(born);
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
    var raw = (typeof now === 'number') ? now : now.getTime();
    var ref = new Date(raw - ADULT_REFERENCE_OFFSET_MS);
    // ⚠ VALIDATE THE RESULTING DATE, NOT THE INPUT NUMBER. A finite input can
    // still be outside the Date range, and every field read below then yields
    // NaN — which falls through the comparison as `born > NaN` = false, i.e. it
    // declares an ADULT from a clock we could not read.
    if (!isFinite(ref.getTime())) return null;
    var cy = ref.getUTCFullYear() - ADULT_AGE_YEARS;
    var cm = ref.getUTCMonth();
    var cutoff = Date.UTC(cy, cm, ref.getUTCDate());
    // ⚠ CLAMP, DO NOT ROLL. Postgres clamps an impossible anniversary
    // (2028-02-29 minus 18y → 2010-02-28) while Date.UTC rolls it to Mar 1.
    // Day 0 of the next month is the last day of the intended one.
    if (new Date(cutoff).getUTCMonth() !== cm) cutoff = Date.UTC(cy, cm + 1, 0);
    return born > cutoff;
  }

  global.ShapeAgeDerive = {
    ADULT_AGE_YEARS: ADULT_AGE_YEARS,
    ADULT_REFERENCE_OFFSET_MS: ADULT_REFERENCE_OFFSET_MS,
    isMinorFromDob: isMinorFromDob
  };
})(typeof window !== 'undefined' ? window : this);
