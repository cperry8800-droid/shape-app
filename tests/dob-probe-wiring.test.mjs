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

// Files that NAME the endpoint without ever calling it. src/lib/warroom.ts
// carries it in a records label, 166,200 characters from its only unrelated
// fetch(). Kept as a declared set rather than a proximity guess — see the note at
// the skip below — and held honest by the dead-entry test underneath.
const MENTION_ONLY = new Set(['src/lib/warroom.ts']);

const FETCH_CALL = /fetch\(\s*[`'"][^`'"]*\/api\/me\/date-of-birth[^`'"]*[`'"]/g;
const BACKSLASH = String.fromCharCode(92);

// ⚠ THIS RULE HAS NOW BEEN WRONG THREE TIMES, IN THREE DIRECTIONS, which is why
// it is a pure function over a string with its own adversarial tests below. A
// checker nobody can feed hostile input to is a checker nobody has checked.
//
//   1. It split on the literal `fetch('<endpoint>'`, so a caller using DOUBLE
//      quotes matched nothing and the rule passed having inspected nothing.
//   2. It then read a fixed 400-character window after the match, which reached
//      PAST this call and borrowed `cache: 'no-store'` from the next, unrelated
//      request — approving a cacheable DOB probe.
//   3. It then matched that text ANYWHERE in the arguments, so a request with
//      `headers: { note: "cache: 'no-store'" }` and no RequestInit.cache at all
//      passed. Text that mentions the option is not the option.
//
// All three have one shape: the rule reporting success about something it had not
// actually looked at. So it now reads the call's OWN arguments (scanning to the
// matching close paren) and only its TOP-LEVEL options, never nested values.

/** Text of this fetch call's arguments, or null if the call is unbalanced. */
function argumentsOf(src, from) {
  let depth = 1;              // we begin just inside `fetch(`
  let quote = null;
  for (let i = from; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === BACKSLASH) { i += 1; continue; }
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

/**
 * The TOP-LEVEL entries of the options object in `args`, as raw "key: value"
 * strings. Nested objects, arrays and calls are stepped over whole, so text
 * inside them can never be mistaken for an option of the request itself.
 */
function topLevelOptions(args) {
  const start = args.indexOf('{');
  if (start < 0) return [];
  const parts = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  for (let i = start; i < args.length; i += 1) {
    const ch = args[i];
    if (quote) {
      buf += ch;
      if (ch === BACKSLASH) { buf += args[i + 1] || ''; i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; buf += ch; continue; }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      if (depth > 1) buf += ch;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      if (depth === 0) { parts.push(buf); break; }
      buf += ch;
      continue;
    }
    if (ch === ',' && depth === 1) { parts.push(buf); buf = ''; continue; }
    buf += ch;
  }
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** True when THIS request sets RequestInit.cache to 'no-store' itself. */
function sendsNoStore(args) {
  return topLevelOptions(args).some((entry) => /^cache\s*:\s*['"`]no-store['"`]$/.test(entry));
}

/** Call sites of the DOB endpoint in `src`, each with its own argument text. */
function dobCallSites(src) {
  return [...src.matchAll(FETCH_CALL)].map((m) => ({
    index: m.index,
    args: argumentsOf(src, m.index + m[0].length),
  }));
}

test('the no-store rule reads only the call it is judging', () => {
  // Hole 2: a cacheable DOB call followed by an unrelated no-store request.
  const borrowed = [
    "fetch('/api/me/date-of-birth', { credentials: 'same-origin' });",
    'logSomething();',
    "fetch('/api/telemetry', { cache: 'no-store' });",
  ].join('\n');
  const [dob] = dobCallSites(borrowed);
  assert.ok(dob, 'the DOB call must be found');
  assert.ok(!sendsNoStore(dob.args),
    'a cacheable DOB call must not be excused by a LATER request that happens to set no-store');

  // Hole 3: the option NAMED inside a nested value, never set on the request.
  const nestedText = 'fetch(\'/api/me/date-of-birth\', { headers: { note: "cache: \'no-store\'" }, credentials: \'same-origin\' })';
  assert.ok(!sendsNoStore(dobCallSites(nestedText)[0].args),
    'text mentioning the option inside headers is not RequestInit.cache');

  // Hole 1: quoting must not change the verdict.
  for (const q of ["'", '"', '`']) {
    const src = `fetch(${q}/api/me/date-of-birth${q}, { credentials: 'same-origin' })`;
    const [site] = dobCallSites(src);
    assert.ok(site, `a ${q}-quoted call must still be found`);
    assert.ok(!sendsNoStore(site.args), `a ${q}-quoted cacheable call must be flagged`);
  }

  // The honest positives: the option really set, including past a nested value
  // and a nested call, which must not truncate this call's own arguments.
  assert.ok(sendsNoStore(dobCallSites(
    "fetch('/api/me/date-of-birth', { credentials: 'same-origin', cache: 'no-store' })")[0].args));
  assert.ok(sendsNoStore(dobCallSites(
    "fetch('/api/me/date-of-birth', { headers: { a: 1 }, cache: 'no-store' })")[0].args));
  assert.ok(sendsNoStore(dobCallSites(
    "fetch('/api/me/date-of-birth', { headers: buildHeaders(token), cache: 'no-store' })")[0].args));
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
      // ⚠ DECLARED, NOT INFERRED — and that distinction is the whole lesson of
      // this file. The previous version guessed, by looking for the endpoint
      // within 160 characters of a `fetch(`. A caller that built the URL first
      // (`const url = ENDPOINT; fetch(url, {...})`) produces no parsed sites AND
      // no proximity hit, so the file was skipped in silence and its cache option
      // never checked — the same blind pass as the three above, one layer out.
      // Naming the exception means any NEW unparsable caller fails loudly.
      if (!MENTION_ONLY.has(f)) uninspectable.push(f);
      continue;
    }
    sites.forEach((site, i) => {
      inspected += 1;
      if (site.args === null) { uninspectable.push(`${f} (call ${i + 1}: unbalanced)`); return; }
      if (!sendsNoStore(site.args)) offenders.push(`${f} (call ${i + 1})`);
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
test('the mention-only list has no dead entries', () => {
  // A stale exemption is how a file quietly stops being checked: it gains a real
  // call, nobody removes it from here, and the rule waves it through forever.
  const dead = [...MENTION_ONLY].filter((f) => {
    let src;
    try { src = stripComments(readFileSync(join(ROOT, f), 'utf8')); } catch { return true; }
    return !src.includes(ENDPOINT) || dobCallSites(src).length > 0;
  });
  assert.deepEqual(dead, [],
    `these no longer need an exemption — they either dropped the endpoint or now `
    + `contain a parsable call: ${dead.join(', ')}`);
});

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
