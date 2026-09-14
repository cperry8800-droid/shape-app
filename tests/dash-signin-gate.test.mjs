// The three dashboard shells are for people who have an account.
//
// Owner, 2026-09-14: "I think we should not make the dashboard accessible on
// website until an account is created" and, on where a turned-away visitor
// lands, "redirect to login is fine". So each shell asks /api/me and sends an
// anonymous visitor to Login.html carrying this page as ?next=.
//
// ⚠ THIS FILE RUNS THE GATE, IT DOES NOT READ IT. The whole decision is a pair
// of conditions on one value, and a source scan cannot tell `!d.user` from
// `d && d.user` — the two differ only on the case that matters. So the guard is
// lifted out of each shell's own HTML and EXECUTED in a vm against a scripted
// /api/me, which is the only way to assert what it does rather than how it reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeReturnPath } from '../src/lib/safe-redirect.mjs';

const ND = path.dirname(fileURLToPath(new URL('../public/newdesign/x', import.meta.url)));

// The three shells and, for each, the role it is FOR plus a role it is not.
const SHELLS = [
  { file: 'TrainerApp.html', own: 'trainer', other: 'client', otherDash: 'ClientApp.html' },
  { file: 'NutritionistApp.html', own: 'nutritionist', other: 'trainer', otherDash: 'TrainerApp.html' },
  { file: 'ClientApp.html', own: 'client', other: 'trainer', otherDash: 'TrainerApp.html' },
];

// Derived, never named: the guard is whichever bare <script> block asks /api/me.
// Anchoring on a comment or a line number would stop matching the first time
// somebody rewords it, and a extractor that silently finds nothing makes every
// assertion below vacuously true — hence the throw.
function guardOf(file) {
  const html = readFileSync(path.join(ND, file), 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const hit = blocks.filter((b) => b.includes("fetch('/api/me'"));
  if (hit.length !== 1) throw new Error(`${file}: expected exactly one /api/me guard, found ${hit.length}`);
  return hit[0];
}

// Run the shipped guard against a scripted /api/me and report what it did.
// `res` is either a fake Response, or the string 'reject' for a dead network.
async function run(file, res, at = { pathname: '/newdesign/' + file, search: '', hash: '' }) {
  const replaced = [];
  const location = {
    pathname: at.pathname,
    search: at.search,
    hash: at.hash,
    replace: (url) => replaced.push(url),
  };
  const win = { location };
  const sandbox = {
    window: win,
    location,
    fetch: () => (res === 'reject' ? Promise.reject(new Error('network down')) : Promise.resolve(res)),
    Object,
    encodeURIComponent,
    Promise,
    Error,
  };
  vm.runInNewContext(guardOf(file), sandbox);
  // The guard is two chained .then()s over a resolved promise; drain the
  // microtask queue rather than guessing a timeout.
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
  return replaced;
}

const ok = (body) => ({ ok: true, json: () => Promise.resolve(body) });

test('the corpus is real — these tests cannot pass vacuously', () => {
  for (const { file } of SHELLS) {
    const g = guardOf(file);
    assert.ok(g.includes('Login.html?next='), `${file}: no sign-in gate in the /api/me guard`);
  }
});

// ── the gate itself ─────────────────────────────────────────────────────────
test('a signed-out visitor is sent to the login page carrying this page as ?next=', async () => {
  for (const { file } of SHELLS) {
    const went = await run(file, ok({ user: null }));
    assert.equal(went.length, 1, `${file}: expected exactly one redirect, got ${went.length}`);
    assert.equal(went[0], '/newdesign/Login.html?next=' + encodeURIComponent('/newdesign/' + file),
      `${file}: wrong destination`);
  }
});

test('the hash survives the round trip, so a stub’s forward is not lost', async () => {
  // Every dashboard tab is a redirect stub: TrainerScore.html replaces itself
  // with TrainerApp.html#score. By the time the gate runs, the tab the visitor
  // actually asked for lives ONLY in the hash — so losing it drops them on Today.
  const went = await run('TrainerApp.html', ok({ user: null }),
    { pathname: '/newdesign/TrainerApp.html', search: '?u=abc', hash: '#score' });
  assert.equal(went.length, 1);
  const next = new URLSearchParams(new URL(went[0], 'https://x.example').search).get('next');
  assert.equal(next, '/newdesign/TrainerApp.html?u=abc#score');
});

test('encoding the hash is load-bearing, not tidy', async () => {
  // An unencoded '#' TERMINATES the query string: ?next=/x#score parses as
  // next="/x" with "#score" as the document fragment, and the tab is gone. The
  // only proof is that the encoded form still reads back through URLSearchParams,
  // which is what login.jsx uses.
  const went = await run('ClientApp.html', ok({ user: null }),
    { pathname: '/newdesign/ClientApp.html', search: '', hash: '#habits' });
  assert.ok(went[0].includes('%23habits'), 'the hash reached the URL unencoded: ' + went[0]);
  assert.ok(!/\?next=[^&]*#/.test(went[0]), 'a raw # would end the query string: ' + went[0]);
});

test('what the gate produces is what the login page will accept', async () => {
  // login.jsx validates ?next= itself, restating src/lib/safe-redirect.mjs
  // because a browser-babel module cannot import it. A gate that emitted a value
  // that validator rejects would send every turned-away visitor to the role
  // default instead of the page they asked for — silently. So the real inline
  // expression is lifted from login.jsx and driven, alongside the canonical
  // implementation, over the gate's own output.
  const LOGIN = readFileSync(path.join(ND, 'login.jsx'), 'utf8');
  const cond = /if \(next && (next\.startsWith[\s\S]*?)\) nextDashboard = next;/.exec(LOGIN);
  assert.ok(cond, 'login.jsx no longer validates ?next= in the shape this test lifts');
  const accepts = new Function('next', 'return !!(next && ' + cond[1] + ');');

  for (const { file } of SHELLS) {
    const went = await run(file, ok({ user: null }),
      { pathname: '/newdesign/' + file, search: '?u=1', hash: '#today' });
    const next = new URLSearchParams(new URL(went[0], 'https://x.example').search).get('next');
    assert.ok(accepts(next), `${file}: login.jsx would reject ${next}`);
    assert.equal(safeReturnPath(next, '/fallback'), next, `${file}: safeReturnPath rejects ${next}`);
  }
});

// ── everything it cannot measure renders ────────────────────────────────────
// ⚠ THE DIRECTION OF THIS FAILURE IS THE WHOLE DESIGN. /api/me answers 200 with
// { user: null } for an anonymous visitor, so "signed out" is a reading. A 5xx,
// a proxy's HTML error page, a parse failure and a dead network are NOT that
// reading — and login.jsx does not forward an existing session (it routes only
// after a fresh login), so a false redirect strands a signed-in member on a login
// form with a live cookie and no way back. A false render costs the demo preview.
test('a failed read renders — it never redirects', async () => {
  for (const { file } of SHELLS) {
    for (const [why, res] of [
      ['a 5xx', { ok: false, json: () => Promise.resolve({}) }],
      ['a dead network', 'reject'],
      ['a body with no user key', ok({ ping: 'pong' })],
      ['a 200 that is not JSON', { ok: true, json: () => Promise.reject(new Error('not json')) }],
    ]) {
      const went = await run(file, res);
      assert.deepEqual(went, [], `${file}: redirected on ${why} — it cannot know nobody is signed in`);
    }
  }
});

// ── the role forward still works, and is not swallowed by the gate ──────────
test('a signed-in member on their own dashboard is left alone', async () => {
  for (const { file, own } of SHELLS) {
    const went = await run(file, ok({ user: { role: own } }));
    assert.deepEqual(went, [], `${file}: redirected a ${own} away from their own dashboard`);
  }
});

test('a signed-in member on the wrong dashboard goes to their own, not to login', async () => {
  for (const { file, other, otherDash } of SHELLS) {
    const went = await run(file, ok({ user: { role: other } }), { pathname: '/newdesign/' + file, search: '', hash: '#today' });
    assert.equal(went.length, 1, `${file}: expected one redirect for a ${other}`);
    assert.ok(went[0].startsWith('/newdesign/' + otherDash), `${file}: a ${other} went to ${went[0]}`);
    assert.ok(!went[0].includes('Login.html'), `${file}: a signed-in ${other} was sent to the login page`);
  }
});

// ── the three copies may not drift ──────────────────────────────────────────
test('the gate is byte-identical in all three shells', () => {
  // The role forward below it is legitimately per-shell (each names a different
  // pair of dashboards, and ClientApp translates #settings → #profile when it
  // forwards a coach). The GATE is not: it reads location.pathname and knows
  // nothing about roles, so three copies that differ would be three copies that
  // drifted. The comment is compared along with the code on purpose — a reason
  // fixed in one of three files is the "copied guard with its rationale left
  // behind" this repo has post-mortemed before.
  const slice = (file) => {
    const lines = guardOf(file).split('\n');
    const from = lines.findIndex((l) => /SIGNED OUT IS A READING/.test(l));
    assert.ok(from >= 0, `${file}: the gate's ⚠ marker is gone`);
    const rest = lines.slice(from);
    const to = rest.findIndex((l, i) => i > 0 && l === '      }');
    assert.ok(to > 0, `${file}: could not find the end of the gate block`);
    return rest.slice(0, to + 1).join('\n');
  };
  const [a, ...others] = SHELLS.map((s) => slice(s.file));
  assert.ok(a.length > 400, 'the lifted gate is suspiciously short: ' + a.length + ' chars');
  for (let i = 0; i < others.length; i++) {
    assert.equal(others[i], a, `${SHELLS[i + 1].file}'s gate has drifted from ${SHELLS[0].file}'s`);
  }
});

test('the guard header no longer claims signed-out visitors are unaffected', () => {
  // It said "Signed-out preview and trainers are unaffected (no redirect)" in all
  // three, which the gate makes false — and a stale comment sits exactly where
  // the next reader goes to decide whether the gate should be there at all.
  for (const { file } of SHELLS) {
    const html = readFileSync(path.join(ND, file), 'utf8');
    assert.ok(!/Signed-out preview and \w+ are unaffected/.test(html),
      `${file}: the retired "signed-out is unaffected" claim is still in the guard header`);
  }
});
